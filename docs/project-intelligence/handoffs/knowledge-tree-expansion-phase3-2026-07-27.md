# Knowledge Tree Expansion Phase 3 Handoff

> 状态：当前工作状态 / 下一会话恢复记录
> 来源：Phase 0–3 已批准并应用的 PKC Bundle + apply 后自动验证 + 当前工作树审计
> 最近校验：2026-07-27
> 适用范围：继续执行 `docs/project-intelligence/knowledge-tree-expansion-plan.md` 的 Phase 4–Phase 6；本文不是稳定 Claim，不替代源码、测试、Authority Ref、真实 GIA/GIL 或游戏证据

## 1. 当前恢复点

Phase 0–3 已完成。下一工作包从 **Phase 4：CLI、Injector 与资产工作流覆盖审计** 开始，之后继续 Phase 5–6。

前序 handoff：

- `docs/project-intelligence/handoffs/knowledge-tree-expansion-phase2-2026-07-27.md`

前序文件保留 Phase 0–2 和 Phase 3 执行背景，但其中的 Phase 3 启动提示已经被本文取代。当前范围、数量、Bundle 状态和下一步以本文为准。

## 2. 新会话冷启动顺序

不要先加载整个 `docs/`、`knowledge/`、Authority Ref 表或源码树：

1. 读取根 `AGENTS.md` 和 `docs/AGENTS.md`。
2. 运行 `git status --short --branch`，保护本文第 6 节登记的全部变化。
3. 读取：
   - `.agents/skills/genshin-ts-project-adapter/SKILL.md`
   - `docs/project-intelligence/contexts/compiler-diagnostics.md`
   - 本 handoff
   - `docs/project-intelligence/knowledge-tree-expansion-plan.md`
4. Phase 4 第一个工作包默认限定为“通用 CLI/config/build 与 Injector/资产路径的**只读覆盖审计**”，使用 Project Adapter 选择唯一 Primary Context：`compiler-diagnostics`。
5. 运行基线查询：

   ```bash
   python tools/pkc.py progressive-query \
     --context compiler-diagnostics \
     --intent '继续知识树扩大计划 Phase 4，只读审计 CLI config build、GIA NodeGraph injector、GIL 变量资产与 signal folder 路径，不读取真实目标、不注入、不写回' \
     --max-level 2 --limit 3 --check-authority
   ```

6. 若返回 ambiguity 或 coverage gap，记录为 Phase 4 基线；不要强行选择无关 Topic。只读取返回的 `minimum_files`。
7. 按任务加载最小 skill/reference：
   - CLI/config：`.agents/skills/composite-docs-navigator/references/cli-config.md`
   - Injector、`.gia`、`.gil`、mapId/nodeGraphId：再读 `.agents/skills/composite-docs-navigator/references/game-map-injection.md` 和 `.agents/skills/composite-docs-navigator/references/evidence-levels.md`
   - 文档与覆盖同步：`composite-docs-maintainer`
   - 源码结构、入口和影响：`codebase-memory`
8. 不直接访问 SQLite，不选择、安装或替换 PKC runtime，不扫描无关 `/mnt/`。

### Context 分流边界

一次只能选择一个 Primary Context，不能静默跨 Context 组合：

- 通用 CLI/config/build、NodeGraph injector 架构、变量资产和 signal/folder 的只读知识覆盖审计：`compiler-diagnostics`。
- 明确的静态 `.gil` 拼装、真实地图目标、候选、写回、注入/覆盖或游戏验证：`static-gil-assembly-production`，并重新按该 Context 的恢复入口启动。
- 若自然语言同时要求通用架构审计和真实地图操作，停止并要求拆分工作包；知识查询不构成操作授权。

## 3. Phase 3 已完成内容

新增 Node：

```text
compiler-pipeline-runtime-ir
```

新增并填充 5 个 Topic，每个已有 1 条 scoped Claim 和 committed Authority：

- `stage1-expression-local-variable-semantics`
- `stage2-runtime-ir-production`
- `typed-ir-server-client-contract`
- `stage3-materialization-seams`
- `structured-diagnostics-stage-localization`

稳定边界：

1. Stage 1 先做表达式语义分类，再执行 checked LocalVariable lowering；完整 Composite 结果、timer/flow marker 和未支持对象不能被猜成任意可存储值。
2. Stage 2 在隔离子进程中执行每个 `.gs.ts` 入口，从 runtime registry/value/metadata 构建 IR；它不直接编码 GIA。
3. `src/runtime/IR.d.ts` 是 server/client 的 typed producer-consumer seam；共享基础形状不等于功能完全一致，当前 client IR 不写节点图变量，Composite 定义/调用属于 server IR。
4. Stage 3 区分 ordinary vendor materialization、compiler synthetic lowering 和 boundary overlay；client 文档单独分派。不能从最终 GIA 直接猜 Stage 1 根因。
5. 诊断先检查最早发生差异的 `.gs.ts`、IR 或 GIA 产物；结构化字段保留 source/entry/graph/node/Composite 上下文，但不能替代产物检查或升级为编辑器/游戏证据。

新增 6 条只读 route：5 条 focused route + 1 条三阶段 overview route。三阶段查询当前精确返回 Stage 1/2/3 三个 Topic，不超过预算：

```bash
python tools/pkc.py progressive-query \
  --context compiler-diagnostics \
  --intent '继续 Phase 3，定位三阶段编译管线与 Runtime/IR seam' \
  --max-level 2 --limit 3 --check-authority
```

## 4. 当前数量与验收

| 项目 | 当前 |
|---|---:|
| Project Memory Roles | 3 |
| Active Contexts | 2 |
| Nodes | 7 |
| Topics | 26 |
| Claims | 28 |
| Authority Refs | 47 |
| Intent Routes | 25 |
| 检索案例 | 56 |

最近 apply 后验收：

```text
python tools/pkc.py validate --format text       PASS
python tools/pkc.py tree --format text           PASS
python tools/evaluate_pkc_retrieval.py           56/56 PASS
git diff --check                                 PASS
```

指标：

```text
configured intent Top-1                 100%
known Topic natural-language Top-3      100%
dangerous wrong routes                  0
cross-context silent combinations       0
budget violations                       0
```

本轮未修改 TypeScript 生产代码，因此未运行 `npm run build`、`npm test` 或 TypeScript focused regression。未生成、读取或写入真实 GIA/GIL 目标，未执行编辑器或游戏验证。

## 5. Phase 3 Bundle 审计链

### 已批准并应用，后续应进入精确暂存/发布范围

```text
bnd_fbd6efb920eb4f1b5cdb9aea57
  fbd6efb920eb4f1b5cdb9aea57e44da260094607bd43c39433b498049672cccc
  Phase 3 structure

bnd_1aeba94ca6ffcae44d3e08c7c1
  1aeba94ca6ffcae44d3e08c7c1def3eb6340e246482bb3cd61e59f9f435721a0
  Phase 3 Claims and committed Authority

bnd_5e2b08de6343b3deb7cb0e4a3b
  5e2b08de6343b3deb7cb0e4a3b66f32cfc1db988430e3c06d384451e682f00c2
  Phase 3 routes, retrieval cases and documentation maps
```

每个 applied Bundle 的 `.json`、`.approval.json` 和 `.applied.json` 都必须保留。

### 批准前失败，已被最终修正版取代

```text
bnd_336cd90d3179fc0e781d69ad55
  336cd90d3179fc0e781d69ad55fc4f64aabcb54c176240acb07e81a308cd4616
  49/56：metadata 过宽、route 重叠、覆盖外误判

bnd_016422230085d406094f9db95e
  016422230085d406094f9db95e032426163ecab5cbb3d9672ac35179ae939f3f
  54/56：Stage 2 metadata 干扰既有 Composite 检索，只读 overview 未精确路由
```

不要批准、apply 或纳入最终正常发布提交。失败原因已记录在最终修正版 Bundle 的 evidence 中；不要伪造 runtime `supersedes` 字段。

Phase 0–2 的 applied/failed Bundle 清单继续见前序 Phase 2 handoff 第 4 节。

## 6. 工作树保护与提交边界

当前：

```text
branch: feat/composite
HEAD: 6f11a314fb812967c4394881a4ae1c7954132dcb
subject: feat: expand project knowledge tree
```

任务开始前已有且不得覆盖、还原、清理或混入本计划提交的变化：

```text
M  docs/architecture/gil-static-model-assets.md
?? data/knowledge/bundles/bnd_963d573a945e12f4e043a03e6b.json
?? data/knowledge/bundles/bnd_963d573a945e12f4e043a03e6b.approval.json
?? dist-custom-variable-change-local-variable-optimization/
?? tests/__pycache__/
?? tools/__pycache__/
```

`bnd_963d...` 是任务开始前已有、已批准但未应用的 Bundle。不要擅自 apply、修改、删除、暂存或提交它。

工作树中的其余 PKC、knowledge、project-intelligence、文档地图、validator/test 和 Phase 0–3 Bundle 变化属于本知识树扩大计划，但仍不得在未经明确指示时 commit。不要执行 `reset`、`restore`、`clean`、分支切换、merge、rebase 或 cherry-pick。

最终完成 Phase 4–6 后：

1. 精确排除本节任务前既有变化和所有失败 Bundle；
2. 从 Git index 导出独立快照；
3. 在快照内运行 PKC validate/tree/retrieval evaluation、相关 focused tests 和 `git diff --check`；
4. 只有用户明确要求才 commit；不 push。

## 7. Phase 4 下一工作包

目标是先完成覆盖审计，再决定 Node/Topic 边界；不要照候选列表直接创建内容。

候选领域：

1. 通用 CLI/config/build orchestration：
   - `src/cli/gsts.ts`
   - `src/compiler/gsts_config.ts`
   - `src/compiler/config_loader.ts`
   - compile/dev/maps/build 路径
2. `.gia` NodeGraph injector：
   - `src/injector/index.ts`
   - `src/injector/binary.ts`
   - `src/injector/node_graph.ts`
   - mapId 与 nodeGraphId 分界、备份与目标确认
3. `.gil` 变量资产：
   - `src/cli/gil_custom_variables.ts`
   - 与 NodeGraph injection、静态模型 `.gil` 分析保持分离
4. Injector 专项路径：
   - `src/injector/signal_nodes.ts`
   - `src/injector/folder.ts`
   - `src/cli/gil_paths.ts`
5. 已覆盖范围的去重：
   - `static-gil-assets`
   - `game-map-writeback`
   - `validation-evidence`
   - `docs/architecture/gil-static-model-assets.md`
   - `docs/architecture/gil-custom-variables.md`
   - `docs/architecture/injector-system.md`

覆盖审计对每个 Domain 必须找到：当前权威文档、具体源码入口、focused test/tool、证据/安全边界。优先使用 codebase-memory，再用 `rg`/`read` 核对准确文本。

建议仍按最多三个不可变 Bundle 分批：

```text
structure
→ Claims + committed Authority
→ routes/retrieval/docs
```

每个 proposed Bundle 批准前运行：

```bash
python tools/validate_pkc_bundle.py \
  data/knowledge/bundles/<bundle-id>.json --format text
```

展示 Bundle ID、完整 content hash、风险、语义前后差异、权限影响和精确文件后停止，等待 project-owner 精确批准。

## 8. Phase 4 安全边界

默认仅做知识建设和仓库内只读验证：

- 不猜 mapId、nodeGraphId、玩家、区域、路径或游戏状态；
- 不读取真实目标来“补知识”；
- 不生成候选、不注入、不覆盖、不删除、不恢复、不清理游戏文件；
- `user_edit/` 只读；不访问无关 `/mnt/`；
- 查询 injector、地图或 GIA/GIL 知识不授权任何操作；
- 若后续用户单独请求真实操作，必须展示目标、当前哈希/ID、命令、影响范围和回滚路径，并取得任务级明确确认；
- 注入成功、独立回读、编辑器导入和游戏行为验证分别报告。

## 9. Phase 5–6 保留范围

### Phase 5：用户 DSL、定义系统与客户端节点

- 受限 TypeScript、runtime values、实体/向量/变量/集合/Timer/信号；
- definitions/vendor 生成与只读边界；
- 七类客户端图和 server/client 差异；
- docs-search collection 的签名/用法边界；
- `create-genshin-ts` 独立包。

引擎 API 先查本地 docs-search，资料不足才使用 `miliastra-knowledge`。不得手改 `src/definitions/` 或 `src/thirdparty/`。

### Phase 6：维护、发布与文档治理

- definitions/vendor 同步和 `npm run gen`；
- release、Changelog 和维护检查；
- 当前实现、自动回归、真实 GIA、历史 handoff、待验证推测的分类；
- Claim 修订、失效、权限变化和 Bundle 取代流程。

## 10. 新会话启动提示词

```text
继续执行 Genshin-TS 知识树扩大计划，当前从 Phase 4 开始，Phase 0–3 已完成。

先读取：
- AGENTS.md
- docs/AGENTS.md
- .agents/skills/genshin-ts-project-adapter/SKILL.md
- docs/project-intelligence/contexts/compiler-diagnostics.md
- docs/project-intelligence/handoffs/knowledge-tree-expansion-phase3-2026-07-27.md
- docs/project-intelligence/knowledge-tree-expansion-plan.md

第一个工作包只做通用 CLI/config/build、GIA NodeGraph injector、GIL 变量资产和 signal/folder 路径的只读覆盖审计。选择唯一 Primary Context compiler-diagnostics，然后运行：
python tools/pkc.py progressive-query --context compiler-diagnostics --intent "继续知识树扩大计划 Phase 4，只读审计 CLI config build、GIA NodeGraph injector、GIL 变量资产与 signal folder 路径，不读取真实目标、不注入、不写回" --max-level 2 --limit 3 --check-authority

若返回 ambiguity/coverage gap，记录基线，不强行选择 Topic。只读 minimum_files；按需加载 composite-docs-navigator、composite-docs-maintainer 和 codebase-memory。

当前数量：3 Roles、2 Contexts、7 Nodes、26 Topics、28 Claims、47 Authority Refs、25 Routes、56 检索案例；最近评估 56/56。不要重复 Phase 1–3。

保护 handoff 第 6 节工作树。不要 apply bnd_963d...；不要批准/apply/提交失败 Bundle。每轮最多 3 个不可变 Bundle，批准前运行 tools/validate_pkc_bundle.py，展示完整 hash 并等待精确批准。

默认不读取真实目标、不生成候选、不注入、不写回地图、不操作游戏文件。若工作包明确变成静态 GIL/真实地图/游戏验证，停止当前 Context，重新按 static-gil-assembly-production 恢复并取得操作确认。
```

## 11. 规则反馈检查

Phase 3 的批准前 validator 两次拦截过宽 metadata 和 route 重叠，最终修正版采用碰撞较小的源码符号级判别词并达到 56/56。这验证了现有 `docs/project-intelligence/bundle-governance.md` 的 staged validation 规则有效，无需修改根 `AGENTS.md`。

失败候选 ID、具体检索调参和一次性 query 文案保留在 Bundle/handoff 审计中，不推广为通用规则。
