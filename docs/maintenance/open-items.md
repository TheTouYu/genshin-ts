# 复盘账本（Review Ledger）

复盘发现项的**带状态追踪**：复盘开始先查本文件 + `git log --oneline -20`，**已落地（DONE）的项直接跳过，不重复分析**；未落地（OPEN）项才是本次复盘的分析对象。

## 使用说明（复盘/派活前必读）

1. 查 `git log --oneline -20`：最近的落地提交（如"复盘落地"）= 已处理过的问题集合，读提交信息即可知道覆盖了什么。
2. 查本文件：DONE 区已登记的项不再分析；OPEN 区是待办。
3. 复盘产出新发现 → 落地后登记 DONE（日期 + 证据 + 落地方式），未落地登记 OPEN。
4. 保持轻量：每条 1-3 行，只记"发现 + 证据 + 落地方式"，不复制细节（细节在提交 diff 里）。

## 已落地（DONE）

### 2026-08-12 四技能专项复盘（本轮，commit 75c2541）

| 发现 | 证据 | 落地方式 |
|---|---|---|
| reading 技能缺 parse --json 输出键名速查（子代理 42 次 python -c 探测结构） | cube-v5/eval-main、eval-bindhold trace | `gil-node-graph-reading/SKILL.md` Step 2.6（真实键名：input/target/graph/status/discovery + nodes/dataflow/flow） |
| reading 技能缺节点名→ID 查询速查（turn-ctl 审计建议只落了写技能） | skill-audit-report.md #6 | `gil-node-graph-reading/SKILL.md` Step 2.7（grep + python 解析，与写技能同源） |
| editing 技能 parse --json 行无键名指引 | 同上 | 该行补交叉引用 Step 2.6 |
| debug-log 技能脚本路径指引不清（子代理 find 3 轮） | eval-loglab-r3-parse trace | `debug-log-investigator/SKILL.md` 补绝对路径 + 旧位置警告 |
| production-workflow 缺 maps/entities export 键名速查（cube-blocks5 16 次探测） | gil-eval-cube-blocks5 trace | `production-workflow.md` 补实测键名 |
| 等角螺线 V9→V11 缝隙处理演进未沉淀 | spiral-v12-eval + 会话 019fef2f 用户反馈 | `curve-path-decoration.md` 新增节（V11 楔子方案真实样本确认；V11.1 标注未定稿） |

### 2026-08-11 及之前已落地（git log 索引，详情见提交）

- `7c2f124` 魔方重构系列 2-5 轮复盘落地（tooling+skills）
- `745e339` V10 派活复盘：production-workflow 补 inspect JSON 键名速查 + root-diff-summary 管道用法
- `221899a` ops 表补 node-add 4 参/add-inflow 闭合标记 + diff-gil-files CompositeDef 记录级比对
- `f499993` 等角螺线 V4-V7 经验（曲线铺放/圆柱横放/箭头比例/ID 双查/--gil 导入）
- `42ab3ab` debug-log gia_log.py v2（图名/节点名/Vector/枚举解码 + dump_gil_index.ts）
- `dae3b1f` 文件级 diff / 清空图 / 跨图复制 op（turn-ctl 复盘 11 个自写脚本 → 3 个正式能力）
- `205b88f` cases/node-copy/graph-var-add ops + 图变量注册/Str 变体 Set/DoubleBranch 语义闭合

## 未落地（OPEN）

### O1. GIA 解析/编码无独立 CLI（已由 genshin-model-studio 覆盖，登记为指针）

- 证据：`/tmp/gms-eval-b/trace.jsonl`——子代理 100 次手写脚本自建 parser；结论已落入 `/home/h/genshin-model-studio/docs/gia-format.md` + `src/gia/`。
- 期望形态：genshin-ts 内如需解析 .gia，复用 genshin-model-studio/src/gia/。
- 何时做：出现 genshin-ts 内部 GIA 解析需求时（目前无）。

### O2. 图变量跨图复制仍是临时脚本

- 证据：`gil-node-graph-editing/SKILL.md` 已标注"图变量跨图复制仍是临时脚本（f6 记录搬移）"。
- 期望形态：`node-copy-from` 扩展支持 graph variables，或技能给出可复制的 f6 搬移模板。
- 何时做：再次出现跨图复制图变量需求时（turn-ctl 已用过一次）。

### O3. 等角螺线 V11.1 动态放大/少转一圈未定稿

- 证据：`/tmp/spiral-v12-eval/` + 会话 019fef2f 用户反馈（三角形突出、内圈凸起）。
- 期望形态：用户重新分析结论闭合后，补入 `curve-path-decoration.md` 的 V11.1 小节（当前已标注"未定稿"）。
- 何时做：用户给出下一轮反馈并核验通过后。
