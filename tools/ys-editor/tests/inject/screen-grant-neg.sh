#!/bin/bash
# inject/screen-grant-neg.sh — F-20261021-50 与 F-20261021-52 的注入用例
#
# 两条账目共用门禁 `screen-grant`，但守的是两件事，所以本用例造两个故障、各跑一次：
#
#   A) F-20261021-50「没有用户批准的凭据时，底层注入必须拒绝（rc=6 + NO_GRANT）」：
#      把 ys-gui-slot 拒绝路径的 `exit 6` 改成 `exit 0`。
#      ⚠️ 拒绝**仍然照原样打印并退出**（一次窗口操作都没发生），改的只是退出码语义——
#      调用方于是会把"被拒绝"当成"执行成功"。判据 `✗ 无凭据时 slot 拒绝执行（rc=6）` 必红。
#      为什么只改 rc：真让 slot 去执行就得占真屏幕（用户令 2026-10-21：环境共用），
#      而 rc=6 正是这条契约对外的全部表达。
#
#   B) F-20261021-52「代理绕过申请自授超长凭据（1200s）」：
#      把 ys-screen-grant 里**第一处**单次上限检查 `if n > MAX_GRANT_S:` 改成 `if False:`。
#      于是 `grant --seconds 9999` 不再被拒（同任务续期分支会把它夹到 1800s 上限并照常放行）。
#      判据 `✗ 超长自授被拒（≤120s）` 必红。凭据只写进 $YS_SCREEN_GRANT 的临时文件，不碰真实路径。
#
# 离线保证：套件自带 `YS_SCREEN_GRANT` 临时凭据缝 + `--plan` 离线用例；本用例另加
#   `YS_BELL=0`（ys-gui-slot 在契约检查前会响铃）与 `--only`（只跑相关判据）。
#
# 用法: tests/inject/screen-grant-neg.sh        rc=0 = 两个故障都被抓住
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"; cd "$ROOT" || exit 3
export YS_BELL=0                       # 本用例全程静音
SUITE="tools/ys-editor/tests/screen-grant.selftest.sh"
SLOT_COPY="tools/ys-editor/.inject_tmp-ys-gui-slot"
GRANT_COPY="tools/ys-editor/.inject_tmp-ys-screen-grant"
tmp="$(mktemp -d)"; la="$tmp/a.log"; lb="$tmp/b.log"
trap 'rm -rf "$tmp"; rm -f "$SLOT_COPY" "$GRANT_COPY"' EXIT

# ── 基线：不注入时两条判据都必须绿 ──────────────────────────────────────────
bash "$SUITE" --only t1,t2 >"$la" 2>&1 || {
  echo "INJECT-BROKEN screen-grant-neg[A/F-50]: 未注入时 T1/T2 就不绿（基线坏了）"; tail -4 "$la"; exit 3; }
bash "$SUITE" --only t3,t4 >"$lb" 2>&1 || {
  echo "INJECT-BROKEN screen-grant-neg[B/F-52]: 未注入时 T3/T4 就不绿（基线坏了）"; tail -4 "$lb"; exit 3; }

# ── A) F-20261021-50：拒绝路径的退出码不再是 6 ────────────────────────────────
cp tools/ys-editor/ys-gui-slot "$SLOT_COPY"
python3 - "$SLOT_COPY" <<'PY' || exit 3
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
old = "    exit 6\n"
new = "    exit 0   # INJECT：拒绝仍打印，但退出码不再表达『拒绝』\n"
if s.count(old) != 1:                       # 锚点必须全文唯一，否则注入会打错地方
    print('INJECT-BROKEN 锚点不唯一或已失效（ys-gui-slot 契约拒绝路径改动过？）', file=sys.stderr)
    sys.exit(3)
open(p, 'w', encoding='utf-8').write(s.replace(old, new))
PY
chmod +x "$SLOT_COPY"
YS_SLOT_BIN="$ROOT/$SLOT_COPY" bash "$SUITE" --only t1,t2 >"$la" 2>&1 && {
  echo "INJECT-FAIL screen-grant-neg[A/F-50]: 拒绝路径 rc 改成 0 后门禁仍绿（门禁空转）"; tail -4 "$la"; exit 1; }
grep -q '✗ 无凭据 slot rc=' "$la" || {
  echo "INJECT-FAIL screen-grant-neg[A/F-50]: 变红但不是「无凭据 slot rc=6」那条（判据串了）："; tail -6 "$la"; exit 1; }
echo "  A 报红：$(grep -m1 '✗ 无凭据 slot rc=' "$la" | sed 's/^ *//')"

# ── B) F-20261021-52：单次授权上限被摘掉 ─────────────────────────────────────
cp tools/ys-editor/ys-screen-grant "$GRANT_COPY"
python3 - "$GRANT_COPY" <<'PY' || exit 3
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
old = '''    cur = load()
    # 单次超大请求一律拒（"一次要 4 小时"= 没跟用户对齐）；续期请用 ≤MAX_GRANT_S 的 eta
    if n > MAX_GRANT_S:
'''
new = '''    cur = load()
    # 单次超大请求一律拒（"一次要 4 小时"= 没跟用户对齐）；续期请用 ≤MAX_GRANT_S 的 eta
    if False:  # INJECT：摘掉单次授权上限（9999s 自授不再被拒）
'''
if s.count(old) != 1:                       # 该文件里 `if n > MAX_GRANT_S:` 出现两次，用三行锚点唯一定位第一处
    print('INJECT-BROKEN 锚点不唯一或已失效（ys-screen-grant 的单次上限检查改动过？）', file=sys.stderr)
    sys.exit(3)
open(p, 'w', encoding='utf-8').write(s.replace(old, new))
PY
chmod +x "$GRANT_COPY"
YS_GRANT_BIN="$ROOT/$GRANT_COPY" bash "$SUITE" --only t3,t4 >"$lb" 2>&1 && {
  echo "INJECT-FAIL screen-grant-neg[B/F-52]: 摘掉上限后门禁仍绿（门禁空转）"; tail -4 "$lb"; exit 1; }
grep -q '✗ 超长自授未被拒' "$lb" || {
  echo "INJECT-FAIL screen-grant-neg[B/F-52]: 变红但不是「超长自授被拒」那条（判据串了）："; tail -6 "$lb"; exit 1; }
echo "  B 报红：$(grep -m1 '✗ 超长自授未被拒' "$lb" | cut -c1-150 | sed 's/^ *//')"

echo "  机读：$(grep -o 'SCREEN-GRANT-RESULT.*' "$la" | tail -1) ／ $(grep -o 'SCREEN-GRANT-RESULT.*' "$lb" | tail -1)"
echo "INJECT-PASS screen-grant-neg: F-50 拒绝路径 rc6→0 ⇒「无凭据时 slot 拒绝执行（rc=6）」报红；F-52 摘掉单次上限 ⇒「超长自授被拒」报红"
exit 0
