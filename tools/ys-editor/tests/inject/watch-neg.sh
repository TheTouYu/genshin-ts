#!/bin/bash
# inject/watch-neg.sh — F-3-02 的注入用例（证明 watch 门禁不是空转）
#
# 注入什么：给 tools/ys-watch 的 text_removed 输出加一道"降噪"过滤——
#   只有带数字/时间的文字才报消失，纯文字（领取/预测成功…）当噪声吞掉。
#     for a in only_a:
#         if not (a['numbers'] or a['times']): continue     ← INJECT
#         events.append({'kind': 'text_removed', ...})
#   **这正是 F-3-02 记的原始错误**：动作前后放过同一 ROI 的比对，结果只留下终态——
#   用户点名要抓的「领取」消失没被记成事件（"只有第一档领奖留了变化证据"）。
#
# 判据：只跑受影响的那条用例（--only claim），断言报红的是「A4 「领取」消失 ×2」。
#   注意 A4 必须是 FAIL 行（不是 PASS 行恰好含同样文字）。
# 还原：trap 保证任何路径都还原源文件。
# 离线：套件自带 YS_SLOT_TEST=1 + 空缓存目录，只读仓内帧，不抓屏、不占槽、不响铃。
#
# 用法: tests/inject/watch-neg.sh        rc=0 = 故障被正确抓住
# 退出码: 0 = INJECT-PASS / 1 = INJECT-FAIL / 3 = INJECT-BROKEN（锚点失效或环境不全）
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"; cd "$ROOT" || exit 3
f="tools/ys-watch"; bak="$(mktemp)"; log="$(mktemp)"
cp "$f" "$bak"
trap 'cp "$bak" "$f"; rm -f "$bak" "$log"' EXIT

python3 - "$f" <<'PY' || exit 3
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
old = """    for a in only_a:
        events.append({'kind': 'text_removed', 'text': a['text'], 'bbox': a['bbox'],
"""
new = """    for a in only_a:
        if not (a['numbers'] or a['times']):
            continue                  # INJECT：纯文字消失当噪声吞掉（造故障）
        events.append({'kind': 'text_removed', 'text': a['text'], 'bbox': a['bbox'],
"""
if s.count(old) != 1:
    print('INJECT-BROKEN 锚点不唯一或已失效（ys-watch 的 diff_pair 文本消失段改过？）',
          file=sys.stderr)
    sys.exit(3)
open(p, 'w', encoding='utf-8').write(s.replace(old, new))
PY

bash tools/ys-editor/tests/watch-selftest.sh --only claim >"$log" 2>&1 && {
  echo "INJECT-FAIL watch-neg: 吞掉「领取」消失后门禁仍绿（门禁空转）"; exit 1; }
grep -q 'FAIL.*A4 「领取」消失' "$log" || {
  echo "INJECT-FAIL watch-neg: 变红但不是「A4 「领取」消失」那条（判据串了）："
  grep -E 'FAIL' "$log" | head -4; tail -2 "$log"; exit 1; }
echo "INJECT-PASS watch-neg: 纯文字消失被吞（只报带数字/时间的）⇒「A4 「领取」消失 ×2」报红"
exit 0
