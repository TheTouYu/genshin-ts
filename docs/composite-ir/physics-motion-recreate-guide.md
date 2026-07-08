# 物理运动 GIA 复刻写法指南

> 状态：当前推荐 / 进行中
> 来源：真实 GIA 验证 + 当前 gsts 复刻脚本
> 最近校验：2026-07-08
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

## 4. 下一步：完整复刻「设置物理参数」

用户指定下一步小点：把下方的 `设置物理参数` 复合节点完整复刻出来。

下一轮开始前应先运行：

```bash
npx tsx tests/composite/trace-exec-flow.ts 复杂gia/物理运动.gia --expand=设置物理参数 --io
npx tsx tests/composite/trace-dataflow.ts 复杂gia/物理运动.gia --list-nodes --composite=设置物理参数
```

然后逐个节点确认：

1. 内部控制流入口和出口。
2. 每个系统 API 节点类型。
3. 每个参数的数据来源，是复合输入、字面量、变量读取，还是其它内部数据节点。
4. 是否存在需要 raw control-flow DSL 的多入口、多出口或 fan-in/fan-out。

写完后应把新增节点 API 写法继续补充到本文档。

## 5. 后续代码组织探索

完整 `物理运动.gia` 较大，后续不宜把所有复刻代码塞进单个测试文件。下一轮需要探索更接近真实工程的组织方式：

```text
tests/layout/physics-motion/
├── composites.ts        # 复合节点定义库
├── variables.ts         # 变量名、常量、类型辅助
├── step0-init.ts        # 小步测试入口
├── step1-params.ts      # 设置物理参数复刻入口
└── main.ts              # 最终完整入口，编译成一个 GIA
```

目标：多个测试入口可以复用同一批复合节点和 helper，最终主入口仍能编译成一个完整 GIA。这需要先验证当前 gsts pipeline 对跨文件 import 的处理是否稳定。
