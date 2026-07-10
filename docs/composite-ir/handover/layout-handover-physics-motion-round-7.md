# 布局任务交接文档 · 物理运动复刻 Round 7

> 状态：历史记录 / nested capture 修复已游戏内验证 / 布局待调
> 来源：当前代码实现 + 真实 GIA 对照 + 自动结构验证 + 用户游戏内反馈
> 最近校验：2026-07-10
> 适用范围：`复杂gia/物理运动.gia` 的 `更新v、w` nested composite capture 输入、Stage 3 物理 pin 编码和下一轮布局回归

> **本轮结果**：修复 impl 中 nested `__composite_call__` 的 `capture: true` 输入被错误编码为物理 InParam 的问题。修复后，`更新速度`、`更新角速度` 两个调用节点均为 `pins=[]`，外层 `更新间隔` 仍通过两条 impl `compositePins` 路由到各自逻辑 `InParam[0]`。构建、针对性回归和相邻复合回归通过；已显式注入真实存档，用户确认游戏内测试通过。本轮没有修改任何布局系数。

通用路径、注入命令、小步验证和用户交互约定见 [layout-working-rules.md](layout-working-rules.md)。遇到布局取舍、游戏状态、注入目标或资源副作用时必须先向用户确认，不继续猜测。

---

## 一、本轮目标

Round 6 留下的首要差异是：

```text
真实 更新v、w：
  更新速度       pins=[]
  更新角速度     pins=[]

Round 6 gsts 输出：
  更新速度       额外生成 InParam[0]
  更新角速度     额外生成 InParam[0]
```

两个 nested call 的输入都来自外层复合参数 `更新间隔`。Stage 2 已将参数标记为 `capture: true`，并建立正确的 `compositePins`；差异仅发生在 Stage 3 物理 pin 编码。

本轮只修该编码差异并回归，不调整布局，也不进入 5 个代理子复合的真实算法。

---

## 二、根因与修复

修改：

```text
src/compiler/ir_to_gia_transform/composite.ts
```

位置：`buildImplNodePins()` 的 `__composite_call__` 分支。

普通 impl 节点路径已经遵循以下规则：

- `capture: true` 输入由 impl Graph 的 `compositePins` 路由。
- capture 参数不生成节点自身的物理 InParam。
- 跳过物理 pin 时仍保留原始逻辑参数索引，不能压缩后续 pin。

nested `__composite_call__` 分支此前遗漏了 capture 判断，对所有 `args[1..]` 都生成物理 InParam。当前修复在构造 literal/conn pin 之前跳过 `capture: true` 参数；非 capture literal/conn 输入行为不变。

关键边界：

```text
args[0]    子复合 ID
args[1..]  子复合输入
```

循环仍以参数数组位置计算 `inputIdx = ai - 1`，因此混合输入中 capture 槽位不会导致后续物理 pin 索引前移。

---

## 三、针对性回归

新增：

```text
tests/composite/test-nested-composite-capture-pins.ts
```

覆盖两类 nested call：

1. 只有一个 capture 输入：调用节点必须为 `pins=[]`。
2. `capture + literal` 混合输入：
   - capture `InParam[0]` 不生成物理 pin；
   - 后续 literal 仍位于物理 `InParam[1]`；
   - literal 保留被调复合对应的 `compositePinIndex`。

两类调用都同时验证外层 capture 输入仍通过 impl `compositePins` 映射到 nested call 的逻辑 `InParam[0]`。

结果：

```text
PASS nested composite capture input pins
```

---

## 四、真实样本与生成结果对照

真实样本：

```text
复杂gia/物理运动.gia
```

对照命令：

```bash
npx tsx tests/composite/analyze-nested-composites.ts 复杂gia/物理运动.gia
```

真实 `更新v、w` 中，`更新速度`、`更新角速度` nested call 均为 `pins=0`。

修复后生成：

```bash
node bin/gsts.mjs -c gsts.physics-motion.config.ts
npx tsx tests/composite/analyze-nested-composites.ts \
  dist/tests/layout/physics-motion/main.gia
```

观察：

```text
更新速度       pins=0
  compositePins: 外层 InParam[1] -> nested InParam[0]

更新角速度     pins=0
  compositePins: 外层 InParam[1] -> nested InParam[0]
```

`更新v、w` 仍保持：

```text
nodeCount=19
compositeCalls=5
setNodes=9
getNodes=3
doubleBranches=2
compositePins=7
```

因此本轮只消除了多余物理 pin，没有删除 capture 数据路由或改变外层拓扑。

---

## 五、自动验证

执行并通过：

```bash
npm run build
npx tsx tests/composite/test-nested-composite-capture-pins.ts
npx tsx tests/composite/test-custom-variable-impl-pins.ts
npx tsx tests/composite/test-nested-composite-outflow.ts
npx tsx tests/composite/test-composite-all.ts
npx tsx tests/composite/test-phase2-normal-nodes.ts
git diff --check
```

结果摘要：

```text
PASS nested composite capture input pins
PASS custom-variable impl pin indices and concrete output types
PASS nested composite outflow marker
Composite suite: 78 passed / 0 failed / 2 pending reference
Phase 2: 12 passed / 0 failed
Build: passed
```

独立代码 review 未发现阻塞或正确性问题；额外建议的 mixed capture/non-capture 索引覆盖已加入针对性回归。

---

## 六、注入与用户反馈

首次只带配置生成时，CLI 因同时发现两个 WSL `LocalLow` 目录而拒绝自动选择注入目标。按用户明确确认，随后使用真实目录显式注入：

```bash
GSTS_LOCALLOW_DIR=/mnt/c/Users/touyu/AppData/LocalLow \
node bin/gsts.mjs -c gsts.physics-motion.config.ts \
  dist/tests/layout/physics-motion/main.gia
```

结果：

```text
[ok] injected main.gia -> /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741845.gil
```

用户于 2026-07-10 确认：

```text
测试通过
```

验证范围是修复后的整图可正常加载和核验；本轮没有修改运动算法或布局参数。

---

## 七、文档同步

更新：

```text
docs/architecture/composite/gia-encoding.md
docs/composite-ir/physics-motion-recreate-guide.md
docs/composite-ir/handover/README.md
```

当前权威结论：

- impl 中 nested `__composite_call__` 的 capture 输入不生成物理 InParam。
- capture 逻辑 input index 和 impl `compositePins` 映射必须保留。
- 非 capture literal/conn 输入继续生成物理 pin。
- `更新v、w` 的该差异已经自动验证和游戏内验证。

Round 6 文档继续保留当时“待修”的历史状态，不回写历史过程。

---

## 八、下一轮顺序

1. 先重新读取当前布局实现与已通过场景，不直接套用历史 handover 的旧参数。
2. 针对 `更新v、w` 垂直方向过松的问题，只选择一个 impl 垂直间距系数提出最小调整。
3. 在修改系数前向用户确认布局取舍和本轮验证范围。
4. 每个 step 重新生成并显式注入，等待用户游戏内反馈。
5. 除 `更新v、w` 外，至少回归此前通过的 `设置物理参数` 和相关布局场景；未全部确认前不提交布局参数。
6. 布局稳定后，再由用户选择先复刻 `计算分力`、`更新速度`、`更新角速度` 或 `计算滚动角速度` 的真实内部算法。

仍需牢记：5 个子复合当前只是用户确认过的代理语义，不代表真实物理算法。

---

## 九、给下一位助手的一句话

> Round 7 已修复并经游戏内验证 nested capture 多余物理 pin：`更新速度`、`更新角速度` 调用现在都是 `pins=[]`，但外层 `更新间隔` 的两条 `compositePins` 路由仍完整；19 节点外层拓扑和布局参数均未改变。下一轮先向用户确认后，小步收紧 impl 垂直间距，并回归 `更新v、w`、`设置物理参数` 及此前通过的布局场景；不要直接进入子复合算法，也不要未经游戏回归提交布局参数。
