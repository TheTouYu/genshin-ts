#!/bin/bash
# win-attrib.selftest.sh — 票 34「live 取帧窗口身份」回归（离线夹具 + 真实快路径，0 抓屏，0 注入）
#
# 背景（2026-10-18 Lead 实测）：`ys-observe frame` 曾报 `atop:true window=0x01400001`，
# 抓到的却是浏览器（DSH GUI）——原神在别的虚拟桌面/被完全遮挡时，spectacle 全屏裁剪会把
# 别的窗口当目标。修复后：归属校验不过 ⇒ OTHER_DESKTOP(4) / OCCLUDED(5)，**不返回像素**。
#
# 两条实现路径都要测：
#   · 默认快路径  `ys-atop --json`（X11/EWMH，~20ms；ys_attrib.py）—— 用真实窗口做冒烟
#   · 慢路径/夹具 `ys-atop --json --verify` / `YS_ATTR_FIXTURE`（KWin 脚本，~1s）
# 夹具 = `ys-wins --attrib` 的输出行；`YS_OBSERVE_SKIP_GRAB=1` 让 ys-observe 只校验不抓屏。
#
# 复现「浏览器全屏 + 原神在别的桌面」的人工步骤见 repro-34-window-attribution.md。
#
# 用法: bash tools/ys-editor/tests/win-attrib.selftest.sh
# 退出码: 0 全绿 / 1 有失败项
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
ATOP="$HERE/ys-atop"; OBS="$HERE/ys-observe"
export DISPLAY="${DISPLAY:-:1}"
# 2026-10-22：本机 XAUTHORITY 是每会话随机文件名（/run/user/<uid>/xauth_XXXX）。
# 不 source ys-env.sh 时 xprop 读不到 EWMH 属性 → 快路径返回 UNKNOWN → 三条断言假红
# （实测：带 XAUTHORITY 25/25 全绿，不带 22/25）。工具自己找环境，别依赖调用者 shell。
. "$HERE/ys-env.sh" >/dev/null 2>&1 || true
export DISPLAY XAUTHORITY
TMP="$(mktemp -d "${TMPDIR:-/tmp}/win-attrib.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
ok()   { printf '  ✓ %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '  ✗ %s\n      ↳ %s\n' "$1" "${2:-}"; FAIL=$((FAIL+1)); }
LAST=""; LAST_RC=0

# ── 夹具：全部是 ys-wins --attrib 的真实输出格式
cat > "$TMP/ok.txt" <<'EOF'
[0] plasmashell | plasmashell | 0,0 1707x960 | min=0 | ds= | cur=2 | idx=0 | act=0
[1] 原神 | yuanshen.exe | 0,0 1707x960 | min=0 |TOP |ACTIVE | ds=2 | cur=2 | idx=1 | act=1
EOF
cat > "$TMP/otherdesk.txt" <<'EOF'
[0] plasmashell | plasmashell | 0,0 1707x960 | min=0 | ds= | cur=2 | idx=0 | act=0
[1] 原神 | yuanshen.exe | 0,0 1707x960 | min=0 | ds=1 | cur=2 | idx=1 | act=0
[2] GUI 下一轮计划 — DeepSeek Harness — Mozilla Firefox | firefox | 0,0 1707x960 | min=0 |TOP |ACTIVE | ds=2 | cur=2 | idx=2 | act=1
EOF
# 标题里带竖线 + 标题含「原神」的编辑器：身份判据必须认 WM_CLASS（yuanshen.exe），不能靠标题
cat > "$TMP/classfirst.txt" <<'EOF'
[0] 千星计划 | 原神编辑器 | beyondeditor.exe | 0,0 1707x960 | min=0 |TOP |ACTIVE | ds=2 | cur=2 | idx=0 | act=1
[1] 原神 | yuanshen.exe | 0,0 1707x960 | min=0 | ds=1 | cur=2 | idx=1 | act=0
EOF
cat > "$TMP/notfound.txt" <<'EOF'
[0] 千星计划 | 原神编辑器 | beyondeditor.exe | 0,0 1707x960 | min=0 |TOP |ACTIVE | ds=2 | cur=2 | idx=0 | act=1
EOF
cat > "$TMP/occluded.txt" <<'EOF'
[0] 原神 | yuanshen.exe | 0,0 1707x960 | min=0 | ds=2 | cur=2 | idx=0 | act=0
[1] GUI 下一轮计划 — Mozilla Firefox | firefox | 0,0 1707x960 | min=0 |TOP |ACTIVE | ds=2 | cur=2 | idx=1 | act=1
EOF
cat > "$TMP/partial.txt" <<'EOF'
[0] 原神 | yuanshen.exe | 0,0 1707x960 | min=0 | ds=2 | cur=2 | idx=0 | act=0
[1] 小窗 | kitty | 100,100 600x400 | min=0 |TOP |ACTIVE | ds=2 | cur=2 | idx=1 | act=1
EOF
cat > "$TMP/notatop.txt" <<'EOF'
[0] 原神 | yuanshen.exe | 0,0 1707x960 | min=0 | ds=2 | cur=2 | idx=0 | act=0
[1] 大窗 | kitty | 0,0 1707x300 | min=0 |TOP |ACTIVE | ds=2 | cur=2 | idx=1 | act=1
EOF
cat > "$TMP/minimized.txt" <<'EOF'
[0] 原神 | yuanshen.exe | 0,0 1707x960 | min=1 |TOP | ds=2 | cur=2 | idx=0 | act=0
EOF

run() { LAST=$("$@" 2>&1); LAST_RC=$?; }
expect() {  # expect <名称> <期望退出码> <断言子串> <命令…>
  local name="$1" want="$2" sub="$3"; shift 3
  run "$@"
  if [ "$LAST_RC" != "$want" ]; then bad "$name（期望 rc=$want 实得 $LAST_RC）" "$LAST"; return; fi
  case "$LAST" in *"$sub"*) ok "$name（rc=$want）";; *) bad "$name 输出缺 $sub" "$LAST";; esac
}
jassert() {  # jassert <名称> <python 断言表达式>（stdin 的 JSON，变量名 d）
  local name="$1" expr="$2"
  printf '%s' "$LAST" | python3 -c "
import json,sys
d=json.load(sys.stdin)
sys.exit(0 if ($expr) else 3)" 2>/dev/null
  if [ $? -eq 0 ]; then ok "$name"; else bad "$name 断言失败：$expr" "$LAST"; fi
}
no_pixels() {  # 拒绝取数时不许带像素/路径
  local name="$1"
  case "$LAST" in
    *'"value"'*|*'"path"'*) bad "$name 仍返回了像素/帧路径" "$LAST";;
    *) ok "$name 未返回像素值";;
  esac
}

echo "══ 票34 窗口归属回归 $(date '+%F %T') ══"
echo "① 快路径（默认，X11/EWMH）：真实窗口冒烟 + 延迟"
run "$ATOP" --json
jassert "快路径 checked=true 且 src=x11" "d['checked'] and d['src']=='x11'"
jassert "快路径 verdict ∈ {OK,OTHER_DESKTOP,OCCLUDED,NOT_FOUND,NOT_ATOP}" \
        "d['verdict'] in ('OK','OTHER_DESKTOP','OCCLUDED','NOT_FOUND','NOT_ATOP')"
jassert "快路径顶层 atop 由 verdict 推出（一致性）" "d['atop'] == (d['verdict']=='OK')"
jassert "快路径耗时 ≤150ms" "d.get('elapsed_ms', 999) <= 150"

echo "② 慢路径（--verify）/ 夹具：桌面 / 遮挡 / 最小化 / 栈顶 / 身份"
expect "同桌面+栈顶 → OK"                 0 '"verdict": "OK"' \
  env YS_ATTR_FIXTURE="$TMP/ok.txt" "$ATOP" --json
expect "原神在别的桌面 → OTHER_DESKTOP"   6 '"verdict": "OTHER_DESKTOP"' \
  env YS_ATTR_FIXTURE="$TMP/otherdesk.txt" "$ATOP" --json
expect "浏览器全屏盖住 → OCCLUDED"        7 '"verdict": "OCCLUDED"' \
  env YS_ATTR_FIXTURE="$TMP/occluded.txt" "$ATOP" --json
expect "小窗部分遮挡（14.6%）→ OK"        0 '"verdict": "OK"' \
  env YS_ATTR_FIXTURE="$TMP/partial.txt" "$ATOP" --json
expect "大窗在上未完全遮挡 → NOT_ATOP"    1 '"verdict": "NOT_ATOP"' \
  env YS_ATTR_FIXTURE="$TMP/notatop.txt" "$ATOP" --json
expect "最小化 → OCCLUDED"                7 '"verdict": "OCCLUDED"' \
  env YS_ATTR_FIXTURE="$TMP/minimized.txt" "$ATOP" --json
expect "标题带竖线+编辑器含「原神」→ 按 WM_CLASS 选中原神" 6 '"verdict": "OTHER_DESKTOP"' \
  env YS_ATTR_FIXTURE="$TMP/classfirst.txt" "$ATOP" --json
expect "只有编辑器、无原神 → NOT_FOUND"   2 '"verdict": "NOT_FOUND"' \
  env YS_ATTR_FIXTURE="$TMP/notfound.txt" "$ATOP" --json
run env YS_ATTR_FIXTURE="$TMP/notfound.txt" "$ATOP" --json
jassert "NOT_FOUND ⇒ 顶层 atop=false（Lead 要求的一致性）" "d['verdict']=='NOT_FOUND' and d['atop'] is False"

echo "③ ys-observe：拒绝取数（不抓屏）+ attribution 字段 + 一致性"
expect "OTHER_DESKTOP → rc=4"             4 '"error":"OTHER_DESKTOP"' \
  env YS_ATTR_FIXTURE="$TMP/otherdesk.txt" YS_OBSERVE_SKIP_GRAB=1 "$OBS" frame
no_pixels "OTHER_DESKTOP"
run env YS_ATTR_FIXTURE="$TMP/otherdesk.txt" YS_OBSERVE_SKIP_GRAB=1 "$OBS" frame
jassert "OTHER_DESKTOP 带 attribution 且 atop=false" \
        "d['attribution']['verdict']=='OTHER_DESKTOP' and d['attribution']['atop'] is False"
expect "OCCLUDED → rc=5"                  5 '"error":"OCCLUDED"' \
  env YS_ATTR_FIXTURE="$TMP/occluded.txt" YS_OBSERVE_SKIP_GRAB=1 "$OBS" frame
no_pixels "OCCLUDED"
expect "NOT_ATOP → rc=2"                  2 '"error":"NOT_ATOP"' \
  env YS_ATTR_FIXTURE="$TMP/notatop.txt" YS_OBSERVE_SKIP_GRAB=1 "$OBS" frame
no_pixels "NOT_ATOP"
expect "NOT_FOUND → rc=2（拒绝，不再 atop:true）" 2 '"error":"NOT_ATOP"' \
  env YS_ATTR_FIXTURE="$TMP/notfound.txt" YS_OBSERVE_SKIP_GRAB=1 "$OBS" frame
expect "归属 OK 时允许取数（skip-grab 证明前置通过）" 0 '"skipped":true' \
  env YS_ATTR_FIXTURE="$TMP/ok.txt" YS_OBSERVE_SKIP_GRAB=1 "$OBS" frame
run env YS_ATTR_FIXTURE="$TMP/ok.txt" YS_OBSERVE_SKIP_GRAB=1 "$OBS" frame
jassert "顶层 atop == (attribution.verdict==OK) 且带 attribution_ms" \
        "d['atop'] == (d['attribution']['verdict']=='OK') and isinstance(d.get('attribution_ms'), int)"
jassert "快路径 attribution_ms ≤100ms" "d['attribution_ms'] <= 100"

echo "④ 旧行为不回归：坏窗口 id 仍 rc=3"
expect "坏窗口 id"                        3 '"error":"WINDOW_NOT_FOUND"' \
  env YS_WIN=0x09999999 YS_OBSERVE_SKIP_GRAB=1 "$OBS" px 1 1

echo "────────────────"
if [ "$FAIL" -gt 0 ]; then echo "✗ $FAIL 项失败 / $PASS 项通过"; exit 1; fi
echo "✓ 全绿（$PASS 项）"
