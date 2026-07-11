# 物理运动复刻 Round 13 交接

> 状态：当前推荐 / 待执行
> 来源：用户确认的目标 + 当前代码实现 + 真实 GIA 结构观察
> 最近校验：2026-07-11
> 适用范围：复刻 `计算物理运动状态` 并接入当前 `更新v、w`

## 一、下一轮目标

### 唯一目标

> 按真实 `复杂gia/物理运动.gia` 复刻 `计算物理运动状态` 复合，并将其 `接触地面` 输出接入当前 `更新v、w`，替换主图中的 `false` 阶段性输入。

### 范围

1. 只处理 `计算物理运动状态` 的真实接口、内部 11 节点结构、数据来源和 `接触地面` 输出路由。
2. 在当前物理复刻工程中接入该复合；保留已通过的 `更新v、w` 外层拓扑、bool 元数据、Local Variable、稀疏输入和空名 capture 修复。
3. 不处理 `Update`、TickManager、监听信号、`物理运动控制器` 54 节点编排器，也不调整已通过的布局参数，除非结构接入确实暴露共享编码问题。

### 完成标准

1. 真实对照：记录真实 `计算物理运动状态` 的接口、节点列表、关键输入/输出来源和 `compositePins`；以真实 GIA 为证据，不凭节点名猜参数。
2. 自动验证：新增或更新针对性回归，确认 `计算物理运动状态` 的 11 节点结构、输出类型/索引，以及 `接触地面 → 更新v、w` 的连接。
3. 生成结果：运行物理运动专用 config，生成 `dist/tests/layout/physics-motion/main.gia`，完成结构 trace；生成结果不等于游戏行为通过。
4. 游戏验证：用户确认目标文件和导入方式后再注入；重点检查 `接触地面` 输出是否正确连接、`更新v、w` 是否不再使用固定 `false`。
5. 提交条件：只有用户游戏内确认通过后，才归档 GIA、更新完成状态并提交；未验证前保持“自动验证通过，待游戏内核验”。

## 二、可用资源与执行边界

### 已验证基线

- `游戏内通过`：composite bool 类型已补齐 `CompositeDef.ParameterFlow.Type.field 101` 的 `EnumId { val: 1 }`；bool 控件可以正常显示和选择 `true/false`。详见 [`../retrospectives/r20-bool-enum-metadata.md`](../retrospectives/r20-bool-enum-metadata.md)。
- `游戏内通过`：`更新v、w` 的 19 节点外层拓扑、nested capture pin、布局收紧，以及 `更新速度`/`更新角速度`/`计算滚动角速度` 的当前实现。
- `游戏内通过`：sparse named input、空字符串 inputName capture/compositePins 路由、vec3 Local Variable 编码。
- `自动验证通过，待本目标游戏验证`：当前主图把 `更新v、w` 接到 `When Entity Is Created`，并传入 `接触地面=false`、`更新间隔=0.02`；本轮只替换前者的阶段性来源。
- `真实 GIA 已验证`：`复杂gia/物理运动.gia` 主图存在 `计算物理运动状态`（11 节点、2 个输入、4 个输出），其输出包含 `停止`、`v停止`、`接触地面`、`w停止`；真实主图中 `更新v、w.接触地面` 由该计算链提供。
- `待验证`：本地复刻工程尚未实现 `计算物理运动状态`，真实 11 节点的具体参数来源和可复刻 API 需要下一轮逐字段确认。

### 文档资源索引

#### P0：工作细节准则

- [`layout-working-rules.md`](layout-working-rules.md)
  - 用途：真实 GIA 分析、生成、注入、用户游戏反馈和 handover 交付边界。
  - 何时读：开始解码/生成前；需要复制、注入、归档或清理游戏导入目录前。
  - 范围：核心协作规则、最小样本快速路径、路径速查、3.1/3.2/3.6/3.8/3.9/3.10/3.13、游戏内验证交互和 handover 规则。

#### P1：当前任务权威资料

- [`../physics-motion-recreate-guide.md`](../physics-motion-recreate-guide.md)
  - 用途：当前物理复刻工程、已通过修复和下一步边界。
  - 何时读：开始修改前、更新物理复刻知识时。
  - 范围：第 2 节、第 5.2/5.3/5.5/5.6 节，搜索 `计算物理运动状态`、`更新v、w`、`bool`。
- [`../../gia-tools-reference.md`](../../gia-tools-reference.md)
  - 用途：选择 decode、trace、gia-inspect 和结构化比较工具。
  - 何时读：需要确认真实节点参数、compositePins 或生成结果时。
  - 范围：`decode-gia`、`trace-dataflow`、`trace-exec-flow`、`gia-inspect`。
- [`../../architecture/composite/dsl-api.md`](../../architecture/composite/dsl-api.md)
  - 用途：确认当前 `defineComposite` / `callComposite`、数据输出和复合嵌套语义。
  - 何时读：真实结构需要新复合接口、输出路由或嵌套调用时。
  - 范围：复合定义、输入/输出、复合中调用复合。

#### P2：升级调查入口

- [`../../documentation-map.md`](../../documentation-map.md)
  - 用途：任务扩展到 Update、信号系统或新知识域时重新路由资料。
- [`../../documentation-governance.md`](../../documentation-governance.md)
  - 用途：真实 GIA、当前实现、自动回归和游戏验证结论发生冲突时区分证据等级。
- [`layout-handover-physics-motion-round-12.md`](layout-handover-physics-motion-round-12.md)
  - 用途：只追溯 bool 类型修复的目标和完成边界；不再把 bool 编码当作本轮待修问题。

### 代码与测试入口

```text
tests/layout/physics-motion/main.ts
  当前阶段性入口；本轮替换更新v、w 的 false 来源。

tests/layout/physics-motion/composites/update-vw.ts
  当前更新v、w 外层接口和接触地面输入消费位置。

tests/layout/physics-motion/composites/
  新复合优先放在此目录，保持多文件工程结构。

gsts.physics-motion.config.ts
  物理运动多文件编译入口。

tests/composite/trace-dataflow.ts
  真实/生成 GIA 的参数来源和跨复合数据流核验。

tests/composite/gia-inspect.ts
  CompositeDef、compositePins 和接口结构核验。
```

### 真实样本与比较字段

```text
真实文件：/home/h/genshin-ts/复杂gia/物理运动.gia
备用路径：/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/复杂gia/物理运动.gia
目标 composite：计算物理运动状态
已知主图调用：n=51
已知相关消费者：更新v、w（真实主图 n=61）
比较字段：CompositeDef inputs/outputs、节点 nid/concreteId、pin kind+index/type、compositePins、connects、数据来源
```

类型族边界：本轮真实结构和游戏目标集中在该复合及其 `接触地面` bool 输出；不能因为 bool 元数据已验证就声称所有类型族或整个物理主图都已游戏验证。

### 易错点与禁止事项

1. 不要直接把 `计算物理运动状态` 的输出替换成业务猜测或常量；先 trace 真实数据来源。
2. 不要把 `更新v、w` 的 `接触地面` 与执行流 InFlow 混为一谈；分别比较数据 pin、类型和连接。
3. 不要回退已验证的 bool `EnumId` field 101、sparse named input、空名 capture 或 Local Variable 编码。
4. 不要在本轮顺手复刻 Update、信号系统或 54 节点 `物理运动控制器`。
5. 未经用户确认，不得复制、覆盖、注入、删除或清理游戏目录文件；自动生成和注入成功也不能写成游戏行为通过。
6. 不要手改 `src/definitions/` 或 `src/thirdparty/`；协议/定义问题必须遵循生成或 vendor 维护流程。

### 推荐工作流

1. 读取本 handover、物理复刻指南和工作规则的对应小节，确认目标仅为 `计算物理运动状态`。
2. 解码真实 GIA，定位该 composite 的定义、impl 图和主图调用；记录 11 个节点、接口、数据来源与接触地面输出。
3. 查询对应节点定义和当前 DSL API，编写最小同构复合，不凭中文名推断参数。
4. 生成当前物理工程，使用 `gia-inspect`、`trace-dataflow` 和必要的 wire/decoded 对比检查结构。
5. 将 `main.ts` 中 `new bool(false)` 替换为该复合的 `接触地面` 输出，保留其他阶段性输入和已通过布局。
6. 运行针对性回归、`npm run build`（如修改编译器/运行时）和物理专用 config 生成，记录自动验证结果。
7. 向用户报告生成文件和仅改动的结构；得到明确确认后再注入，等待游戏内反馈。
8. 用户确认通过后更新物理复刻指南和 handover README；若未通过，保留本 handover 的待验证状态并记录新证据。

### Round 13 实际发现

- 用户游戏内确认：`can fly` 内部三维向量内积的第二参数已正确显示为带初始值的 `vec3(0, 1, 0)`。
- 根因：`src/compiler/ir_to_gia_transform/composite.ts` 的 `buildLiteralPin()` 缺少 `VectorBase` 分支；已补充 `bVector` 和 `alreadySetVal=true`，并完成构建、生成和重新注入。
- 用户指出：早期 `v停止` 复刻存在逻辑简化，真实 `与` 复合被遗漏/展开，后续必须优先逐节点、逐 `compositePins` 对齐，不能只复刻语义等价结果。
- 后续通用关注：复合调用 literal、impl 普通节点 literal、int/float/bool/str/vec3/entity/guid/prefab 类型族、`bConcreteValue` 包装和 runtime value 适配均需独立回归；本轮只对 vec3 literal 获得游戏内确认。
- 当前状态：自动生成通过，vec3 literal 游戏内通过；`v停止` 和整个 `计算物理运动状态` 仍保持待完全验证。
