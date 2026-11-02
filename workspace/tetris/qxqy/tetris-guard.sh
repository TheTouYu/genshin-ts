#!/usr/bin/env bash
# qxqy/tetris-guard.sh —— 交付前的一键体检（把踩过的坑变成可执行闸门）
#
# 用法：bash qxqy/tetris-guard.sh [--fast]
#   --fast  跳过全量模拟器（约 5 分钟），只跑静态检查 + headless
#
# 退出码 0 = 全部通过。每条闸门对应一次真实事故，别删。
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1

FAST=0
[ "${1:-}" = "--fast" ] && FAST=1
SELFTEST=0
[ "${1:-}" = "--selftest" ] && { SELFTEST=1; FAST=1; }

# ---- --selftest：注入故障，闸门必须红；否则说明闸门空转（本项目踩过"门禁看着绿其实没在判"）----
if [ "$SELFTEST" = "1" ]; then
  SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/qxqy/tetris-guard.sh"
  echo "== SELFTEST：注入故障，闸门必须报红（self=$SELF）=="
  bad_gates=0
  t1() { # 空转 API
    cp lua/tetris/app.lua /tmp/.gs_app.bak
    awk '/  function A\.overlay\(\)/ && !done { print "  function A.__selftestGhost() return 1 end"; done=1 } { print }' \
      lua/tetris/app.lua > /tmp/.gs_app.new && mv /tmp/.gs_app.new lua/tetris/app.lua
    out=$(bash "$SELF" --fast 2>&1); if printf "%s" "$out" | grep -q '空转 API'; then echo "  ✅ 闸门3 抓到注入的空转 API"
    else echo "  ❌ 闸门3 没抓到空转 API"; bad_gates=$((bad_gates+1)); fi
    cp /tmp/.gs_app.bak lua/tetris/app.lua
  }
  t2() { # 字段缺失
    cp tests-lua/run_cases.lua /tmp/.gs_rc.bak
    sed -i "/imageColor = engine:field_of/d" tests-lua/run_cases.lua
    out=$(bash "$SELF" --fast 2>&1); if printf "%s" "$out" | grep -q 'shim 缺 imageColor'; then echo "  ✅ 闸门5 抓到字段缺失"
    else echo "  ❌ 闸门5 没抓到字段缺失"; bad_gates=$((bad_gates+1)); fi
    cp /tmp/.gs_rc.bak tests-lua/run_cases.lua
  }
  t3() { # 框架漂移
    cp lua/tetris/render.lua /tmp/.gs_render.bak
    echo "-- selftest drift" >> lua/tetris/render.lua
    out=$(bash "$SELF" --fast 2>&1); if printf "%s" "$out" | grep -q '框架副本已漂移'; then echo "  ✅ 闸门2 抓到框架副本漂移"
    else echo "  ❌ 闸门2 没抓到框架副本漂移"; bad_gates=$((bad_gates+1)); fi
    cp /tmp/.gs_render.bak lua/tetris/render.lua
  }
  t1; t2; t3
  echo
  if [ "$bad_gates" -eq 0 ]; then echo "GUARD-SELFTEST PASS（3 条闸门都真的会响）"; exit 0
  else echo "GUARD-SELFTEST FAIL: $bad_gates 条闸门空转"; exit 1; fi
fi

fail=0
ok()   { printf '  ✅ %s\n' "$1"; }
bad()  { printf '  ❌ %s\n' "$1"; fail=$((fail+1)); }

echo "== 1. Lua 语法（全部模块）=="
if luac5.3 -p lua/*.lua lua/tetris/*.lua 2>/dev/null; then ok "luac5.3 -p 全部通过"
else bad "Lua 语法错误（见上）"; fi

echo "== 2. 框架副本漂移（frameworks/qxqy-ui 必须与游戏实现一致）=="
if out=$(bash ../../frameworks/qxqy-ui/sync-check.sh 2>&1); then ok "框架副本一致"
else bad "框架副本已漂移：$(echo "$out" | tail -2 | tr '\n' ' ')"; fi

echo "== 3. 空转 API（有实现有单测但生产没调用）=="
# 事故：app 有 15 个 API 生产只用 5 个，导致"棋盘不丢有机制保护"的错误归因。
# 判据：app.lua 里每个 function A.xxx 都应在 main/模块里被调用（scene→A 别名除外）。
# 内部访问器与"给调用方注入用"的 API 不算空转（它们由主流程/测试以外的方式使用）
SKIP_APIS=" register dispatcher bindInput overlayRenderFor baseName overlayRender scenes stats "
missing=""
for api in $(grep -o 'function A\.[a-zA-Z_][a-zA-Z0-9_]*' lua/tetris/app.lua | sed 's/function A\.//'); do
  case "$SKIP_APIS" in *" $api "*) continue;; esac
  # ⚠️ 必须在**排除 app.lua 本身**的前提下统计：app.lua 里的 `function A.xxx` 与内部自调用
  # 会让计数恒 >0，闸门就永远绿（2026-11-02 实测踩到：注入一个假 API 后闸门仍报"全部有调用"）。
  n=$(grep -h "APP\.$api(" lua/main.lua $(ls lua/tetris/*.lua | grep -v "/app.lua$") 2>/dev/null | grep -v "function A\." | wc -l)
  [ "$n" -eq 0 ] && missing="$missing $api"
done
if [ -z "$missing" ]; then ok "app 的 API 全部有生产调用"
else bad "空转 API（有实现没人用）：$missing"; fi

echo "== 4. headless 单测（L0，秒级）=="
if lua5.3 tests-lua/run_all.lua > /tmp/guard-l0.log 2>&1; then
  ok "$(grep -o 'headless: [0-9]*/[0-9]* files green' /tmp/guard-l0.log | tail -1)"
else bad "headless 单测有红：$(grep '^failed' /tmp/guard-l0.log | tail -1)"; fi

echo "== 5. 双通道口径（模拟器与 shim 暴露的控件字段必须一致）=="
# 事故：两边都只给 9 个标量，读 imageColor 恒为 nil ⇒ 断言恒真（假绿）。
sim_fields=$(grep -A20 'control(name) {' studio_dummy 2>/dev/null | grep -c 'imageColor:' || true)
shim_fields=$(grep -c 'imageColor = engine:field_of' tests-lua/run_cases.lua || true)
if [ "${shim_fields:-0}" -ge 1 ]; then ok "shim 暴露 imageColor（与模拟器对齐）"
else bad "shim 缺 imageColor 字段 ⇒ 读颜色的断言会恒真"; fi

echo "== 6. 构建闸门（luac + locals 上限）=="
if node qxqy/build.mjs > /tmp/guard-build.log 2>&1; then
  ok "$(grep -o 'main locals *: [0-9]*/[0-9]*' /tmp/guard-build.log | tail -1)"
else bad "构建失败（见 /tmp/guard-build.log）"; fi

if [ "$FAST" -eq 0 ]; then
  echo "== 7. 模拟器全量（约 5 分钟）=="
  if node qxqy/runner.mjs > /tmp/guard-full.log 2>&1; then
    ok "$(grep -o '[0-9]*/[0-9]* 用例通过' /tmp/guard-full.log | tail -1)"
  else bad "模拟器用例有红（见 /tmp/guard-full.log）"; fi
else
  echo "== 7. 模拟器全量：已跳过（--fast）=="
fi

echo
if [ "$fail" -eq 0 ]; then echo "GUARD PASS"; exit 0
else echo "GUARD FAIL: $fail 条"; exit 1; fi
