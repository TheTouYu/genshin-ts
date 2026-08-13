# 复合节点编写方法论（composite-authoring）

> 来源：2026-08-14 魔方 P4 复合优化五轮实证（v1-v3 + 生产发现 #1/#3/#4）
> 验证层级：真实编译/注入/游戏核验；官方定义确认复合无限制，生产逐步支持

## 1. 复合节点的两种价值（用户定义）

| 类型 | 特征 | 价值 |
|---|---|---|
| 复用型 | 真正多处调用（rotate_vec x3、orbit_point x5、in_layer x8） | 节点数下降 + 逻辑单点维护 |
| 封装型 | 只调用 1-2 次，但把"一件事"的范围拆清楚（spin_block、orbit_calc） | 布局/阅读清晰：明确干了这一件事 |

**价值公式**：即使未被别处使用也不亏（布局清晰）→ 别处额外用一次更赚 → 跨游戏项目复用 = 巨大资产。
**原则：能做成复合节点的，一定往这个方向靠。**

## 2. 复合 vs 传统函数（能力差异）

复合节点最终是**编辑器里的一个节点**（内部 impl 图封装）：

- 调用方式：f.callComposite(handle, { 输入名: 值 })（不是 handle() 直接调用）
- 输出：const res = f.callComposite(...) → res.输出名（多输出支持）
- 嵌套：复合内可再 callComposite（大复合由小复合组成）
- 循环内可调用（循环体只物化 1 次）

## 3. 能力边界（生产现状 2026-08-14，官方无限制、生产逐步支持）

| 能力 | 复合内 | 备注/生产发现 |
|---|---|---|
| 纯数据计算 | 可以 | 首选（输入→输出） |
| exec 动作 | 可以 | registerExecNode(nodeType, value[]) + f.outflow("done", tail, 0) |
| startTimer | 可以 | 序列用 float_list 输入（宿主 new list("float", [...]）） |
| 嵌套复合 | 可以 | 内部 callComposite |
| 字面量输入 | 可以 | number/bigint/bool 自动包装（生产发现 #1 已修复） |
| setTimeout | 不可以 | missing compiler metadata（#3）——定时器回调留宿主 |
| dict 图变量读写 | 不可以 | GIA 编码层未从 implVariables 推断类型（#4）——字典动作留宿主 |
| whenTimerIsTriggered 等事件 | 不可以 | 事件注册在 g.server 层，不进复合 |

## 4. 编写步骤（写代码时不断复合）

1. **设计时识别**：重复出现的计算模式（复用型）+ 职责单元（封装型：自旋、层筛选、速度计算）。
2. **优先纯数据复合**：inputs/outputs 声明类型，build 只算不动作——最简单、最可复用。
3. **需要动作**：registerExecNode + outflows: ["done"] + build 末尾 f.outflow("done", tail, 0)——
   nodeType 从对应 f 方法源码抄（如 add_uniform_basic_rotation_based_motion_device），args 为 parseValue 后的 value 数组。
4. **嵌套**：大复合 = 小复合调用组合（spin_block 内含 3 x rotate_vec）。
5. **编译验证**：IR 检查 compositeDefs 数量与 compositeCalls（宿主调用数）；GIA 解码看顶层节点数。
6. **布局验证**：编辑器打开——宿主清爽（顶层 8 节点）、复合内部独立布局。
7. **游戏核验**：行为不变（复合化不改逻辑）。

## 5. 通用型复合节点（跨项目资产）

原生节点比较功能有限（一次一个），可包装扩展为通用能力：

```ts
// 示例：任意一个值超过阈值（一次比较多个）——任何游戏项目可用
const anyGreater = g.defineComposite("any_greater", {
  inputs: { a: { type: "float" }, b: { type: "float" }, c: { type: "float" }, t: { type: "float" } },
  outputs: { hit: { type: "bool" } },
  build: ({ a, b, c, t }, f) => ({
    hit: f.logicalOrOperation(f.greaterThan(a, t), f.logicalOrOperation(f.greaterThan(b, t), f.greaterThan(c, t)))
  })
})
```

积累这类通用复合（比较/数学/条件组合）→ 跨项目复用资产。

## 6. 陷阱清单（生产发现汇总）

- callComposite 输入用 f.callComposite（handle 不可直接调用）；字面量输入修复后自动包装。
- exec 复合必须声明 outflows 并在 build 里 f.outflow 连接（否则下游无法连接）。
- 复合内 getNodeGraphVariable 的 dict 变量类型未推断（#4）——先用宿主读写字典。
- 复合内 setTimeout 不可用（#3）——定时器回调留宿主，回调里可调复合。
- build 里 new str/float/int 需要 import 值类（genshin-ts/runtime/value）。
- 复合内 startTimer 的序列数组用 float_list 输入（宿主 new list("float", [...])）。

## 7. 验证记录（2026-08-14 rubik 复合优化链）

| 版本 | 动作 | 宿主节点 | 顶层图 |
|---|---|---|---|
| v1 | rotate_vec + orbit_point + in_layer | 286→239 | 8 节点 4 列 |
| v2 | spin_block + orbit_calc（纯数据） | 239→187 | 8 节点 |
| v3 | spin_block 升级 exec（动作入复合） | 187→186 | 8 节点 |
