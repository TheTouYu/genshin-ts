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

### 已验证资产目录（2026-08-15 从 rubik v20 提炼，全部游戏核验通过）

**A. 通用数学/几何类（纯数据、零玩法依赖，可直接复制到任何项目）**

| 复合 | 接口 | 内容 | 适用 |
|---|---|---|---|
| `rotate_vec` | (v:vec3, u:vec3, c:float, s:float) → out:vec3 | Rodrigues 旋转公式（轴角参数化） | 任意 3D 旋转 |
| `local_axis_rot` | (v:vec3, angle:float, u:vec3) → out:vec3 | 绕任意轴旋转（角度制，内部转弧度，含 cos/sin） | 旋转运动器类玩法 |
| `spin_axis_triple` | (v:vec3, rot:vec3) → out:vec3 | 三轴顺序旋转（Y→X→Z 局部系） | 刚体朝向变换 |
| `orbit_point` | (vp, vPerp, axv:vec3, c, s:float) → p:vec3 | 圆周运动点计算 p = vp + vPerp·c + axv·s | 环绕/轨道类玩法 |
| `axis_compare` | (coord:float, isPos, isNeg:bool) → hit:bool | 阈值比较（>3 或 <3，方向参数化） | 范围/层判断 |
| `any_greater` | (a,b,c,t:float) → hit:bool | 多值超阈值（一次比较多个） | 通用条件组合 |

**B. 机制模式类（模式可复用，需按项目参数化）**

| 模式 | 参考实现 | 适用场景 |
|---|---|---|
| **定时器序列调度**（scheduler+trigger 分离） | gsts_orbit_scheduler（调用流注册 start_timer 序列）+ gsts_orbit_trigger（事件流分发） | 任何"延迟序列动作"：一次注册多个时间点，事件触发时按 timerName 分发 |
| **MB 分发**（dispatch） | gsts_orbit_segment_dispatch（seg → multipleBranches → 各子复合） | 按运行时索引/名称分发到不同子逻辑 |
| **输入锁 + 解锁**（tab_lock 模式） | 输入期间忽略新输入；完成后 registerExecNode('start_timer') 解锁 | 互斥/防抖玩法 |
| **信号封装** | 复合内 sendSignal（msg/tag 参数） + 图级 onSignal 消费 | 跨图/跨实体事件通知 |
| **混合复合**（事件旁路+调用流） | verify_event_comp / tab_lock | 同复合内既有调用流入口又有事件监听 |

**C. 玩法特定（不复用，仅作编写范例）**：spawn_rubik、turn_block、create_corner、layer_hit、in_layer。

**复用判定标准**：inputs/outputs 全为通用标量/vec3 + 不读图变量/不依赖实体状态 = A 类直接复制；
依赖 start_timer/事件/信号 = B 类按模式重写；依赖魔方特有状态 = C 类只借鉴结构。

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
