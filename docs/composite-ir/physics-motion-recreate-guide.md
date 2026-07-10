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
