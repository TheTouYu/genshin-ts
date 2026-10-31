#!/usr/bin/env bash
# 漂移检查：frameworks/qxqy-ui 与参考实现 workspace/tetris 的框架文件必须逐字节一致。
#
# 为什么需要它：框架是"复制出去复用"的资产，而 tetris 是每天都在跑的参考实现。
# 两边一旦分叉，就会出现"框架里修了、游戏里没修"或反之，而两边测试各自都绿。
# 判据：本脚本 exit 0 才算一致；不一致时打印哪几个文件、以及 diff 摘要。
#
# 用法：bash frameworks/qxqy-ui/sync-check.sh [--sync]
#   --sync  以 tetris 为准覆盖框架副本（tetris 永远是先落地验证过的那一侧）
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FW="$ROOT/frameworks/qxqy-ui/lua/qxqy_ui"
REF="$ROOT/workspace/tetris/lua/tetris"
MODE="${1:-check}"

MODULES="platform view_layers view_node render scenes app view_kit"

drift=0
for m in $MODULES; do
  a="$FW/$m.lua"
  b="$REF/$m.lua"
  [ -f "$a" ] || { echo "MISSING framework: $a"; drift=$((drift+1)); continue; }
  [ -f "$b" ] || { echo "MISSING reference: $b"; drift=$((drift+1)); continue; }
  if ! cmp -s "$a" "$b"; then
    drift=$((drift+1))
    if [ "$MODE" = "--sync" ]; then
      cp "$b" "$a"
      echo "synced $m.lua  (reference -> framework)"
    else
      echo "DRIFT  $m.lua  ($(diff -u "$b" "$a" | grep -c '^[+-]' ) changed lines)"
    fi
  fi
done

if [ "$MODE" = "--sync" ]; then
  echo "== sync done; 请跑 frameworks/qxqy-ui/tests/run_all.lua 确认仍绿 =="
  exit 0
fi

if [ "$drift" -eq 0 ]; then
  echo "== qxqy-ui sync: OK（$MODULES 全部一致）=="
  exit 0
fi
echo "== qxqy-ui sync: DRIFT $drift 个文件 =="
echo "（以 tetris 为准同步：bash frameworks/qxqy-ui/sync-check.sh --sync）"
exit 1
