#!/usr/bin/env bash
# 把本工程追加到模拟器 Web 的存档列表（不重启模拟器服务器）
# 用法: bash qxqy/install-sim-save.sh [workspace]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WS="${1:-/home/h/qxqy-workspace}"
[ -d "$WS" ] || { echo "simulator workspace not found: $WS" >&2; exit 1; }
cp "$ROOT/flower-tea.save.json" "$WS/花间茶会.save.json"
echo "installed: $WS/花间茶会.save.json"
echo "refresh http://127.0.0.1:4173 archive picker; name should be 花间茶会"
