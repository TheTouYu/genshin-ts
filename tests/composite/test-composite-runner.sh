#!/bin/bash
# 复合节点完整测试运行器
# 每个 Part 在独立进程中运行，避免全局注册表状态污染

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$ROOT_DIR"

echo ""
echo "========================================="
echo " 复合节点完整测试套件"
echo " 覆盖 3 次提交：基础定义 + 捕获 + 调用"
echo "========================================="
echo ""

TOTAL_PASSED=0
TOTAL_FAILED=0

run_part() {
    local name="$1"
    local script="$2"

    echo ""
    echo "========================================="
    echo " 运行 $name"
    echo "========================================="
    echo ""

    if npx tsx "$script"; then
        echo ""
        echo "  ✅ $name 通过"
    else
        echo ""
        echo "  ❌ $name 有失败项"
        TOTAL_FAILED=$((TOTAL_FAILED + 1))
    fi

    TOTAL_PASSED=$((TOTAL_PASSED + 1))
}

# Part 3 先跑（快速单元测试）
run_part "Part 3: 单元级行为验证" "tests/composite/test-composite-part3.ts"

# Part 1（GIA 对比，可能有路径依赖）
run_part "Part 1: 复合定义 GIA 精确对比" "tests/composite/test-composite-part1.ts"

# Part 2（最重型，设施图测试）
run_part "Part 2: 完整设施图（定义+调用）" "tests/composite/test-composite-part2.ts"

echo ""
echo "========================================="
echo " 测试完成"
echo " 分区: $TOTAL_PASSED"
if [ $TOTAL_FAILED -gt 0 ]; then
    echo " ❌ $TOTAL_FAILED 个分区有失败"
    exit 1
else
    echo " ✅ 所有分区通过"
fi
echo "========================================="
echo ""
