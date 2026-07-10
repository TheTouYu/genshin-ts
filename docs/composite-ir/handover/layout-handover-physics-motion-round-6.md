# 布局任务交接文档 · 物理运动复刻 Round 6

> 状态：历史记录 / 主体游戏内验证通过 / 布局待调
> 来源：当前代码实现 + 真实 GIA 验证 + 自动结构验证 + 用户游戏内反馈
> 最近校验：2026-07-10
> 适用范围：`复杂gia/物理运动.gia` 的 `更新v、w` 外层拓扑、嵌套复合 OutFlow、trace 工具和布局后续回归

> **本轮结果**：已完成 `更新v、w` 的真实外层接口与 19 节点拓扑复刻，并用 5 个代理子复合保留后续逐层替换边界；修复 `trace-exec-flow --expand`、detached composite marker 类型、嵌套复合 OutFlow 提升和 Stage 3 物理 OutFlow pin 编码。自动结构验证通过，显式注入成功，用户确认主体核验通过并允许提交。用户同时反馈该复合布局在垂直方向过于松散，下一轮需小步调整布局系数并回归此前通过的复合布局。

通用路径、注入命令、小步验证和用户交互约定见 [layout-working-rules.md](layout-working-rules.md)。遇到结构歧义、游戏状态、布局取舍或资源副作用必须先向用户确认，不继续猜测。

---

## 一、本轮目标与用户确认

本轮目标由用户明确指定为复刻真实 `复合:更新v、w`，并要求：

1. 有任何问题先确认，不要埋头继续。
2. 先修复阻塞分析的 trace 工具。
3. 循序渐进，只做外层接口和拓扑，不进入 5 个子复合算法。
4. 当前阶段允许把 `更新v、w` 暂接到 `When Entity Is Created`；真实 `Update` 上游以后再考虑。
5. 子复合代理语义经用户确认后实施。

---

## 二、trace 工具修复

修改：

```text
tests/composite/trace-exec-flow.ts
```

问题：

```bash
npx tsx tests/composite/trace-exec-flow.ts 复杂gia/物理运动.gia --expand='更新v、w' --io
```

旧结果：

```text
❌ 分析失败: compOutflows is not defined
```

根因：`expandSubGraph()` 调用 `buildTree(..., compOutflows, ...)`，但 `compOutflows` 没有从 `analyze()` 传入 `showExpand()` / `expandSubGraph()`。

修复后同一命令可展开完整内部执行流，并正确显示嵌套 `顺序执行` 的 `[是, 是, 是, 是]` 出口名。相邻 `设置物理参数` 展开也正常。

---

## 三、真实 `更新v、w` 结构

真实接口：

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
Set Node Graph Variable ×9
Get Node Graph Variable ×3
Double Branch ×2
```

5 个嵌套复合：

```text
计算滚动角速度
计算分力
更新速度
更新角速度
顺序执行
```

真实控制流摘要：

```text
接触地面 Double Branch
├─ 是 -> 滚动 Double Branch
│  ├─ 是 -> Set F-滚动 -> Set v + Set w(滚动角速度)
│  └─ 否 -> Set F-地面 -> Set J-地面 -> Set w -> Set v
└─ 否 -> Set F-空中 -> Set J-空中 -> Set w -> Set v

三条路径 -> 顺序执行
顺序执行.OutFlow[0] -> Set 额外压力=0
顺序执行.OutFlow[3] -> 更新v、w.OutFlow[0] 是
```

数据映射：

```text
计算分力(w, v, 额外压力)
更新速度(更新间隔)
更新角速度(更新间隔)
更新v、w.F_aero     <- 计算分力.OutParam[6]
更新v、w.F摩擦力   <- 计算分力.OutParam[7]
```

证据命令：

```bash
npx tsx tests/composite/trace-exec-flow.ts 复杂gia/物理运动.gia --expand='更新v、w' --io
npx tsx tests/composite/trace-dataflow.ts 复杂gia/物理运动.gia --list-nodes --composite='更新v、w'
npx tsx tests/composite/trace-dataflow.ts 复杂gia/物理运动.gia 61 --all-params --max-depth 20
npx tsx tools/decode-gia.ts 复杂gia/物理运动.gia
```

---

## 四、复刻代码

新增：

```text
tests/layout/physics-motion/composites/update-vw.ts
tests/layout/physics-motion/composites/update-vw-stubs.ts
```

修改：

```text
tests/layout/physics-motion/main.ts
tests/layout/physics-motion/helpers/variables.ts
```

### 4.1 外层拓扑

`update-vw.ts` 保留真实接口、pinIndex、19 节点数量、控制流、数据流和图变量名。当前生成结构：

```text
nodeCount=19
compositeCalls=5
setNodes=9
getNodes=3
doubleBranches=2
```

### 4.2 子复合代理语义

用户已确认当前先使用代理结果：

- `计算滚动角速度` 返回当前 `w`。
- `更新角速度` 返回当前 `w`。
- `更新速度` 返回当前 `v`。
- `计算分力` 转发 `w/v` 作为 vec3 输出，`滚动=false`。
- `顺序执行` 保留 1 InFlow / 4 个同名 OutFlow。

这些仅用于保持外层类型和连线，不代表真实物理算法；后续必须逐层替换。

### 4.3 当前主图接入

用户选择阶段性方案 B：在当前 `When Entity Is Created` 中增加第三条分支：

```text
更新v、w(接触地面=false, 更新间隔=0.02)
```

真实上游应来自 `计算物理运动状态.OutParam[2]` 与 `Update.OutParam[2]`，但本轮不复刻这两个上游。

---

## 五、编译器/API 修复

### 5.1 detached composite marker 类型

修改：

```text
src/runtime/meta_call_types.ts
src/runtime/core.ts
src/definitions/nodes.ts
```

新增：

```text
FlowMarkerRef
CompositeCallResult
```

`callComposite()` / `declareDetached()` 现在显式返回包含 `__markerNodeId` 的类型；`f.outflow()` 可接受普通 `MetaCallRecordRef` 或复合 marker。

因此可以用当前 DSL 表达：

```ts
const nested = f.declareDetached(sequentialExecution, {})
f.link(nested, 0, clearExtraPressure)
f.outflow('是', nested, 3)
```

### 5.2 Stage 3 nested OutFlow pin

修改：

```text
src/compiler/ir_to_gia_transform/composite.ts
```

旧行为：impl 中的 `__composite_call__` 只生成数据输入 pin；没有输入的 `顺序执行` 即使存在内部执行边也会编码为 `pins=[]`。

新行为：若嵌套复合调用有内部下游执行边，则按逻辑 source index 创建物理 OutFlow pin，并使用被调复合对应 OutFlow 的 `pinIndex` 作为 `compositePinIndex`。

当前生成：

```text
顺序执行.OutFlow[0]
compositePinIndex=514
connects -> Set 额外压力=0
```

外层 `f.outflow('是', nested, 3)` 仍通过 compositePins 直通映射，不强制生成无下游的物理 OutFlow[3]，与真实文件一致。

### 5.3 typed Get Node Graph Variable 回退

当 impl 没有显式 `implVariables` 时，Stage 3 会从已知下游连接/外层输出类型推导 `Get Node Graph Variable` concreteId：

```text
w / v       -> concreteId 348 (vec3)
额外压力    -> concreteId 341 (float)
```

---

## 六、回归与验证

新增：

```text
tests/composite/test-nested-composite-outflow.ts
```

验证两层：

1. IR：外层 OutFlow compositePin 指向 nested call 的逻辑 `OutFlow[3]`。
2. 解码 GIA：nested call 的 `OutFlow[0]` 有正确 `compositePinIndex` 和一个内部下游。

结果：

```text
PASS nested composite outflow marker
```

相邻回归：

```bash
npx tsx tests/composite/test-phase2-normal-nodes.ts
```

结果：

```text
12 passed / 0 failed
```

构建：

```bash
npm run build
```

结果：通过。

---

## 七、注入与游戏内反馈

显式注入：

```bash
GSTS_LOCALLOW_DIR=/mnt/c/Users/touyu/AppData/LocalLow \
node bin/gsts.mjs -c gsts.physics-motion.config.ts dist/tests/layout/physics-motion/main.gia
```

结果：

```text
[ok] injected main.gia -> /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741845.gil
```

用户反馈：

1. `更新v、w` 主体核验通过，允许提交。
2. 整体布局在垂直方向过于松散。
3. 下一轮调整布局系数时，需要用户配合在游戏中回归此前通过的复合节点布局，不能只看当前复合。

本轮不修改布局系数，避免在未做跨场景游戏回归时影响已通过场景。

---

## 八、知识体系与技能问题

本轮最初错误地把问题描述为“顺序执行 API 不支持”。用户指出这与已有认知冲突后重新核对，确认：

- 顺序执行、多 OutFlow、`declareDetached`、`link`、`outflow` 已经支持。
- 真正缺口只是 marker 返回类型、嵌套 OutFlow 提升的类型边界，以及 Stage 3 nested physical OutFlow pin。
- 当前权威 `docs/architecture/composite/dsl-api.md` 内部存在冲突：前文写嵌套复合可编码，后文仍保留“build 中不支持嵌套调用”的旧结论。
- `composite-docs-navigator` 没有要求顺序执行任务必读 `control-flow-api-cookbook.md`，也没有要求在宣称 API gap 前核对源码签名和针对性回归。

本轮已修：

1. 更新 `dsl-api.md` 的嵌套复合章节，加入 nested OutFlow 最新写法。
2. 更新 `composite-docs-navigator`：顺序执行必须补读 cookbook；宣称 gap 前必须核对当前文档、源码和回归三层。
3. 新增 `test-nested-composite-outflow.ts`，让知识结论有可执行证据。

后续规则：文档内部冲突时，不默认采用更保守/更旧的说法；必须明确指出冲突，以当前源码和可执行回归裁决，并立即修正权威文档。

---

## 九、下一轮顺序

1. 先处理 `capture: true` 的 nested composite 输入物理 pin 差异：真实 `更新速度` / `更新角速度` 调用节点为 `pins=[]`，当前生成各有 1 个 InParam。
2. 再单独调整 impl 布局垂直间距系数，每次只改一个系数。
3. 每个布局 step 生成并显式注入，等待用户游戏内反馈。
4. 除当前 `更新v、w` 外，必须回归此前已通过的 `设置物理参数` 和其它布局场景；未经用户确认不提交布局参数。
5. 布局稳定后，再由用户选择先复刻 `计算分力`、`更新速度`、`更新角速度` 或 `计算滚动角速度` 的内部算法。

---

## 十、给下一位助手的一句话

> Round 6 已完成并经用户游戏内主体核验：`更新v、w` 的接口、19 节点外层拓扑、嵌套顺序执行内部边和外层 OutFlow 直通均已生成；5 个子复合仍是用户确认的代理语义。下一轮先修 nested capture 输入多余物理 pin，再小步调垂直布局系数并回归所有已通过复合。不要再把顺序执行误判为 API 不支持；先读当前 raw DSL、dsl-api、control-flow cookbook，并核对源码与 `test-nested-composite-outflow.ts`。
