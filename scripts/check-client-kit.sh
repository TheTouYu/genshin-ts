#!/usr/bin/env bash
# check-client-kit.sh —— client-kit 抽离库的编译自证（**离线，不写游戏文件**）
#
# 门禁内容（任一不满足 → 退出码 1）：
#   1. dist CLI 存在（客户端图编译必须走 dist 单副本；用 npx tsx src/cli 会踩 src/dist 分裂 → IR 恒为空）
#   2. `--noinject` 编译 examples/client-kit 成功（exit 0）
#   3. selfcheck.json 含 1 张图，graph.id = 1082130499
#   4. 关键节点在位：query_skill_variable_value / set_skill_variable / get_custom_variable / double_branch
#   5. 不含信号节点（自证图必须"任意地图可编"）
#   6. dist/selfcheck.gia 已产出（id=1082130499）
#
# 为什么要有这条门禁：抽离出来的库如果只被写明、没被真编译，就等于没抽出（"只写不接"）。
set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KIT="$REPO/examples/client-kit"
CLI="$REPO/dist/src/cli/gsts.js"
FAIL=0
say() { printf '%s\n' "$*"; }
bad() { say "FAIL $*"; FAIL=1; }

[ -f "$CLI" ] || { bad "dist CLI 不存在：$CLI（先 npm run build）"; exit 1; }

cd "$KIT" || exit 1
export GSTS_LOCALLOW_DIR="${GSTS_LOCALLOW_DIR:-$HOME/.local/share/anime-game-launcher/prefix/drive_c/users/h/AppData/LocalLow}"
rm -rf "$KIT/dist"

if ! timeout 240 node "$CLI" --config ./gsts.kit.config.ts --noinject > /tmp/client-kit-compile.log 2>&1; then
  bad "编译失败（exit≠0），日志尾部："
  tail -12 /tmp/client-kit-compile.log
  exit 1
fi
grep -q "id=1082130499" /tmp/client-kit-compile.log || bad "编译日志里没有 GIA id=1082130499"
grep -q "GIA 全部生成完成（1 个）" /tmp/client-kit-compile.log || bad "GIA 数量 ≠ 1"

python3 - "$KIT/dist/selfcheck.json" <<'PY' || FAIL=1
import json, sys

path = sys.argv[1]
try:
    docs = json.load(open(path))
except FileNotFoundError:
    print(f"FAIL 缺少 IR 产物：{path}")
    sys.exit(1)

if not isinstance(docs, list) or len(docs) != 1:
    print(f"FAIL 期望 1 张图，实得 {len(docs) if isinstance(docs, list) else type(docs).__name__}")
    sys.exit(1)

doc = docs[0]
gid = (doc.get("graph") or {}).get("id") or ((doc.get("graph") or {}).get("inner") or {}).get("graph", {}).get("id")
if gid != 1082130499:
    print(f"FAIL graph.id={gid}（期望 1082130499）")
    sys.exit(1)

nodes = doc.get("nodes") or []
counts: dict[str, int] = {}
for n in nodes:
    kind = n.get("type") or n.get("nodeType") or ((n.get("genericId") or {}).get("nodeId"))
    counts[str(kind)] = counts.get(str(kind), 0) + 1

need = {
    "query_skill_variable_value": 3,   # 自持组读
    "set_skill_variable": 7,           # 自持组写 + 拍号
    "get_custom_variable": 12,         # 邮箱 epoch/ack/sum/t1..t8
    "double_branch": 4,                # 邮箱门 / 载荷类型 / 新任务 / 落地
    "get_corresponding_value_from_list": 1,  # owner 取玩家[0]
}
fails = []
for kind, minimum in need.items():
    got = counts.get(kind, 0)
    if got < minimum:
        fails.append(f"{kind}: {got} < {minimum}")
for kind, got in counts.items():
    if "signal" in kind.lower():
        fails.append(f"自证图不应含信号节点：{kind}×{got}")

if len(nodes) < 40:
    fails.append(f"节点总数 {len(nodes)} < 40（抽离壳没被真编进图？）")

print(f"nodes={len(nodes)} graph={gid}")
print("  " + ", ".join(f"{k}×{v}" for k, v in sorted(counts.items(), key=lambda x: -x[1])[:8]))
if fails:
    for f in fails:
        print(f"FAIL {f}")
    sys.exit(1)
PY

[ -f "$KIT/dist/selfcheck.gia" ] || bad "缺少 GIA 产物 dist/selfcheck.gia"

if [ "$FAIL" -eq 0 ]; then
  say "CLIENT-KIT-RESULT pass=1 verdict=PASS（编译自证：1 图 / 关键节点在位 / 无信号依赖）"
  exit 0
fi
say "CLIENT-KIT-RESULT verdict=FAIL"
exit 1
