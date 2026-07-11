# 物理运动复刻 Round 14 交接

> 状态：当前推荐 / 待执行
> 来源：用户游戏内反馈 + 当前代码实现 + 真实 GIA 结构观察
> 最近校验：2026-07-11
> 适用范围：`计算物理运动状态` 结构优化与复合 literal 类型族编码

## 一、下一轮目标

### 唯一目标

> 在不回退 Round 13 已确认的 vec3 literal 修复和 `接触地面 → 更新v、w` 接入的前提下，逐字段优化复合节点结构、`v停止` 路由和 literal 类型族支持。

### 范围

1. 以真实 `复杂gia/物理运动.gia` 为准，重点核验并修复 `计算物理运动状态` 的 `v停止`、`停止` 数据路由和相关 `compositePins`，禁止用语义等价简化替代真实逻辑结构。
2. 保留已经游戏内验证通过的独立 `与`、`can fly` 复合和 vec3 literal 编码，增加回归检查防止后续修改将其展开或破坏。
3. 完善 composite impl 普通节点 literal 与 `f.callComposite(...)` literal 的统一编码，优先覆盖 `int`、`float`、`bool`、`str`、`vec3`。
3. 评估 entity/guid/prefab 等实体类参数的 literal/connection 编码边界；如果需要新 API 或运行时适配层，先记录差异并与用户确认，不在本轮猜测设计。
4. 新增针对性自动回归，保留已通过的 `与`、`can fly`、vec3 literal，以及现有 `更新v、w` 外层拓扑、capture、sparse input、空名 capture、bool EnumId 和 vec3 Local Variable 修复。
5. 不处理 `Update`、TickManager、监听信号、54 节点 `物理运动控制器` 或布局参数，除非逐字段对照证明共享编码改动产生回归。

### 完成标准

1. 真实对照：记录目标复合 `v停止`、`停止` 输出对应的真实内部节点/OutParam、输入来源和 `compositePins`。
2. 自动验证：确认已验证的 `与` 和 `can fly` 仍作为独立复合存在，确认 `v停止`/`停止` 路由不被简化，并验证 literal 的 `class/type/alreadySetVal/bConcreteValue/indexOfConcrete/值字段`。
3. 类型验证：至少生成并检查 impl 普通节点 literal、nested composite call literal、literal/connection/capture 混合三类样本；单独记录哪些类型只有自动验证、哪些有真实 GIA 或游戏证据。
4. 生成结果：更新 `dist/tests/layout/physics-motion/main.gia`，完成 `gia-inspect`、`trace-dataflow` 和必要的 decoded JSON 对照。
5. 游戏验证：用户确认新 GIA 后再注入；重点检查 `v停止`、`与`、`can fly` 和各类型 literal 的编辑器显示/连线。
6. 提交条件：用户游戏内确认后归档 GIA 并更新当前文档；未确认时只报告自动验证通过，不写成整图完成。

## 二、可用资源与执行边界

### 已验证基线

- **游戏内通过**：`can fly` 内部三维向量内积第二输入的 vec3 literal 已显示为带初始值的 `(0, 1, 0)`。
- **当前实现已修复**：`src/compiler/ir_to_gia_transform/composite.ts` 的 `buildLiteralPin()` 已处理 `VectorBase`，生成 `class=7/type=12/alreadySetVal=true/bVector.val`。
- **自动验证通过**：Round 13 生成物中的 `计算物理运动状态.接触地面` 已连接到 `更新v、w` 的对应输入。
- **真实 GIA 已验证**：`计算物理运动状态` 有 2 个输入、4 个输出和 11 个内部节点；真实 impl 包含 `与`、`can fly`、两个向量模运算、两个小于比较、逻辑与、自定义变量读取和大于等于比较。
- **待验证**：真实 `v停止` 和 `停止` 的完整内部路由尚未完全同构；当前代码不得把直接 `|v| < 0.1` 当作最终真实实现。
- **游戏内通过、回归保护**：独立 `与`、`can fly` 复合和 `can fly` 内积 literal `vec3(0, 1, 0)` 已由用户确认生效；下一轮不重新修复它们，只确认优化 `v停止` 时没有展开或破坏它们。
- **已通过基线不得回退**：bool `EnumId { val: 1 }`、sparse named input、空字符串 capture、vec3 Local Variable、`更新v、w` 19 节点外层拓扑及已确认布局。

### 文档资源索引

#### P0：工作细节准则

- [`layout-working-rules.md`](layout-working-rules.md)
  - 用途：生成、注入、游戏反馈和提交边界。
  - 何时读：生成新 GIA、准备注入或收到截图/游戏反馈时。
  - 范围：核心协作规则、快速路径、路径速查、3.6/3.8/3.9/3.10/3.14、提交前检查。

#### P1：当前任务权威资料

- [`../physics-motion-recreate-guide.md`](../physics-motion-recreate-guide.md)
  - 用途：物理复刻当前实现、Round 13 发现和类型族关注点。
  - 何时读：修改 `计算物理运动状态`、literal 编码或更新文档时。
  - 范围：第 5.5、5.6、5.7 节，关键词 `v停止`、`与`、`can fly`、`literal 编码`。
- [`../../gia-tools-reference.md`](../../gia-tools-reference.md)
  - 用途：选择 decode、inspect、trace 和结构对比工具。
  - 何时读：字段、节点索引或 compositePins 不确定时。
  - 范围：1.2、3、4、6 节。
- [`../../architecture/composite/dsl-api.md`](../../architecture/composite/dsl-api.md)
  - 用途：确认 `defineComposite`、`callComposite`、literal 和嵌套复合的当前 API 语义。
  - 何时读：需要调整复合接口或讨论普通 JS literal 适配层时。
  - 范围：复合定义、调用、输入输出和类型约束章节。

#### P2：升级调查入口

- [`../../documentation-governance.md`](../../documentation-governance.md)
  - 用途：真实 GIA、当前实现、自动验证、注入成功和游戏通过发生冲突时区分证据等级。
  - 何时读：需要修改权威文档或出现来源冲突时。
- [`layout-handover-physics-motion-round-13.md`](layout-handover-physics-motion-round-13.md)
  - 用途：查看上一轮的实际发现和已完成边界。
  - 何时读：追溯 Round 13 的 vec3 literal 修复、用户反馈和注入结果时。

### 代码与测试入口

```text
src/compiler/ir_to_gia_transform/composite.ts
  buildLiteralPin / buildConnPin / composite impl 节点 pin 编码

tests/layout/physics-motion/composites/calculate-physical-motion-state.ts
  当前计算物理运动状态、can fly 和与复刻

tests/layout/physics-motion/main.ts
  接触地面 → 更新v、w 的主图接入

tests/layout/physics-motion/helpers/variables.ts
  物理自定义变量和图变量名称

tests/composite/trace-dataflow.ts
  真实/生成 GIA 的数据来源与跨复合追踪

tests/composite/gia-inspect.ts
  CompositeDef、compositePins 和接口字段

gsts.physics-motion.config.ts
  物理运动多文件生成入口
```

### 真实样本与比较字段

```text
真实文件：/home/h/genshin-ts/复杂gia/物理运动.gia
生成文件：/home/h/genshin-ts/dist/tests/layout/physics-motion/main.gia
目标 composite：计算物理运动状态
关联 composite：与、can fly、更新v、w
比较字段：节点 genericId/concreteId、pin kind+index/type、literal wrapper、compositePins、connects、输出映射
```

类型族证据边界：vec3 literal 已有游戏内通过；其他 literal 类型目前仅可声称源码/自动验证，除非获得对应真实 GIA 或用户游戏反馈，不得声称类型族全部通过。

### 易错点与禁止事项

1. 不要凭中文名或业务语义推断 `v停止`、`停止` 的来源；先 trace 真实输出和内部 OutParam。
2. 不要在优化 `v停止` 时重新展开已经游戏内通过的 `与`/`can fly` 复合；它们是回归保护项，不是本轮重新实现目标。
3. 不要把 `new vec3(...)` 在源码中的正确写法等同于 GIA 已有正确 literal；必须检查解码后的 `bVector`、`alreadySetVal` 和类型。
4. 不要把 vec3 修复推广为 int/float/bool/str/entity/guid/prefab 已验证。
5. runtime API 目前要求 runtime value；不要把普通 JS `true`、数字或数组直接传入需要 metadata 的路径，也不要用类型断言掩盖运行时错误。
6. 未经用户确认，不得注入、覆盖、删除、复制或归档游戏目录文件；自动生成不等于游戏行为通过。
7. 不要手改 `src/definitions/` 或 `src/thirdparty/`。

### 推荐工作流

1. 读取本 handover、物理指南和工作规则对应章节，明确只处理上述小点。
2. 解码真实复合并逐输出记录 `v停止`、`停止`、`接触地面`、`w停止` 的内部来源。
3. 先写最小真实同构测试，再对比 impl 节点和 `compositePins`，不要先做 API 抽象。
4. 检查当前 `buildLiteralPin()` 对各类型族及 nested call literal 的输出；补充 focused regression。
5. 修改最小共享实现或物理测试代码，运行 `npm run build` 和针对性测试。
6. 生成物理专用 GIA，使用 `gia-inspect`、`trace-dataflow`、decoded JSON 检查结构与 literal。
7. 向用户报告生成文件和差异；得到明确确认后再注入并等待游戏反馈。
8. 用户确认后更新本指南和 handover README；若仍有问题，保留“自动验证通过，待游戏内核验”状态。
