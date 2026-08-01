# GIL 并行调查操作手册

> 状态：当前推荐
> 来源：当前代码实现 + 真实 GIL 增量调查流程
> 最近校验：2026-08-01
> 适用范围：由主模型协调、用户在编辑器产生变化、多个只读模型并行调查 GIL 语义

## 目标

把“完整解析关卡 GIL”的长期任务拆成可并行、可复查、可合并的独立实验。模型调查的是语义变化和证据包，不是猜测某段二进制偏移的含义。

GIL 调查分三层：

```text
GIL 二进制 → wire/protobuf 结构 → 语义模块 → 编辑器规则和游戏行为
```

可建立的模块边界包括节点图拓扑、布局、信号、变量、静态资源、控件、实体和连接。模块是调查边界，不保证它们在物理 wire 上完全独立；共享 ID 表、索引和 GraphUnit 必须单独记录。

## 角色

### 主模型（Coordinator）

主模型是唯一状态协调者，负责：

- 读取并维护实验 manifest、快照哈希和实验队列；
- 把用户的编辑器动作记录为唯一变化；
- 固定目标地图、`mapId`、`nodeGraphId` 和证据路径；
- 分发只读调查任务；
- 合并结构结果，处理冲突；
- 唯一执行真实地图写回；
- 更新 manifest 和权威文档。

### 子模型（Investigator）

每个子模型只处理一个实验或一个相邻快照对。它可以解码、比较、生成临时候选和运行回归，但不能写真实地图、修改共享 manifest 或直接更新 Authority。

### 校验模型（Validator）

校验模型只检查证据是否支持结论：快照是否匹配、用户变化是否唯一、额外字段是否可解释、断言是否通过、结论范围是否超出样本。它不能把多个相同猜测合并为事实。

## 用户与主模型的连续流程

### 1. 建立基线

主模型先创建并锁定：

```text
map path / mapId / map SHA-256
目标图 ID / 图名称 / 图类型 / 节点数
实验目录
当前前快照及 SHA-256
已确认规则
下一项唯一用户变化
```

基线必须是不可变快照。原始 GIL 使用 `capture-evidence.py` 保存，不只放在 `/tmp`。

### 2. 用户连续产生单变化

用户可以连续准备多轮变化，但每轮只能改变一个可归因变量：

```text
v0 → v1：新增一个 int 消费节点，不连接
v1 → v2：连接第一个监听输出
v2 → v3：移动一个节点
v3 → v4：新增一个变量
```

每轮保存地图。主模型在用户回复“好了”后立即捕获新快照、记录 hash，并为下一轮重新锁定前快照。连续采集时使用：

```bash
python .agents/skills/editor-incremental-gia-investigator/scripts/capture-experiment.py \
  <current-map> <before-snapshot> <experiment-directory>
```

脚本拒绝未变化地图和已有目标，只输出路径、SHA-256 和大小。捕获完成后，后续 Agent 只读取实验目录中的不可变 `before.gil` / `after.gil`，不得依赖仍会变化的实时地图。不能把多个未记录的变化合并为一个“实验”。

用户动作必须具体到可执行的一句话，例如：

> 在“信号调试-监听信号”中新增一个能接收 `int` 的普通消费节点，不连接任何引脚，保存后回复“好了”。

模型不能替用户猜测节点、连线、图 ID 或编辑器行为。

### 3. 分发子模型任务

每个任务必须自包含，至少提供：

```text
experiment ID
module
before snapshot + SHA-256
after snapshot + SHA-256
mapId / nodeGraphId / resource ID
用户声明的唯一变化
允许使用的比较器和 Authority
禁止写入范围
输出格式
```

建议按相邻快照分发：

```text
Agent A：v0 → v1，节点新增
Agent B：v1 → v2，监听输出连接
Agent C：v2 → v3，布局变化
Agent D：v3 → v4，变量变化
```

子模型只读取自己的输入和所需最小文档，不重新运行 PKC、地图发现、全图扫描或旧实验。为减少 Coordinator 重复展开上下文，优先复用
`.agents/skills/editor-incremental-gia-investigator/references/parallel-investigation-prompts.md`；任务只需给恢复锚点、实验目录、用户声明和写入边界，其余字段由 Agent 从局部 manifest 读取。

实验 Agent 可以写自己的独立实验目录，包括 `diff.json`、局部 `notes/manifest.json` 和
`result.json`；不能修改共享恢复 manifest、Authority、真实地图或其他实验。共享状态始终保持单写者。

可以先连续捕获约定数量的相邻实验，再并行调查各快照对。批次调查结束后必须串行运行独立 Validator，核对 hash 链、用户变化、protobuf presence、类型和连接方向。Validator 只写批次 `validation.json`，逐实验给 `ACCEPT`、`CONFLICT` 或 `INSUFFICIENT`；共享 manifest 和 Authority 只合并 Validator 接受的证据。原始 Investigator 结果保留，不能静默改写来掩盖冲突。

## 证据包与输出协议

每个实验目录独立保存：

```text
experiments/<module>/<experiment>/
├── raw/before.gil
├── raw/after.gil
├── notes/manifest.json
├── diff.json
└── result.json
```

`result.json` 至少包含：

```json
{
  "status": "CONFIRMED | CONFLICT | INSUFFICIENT",
  "module": "node-graph.signal-consumption",
  "userChange": "connect first monitor int output",
  "beforeSha256": "...",
  "afterSha256": "...",
  "changed": {
    "nodes": [],
    "pins": [],
    "connections": [],
    "metadata": [],
    "unknown": []
  },
  "rule": "仅描述当前证据支持的规则",
  "scope": "当前地图、目标图、节点族和参数类型",
  "notProven": ["float", "entity", "other graph types"],
  "checks": ["compare PASS", "raw-wire PASS", "round-trip PASS"]
}
```

必须区分：

```text
目标变化：用户明确做的变化
伴随变化：编辑器已知会自动产生的变化
未知变化：当前无法解释的变化
```

存在未知变化、hash 不匹配、目标不唯一、类型 oneof 不一致或 protobuf presence 无法判断时，标记 `INSUFFICIENT` 或 `CONFLICT`，停止推广，不猜测。

## 并行边界

可以并行：

- 不同相邻快照对的只读比较；
- 不同模块的 wire 解码和规则提取；
- 同一规则在不同节点族上的独立验证；
- 临时副本、候选 GIA/GIL 和自动回归。

不能并行：

- 多个模型同时写真实 GIL；
- 多个模型同时修改同一个 manifest 或 Authority；
- 一个模型基于另一个模型尚未验证的推测继续编码；
- 多个实验共用可覆盖的 `/tmp` 文件；
- 未锁定 hash 时对同一地图执行写回。

真实写回只有主模型执行。写回前必须重新核对当前地图 hash、目标 path、`mapId`、`nodeGraphId` 和允许范围；候选严格回读通过后先备份，再做源 hash 竞态检查和原子替换。

## 合并规则

主模型和校验模型只合并证据，不合并猜测。一个结论只有在以下条件同时满足时才能进入 Authority：

1. 用户唯一变化记录完整；
2. before/after 快照和 hash 可复核；
3. 目标图或资源唯一确定；
4. changed 字段没有未知项；
5. 类型、序号、ID、pinIndex 或连接方向断言通过；
6. 结论范围没有超过真实样本；
7. 必要时有第二个同构样本或手工重放证据。

自动回归、候选回读、真实写回、编辑器导入和游戏行为是不同证据层级，报告时必须分开。

## 失败与恢复

- 当前地图 hash 与 manifest 不同：停止，重新捕获新的基线；
- 用户一次做了多个变化：标记 `INSUFFICIENT`，回到最后已知快照重做单变化；
- 子模型结论冲突：保留双方结果，主模型不得静默覆盖；
- 目标图或资源 ID 不唯一：请求最小澄清，不按常见编号猜测；
- 写回前候选回读失败：不写真实地图；
- 写回后编辑器或游戏失败：记录为独立验证失败，不自动否定 wire 结构结论。

## 当前实现复用规则

涉及信号注册修改时，优先复用 `src/cli/gil_signal_registrations.ts` 的参数模板池、`buildIndexEntry()`、`buildDefinition()` 和严格回读。`gsts assets:signals update` 是创建信号的原位替换变体：自动读取目标的 ID，替换注册表和三份定义，保留 ID，不手填或推算 ID。

## 下一轮检查清单

```text
[ ] 读取当前 manifest 和相关 Authority
[ ] 核对当前地图 hash
[ ] 捕获不可变 v0 快照
[ ] 明确本轮唯一变化
[ ] 用户在编辑器执行并保存
[ ] 捕获 v1 并运行有界比较
[ ] 生成独立 result.json
[ ] 子模型只读并行调查
[ ] Validator 检查证据边界
[ ] 主模型更新 manifest/Authority
[ ] 需要写回时单独执行备份、回读、hash 和原子替换
[ ] 分开报告编辑器和游戏验证
```
