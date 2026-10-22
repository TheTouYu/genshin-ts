#!/bin/bash
# inject/preflight-desktop-neg.sh — 「窗在别的虚拟桌面 ⇒ DESKTOP_HIDDEN」判据的注入用例
#
# 事故（2026-10-23 实测）：原神窗在**别的虚拟桌面**（ds=3 / cur=2）时 KWin 把窗口 unmaps，
#   ydotool 的点击/按键**一个都收不到**，而 `ys-preflight` 仍 PASS ⇒ 一次采集白烧约 5 分钟
#   并打扰用户一次。判据落在 `tools/ys-editor/ys-preflight` 的 `desktop_check()`：
#     ds 与 cur 不等（且 ds 不是「不限定桌面」） ⇒ FAIL 点名叫 DESKTOP_HIDDEN
#     ds 与 cur 相等                            ⇒ 该项 OK
#     找不到 yuanshen.exe 窗口（游戏没在跑）      ⇒ SKIP（**不得判 FAIL**）
#
# 造什么故障（单锚点）：
#   `if [ "$same" != "1" ]; then`（ds≠cur ⇒ 报隐藏）翻成 `if [ "$same" = "1" ]; then`
#   —— 这就是「把 ds != cur 写成 ds == cur」：隐藏不再报红，同时同桌面被误报成隐藏。
#   其余每一行都不动，所以变红只可能来自这一个判断。
#   （第一版把 `# INJECT` 注释放进 `then` **之前**，顺手把 `; then` 也注掉了 ⇒ 语法错、输出全空，
#     旧断言只看到"没报红"仍报 INJECT-PASS —— 那是假绿灯。现在：锚整行替换 + 注入后先 `bash -n`，
#     语法错一律 INJECT-BROKEN，不让"脚本崩了"冒充"判据抓住故障"。）
#
# 断言三层（三层都判，因为退出码本身说明不了问题：preflight 还会因别的检查返回 1/2）：
#   ① hidden 夹具  ⇒ 该项必须 [FAIL] 且点名 DESKTOP_HIDDEN，且 rc=1
#   ② same 夹具    ⇒ 该项必须 [OK]（**且不得出现该项的 [FAIL]**）
#   ③ nogame 夹具  ⇒ 该项必须 [SKIP]（**不得出现该项的 [FAIL]**）
#   基线（未注入）三态必须全对，否则 INJECT-BROKEN；注入后 ① 漏报 与 ② 误报 都要出现 ✗ 行。
#
# 安全性：全部走夹具（`YS_PREFLIGHT_FAKE_ATTRIB`）+ `--quick` ⇒ 零截图、零 CLI、零抬窗、
#   **零桌面切换**、零注入；真实窗口与桌面一个都不碰。
#
# 用法: tests/inject/preflight-desktop-neg.sh        rc=0 = 故障被正确抓住
# 退出码: 0 = INJECT-PASS / 1 = INJECT-FAIL / 3 = INJECT-BROKEN（锚点失效或环境不全）
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"; cd "$ROOT" || exit 3

f="tools/ys-editor/ys-preflight"
bak="$(mktemp)" || exit 3
tmp="$(mktemp -d)" || exit 3
cp "$f" "$bak" || exit 3
cleanup() { cp "$bak" "$f" 2>/dev/null; rm -f "$bak"; rm -rf "$tmp"; }   # 任何路径（含 Ctrl-C）都还原
trap cleanup EXIT

# 夹具：与真实 `ys-wins --attrib` 同格式（caption 里允许有 " | "，故认窗用两侧带分隔符的 WM_CLASS）
cat > "$tmp/hidden.txt" <<'EOF'
[0] (无题) | plasmashell | 0,0 1707x960 | min=0 | ds= | cur=2 | idx=0 | act=0
[6] 原神 | yuanshen.exe | 0,0 1707x960 | min=0 | ds=3 | cur=2 | idx=6 | act=0
[7] kitty | kitty | 21,13 1663x889 | min=0 |ACTIVE | ds=2 | cur=2 | idx=7 | act=1
EOF
cat > "$tmp/same.txt" <<'EOF'
[0] (无题) | plasmashell | 0,0 1707x960 | min=0 | ds= | cur=2 | idx=0 | act=0
[5] 原神编辑器 | BeyondEditor.exe | 0,0 1707x960 | min=0 | ds=2 | cur=2 | idx=5 | act=0
[6] 原神 | yuanshen.exe | 0,0 1707x960 | min=0 | ds=2 | cur=2 | idx=6 | act=0
EOF
cat > "$tmp/nogame.txt" <<'EOF'
[0] (无题) | plasmashell | 0,0 1707x960 | min=0 | ds= | cur=2 | idx=0 | act=0
[5] 原神编辑器 | BeyondEditor.exe | 0,0 1707x960 | min=0 | ds=2 | cur=2 | idx=5 | act=0
EOF

# 夹具路径不读窗口几何；这里兜一个非空值，只为让 ys-preflight 的 ${YS_WIN:?} 前置不挡路
export YS_WIN="${YS_WIN:-0x0}"
unset YS_PREFLIGHT_FAKE_ATTRIB

PF_OUT=""; PF_RC=0
pf() {   # $1 = 夹具文件 → PF_OUT/PF_RC
  PF_OUT="$(YS_PREFLIGHT_FAKE_ATTRIB="$1" bash "$f" --quick 2>&1)"; PF_RC=$?
}
row() { printf '%s\n' "$PF_OUT" | grep -m1 '窗口所在桌面' | sed 's/^ *//'; }

want_fail() {   # 隐藏桌面：必须 FAIL 且点名 DESKTOP_HIDDEN
  pf "$tmp/hidden.txt"
  if ! printf '%s\n' "$PF_OUT" | grep -q '\[FAIL\].*窗口所在桌面.*DESKTOP_HIDDEN'; then
    echo "✗ 隐藏桌面没报红（期望 [FAIL] … DESKTOP_HIDDEN，实得：$(row || echo '<无该行>')）"
    return 1
  fi
  if [ "$PF_RC" != 1 ]; then echo "✗ 隐藏桌面报红了但 preflight rc=$PF_RC（期望 1）"; return 1; fi
  echo "  ✓ $(row)"
}

want_pass() {   # 同桌面：必须 OK，且不得被判隐藏
  pf "$tmp/same.txt"
  if printf '%s\n' "$PF_OUT" | grep -q '\[FAIL\].*窗口所在桌面'; then
    echo "✗ 同桌面被误判成桌面隐藏（期望 [OK]，实得：$(row))"
    return 1
  fi
  if ! printf '%s\n' "$PF_OUT" | grep -q '\[OK\].*窗口所在桌面'; then
    echo "✗ 同桌面没判 PASS（期望 [OK]，实得：$(row || echo '<无该行>')）"
    return 1
  fi
  echo "  ✓ $(row)"
}

want_skip() {   # 游戏没在跑：必须 SKIP，不得 FAIL
  pf "$tmp/nogame.txt"
  if printf '%s\n' "$PF_OUT" | grep -q '\[FAIL\].*窗口所在桌面'; then
    echo "✗ 游戏没在跑却判 FAIL（期望 SKIP，实得：$(row))"
    return 1
  fi
  if ! printf '%s\n' "$PF_OUT" | grep -q '\[SKIP\].*窗口所在桌面'; then
    echo "✗ 游戏没在跑没判 SKIP（期望 [SKIP]，实得：$(row || echo '<无该行>')）"
    return 1
  fi
  echo "  ✓ $(row)"
}

# ── 锚点：单点替换，必须全文唯一 ────────────────────────────────────────────
inject() {
  python3 - "$f" <<'PY' || exit 3
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
old = 'if [ "$same" != "1" ]; then'
new = 'if [ "$same" = "1" ]; then   # INJECT：把「ds != cur ⇒ 隐藏」写成「ds == cur ⇒ 隐藏」'
if s.count(old) != 1:
    print('INJECT-BROKEN 锚点不唯一或已失效（desktop_check 的比较改过？命中 %d 次）' % s.count(old),
          file=sys.stderr)
    sys.exit(3)
open(p, 'w', encoding='utf-8').write(s.replace(old, new, 1))
PY
  bash -n "$f" || { echo "INJECT-BROKEN 注入后语法错（这不是判据故障，是用例自己写坏了）"; exit 3; }
}

# ── 基线：未注入时三态必须全对（基线坏了，注入后变红说明不了任何事）──────────
echo "── 基线（未注入，三态应全对）"
a=0; b=0; c=0
want_fail || a=1
want_pass || b=1
want_skip || c=1
[ "$a$b$c" = "000" ] || {
  echo "INJECT-BROKEN preflight-desktop-neg: 未注入时判据就不对（基线坏了，先修 ys-preflight 的 desktop_check）"
  exit 3; }

# ── 注入故障，再判：① 漏报隐藏 与 ② 误报同桌面 都必须出现 ✗ 行 ──────────────
inject
echo "── 注入后（把 ds != cur 写成 ds == cur，下面应出现 ✗ 行）"

a=0; b=0
want_fail || a=1
want_pass || b=1
if [ "$a$b" = "00" ]; then
  echo "INJECT-FAIL preflight-desktop-neg: 把 ds != cur 写成 ds == cur 后判据仍全绿（门禁空转）"
  exit 1
fi
[ "$a" = 1 ] || {
  echo "INJECT-FAIL preflight-desktop-neg: 同桌面误报被抓到了，但隐藏桌面漏报没被断言（判据串了）"
  exit 1; }

# ── 还原并复验（trap 之外显式做一次，证明用例可重复）────────────────────────
cp "$bak" "$f" || { echo "INJECT-FAIL preflight-desktop-neg: 还原失败（$f）"; exit 1; }
echo "── 还原后（应复绿）"
a=0
want_fail || a=1
[ "$a" = 0 ] || { echo "INJECT-FAIL preflight-desktop-neg: 还原后判据仍不对（还原失败）"; exit 1; }

echo "INJECT-PASS preflight-desktop-neg: ds != cur 写成 ds == cur ⇒ 隐藏桌面漏报 + 同桌面误报双双报红；还原后三态复绿"
exit 0
