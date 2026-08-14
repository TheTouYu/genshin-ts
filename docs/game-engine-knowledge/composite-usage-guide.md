# 复合节点使用指南（Composite Usage Guide）

> 状态：已定稿（规则 #10-#21 全部闭合后成文）
> 来源：2026-08-13~14 魔方 P4 复合化战役 + 复合族验证实验（2696 日志全通过）
> 最近校验：2026-08-15
> 适用范围：复合节点的设计、编写、验证全流程——"什么时候复合、怎么设计接口、怎么写、怎么避开已知坑、怎么验证"
> 关联文档：规则细节见 composite-nodes.md（#10-#21 全链）；编写方法论见 game-from-scratch 技能 references/composite-authoring.md；体检工具见 composite-nodes.md 体检章节

---

## 1. 什么时候该复合化（用户的 5-7 节点标准）

**标准：每层级打开一张图，看到 5~7 个节点。超过 7 个就复合化。**

判断一个功能块是否值得做成复合节点，看两种价值（用户定义）：

| 类型 | 特征 | 价值 |
|---|---|---|
| **复用型** | 真正多处调用（rotate_vec x3、orbit_point x5、in_layer x8） | 节点数下降 + 逻辑单点维护 |
| **封装型** | 只调用 1-2 次，但把"一件事"的范围拆清楚（spin_block、orbit_segment_dispatch） | 布局/阅读清晰 |

**价值公式**：即使未被别处使用也不亏（布局清晰）→ 别处额外用一次更赚 → 跨游戏项目复用 = 巨大资产。
**原则：能做成复合节点的，一定往这个方向靠。**

复合化里程碑参考（rubik 魔方）：主图 155→15 节点；22 个复合，层级 2-16 节点；
每层打开 5-7 节点（用户标准达成）；故障域隔离（一个复合出问题，改它一个）。

## 2. 复合节点的四种形态（先分类再动手）

| 形态 | 接口 | 内部 | 示例 |
|---|---|---|---|
| **纯数据流** | inputs + outputs | 只算不动作 | rotate_vec、orbit_point、axis_compare |
| **调用流**（exec 动作） | inflows + outflows（可带数据） | registerExecNode + f.outflow 链 | spin_block、orbit_scheduler |
| **纯事件流** | 无 inflows/outflows（事件入口） | f.on(...) 注册事件，事件回调内分发 | gsts_orbit_trigger |
| **混合复合** | inflows/outflows + 事件旁路 | 调用流 + f.on 独立监听并存 | tab_lock、verify_event_comp |

**核心架构原则（用户 2026-08-14 指导）**：调用流与事件流分开表达——
"调用流复合的引脚 = 设置完之后的控制流；事件流复合的引脚 = 事件触发时"。
接口语义清晰是第一位的；一个复合**不要混**：事件回调是独立执行流，capture 参数在
事件流中不可见（2690 日志实证）。

## 3. 接口设计规范

### 声明

```ts
const comp = g.defineComposite('名字', {
  inputs: { i: { type: 'int' }, target: { type: 'entity' } }, // 数据输入
  outputs: { hit: { type: 'bool' } },                          // 数据输出
  inflows: ['init'],                                           // 控制流入口（调用流复合必须有）
  outflows: ['done'],                                          // 控制流出口
  build: ({ i, target }, f) => {
    // 内部实现
    return { hit: ... }
  }
})
```

### 语义要点（每条都有实证）

- **outflows 必须显式声明**，且 build 里必须 f.outflow 连接（否则下游无法连接；条件动作用 outflow 分支语义，不要用数据输出表达"做没做"——#15）。
- **exec 动作入复合**：registerExecNode(nodeType, value[]) + build 末尾 f.outflow('done', tail, 0)；nodeType 从对应 f 方法源码抄（如 add_uniform_basic_rotation_based_motion_device），args 为 parseValue 后的 value 数组。
- **inflows 声明即物理入口**：混合复合必须有调用流入口（inflows 非空）；纯事件复合不声明 inflows/outflows（判定见 5.3）。
- **调用方式**：f.callComposite(handle, { 输入名: 值 })（handle 不可直接调用）；输出：const res = f.callComposite(...) → res.输出名（多输出支持）；循环内可调用。
- **嵌套**：大复合 = 小复合调用组合（spin_block 内含 3 x rotate_vec）。
- **输入命名**：可读英文名（i/seg/target/name）；定时器名等运行时字符串参数用 dataTypeConversion 生成唯一名（'0'..'7'），多块并发注册互不冲突。

## 4. 三种架构模式（参考 rubik v20 规范实现）

### 模式 A：调用流复合（gsts_orbit_scheduler 例）

```ts
// 输入 {i, target}：内部 1 个 start_timer 序列 [0.2, 0.4, 0.6, 0.8]
// （替代宿主 4 个 setTimeout + 捕获字典 100 节点）。
const gstsOrbitScheduler = g.defineComposite('gsts_orbit_scheduler', {
  inputs: { i: { type: 'int' }, target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ i, target }, f) => {
    const tname = f.dataTypeConversion(i, 'str') // 块唯一定时器名
    const t = f.registerExecNode('start_timer', [
      target, tname, new bool(false),
      f.assemblyList([new float(0.2), new float(0.4), new float(0.6), new float(0.8)], 'float')
    ])
    f.outflow('done', t, 0)
    return {}
  }
})
```

要点：图内定时器替代 setTimeout（生产能力）；**定时器回调留宿主事件（或模式 B），复合内 setTimeout 不可用**（#3 能力边界）。

### 模式 B：纯事件流复合（gsts_orbit_trigger 例）

```ts
// 入口 = whenTimerIsTriggered 事件（无调用流输入）；用事件载荷分发：
// evt.timerName → multipleBranches，case 内 i 用字面量，seg/target 用事件自带字段。
const gstsOrbitTrigger = g.defineComposite('gsts_orbit_trigger', {
  inputs: {}, outputs: {},
  build: (_a, f) => {
    f.on('whenTimerIsTriggered', (evt: any, ef: any) => {
      f.multipleBranches(evt.timerName as never, {
        '0': () => { ef.callComposite(gstsOrbitSegmentDispatch, { i: 0, seg: evt.timerSequenceId, target: evt.eventSourceEntity }) },
        // ... case '1'..'7'
        'unlock': () => { ef.setNodeGraphVariable('lock', false, false) },
        default: () => {}
      })
    })
    return {}
  }
})
```

要点：**事件回调内的参数必须来自事件载荷字段**（timerName/timerSequenceId/eventSourceEntity）或字面量——不要用 capture（#19/#20a 实证）。

### 模式 C：混合复合（tab_lock / verify_event_comp 例）

```ts
const eventComp = g.defineComposite('verify_event_comp', {
  inputs: {}, outputs: {},
  inflows: ['init'],
  outflows: ['done'],
  build: (_a, f) => {
    // 事件节点独立监听（不参与调用流）
    f.on('whenCustomVariableChanges', (_evt: any, ef: any) => {
      ef.registerExecNode('print_string', [new str('evt-var-change')])
    })
    // 调用流：entry → print(init) → done
    const gate = f.node('print_string', [new str('evt-init')])
    f.link(f.entry(), 0, gate, 0)
    f.outflow('done', gate, 0)
    return {}
  }
})
```

要点：**事件节点独立旁路，不参与调用流**；调用流有真实入口（entry → ... → outflow）。

## 5. 已知边界与陷阱（每条都是踩过的坑，可操作版）

### 5.1 capture 是惰性引用，不是调用时快照（#19）
复合输入 capture 在**事件回调**（延迟执行路径）里不是调用时的值——引擎沿数据链追回宿主数据源，重求值后可能变成别的值。**事件回调里用事件载荷字段或字面量，不用 capture。**

### 5.2 impl 内部 exec 边必须有物理 InFlow pin（#20b）
复合 impl 内，exec 边指向的复合调用节点（22001）必须有物理 InFlow pin；上游普通节点 OutFlow → 复合调用节点 InFlow。缺失 → 被调复合零帧（2691 日志：MB 分支→dispatch 调用后 dispatch 不执行）。**体检工具 C3b 自动查**。

### 5.3 纯事件复合判定三条件（#20c）
= 事件节点 + 无 outflow 标记 + 无显式 inflow 声明。混合复合（有调用流）不是纯事件复合。判定错 → 注入器裁剪调用点引脚 → 边丢失（读图自检发现）。

### 5.4 复合内事件触发语义（#21）
- whenCustomVariableChanges：**实体自定义变量**（触发事件=是）→ 触发 ✅
- whenNodeGraphVariableChanges：**图变量**变化 → 复合内不触发 ❌（轮 12f + 2695 复现）
- whenTimerIsTriggered：✅（定时器在复合内注册后，事件在复合内监听）
- finite_loop（有限循环）：复合内可用 ✅
- sendSignal：复合内可编码，图级 onSignal 可消费参数 ✅

### 5.5 能力边界速查（生产现状 2026-08-14）

| 能力 | 复合内 | 说明 |
|---|---|---|
| 纯数据计算 | ✅ | 首选（输入→输出） |
| exec 动作 | ✅ | registerExecNode + f.outflow |
| startTimer | ✅ | 序列用 float_list 输入 |
| 嵌套复合 | ✅ | 内部 callComposite |
| 字面量输入 | ✅ | number/bigint/bool 自动包装 |
| finite_loop / 事件 / sendSignal | ✅ | 见 5.4 |
| setTimeout | ❌ | 缺编译器 metadata（#3）——定时器回调留宿主或模式 A/B |
| dict 图变量读写 | ❌ | GIA 编码层未从 implVariables 推断类型（#4）——字典动作留宿主 |
| 复合输入 capture 进事件回调 | ❌ | 见 5.1 |

### 5.6 编辑器保存副作用（#18）
get/set_node_graph_variable 的**变量名必须字面量 str**；编辑器保存会清空调用点字面量参数（固定参数变 0）。体检工具 C2 自动查。

## 6. 编写 → 验证流程（每步都有产出物）

1. **设计时识别**：重复计算（复用型）+ 职责单元（封装型）；先分类（第 2 节表格）。
2. **优先纯数据复合**：inputs/outputs 声明类型，build 只算不动作——最简单、最可复用。
3. **需要动作**：registerExecNode + outflows + f.outflow（模式 A）。
4. **事件**：独立事件流复合或混合复合旁路（模式 B/C）。
5. **编译验证**：IR 检查 compositeDefs 数量与 compositeCalls；GIA 解码看顶层节点数。
6. **体检（自动防线）**：npm run health:composite（已接入 npm test）——C1 capture 路由 / C2 字面量参数 / C3 exec 链 / C3b impl InFlow / C4 OutParam。
7. **读图自检（修复后强制）**：注入后读 .gil 主图全景 + 复合 impl 图——判定标准：dispatch 类复合应显示"外部入口 InFlow → MB 分支 → 各子复合调用"，执行流条数 = MB 分支数 + 后续链；接口 inflows 非空（混合复合必须有调用流入口）。
8. **游戏核验**：行为不变（复合化不改逻辑）+ 新能力按 case 验证。

## 7. 设计检查清单（写完复合后逐条过）

- [ ] 每层打开 5~7 节点？超过 → 继续拆
- [ ] 分类正确？（数据/调用流/事件流/混合）接口语义清晰？
- [ ] 事件流与调用流分开？（不混 capture 进事件回调）
- [ ] exec 复合：outflows 声明 + f.outflow 连接了？
- [ ] 事件复合：载荷字段/字面量，不用 capture？
- [ ] 图变量名字面量？（#18）
- [ ] 条件动作用 outflow 分支语义？（#15）
- [ ] 体检全绿？读图自检执行流条数正确？
- [ ] 涉及定时器：setTimeout 留宿主，start_timer 入复合？

---

> 验证记录：本文所有示例均来自已验证生产代码（rubik v20 游戏核验通过、verify/composite-family 三实验 2696 日志全通过）；"待验证推测"已在文中明确标注。

