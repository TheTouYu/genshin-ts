#!/usr/bin/env bash
# qxqy-ui bootstrap：把框架装进一个新工程
#   ./bootstrap.sh /path/to/new-game [--force]
# 产出：<目标>/lua/qxqy_ui/*.lua 与 <目标>/tests/*.lua（不覆盖已存在的文件，除非 --force）
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DST="${1:?用法: bootstrap.sh <新工程目录> [--force]}"
FORCE="${2:-}"

mkdir -p "$DST/lua/qxqy_ui" "$DST/tests"

copy() {
  local s="$1" d="$2"
  if [ -e "$d" ] && [ "$FORCE" != "--force" ]; then
    echo "skip  $d（已存在；--force 覆盖）"
  else
    cp "$s" "$d"
    echo "write $d"
  fi
}

for f in platform view_layers view_node render scenes app view_kit; do
  copy "$SRC/lua/qxqy_ui/$f.lua" "$DST/lua/qxqy_ui/$f.lua"
done
for f in view_kit_test scenes_test app_test run_all; do
  copy "$SRC/tests/$f.lua" "$DST/tests/$f.lua"
done

echo
echo "下一步（在新工程目录里）："
echo "  1) lua5.3 tests/run_all.lua    # 期望 '== qxqy_ui framework: ALL GREEN =='"
echo "  2) 把 README.md §3 的模块接进你的构建（lua/tetris 里按平铺文件扫描的项目，"
echo "     需要让构建脚本也扫 lua/qxqy_ui，或把文件平铺拷到你的模块目录）"
echo "  3) 先写一个 view_*，用 view_node.lint 断言，再谈真机"
