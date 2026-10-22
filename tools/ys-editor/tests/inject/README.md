# tests/inject/ — 失败账本的**真注入用例**

## 为什么有这一层（2026-10-22）

`failure-ledger check` 原来有 **15 条账目的 `inject` 字段就是它自己那条门禁命令**（如
F-3-04 `gate=probe`，`inject` 也写 `probe-selftest.sh`）。这不是注入——没造任何故障，
只是把刚跑过的门禁再跑一遍，**恒绿**。方向反了：账本看起来是绿的，实际防线从未被检验过。

现在 `tools/failure-ledger` 会静态识别这种「假注入」（`check --audit-inject`，毫秒级）
并拒绝记成通过。本目录放**替换它们**的真注入脚本。

## 一条注入用例要满足什么

| 要求 | 判据 |
|---|---|
| **真的造故障** | 先改动被测对象（源文件 / 环境变量 / 夹具），再跑门禁 |
| **门禁必须报红** | 注入后门禁退出码 ≠ 0 |
| **红的必须是那一条** | 输出里要能看到**预期的那条断言**（不是别的崩了）——只判 rc 不够 |
| **绝不污染仓库** | `trap` 还原源文件；跑完 `git status --short` 必须干净 |
| **快** | 只跑受影响的那条用例（给套件加 `--only <case>`），不要重跑整份套件 |
| **可重复** | 连跑两次结果一致；锚点改动过要显式报 `INJECT-BROKEN` 而不是静默失效 |

## 模板（照抄这个形状）

```bash
#!/bin/bash
# inject/<name>-neg.sh — F-xxx 的注入用例（证明 <gate> 门禁不是空转）
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"; cd "$ROOT" || exit 3
f="<被注入的源文件>"; bak="$(mktemp)"; log="$(mktemp)"
cp "$f" "$bak"
trap 'cp "$bak" "$f"; rm -f "$bak" "$log"' EXIT

python3 - "$f" <<'PY' || exit 3
import sys
p = sys.argv[1]; s = open(p, encoding='utf-8').read()
old = "……原文……"
new = "……造故障后的样子……"
if s.count(old) != 1:                       # 锚点必须全文唯一，否则 injection 会打错地方
    print('INJECT-BROKEN 锚点不唯一或已失效', file=sys.stderr); sys.exit(3)
open(p, 'w', encoding='utf-8').write(s.replace(old, new))
PY

bash tools/ys-editor/tests/<suite> --only <case> >"$log" 2>&1 && {
  echo "INJECT-FAIL <name>-neg: 造了故障门禁仍绿（门禁空转）"; exit 1; }
grep -q '✗ <预期的断言名>' "$log" || {
  echo "INJECT-FAIL <name>-neg: 变红但不是预期那条（判据串了）"; tail -4 "$log"; exit 1; }
echo "INJECT-PASS <name>-neg: <一句话说清造了什么故障 ⇒ 哪条报红>"
```

已落地的参考实现：`inject/probe-neg.sh`（11.6s，INJECT-PASS）。

## 边界

- **不要改** `docs/maintenance/failure-ledger.tsv`（账本接线由 Lead 统一做，避免并发写冲突）。
- **不要往** `tests/ledger-inject.sh` 里加模式（那是共享文件）。新用例一律放本目录独立文件。
- 注入**不许真的动屏幕**：需要窗口的套件用它们已有的测试缝（`YS_SLOT_TEST=1` /
  `YS_KWIN_JS_FIXTURE` / `YS_LEASE_BIN` 等），别把门禁变成"偷偷占屏"。
- 锚点唯一性必须验证；`replace(..., 1)` 打中同文件的另一处会让套件崩在 TypeError 而不是
  目标断言上——那是**假红**，比空转更浪费时间。
