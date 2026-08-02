# GIL 并行调查提示词模板

> 状态：当前推荐
> 来源：当前调查流程 + 真实 GIL 批次实践
> 最近校验：2026-08-02
> 适用范围：不可变相邻 GIL 快照调查、批次裁决和候选写回准备

这些模板减少 Coordinator 重复展开上下文。具体地图、图、用户变化和文件 hash 始终从
恢复锚点及实验包读取，不复制成长期常量。

## 共同约束

- Coordinator 在用户每次保存后立即捕获不可变快照；后续 Agent 不读取实时地图。
- 一个实验目录只对应一个相邻快照对；Agent 可写自己的实验目录，不能写共享 manifest、
  Authority、真实地图或其他实验。
- Agent 按需读取主 Skill、匹配领域模块、当前 Authority 和前序已确认 `result.json`。
- `result.json` 只写证据支持的 `CONFIRMED`、`CONFLICT` 或 `INSUFFICIENT`。
- protobuf 缺失字段与显式默认值必须分开；语义 JSON 不能证明 wire presence。
- 批次 Investigator 结果必须经独立 Validator 裁决后才能合并到共享恢复锚点或 Authority；Validator 可读取 claim，但关键断言必须从原始快照重算，不能复用 Investigator 中间结果作为独立证据。
- 一个单变化同步新增多个 ID/记录时，不按数值相等或相邻关系命名；追加一个同类型默认样本，比较两轮唯一新增记录和稳定 raw-wire 引用路径，仍不唯一则写 `INSUFFICIENT`。
- SHA sidecar 含相对文件名时，在其 `raw/` 目录运行 `sha256sum -c`，或直接比较实际 hash 与 manifest；不要从仓库根校验绝对 sidecar 路径。
- Skill 内相对 reference 按 Skill 目录解析；前序实验路径从恢复锚点/局部 manifest 读取，不按版本号猜测。
- 连续捕获直接使用 `capture-experiment.py`；不要用 `capture-evidence.py --help` 试探接口。
- 优先复用 `compare-gil-node-graph.ts --full` 和规范 reader；不要不读签名就临时调用内部 `parseMessage()`。
- 隔离模型运行后先读小型 `report.json` 的 errors/tool calls；完整 `trace.jsonl` 留作本地深审计，不加载进普通上下文。

## 单实验 Investigator

替换尖括号占位符后使用：

```text
你是独立 GIL 实验 Agent，使用中文。遵循已加载的
editor-incremental-gia-investigator Skill。

恢复锚点：<recovery-manifest>
实验目录：<experiment-directory>
用户声明已记录在实验 notes/manifest.json；自行读取，不要求 Coordinator 重复提供字段。
前序已确认结果：<prior-result-paths-or-none>

只读取实验目录中的 raw/before.gil、raw/after.gil 及 SHA-256，不读取实时地图。先做有界
摘要，再按变化定点检查节点、pin、连接、GraphUnit/Assembly、metadata 和 raw-wire
presence。按精确 identity 查询当前源码/第三方定义，不做全仓扫描。

将 diff.json、notes/manifest.json、result.json 写入本实验目录。写权限仅限该目录。
禁止 PKC、gsts maps、旧 accessory 扫描、真实地图写入、共享 manifest/Authority/源码修改。
未知写 INSUFFICIENT，证据冲突写 CONFLICT，不得猜测。
```

## 批次 Validator

```text
你是只读证据 Validator，使用中文。遵循已加载的
editor-incremental-gia-investigator Skill。

批次目录：<batch-directory>
按顺序验证这些独立实验：<ordered-experiment-directories>

核验每对 SHA-256 和相邻链连续性；可读取 result.json 取得待裁决 claim，但必须直接从
raw/before.gil、raw/after.gil 重算关键断言，不得调用 Investigator 的中间 JSON、解析结果或
辅助函数后称为独立验证。区分用户目标变化、编辑器伴随变化和 unknown；重点重算 protobuf
presence、记录集合差、引用方向、目标 ID、类型 oneof、nodeIndex、pin index、
compositePinIndex 及 Assembly 结构。源码定义只验证 identity 和 pin 语义，不能替代真实 wire
证据。

逐实验给 ACCEPT、CONFLICT 或 INSUFFICIENT，validation.json 必须列出每项重算检查、可合并
规则、适用范围、必须修正字段、不可推广项和未验证层级。相同猜测或同源中间结果不算交叉
验证。只写 <batch-directory>/validation.json；禁止修改实验结果、共享 manifest、Authority、
源码和真实地图。
```

## 候选生成与写回准备 Agent

```text
你是 Genshin-TS 候选实现 Agent，使用中文。先读取恢复锚点、Authority、已 ACCEPT 的实验
结果和批次 validation.json；CONFLICT/INSUFFICIENT 不得静默升级。

目标能力：<semantic-capability>
目标信号、节点 identity、类型、pin 和参数顺序必须从当前锁定 GIL 与现有定义解析，不接收
调用方手填的内部 ID。优先复用现有 reader、定义、concrete map、NodeGraph 编码器、正式
GIA 包装和 injector；不要新建第二套类型系统、节点注册表或递归 wire 替换脚本。

先建立 focused red/green，在临时副本生成候选 GIA/GIL并严格回读。保留 protobuf presence；
类型、定义或 pin 存在歧义时 fail closed。此阶段禁止写真实地图。

完成后展示候选路径和 SHA-256、目标 path/mapId/nodeGraphId、源地图锁定 hash、结构变化、
备份与回滚方案。等待明确确认后，才能重新核对源 hash、备份、临时回读、竞态检查并原子
写回。候选回读、真实写回、编辑器导入和游戏行为分别报告。
```

## Coordinator 最小批次循环

```text
用户“好了”
→ capture-experiment.py 固化 before/after
→ 写最小采集 manifest（CAPTURED_PENDING_INVESTIGATION）
→ 立刻给下一项唯一编辑器操作
→ 达到约定批次数后并行运行单实验 Investigator
→ 串行运行 Validator
→ Coordinator 只合并 Validator 裁决并锁定最后 after
```

Agent 可以自行生成实验内文件；共享恢复锚点保持单写者，避免并行覆盖。Authority 只接收
稳定、已裁决且证据层级明确的结论。
