# 知识树范围扩大计划

> 状态：当前规划
> 来源：当前 Project Memory 配置 + Domain Knowledge 注册表 + 检索回归 + 文档覆盖审计
> 最近校验：2026-07-27
> 适用范围：Genshin-TS Project Memory 与 Domain Knowledge 的后续扩展；不代表未迁移领域已经获得验证

本文档规划如何把当前有界知识树扩展到更多 Genshin-TS 核心领域。目标不是复制整个 `docs/`，而是让全新会话能从 `AGENTS.md` 出发，选择正确 Context，以有限预算恢复当前状态、稳定契约、权威来源、验证边界和下一步。

## 1. 当前基线

当前项目固定使用 `portable-knowledge 0.2.0rc1`，canonical 入口为：

```bash
python tools/pkc.py <command>
```

截至 2026-07-27，已验证基线为：

| 项目 | 当前数量 |
|---|---:|
| Project Memory Roles | 3 |
| Active Contexts | 2 |
| Domain Knowledge Nodes | 5 |
| Topics | 13 |
| Claims | 15 |
| Authority Refs | 19 |
| Intent Routes | 10 |
| 检索评估案例 | 16/16 通过 |

三个 Memory Role 已映射：

- `operating_entry` → `AGENTS.md`
- `current_recovery` → `docs/project-intelligence/CURRENT.md`
- `decision_entry` → `docs/composite-ir/architecture-redesign/decision-log.md`

两个 Active Context 为：

- `compiler-diagnostics`
- `static-gil-assembly-production`

当前 Domain Knowledge 重点覆盖复合节点核心契约、复合边界诊断、验证证据、静态 GIL 拼装和安全地图写回。尚未建立 Context 或 Topic 的领域仍以现有权威文档、源码和测试为准。

## 2. 扩展目标

每一批扩展都应同时改善以下能力：

1. **冷启动恢复**：新会话无需聊天历史即可找到操作入口和当前恢复点。
2. **有限读取**：L1→L2 默认只返回最多三个 Topic 及 `minimum_files`，避免全量加载文档。
3. **权威新鲜度**：实现事实绑定当前源码/测试哈希，文档契约与历史记录分开。
4. **检索准确性**：高频问题可命中单一 Topic；歧义、越界和危险意图保持 fail closed。
5. **证据分层**：代码、自动回归、真实 GIA、编辑器、写回/注入和游戏行为分别记录。
6. **可审计写入**：稳定知识通过不可变 Bundle、精确哈希批准和 staged validation 写入。

不以文件数、字数或“迁移了多少 Markdown”作为成功标准。

## 3. 收录与排除原则

### 3.1 应进入 Domain Knowledge

只收录同时满足以下条件的内容：

- 高频、可复用、能指导行动；
- 已由当前源码、测试、真实文件或明确决策支持；
- 能写出清晰的适用边界和失效条件；
- 比每次重新阅读长文档更节省上下文；
- 能绑定 Authority Ref 或明确标为待验证。

### 3.2 应进入 Project Memory

只有具备长期目标和恢复价值的工作流才建立 Context。至少要有：

- 明确目标；
- 当前检查点；
- 下一恢复点；
- 关联 Knowledge Nodes；
- 验证门；
- 安全或权限边界。

### 3.3 不迁移的内容

以下内容不直接进入稳定知识树：

- 整篇源码、测试或权威文档副本；
- 临时日志、`/tmp` 工件和一次性会话摘要；
- 未确认的工作树观察；
- 仅用于解释历史的 handover 全文；
- 私人路径、地图目标和未确认 ID；
- decoded JSON 默认值推导出的 wire presence；
- 自动生成成功被误写成编辑器或游戏验证。

## 4. 分批扩大路线

### Phase 0：巩固冷启动和治理基线

优先级：最高。

交付：

1. 为 `compiler-diagnostics` 建立独立恢复文档：
   `docs/project-intelligence/contexts/compiler-diagnostics.md`。
2. 记录 Formal A/B 启动条件、L1→L3 升级规则、shared/legacy 当前状态和验证门。
3. 为 Bundle 增加批准前完整 staged validation，避免批准后才发现 Authority fact coverage 缺口。
4. 明确失败、放弃、取代和已应用 Bundle 的生命周期关系。
5. 做一次真正的零聊天上下文冷启动演练，并将结果加入检索/恢复评估。

退出条件：两个 Active Context 均能从独立恢复入口重建任务状态；冷启动不读取无关历史，不获得写权限。

### Phase 1：补齐复合节点日常诊断知识

优先级：最高。

候选 Topic：

- 多 InFlow / 多 OutFlow 与默认 continuation；
- nested Composite 调用、capture 和 OutFlow 提升；
- 参数类型、concrete wrapper、bool enum metadata 与 raw wire presence；
- Composite ID、跨文档重映射、`relatedIds` 和定义复用；
- sparse input、pin-hole、special-arg 与物理 pin 规则矩阵；
- root/impl parity、shared 默认后端和 legacy 回退风险；
- layout 与 graph metadata 的职责边界。

每个 Topic 只保留稳定契约、适用边界和最小 Authority 导航；样本级结论仍留在真实 GIA 文档或测试中。

退出条件：常见 Composite 定义、调用、边界、类型、嵌套、ID 和 Stage 3 问题可通过 L2 找到正确入口；未覆盖节点族不会被错误推广。

### Phase 2：真实 GIA、protobuf 与分析工具

优先级：高。

候选 Nodes/Topics：

- GIA GraphUnit、GraphNode、Pin 和附件关系；
- protobuf defaults、unknown fields、oneof presence 与 round-trip；
- trace/decode/diff/topology 工具选择；
- 真实样本记录模板和最小同构分析流程；
- gsts 输出、编辑器输出和真实地图观察的适用范围。

该阶段不得把 vendor schema 当成真实编辑器证据，也不得把一个类型或样本推广到整个类型族。

退出条件：Agent 能根据问题选择正确工具和证据层，并明确何时必须升级到 raw wire 或真实样本。

### Phase 3：完整编译管线与 Runtime/IR

优先级：高。

候选 Nodes/Topics：

- Stage 1 TS→GS 的语义变换和 LocalVariable 规划；
- Stage 2 Runtime execution→IR 的注册表、值和 metadata；
- Stage 3 IR→GIA 的 ordinary/synthetic/boundary 职责；
- `IR.d.ts` 跨阶段契约；
- 结构化诊断、阶段定位和最小复现选择；
- 客户端与服务器图的共享边界及差异。

退出条件：复杂编译错误可先定位阶段和 seam，再读取最小源码与测试；不会从最终 GIA 直接猜 Stage 1 根因。

### Phase 4：CLI、Injector 与资产工作流

优先级：中高。

候选 Nodes/Topics：

- CLI/config/build orchestration；
- `.gia` NodeGraph 注入与 `.gil` 资产写回的分界；
- mapId、nodeGraphId、目标哈希、备份和回滚；
- 自定义变量资产；
- 静态模型/Prefab 分析与拼装；
- signal/folder 等 injector 专项路径。

只有形成长期目标、当前检查点和验证门的生产工作流才新增 Project Memory Context。查询知识不构成真实文件操作授权。

退出条件：常见只读分析、候选生成和真实写回意图能被正确分流；否定词和视觉检查不会静默升级到写回。

### Phase 5：用户 DSL、定义系统与客户端节点

优先级：中。

候选 Nodes/Topics：

- 受限 TypeScript 子集与 ESLint 约束；
- runtime values、实体、向量、变量、集合、Timer 和信号；
- definitions/vendor 数据的生成与只读边界；
- 七类客户端图及其验证层级；
- docs-search collection 的选择和签名/用法区别；
- `create-genshin-ts` 独立包边界。

退出条件：用户 API 问题优先走 docs-search 和用户文档；编译器、wire 和游戏行为结论仍回到当前源码、真实 GIA 和验证证据。

### Phase 6：维护、发布和文档治理

优先级：中低。

候选 Nodes/Topics：

- definitions/vendor 同步与 `npm run gen`；
- release、Changelog 和维护检查；
- 当前文档、真实 GIA、历史 handover 和待验证假设的分类；
- 知识失效、Claim 修订、权限变化和 Bundle 取代流程。

退出条件：维护任务能找到生成来源、验证命令和禁止手改边界；过期知识有明确修订或失效路径。

## 5. 每批标准交付物

每一批扩展必须按顺序完成：

```text
覆盖审计
→ 确认现有权威文档/源码/测试
→ 设计 Node/Topic 边界
→ 结构 Bundle
→ Claim + Authority Bundle
→ 必要的 Context/Intent Route
→ 代表性正向、歧义、越界和危险查询回归
→ 文档地图同步
```

最低交付清单：

- 每个 Domain 有当前权威文档、源码入口、测试/工具入口和特殊边界；
- 每个 Topic 至少有一个明确用途，不能只是宽泛目录；
- 每条 Claim 有 assertion、适用边界和 fact class；
- 当前实现 Claim 至少绑定源码或 focused test Authority；
- 真实 GIA Claim 记录文件、命令、观察和范围；
- 新高频意图有检索案例；
- 新 Context 有恢复入口和验证门；
- `python tools/pkc.py validate`、检索评估和 `git diff --check` 通过。

## 6. 检索与上下文预算

扩展不能以增加启动上下文为代价：

- 新会话默认只读 `AGENTS.md` 和选中 Context 的恢复入口；
- L1→L2 默认最多三个 Topic，预算保持在 canonical 配置范围内；
- 仅在 Claim/Evidence 边界确有需要时升级 L3；
- 共享宽泛词降权，高区分度术语优先；
- 正确候选不明显时返回歧义并请求澄清；
- 跨 Context 意图不得静默组合；
- 任何查询返回的能力均应显式表明只读或需要额外授权。

每新增一批至少加入：

1. 精确路由正向案例；
2. 未配置自然语言案例；
3. 跨 Context 案例；
4. 否定/只读安全案例（若涉及文件操作）；
5. 覆盖外问题案例。

## 7. Project Memory Context 扩展门槛

Domain 有知识不等于需要 Context。只有以下条件同时满足时才新增 Context：

1. 存在持续多轮的明确目标；
2. 新会话需要恢复当前检查点和下一步；
3. 有独立验证门或操作安全边界；
4. 至少关联一个稳定 Knowledge Node；
5. 不建立 Context 会导致默认路由歧义或重复加载大量状态。

近期候选只有：

- 补强现有 `compiler-diagnostics`，不是新增 Context；
- 当客户端节点生产、definitions/vendor 维护或通用 GIA 逆向形成持续工作流后，再分别评估是否建 Context。

不要按源码目录机械创建 Context。

## 8. 验收指标

范围扩大后的最低质量门：

| 指标 | 门槛 |
|---|---:|
| `pkc validate` | 通过 |
| 已配置高频意图 Top-1 | 100% |
| 已知 Topic 自然语言 Top-3 recall | 100% |
| 危险错误路由 | 0 |
| 跨 Context 静默组合 | 0 |
| 预算超限 | 0 |
| stale/invalidated Authority 静默采用 | 0 |
| 未经确认的写回/注入 | 0 |

数量指标只用于观察增长，不作为单独验收：Node、Topic 和 Claim 增多不等于知识质量提高。

## 9. 风险与控制

### 知识膨胀

控制：一个 Topic 只保留少量高密度 Claim；详细实现留在 Authority 文件。

### 文档与源码冲突

控制：当前实现事实优先绑定源码/测试哈希；decision log 解释历史，不覆盖当前实现。

### 错误推广

控制：每条 Claim 强制写适用边界；一个真实样本或节点族不能证明全局规则。

### 路由膨胀

控制：优先改进 metadata 区分度；只有高频、稳定意图才加 explicit route。

### 批准成本

控制：结构、Claim 和权限变化保持可审计；后续评估支持分阶段、总计划哈希锁定的迁移计划，但不得以降低批准强度换取便利。

### 工作树和跨机器恢复

控制：保护现有改动；每批完成后提交项目权威文本。`.local/pkc-runtime` 仍由项目维护者按固定版本恢复，业务 Agent 不自行安装或切换版本。

## 10. 推荐执行顺序

近期按以下顺序推进：

```text
1. compiler-diagnostics 独立恢复文档与冷启动演练
2. Composite 多流、nested、类型/wire、ID/relatedIds
3. GIA/protobuf 工具与证据选择
4. 三阶段编译管线与 Runtime/IR
5. CLI/Injector/资产工作流
6. 用户 DSL、定义系统、客户端节点
7. 维护、发布与文档治理
```

每轮最多选择一个有明确退出条件的工作包。发现当前源码、测试、真实 GIA 或用户反馈与本计划不一致时，先更新最小权威入口和覆盖地图，再继续扩展。
