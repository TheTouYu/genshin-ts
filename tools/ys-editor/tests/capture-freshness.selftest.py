#!/usr/bin/env python3
"""capture-freshness.selftest.py — `ys-capture latest` 帧新鲜度契约的**只读**回归。

## 为什么有它（2026-10-23，`.03` + `.04` 两轮采集各烧 ~15 分钟）

`latest` 抓完帧**不标**「这帧可不可信」，调用方只能猜，于是猜错两次：
  · 2.2s 内连 3 次 grab 拿到**同一 `src`**、`age_ms` 只有 8–83ms（帧是新的、内容确实没变）
    ⇒ 被解释成「渲染慢」，加 sleep 到 3.6s，6 轮 × 3 分钟全无效；
  · 另有 `seq` 涨而 `src`/`crc` 不变（daemon 复用帧），症状伪装成「渲染慢」。
判据必须三联：`src` / `seq` / `age_ms`——单个 `src` 不变**证明不了**任何事。

## 本测试守什么（只读：不启动/不重启守护、不写 state、不碰屏幕）

  T1 回执结构：顶层 `src` + `frame.{seq,age_ms,crc32}` 必须存在（三联判据的读数基础）；
  T2 闸门真的拦：`--max-age-ms 0` ⇒ rc=8 `STALE_FRAME`，且**不回传帧路径**
     （拦了就别递帧：否则调用方拿到 stale 帧照样能用）；
  T3 反方向不误拦：`--max-age-ms 999999` ⇒ rc=0 且 `age_ms` < 阈值（闸门不能恒红）；
  T4 连读 5 次：`seq` 单调不减、每次 `age_ms` < 2000（age 有界，才谈得上「现在」）；
  T5 观测面：`status` 必须有 `last_err` / `seq` / `channel`（失败不许静默）。

## 明确不测（契约缺口，**尚未实现**，见 task-1 交付报告）

`fresh:bool`、`--deadline` 重抓、`--max-age`（原始 spec）与既有 `--max-age-ms` 的命名单一源、
rc=9。**不为不存在的东西留绿灯**：探测到 `fresh` 出现时打 `[GAP-CLOSED]` 提示去收缺口，不判红。

守护不在 / 测试期间被重启 ⇒ `BLOCKED`（rc=2），不当成被测代码报红：
本机同一时刻可能有别的会话在改 `ys_capture.py` 并重启守护，那不是本契约的故障。

用法：python3 tools/ys-editor/tests/capture-freshness.selftest.py
退出码：0 PASS / 1 FAIL / 2 BLOCKED
末行机读：CAPTURE-FRESHNESS-RESULT pass=<n> fail=<m> verdict=PASS|FAIL|BLOCKED
"""
import json
import os
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))))
CLI = os.path.join(REPO, 'tools', 'ys-editor', 'ys-capture')
TIMEOUT_S = 20
RUNS = 5
AGE_BOUND_MS = 2000          # 超过这个 age 的帧不该被任何闭环当"现在"
GATE_BOUND_MS = 999999       # T3 用的宽阈值：只要闸门不是恒红即可

PASS = 0
FAIL = 0
BLOCK = ''                   # 非空 ⇒ BLOCKED，值是原因


def ck(name, cond, detail=''):
    global PASS, FAIL
    tail = f'  {detail}' if detail else ''
    if cond:
        PASS += 1
        print(f'  ✓ {name}{tail}')
    else:
        FAIL += 1
        print(f'  ✗ {name}{tail}')
    return bool(cond)


def note(msg):
    print(f'  · {msg}')


def run(args):
    """跑 CLI，返回 (rc, stdout, stderr)；超时按 rc=124（不阻塞门禁）。"""
    try:
        p = subprocess.run([CLI] + args, capture_output=True, text=True, timeout=TIMEOUT_S)
        return p.returncode, p.stdout.strip(), p.stderr.strip()
    except subprocess.TimeoutExpired:
        return 124, '', f'timeout>{TIMEOUT_S}s'


def jload(s):
    try:
        d = json.loads(s)
    except (ValueError, TypeError):
        return None
    return d if isinstance(d, dict) else None


def daemon_epoch():
    """守护启动时刻（只用于识别"测试期间被重启"，识别不到返回 ''）。"""
    try:
        p = subprocess.run(['systemctl', '--user', 'show',
                            '-p', 'ActiveEnterTimestampMonotonic', '--value', 'ys-capture'],
                           capture_output=True, text=True, timeout=5)
        return p.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return ''


def frame_of(d):
    f = (d or {}).get('frame')
    return f if isinstance(f, dict) else {}


def structure_ok(d, label):
    """T1：三联判据的读数基础。返回 (ok, 描述)。"""
    f = frame_of(d)
    missing = [k for k in ('seq', 'age_ms', 'crc32') if k not in f]
    ok = bool(d.get('src')) and not missing
    detail = (f"src={d.get('src')!r} seq={f.get('seq')} age_ms={f.get('age_ms')} "
              f"crc32={f.get('crc32')!r}")
    if missing:
        detail += f' 缺 frame{{{",".join(missing)}}}'
    return ck(f'{label} 回执含 src + frame.{{seq,age_ms,crc32}}', ok, detail)


def main():
    global BLOCK
    print('══ 抓帧新鲜度契约自测（只读，不重启守护） ══')
    print(f'  cli={CLI}')

    # ── 前置：守护必须在。不在就是 BLOCKED，不是被测代码的错。
    rc_s0, out_s0, err_s0 = run(['status'])
    st0 = jload(out_s0)
    if rc_s0 != 0 or not st0 or not st0.get('daemon_alive'):
        BLOCK = (f'守护未运行（status rc={rc_s0}, daemon_alive='
                 f'{(st0 or {}).get("daemon_alive")}）—— 先 `ys-capture serve&` 再跑')
        print(f'  ⚠ {BLOCK}')
        return blocked()
    epoch0 = daemon_epoch()
    note(f'status#1 seq={state_of(st0).get("seq")} channel={state_of(st0).get("channel")!r} '
         f'audit.verdict={audit_of(st0).get("verdict")!r} '
         f'stale_events={state_of(st0).get("stale_events")}')

    # ── T1 结构：先取一次（rc=8 属"闸门正常拦"，不是结构缺陷，但就没有回执结构可验）
    rc, out, err = run(['latest'])
    d = jload(out)
    if rc == 7:
        BLOCK = f'latest rc=7 DAEMON_DOWN: {out[:200] or err[:200]}'
        print(f'  ⚠ {BLOCK}')
        return blocked()
    if rc == 0 and d:
        structure_ok(d, 'T1')
        if 'fresh' in d:
            note(f'[GAP-CLOSED] 顶层已有 fresh={d.get("fresh")!r} —— '
                 'fresh/--deadline/--max-age/rc=9 缺口清单该收了')
        else:
            note('[GAP] 顶层无 fresh 字段（契约缺口，未实现，不计入 FAIL）')
        gap_full = d
    elif rc == 8:
        note(f'T1 跳过：默认闸门就拦了（rc=8 {out[:120]}）—— 屏幕没出新帧，结构无从验')
        gap_full = None
    else:
        ck('T1 latest 正常返回（rc=0）', False, f'rc={rc} out={out[:200]} err={err[:200]}')
        gap_full = None

    # ── T2 闸门真的拦：--max-age-ms 0 ⇒ rc=8，且**不能**递帧
    rc0, out0, err0 = run(['latest', '--max-age-ms', '0'])
    d0 = jload(out0)
    ck('T2a --max-age-ms 0 ⇒ rc=8', rc0 == 8, f'rc={rc0} out={out0[:160]}')
    ck('T2b 错误码是 STALE_FRAME', bool(d0) and d0.get('error') == 'STALE_FRAME',
       f'error={(d0 or {}).get("error")!r}')
    ck('T2c 被拦时不回传帧路径（拦了就别递帧）',
       bool(d0) and 'path' not in d0 and d0.get('pixels_returned') is not True,
       f'path={(d0 or {}).get("path")!r} pixels_returned={(d0 or {}).get("pixels_returned")!r}')

    # ── T3 反方向不误拦（否则闸门恒红 = 另一个假绿）
    rcw, outw, errw = run(['latest', '--max-age-ms', str(GATE_BOUND_MS)])
    dw = jload(outw)
    ck(f'T3a --max-age-ms {GATE_BOUND_MS} ⇒ rc=0', rcw == 0, f'rc={rcw} out={outw[:160]}')
    age_w = frame_of(dw).get('age_ms')
    ck(f'T3b age_ms 远小于阈值（<{GATE_BOUND_MS}）',
       isinstance(age_w, int) and 0 <= age_w < GATE_BOUND_MS, f'age_ms={age_w!r}')

    # ── T4 连读 5 次：seq 单调不减 + age 有界
    samples = []
    for i in range(RUNS):
        rc, out, _ = run(['latest'])
        if rc == 7:
            BLOCK = f'第 {i + 1} 次 latest rc=7 DAEMON_DOWN（守护中途退出）'
            print(f'  ⚠ {BLOCK}')
            return blocked()
        d = jload(out) if rc == 0 else None
        if d:
            samples.append(frame_of(d))
        else:
            note(f'连读#{i + 1} 未拿到帧（rc={rc} {out[:80]}）')
    ck(f'T4a 连读 {RUNS} 次里成功 ≥2 次', len(samples) >= 2, f'成功 {len(samples)}/{RUNS}')
    seqs = [s.get('seq') for s in samples]
    ages = [s.get('age_ms') for s in samples]
    decreases = [(seqs[i - 1], seqs[i]) for i in range(1, len(seqs))
                 if isinstance(seqs[i - 1], int) and isinstance(seqs[i], int)
                 and seqs[i] < seqs[i - 1]]
    if decreases:
        epoch1 = daemon_epoch()
        restarted = bool(epoch0) and bool(epoch1) and epoch0 != epoch1
        if restarted:
            note(f'[RESTART] 测试期间守护被重启（epoch {epoch0}→{epoch1}）：'
                 f'seq 回落 {decreases} 属环境，不判红')
            BLOCK = '测试期间守护被重启（另有会话在操作 ys-capture），seq 单调性不可判'
        else:
            ck('T4b seq 单调不减', False, f'回落 {decreases} 且未见重启证据')
    else:
        ck('T4b seq 单调不减', True, f'seq={seqs}')
        if len(set(seqs)) == 1:
            note(f'[WARN] 连读 {len(seqs)} 次 seq 恒为 {seqs[0]}（age_ms 却在涨 {ages}）'
                 '：这是"daemon 复用同一帧"的症状——非递减判据能过，但**不能**据此认为'
                 '画面在刷新；调用方要判"内容变没变"还得看 content/crc，或等 fresh 契约落地')
    ck(f'T4c 每次 age_ms 有界（<{AGE_BOUND_MS}）',
       bool(ages) and all(isinstance(a, int) and 0 <= a < AGE_BOUND_MS for a in ages),
       f'age_ms={ages}')
    if 'fresh' not in (gap_full or {}) and samples:
        note('[GAP] 连读回执里同样没有 fresh:bool —— 调用方仍须自己比 src/seq/age_ms 三连')

    # ── T5 观测面：status 必须能说出「哪坏了」
    rc_s1, out_s1, err_s1 = run(['status'])
    st1 = jload(out_s1)
    stt = state_of(st1)
    ck('T5a status rc=0 且 daemon_alive', rc_s1 == 0 and bool((st1 or {}).get('daemon_alive')),
       f'rc={rc_s1} err={err_s1[:120]}')
    ck('T5b status 有 last_err（空串=无错）',
       isinstance(stt.get('last_err'), str), f'last_err={stt.get("last_err")!r}')
    ck('T5c status 有 seq', isinstance(stt.get('seq'), int), f'seq={stt.get("seq")!r}')
    ck('T5d status 有 channel', isinstance(stt.get('channel'), str) and bool(stt.get('channel')),
       f'channel={stt.get("channel")!r}')
    note(f'status#2 seq={stt.get("seq")} channel={stt.get("channel")!r} '
         f'audit.verdict={audit_of(st1).get("verdict")!r} '
         f'stale_events={stt.get("stale_events")} '
         f'kwin_fallback={stt.get("kwin_fallback")}')

    return report()


def state_of(d):
    s = (d or {}).get('state')
    return s if isinstance(s, dict) else {}


def audit_of(d):
    a = state_of(d).get('audit')
    return a if isinstance(a, dict) else {}


def blocked():
    print(f'CAPTURE-FRESHNESS-RESULT pass={PASS} fail={FAIL} verdict=BLOCKED')
    print(f'  BLOCKED: {BLOCK}')
    return 2


def report():
    verdict = 'PASS' if FAIL == 0 else 'FAIL'
    print(f'CAPTURE-FRESHNESS-RESULT pass={PASS} fail={FAIL} verdict={verdict}')
    return 0 if FAIL == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
