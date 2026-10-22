#!/bin/bash
# inject/identity-freshness-neg.sh — F-2-07 的注入用例（证明 identity-gate2 门禁不是空转）
#
# 注入什么：把 tools/round-report 的帧新鲜度检查改成「帧没有元数据也算通过」
#     if not m:
#         bad.append(f'{f} 无 sha（旧帧/共享临时帧被当证据）')   ← 原：缺证据必须 ERROR
#         continue
#   →  ok_n += 1; continue
#   **这正是 F-2-07 记的原始错误**：ys-state --json 返回 frame:null 后仍拿共享临时路径的旧帧当
#   "切换后画面"——没有 sha/时刻的帧被当成证据。
#
# 判据：只跑受影响的那条用例（--only no-sha），断言报红的是
#   「输出缺「无 sha」」（= replay 不再把"无 sha 帧"记成证据不全）。
#   只判退出码不够：本套件的 ④⑤⑥ 三条用例本来就期望非 0 退出码，rc 一路非 0 说明不了问题。
# 还原：trap 保证任何路径（含 Ctrl-C / 断言失败）都还原源文件。
#
# 用法: tests/inject/identity-freshness-neg.sh        rc=0 = 故障被正确抓住
# 退出码: 0 = INJECT-PASS / 1 = INJECT-FAIL / 3 = INJECT-BROKEN（锚点失效或环境不全）
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"; cd "$ROOT" || exit 3
f="tools/round-report"; bak="$(mktemp)"; log="$(mktemp)"
cp "$f" "$bak"
trap 'cp "$bak" "$f"; rm -f "$bak" "$log"' EXIT

python3 - "$f" <<'PY' || exit 3
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
old = """        if not m:
            bad.append(f'{f} 无 sha（旧帧/共享临时帧被当证据）')
            continue
"""
new = """        if not m:
            ok_n += 1
            continue                   # INJECT：没有元数据也当证据（造故障）
"""
if s.count(old) != 1:
    print('INJECT-BROKEN 锚点不唯一或已失效（round-report 的 check_frame_freshness 改过？）',
          file=sys.stderr)
    sys.exit(3)
open(p, 'w', encoding='utf-8').write(s.replace(old, new))
PY

bash tools/ys-editor/tests/identity-freshness.selftest.sh --only no-sha >"$log" 2>&1 && {
  echo "INJECT-FAIL identity-freshness-neg: 无 sha 的帧被当证据，门禁仍绿（门禁空转）"; exit 1; }
grep -q '✗ 输出缺「无 sha」' "$log" || {
  echo "INJECT-FAIL identity-freshness-neg: 变红但不是「无 sha 没被报」那条（判据串了）："
  tail -4 "$log"; exit 1; }
echo "INJECT-PASS identity-freshness-neg: 去掉「帧无元数据 ⇒ ERROR」⇒「输出缺「无 sha」」报红"
exit 0
