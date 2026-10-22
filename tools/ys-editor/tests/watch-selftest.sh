#!/usr/bin/env bash
# 自测/门禁用：绕过屏幕占用契约（生产调用路径不许设；真实占用必须先在对话里申请）
export YS_SLOT_TEST=1
# watch-selftest.sh — 变化监听层（tools/ys-watch）离线自测
#
# 纪律：
#   * **全部离线读 fixtures，不碰活体桌面**（不点/不抢焦点/不抓真屏/不进槽）。
#   * `--live` 用**桩抓帧命令**（把真实帧按次序 cp 到 {out}）驱动，所以"每隔几秒抓一帧"
#     这条活体链本身也被测到了，但一个像素都没从桌面取。
#   * 素材只读：`tools/ys-editor/tests/fixtures/unknown/` 的帧**不做任何修改**；
#     需要"同一位置文字变了"的帧对时，在 $TMP 里**派生**一份并把改了什么写在 NOTE 里
#     （见 §派生帧），派生帧不进仓库、不冒充真实证据。
#   * 每条断言失败都打印「期望 vs 实测」，不吞诊断；机读行为最后一行：
#       WATCH-RESULT cases=<n> assert=<n> pass=<n> fail=<n> derived=<n> verdict=PASS|FAIL
#
# 用法：bash tools/ys-editor/tests/watch-selftest.sh [--only <case>]
#   case ∈ claim | same | score | timer | numbers | hud | hud_raw | autoroi_real | noocr |
#          fullframe | multiframe | live | d_text | d_time | err_frame | err_roi | err_live |
#          err_noroi | err_roi_cnt | err_ocr | err_size
#   --only 是给**注入用例**用的：造一次故障只跑受影响的那一条用例（无参数 = 全跑，行为不变）。
# 退出码：0 = 全 PASS / 1 = 有断言失败 / 2 = 环境缺件（工具、帧或 python3+pillow 缺失）/ 3 = 用法错
# 耗时：本机 ~20~40s（RapidOCR 子进程冷启动 + 若干 2560×1440 解码是固定开销，CPU 争抢时会翻倍）；
#       本测试自用空缓存目录，跑第二遍同样冷——**不做热跑取巧**，因为首跑成本就是实战成本。
set -uo pipefail

ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --only) ONLY="${2:-}"; shift 2 ;;
    *) printf 'WATCH-SELFTEST-USAGE 未知参数 %s（用法: [--only <case>]）\n' "$1" >&2; exit 3 ;;
  esac
done
WATCH_CASES=" claim same score timer numbers hud hud_raw autoroi_real noocr fullframe
multiframe live d_text d_time err_frame err_roi err_live err_noroi err_roi_cnt err_ocr err_size "
WATCH_CASES=$(printf '%s' "$WATCH_CASES" | tr -s ' \n' ' ')
if [ -n "$ONLY" ]; then
  case "$WATCH_CASES" in
    *" $ONLY "*) ;;
    *) printf 'WATCH-SELFTEST-USAGE 未知 --only 用例 %s（可选:%s）\n' "$ONLY" "$WATCH_CASES" >&2
       exit 3 ;;
  esac
fi
want(){ [ -z "$ONLY" ] || [ "$ONLY" = "$1" ]; }   # 无 --only ⇒ 全部 want 成立（默认行为不变）

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$HERE/../../.." && pwd)
FIX="$ROOT/tools/ys-editor/tests/fixtures/unknown"
YS="$ROOT/tools/ys-watch"
FONT=/usr/share/fonts/noto-cjk/NotoSansCJK-Bold.ttc

TMP=$(mktemp -d "${TMPDIR:-/tmp}/ys-watch-selftest.XXXXXX")
trap 'rm -rf "$TMP"' EXIT

# 缓存隔离：自测自己用一份空缓存，避免被仓库里已有的热缓存"骗"成快跑
export YS_WATCH_CACHE_DIR="$TMP/ocr-cache"

CLAIM_BEFORE="$FIX/claim-before.png"
CLAIM_AFTER="$FIX/claim-after.png"
EVENTS="$FIX/events-teams.png"
REWARD="$FIX/reward-panel.png"
BATTLE="$FIX/battle-report.png"
SETTLE="$FIX/settle-success.png"

[ -x "$YS" ] || { echo "FAIL 前置：$YS 不存在或不可执行（期望：可执行；实测：缺失）" >&2; exit 2; }
[ -d "$FIX" ] || { echo "FAIL 前置：fixtures 目录缺失 $FIX" >&2; exit 2; }
for f in "$CLAIM_BEFORE" "$CLAIM_AFTER" "$EVENTS" "$REWARD" "$BATTLE" "$SETTLE"; do
  [ -f "$f" ] || { echo "FAIL 前置：帧缺失 $f" >&2; exit 2; }
done
python3 -c 'import PIL, numpy' 2>/dev/null || {
  echo "FAIL 前置：python3 缺 pillow/numpy（ys-watch 的像素层依赖）" >&2; exit 2; }

echo "== ys-watch selftest =="
echo "   工具: $YS"
echo "   帧:   $FIX"
echo "   桌面: 不使用（凡 ${DISPLAY:-<无 DISPLAY>} 都不碰；--live 用桩抓帧命令）"

# --------------------------------------------------------------------------- 派生帧
# 真实帧里**没有**「同一位置文字/时间变了」的成对素材：claim 只有 有→无，settle 只有 出现。
# 而"倒计时 00:42→00:31"和"领取→已领取"正是用户投诉里点名要抓的两类变化，
# 所以这里从真实帧**派生**两份，只改目标像素，其余整帧原样，改法逐字写在下面。
DERIVED=0
if [ -f "$FONT" ]; then
  if python3 - "$FIX" "$TMP" "$FONT" <<'PY'
import sys
from PIL import Image, ImageDraw, ImageFont
fix, tmp, font = sys.argv[1], sys.argv[2], sys.argv[3]
# D1：倒计时 00:42 → 00:31（battle-report.png 的计时器区）
im = Image.open(fix + '/battle-report.png').convert('RGB')
dr = ImageDraw.Draw(im)
dr.rectangle([1212, 283, 1402, 360], fill=(72, 63, 68))            # 盖掉原计时器
dr.text((1307, 321), '00:31', font=ImageFont.truetype(font, 46),   # 写新时间
        fill=(215, 211, 213), anchor='mm')
im.save(tmp + '/derived-timer-0031.png')
# D2：领取 → 已领取（claim-before.png 的第二个按钮）
im = Image.open(fix + '/claim-before.png').convert('RGB')
dr = ImageDraw.Draw(im)
dr.rounded_rectangle([1736, 570, 1872, 610], radius=18, fill=(178, 74, 58))
dr.text((1804, 590), '已领取', font=ImageFont.truetype(font, 30),
        fill=(246, 240, 232), anchor='mm')
im.save(tmp + '/derived-claimed.png')
sys.exit(0)
PY
  then DERIVED=1; fi
fi
echo "   派生帧: $([ "$DERIVED" = 1 ] && echo "2 份（d_time / d_text；改法见脚本注释）" || echo '无字体，跳过 2 个用例')"

# --------------------------------------------------------------------------- 跑用例
run_case() {
  local name=$1; shift
  local t0 t1
  t0=$(date +%s%N)
  "$YS" "$@" --json-out "$TMP/$name.json" >"$TMP/$name.out" 2>"$TMP/$name.err"
  local rc=$?
  t1=$(date +%s%N)
  echo "$rc" >"$TMP/$name.rc"
  echo $(( (t1 - t0) / 1000000 )) >"$TMP/$name.ms"
  return 0
}

# 实时采样桩：第 N 次调用把清单第 N 张真实帧 cp 到 {out}
cat >"$TMP/stub-capture.sh" <<'EOF'
#!/bin/sh
set -e
D=$(dirname "$0")
N=$(cat "$D/stub-state" 2>/dev/null || echo 1)
cp "$(sed -n "${N}p" "$D/stub-list.txt")" "$1"
echo $((N + 1)) >"$D/stub-state"
EOF
chmod +x "$TMP/stub-capture.sh"
printf '%s\n' "$CLAIM_BEFORE" "$CLAIM_AFTER" "$CLAIM_AFTER" >"$TMP/stub-list.txt"

want claim       && run_case claim       --frames "$CLAIM_BEFORE" "$CLAIM_AFTER" --roi 1650,400,300,220
want same        && run_case same        --frames "$CLAIM_AFTER" "$CLAIM_AFTER" --roi 1650,400,300,220
want score       && run_case score       --frames "$EVENTS" "$REWARD" --roi 2000,900,400,140
want timer       && run_case timer       --frames "$BATTLE" "$SETTLE" --roi 1150,270,340,110
want numbers     && run_case numbers     --frames "$BATTLE" "$SETTLE" --roi 1180,780,820,340
# HUD 叠加层（DXVK/FPS/GPU/耗时/UID）每帧都在抖：默认必须当作噪声吞掉，且**可被关掉验证**
want hud         && run_case hud         --frames "$EVENTS" "$REWARD" --roi 0,0,260,90
want hud_raw     && run_case hud_raw     --frames "$EVENTS" "$REWARD" --roi 0,0,260,90 --no-default-ignore
want autoroi_real && run_case autoroi_real --frames "$CLAIM_BEFORE" "$CLAIM_AFTER" --auto-roi --no-ocr
want noocr       && run_case noocr       --frames "$CLAIM_BEFORE" "$CLAIM_AFTER" --roi 1650,400,300,220 --no-ocr
want fullframe   && run_case fullframe   --frames "$CLAIM_BEFORE" "$CLAIM_AFTER" --full-frame --no-ocr
want multiframe  && run_case multiframe  --frames "$CLAIM_BEFORE" "$CLAIM_AFTER" "$CLAIM_AFTER" --roi 1650,400,300,220
rm -f "$TMP/stub-state"
want live        && run_case live        --live 3 --capture-cmd "$TMP/stub-capture.sh {out}" \
                     --roi 1650,400,300,220 --interval 0
if [ "$DERIVED" = 1 ]; then
  want d_text    && run_case d_text    --frames "$CLAIM_BEFORE" "$TMP/derived-claimed.png" --auto-roi
  want d_time    && run_case d_time    --frames "$BATTLE" "$TMP/derived-timer-0031.png" --roi 1150,270,340,110
fi
# 错误路径：退出码 + 机读 token（契约 §3ter：失败要能 grep 到）
want err_frame   && run_case err_frame   --frames "$TMP/不存在.png" "$CLAIM_AFTER" --no-ocr
want err_roi     && run_case err_roi     --frames "$CLAIM_BEFORE" "$CLAIM_AFTER" --roi 1,2,3 --no-ocr
want err_live    && run_case err_live    --live 3
want err_noroi   && run_case err_noroi   --frames "$CLAIM_BEFORE" "$CLAIM_AFTER" --no-ocr
want err_roi_cnt && run_case err_roi_cnt --frames "$CLAIM_BEFORE" "$CLAIM_AFTER" --roi 1650,400,300,220 \
                     --roi 0,0,100,100 --no-ocr
if want err_size; then
python3 -c "from PIL import Image; Image.new('RGB', (100, 100)).save('$TMP/small.png')"
run_case err_size    --frames "$CLAIM_BEFORE" "$TMP/small.png" --roi 10,10,20,20 --no-ocr
fi
if want err_ocr; then
YS_RAPIDOCR_PY=/nonexistent/venv/bin/python "$YS" --frames "$CLAIM_BEFORE" "$CLAIM_AFTER" \
  --roi 1650,400,300,220 >"$TMP/err_ocr.out" 2>"$TMP/err_ocr.err"
echo "$?" >"$TMP/err_ocr.rc"
fi

# --------------------------------------------------------------------------- 断言
python3 - "$TMP" "${DERIVED}" "$ONLY" <<'PY' >"$TMP/checks.txt"
import json
import os
import sys

TMP, DERIVED = sys.argv[1], sys.argv[2] == '1'
ONLY = (sys.argv[3] if len(sys.argv) > 3 else '').strip()   # '' = 全跑（默认）
KINDS = {'color_delta', 'time_changed', 'number_changed', 'text_changed',
         'text_removed', 'text_added'}
CHECKS = []


def chk(name, ok, expect, actual):
    CHECKS.append((name, bool(ok), expect, actual))


def load(name):
    p = os.path.join(TMP, name + '.json')
    try:
        with open(p, encoding='utf-8') as f:
            txt = f.read()
    except OSError:
        return None, '（无 JSON：%s 不存在）' % name
    if name == 'live':
        out = []
        for line in txt.strip().splitlines():
            line = line.strip()
            if line:
                out.append(json.loads(line))
        return out, None
    return json.loads(txt), None


def rc(name):
    p = os.path.join(TMP, name + '.rc')
    try:
        with open(p) as f:
            return int(f.read().strip())
    except (OSError, ValueError):
        return -1


def read(name, ext):
    p = os.path.join(TMP, '%s.%s' % (name, ext))
    try:
        with open(p, encoding='utf-8') as f:
            return f.read()
    except OSError:
        return ''


def events(doc):
    return doc['pairs'][0]['events'] if doc and doc.get('pairs') else []


def kinds(doc):
    return [e['kind'] for e in events(doc)]


# ---- A. 领奖前后：颜色占比 + 平均 Δ + 两个「领取」消失（真实帧，账本同尺） -----------
doc, err = load('claim')
chk('A1 领奖前后 verdict', doc and doc['pairs'][0]['verdict'] == 'CHANGED',
    'CHANGED', '(无 JSON)' if err else doc['pairs'][0]['verdict'])
cd = doc['pairs'][0]['color_delta'] if doc else {}
chk('A2 变化像素占比 ≈ 69.8%', abs(cd.get('pixels_changed_pct', -1) - 69.8) <= 1.0,
    '69.8±1.0', cd.get('pixels_changed_pct'))
chk('A3 平均 Δ ≈ 91（0..765 口径）', abs(cd.get('mean_delta', -1) - 91) <= 3,
    '91±3', cd.get('mean_delta'))
removed = [e for e in events(doc) if e['kind'] == 'text_removed' and e['text'] == '领取']
chk('A4 「领取」消失 ×2', len(removed) == 2, '2 条', '%d 条' % len(removed))
positions = sorted((e['cx'], e['cy']) for e in removed)
ok_pos = len(positions) == 2 and all(abs(cx - 1789) <= 20 for cx, _ in positions) and \
    abs(positions[0][1] - 430) <= 20 and abs(positions[1][1] - 590) <= 20
chk('A5 两个「领取」坐标 (1789,430)/(1789,590)', ok_pos,
    '[(1789,430),(1789,590)]±20', positions)
chk('A6 没有误报「领取」新增',
    not any(e['kind'] == 'text_added' and e['text'] == '领取' for e in events(doc)),
    '0 条 text_added 领取',
    [e['text'] for e in events(doc) if e['kind'] == 'text_added'])
r = doc['pairs'][0]['roi'] if doc else {}
chk('A7 ROI 原样回显 explicit', r.get('source') == 'explicit' and
    (r.get('x'), r.get('y'), r.get('w'), r.get('h')) == (1650, 400, 300, 220),
    'explicit 1650,400,300,220', (r.get('source'), r.get('x'), r.get('y'), r.get('w'), r.get('h')))

# ---- B. 同帧 NO-CHANGE：明确说出来，且不花 OCR --------------------------------------
doc, err = load('same')
p = doc['pairs'][0] if doc else {}
chk('B1 同帧 verdict', p.get('verdict') == 'NO-CHANGE', 'NO-CHANGE', p.get('verdict'))
chk('B2 同帧 sha 相等', bool(p) and p.get('sha_from') == p.get('sha_to'),
    '两个 sha 相等', (p.get('sha_from', '')[:16], p.get('sha_to', '')[:16]))
chk('B3 同帧 事件 0 条', len(p.get('events', [])) == 0, '0 条', len(p.get('events', [])))
chk('B4 同帧不花 OCR（快路）', doc and doc['timing']['ocr_calls'] == 0,
    'ocr_calls=0', doc['timing']['ocr_calls'] if doc else '?' )

# ---- C. 预测评分 5200 → 15070（真实帧 events-teams / reward-panel） ----------------
doc, _ = load('score')
nc = [e for e in events(doc) if e['kind'] == 'number_changed']
hit = [e for e in nc if e['from'] == ['5200'] and e['to'] == ['15070']]
chk('C1 数值变化 5200→15070', len(hit) == 1, '1 条', [(e['from'], e['to']) for e in nc])
chk('C2 该数值变化在被测位置', bool(hit) and abs(hit[0]['cx'] - 2128) <= 25 and
    abs(hit[0]['cy'] - 958) <= 20, '(2128,958)±25', hit[0]['cx'] if hit else '无')
chk('C3 数值变化 change=value', bool(hit) and hit[0]['change'] == 'value', 'value',
    hit[0]['change'] if hit else '无')

# ---- D. 倒计时 00:42 消失（真实帧 battle-report / settle-success） -------------------
doc, _ = load('timer')
tc = [e for e in events(doc) if e['kind'] == 'time_changed']
chk('D1 时间变化 00:42 消失',
    any(e['from'] == ['00:42'] and e['to'] == [] and e['change'] == 'vanished' for e in tc),
    "from=['00:42'] to=[] vanished", [(e['from'], e['to'], e['change']) for e in tc])
chk('D2 时间变化带位置', bool(tc) and abs(tc[0]['cx'] - 1308) <= 25, '1308±25',
    tc[0]['cx'] if tc else '无')
chk('D3 原始文字「00:42」也报了消失',
    any(e['kind'] == 'text_removed' and e['text'] == '00:42' for e in events(doc)),
    '1 条 text_removed 00:42', kinds(doc))

# ---- E. 结算数字 35 / 315 / 7秒后继续 / 预测成功（真实帧） --------------------------
doc, _ = load('numbers')
nc = [e for e in events(doc) if e['kind'] == 'number_changed']
chk('E1 结算数字 35 出现', any(e['to'] == ['35'] and e['change'] == 'appeared' for e in nc),
    "to=['35'] appeared", [(e['from'], e['to']) for e in nc])
chk('E2 结算数字 315 出现', any(e['to'] == ['315'] for e in nc), "to=['315']",
    [(e['from'], e['to']) for e in nc])
chk('E3 倒计时「7秒后继续」抽出 7',
    any(e['to'] == ['7'] and e['text_to'] == '7秒后继续' for e in nc),
    "to=['7'] text_to=7秒后继续", [(e['to'], e['text_to']) for e in nc])
chk('E4 文字「预测成功」出现',
    any(e['kind'] == 'text_added' and e['text'] == '预测成功' for e in events(doc)),
    '1 条 text_added 预测成功', kinds(doc))
noise = [e for e in events(doc)
         if any(t in json.dumps(e, ensure_ascii=False) for t in ('ms', 'FPS', 'GPU', 'DXVK', 'UID'))]
chk('E5 HUD 噪声（ms/FPS/GPU/UID）未进事件', len(noise) == 0, '0 条', len(noise))

# ---- E6/E7. HUD 叠加层：直接把 ROI 压在抖动最凶的角落 ---------------------------------
doc, _ = load('hud')
hud_num = [e for e in events(doc) if e['kind'] == 'number_changed']
chk('E6 HUD 角落 ROI：抖动数值不产出 number_changed', len(hud_num) == 0, '0 条',
    [(e['from'], e['to'], e['text_to']) for e in hud_num])
chk('E7 HUD 角落 ROI：被忽略的 token 照实列出（不静默吞）',
    doc and doc['pairs'][0]['slots']['ignored_before'] and
    any('FPS' in t or 'GPU' in t or 'DXVK' in t for t in doc['pairs'][0]['slots']['ignored_before']),
    'ignored_before 含 FPS/GPU/DXVK', doc['pairs'][0]['slots']['ignored_before'] if doc else '?')
doc_raw, _ = load('hud_raw')
raw_num = [e for e in events(doc_raw) if e['kind'] == 'number_changed']
chk('E8 --no-default-ignore 时同一 ROI 的抖动数值确实会冒出来（证明是过滤在起作用）',
    len(raw_num) >= 2, '≥2 条 number_changed', len(raw_num))

# ---- F. --auto-roi：不给 ROI 也能定位到变化区（真实帧，只跑颜色层） -----------------
doc, _ = load('autoroi_real')
p = doc['pairs'][0] if doc else {}
ar = p.get('auto_roi') or {}
bb = ar.get('bbox')
inside = bool(bb) and bb[0] >= 0 and bb[1] >= 0 and bb[2] <= 2560 and bb[3] <= 1440
chk('F1 auto-roi 命中（ROI 由工具定）', p.get('roi', {}).get('source') == 'auto', 'auto',
    p.get('roi', {}).get('source'))
chk('F2 auto-roi bbox 在帧内', inside, '0≤x,y 且 x2≤2560,y2≤1440', bb)
area_ratio = (bb[2] - bb[0]) * (bb[3] - bb[1]) / (2560.0 * 1440.0) if inside else 1.0
chk('F3 auto-roi 面积 < 整帧 50%', area_ratio < 0.5, '<0.5', round(area_ratio, 3))
chk('F4 auto-roi 给前三块砖读数', len(ar.get('top_tiles') or []) == 3, '3 块',
    len(ar.get('top_tiles') or []))
chk('F5 --no-ocr 下不调 OCR', doc and doc['timing']['ocr_calls'] == 0, '0 次',
    doc['timing']['ocr_calls'] if doc else '?')

# ---- G. --no-ocr：只做颜色层，并显式说明没查文字 ------------------------------------
doc, _ = load('noocr')
p = doc['pairs'][0] if doc else {}
chk('G1 --no-ocr 不调 OCR', doc and doc['timing']['ocr_calls'] == 0, '0 次', 
    doc['timing']['ocr_calls'] if doc else '?')
chk('G2 --no-ocr 颜色层仍准（69.8%）',
    abs(p.get('color_delta', {}).get('pixels_changed_pct', -1) - 69.8) <= 1.0, '69.8±1.0',
    p.get('color_delta', {}).get('pixels_changed_pct'))
chk('G3 --no-ocr 标注未检查文字', '--no-ocr' in (p.get('note') or ''), 'note 含 --no-ocr',
    p.get('note'))
chk('G4 --no-ocr 只产出 color_delta', set(kinds(doc)) <= {'color_delta'}, "{'color_delta'}",
    sorted(set(kinds(doc))))

# ---- H. --full-frame：允许但必须打警告 ----------------------------------------------
doc, _ = load('fullframe')
rq = doc.get('roi_request', {}) if doc else {}
chk('H1 full-frame 标 source=full', rq.get('source') == 'full', 'full', rq.get('source'))
chk('H2 full-frame 带背景动效警告', '背景动效' in (rq.get('warning') or ''), '含「背景动效」',
    rq.get('warning'))

# ---- I. 多帧：相邻两两比较（3 帧 → 2 对） ------------------------------------------
doc, _ = load('multiframe')
chk('I1 3 帧 → 2 对', doc and len(doc['pairs']) == 2, '2 对',
    len(doc['pairs']) if doc else '?')
chk('I2 第 1 对 CHANGED', doc and doc['pairs'][0]['verdict'] == 'CHANGED', 'CHANGED',
    doc['pairs'][0]['verdict'] if doc else '?')
chk('I3 第 2 对 NO-CHANGE', doc and doc['pairs'][1]['verdict'] == 'NO-CHANGE', 'NO-CHANGE',
    doc['pairs'][1]['verdict'] if doc else '?')
chk('I4 帧清单 3 张且 2、3 同 sha', doc and len(doc['frames']) == 3 and
    doc['frames'][1]['sha256'] == doc['frames'][2]['sha256'], 'len=3 且 sha2=sha3',
    len(doc['frames']) if doc else '?')

# ---- J. --live：桩抓帧命令驱动，事件**流式**出来 -----------------------------------
ok_rc = rc('live') == 0
chk('J1 live 退出码', ok_rc, '0', rc('live'))
out = read('live', 'out')
chk('J2 live 机读汇总行', 'WATCH-SUMMARY pairs=2 changed=1 nochange=1' in out,
    'WATCH-SUMMARY pairs=2 changed=1 nochange=1',
    [ln for ln in out.splitlines() if ln.startswith('WATCH-SUMMARY')])
chk('J3 live 逐对 verdict 行', '[0→1] CHANGED' in out and '[1→2] NO-CHANGE' in out,
    '两行 verdict', [ln for ln in out.splitlines() if ln.startswith('[')])
nd = load('live')[0] or []
chk('J4 live NDJSON = 2 对 + 1 汇总', len(nd) == 3 and nd[-1].get('kind') == 'summary',
    '3 行（末行 summary）', '%d 行' % len(nd))
chk('J5 live 事件里点名「领取」',
    any(e['kind'] == 'text_removed' and e['text'] == '领取'
        for e in (nd[0]['events'] if nd else [])),
    'text_removed 领取', [e['kind'] for e in nd[0]['events']] if nd else '?')

# ---- K. 派生帧：领取 → 已领取（text_changed，且不误报"领取消失"） ------------------
if not DERIVED:
    for n in ('K1 领取→已领取 text_changed', 'K2 相似度 0.7~0.9',
              'K3 另一个「领取」没被误报消失', 'K4 auto-roi 框住按钮', 'K5 auto-roi 很窄'):
        chk(n, True, 'SKIP（无 CJK 字体，未派生帧）', 'skipped')
else:
    doc, _ = load('d_text')
    ev = events(doc)
    tch = [e for e in ev if e['kind'] == 'text_changed']
    hit = [e for e in tch if e['from'] == '领取' and e['to'] == '已领取']
    chk('K1 领取→已领取 text_changed', len(hit) == 1, '1 条',
        [(e['from'], e['to']) for e in tch])
    chk('K2 相似度 0.7~0.9', bool(hit) and 0.7 <= hit[0]['ratio'] <= 0.9, '0.7~0.9',
        hit[0]['ratio'] if hit else '无')
    chk('K3 另一个「领取」没被误报消失',
        not [e for e in ev if e['kind'] == 'text_removed' and e['text'] == '领取'],
        '0 条 text_removed 领取', kinds(doc))
    bb = (doc['pairs'][0].get('auto_roi') or {}).get('bbox') if doc else None
    chk('K4 auto-roi 框住按钮 (1789,590)',
        bool(bb) and bb[0] <= 1789 <= bb[2] and bb[1] <= 590 <= bb[3], 'bbox 含 (1789,590)', bb)
    ratio = ((bb[2] - bb[0]) * (bb[3] - bb[1]) / (2560.0 * 1440.0)) if bb else 1.0
    chk('K5 auto-roi 很窄（<5% 帧面积）', ratio < 0.05, '<0.05', round(ratio, 4))

# ---- L. 派生帧：倒计时 00:42 → 00:31 -----------------------------------------------
if not DERIVED:
    chk('L1 00:42→00:31 time_changed', True, 'SKIP（未派生帧）', 'skipped')
else:
    doc, _ = load('d_time')
    tc = [e for e in events(doc) if e['kind'] == 'time_changed']
    chk('L1 00:42→00:31 time_changed',
        any(e['from'] == ['00:42'] and e['to'] == ['00:31'] and e['change'] == 'value' for e in tc),
        "from=['00:42'] to=['00:31'] value", [(e['from'], e['to'], e['change']) for e in tc])

# ---- M. 错误路径：退出码 + 可 grep 的 token -----------------------------------------
chk('M1 帧不存在 rc=3 + WATCH-FRAME-UNREADABLE',
    rc('err_frame') == 3 and 'WATCH-FRAME-UNREADABLE' in read('err_frame', 'err'),
    'rc=3 且 stderr 有 token', (rc('err_frame'), read('err_frame', 'err')[:60]))
chk('M2 ROI 格式错 rc=3 + WATCH-ROI-INVALID',
    rc('err_roi') == 3 and 'WATCH-ROI-INVALID' in read('err_roi', 'err'),
    'rc=3 且 stderr 有 token', (rc('err_roi'), read('err_roi', 'err')[:60]))
chk('M3 --live 缺 --capture-cmd rc=2 + WATCH-USAGE-ERROR',
    rc('err_live') == 2 and 'WATCH-USAGE-ERROR' in read('err_live', 'err'),
    'rc=2 且 stderr 有 token', (rc('err_live'), read('err_live', 'err')[:60]))
chk('M4a 不给 ROI 也没 --full-frame ⇒ rc=2 且指路', rc('err_noroi') == 2 and
    'auto-roi' in read('err_noroi', 'err'), 'rc=2 且 stderr 给出三条路',
    (rc('err_noroi'), read('err_noroi', 'err')[:90]))
chk('M4b 多块 ROI 与帧对数不符 ⇒ rc=2（不静默忽略）', rc('err_roi_cnt') == 2 and
    '一一对应' in read('err_roi_cnt', 'err'), 'rc=2 且讲清一一对应',
    (rc('err_roi_cnt'), read('err_roi_cnt', 'err')[:90]))
chk('M4 OCR 后端缺失 rc=4 + WATCH-OCR-MISSING（fail-closed）',
    rc('err_ocr') == 4 and 'WATCH-OCR-MISSING' in read('err_ocr', 'err'),
    'rc=4 且 stderr 有 token', (rc('err_ocr'), read('err_ocr', 'err')[:60]))
chk('M5 帧尺寸不同 rc=3 且说明原因',
    rc('err_size') == 3 and '帧尺寸不同' in read('err_size', 'err'),
    'rc=3 且 stderr 讲清尺寸', (rc('err_size'), read('err_size', 'err')[:60]))

# ---- N. JSON 契约：可被下游当数据用 ------------------------------------------------
doc, _ = load('claim')
chk('N1 schema=ys-watch/1', doc and doc.get('schema') == 'ys-watch/1', 'ys-watch/1',
    doc.get('schema') if doc else '?')
chk('N2 顶层含 frames/pairs/timing/options',
    doc and all(k in doc for k in ('frames', 'pairs', 'timing', 'options')),
    'frames/pairs/timing/options',
    sorted(doc.keys()) if doc else '?')
shas = [f['sha256'] for f in doc['frames']] if doc else []
chk('N3 每帧有 64 位 sha256', len(shas) == 2 and all(len(s) == 64 for s in shas),
    '2 个 64 位 sha', [s[:16] for s in shas])
allk = set(kinds(doc)) if doc else set()
chk('N4 事件 kind 都在 6 类之内', allk and allk <= KINDS, '⊆ 6 类', sorted(allk))
point_ev = [e for e in events(doc) if e['kind'] != 'color_delta'] if doc else []
chk('N5 每条带位置的事件都有 cx/cy',
    bool(point_ev) and all(('cx' in e and 'cy' in e) for e in point_ev),
    '非 color_delta 事件均有 cx/cy', [e['kind'] for e in events(doc)])

# 断言名 → 用例名（供 --only 过滤；默认 ONLY='' 时这张表不参与任何逻辑）
CASE_OF = {
    'A1': 'claim', 'A2': 'claim', 'A3': 'claim', 'A4': 'claim', 'A5': 'claim',
    'A6': 'claim', 'A7': 'claim',
    'B1': 'same', 'B2': 'same', 'B3': 'same', 'B4': 'same',
    'C1': 'score', 'C2': 'score', 'C3': 'score',
    'D1': 'timer', 'D2': 'timer', 'D3': 'timer',
    'E1': 'numbers', 'E2': 'numbers', 'E3': 'numbers', 'E4': 'numbers', 'E5': 'numbers',
    'E6': 'hud', 'E7': 'hud', 'E8': 'hud_raw',
    'F1': 'autoroi_real', 'F2': 'autoroi_real', 'F3': 'autoroi_real',
    'F4': 'autoroi_real', 'F5': 'autoroi_real',
    'G1': 'noocr', 'G2': 'noocr', 'G3': 'noocr', 'G4': 'noocr',
    'H1': 'fullframe', 'H2': 'fullframe',
    'I1': 'multiframe', 'I2': 'multiframe', 'I3': 'multiframe', 'I4': 'multiframe',
    'J1': 'live', 'J2': 'live', 'J3': 'live', 'J4': 'live', 'J5': 'live',
    'K1': 'd_text', 'K2': 'd_text', 'K3': 'd_text', 'K4': 'd_text', 'K5': 'd_text',
    'L1': 'd_time',
    'M1': 'err_frame', 'M2': 'err_roi', 'M3': 'err_live', 'M4a': 'err_noroi',
    'M4b': 'err_roi_cnt', 'M4': 'err_ocr', 'M5': 'err_size',
    'N1': 'claim', 'N2': 'claim', 'N3': 'claim', 'N4': 'claim', 'N5': 'claim',
}
if ONLY:
    CHECKS = [c for c in CHECKS if CASE_OF.get(c[0].split()[0]) == ONLY]

for name, ok, expect, actual in CHECKS:
    print('%s\x1f%s\x1f%s\x1f%s' % ('PASS' if ok else 'FAIL', name, expect, actual))
print('SUM\x1f%d\x1f%d' % (len(CHECKS), sum(1 for c in CHECKS if c[1])))
PY

CASES=0 PASSED=0 FAILED=0
while IFS=$'\x1f' read -r tag name expect actual; do
  case "$tag" in
    PASS) CASES=$((CASES+1)); PASSED=$((PASSED+1)); printf '  \033[32mPASS\033[0m %s\n' "$name" ;;
    FAIL) CASES=$((CASES+1)); FAILED=$((FAILED+1))
          printf '  \033[31mFAIL\033[0m %s\n         期望: %s\n         实测: %s\n' \
                 "$name" "$expect" "$actual" ;;
    SUM)  : ;;
  esac
done <"$TMP/checks.txt"

# --only 若一条断言都没匹配上，必须报错而不是"0 条断言 = 全绿"
if [ -n "$ONLY" ] && [ "$CASES" -eq 0 ]; then
  echo "WATCH-SELFTEST-USAGE --only $ONLY 没有匹配到任何断言" >&2; exit 3
fi

# 证据摘要：人不用开 JSON 也能读到关键读数
python3 - "$TMP" <<'PY'
import json
import os
import sys
tmp = sys.argv[1]


def doc(name):
    try:
        with open(os.path.join(tmp, name + '.json'), encoding='utf-8') as f:
            return json.load(f)
    except OSError:
        return None


def ms(name):
    try:
        with open(os.path.join(tmp, name + '.ms')) as f:
            return int(f.read().strip())
    except (OSError, ValueError):
        return -1


print()
print('  证据摘要（关键读数，便于人直接核）')
c = doc('claim')
if c:
    cd = c['pairs'][0]['color_delta']
    print('    claim    变化像素 %.2f%% (%d/%d)  平均Δ=%.2f (逐通道 %.2f)  RGB %s→%s'
          % (cd['pixels_changed_pct'], cd['pixels_changed'], cd['pixels_total'],
             cd['mean_delta'], cd['mean_delta_per_channel'],
             tuple(cd['mean_rgb_before']), tuple(cd['mean_rgb_after'])))
    for e in c['pairs'][0]['events']:
        if e['kind'] == 'text_removed':
            print('    claim    text_removed「%s」@(%d,%d) score=%.3f'
                  % (e['text'], e['cx'], e['cy'], e['score']))
s = doc('score')
if s:
    for e in s['pairs'][0]['events']:
        if e['kind'] == 'number_changed':
            print('    score    number_changed %s→%s @(%d,%d) 文本「%s」→「%s」'
                  % (e['from'], e['to'], e['cx'], e['cy'], e['text_from'], e['text_to']))
t = doc('timer')
if t:
    for e in t['pairs'][0]['events']:
        if e['kind'] == 'time_changed':
            print('    timer    time_changed %s→%s（%s）@(%d,%d)'
                  % (e['from'], e['to'], e['change'], e['cx'], e['cy']))
n = doc('numbers')
if n:
    got = [(e['to'], e['text_to']) for e in n['pairs'][0]['events']
           if e['kind'] == 'number_changed']
    print('    numbers  number_changed 出现：%s' % (got,))
d = doc('d_text')
if d:
    for e in d['pairs'][0]['events']:
        if e['kind'] == 'text_changed':
            print('    d_text   text_changed「%s」→「%s」相似度=%.2f auto-roi=%s'
                  % (e['from'], e['to'], e['ratio'],
                     d['pairs'][0].get('auto_roi', {}).get('bbox')))
dt = doc('d_time')
if dt:
    for e in dt['pairs'][0]['events']:
        if e['kind'] == 'time_changed':
            print('    d_time   time_changed %s→%s（%s）'
                  % (e['from'], e['to'], e['change']))
for name in ('claim', 'same', 'score', 'timer', 'numbers', 'autoroi_real', 'noocr',
             'fullframe', 'multiframe', 'live', 'd_text', 'd_time'):
    if ms(name) >= 0:
        print('    TIME     %-13s %5d ms' % (name, ms(name)))
PY

echo "  NOTE   派生帧只改目标像素（见脚本 §派生帧）：d_time 把 battle-report 的计时器区重绘成"
echo "         00:31；d_text 把 claim-before 的第二个按钮重绘成「已领取」。真实素材里没有"
echo "         「同一位置文字/时间变了」的帧对，这两条用于锁 text_changed / time_changed 的"
echo "         value 分支；素材本身一个字节未改。"
echo "  NOTE   本工具**不自己抓屏**：活体采样必须由 --capture-cmd 指定的抓帧命令完成"
echo "         （应由 ys-gui-slot 占槽后调用），所以这条链可以完全离线测通。"

VERDICT=PASS
[ "$FAILED" -gt 0 ] && VERDICT=FAIL
echo
echo "WATCH-RESULT cases=$CASES assert=$CASES pass=$PASSED fail=$FAILED derived=$DERIVED verdict=$VERDICT"
[ "$VERDICT" = PASS ] || exit 1
exit 0
