# 布局任务交接文档 · 物理运动复刻 Round 4

> 状态：历史记录
> 来源：当前代码实现 + 真实 GIA 验证 + 用户游戏内反馈
> 最近校验：2026-07-09
> 适用范围：`复杂gia/物理运动.gia` 复刻工程、复合节点 impl InFlow fan-out、nested composite literal pin、impl 布局、`设置物理参数` 后续排查

> **本轮结果**：已修复 `设置物理参数` 复合 impl 的默认 InFlow fan-out、`mul3` 调用 literal 输入 pin 缺失、以及 impl 布局退化为单行的问题，并重新注入成功。随后用户游戏内反馈了新的复刻质量问题：`Get Custom Variable` 输入参数显示为空、`asType('float')` 输出类型编码错误导致 `G -> mul3` 连线断开、`S`/`D` 节点应保留但移除控制流入口。本轮已完成核验，尚未修改这些新问题。

---

## 一、本轮已完成的代码修复

### 1.1 复合 impl 默认 InFlow fan-out

修改文件：

```text
src/runtime/composite_registry.ts
```

问题：

- 上一轮 `设置物理参数` 的 IR `implEdges` 中，capture root 已经 fan-out 到多个内部 Set 节点。
- 但 `CompositeDefIR.compositePins` 默认只生成一条：

```text
outer InFlow[0] -> capture root
```

- Stage 3 过滤掉 `__composite_capture__` 后，只能重定向到第一个 child，导致最终 GIA 里外部 InFlow 只进入一个内部节点。

本轮修复：

- 当没有显式 `f.inflow(...)` mark，且存在 capture root 出边时：
  - 遍历 `impl.edges[captureNodeId]`。
  - 为每条 capture root 出边生成一条 InFlow `compositePin`。
  - 保留 `target_index`。

修复后当前生成：

```text
设置物理参数.compositePins 中 outer InFlow[0] 条目数量 = 11
```

这与真实文件“一个外部 InFlow 映射多个内部系统节点”的模式一致。

### 1.2 impl 控制流 target InFlow index 保留

修改文件：

```text
src/compiler/ir_to_gia_transform/composite.ts
```

问题：

- impl 图编码 OutFlow `connects` 时此前固定写：

```text
connect InFlow index = 0
```

- 对 raw control-flow DSL 的多 InFlow 目标不够安全。

本轮修复：

- 编码 impl OutFlow connects 时读取 `edge.target_index ?? 0`。
- 生成：

```text
connect:  { kind: InFlow, index: targetIndex }
connect2: { kind: InFlow, index: targetIndex }
```

### 1.3 nested composite literal 输入 pin

修改文件：

```text
src/compiler/ir_to_gia_transform/composite.ts
```

问题：

- `__composite_call__` 在 impl 图内只给 `conn` 类型输入创建 pin。
- literal 参数不会创建物理 InParam pin。
- `设置物理参数` 内部调用 `mul3(G, t, 0.5)` 时，第三个参数 `0.5` 因此在游戏内缺失。

本轮修复：

- `__composite_call__` 为每个实际传入的 input 创建 pin：
  - `conn` 输入：创建连接 pin 并填充 `connects`。
  - literal 输入：创建 literal pin 并保留 `compositePinIndex`。

修复后当前生成：

```text
mul3 调用节点 pins = 3
```

### 1.4 复合 impl 布局单行退化

修改文件：

```text
src/compiler/ir_to_gia_transform/composite.ts
```

原因已确认：

- Stage 3 编码时会过滤 `__composite_capture__`，这是正确的，因为 capture 节点不应进入最终 GIA。
- 但 `computeImplLayout()` 复用了过滤 capture 后的图，布局算法看不到“复合入口 -> 多个内部节点”的 fan-out。
- 因此多个可见节点被当成 detached/data-only 结构处理，最终排成一条超长水平线。

本轮修复：

- 仅在布局计算中加入虚拟输入 anchor：

```text
__composite_input_anchor__ -> 多个 inner InFlow targets
```

- 虚拟节点只参与布局，不编码进最终 GIA。

修复前用户反馈/decoded 证据：

```text
bbox: minX=0 maxX=21600 minY=300 maxY=300
```

修复后 decoded 证据：

```text
bbox: minX=-550 maxX=1130 minY=0 maxY=6311
```

说明已经不再是单行长链。

### 1.5 复刻源码补入口 link

修改文件：

```text
tests/layout/physics-motion/composites/set-physics-params.ts
```

本轮补上：

```ts
f.link(entry, 0, setHalfGravityDeltaSquared)
```

使 `0.5gt` 的 Set 节点接入复合入口 fan-out。

---

## 二、本轮验证记录

### 2.1 构建

```bash
npm run build
```

结果：通过。

### 2.2 重新生成物理运动复刻 GIA

```bash
node bin/gsts.mjs -c gsts.physics-motion.config.ts || true
npx tsx tools/decode-gia.ts dist/tests/layout/physics-motion/main.gia > /tmp/physics-gen.json
```

注：不设置 `GSTS_LOCALLOW_DIR` 时，当前 WSL 环境会因为多个 `LocalLow` 报注入失败；这不影响生成结构核验。

结构核验结果：

```text
IR 设置物理参数 outer InFlow[0] compositePins = 11
GIA 设置物理参数 outer InFlow[0] compositePins = 11
GIA mul3 调用节点 pins = 3
GIA 设置物理参数 bbox = -550..1130 × 0..6311
```

### 2.3 重新注入

用户要求重新注入后执行：

```bash
GSTS_LOCALLOW_DIR=/mnt/c/Users/touyu/AppData/LocalLow \
node bin/gsts.mjs -c gsts.physics-motion.config.ts dist/tests/layout/physics-motion/main.gia
```

结果：

```text
[ok] injected main.gia -> /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741845.gil (65ms)
```

---

## 三、用户注入后新反馈的问题

用户反馈 4 点：

1. 获取自定义变量的输入参数全部是空。
2. 浮点数类型实际上使用了整数/错误类型。
3. `mul3` 三个参数中有一个来自自定义变量 `G`，但因为第 2 点类型错误，实际连线断开。
4. `S`、`D` 节点游戏里面存在，但是弃用了；游戏里的做法是移除这两个节点的输入控制流引脚，而不是直接删除节点，方便下次继续启用。

本轮按用户要求只核验，不修改。

---

## 四、新反馈核验结果

核验命令：

```bash
npx tsx tools/decode-gia.ts dist/tests/layout/physics-motion/main.gia > /tmp/physics-gen.json
npx tsx tools/decode-gia.ts 复杂gia/物理运动.gia > /tmp/physics-ref.json
```

### 4.1 `Get Custom Variable` 输入参数为空：已确认

当前生成的 `get_custom_variable` 节点（系统节点 `nid=50`）变量名在：

```text
InParam[0]
```

例如：

```text
n13 get_custom_variable
  InParam[0] = "G"
```

真实参考文件变量名在：

```text
InParam[1]
```

例如：

```text
n2 get_custom_variable
  InParam[1] = "G"
```

当前 IR 中 `get_custom_variable` 参数形状是：

```json
[
  { "type": "entity", "value": null, "capture": true },
  { "type": "str", "value": "G" }
]
```

当前 Stage 3 在 impl 节点构建 pin 时会跳过 `capture: true` 的参数，但跳过后没有保留 pin index 占位，导致变量名从真实应有的 `InParam[1]` 被压缩到 `InParam[0]`。

下一轮优先排查：

```text
src/compiler/ir_to_gia_transform/composite.ts
buildImplNodePins()
```

重点：跳过 capture arg 时是否应该 `pinIndex++`，或者对 `get_custom_variable` 做专门 pin index 保留。

### 4.2 `asType('float')` 输出类型错误：已确认

当前生成的 `get_custom_variable("G")` OutParam：

```text
OutParam[0]
type = 6
class = StringBase
```

真实参考 `get_custom_variable("G")` OutParam：

```text
OutParam[0]
type = 5
class = ConcreteBase
indexOfConcrete = 4
inner = FloatBase
```

这说明当前 impl GIA 编码没有把 IR 连接中携带的 `type: "float"` 反映回 `get_custom_variable` 节点自身的 OutParam。

当前 IR 其实已经有下游连接类型信息，例如：

```json
{ "type": "conn", "value": { "node_id": 2, "index": 0, "type": "float" } }
```

但 `buildImplNodePins()` 对 `get_custom_variable` 的自动 OutParam 生成没有利用这份“下游要求的输出类型”。

下一轮可考虑：

- 为 composite impl 构建一个 `implConnTypeIndex`，类似主图 `buildConnTypeIndex()`。
- 对 `get_custom_variable`、`generic` 输出节点，根据下游 `conn.value.type` 生成正确 concrete OutParam。

### 4.3 `G -> mul3` 连线断开：原因链成立

当前 `mul3` 调用节点已经有 3 个 pin：

```text
mul3 pin0 <- get_custom_variable("G")
mul3 pin1 <- division(updateIntervalFloat, 1000)
mul3 pin2 = 0.5
```

但 `pin0` 的来源节点 `get_custom_variable("G")` OutParam 类型错误：

```text
来源 OutParam 当前编码成 StringBase / 非正确 float
目标 mul3.pin0 期望 float
```

因此用户反馈“因为参数类型错误，实际连线断开”与 decoded 证据一致。

### 4.4 `S`、`D` 节点应保留但移除控制流入口：已确认

当前生成：

```text
Set Node Graph Variable ×11
Get Custom Variable("S") 存在
Get Custom Variable("D") 存在
Set Node Graph Variable("S") 不存在
Set Node Graph Variable("D") 不存在
```

真实参考：

```text
Set Node Graph Variable ×13
Set Node Graph Variable("S") 存在
Set Node Graph Variable("D") 存在
```

但真实文件外部 InFlow fan-out 不会进入 `S`、`D` 两个 Set 节点。也就是说真实做法是：

```text
保留 Set("S") / Set("D") 节点和数据输入
移除/不提供输入控制流入口
```

而不是删除节点。

下一轮复刻源码应改为：

- 创建 `setStiffness` / `setDamping` 节点。
- 保留其数据输入连线。
- 不执行：不要 `f.link(entry, 0, setStiffness)` / `f.link(entry, 0, setDamping)`。

---

## 五、下一轮建议优先级

### P0：修复 impl 中 capture arg 跳过导致 pin index 压缩

目标：让 `get_custom_variable` 的变量名进入 `InParam[1]`，与真实 GIA 一致，避免游戏内显示输入参数为空。

重点文件：

```text
src/compiler/ir_to_gia_transform/composite.ts
```

重点函数：

```text
buildImplNodePins()
```

验收：

```text
生成 GIA 中 get_custom_variable("G") 的变量名 pin index = 1
```

### P1：修复 generic/asType 输出 concrete 类型

目标：`get_custom_variable(...).asType('float')` 在 impl GIA 中生成 concrete float OutParam，而不是 string/int/默认类型。

验收参考：

```text
真实 float custom variable OutParam:
type = 5
class = ConcreteBase
indexOfConcrete = 4
inner class = FloatBase
```

注意：`更新间隔` 是 int，真实为：

```text
type = 3
class = ConcreteBase
indexOfConcrete = 0
inner class = IntBase
```

`运动实体guid` 真实为 ID/GUID 类：

```text
type = 2
class = ConcreteBase
indexOfConcrete = 3
inner class = IdBase
```

### P2：保留 S/D 的 Set 节点但不接入口控制流

目标：`Set Node Graph Variable` 数量恢复到 13，同时 `S`/`D` 不在 outer InFlow[0] compositePins 目标中。

验收：

```text
Set Node Graph Variable ×13
Set("S") / Set("D") 存在
outer InFlow[0] 不映射到 Set("S") / Set("D")
```

### P3：重新注入游戏核验

命令：

```bash
npm run build
node bin/gsts.mjs -c gsts.physics-motion.config.ts || true
GSTS_LOCALLOW_DIR=/mnt/c/Users/touyu/AppData/LocalLow \
node bin/gsts.mjs -c gsts.physics-motion.config.ts dist/tests/layout/physics-motion/main.gia
```

重点让用户看：

1. `Get Custom Variable` 输入参数是否不再为空。
2. float custom variable 到 Set / `mul3` 的连线是否恢复。
3. `S`、`D` 是否保留但不执行。
4. 布局是否仍可清楚辨认。

---

## 六、给下一位助手的一句话

> Round 4 已修复复合 impl 默认 InFlow fan-out、nested composite literal input pin、impl 布局单行退化，并成功重新注入。用户随后反馈的新问题已核验但未修改：`get_custom_variable` 在 impl 中因为 capture arg 被跳过而把变量名压缩到 `InParam[0]`，真实应为 `InParam[1]`；`asType('float')` 没有让 `get_custom_variable` OutParam 编成 concrete float，导致 `G -> mul3` 断线；真实 `S`/`D` Set 节点应保留但不接入口控制流。下一轮先修 `buildImplNodePins()` 的 capture pin-index 保留和 generic/asType 输出 concrete 类型，再补 S/D detached Set 节点。
