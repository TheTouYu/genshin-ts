#!/usr/bin/env python3
"""selftest.py — 世界状态服务三动词契约自测（离线帧，0 注入，0 抬窗）。

覆盖（每条都由真实调用/真实数据判定，不用嘴）：
  schema   必填字段、evidence 必带、bbox 归一化（xywh）、状态名词表单一源
  look     state/objects/frame_id/预算门禁/缓存命中 ≤5ms
  act      dry-run 回执、未命中 fail-closed、free_text 无坐标、多义拒绝、
           语义期待 expect（dry-run 必填 / DSL 校验 / 5 类判据 / 正负例 / 证据三件套 / rc=9）、
           未授权与意图需焦点、点击点必须在帧内
  wait     reached / timeout / violated / text_absent 降级 / frame_changed（帧序列）/ 非法判据
  cache    内容寻址 key、仪器指纹参与 key
  CLI      退出码 0/2/3/6/7/8 抽样

用法：python3 .scratch/gui-service/selftest.py [--json-out P]
退出码：0 全绿 / 1 有失败。
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

import cache as cache_mod  # noqa: E402
import instruments  # noqa: E402
import schema  # noqa: E402

# YS_WORLDSVC_PATH：注入用例（ledger-inject.sh worldsvc-selftest-neg）把**同目录副本**指进来，
# 证明「整帧 OCR 兜底」这条判据真的在判，而生产 worldsvc.py 一个字节都不动。
_ws_path = os.environ.get("YS_WORLDSVC_PATH")
if _ws_path:
    import importlib.util as _ilu

    _spec = _ilu.spec_from_file_location("worldsvc", _ws_path)
    worldsvc = _ilu.module_from_spec(_spec)
    sys.modules["worldsvc"] = worldsvc
    _spec.loader.exec_module(worldsvc)
else:
    import worldsvc  # noqa: E402

FRAME = os.path.join(REPO, ".scratch", "gui-corpus", "f06.png")
ALT_FRAME = os.path.join(REPO, ".scratch", "gui-corpus", "f05.png")
WORLDSVC = os.path.join(HERE, "worldsvc.py")
EVIDENCE = os.path.join(HERE, "evidence")

RESULTS = []


_LAST_T = [None]          # 上一个用例结束时刻，用来算"这一条花了多久"


def check(name, cond, detail=""):
    # 2026-10-22：给每条断言计时——不装表就只能看总时长，优化只能靠猜。
    # 读法：top 里那些"单条 >1s"的才是可攻点；几十条 0.1s 的加起来不构成大头。
    now = time.perf_counter()
    dt = 0.0 if _LAST_T[0] is None else (now - _LAST_T[0]) * 1000
    _LAST_T[0] = now
    RESULTS.append({"name": name, "ok": bool(cond), "detail": detail, "ms": round(dt, 1)})
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))
    return bool(cond)


def expect_raises(name, fn, exc_type=schema.SchemaError):
    try:
        fn()
    except exc_type as exc:
        return check(name, True, str(exc)[:200])
    except Exception as exc:  # noqa: BLE001
        return check(name, False, f"抛了别的异常：{type(exc).__name__}: {exc}")
    return check(name, False, "没有抛异常")


def cli(args, timeout=60, env_extra=None):
    t0 = time.perf_counter()
    env = dict(os.environ, PYTHONPATH=HERE)
    if env_extra:
        env.update(env_extra)
    p = subprocess.run([sys.executable, WORLDSVC] + args, capture_output=True, text=True,
                       timeout=timeout, env=env)
    return p.returncode, p.stdout, _ms(t0)


def _ms(t0):
    return round((time.perf_counter() - t0) * 1000, 1)


def fake_container(**over):
    c = {"id": "c1", "parent": None, "bbox": [10, 10, 60, 60], "kind": "tile",
         "text": ["确定"], "glyphs": [], "badges": [],
         "affordance": {"clickable": "unknown", "evidence": ["skin_siblings:1"]},
         "clipped": {"edges": [], "cut_by": None, "px": 0},
         "confidence": 0.8, "evidence": {"rule": "selftest"}}
    c.update(over)
    return c


def main(argv=None):
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--json-out", default=os.path.join(EVIDENCE, "selftest.json"))
    a = ap.parse_args(argv)
    os.makedirs(EVIDENCE, exist_ok=True)
    t_start = time.time()

    # ───────── schema ─────────
    vocab = schema.state_vocabulary()
    check("schema/状态名词表读自 ys-state", len(vocab) >= 8 and "GAME_PAIMON" in vocab, str(vocab))
    check("schema/bbox xyxy→xywh 归一化",
          schema.xyxy_to_xywh([382, 1046, 556, 1202]) == [382, 1046, 174, 156])
    obj = schema.object_from_container(fake_container(), frame_id="sha256:" + "0" * 64)
    check("schema/容器 bbox 归一化为 xywh（宽高>0）", obj["bbox"] == [10, 10, 50, 50], str(obj["bbox"]))
    check("schema/对象必带 evidence", bool(obj["evidence"]))
    raw = schema.new_world(
        frame_id="sha256:" + "0" * 64, captured_at_ms=schema.now_ms(),
        state={"name": "GAME_PAIMON", "evidence": [{"source": "selftest"}], "channel": "fast"},
        objects=[obj], budget_ms=dict(schema.BUDGET_DEFAULT_MS), degraded=[])
    check("schema/合法世界状态通过校验", schema.WorldState(raw).state_name == "GAME_PAIMON")
    expect_raises("schema/缺 evidence 被拒",
                  lambda: schema.WorldState({**raw, "objects": [{**obj, "evidence": {}}]}))
    expect_raises("schema/state 无证据被拒",
                  lambda: schema.WorldState({**raw, "state": {"name": "X", "evidence": [], "channel": "fast"}}))
    expect_raises("schema/bbox 宽为 0 被拒",
                  lambda: schema.WorldState({**raw, "objects": [{**obj, "bbox": [0, 0, 0, 10]}]}))
    expect_raises("schema/未知 kind 被拒",
                  lambda: schema.WorldState({**raw, "objects": [{**obj, "kind": "banana"}]}))
    expect_raises("schema/重复 id 被拒",
                  lambda: schema.WorldState({**raw, "objects": [obj, {**obj, "bbox": [1, 1, 5, 5]}]}))
    expect_raises("schema/状态名不在名词表被拒",
                  lambda: schema.WorldState({**raw, "state": {"name": "NOT_A_STATE",
                                                              "evidence": [{"x": 1}], "channel": "fast"}},
                                            strict_state_names=True))
    expect_raises("schema/degraded 非 list 被拒",
                  lambda: schema.WorldState({**raw, "degraded": "oops"}), schema.SchemaError)

    # ───────── 参数三态 / 拒绝三件套（2026-10-21 AGI 反馈轮）─────────
    # 教训：--allow-background 曾在 daemon 后端被**静默吞掉**（收下参数、语义没落地）。
    # 判据：要么真生效，要么明确拒绝并给 observed + next_actions。绝不允许"接受即忽略"。
    caps = json.loads(subprocess.run(
        [sys.executable, WORLDSVC, "capabilities"], capture_output=True, text=True).stdout or "{}")
    check("三态/capabilities 列出两个后端的 flag 支持",
          set((caps.get("backends") or {}).keys()) == {"cli", "daemon-world"},
          str(list((caps.get("backends") or {}).keys())))
    check("三态/daemon 后端声明 allow-background 为 honored",
          "honored" in str(((caps.get("backends") or {}).get("daemon-world") or {}).get("flags")),
          "缺失")
    check("三态/flag_contract 明写不接受静默忽略",
          "静默" in str(caps.get("flag_contract") or ""), "缺失")
    # act 用后台帧必须 rc=2 拒绝，且带 observed + next_actions
    r = subprocess.run([sys.executable, WORLDSVC, "act", "--text", "x",
                        "--expect", '{"type":"state_in","states":["GAME_WORLD"]}',
                        "--allow-background"], capture_output=True, text=True)
    try:
        act_err = json.loads(r.stdout or "{}")
    except ValueError:
        act_err = {}
    _e = act_err.get("error") or {}
    check("三态/act+后台帧 rc=2 明确拒绝", r.returncode == 2, f"rc={r.returncode}")
    check("三件套/拒绝带 observed", isinstance(_e.get("observed"), dict) and bool(_e["observed"]),
          str(_e.get("observed"))[:80])
    check("三件套/拒绝带 next_actions（可执行、带 why）",
          isinstance(_e.get("next_actions"), list) and _e["next_actions"]
          and all(a.get("tool") and a.get("why") for a in _e["next_actions"]),
          str(_e.get("next_actions"))[:80])
    # 归属拒绝的下一步必须是新口径（会话授权含桌面借用），不是教人手搓旧变量
    acts = worldsvc._live_next_actions("OTHER_DESKTOP")
    check("三件套/桌面拒绝给出会话授权路径",
          any("ys-session" in str(a.get("tool")) for a in acts), str([a.get("tool") for a in acts]))
    check("三件套/桌面拒绝含零占屏选项（后台帧）",
          any("--allow-background" in " ".join(a.get("args") or []) for a in acts), "缺失")
    check("三件套/桌面拒绝不再教 YS_ALLOW_DESKTOP_SWITCH",
          all("YS_ALLOW_DESKTOP_SWITCH" not in json.dumps(a, ensure_ascii=False) for a in acts), "仍是旧口径")

    # ───────── look（真实帧）─────────
    svc = worldsvc.WorldService(cache_enabled=True)
    t0 = time.perf_counter()
    ws = svc.look(frame=FRAME)
    cold_ms = _ms(t0)
    check("look/状态来自 ys-state（GAME_PAIMON）", ws.state_name == "GAME_PAIMON", ws.state_name)
    check("look/对象表非空", len(ws.objects) >= 1, str(len(ws.objects)))
    check("look/frame_id 是 sha256 内容寻址", ws.frame_id.startswith("sha256:") and len(ws.frame_id) == 71)
    check("look/budget_ms 三字段齐全", set(ws.raw["budget_ms"]) == {"total", "detect", "ocr"})
    check("look/deg 必含 L2/L3 未实现", {"L2_NOT_IMPLEMENTED", "L3_NOT_IMPLEMENTED"} <=
          {d["code"] for d in ws.degraded}, str([d["code"] for d in ws.degraded]))
    fw, fh = ws.raw["frame"].get("w"), ws.raw["frame"].get("h")
    bad_bbox = [o["id"] for o in ws.objects
                if not (o["bbox"][2] > 0 and o["bbox"][3] > 0
                        and o["bbox"][0] >= 0 and o["bbox"][1] >= 0
                        and (not fw or o["bbox"][0] + o["bbox"][2] <= fw + 1)
                        and (not fh or o["bbox"][1] + o["bbox"][3] <= fh + 1))]
    check("look/所有对象 bbox 在帧内（xywh）", not bad_bbox, f"{bad_bbox[:5]} frame={fw}x{fh}")
    hit = []
    for _ in range(3):
        t0 = time.perf_counter()
        ws2 = svc.look(frame=FRAME)
        hit.append(_ms(t0))
    check("look/缓存命中 ≤5ms（进程内）", max(hit) <= 5.0, str(hit))
    check("look/缓存命中标注 cache.hit", bool(ws2.raw.get("cache", {}).get("hit")), str(ws2.raw.get("cache")))

    ws_latest = svc.look(source="latest")
    check("look/latest 复用上一帧并如实标 STALE_FRAME/FRAME_PINNED",
          ws_latest.frame_id == ws.frame_id and
          bool({"STALE_FRAME", "FRAME_PINNED"} & {d["code"] for d in ws_latest.degraded}),
          str([d["code"] for d in ws_latest.degraded]))

    # 冷路径（禁缓存）→ 耗时如实报在 timing_ms.budget，**不进 degraded**
    # v1（2026-10-21）：同一帧冷调用 1861ms 报 BUDGET_EXCEEDED、热调用 1.61ms 不报 ⇒
    # degraded 随"第几次调用"变化，把"判得对不对"和"花了多久"搅在一起。耗时是性能读数。
    svc_nc = worldsvc.WorldService(cache_enabled=False)
    t0 = time.perf_counter()
    ws_nc = svc_nc.look(frame=FRAME)
    nc_ms = _ms(t0)
    codes = {d["code"] for d in ws_nc.degraded}
    _bud = ws_nc.raw["timing_ms"].get("budget") or {}
    check("S4/超预算不再写 degraded（BUDGET_EXCEEDED 已出队）",
          "BUDGET_EXCEEDED" not in codes, str(sorted(codes)))
    check("S4/超预算写 timing_ms.budget.exceeded",
          _bud.get("exceeded") is True and _bud.get("total_ms", 0) > _bud.get("budget_ms", 0),
          str(_bud))
    check("look/冷路径实测 >50ms（预算确实超了，读数如实）", nc_ms > 50, f"{nc_ms}ms")
    check("look/冷路径 state/objects 分项计时都有",
          all(k in ws_nc.raw["timing_ms"] for k in ("state", "objects")), str(ws_nc.raw["timing_ms"]))

    # ───────── v1 S1/S2/S3：同一帧恒定 + 证据逐条可追溯 ─────────
    # S1 的动机（实测复现）：同一帧冷调用 1861ms 报 BUDGET_EXCEEDED、热调用 1.61ms 不报，
    # `--no-cache` 也 8.1ms（daemon 侧 _WORLD_CACHE 仍命中）⇒ 同一帧给出两套答案。
    # 用**独立缓存目录**保证第一次真的是冷（否则前面的 svc 已把同帧写进共享缓存，
    # "冷热对比"会退化成"disk 命中 vs memory 命中"，测不到真正要测的东西）。
    _s1_dir = os.path.join(EVIDENCE, "s1-cache")
    svc_p = worldsvc.WorldService(cache_enabled=True, cache_dir=_s1_dir)
    svc_p.cache.invalidate()
    ws_cold = svc_p.look(frame=FRAME)
    ws_hot = svc_p.look(frame=FRAME)
    cold_codes = sorted(d["code"] for d in ws_cold.degraded)
    hot_codes = sorted(d["code"] for d in ws_hot.degraded)
    check("S1/同帧冷热两次 degraded 集合相同", cold_codes == hot_codes,
          f"cold={cold_codes} hot={hot_codes}")
    check("S1/第一次真冷（miss）、第二次真热（memory 命中）",
          not (ws_cold.raw.get("cache") or {}).get("hit")
          and (ws_hot.raw.get("cache") or {}).get("hit")
          and (ws_hot.raw.get("cache") or {}).get("layer") == "memory",
          f"cold={ws_cold.raw.get('cache')} hot={ws_hot.raw.get('cache')}")
    check("S1/冷热都给 timing_ms.budget{total_ms,budget_ms,exceeded}",
          all({"total_ms", "budget_ms", "exceeded"} <= set(x.raw["timing_ms"].get("budget") or {})
              for x in (ws_cold, ws_hot)), str(ws_hot.raw["timing_ms"].get("budget")))

    ev0 = ((ws_cold.raw.get("state") or {}).get("evidence") or [{}])[0]
    rd = ev0.get("readings") or []
    check("S2/state.evidence[0].readings 非空（证据透传，不再是只有 readings_n）",
          len(rd) > 0, f"n={len(rd)} keys={sorted(ev0)[:6]}")
    check("S2/每条 readings 都含 name/passed/value",
          bool(rd) and all(all(k in r for k in ("name", "passed", "value")) for r in rd),
          str(rd[:1]))
    check("S2/readings 的判据名带状态前缀（看得出是哪一态的判据）",
          bool(rd) and all("/" in str(r["name"]) for r in rd), str(rd[:1]))

    # S3：帧来源不同（离线帧 vs 复用帧）时，degraded 的差异**只允许**帧元数据决定的项
    ws_lat = svc_p.look(source="latest")
    lat_codes = sorted(d["code"] for d in ws_lat.degraded)
    diff = set(lat_codes) ^ set(hot_codes)
    check("S3/离线帧 vs 复用帧：degraded 差异只允许 FRAME_PINNED/STALE_FRAME",
          ws_lat.frame_id == ws_hot.frame_id and diff <= {"FRAME_PINNED", "STALE_FRAME"},
          f"diff={sorted(diff)} latest={lat_codes}")

    # ───────── v1 P3：摘要与全量**一个形状**（state 是对象、degraded 是对象列表）─────────
    sm = ws_hot.summary()
    check("P3/summary.state 是对象 {name,confidence,novel,match}",
          isinstance(sm.get("state"), dict) and sm["state"].get("name") == ws_hot.state_name
          and "novel" in sm["state"] and isinstance(sm["state"].get("match"), dict),
          str(sm.get("state"))[:140])
    check("P3/summary 留过渡别名 state_name（字符串）", sm.get("state_name") == ws_hot.state_name)
    check("P3/summary.degraded 与全量同形（对象列表，含 code）",
          isinstance(sm.get("degraded"), list) and bool(sm["degraded"])
          and all(isinstance(d, dict) and d.get("code") for d in sm["degraded"]),
          str(sm.get("degraded"))[:140])
    check("P3/summary 留过渡别名 degraded_codes",
          sm.get("degraded_codes") == [d["code"] for d in ws_hot.degraded],
          str(sm.get("degraded_codes")))
    check("P3/schema 版本已升到 gui-world-state/1",
          ws_hot.raw.get("schema") == "gui-world-state/1", str(ws_hot.raw.get("schema")))

    match = ws_hot.state_match
    # 最终形状（Lead 2026-10-21）：判据层透传 + worldsvc 标注。**没有** best/second/margin——
    # support 表已给每态 passed/total/ratio/rule，`candidate` 才是判据层认定的"我以为它是谁"；
    # 再按 ratio 排一次序就是第二个真相源（实测踩过：LOADING 1/2 与 PLAYTEST 2/4 打平，
    # 字典序把 LOADING 排前面 ⇒ 回执里 best=LOADING 而判据层 candidate=PLAYTEST，自相矛盾）。
    check("P3/state.match 形状 = 判据层透传 + 标注（无 best/second/margin 二手排序）",
          {"candidate", "ratio", "has_critical", "critical_ok", "ratio_pass",
           "accept_support", "accepted", "novel", "novel_reason", "level",
           "support", "support_ratio", "support_source", "criteria_n"} <= set(match)
          and not ({"best", "best_ratio", "second", "second_ratio", "margin"} & set(match)),
          str(sorted(match)))
    check("P3/accept_support 是**阈值数字**、accepted 是布尔（两者都在，不许混成一个）",
          (match.get("accept_support") is None
           or isinstance(match.get("accept_support"), (int, float)))
          and (match.get("accepted") is None or isinstance(match.get("accepted"), bool)),
          f"accept_support={match.get('accept_support')!r} accepted={match.get('accepted')!r}")
    check("P3/state.novel 与 state.match.novel 同值（一个结论一种说法）",
          ws_hot.raw["state"].get("novel") == match.get("novel"),
          f"{ws_hot.raw['state'].get('novel')!r} vs {match.get('novel')!r}")
    check("P3/state.match 不含重复的 state 键（避免与 state.name 各自漂移）",
          "state" not in match, str(sorted(match)))

    # ───────── 缓存：陈旧 v0 条目必须当 miss，不许变成 traceback（Lead 实测坑）─────────
    # 复现（修复前）：磁盘上存着改造前的 v0 回执，schema 现在要求 v1 ⇒ 缓存命中即抛
    # `SchemaError: schema 应为 'gui-world-state/1'，实际 'gui-world-state/0'`，而 --no-cache 正常。
    # 修法两层：① 契约版本进缓存 key（frame_key namespace）；② 命中后再校验一次，不符当 miss 并删掉。
    svc_v0 = worldsvc.WorldService(cache_enabled=True)
    key_v1 = cache_mod.frame_key(ws_cold.frame_id, svc_v0.sig, namespace=schema.SCHEMA_ID)
    path_v1 = os.path.join(svc_v0.cache.cache_dir, key_v1)
    stale_v0 = {"schema": "gui-world-state/0", "frame_id": ws_cold.frame_id,
                "state": {"name": "GAME_PAIMON", "evidence": [{"source": "stale"}]},
                "degraded": [], "objects": []}
    with open(path_v1, "w", encoding="utf-8") as f:
        json.dump(stale_v0, f)
    raw_v0, layer_v0, _ms0 = svc_v0.cache.load(ws_cold.frame_id, svc_v0.sig,
                                               namespace=schema.SCHEMA_ID,
                                               require={"schema": schema.SCHEMA_ID})
    check("缓存/契约版本不符的条目当 miss（layer=invalid，不返回陈旧 raw）",
          raw_v0 is None and layer_v0 == "invalid", f"layer={layer_v0}")
    with open(path_v1, "w", encoding="utf-8") as f:      # 再摆一次，走完整的 look 路径
        json.dump(stale_v0, f)
    try:
        ws_v0 = svc_v0.look(frame=FRAME)
    except Exception as exc:                             # noqa: BLE001
        ws_v0 = None
        check("缓存/陈旧 v0 条目命中后自动重算（不抛 SchemaError）", False,
              f"{type(exc).__name__}: {exc}")
    if ws_v0 is not None:
        check("缓存/陈旧 v0 条目命中后自动重算（不抛 SchemaError）",
              ws_v0.state_name == ws_cold.state_name, ws_v0.state_name)
        check("缓存/重算后的 degraded 与冷路径一致",
              sorted(d["code"] for d in ws_v0.degraded) == cold_codes,
              str(sorted(d["code"] for d in ws_v0.degraded)))
        check("缓存/陈旧条目计数到 cache.invalid", svc_v0.cache.stats().get("invalid", 0) >= 1,
              str(svc_v0.cache.stats()))
    check("缓存/key 含契约命名空间（换版本 ⇒ 旧 key 自然读不到）",
          key_v1.endswith("-gui-world-state_1.json") and key_v1.startswith("world-"), key_v1)

    # ───────── act（2026-10-19：语义期待 expect）─────────
    EXPECT_SIMPLE = {"type": "pixel_delta", "region": [300, 200, 1200, 800], "threshold_pct": 5}
    injected = []
    orig_inject = instruments.inject_click
    instruments.inject_click = lambda *aa, **kk: injected.append((aa, kk)) or {"rc": 99, "stderr_tail": "stub"}
    try:
        res = svc.act({"text": "祈愿"}, expect=EXPECT_SIMPLE, frame=FRAME)
        check("act/不带 expect 被拒（ACT_EXPECT_REQUIRED）",
              svc.act({"text": "祈愿"}, frame=FRAME)["error"]["code"] == "ACT_EXPECT_REQUIRED")
        check("act/dry-run 状态=dry_run", res["status"] == "dry_run", res["status"])
        check("act/dry-run 回执带 expect 且未评估",
              res["expect"]["type"] == "pixel_delta" and res["expect_evaluated"] is False)
        check("act/dry-run 未注入", res["injected"] is False and not injected)
        check("act/dry-run 默认动作=click（点在帧内）",
              res["action"]["type"] == "click" and bool(res.get("would_act")) and
              (not fw or 0 <= res["would_act"]["at"][0] < fw),
              str(res.get("would_act")))
        check("act/dry-run 明确标注 INJECTION_BLOCKED",
              any(d["code"] == "INJECTION_BLOCKED" for d in res["degraded"]))
        res = svc.act({"text": "绝对不存在的按钮"}, expect=EXPECT_SIMPLE, frame=FRAME)
        check("act/未命中 fail-closed（resolve_fail）", res["status"] == "resolve_fail" and not injected)
        res = svc.act({"text": "透雨"}, expect=EXPECT_SIMPLE, frame=FRAME)   # f06 free_text
        # 2026-10-21 起：容器文本未命中会走**整帧 OCR 兜底**（channel=ocr_frame）并给出坐标，
        # 旧的「free_text 命中 ⇒ 必然 resolve_fail」已不成立（那是加上兜底之前的设计）。
        # 现在要验的是：兜底真的解析出坐标，且回执**自洽**（resolved 与 resolution.status 一致）。
        _rt = (res.get("resolution") or {}).get("status")
        check("act/free_text 命中 → 整帧 OCR 兜底解析出坐标",
              res["status"] == "dry_run" and _rt == "resolved"
              and (res.get("resolution") or {}).get("channel") == "ocr_frame"
              and bool((res.get("would_act") or {}).get("at")),
              f"status={res['status']} channel={(res.get('resolution') or {}).get('channel')} "
              f"at={(res.get('would_act') or {}).get('at')}")
        check("act/回执自洽：resolved 与 resolution.status 一致",
              bool(res.get("resolved")) == (_rt == "resolved"),
              f"resolved={res.get('resolved')} resolution.status={_rt}")
        synth = schema.new_world(
            frame_id="sha256:" + "1" * 64, captured_at_ms=schema.now_ms(),
            state={"name": "GAME_PAIMON", "evidence": [{"source": "selftest"}], "channel": "fast"},
            objects=[schema.object_from_container(fake_container(id="c1"), frame_id="sha256:" + "1" * 64),
                     schema.object_from_container(fake_container(id="c2", bbox=[100, 100, 160, 160]),
                                                  frame_id="sha256:" + "1" * 64)],
            budget_ms=dict(schema.BUDGET_DEFAULT_MS), degraded=[])
        amb = svc._resolve_target(schema.WorldState(synth), {"text": "确定"})
        check("act/多义 fail-closed（ambiguous）", amb["status"] == "ambiguous" and len(amb["candidates"]) == 2)
        # 授权闸门：不带 allow_inject 时绝不调用注入仪器
        res = svc.act({"text": "祈愿"}, expect=EXPECT_SIMPLE, frame=FRAME, inject=True)
        check("act/注入未授权被拒（INJECTION_BLOCKED）",
              res["status"] == "precondition_fail" and not injected, str(res.get("error")))
        res = svc.act({"intent": "playtest-start"}, expect=EXPECT_SIMPLE, inject=True)
        check("act/意图需焦点被拒（FOCUS_REQUIRED/INJECTION_BLOCKED）",
              res["status"] in ("precondition_fail", "dry_run") and not injected, str(res.get("error")))
        res = svc.act({"intent": "playtest-start"}, expect=EXPECT_SIMPLE)
        check("act/意图 dry-run 有 pre/post 交接（resolved）",
              res["status"] == "dry_run" and res["resolved"] is True and
              bool(res.get("post_predicate")), str(res.get("post_predicate")))
        # expect DSL 校验
        for name, bad in (
                ("未知 type", {"type": "banana"}),
                ("text_added 缺 region", {"type": "text_added", "texts": ["x"]}),
                ("region_text_set_changed 缺 region", {"type": "region_text_set_changed"}),
                ("pixel_delta 阈值越界", {"type": "pixel_delta", "region": [0, 0, 10, 10],
                                          "threshold_pct": 0}),
                ("state_in 空集合", {"type": "state_in", "states": []})):
            r = svc.act({"text": "祈愿"}, expect=bad, frame=FRAME)
            check(f"act/expect DSL 拒绝：{name}",
                  r["status"] == "invalid" and r.get("error", {}).get("code") == "BAD_EXPECT",
                  str(r.get("error")))
    finally:
        instruments.inject_click = orig_inject

    # ───────── expect 评估 + 证据三件套（离线合成帧：改动只在网格区，详情区不动）─────────
    from PIL import Image
    fx = os.path.join(EVIDENCE, "expect-fixtures")
    os.makedirs(fx, exist_ok=True)
    before = os.path.join(fx, "before.png")
    after_grid = os.path.join(fx, "after_grid.png")
    if not (os.path.exists(before) and os.path.exists(after_grid)):
        base = Image.open(FRAME).convert("RGB")
        other = Image.open(ALT_FRAME).convert("RGB")
        grid_box = (300, 200, 1500, 1000)
        base.save(before)
        a = base.copy()
        a.paste(other.crop(grid_box), (grid_box[0], grid_box[1]))
        a.save(after_grid)
    GRID = [300, 200, 1200, 800]
    DETAIL = [1770, 150, 630, 650]
    ev = svc.evaluate_expect({"type": "region_text_set_changed", "region": GRID,
                              "min_jaccard_delta": 0.15}, before, after_grid)
    check("expect/region_text_set_changed 正例（网格区变了）",
          ev["ok"] is True and ev["observed"]["delta"] >= 0.15, json.dumps(ev["observed"], ensure_ascii=False))
    ev = svc.evaluate_expect({"type": "region_text_set_changed", "region": DETAIL,
                              "min_jaccard_delta": 0.15}, before, after_grid)
    check("expect/region_text_set_changed 负例（详情区没变）",
          ev["ok"] is False and ev["observed"]["delta"] == 0.0, json.dumps(ev["observed"], ensure_ascii=False))
    check("expect/负例 detail 明确说『不是我期待的区域』",
          "不是我期待的区域" in (ev.get("detail") or ""), ev.get("detail"))
    ev = svc.evaluate_expect({"type": "pixel_delta", "region": GRID, "threshold_pct": 5},
                             before, after_grid)
    check("expect/pixel_delta 正例（0→24% 级变化）",
          ev["ok"] is True and ev["observed"]["pixels_changed_pct"] >= 5,
          json.dumps(ev["observed"], ensure_ascii=False))
    ev = svc.evaluate_expect({"type": "pixel_delta", "region": DETAIL, "threshold_pct": 5},
                             before, after_grid)
    check("expect/pixel_delta 负例（详情区 0%）",
          ev["ok"] is False and ev["observed"]["pixels_changed_pct"] == 0.0,
          json.dumps(ev["observed"], ensure_ascii=False))
    ev = svc.evaluate_expect({"type": "state_in", "states": ["GAME_PAIMON"]}, before, after_grid)
    check("expect/state_in 正例（复用 ys-state 判据）",
          ev["ok"] is True and ev["observed"]["state"] == "GAME_PAIMON", str(ev["observed"]))
    ev = svc.evaluate_expect({"type": "state_in", "states": ["PLAYTEST"]}, before, after_grid)
    check("expect/state_in 负例", ev["ok"] is False, str(ev["observed"]))
    pair, _err = instruments.watch_region(before, after_grid, GRID, no_ocr=False, debug=True)
    added = [e["text"] for e in pair["events"] if e["kind"] == "text_added"]
    removed = [e["text"] for e in pair["events"] if e["kind"] == "text_removed"]
    if added:
        ev = svc.evaluate_expect({"type": "text_added", "region": GRID,
                                  "texts": [added[0]]}, before, after_grid)
        check(f"expect/text_added 正例（{added[0]}）", ev["ok"] is True, ev.get("detail"))
    ev = svc.evaluate_expect({"type": "text_added", "region": GRID,
                              "texts": ["绝对不存在的文本ZZZ"]}, before, after_grid)
    check("expect/text_added 负例", ev["ok"] is False, ev.get("detail"))
    if removed:
        ev = svc.evaluate_expect({"type": "text_removed", "region": GRID,
                                  "texts": [removed[0]]}, before, after_grid)
        check(f"expect/text_removed 正例（{removed[0]}）", ev["ok"] is True, ev.get("detail"))
    check("expect/失败退出码 expect_failed=9", worldsvc._exit_code_for("expect_failed") == 9)

    # 离线注入（假动作）：验证「动作→证据→expect」整条链与正/负例状态
    # 离线模拟（simulate_action=True）：只验证「动作→证据→expect」链路，不真注入
    dpos = os.path.join(EVIDENCE, "act-expect-pos")
    r = svc.act({"object_id": "c3"}, expect={"type": "region_text_set_changed",
                                             "region": GRID, "min_jaccard_delta": 0.15},
                action={"type": "click"}, frame=before, after_frame=after_grid,
                inject=True, simulate_action=True, evidence_dir=dpos, expect_timeout_ms=200)
    check("act/离线模拟正例 → ok", r["status"] == "ok" and r["ok"] is True and
          r.get("simulated") is True, str(r.get("error")))
    files = {f: os.path.exists(os.path.join(dpos, f))
             for f in ("before.png", "after.png", "detail.png", "meta.json")}
    check("act/证据三件套 + meta 存在", all(files.values()), str(files))
    r = svc.act({"object_id": "c3"}, expect={"type": "region_text_set_changed",
                                             "region": DETAIL, "min_jaccard_delta": 0.15},
                action={"type": "click"}, frame=before, after_frame=after_grid,
                inject=True, simulate_action=True, expect_timeout_ms=200,
                evidence_dir=os.path.join(EVIDENCE, "act-expect-neg"))
    check("act/离线模拟负例 → expect_failed（画面变了但不是我期待的区域）",
          r["status"] == "expect_failed" and r["ok"] is False and
          r.get("error", {}).get("code") == "ACT_EXPECT_FAILED",
          str(r.get("error")))
    check("act/负例证据也落盘（before/after/detail）",
          all(os.path.exists(os.path.join(EVIDENCE, "act-expect-neg", f))
              for f in ("before.png", "after.png", "detail.png")))
    check("act/负例 detail 点名区域不符",
          "不是我期待的区域" in ((r.get("expect_result") or {}).get("detail") or ""))
    r = svc.act({"object_id": "c3"}, expect={"type": "state_in", "states": ["GAME_PAIMON"]},
                frame=before, after_frame=after_grid, inject=True,
                evidence_dir=os.path.join(EVIDENCE, "act-expect-simguard"))
    check("act/after_frame 未声明 simulate_action → 拒绝（防旧帧驱动真注入）",
          r["status"] == "invalid" and r.get("error", {}).get("code") == "ACT_SIMULATE_REQUIRED",
          str(r.get("error")))

    # ───────── _do_action：rc 与 release_ok 不许混为一谈（2026-10-19 live 缺陷回归）─────────
    orig_scroll = instruments.inject_scroll
    orig_cap = svc._capture_evidence
    try:
        def fake_cap(frame, out, after_frame=None):
            src = after_grid if frame is None else before
            instruments.copy_frame(src, out)
            return out, {"source": "selftest"}
        svc._capture_evidence = fake_cap

        instruments.inject_scroll = lambda *a, **k: {
            "rc": 5, "result": {"ok": False, "release_ok": False, "budget": {"over": True}},
            "stdout_tail": "", "stderr_tail": "OVER BUDGET"}
        d = svc._do_action({"type": "scroll", "at": [900, 600], "clicks": 4, "dir": "down"})
        check("act/归还失败不冒充注入失败（rc=5+release_ok=false → ok=True+标记）",
              d["ok"] is True and d["release_failed"] is True and d["inject_failed"] is False, str(d))
        r = svc.act({"object_id": "c3"},
                    expect={"type": "region_text_set_changed", "region": GRID,
                            "min_jaccard_delta": 0.15},
                    action={"type": "scroll", "at": [900, 600], "clicks": 4, "dir": "down"},
                    frame=before, inject=True, allow_inject=True,
                    # 捕获被 fake_cap 接管 ⇒ 帧不变，轮询只会空转到 5s（实测 1.9s→0.3s）
                    expect_timeout_ms=200,
                    evidence_dir=os.path.join(EVIDENCE, "act-lease-fail"))
        check("act/归还失败 + expect 成立 → status=ok（不因 rc=5 报 INJECT_FAILED）",
              r["status"] == "ok" and r["ok"] is True, str(r.get("error")))
        check("act/归还失败单独记 LEASE_RESTORE_FAILED",
              any(x["code"] == "LEASE_RESTORE_FAILED" for x in r.get("degraded", [])),
              str(r.get("degraded")))
        r = svc.act({"object_id": "c3"},
                    expect={"type": "region_text_set_changed", "region": DETAIL,
                            "min_jaccard_delta": 0.15},
                    action={"type": "scroll", "at": [900, 600], "clicks": 4, "dir": "down"},
                    frame=before, inject=True, allow_inject=True,
                    expect_timeout_ms=200,
                    evidence_dir=os.path.join(EVIDENCE, "act-lease-fail-neg"))
        check("act/归还失败 + expect 不成立 → expect_failed（不是 INJECT_FAILED）",
              r["status"] == "expect_failed" and r.get("error", {}).get("code") == "ACT_EXPECT_FAILED",
              str(r.get("error")))

        instruments.inject_scroll = lambda *a, **k: {
            "rc": 5, "result": {"ok": False, "release_ok": True},
            "stdout_tail": "", "stderr_tail": "inject failed"}
        d = svc._do_action({"type": "scroll", "at": [900, 600], "clicks": 4, "dir": "down"})
        check("act/真注入失败仍判死（release_ok=true → ok=False）",
              d["ok"] is False and d["inject_failed"] is True, str(d))
        r = svc.act({"object_id": "c3"}, expect={"type": "state_in", "states": ["GAME_PAIMON"]},
                    action={"type": "scroll", "at": [900, 600], "clicks": 4, "dir": "down"},
                    frame=before, inject=True, allow_inject=True,
                    evidence_dir=os.path.join(EVIDENCE, "act-inject-fail"))
        check("act/真注入失败 → INJECT_FAILED + rc=8",
              r["status"] == "error" and r.get("error", {}).get("code") == "INJECT_FAILED" and
              worldsvc._exit_code_for(r["status"]) == 8, str(r.get("error")))

        instruments.inject_scroll = orig_scroll
    finally:
        instruments.inject_scroll = orig_scroll
        svc._capture_evidence = orig_cap

    # ───────── wait_until ─────────
    res = svc.wait_until({"state_in": ["GAME_PAIMON"]}, frame=FRAME, timeout_ms=3000)
    check("wait/reached（三态之一）", res["status"] == "reached", res["status"])
    check("wait/reached 带观测值", bool(res["observed"]["checks"]))
    t0 = time.perf_counter()
    res = svc.wait_until({"state_in": ["PLAYTEST"]}, frame=FRAME, timeout_ms=700, poll_ms=150)
    wait_ms = _ms(t0)
    check("wait/timeout（超时不冒充仪器故障）", res["status"] == "timeout" and res["polls"] >= 2,
          f"{res['status']} polls={res['polls']} {wait_ms}ms")
    check("wait/timeout 标 WAIT_TIMEOUT_VALID", any(d["code"] == "WAIT_TIMEOUT_VALID" for d in res["degraded"]))
    res = svc.wait_until({"text_present": ["祈愿"], "forbid": {"text_present": ["祈愿"]}},
                         frame=FRAME, timeout_ms=3000)
    check("wait/violated（forbid 命中立即停）", res["status"] == "violated" and res["polls"] == 1, res["status"])
    res = svc.wait_until({"text_absent": ["绝对不存在的词"]}, frame=FRAME, timeout_ms=3000)
    check("wait/text_absent 达成但降级标注（单帧否定）",
          res["status"] == "reached" and
          any(d["code"] == "ABSENCE_SINGLE_FRAME" for d in res["degraded"]))
    res = svc.wait_until({"nonsense_key": 1}, frame=FRAME)
    check("wait/非法判据 fail-closed", res["status"] == "error" and
          res.get("error", {}).get("code") == "BAD_PREDICATE", str(res.get("error")))
    # frame_changed：帧序列（provider 注入缝）
    svc_seq = worldsvc.WorldService(cache_enabled=True)
    seq = [FRAME, ALT_FRAME, ALT_FRAME]
    svc_seq.frame_provider = lambda: seq.pop(0)
    ws_first = svc_seq.look()                       # 消费 seq[0]=f06
    res = svc_seq.wait_until({"frame_changed": True}, timeout_ms=3000, poll_ms=0)
    changed_ok = (res["status"] == "reached" and
                  res["observed"]["checks"][0]["observed"]["actual"] != ws_first.frame_id)
    check("wait/frame_changed（帧序列：第二次 look 换了帧）", changed_ok,
          f"{res['status']} polls={res['polls']} observed={res.get('observed')}")
    check("wait/状态转移进账本（transitions）",
          len(svc_seq.transitions) >= 1, str(svc_seq.transitions))

    # ───────── daemon-world 后端（需新版 ys-lookd；旧服务会 DAEMON_ERROR，显式标 SKIP）─────────
    dw_note = ""
    try:
        svc_dw = worldsvc.WorldService(backend="daemon-world", cache_enabled=False,
                                       daemon_cache=False)
        t0 = time.perf_counter()
        ws_dw = svc_dw.look(frame=FRAME)
        dw_cold = _ms(t0)
        check("daemon-world/state 与 cli 一致", ws_dw.state_name == ws.state_name,
              f"{ws_dw.state_name} != {ws.state_name}")
        # 2026-10-21：两个后端 CV 源不同（cli=容器层 / daemon=D2 检测框），逐条相等是**旧设计**
        # 的判据（"选更全的源"2026-10-19 才进 daemon）。现在验的是：来源可见 + 具名对象高度重合。
        _named = lambda ws_: {o["text"][0] for o in ws_.objects if o.get("text")}
        _dn, _cn = _named(ws_dw), _named(ws)
        check("daemon-world/对象来源与两源数量可见",
              (ws_dw.raw.get("objects_source") in ("containers", "detections")
               and (ws.raw.get("objects_n") or {}).get("containers") is not None),
              f"source={ws_dw.raw.get('objects_source')} n={ws_dw.raw.get('objects_n')}")
        check("daemon-world/具名对象与 cli 重合 ≥70%（不同 CV 源，不要求逐条相等）",
              bool(_cn) and len(_dn & _cn) / len(_cn) >= 0.70,
              f"交集 {len(_dn & _cn)}/{len(_cn)} = {len(_dn & _cn) / max(1, len(_cn)):.0%}")
        check("daemon-world/timing 含 judge_ms/ocr_ms（禁两层缓存后直取原始回执）",
              all(k in (ws_dw.raw.get("timing_ms") or {}) for k in ("judge_ms", "ocr_ms")),
              str(ws_dw.raw.get("timing_ms")))
        check("daemon-world/带 daemon_timing 原始回执", bool(ws_dw.raw.get("daemon_timing")))
        svc_dw_c = worldsvc.WorldService(backend="daemon-world", cache_enabled=True)
        svc_dw_c.look(frame=FRAME)
        dw_hits = []
        for _ in range(3):
            t0 = time.perf_counter()
            svc_dw_c.look(frame=FRAME)
            dw_hits.append(_ms(t0))
        check("daemon-world/缓存命中 ≤5ms（进程内）", max(dw_hits) <= 5.0, str(dw_hits))
        dw_note = f"cold={dw_cold}ms hits={dw_hits}"
        rc, out, ms = cli(["look", "--frame", FRAME, "--backend", "daemon-world", "--summary"])
        check("CLI/look --backend daemon-world rc=0", rc == 0, f"rc={rc} {out[:200]}")
    except (worldsvc.ServiceError, instruments.InstrumentError) as exc:
        code = getattr(exc, "code", "ERROR")
        check(f"daemon-world/SKIP（常驻服务不可用或无 world 命令：{code}；"
              f"新版需重启 ys-lookd 后复测）", code in ("DAEMON_ERROR", "DAEMON_UNAVAILABLE",
                                                        "DAEMON_FAILED", "DAEMON_WORLD_BAD"),
              str(exc)[:200])
        dw_note = f"skipped:{code}"

    # ───────── cache ─────────
    key = cache_mod.frame_key("sha256:" + "a" * 64, "deadbeef0000")
    check("cache/key 含帧 sha 前缀 + 仪器指纹",
          key.startswith("world-aaaaaaaaaaaaaaaa-") and key.endswith("deadbeef0000.json"), key)
    check("cache/帧 id 非法被拒",
          _raises(lambda: cache_mod.frame_key("not-a-sha", "x"), ValueError))
    check("cache/证据与缓存都在 workspace 内",
          all(os.path.abspath(p).startswith(REPO) for p in (svc.cache.cache_dir, EVIDENCE)),
          f"{svc.cache.cache_dir} / {EVIDENCE}")

    # ───────── CLI 退出码 ─────────
    rc, out, ms = cli(["act", "--text", "绝对不存在的按钮", "--frame", FRAME,
                       "--expect", '{"type":"pixel_delta","region":[300,200,1200,800],"threshold_pct":5}'])
    check("CLI/act 未命中 → rc=3", rc == 3, f"rc={rc} {ms}ms")
    rc, out, ms = cli(["act", "--text", "祈愿", "--frame", FRAME])
    check("CLI/act 缺 --expect → rc=2（必填）", rc == 2, f"rc={rc} {ms}ms")
    rc, out, ms = cli(["act", "--text", "祈愿", "--frame", FRAME,
                       "--expect", '{"type":"pixel_delta","region":[300,200,1200,800],"threshold_pct":5}'])
    check("CLI/act dry-run 带 expect → rc=0", rc == 0 and '"dry_run"' in out, f"rc={rc} {ms}ms")
    rc, out, ms = cli(["wait", "--predicate", '{"state_in":["PLAYTEST"]}', "--frame", FRAME,
                       "--timeout-ms", "500", "--poll-ms", "100"])
    check("CLI/wait 超时 → rc=6", rc == 6, f"rc={rc} {ms}ms")
    rc, out, ms = cli(["wait", "--predicate",
                       '{"text_present":["祈愿"],"forbid":{"text_present":["祈愿"]}}', "--frame", FRAME])
    check("CLI/wait violated → rc=7", rc == 7, f"rc={rc} {ms}ms")
    rc, out, ms = cli(["look", "--frame", "/nonexistent/frame.png"])
    check("CLI/look 帧不存在 → rc=8", rc == 8, f"rc={rc} {ms}ms")
    rc, out, ms = cli(["look", "--live"])
    # 环境相关断言：窗口在栈顶时 live 通道可达（rc=0），此时不计 PASS/FAIL，只跳过。
    # 窗口身份是否正确是另一个问题（见 .scratch/gui-stack/issues/34-live-attribution.md）。
    if rc == 0:
        print(f"[selftest] SKIP live 断言：窗口在栈顶，live 可达（{ms:.0f}ms）；窗口身份验证见 issues/34")
    else:
        check("CLI/look --live 不在栈顶 → rc=5（fail-closed，不抬窗）", rc == 5, f"rc={rc} {ms}ms")
    rc, out, ms = cli(["vocab"])
    check("CLI/vocab 打印单一源名词表", rc == 0 and "GAME_PAIMON" in out)

    # ───────── 汇总 ─────────
    n_pass = sum(1 for r in RESULTS if r["ok"])
    n_fail = len(RESULTS) - n_pass
    summary = {"passed": n_pass, "failed": n_fail, "total": len(RESULTS),
               "cold_look_ms": cold_ms, "cold_look_no_cache_ms": nc_ms,
               "cache_hit_ms": hit, "daemon_world": dw_note,
               "wall_s": round(time.time() - t_start, 1),
               "results": RESULTS}
    with open(a.json_out, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=1)
    # 2026-10-22：耗时排行（只列 >300ms 的，其余是零头）
    _slow = sorted((r for r in RESULTS if r.get("ms", 0) >= 300),
                   key=lambda r: -r["ms"])[:12]
    print("[selftest] TIMING wall=%ss slow_cases(>=300ms)=%s"
          % (summary["wall_s"],
             " | ".join("%s %.1fs" % (r["name"][:34], r["ms"] / 1000.0) for r in _slow) or "none"))
    print(f"\n[selftest] {n_pass}/{len(RESULTS)} PASS, {n_fail} FAIL"
          f"（冷 look {cold_ms}ms / 禁缓存 {nc_ms}ms / 缓存命中 {max(hit)}ms）")
    print(f"[selftest] 证据 → {a.json_out}")
    return 0 if n_fail == 0 else 1


def _raises(fn, exc_type):
    try:
        fn()
    except exc_type:
        return True
    except Exception:  # noqa: BLE001
        return False
    return False


if __name__ == "__main__":
    sys.exit(main())
