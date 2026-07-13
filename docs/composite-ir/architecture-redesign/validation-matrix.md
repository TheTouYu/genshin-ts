# 验证矩阵

> 状态：当前推荐 / 持续更新
> 来源：当前测试体系 + 真实 GIA 验证方法
> 最近校验：2026-07-12
> 适用范围：Stage 3 架构重构验收；未勾选项均不视为已证明

## 1. 验证层级

| 层级 | 证明内容 | 不能证明 |
|---|---|---|
| L0 Type/build | 源码可构建 | GIA 结构、游戏行为 |
| L1 Resolved contract | 类型来源、variant 决策一致 | vendor encoding 正确 |
| L2 Vendor node | identity/pin schema/value wrapper | graph connection 和 boundary |
| L3 Encoded graph | connects/flow/NodeGraph fields | 真实编辑器一致、游戏行为 |
| L4 Real-GIA diff | 指定真实样本字段一致 | 未采样类型与行为 |
| L5 Injection | 目标文件接收输出 | 节点逻辑运行正确 |
| L6 In-game | 用户确认目标行为 | 未测试场景 |

## 2. 类型 × 来源 × scope

首批必须覆盖：

| 类型 | literal root | literal impl | conn root | conn impl | 真实样本 | 状态 |
|---|---:|---:|---:|---:|---:|---|
| int | ☐ | ☐ | ☐ | ☐ | ☐ | 未开始 |
| float | ☐ | ☑ 当前失败样本 | ☐ | ☐ | ☑ `额外压力` | 已发现差异 |
| bool | ☐ | ☐ | ☐ | ☐ | 部分 | metadata 基线，setter 待测 |
| str | ☐ | ☐ | ☐ | ☐ | ☐ | 未开始 |
| vec3 | ☐ | ☐ | ☐ | ☑ 物理 setter 使用 | 部分 | literal 基线通过，setter 待逐字段 |
| entity | ☐ | ☐ | ☐ | ☐ | ☐ | 未开始 |
| guid | ☐ | ☐ | ☐ | ☐ | ☐ | 未开始 |
| config | ☐ | ☐ | ☐ | ☐ | ☐ | 未开始 |
| prefab | ☐ | ☐ | ☐ | ☐ | ☐ | 未开始 |
| faction | ☐ | ☐ | ☐ | ☐ | ☐ | 未开始 |
| list families | ☐ | ☐ | ☐ | ☐ | ☐ | 分族验证 |
| dict K/V | ☐ | ☐ | ☐ | ☐ | ☐ | 分族验证 |

“部分”不能作为删除 legacy 的依据。

## 3. 每个 typed ordinary node 的字段契约

结构断言至少包含：

```text
logical node type
genericId.class/type/kind/nodeId
concreteId presence + nodeId
nodeIndex
InParam/OutParam kind + logical/physical index
pin VarType
pin value class
a lreadySetVal（若相关）
bConcreteValue presence
indexOfConcrete
inner VarBase class/type/value
connects id/kind/index
```

bool/enum 还要检查 raw wire metadata；decoded JSON 默认值不足以证明 presence。

## 4. Graph scope parity

对同一 ordinary fixture 分别放入 root 和一层 composite impl，规范化掉允许差异：

允许差异：

- `nodeIndex`；
- x/y；
- root/composite wrapper；
- composite boundary pins。

不允许差异：

- ordinary generic/concrete node ID；
- ordinary InParam/OutParam schema；
- literal value wrapper；
- normal data/flow edge endpoint semantics。

建议新增测试工具：

```text
tests/composite/assert-ordinary-node-parity.ts
tests/composite/test-stage3-root-impl-parity.ts
```

名称可调整，但断言层必须独立于 trace 文本。

## 5. Composite boundary 矩阵

| 场景 | physical pin | compositePins | connects | regression |
|---|---|---|---|---|
| literal input | 有 | definition route | 无 data source | ☐ |
| connection input | 有 | definition route | 有 | ☐ |
| capture input | 无普通 input | capture route | 重定向 | ☐ |
| omitted sparse input | 只按声明/证据 | index 不压缩 | 无 | ☐ |
| pure-data output | 按真实规则 | OutParam route | consumer edge | ☐ |
| exec inflow/outflow | flow pin | In/OutFlow route | flow edge | ☐ |
| nested composite | call synthetic pins | nested definition route | data/flow | ☑ legacy focused tests；☐ vendor gate P2-W9 failure baseline |

现有候选回归：

```bash
npx tsx tests/composite/test-nested-composite-capture-pins.ts
npx tsx tests/composite/test-nested-composite-outflow.ts
npx tsx tests/composite/test-composite-bool-input-gia.ts
npx tsx tests/composite/test-custom-variable-impl-pins.ts
npx tsx tests/composite/test-local-variable-impl-concrete-type.ts
```

执行前确认脚本当前入口和退出码；旧文档中的 nested pending 状态可能过时，以源码测试为准。

P2-W5~W8 的 vendor embedding editor coverage 已确认：closed local-float ordinary impl、captured float literal、
captured root Addition connection、captured entity custom target。它们属于 L6 scoped evidence，不填补 nested
synthetic call、其他 type/family、`graphValues` 或 `affiliations`。P2-W9 的 vendor gate 当前在
`__composite_call__` synthetic boundary 失败；参见 `checkpoints/phase-2-vendor-embedding-evidence.md`。

## 6. `额外压力` vertical slice 验收

自动生成：

```bash
npm run build
node bin/gsts.mjs -c gsts.physics-motion.config.ts --noinject
npm run trace-dataflow -- dist/tests/layout/physics-motion/main.gia 13 \
  --composite='更新v、w' --all-params --json
npm run gia:inspect -- dist/tests/layout/physics-motion/main.gia
git diff --check
```

结构目标：

- setter generic `323`；
- setter concrete `324`；
- `InParam[0]="额外压力"`；
- `InParam[1]` 是真实样本同构 concrete float；
- `InParam[2]` bool metadata 不回归；
- 执行与数据连接保持。

另外比较真实节点：

```text
复杂gia/物理运动.gia
更新v、w impl n[4]
```

注入必须另行取得用户确认。

## 7. Vendor experiments

Phase 0 必做：

1. `new Node(0, 'server', 324)` 后对三个 pin `setVal`，encode；
2. 同节点第二输入不设值、通过 `Graph.connect()` 接 float producer；
3. 对 `334` vec setter 重复 connection 实验；
4. 比较 `Node.encode` 与 `Graph.encode` 提取节点；
5. 解码真实 setter，使用 `Node.decode` 或结构工具比较；
6. 记录 generic/concrete、pin wrappers、indexOfConcrete 和 connects。

实验脚本放 `tests/composite/`，不得写入生产路径。

## 8. 每阶段最低命令

```bash
npm run build
# 本阶段 focused tests
node bin/gsts.mjs -c gsts.physics-motion.config.ts --noinject
git diff --check
```

共享 compiler 行为变更后再扩大为：

```bash
npm test
bash tests/composite/test-composite-runner.sh
```

完整测试成本高于 focused validation，但在阶段退出前不可只依赖单个物理样本。
