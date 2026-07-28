# Knowledge Tree Expansion Phase 2 Handoff

> 状态：当前工作状态 / 下一会话恢复记录
> 来源：本轮已批准并应用的 PKC Bundle + apply 后自动验证 + 当前工作树审计
> 最近校验：2026-07-27
> 适用范围：Phase 0–2 和 Phase 3 执行背景；当前 Phase 4–6 恢复入口已由 [`knowledge-tree-expansion-phase3-2026-07-27.md`](knowledge-tree-expansion-phase3-2026-07-27.md) 取代；本文不是新的稳定 Claim，也不替代源码、测试、Authority Ref 或真实 GIA 证据

## 1. 新会话冷启动顺序

新会话只按以下顺序恢复，不要先加载整个 `docs/`、`knowledge/` 或 Authority Ref 表：

1. 读取根 `AGENTS.md` 和 `docs/AGENTS.md`。
2. 运行 `git status --short --branch`，保护本文件第 4 节登记的全部既有变化。
3. 使用 `genshin-ts-project-adapter` 选择唯一 Primary Context：`compiler-diagnostics`。
4. 读取 `docs/project-intelligence/contexts/compiler-diagnostics.md`。
5. 运行：

   ```bash
   python tools/pkc.py progressive-query \
     --context compiler-diagnostics \
     --intent '继续知识树扩大计划 Phase 3，先定位三阶段编译管线与 Runtime/IR seam' \
     --max-level 2 --limit 3 --check-authority
   ```

6. 只读取返回的 `minimum_files`。仅需精确 Claim/Evidence/Authority/失效边界时进入 L3。
7. 再读取本 handoff 和权威计划：
   - `docs/project-intelligence/knowledge-tree-expansion-plan.md`
   - 本文件
8. 按需加载 `composite-docs-navigator`、`composite-docs-maintainer`、`codebase-memory`；不要直接访问 SQLite，不选择、安装或替换 PKC runtime。

## 2. 已完成范围

### Phase 0：冷启动与治理基线

已完成：

- 新建 `docs/project-intelligence/contexts/compiler-diagnostics.md`，包含：
  - 当前检查点和下一恢复点；
  - Formal A/B 启动条件；
  - L1→L2→L3 规则；
  - shared 默认 / legacy 显式回退当前状态；
  - 验证门和安全边界。
- 新建 `docs/project-intelligence/bundle-governance.md`。
- 新建 `tools/validate_pkc_bundle.py` 和 focused tests。
- 新增零聊天冷启动、只读、歧义、跨 Context 和覆盖外检索回归。
- staged validator 当前只接受 proposed Bundle；它通过 Git 跟踪文件和 `.applied.json → immutable Bundle` 审计链重建链式快照，不复制无关未跟踪文件。
- apply 后验证使用真实工作树的 canonical `validate/tree/evaluate`，不要把已应用 Bundle 再交给批准前 validator。

仍待完成：

- Formal A/B 必须等待初始化后的首个真实复杂 Bug；不要制造生产 Bug。
- `portable-knowledge 0.2.0rc1` 没有一等跨 Bundle `supersedes` / `abandoned` 关系。项目层只在修正版 Bundle intent/evidence 中记录旧 ID；不要伪造 runtime schema，不修改锁定 runtime。

### Phase 1：Composite 日常诊断

已完成 4 个 Topic + 4 条 scoped Claim + committed Authority + routes/retrieval：

- `composite-flow-and-nesting`
- `composite-parameter-wire-contracts`
- `composite-identity-and-related-ids`
- `composite-adapter-and-metadata-boundaries`

覆盖：多 InFlow/OutFlow、默认 continuation、nested Composite、capture/OutFlow 提升、参数类型、concrete wrapper、bool metadata/raw presence、Composite ID/跨文档重映射/relatedIds、sparse/pin-hole/special-arg、root/impl parity、shared/legacy、layout/metadata 边界。

边界：未改变任何 Composite/GIA 生产行为；未执行真实 GIA 写入、编辑器导入或游戏验证。单一节点族和自动 GIA 不得推广为全局或游戏结论。

### Phase 2：真实 GIA、protobuf 与工具

已完成新 Node `gia-wire-analysis`，包含：

- `gia-object-model`
- `protobuf-presence-and-roundtrip`
- `gia-tool-selection`
- `real-sample-isomorphic-analysis`

每个 Topic 已有 1 条 scoped Claim 和 committed Authority。明确：

- vendor schema 不是编辑器真实输出证明；
- decoded defaults 不证明 wire presence；
- unknown field / oneof 问题按 raw presence 和 round-trip 升级；
- trace/decode/diff/topology/layout 工具按问题最小选择；
- 样本结论记录 provenance、路径、大小、SHA-256、命令、观察和范围；
- 查询和解码不授权读取真实目标、写入、注入或地图操作。

## 3. 当前数量与验收状态

初始基线：

| 项目 | 初始 |
|---|---:|
| Project Memory Roles | 3 |
| Active Contexts | 2 |
| Nodes | 5 |
| Topics | 13 |
| Claims | 15 |
| Authority Refs | 19 |
| Intent Routes | 10 |
| 检索案例 | 16 |

当前：

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
python tools/pkc.py validate --format text                    PASS
python tools/pkc.py tree --format text                        PASS
python tools/evaluate_pkc_retrieval.py                        41/41 PASS
git diff --check                                               PASS
```

指标：

```text
configured intent Top-1                 100%
known Topic natural-language Top-3      100%
dangerous wrong routes                  0
cross-context silent combinations       0
budget violations                       0
```

Phase 0 治理修正 apply 后还运行：

```text
python -m unittest tests.test_validate_pkc_bundle tests.test_pkc_entry
17 tests PASS
```

未运行：

- `npm run build`：本轮未修改 TypeScript 生产代码；不作为当前知识/文档 Bundle 的必要门。
- `npm test`：未运行。
- Composite focused TypeScript regressions：未运行；本轮未改生产编码，Authority 绑定到已提交且工作树干净的现有源码/测试哈希。
- 编辑器/游戏核验：未运行。

## 4. 工作树保护与提交边界

当前分支/HEAD：

```text
branch: feat/composite
HEAD: 6f11a314fb812967c4394881a4ae1c7954132dcb
subject: feat: expand project knowledge tree
```

任务开始前已经存在、不得覆盖/还原/清理/混入本计划提交的变化：

```text
M  docs/architecture/gil-static-model-assets.md
?? data/knowledge/bundles/bnd_963d573a945e12f4e043a03e6b.json
?? data/knowledge/bundles/bnd_963d573a945e12f4e043a03e6b.approval.json
?? dist-custom-variable-change-local-variable-optimization/
?? tests/__pycache__/
?? tools/__pycache__/
```

`bnd_963d...` 是本任务开始前已有、已批准但未应用的 Bundle。不要擅自 apply、修改、删除或提交它。

本计划已批准并应用、最终应进入精确暂存/提交的 Bundle：

```text
bnd_970f45ff106c49b47fed016785
  970f45ff106c49b47fed01678510ffd538ba7d52499d0da686ae69427fa0e33c
  Phase 0 recovery/governance

bnd_c3ccbc2ea7bfbf42500701c8e8
  c3ccbc2ea7bfbf42500701c8e860f1a5c038dccc068de0c84be1a9d4bb472f76
  Phase 1-2 structure

bnd_71e1a05e4d616cc2282669c063
  71e1a05e4d616cc2282669c063cfc7d796fb11bf56106dca04819db06da5e577
  chained staged-validator governance fix

bnd_00ddd46338c6f2a708af55a73e
  00ddd46338c6f2a708af55a73ec0ca6a4079417bb3c8ba171ecbe24c5ab3bf3a
  Phase 1-2 Claims and Authority

bnd_99f8d824057f9f4d22b58c4ae4
  99f8d824057f9f4d22b58c4ae4cd8d61d865a6e81d2223fe7aa9752a1b016167
  Phase 1-2 routes/retrieval/document maps
```

下列是批准前失败且被后续修正版取代的 Bundle，只保留本地审计关系，**不要批准、apply 或纳入最终正常发布提交**：

```text
bnd_d7100f2bc095a89ba207334da3
bnd_3a496d7daec61cb164e1a48c46
bnd_8bc2f33178fd2bcbf429a5b901
bnd_0fc4f8e7f63362c2b6fd1ffdc8
bnd_433764ad86fe49166b35bc8426
bnd_d3109691c002820a5d6c159e87
```

不要执行 `reset`、`restore`、`clean`、分支切换、merge、rebase 或 cherry-pick。最终提交前必须从 Git index 导出独立快照并在快照中验证 PKC 与检索评估。只精确暂存本计划的 applied Bundle、知识/配置/文档/测试工具和本 handoff；不要暂存上述既有变化或失败 Bundle。

## 5. Phase 3 完成与 Phase 4 下一工作包

Phase 3 已完成 `compiler-pipeline-runtime-ir` 的结构、五条 scoped Claim、committed Authority、只读 routes、自然语言/安全/歧义/跨 Context/覆盖外回归和文档地图同步。下一工作包进入 Phase 4：CLI、Injector 与资产工作流；先做覆盖审计，知识查询不授权真实目标读取、注入、覆盖或地图操作。

建议边界（先审计再确定，不能照本表直接假定覆盖）：

1. `compiler-pipeline` Node 或对现有 `compiler-diagnostics` 的合理扩展：
   - Stage 1 TS→GS 与 LocalVariable / expression semantics；
   - Stage 2 Runtime execution→IR、registry/value/metadata；
   - Stage 3 IR→GIA ordinary/synthetic/boundary seam；
   - `src/runtime/IR.d.ts` typed cross-stage contract；
   - structured diagnostics 与最小 stage/seam 定位；
   - client/server 共享边界和差异。
2. 每个 Domain 必须找到：
   - 当前权威文档；
   - 具体源码入口；
   - focused test/tool；
   - 证据或安全边界。
3. 优先使用 codebase-memory：

   ```bash
   /home/h/.local/bin/codebase-memory-mcp cli search_graph \
     '{"project":"home-h-genshin-ts","name_pattern":".*(transformToGs|buildServerGraphRegistriesIRDocuments|irToGia|IRDocument|diagnostic).*","limit":50}'
   ```

4. 推荐先读最小权威集：
   - `.agents/skills/composite-docs-navigator/references/compiler-pipeline.md`
   - `.agents/skills/composite-docs-navigator/references/runtime-ir.md`
   - `docs/architecture/compilation-pipeline-overview.md`
   - `docs/architecture/stage1-ts-to-gs.md`
   - `docs/architecture/stage2-gs-to-ir.md`
   - `docs/architecture/stage3-ir-to-gia.md`
   - `src/runtime/IR.d.ts`
   - `src/diagnostics.ts`
5. 先用当前 PKC 查询 Phase 3 意图并记录 ambiguous/coverage-gap 基线，再做 duplicate/conflict/authority/scope/repository_state/deletion_test。
6. 每轮最多提出 3 个不可变 Bundle，推荐继续三步：
   - structure Bundle；
   - Claim + Authority Bundle；
   - Route/retrieval/docs Bundle。
7. 每个 proposed Bundle 批准前运行：

   ```bash
   python tools/validate_pkc_bundle.py \
     data/knowledge/bundles/<bundle-id>.json --format text
   ```

8. 展示完整 content hash 后停止请求 project-owner 精确批准；普通“继续/批准”不够。

## 6. Phase 4–6 后续范围

### Phase 4：CLI、Injector 与资产工作流

当前为 partial：静态 GIL 生产 Context 已深度覆盖，但通用 CLI/config/build、`.gia` NodeGraph 注入、`.gil` 变量资产、signal/folder 路径等未形成完整通用 Topic/Claim/Route。

安全边界：知识查询不授权读取真实目标、注入、覆盖、删除、mapId/nodeGraphId 操作。本计划默认只读，不为补知识执行真实地图写回。

### Phase 5：用户 DSL、定义系统与客户端节点

当前为 partial：领域地图已有路由，但 PKC 尚未覆盖受限 TypeScript、runtime values、实体/向量/变量/集合/Timer/信号、definitions/vendor 生成边界、七类客户端图、docs-search collections、create-genshin-ts 独立包。

引擎 API 先走本地 docs-search；资料不足才用 `miliastra-knowledge`。不得手改 `src/definitions/` 或 `src/thirdparty/`。

### Phase 6：维护、发布和文档治理

当前为 partial：Phase 0 已覆盖 Bundle 治理，但 definitions/vendor 同步、`npm run gen`、release/Changelog、文档证据分类、Claim 修订/失效/权限变化的完整维护路由仍待建立。

## 7. 每批固定验收

```bash
python tools/pkc.py validate --format text
python tools/pkc.py tree --format text
python tools/evaluate_pkc_retrieval.py
python -m unittest tests.test_validate_pkc_bundle tests.test_pkc_entry  # 涉及 PKC 项目工具时
# 相关 focused regressions
# Authority 路径和文档链接检查
git diff --check
```

若修改 TypeScript 生产代码，必须增加：

```bash
npm run build
# 对应 focused TypeScript tests
```

最终验收还需：

- configured intent Top-1 = 100%；
- known Topic natural-language Top-3 recall = 100%；
- dangerous wrong routes = 0；
- cross-context silent combinations = 0；
- budget violations = 0；
- stale/invalidated Authority 静默采用 = 0；
- 未经确认写回/注入 = 0。

## 8. 当前安全声明

本轮没有执行：

- push；
- Git commit；
- 注入；
- 地图写回；
- 游戏文件覆盖、删除、恢复或清理；
- mapId/nodeGraphId 操作；
- 真实 GIA/GIL 目标读取；
- 编辑器或游戏验证。

## 9. 新会话启动提示词

可直接向新会话发送：

```text
继续执行 Genshin-TS 知识树扩大计划，当前从 Phase 3 开始。

先读取：
- AGENTS.md
- docs/AGENTS.md
- docs/project-intelligence/contexts/compiler-diagnostics.md
- docs/project-intelligence/handoffs/knowledge-tree-expansion-phase2-2026-07-27.md
- docs/project-intelligence/knowledge-tree-expansion-plan.md

使用 genshin-ts-project-adapter 选择 compiler-diagnostics，并通过：
python tools/pkc.py progressive-query --context compiler-diagnostics --intent "继续知识树扩大计划 Phase 3，先定位三阶段编译管线与 Runtime/IR seam" --max-level 2 --limit 3 --check-authority
做 L1→L2，只读 minimum_files。

Phase 0–2 已完成并应用；当前数量是 3 Roles、2 Contexts、6 Nodes、21 Topics、23 Claims、35 Authority Refs、19 Routes、41 检索案例，最近评估 41/41。继续 Phase 3–6，不重复创建 Phase 1–2 内容。

保护 handoff 第 4 节列出的既有工作树变化。不要 apply bnd_963d...；不要批准/apply/提交失败 Bundle。每批最多 3 个不可变 Bundle，批准前运行 tools/validate_pkc_bundle.py，必须展示完整 content hash 并等待精确批准。

默认只做知识建设和只读验证；不读取真实目标，不注入，不写回地图，不操作游戏文件。最终完成 Phase 3–6 后，从 Git index 导出独立快照验证，再精确提交，不 push。
```

## 10. 规则反馈检查

本轮发现并修正了一个高频、可复用且已证实的项目治理缺口：提交前的链式 Bundle staged validation 必须从 applied immutable-Bundle 审计链重建缺失输出，同时排除任意未跟踪文件。该规则已进入最小权威文档 `docs/project-intelligence/bundle-governance.md` 和 focused tests；无需推广到根 `AGENTS.md`。

局部失败候选 ID、临时调试过程和本轮检索调参留在本 handoff/Bundle 审计链，不推广为通用 `AGENTS.md` 规则。
