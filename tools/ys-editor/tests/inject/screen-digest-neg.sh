#!/bin/bash
# inject/screen-digest-neg.sh — F-2-02 / F-2-10 的注入用例（证明 screen 门禁不是空转）
#
# 注入什么：把 ys-screen 的**圆环通道**关掉（`_find_rings` 不再产出候选），
#   即回到「换帧就检不出圆钮」的旧实现——2026-10-17 那帧改名后标题右侧的铅笔圆钮
#   内部变成「白框+铅笔」，细亮环被开运算腐蚀掉，DoG/平坦面两路都抓不到。
#   这同时是 F-2-02（漏看存档名右侧的圆形铅笔图标）与 F-2-10（坐标/区域必须由工具量出来）
#   两笔账的失效形态：**看不见控件，就没有被测量过的坐标可用**。
# 判据：screen-digest.selftest 的 `circle/menu-esc-云阶` 必须报红（「距 (518,86) ≤60px」为假）；
#   同帧的 `title/` `digest-names-title/` 与**另一帧** `circle/menu-esc-pre-rename` 仍绿——
#   证明红的不是整份套件崩了，而恰好是「这颗圆钮没被看见」。
# 还原：显式 cp 还原 + trap 兜底，中断也不留脏文件。
#
# 用法: bash tools/ys-editor/tests/inject/screen-digest-neg.sh     rc=0 = 故障被正确抓住
# 退出码: 0 INJECT-PASS / 1 门禁没抓住(或红了别处) / 3 锚点失效
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"; cd "$ROOT" || exit 3
f="tools/ys-screen"; bak="$(mktemp)"; log="$(mktemp)"
cp "$f" "$bak"
trap 'cp "$bak" "$f"; rm -f "$bak" "$log"' EXIT

python3 - "$f" <<'PY' || exit 3
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
# 锚点 = find_controls 里圆环通道那一行（第三路线索：径向对称投票 + 环验证）
old = """    # ③ 圆环/圆钮（内部被图标填满也能抓；见 _find_rings 的说明）
    for rg in _find_rings(g, debug=debug):"""
new = """    # ③ 圆环/圆钮（内部被图标填满也能抓；见 _find_rings 的说明）
    for rg in []:            # INJECT：圆环通道不产出候选（造「换帧就检不出」的旧故障）"""
if s.count(old) != 1:                       # 锚点必须全文唯一，否则注入会打错地方
    print('INJECT-BROKEN 锚点不唯一或已失效（ys-screen 的 find_controls 圆环通道改动过？）', file=sys.stderr)
    sys.exit(3)
open(p, 'w', encoding='utf-8').write(s.replace(old, new))
PY

bash tools/ys-editor/tests/screen-digest.selftest.sh --only button >"$log" 2>&1 && {
  echo "INJECT-FAIL screen-digest-neg: 圆环通道关掉后门禁仍全绿（门禁空转）"; tail -8 "$log"; exit 1; }

# 红的必须是**预期的那条**（输出带 ANSI 色码 ⇒ 用「FAIL … 名字」的宽松匹配）
grep -qE 'FAIL.*circle/menu-esc-云阶' "$log" || {
  echo "INJECT-FAIL screen-digest-neg: 变红但不是「circle/menu-esc-云阶」（判据串了）："
  tail -8 "$log"; exit 1; }
# 诊断必须指到「距锚点 >60px」这条判据，而不是 JSON/标题之类的连带崩
grep -qF '距 (518,86) ≤60px' "$log" || {
  echo "INJECT-FAIL screen-digest-neg: 报红理由不是「圆钮不在锚点旁」（诊断串了）："
  grep -A2 'FAIL' "$log" | tail -8; exit 1; }
# 对照断言：同一颗圆钮在**改名前的帧**仍被检到 ⇒ 故障精确命中「换帧就检不出」
grep -qE 'PASS.*circle/menu-esc-pre-rename' "$log" || {
  echo "INJECT-FAIL screen-digest-neg: 另一帧的圆钮也丢了 ⇒ 不是「换帧就检不出」这条形态："
  grep 'circle/' "$log"; tail -4 "$log"; exit 1; }
grep -qF 'SCREEN-RESULT' "$log" || {
  echo "INJECT-FAIL screen-digest-neg: 套件没跑到收尾行（中途崩了，属假红）"; tail -8 "$log"; exit 1; }

cp "$bak" "$f"                                  # 先显式还原（trap 再兜一次）
grep -qF 'for rg in _find_rings(g, debug=debug):' "$f" || {
  echo "INJECT-BROKEN 还原失败：tools/ys-screen 仍是注入态"; exit 3; }

echo "INJECT-PASS screen-digest-neg: 关掉圆环通道 ⇒「circle/menu-esc-云阶」报红（距锚点 253px > 60px；改名前一帧的圆钮仍绿）"
exit 0
