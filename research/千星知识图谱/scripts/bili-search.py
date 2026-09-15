#!/usr/bin/env python3
"""千星知识图谱 · B站关键词扩张式检索（T01）

通道实测结论（2026-09-15，以实测为准，不照抄技能文档）：
  - `api.bilibili.com/x/web-interface/search/type` 直连 curl → 412
  - 同一接口在**浏览器内 fetch 也 412**（www.bilibili.com 与 search.bilibili.com 两个源都试过）
  - ✅ 可用通道 = **搜索页 DOM 抓取**（页面自己发 WBI 签名请求，绕开风控）
  - ✅ `x/web-interface/view`（视频详情）不受影响 → 简介/分P 走第二段取

用法:
    bili-search.py --seeds seeds.txt --out search --round 1
    bili-search.py --seeds seeds.txt --out search --round 1 --pages 2
    bili-search.py --bvid BV1xxx --out search --detail      # 只补简介

产出:
    <out>/round<N>-<slug>.json   每词原始结果（不加工）
    <out>/round<N>-all.json      本轮汇总
    <out>/details.json           bvid → 简介/分P/时长（第二段）
退出码: 0 成功 / 2 前提不满足
"""
import argparse
import json
import os
import re
import subprocess
import sys
from urllib.parse import quote

# 搜索页卡片提取器（选择器 2026-09-15 实测）
EXTRACT_JS = r"""(()=>{
  const cards=[...document.querySelectorAll('.bili-video-card')];
  const out=[];
  for(const c of cards){
    const a=c.querySelector('a[href*="/video/BV"]');
    if(!a) continue;
    const m=(a.getAttribute('href')||'').match(/BV[0-9A-Za-z]+/);
    if(!m) continue;
    const t=c.querySelector('.bili-video-card__info--tit');
    const au=c.querySelector('.bili-video-card__info--author');
    const d=c.querySelector('.bili-video-card__stats__duration');
    const stats=[...c.querySelectorAll('.bili-video-card__stats--item')].map(e=>e.textContent.trim());
    out.push({bvid:m[0],
              title:((t&&(t.getAttribute('title')||t.textContent))||'').trim(),
              author:au?au.textContent.trim():'',
              duration:d?d.textContent.trim():'',
              stats:stats});
  }
  return JSON.stringify(out);
})()"""

DETAIL_JS = r"""(async()=>{
  const bv=%s;
  const v=await fetch('https://api.bilibili.com/x/web-interface/view?bvid='+bv,{credentials:'include'}).then(r=>r.json());
  if(v.code!==0) return JSON.stringify({bvid:bv,code:v.code,msg:v.message});
  const d=v.data;
  return JSON.stringify({bvid:bv,code:0,title:d.title,desc:d.desc,owner:(d.owner||{}).name,
    duration:d.duration,pubdate:d.pubdate,tname:d.tname,view:(d.stat||{}).view,
    danmaku:(d.stat||{}).danmaku,reply:(d.stat||{}).reply,favorite:(d.stat||{}).favorite,
    pages:(d.pages||[]).map(p=>({page:p.page,part:p.part,cid:p.cid,duration:p.duration}))});
})()"""


def _bh(script: str, timeout: int = 1800) -> subprocess.CompletedProcess:
    return subprocess.run(["browser-harness"], input=script, capture_output=True,
                          text=True, timeout=timeout)


def _last_json(raw: str):
    for line in reversed(raw.splitlines()):
        line = line.strip()
        if line.startswith("{") or line.startswith("["):
            try:
                return json.loads(line)
            except json.JSONDecodeError:
                continue
    return None


def ensure_tab() -> None:
    """复用已开的 B 站 tab；没有才新开（避免 tab 泄漏）。"""
    script = (
        "tabs = list_tabs()\n"
        "hit = None\n"
        "for t in tabs:\n"
        "    if 'bilibili.com' in t.get('url',''):\n"
        "        hit = t['target_id']; break\n"
        "if hit:\n"
        "    switch_tab(hit)\n"
        "else:\n"
        "    new_tab('https://search.bilibili.com/')\n"
        "    wait_for_load()\n"
        "print('on:', js('location.host')[:60])\n"
    )
    p = _bh(script, 300)
    if p.returncode != 0:
        raise RuntimeError(f"导航失败: {p.stderr.strip()[:300]}")


def search_round(targets: list) -> dict:
    """一次浏览器调用跑完全部关键词×页（每个 js() 都是短调用，不受 CDP 求值超时限制）。"""
    script = f"""import json, time
targets = {json.dumps(targets, ensure_ascii=False)}
EXTRACT = {json.dumps(EXTRACT_JS)}
out = {{}}
for t in targets:
    goto_url(t['url'])
    wait_for_load()
    got = None
    for _ in range(15):
        time.sleep(1)
        try:
            raw = js(EXTRACT)
            data = json.loads(raw) if raw else []
        except Exception:
            data = []
        if data:
            got = data
            break
    out[t['key']] = got or []
    print('  ->', t['key'], len(got or []))
print('__RESULT__' + json.dumps(out, ensure_ascii=False))
"""
    p = _bh(script)
    if p.returncode != 0:
        raise RuntimeError(f"检索失败: {p.stderr.strip()[:400]}")
    for line in p.stdout.splitlines():
        if line.startswith("__RESULT__"):
            return json.loads(line[len("__RESULT__"):])
    raise RuntimeError(f"未拿到结果: {p.stdout[-300:]}")


def fetch_details(bvids: list) -> dict:
    """第二段：视频页内取详情（含简介）。view 接口不受 412 影响。"""
    out = {}
    CH = 6  # 每块 6 个，避免单次 js() 过长
    for i in range(0, len(bvids), CH):
        part = bvids[i:i + CH]
        script = f"""import json, time
bvids = {json.dumps(part)}
out = {{}}
for bv in bvids:
    goto_url('https://www.bilibili.com/video/' + bv)
    wait_for_load()
    time.sleep(1.5)
    try:
        raw = js({json.dumps(DETAIL_JS)} % json.dumps(bv))
        out[bv] = json.loads(raw)
    except Exception as e:
        out[bv] = {{'bvid': bv, 'code': -999, 'msg': str(e)[:120]}}
print('__DETAIL__' + json.dumps(out, ensure_ascii=False))
"""
        p = _bh(script)
        if p.returncode != 0:
            print(f"  ! 详情块 {i // CH + 1} 失败", file=sys.stderr)
            continue
        for line in p.stdout.splitlines():
            if line.startswith("__DETAIL__"):
                out.update(json.loads(line[len("__DETAIL__"):]))
        print(f"  · 详情块 {i // CH + 1}/{(len(bvids) + CH - 1) // CH} 完成")
    return out


def slug(s: str) -> str:
    return re.sub(r"[^\w\u4e00-\u9fa5]+", "_", s)[:50]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds")
    ap.add_argument("--kw", action="append", default=[])
    ap.add_argument("--out", required=True)
    ap.add_argument("--round", type=int, default=1)
    ap.add_argument("--pages", type=int, default=1, help="每个关键词抓几页")
    ap.add_argument("--detail", action="store_true", help="只跑第二段：补简介")
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--bvids-file", help="只对文件里的 BV 取详情")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)

    if a.detail:
        src = os.path.join(a.out, f"round{a.round}-all.json")
        if a.bvids_file:
            with open(a.bvids_file, encoding="utf-8") as f:
                ordered = [ln.strip() for ln in f if ln.strip().startswith("BV")]
        elif os.path.exists(src):
            with open(src, encoding="utf-8") as f:
                agg = json.load(f)
            seen, ordered = set(), []
            for kw, v in agg.items():
                for r in (v if isinstance(v, list) else []):
                    if r.get("bvid") and r["bvid"] not in seen:
                        seen.add(r["bvid"]); ordered.append(r["bvid"])
        else:
            print(f"✗ 缺少 {src}", file=sys.stderr); return 2
        dp = os.path.join(a.out, "details.json")
        details = {}
        if os.path.exists(dp):
            with open(dp, encoding="utf-8") as f:
                details = json.load(f)
        todo = [b for b in ordered if b not in details or details[b].get("code") != 0]
        print(f"目标 {len(ordered)} 个，待取详情 {len(todo)} 个")
        details.update(fetch_details(todo))
        with open(dp, "w", encoding="utf-8") as f:
            json.dump(details, f, ensure_ascii=False, indent=1)
        ok = sum(1 for v in details.values() if v.get("code") == 0)
        print(f"✓ 详情 {ok}/{len(details)} 成功 → {dp}")
        return 0

    kws = list(a.kw)
    if a.seeds:
        with open(a.seeds, encoding="utf-8") as f:
            kws += [ln.strip() for ln in f
                    if ln.strip() and not ln.strip().startswith("#")]
    if not kws:
        print("✗ 没有关键词", file=sys.stderr); return 2
    if a.resume:
        done = {os.path.basename(p)[len(f"round{a.round}-"):-5]
                for p in os.listdir(a.out)
                if p.startswith(f"round{a.round}-") and p.endswith(".json")
                and "all" not in p}
        kws = [k for k in kws if slug(k) not in done]

    targets = [{"key": f"{kw}#p{pg}", "kw": kw, "page": pg,
                "url": f"https://search.bilibili.com/video?keyword={quote(kw)}&page={pg}"}
               for kw in kws for pg in range(1, a.pages + 1)]
    print(f"检索 {len(kws)} 词 × {a.pages} 页 = {len(targets)} 次导航")
    try:
        ensure_tab()
        res = search_round(targets)
    except Exception as e:
        print(f"✗ {e}", file=sys.stderr); return 2

    agg, total = {}, 0
    for t in targets:
        kw = t["kw"]
        rows = res.get(t["key"], [])
        for r in rows:
            r["keyword"] = kw; r["page"] = t["page"]
        prev = agg.get(kw, [])
        seen = {x["bvid"] for x in prev}
        agg[kw] = prev + [r for r in rows if r["bvid"] not in seen]
    allp = os.path.join(a.out, f"round{a.round}-all.json")
    if a.resume and os.path.exists(allp):
        with open(allp, encoding="utf-8") as f:
            old = json.load(f)
        old.update(agg); agg = old
    for kw, rows in agg.items():
        total += len(rows)
        with open(os.path.join(a.out, f"round{a.round}-{slug(kw)}.json"), "w",
                  encoding="utf-8") as f:
            json.dump(rows, f, ensure_ascii=False, indent=1)
    with open(allp, "w", encoding="utf-8") as f:
        json.dump(agg, f, ensure_ascii=False, indent=1)
    uniq = {r["bvid"] for rows in agg.values() for r in rows}
    print(f"✓ {len(agg)} 词 / {total} 条 / 去重 {len(uniq)} 个视频 → {allp}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
