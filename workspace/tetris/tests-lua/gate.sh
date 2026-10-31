#!/usr/bin/env bash
# ============================================================================
# tests-lua/gate.sh —— 重构期的验证闸门（一条命令跑完「该跑的」，并按级汇报）
#
# 为什么要有它：这个项目的验证分成四级（见 docs/ARCH.md §6），成本差三个数量级：
#   L0 headless 单测         ~0.05s
#   L1 模拟器用例（需 build）  ~390s/70 例（子集 1~8s/例）
#   L2 出图                    ~16s/30 张
#   L3 真机                    分钟级 + 破坏性
# 以前每次都要人到「该跑到哪一级」，于是要么漏跑（假绿），要么全跑（慢到不敢改）。
#
# 用法：
#   tests-lua/gate.sh              # 默认：L0 全量 + build + L1 快速子集
#   tests-lua/gate.sh fast         # 同上
#   tests-lua/gate.sh full         # L0 + build + L1 全量 70 例
#   tests-lua/gate.sh shots        # L0 + build + L1 子集 + L2 出图
# 退出码：0=全绿；非 0=有失败（并打印是哪一级）
# ============================================================================
set -u
cd "$(dirname "$0")/.." || exit 2

MODE="${1:-fast}"
FAILED=""
LOG_DIR=".scratch/gate"
mkdir -p "$LOG_DIR"

step() { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }
fail() { FAILED="$FAILED $1"; printf '\033[31m✗ %s\033[0m\n' "$1"; }
pass() { printf '\033[32m✓ %s\033[0m\n' "$1"; }

# ---------- L0：headless（纯逻辑/几何/层序/文案） ----------
step "L0 headless 单测"
if lua5.3 tests-lua/run_all.lua > "$LOG_DIR/l0.log" 2>&1; then
  tail -1 "$LOG_DIR/l0.log"
  pass "L0"
else
  tail -20 "$LOG_DIR/l0.log"
  fail "L0 headless"
fi

# ---------- 构建（L1 的前置：runner 读的是存档里的 Lua 副本，不 build 就是假绿） ----------
step "build（lua 编译闸门 + 存档/GIA 产物）"
if node qxqy/build.mjs > "$LOG_DIR/build.log" 2>&1; then
  grep -E "main locals|lua compile|gia combined" "$LOG_DIR/build.log" | sed 's/^/  /'
  pass "build"
else
  tail -20 "$LOG_DIR/build.log"
  fail "build"
fi

# ---------- L1：模拟器用例 ----------
run_case() {
  local pat="$1"
  if node qxqy/runner.mjs "$pat" > "$LOG_DIR/case-$pat.log" 2>&1; then
    printf '  \033[32m✓\033[0m %s\n' "$pat"
  else
    printf '  \033[31m✗\033[0m %s\n' "$pat"
    grep -E "FAIL|断言" "$LOG_DIR/case-$pat.log" | head -6 | sed 's/^/    /'
    FAILED="$FAILED case:$pat"
  fi
}

step "L1 模拟器用例"
if [ "$MODE" = "full" ]; then
  if node qxqy/runner.mjs > "$LOG_DIR/l1-full.log" 2>&1; then
    tail -1 "$LOG_DIR/l1-full.log"; pass "L1 全量"
  else
    tail -20 "$LOG_DIR/l1-full.log"; fail "L1 全量"
  fi
else
  # 快速子集：棋盘几何 / 出块 / 玩法主循环 / 消行计分 / 重开 / 说明页
  for pat in 01 14 02 04 06 07; do run_case "$pat"; done
fi

# ---------- L2：出图（可选） ----------
if [ "$MODE" = "shots" ]; then
  step "L2 出图 5 画布 × 6 屏"
  if node qxqy/shots-v5.mjs --all --out "$LOG_DIR/shots" > "$LOG_DIR/l2.log" 2>&1; then
    tail -2 "$LOG_DIR/l2.log" | sed 's/^/  /'
    pass "L2（图像仍需人眼核对）"
  else
    tail -10 "$LOG_DIR/l2.log"; fail "L2 出图"
  fi
fi

printf '\n=============================================\n'
if [ -z "$FAILED" ]; then
  printf '\033[32mGATE PASS\033[0m  mode=%s  日志: %s/\n' "$MODE" "$LOG_DIR"
  exit 0
else
  printf '\033[31mGATE FAIL\033[0m  失败项:%s\n' "$FAILED"
  exit 1
fi
