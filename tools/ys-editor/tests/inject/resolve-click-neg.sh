#!/bin/bash
# inject/resolve-click-neg.sh — F-2-01 的注入用例（证明 resolve 门禁不是空转）
#
# 注入什么：把 ys-find 的「按名字解析坐标」退化成**坐标取帧里第一个文本块的中心**——
#   名字解析（候选=0 / 候选不唯一）与 matched_text 全都不动，只有 (x,y) 不再由名字算出来。
#   这正是 F-2-01 记下的原始错误形态：坐标 (816,192) 被当成「当前存档卡片」，
#   **身份是假定的**，于是静默点到另一张存档的【编辑】上。
# 判据：resolve-click.selftest 的 [D1] 里坐标类断言（A.x / A.y / B.x / B.y、
#   「同名字在两种布局下换了坐标」）必须报红；而 matched_text 仍绿——
#   绿的 matched_text 正是故障的指纹：身份照抄查询词、坐标却不是它。
# 还原：显式 cp 还原 + trap 兜底，中断也不留脏文件。
#
# 用法: bash tools/ys-editor/tests/inject/resolve-click-neg.sh     rc=0 = 故障被正确抓住
# 退出码: 0 INJECT-PASS / 1 门禁没抓住(或红了别处) / 3 锚点失效
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"; cd "$ROOT" || exit 3
f="tools/ys-find"; bak="$(mktemp)"; log="$(mktemp)"
cp "$f" "$bak"
trap 'cp "$bak" "$f"; rm -f "$bak" "$log"' EXIT

python3 - "$f" <<'PY' || exit 3
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
# 锚点 = --resolve 的「文本分支」收尾那两行；带 res.update 行才唯一（锚点分支也是 b = cands[0]）
old = """        b = cands[0]
        res.update(ok=True, x=b['cx'], y=b['cy'], resolved_by='text',"""
new = """        b = cands[0]
        _fb = pool[0] if pool else b      # INJECT：坐标取帧里第一个文本块（假定那个点就是目标）
        res.update(ok=True, x=_fb['cx'], y=_fb['cy'], resolved_by='text',"""
if s.count(old) != 1:                       # 锚点必须全文唯一，否则注入会打错地方
    print('INJECT-BROKEN 锚点不唯一或已失效（ys-find 的 --resolve 文本分支改动过？）', file=sys.stderr)
    sys.exit(3)
open(p, 'w', encoding='utf-8').write(s.replace(old, new))
PY

bash tools/ys-editor/tests/resolve-click.selftest.sh --only d1 >"$log" 2>&1 && {
  echo "INJECT-FAIL resolve-click-neg: 坐标不再按名字算，门禁仍全绿（门禁空转）"; tail -6 "$log"; exit 1; }

# 红的必须是**预期的那条**（只判 rc 不够：崩在别处也是 rc≠0）
for want in '✗ A.x' '✗ A.y' '✗ B.x' '✗ B.y' '同名字应解析到不同坐标'; do
  grep -qF "$want" "$log" || {
    echo "INJECT-FAIL resolve-click-neg: 变红但不是「$want」（判据串了）："
    tail -8 "$log"; exit 1; }
done
# 指纹断言：身份解析没坏，坏的是坐标 ⇒ 这才是「静默点错对象」，不是工具崩了
grep -qF '✓ A.matched_text' "$log" || {
  echo "INJECT-FAIL resolve-click-neg: matched_text 也红了 ⇒ 故障形态不是「坐标不携带身份」："
  tail -8 "$log"; exit 1; }
grep -qF 'RESOLVE-RESULT' "$log" || {
  echo "INJECT-FAIL resolve-click-neg: 套件没跑到收尾行（中途崩了，属假红）"; tail -8 "$log"; exit 1; }

cp "$bak" "$f"                                  # 先显式还原（trap 再兜一次）
grep -qF "x=b['cx'], y=b['cy'], resolved_by='text'," "$f" || {
  echo "INJECT-BROKEN 还原失败：tools/ys-find 仍是注入态"; exit 3; }

echo "INJECT-PASS resolve-click-neg: 坐标改成「帧里第一个文本块」⇒ D1 的 A.x/A.y/B.x/B.y 报红（matched_text 仍绿=静默点错对象）"
exit 0
