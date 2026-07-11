# 物理运动 GIA 复刻写法指南

> 状态：当前推荐 / 进行中
> 来源：真实 GIA 验证 + 当前 gsts 复刻脚本
> 最近校验：2026-07-10
> 适用范围：`复杂gia/物理运动.gia` 结构复刻、AI 编写复杂 GIA 代码、布局压力测试

本文档记录复刻 `物理运动.gia` 时确认过的 API 写法和真实节点结构。目标不是复刻真实文件坐标，也不假设真实布局完美；目标是让 AI 能逐步写出与真实 GIA 控制流、数据流、复合节点结构一致的 gsts 代码，用这些真实结构测试当前自动布局是否合理。

## 1. 工作原则

1. 先 trace 真实 GIA，再写代码；不能凭节点名猜参数来源。
2. 每轮只复刻一个可核验的小结构，但这个小结构内部要尽量保持真实控制流和数据流一致。
3. 不使用无意义占位节点替代真实节点；如果某个参数暂时难以表达，应明确记录差异，而不是伪造来源。
4. 真实 GIA 坐标只作为观察材料，不作为必须复刻的目标。
5. 每轮写完后，把新增 API 写法、真实节点参数来源、当前差异补到本文档。

## 2. 当前参考文件

真实样本：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/复杂gia/物理运动.gia
/home/h/genshin-ts/复杂gia/物理运动.gia
```

常用分析命令：

```bash
npx tsx tests/composite/trace-exec-flow.ts 复杂gia/物理运动.gia --io
npx tsx tests/composite/trace-dataflow.ts 复杂gia/物理运动.gia <nodeIndex> --all-params --max-depth 10
npx tsx tests/composite/dump-nodes.ts 复杂gia/物理运动.gia
npx tsx tools/decode-gia.ts 复杂gia/物理运动.gia | jq '...'
```

### 2.1 多文件复刻工程与测试文件

复杂复刻应把入口、复合和 helper 分文件，并通过专用 config 一次编译所有依赖。本工程使用：

```text
gsts.physics-motion.config.ts
tests/layout/physics-motion/main.ts
tests/layout/physics-motion/composites/*.ts
tests/layout/physics-motion/helpers/*.ts
```

先生成但不注入：

```bash
node bin/gsts.mjs -c gsts.physics-motion.config.ts --noinject
```

需要游戏内测试时，必须显式传入生成的单个 GIA，使 `config.inject.nodeGraphId` 生效：

```bash
GSTS_LOCALLOW_DIR=/mnt/c/Users/touyu/AppData/LocalLow \
node bin/gsts.mjs -c gsts.physics-motion.config.ts \
  dist/tests/layout/physics-motion/main.gia
```

编译器级回归放在 `tests/composite/`，用 `node:assert/strict` 直接检查 `buildCompositeAccessories(...)` 的结果。例如本轮的 `test-local-variable-impl-concrete-type.ts` 检查 generic/concrete node ID 和 pin type。此类测试只证明被断言的字段；涉及编辑器兼容时，还必须与最小真实 GIA 逐字段比较 `pin kind/index`、`bConcreteValue.indexOfConcrete`、连接端口和游戏内行为。

### 2.2 本轮使用的 composite 和数据节点 API

定义纯数据复合：

```ts
const child = g.defineComposite('子复合', {
  inputs: {
    v: { type: 'vec3', pinIndex: 100 }
  },
  outputs: {
    结果: { type: 'vec3', pinIndex: 200 }
  },
  build(args, f) {
    return { 结果: f._3dVectorNormalization(args.v) }
  }
})
```

在另一个 composite 的 `build()` 内嵌套调用：

```ts
const result = f.callComposite(child, { v: args.v })
return { 输出: result.结果 }
```

本轮常用数据节点写法：

```ts
const parts = f.split3dVector(v)
const vector = f.create3dVector(parts.xComponent, 0, parts.zComponent)
const cross = f._3dVectorCrossProduct(a, b)
const scaled = f._3dVectorZoom(vector, scale)
const local = f.getLocalVariable(scaled)
return { 输出: local.value }
```

`getLocalVariable(...)` 返回两个不同语义的输出：`localVariable` 是句柄，`value` 是存储值。真实 GIA 中两者的物理 OutParam index 和类型编码不能混用。若高层 API 的 TypeScript 表面返回类型是 `number`、`boolean` 等，但 raw API 需要 runtime `value`，使用 `asRuntimeValue(...)` 做运行时检查；不要用 `as unknown as value` 隐藏错误。

### 2.3 从游戏节点反查 gsts API

拿到节点显示名或 nid 后按以下顺序查询，不凭名称猜方法：

1. 在 `node_pin_records.ts` 查显示名、nid、输入输出顺序。
2. 在 `node_id.ts` 查 generic/typed concrete ID。
3. 在 `src/definitions/nodes.ts` 查对应高层方法签名和返回字段。
4. 中文名可在 `src/definitions/zh_aliases.ts` 反查英文方法。
5. 最后用真实 GIA 的 decode 结果确认 pin kind/index 和 concrete value 包装。

以 `Get Local Variable` 为例：

```bash
rg -n "name: 'Get Local Variable'" \
  src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.ts
rg -n 'Get_Local_Variable' \
  src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_id.ts
rg -n 'getLocalVariable\\(' src/definitions/nodes.ts
rg -n '获取局部变量' src/definitions/zh_aliases.ts
```

已知 nid 时，可以先查：

```bash
rg -n 'id: <nid>' \
  src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.ts
```

不要只检查 `genericId/concreteId/type`。本轮证明：这些字段自动对齐后，真实编辑器仍可能因为物理 OutParam index 或 `bConcreteValue` 包装不同而断线。

## 3. Step 0：初始化块

### 3.1 真实结构

真实节点：

```text
n38 When Entity Is Created @ (-4191, 1991)
├─ n29 Create Prefab       @ (-3355, 1812)
└─ n12 复合:设置物理参数    @ (-3899, 2315)

n45 Get Custom Variable("物理计算元件id") -> n29 Create Prefab.InParam[0]
n38 When Entity Is Created.OutParam[0] -> n12 设置物理参数.InParam[0]
```

真实数据流证据：

```bash
npx tsx tests/composite/trace-dataflow.ts 复杂gia/物理运动.gia 29 --all-params --max-depth 10
npx tsx tests/composite/trace-dataflow.ts 复杂gia/物理运动.gia 12 --all-params --max-depth 10
```

观察：

```text
Create Prefab.InParam[0] "Pfb"
  <- n45 Get Custom Variable.OutParam[0]

设置物理参数.InParam[0]
  <- n38 When Entity Is Created.OutParam[0]
```

`decode-gia.ts` 进一步确认 `n45` 的变量名：

```text
Get Custom Variable.InParam[1] = "物理计算元件id"
```

### 3.2 gsts 写法

当前复刻脚本：

```text
tests/layout/layout-physics-motion-step0-init.ts
```

关键写法：

```ts
const prefabIdFromCustomVariable = f
  .getCustomVariable(e.eventSourceEntity, '物理计算元件id')
  .asType('prefab_id')

const createPrefab = f.node('create_prefab', [prefabIdFromCustomVariable])
f.link(f.entry(), 0, createPrefab)
```

复合调用写法：

```ts
const setPhysicsParams = g.defineComposite('设置物理参数-step0', {
  inputs: {
    targetEntity: { type: 'entity' }
  },
  outputs: {},
  build(args, f) {
    f.printString('设置物理参数-step0')
    f.printString(str(args.targetEntity))
    return {}
  }
})

f.callComposite(setPhysicsParams, {
  targetEntity: e.eventSourceEntity
})
```

事件 fan-out 使用普通 `f.fork(...)`，因为当前步骤只需要从同一个事件入口分出两条执行分支。

### 3.3 当前生成结构

自动核验命令：

```bash
npm run build
node bin/gsts.mjs tests/layout/layout-physics-motion-step0-init.ts || true
npx tsx tests/composite/trace-exec-flow.ts dist/tests/layout/layout-physics-motion-step0-init.gia --io
npx tsx tests/composite/trace-dataflow.ts dist/tests/layout/layout-physics-motion-step0-init.gia 3 --all-params --max-depth 10
npx tsx tests/composite/trace-dataflow.ts dist/tests/layout/layout-physics-motion-step0-init.gia 4 --all-params --max-depth 10
npx tsx tests/composite/dump-nodes.ts dist/tests/layout/layout-physics-motion-step0-init.gia
```

当前生成：

```text
n1 When Entity Is Created
├─ n3 Create Prefab
└─ n4 复合:设置物理参数-step0

n2 Get Custom Variable -> n3 Create Prefab.InParam[0]
n1 When Entity Is Created.OutParam[0] -> n4 设置物理参数-step0.InParam[0]
```

当前坐标：

```text
n1 When Entity Is Created      @ (2, 3)
n3 Create Prefab               @ (802, 1)
n4 复合:设置物理参数-step0     @ (803, 619)
n2 Get Custom Variable         @ (383, 191)
```

用户已游戏内验证：布局合理。

### 3.4 已知差异

真实 `Create Prefab` 只有 `Pfb` 和 `Bol` 两个显式 pin，其他参数是预设值。当前 gsts 复刻通过 `f.node('create_prefab', [prefabIdFromCustomVariable])` 保持关键 `Pfb` 数据来源一致，并让其它输入走当前编译器默认值。

这属于已知差异；下一轮如果需要值级别完全一致，再单独分析 `Create Prefab` 默认 pin 的 GIA 编码，而不是用假数据来源补齐。

## 4. Step 1：设置物理参数

### 4.1 当前工程化组织

本轮开始改为接近真实 App 的多文件组织，而不是继续堆单文件测试：

```text
tests/layout/physics-motion/
├── main.ts
├── composites/
│   ├── math.ts
│   └── set-physics-params.ts
├── helpers/
│   └── variables.ts
└── README.md
```

新增专用配置：

```text
gsts.physics-motion.config.ts
```

推荐编译：

```bash
node bin/gsts.mjs -c gsts.physics-motion.config.ts
```

原因：多文件结构需要让入口、composite 和 helper 一起 emit 到 `dist`。不要优先用单文件命令编译这个目录。

### 4.2 真实结构

真实 `设置物理参数` 复合接口：

```text
复合:设置物理参数
InFlow[0] pinIndex=370
Input[0] 目标实体 entity pinIndex=1365
OutFlow: 无
Output: 无
```

真实内部节点列表：

```text
Set Node Graph Variable ×13
Get Custom Variable ×12
Query Entity by GUID ×2
Data Type Conversion ×1
Division ×1
复合:mul3 ×1
```

真实变量映射摘要：

```text
G       <- Get Custom Variable("G")
S       <- Get Custom Variable("S")
1/I     <- Get Custom Variable("1/I")
D       <- Get Custom Variable("D")
R       <- Get Custom Variable("R")
u       <- Get Custom Variable("u")
m       <- Get Custom Variable("m")
u_w     <- Get Custom Variable("u_w")
f_g     <- Get Custom Variable("f_g")
运动实体 <- Query Entity by GUID(Get Custom Variable("运动实体guid"))
视觉实体 <- Query Entity by GUID(literal guid 1077936360 in real file; current gsts uses custom variable "视觉实体guid")
t       <- Data Type Conversion(Get Custom Variable("更新间隔")) / 1000
0.5gt   <- mul3(G, t, 0.5)
```

真实控制流里多个 `Set Node Graph Variable` 都由复合入口 fan-out 触发；当前 gsts 用 `f.entry()` + `f.link(entry, 0, node)` 表达。

### 4.3 当前 gsts 写法

当前文件：

```text
tests/layout/physics-motion/composites/set-physics-params.ts
tests/layout/physics-motion/composites/math.ts
tests/layout/physics-motion/helpers/variables.ts
tests/layout/physics-motion/main.ts
```

关键写法：

```ts
export const setPhysicsParams = g.defineComposite('设置物理参数', {
  inputs: {
    目标实体: { type: 'entity', pinIndex: 1365 }
  },
  outputs: {},
  inflows: [{ name: '', pinIndex: 370 }],
  build(args, f) {
    const targetEntity = args.目标实体 as entityValue
    const gravity = f.getCustomVariable(targetEntity, 'G').asType('float')
    const updateInterval = f.getCustomVariable(targetEntity, '更新间隔').asType('int')
    const deltaSeconds = f.division(f.dataTypeConversion(updateInterval, 'float'), 1000)

    const setGravity = f.node('set_node_graph_variable', [new strValue('G'), gravity, false])
    const entry = f.entry()
    f.link(entry, 0, setGravity)
  }
})
```

`mul3` 不能写成 raw 系统节点；真实文件里它是复合节点。本轮新增：

```text
tests/layout/physics-motion/composites/math.ts
```

用 `f.callComposite(mul3, { a, b, c })` 生成复合节点。

### 4.4 当前生成结构

已执行：

```bash
npm run build
node bin/gsts.mjs -c gsts.physics-motion.config.ts
npx tsx tests/composite/trace-dataflow.ts dist/tests/layout/physics-motion/main.gia --list-nodes --composite=设置物理参数
npx tsx tests/composite/trace-exec-flow.ts dist/tests/layout/physics-motion/main.gia --io
```

当前主图：

```text
n1 When Entity Is Created
├─ n3 Create Prefab
└─ n4 复合:设置物理参数

n2 Get Custom Variable -> n3 Create Prefab.InParam[0]
n1 When Entity Is Created.OutFlow[0] -> n4 设置物理参数.InFlow[0]
```

当前 `设置物理参数` 内部节点列表：

```text
Set Node Graph Variable ×13
Get Custom Variable ×12
Query Entity by GUID ×2
Data Type Conversion ×1
Division ×1
复合:mul3 ×1
```

Round 5 已完成自动验证和用户游戏内验证：

- 12 个 `Get Custom Variable` 的变量名均保留在 `InParam[1]`；capture 实体参数不编码物理 `InParam[0]`，但不会压缩后续 pin index。
- `.asType('float' | 'guid' | 'int')` 会为 impl 中的 `Get Custom Variable` 选择 typed `concreteId` 和 ConcreteBase OutParam。float/guid/int 的参考 concrete index 分别为 4/3/0。
- `G -> mul3` 的 float 来源类型与目标 pin 一致；`mul3` 调用仍有 3 个输入 pin，literal `0.5` 未回归。
- `Set("S")`、`Set("D")` 节点已补回，但没有加入 outer `InFlow[0]` fan-out。当前 Set 数量为 13，入口目标仍为 11。
- 用户于 2026-07-10 确认本轮游戏内测试通过。

### 4.5 当前差异 / 下一步

1. 真实 `视觉实体` 使用 `Query Entity by GUID` 的 literal guid `1077936360`；当前为了保持可维护性，仍使用 `Get Custom Variable("视觉实体guid")`。后续需由用户决定按真实 literal 复刻，还是保留可配置变量。
2. raw `f.node()` 只接受 runtime `value[]`，而部分高层 DSL 输出的 TypeScript 表面类型是 `number` / `bigint` / `boolean` / `string`。当前使用 `asRuntimeValue(...)` 进入 raw API：它保留原运行时 pin 对象并执行 `instanceof value` 校验，误传普通 literal 会立即报错。旧的 `as unknown as value` 已从本工程移除；类型契约和运行时回归分别见 `scripts/typecheck-runtime-value-adapter.ts`、`tests/composite/test-runtime-value-adapter.ts`。

## 5. Step 2：更新v、w 外层拓扑

### 5.1 真实接口

真实 `更新v、w` 定义：

```text
InFlow[0] pinIndex=1423
Input[0] 接触地面 bool  pinIndex=1422
Input[1] 更新间隔 float pinIndex=543
OutFlow[0] 是           pinIndex=485
Output[0] F_aero vec3   pinIndex=1798
Output[1] F摩擦力 vec3 pinIndex=1799
```

真实外层实现共 19 个节点：

```text
复合调用 ×5
  计算滚动角速度 / 计算分力 / 更新速度 / 更新角速度 / 顺序执行
Set Node Graph Variable ×9
Get Node Graph Variable ×3
Double Branch ×2
```

控制流：先按 `接触地面` 分支；地面路径再按 `计算分力.滚动` 分支。三条路径分别写入 `F`、`J`，滚动路径额外写入 `w`；随后统一调用 `更新角速度`、`更新速度` 并写回 `w`、`v`。`顺序执行.OutFlow[0]` 清零 `额外压力`，`顺序执行.OutFlow[3]` 直接映射为外层 OutFlow `是`。

数据边界：

- `计算分力(w, v, 额外压力)` 提供各路径的 F/J、`滚动` 与两个外层 vec3 输出。
- 外层 `更新间隔` fan-out 到 `更新速度`、`更新角速度`。
- `F_aero`、`F摩擦力` 直接映射到 `计算分力.OutParam[6/7]`。

### 5.2 当前复刻

源码：

```text
tests/layout/physics-motion/composites/update-vw.ts
tests/layout/physics-motion/composites/calculate-forces.ts
tests/layout/physics-motion/composites/force-aerodynamics.ts
tests/layout/physics-motion/composites/force-friction.ts
tests/layout/physics-motion/composites/force-torque.ts
tests/layout/physics-motion/composites/update-vw-stubs.ts
```

`计算分力` 已按真实 GIA 层级替换代理语义，包括 `aerodynamic_forces`、`slip_velocity`、`friction_force`、`摩擦力矩`、`w衰减力矩`、`力矩`、`计算合力` 和 `计算滚动摩擦力`。当前仍保留阶段性实现的子复合为：

- `计算滚动角速度` 暂时返回当前 `w`。
- `更新角速度` 暂时返回当前 `w`。
- `更新速度` 暂时返回当前 `v`。
- `顺序执行` 保留 1 InFlow / 4 个同名 OutFlow 的真实接口。

主图暂时把 `更新v、w` 作为 `When Entity Is Created` 的第三条分支，传入 `接触地面=false`、`更新间隔=0.02`。这是用户确认的阶段性接入方式；真实上游 `Update` 与 `计算物理运动状态` 后续再复刻。

### 5.3 自动验证与游戏反馈

自动结构核验：

```text
nodeCount=19
compositeCalls=5
setNodes=9
getNodes=3
doubleBranches=2
```

同时确认：

- 外层接口名称、类型和 pinIndex 与真实文件一致。
- 外层 OutFlow 直接映射到 nested `顺序执行.OutFlow[3]`。
- `顺序执行.OutFlow[0]` 生成物理 pin `compositePinIndex=514` 并连接清零 `额外压力`。
- `Get Node Graph Variable("w"/"v")` 使用 vec3 concreteId 348，`额外压力` 使用 float concreteId 341。
- `更新速度`、`更新角速度` 的 `capture: true` 父输入不再生成物理 InParam，两个 nested call 均为 `pins=[]`；`更新间隔` 仍通过两条 impl `compositePins` 路由到逻辑 `InParam[0]`。自动回归见 `tests/composite/test-nested-composite-capture-pins.ts`。

注入命令：

```bash
GSTS_LOCALLOW_DIR=/mnt/c/Users/touyu/AppData/LocalLow \
node bin/gsts.mjs -c gsts.physics-motion.config.ts dist/tests/layout/physics-motion/main.gia
```

用户于 2026-07-10 确认主体核验通过并允许提交。

Physics Round 8 已完成布局回归：composite impl 在共享布局完成后仅对 `execNodes` 应用 `execLaneSpacingScale=0.6`。`更新v、w` 中控制流分支相对 Y 收紧约 40%，数据节点坐标、所有 X 坐标、拓扑和 pin 保持不变。物理运动整图与五个历史主要布局场景均经用户游戏内验证通过。过程和归档文件见 [handover/layout-handover-physics-motion-round-8.md](handover/layout-handover-physics-motion-round-8.md)。

### 5.4 `计算分力` 的局部变量编码（最小样本游戏内通过）

用户在游戏内核对 `计算分力` 层级时发现，输出 `F摩擦力` 所用 `Get Local Variable` 的输入和值输出不是三维向量，相关连线因此断开；后续层级中的同类节点也受相同问题影响。早期修复只把 typed node ID 改为 `2660`，没有对齐物理 pin 和 concrete value 包装，因此游戏内复测仍失败。

2026-07-10 用户提供了同时包含主图和 composite impl 两条路线的最小真实样本：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/user_edit/变量/局部变量.gia
```

使用 `tools/decode-gia.ts` 解码并通过 `tests/composite/recreate-local-variable-reference.ts` 同构复刻后，确认 vec3 局部变量的真实编码为：

- getter：`genericId=18`、`concreteId=2660`，物理 pin 为 `InParam[0]` 和值 `OutParam[1]`。
- setter：`genericId=19`、`concreteId=2678`，句柄输入 `InParam[0].type=16` 连接 getter 逻辑 `OutParam[0]`，值输入 `InParam[1].type=12` 连接 `OutParam[1]`。
- vec3 数据 pin 的 `bConcreteValue.indexOfConcrete=6`，内层为 `class=7/type=12`。
- Local Variable 句柄 pin 的 `value=null`；getter 的句柄 `OutParam[0]` 可被连接和 compositePin 引用，但不序列化为实体物理 pin。

通用修复位于 `src/compiler/ir_to_gia_transform/composite.ts` 和 `index.ts`。复合 getter/setter 复用 vendor typed pin 编码；setter 从第二个参数推断 concrete type，getter从值输出或初值参数推断；主图和复合 impl 均清理隐藏句柄物理 pin和空句柄值。

`tests/composite/test-local-variable-impl-concrete-type.ts` 已扩充为真实最小复合形态，覆盖 concreteId、pin index/type、concrete wrapper、vec3 初值及两条消费者连接。重新生成 `dist/tests/layout/physics-motion/main.gia` 后，`slip_velocity`、`friction_force`、`计算分力` 三处 getter 均自动验证为 `18/2660`、`indexOfConcrete=6`、值输出 `OutParam[1]`，此前 `friction_force` 物理端口不一致已消失。

用户于 2026-07-10 导入 `局部变量-gsts复刻.gia`，确认主图和 composite impl 两条路线均游戏内测试通过。通过文件已移动归档到：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/真-测试通过/布局/局部变量-gsts复刻.gia
```

### 5.5 `更新速度`、`更新角速度`、`计算滚动角速度` 当前实现

2026-07-10 已按真实 `复杂gia/物理运动.gia` 的节点列表和数据来源，替换掉三个复合返回当前 `v/w` 的阶段性代理实现。源码位于：

```text
tests/layout/physics-motion/composites/update-vw-stubs.ts
```

自动核验命令：

```bash
node bin/gsts.mjs -c gsts.physics-motion.config.ts --noinject
npx tsx tests/composite/trace-dataflow.ts dist/tests/layout/physics-motion/main.gia \
  --list-nodes --composite='更新速度'
npx tsx tests/composite/trace-dataflow.ts dist/tests/layout/physics-motion/main.gia \
  --list-nodes --composite='更新角速度'
npx tsx tests/composite/trace-dataflow.ts dist/tests/layout/physics-motion/main.gia \
  --list-nodes --composite='计算滚动角速度'
```

当前公式来源为真实 GIA trace：

- `更新速度`：`v + F * (更新间隔 * (1 / m))`。
- `更新角速度`：`w + J * (更新间隔 * (1/I))`。
- `计算滚动角速度`：读取 `w`、`v`、`R`，通过 `向量缩放除法(v, R)`、`dot(w, vec3(0, 0.9, 0))` 构造 `a朝向`，再调用 `w角速度-a朝向转化` 并输出其 `w角速度`。

同时新增真实子复合接口：

- `向量缩放除法`：`三维向量 / 标量`，接口 pinIndex 为 `379/383 -> 396`。
- `w角速度-a朝向转化`：接口 pinIndex 为 `w角速度=314`、`a朝向=315`、输出 `a朝向=313`、`w角速度=316`。

2026-07-10 进一步修复了当前 gsts 的 composite call sparse/named input 编码缺口：`f.callComposite(w角速度-a朝向转化, { a朝向 })` 现在会按子复合声明保留 `a朝向` 的物理输入 index，生成 `InParam[1]`，不会压缩成 `InParam[0]`。该通用修复位于 `src/runtime/core.ts`、`src/runtime/ir_builder.ts`、`src/runtime/composite_registry.ts`、`src/compiler/ir_to_gia_transform/layout.ts`、`index.ts` 和 `composite.ts`；回归见 `tests/composite/test-composite-sparse-named-input.ts`。当前物理生成 trace 显示 `w角速度-a朝向转化.InParam[0]` 未连接，`InParam[1] a朝向` 连接上游 `Create 3D Vector`，与真实 `计算滚动角速度` 的稀疏输入结构一致。用户已游戏内确认该修复生效。

同轮游戏内核验还发现 `向量缩放除法` 的接口定义正确，但内部 `Division.InParam[1]` 没有引用复合输入，截图为 `Beyond_Local_Export/布局/复合节点-核验问题-向量缩放除法.png`。2026-07-11 已按 [handover/layout-handover-physics-motion-round-11.md](handover/layout-handover-physics-motion-round-11.md) 修复当前 gsts 的空字符串输入名 capture 路由：`src/runtime/composite_registry.ts` 现在用 `inputName === undefined` 判断“没有捕获输入名”，并用 `__captureInputName !== undefined` 标记 IR capture，避免合法空名输入被当成缺失输入跳过。回归见 `tests/composite/test-composite-empty-name-input.ts`；保留 `tests/composite/test-composite-sparse-named-input.ts` 防止稀疏命名输入回退。

真实 GIA 对照：`npx tsx tests/composite/gia-inspect.ts 复杂gia/物理运动.gia -p` 显示真实 `向量缩放除法` impl 的 compositePins 为 `outer:InParam:0 → 3D Vector Zoom.InParam[0]`、`outer:InParam:1 → Division.InParam[1]`、`outer:OutParam:0 → 3D Vector Zoom.OutParam[0]`。当前生成对照：`npx tsx tests/composite/gia-inspect.ts dist/tests/layout/physics-motion/main.gia -s 33 -c` 显示 `outer:InParam:1 → n[2] inner:InParam:1`；`trace-dataflow` 显示 `Division.InParam[1] ← 父输入 "向量缩放除法"."inputs[1]"`。该项已自动验证通过，并于 2026-07-11 由用户游戏内确认通过。

### 5.6 Round 13 发现与通用编码关注点

2026-07-11，用户对 `计算物理运动状态` 复刻进行了多轮注入和游戏内检查，确认以下问题和修复边界：

1. **不要用语义简化替代真实复合结构**：早期复刻把 `v停止` 及其相关逻辑压缩成直接的 `|v| < 0.1`，并把真实嵌套 `与` 复合展开成普通 `logicalAndOperation`。用户确认生成图与真实图差异明显。后续复刻必须先按真实节点、嵌套复合和 `compositePins` 还原，再讨论高层 API 的抽象。
2. **复合节点定义必须保留**：`计算物理运动状态` 内的 `与`、`can fly` 是真实复合节点，不应仅在源码中保留等价逻辑而让 GIA 展开为普通节点。当前物理测试源码已恢复独立 `与` 和 `can fly` 定义；`v停止` 的真实输出路由仍应继续按真实 GIA 逐字段核验，不得因当前游戏检查部分生效就声称已完全一致。
3. **vec3 literal 曾缺少初始值**：源码的 `new vec3([0, 1, 0])` 正确表达了 literal，但 `src/compiler/ir_to_gia_transform/composite.ts` 的 `buildLiteralPin()` 遗漏 `VectorBase`，曾编码为 `class=0/alreadySetVal=false`。现已补充 `bVector.val={x:0,y:1,z:0}` 和 `alreadySetVal=true`；用户已游戏内确认修复生效。
4. **literal 编码要按类型族验证**：后续应分别覆盖 `int`、`float`、`bool`、`str`、`vec3` 以及 entity/guid/prefab 等实体类参数，不能从 vec3 修复推断其他类型已正确。比较字段至少包括 `class`、`type`、`alreadySetVal`、`bConcreteValue.indexOfConcrete`、内部值字段和物理 pin index。
5. **复合调用 literal 与普通节点 literal 要分开检查**：本轮 vec3 问题出现在 composite impl 内的普通 `3D Vector Dot Product` 输入；后续还需检查 `f.callComposite(...)` 的 literal 输入、嵌套复合输入，以及 literal/conn/capture 混合时的 sparse pin 保留。
6. **运行时值适配不能用普通 JS 值替代 runtime value**：尝试把 bool literal 直接写成 `true` 曾触发 `a.getMetadata is not a function`。需要继续使用 `new bool(...)`、`new float(...)`、`new vec3(...)` 等 runtime value，或完善明确的 literal 适配层；不能用类型断言掩盖运行时契约错误。

本轮用户已确认 `can fly` 内积第二参数 `(0, 1, 0)` 的初始值修复生效；这只证明该 vec3 literal 编码和对应游戏显示通过，不等于 `计算物理运动状态` 全部逻辑或 `v停止` 已完成游戏验证。

### 5.7 当前剩余差异

1. vec3 Local Variable 通用编码已用最小真实结构完成游戏内验证；物理运动整图仍需单独确认三处 getter 所在层级。
2. `更新速度`、`更新角速度`、`计算滚动角速度` 已替换阶段性代理语义；`计算滚动角速度` 中嵌套调用 `w角速度-a朝向转化` 的稀疏输入 pin 编码已通过编译器通用修复对齐自动 trace。
3. `更新v、w` 控制流布局和 nested capture pin 修复沿用此前已验证结果。
4. `向量缩放除法` 内部 `Division.InParam[1]` 空名输入路由已自动验证并经用户游戏内确认通过。
5. composite bool 输入的 `EnumId { val: 1 }` 元数据问题已修复，并经自动回归和用户游戏内验证；完整证据见 [r20-bool-enum-metadata.md](retrospectives/r20-bool-enum-metadata.md)。下一轮目标已转为复刻真实 `计算物理运动状态`，并将其 `接触地面` 输出接入当前 `更新v、w`；入口见 [handover/layout-handover-physics-motion-round-13.md](handover/layout-handover-physics-motion-round-13.md)。
