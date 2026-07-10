# 布局任务交接文档 · 物理运动复刻 Round 9

> 状态：历史记录 / 部分完成 / 游戏内未通过
> 来源：真实 `物理运动.gia` 分析 + 当前代码实现 + 自动解码 + 用户游戏内反馈
> 最近校验：2026-07-10
> 适用范围：`复杂gia/物理运动.gia` 的 `计算分力` 复刻，以及 composite impl 中 typed `Get Local Variable(vec3)` 的待修问题

> **本轮结果**：`计算分力` 及其主要子复合已按真实 GIA 层级写入物理运动复刻工程，外层输出来源和大部分内部数据链已自动对照。游戏内核对发现三处 `Get Local Variable(vec3)` 类型/端口编码错误并导致连线断开。本轮补了 typed concreteId 推断和回归测试，自动解码变为 `concreteId=2660`，但用户复测仍失败；进一步确认物理 OutParam index 和 `bConcreteValue.indexOfConcrete` 仍与真实 GIA 不一致。下一轮由用户提供最小化真实 getter GIA，先修通用编译器编码，再继续其余三个真实子复合。

通用路径、显式单文件注入、小步验证和归档约定见 [layout-working-rules.md](layout-working-rules.md)。测试工程写法、复合 API、节点 API 查询方法和本轮算法层级见 [../physics-motion-recreate-guide.md](../physics-motion-recreate-guide.md)，本 handover 不重复教程内容。

---

## 一、本轮目标与范围

用户从 Round 8 的四个候选中选择先复刻 `计算分力`。本轮边界为：

1. 先分析真实 `复杂gia/物理运动.gia`，不凭名称猜公式。
2. 保留此前已验证的 `更新v、w` 外层控制流和布局。
3. 把 `计算分力` 的代理语义替换为真实复合层级。
4. `更新速度`、`更新角速度`、`计算滚动角速度` 暂时不展开。
5. 游戏内问题以用户反馈为最终结论；自动 decode 只能作为中间证据。

---

## 二、真实 `计算分力` 结构

真实接口：

```text
Inputs:
  w          vec3  pinIndex=502
  v          vec3  pinIndex=522
  额外受力   float pinIndex=541

Outputs:
  F-滚动     vec3  pinIndex=500
  滚动       bool  pinIndex=501
  F-地面     vec3  pinIndex=472
  F-空中     vec3  pinIndex=532
  J-地面     vec3  pinIndex=471
  J-空中     vec3  pinIndex=1103
  F_aero     vec3  pinIndex=1796
  F摩擦力    vec3  pinIndex=1797
```

真实 impl 共 9 个节点：

```text
复合:aerodynamic_forces
Split 3D Vector
Addition
复合:力矩
复合:计算合力
复合:friction_force
复合:计算滚动摩擦力
3D Vector Addition
Get Local Variable
```

已确认的输出映射：

```text
F-滚动  <- 计算滚动摩擦力.结果 + 计算合力.F-地面
滚动    <- friction_force.滚动
F-地面  <- 计算合力.F-地面
F-空中  <- 计算合力.F-空中
J-地面  <- 力矩.J-地面
J-空中  <- 力矩.J-空中
F_aero  <- aerodynamic_forces.F_aero
F摩擦力 <- Get Local Variable(friction_force.结果).Value
```

真实分析使用过：

```bash
npx tsx tests/composite/trace-dataflow.ts 复杂gia/物理运动.gia \
  --list-nodes --composite=计算分力
npx tsx tests/composite/trace-dataflow.ts 复杂gia/物理运动.gia \
  <nodeIndex> <inParamIndex> --composite 计算分力 --max-depth 8
npx tsx tools/decode-gia.ts 复杂gia/物理运动.gia > /tmp/physics-decoded.json
```

---

## 三、落地代码

新增：

```text
tests/layout/physics-motion/composites/calculate-forces.ts
tests/layout/physics-motion/composites/force-aerodynamics.ts
tests/layout/physics-motion/composites/force-friction.ts
tests/layout/physics-motion/composites/force-torque.ts
tests/composite/test-local-variable-impl-concrete-type.ts
```

修改：

```text
tests/layout/physics-motion/composites/math.ts
tests/layout/physics-motion/composites/update-vw.ts
tests/layout/physics-motion/composites/update-vw-stubs.ts
tests/layout/physics-motion/helpers/variables.ts
src/compiler/ir_to_gia_transform/composite.ts
```

本轮加入的真实复合层级：

```text
计算分力
├─ aerodynamic_forces
├─ slip_velocity
├─ friction_force
├─ 摩擦力矩
├─ w衰减力矩
├─ 力矩
├─ 向量× / 向量乘法 / 向量内积乘法
├─ 计算合力
└─ 计算滚动摩擦力
```

`update-vw-stubs.ts` 已移除 `计算分力` 代理，只保留另外三个阶段性算法和 `顺序执行`。

---

## 四、游戏反馈与失败链路

### 4.1 第一次游戏内核对

用户核对层级 1 后反馈：

> 输出参数 8 `F摩擦力` 使用了 `Get Local Variable`，但该节点的输入和输出类型不是三维向量，相关连线断开。

用户继续核对剩余层级后确认：其余发现的问题也是同一个 getter 编码问题造成的。

### 4.2 第一轮根因判断

Stage 2 IR 中该节点已经记录：

```text
get_local_variable.InParam[0] = vec3
consumer conn node.<valuePin> = vec3
计算分力.F摩擦力 = vec3
```

但旧 composite Stage 3 固定从 `OutParam[0]` 推断 produced type。`Get Local Variable` 的 `OutParam[0]` 是 Local Variable 句柄，值输出是 `OutParam[1]`，因此 typed concreteId 回退到 generic/bool ID `18`。

本轮在 `buildImplGraphNodes(...)` 中令 `get_local_variable` 从 pin 1 推断 produced type，并新增最小 IR 回归。自动生成后，三处 getter 都变为：

```text
genericId=18
concreteId=2660  # Get_Local_Variable__Vec
pin type=12      # vec3
```

### 4.3 第二次游戏内复测

修正版显式单文件注入成功，但用户反馈仍不通过。

因此当前结论是：typed concreteId 推断确实修正了一个问题，但不是完整根因。自动测试覆盖不足，不能写成“已修复”。

---

## 五、进一步确认的编码差异

真实 GIA 中 vec3 `Get Local Variable` 的关键物理形态：

```text
genericId.nodeId=18
concreteId.nodeId=2660
InParam[0].type=12
InParam[0].bConcreteValue.indexOfConcrete=6
OutParam[1].type=12
OutParam[1].bConcreteValue.indexOfConcrete=6
```

当前生成结果仍存在：

1. concrete value 包装层和 `indexOfConcrete` 与真实文件不一致。
2. `slip_velocity`、`计算分力` 当前能看到 `OutParam[1]`，但包装仍未完全对齐真实文件。
3. `friction_force` 的 getter 消费者引用 `OutParam[1]`，物理节点却只生成 `OutParam[0]`，这是明确的端口不一致。
4. `test-local-variable-impl-concrete-type.ts` 只断言 node ID 和 pin type，没有断言 concrete value 包装、所有消费者端口与真实文件的一致性。

这解释了为什么自动回归通过、decode 表面类型正确，而游戏编辑器仍断线。

不要在下一轮直接继续扩大 `producedValuePinIndex` 特判；先用用户提供的最小真实 GIA 确认所有字段，再设计通用规则。

---

## 六、验证与注入记录

通过：

```bash
npm run build
npx tsx tests/composite/test-local-variable-impl-concrete-type.ts
npx tsx tests/composite/test-nested-composite-capture-pins.ts
npx tsx tests/composite/test-custom-variable-impl-pins.ts
npx tsx tests/composite/test-exec-lane-spacing-scale.ts
git diff --check
```

生成：

```bash
node bin/gsts.mjs -c gsts.physics-motion.config.ts --noinject
```

显式单文件注入：

```bash
GSTS_LOCALLOW_DIR=/mnt/c/Users/touyu/AppData/LocalLow \
node bin/gsts.mjs -c gsts.physics-motion.config.ts \
  dist/tests/layout/physics-motion/main.gia
```

注入目标：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741845.gil
```

不要只运行带配置、不带 `.gia` 参数的批量注入；批量模式会忽略 `config.inject.nodeGraphId`，按生成 GIA 的 graph id `1073741904` 查找并失败。

---

## 七、下一轮明确目标

### 目标 1：先修 vec3 `Get Local Variable`

用户将在新回合提供一个最小化、由游戏编辑器导出的、包含 `Get Local Variable` 的 GIA 参考。

拿到文件后：

1. 先确认它确实是 vec3 getter，以及哪些端口有连接。
2. 解码真实最小 GIA 和当前最小生成 GIA。
3. 逐字段比较：
   - genericId / concreteId；
   - InParam/OutParam 的 kind 和 index；
   - pin type；
   - `bConcreteValue.indexOfConcrete`；
   - 内层 value 的 class/type；
   - connects 两端 index；
   - 是否需要 Local Variable 句柄 OutParam。
4. 扩充回归测试，必须覆盖真实物理字段，而不只检查 node ID/type。
5. 修通用 `composite.ts` pin 编码后重新生成、显式单文件注入、等待游戏反馈。

### 目标 2：完成其余真实子复合

getter 问题解决后，基于本轮已经建立的分析和多文件工程继续实现：

1. `更新速度`
2. `更新角速度`
3. `计算滚动角速度`

顺序由用户在新回合确认。继续遵守“一次一个可核验层级”，不要同时展开三者。

---

## 八、给下一位助手的一句话

> Physics Round 9 已把 `计算分力` 的真实复合层级写进代码，但游戏内仍被 vec3 `Get Local Variable` 的物理 pin 编码阻塞；`concreteId=2660/type=12` 自动对齐还不够，当前至少存在 `OutParam[1]` 与实际生成 `OutParam[0]` 不一致及 concrete value index/wrapper 差异。下一轮先等用户提供最小真实 getter GIA，逐字段修通用 composite 编码，再继续 `更新速度`、`更新角速度`、`计算滚动角速度`。
