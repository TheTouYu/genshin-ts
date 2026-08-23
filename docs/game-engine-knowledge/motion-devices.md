# 运动器（Motion Device）运行时行为

> 状态：核心结论已闭合（2026-08-13 魔方 P4 全流程：真实日志逐帧 + 用户游戏验证）
> 来源：真实 Beyond_Debug_Log 矩阵分析 + 官方节点定义（第三方包 data.json）+ 用户游戏核验
> 最近校验：2026-08-23（足球定点运动器叠加语义，见第 10 节）
> 适用范围：基础运动器（匀速旋转/匀速直线/定点运动）的运行时语义；组件配置见 components.md

## 1. 组件前置依赖

- 实体必须预配置 **basicMotion 组件（type 4，9B 默认快照 `080410017203c81f01`）**，运行时节点 `addUniformBasicRotationBasedMotionDevice` / `addUniformBasicLinearMotionDevice` 才会生效。
- 运行时节点只动态添加具体运动器，**不会替实体补齐基础运动器能力**。
- 组件编码与历史误判记录见 [components.md](components.md)。

## 2. 节点 API 与返回字段

| 方法 | 参数 | 说明 |
|---|---|---|
| addUniformBasicRotationBasedMotionDevice | target_entity, mover_name, duration, angular_velocity(°/s), axis | 匀速旋转 |
| addUniformBasicLinearMotionDevice | target_entity, mover_name, duration, velocity | 匀速直线 |
| addBasicTargetOrientedRotationBasedMotionDevice | target_entity, mover_name, velocity(Flt), axis_or_angle(Vec) | 目标朝向旋转（id 520；参数语义待验证，见下） |

**旋转运动器有两种（2026-08-20 核验）**：
1. **Uniform（id 85）**：第 4 参 = **angular_velocity(°/s)**，总角 = duration × 角速度。
   ⚠️ **2026-08-20 实证**：魔方 spin 曾传 90（0.3s）→ 只转 27°≈30°（旧版 1s×90°/s=90° 巧合正确）；
   0.3s 内转满 90° 需 300°/s。**第 4 参不是总角，是角速度**。
2. **Target-Oriented（id 520）**：inputs [Ety, Str, Flt, Vec]；patterns.md 实证读法
   `(Ety, Str="p2_u_cw", Flt=2 速度, Vec=(0,90,0) 旋转轴/角度)`（证据：`_GSTS_param-turn` 图）。
   Flt/Vec 的精确语义（速度单位 / Vec 是欧拉角还是轴+角）**待验证**（Fail closed，不猜）。

**`getEntityLocationAndRotation` 返回字段为 `{ location, rotate }`（2026-08-13 实证：字段名是 `rotate` 不是 `rotation`）**——写 DSL 时 `.rotate` 取朝向欧拉。

## 3. 轴语义（核心闭合：相对朝向 = 实体局部轴）

> 证据：官方定义 `axis` 参数 Description = "Relative Orientation（相对朝向）"；
> 2026-08-13 日志矩阵分析：组合旋转后 rotation 值 = 局部轴右乘（M_new = M·R_local），与"世界轴左乘"理论不一致

### 3.1 引擎行为

`axis` 是**实体局部坐标系中的方向**：引擎把轴变换到世界（`R·axis`）后绕其旋转，
等价于 **M_new = M·R_local(axis)**（绕实体局部轴右乘）。

### 3.2 绕世界轴旋转的正确传参

要绕**世界层轴**旋转（魔方等场景），必须把世界轴转换到块局部系：

```text
localAxis = R_current^T · worldAxis
```

其中 R_current 为实体当前朝向矩阵（YXZ 内旋：R = Ry(β)·Rx(α)·Rz(γ)，
欧拉角取 `rotate` 输出的 (x,y,z)）。展开为三次罗德里格斯逆旋转：

```text
localAxis = Rz(−rz)·Rx(−rx)·Ry(−ry)·worldAxis
```

罗德里格斯公式（绕单位轴 u 转 θ）：

```text
v′ = u·(u·v) + (v − u·(u·v))·cosθ + (u×v)·sinθ
```

> ⚠️ 90° 倍数角度下 cos/sin ∈ {0, ±1}，可特化为 v′ = ±(u×v) 等；但 rotation 输出含微小残差
> （如 270.0862°），正式实现用 cos/sin 节点（弧度输入，角度需乘 π/180）。

### 3.3 欧拉角约定（复用已闭合结论）

编辑器旋转 = **YXZ 内旋**，矩阵 `R = Ry(β)·Rx(α)·Rz(γ)`，面板显示值 = wire 值（直写），
详见 gil-structure-semantics.md（2026-08-08 用户分步样本 + wire 交叉闭合）。
组合旋转后 rotation 输出按同一约定反推，与"局部轴右乘"自洽（2026-08-13 复验）。

> ⚠️ 2026-08-21 魔方朝向表事故：`GetEntityLocationAndRotation.rotate` 的返回值顺序是 **(x,y,z)**，
> 不是 (y,x,z)。任何“欧拉角 → 矩阵 / 朝向索引 / 局部轴表”的生成器必须按
> `R = Ry(y)·Rx(x)·Rz(z)` 实现，否则组合旋转后朝向索引错位、块在正确位置但贴纸/黑面错误。
> 参考实现：`examples/rubik-3x3/tools/gen-orient-tables.mjs`。

## 4. 轨道/公转公式（平行分量必须保持）

5 段折线逼近 90° 圆弧：每段 18°、0.2s。段速度必须基于**垂直分量**：

```text
v_parallel = axis · dot(axis, v0)
v_perp = v0 − v_parallel
p_k = v_parallel + v_perp·cos(k·18°) + cross(axis, v_perp)·sin(k·18°)
vel_k = (p_k − p_{k−1}) / 0.2
```

> ⚠️ **两次踩坑**：`p_k = v0·Ck + axv·Sk`（直接缩放 v0）会压缩平行分量——绕 X 轴旋转时
> X 分量被 cos(kθ) 逐段压小，第 5 段后归零 → 每轮漂移 0.5，多轮累积（2026-08-13 两次独立实证）。

## 5. 层成员动态（魔方旋转）

魔方转动后**层的成员会变化**（块移动到其他层）：

- 绕 X 转：x 坐标不变 → **X 层成员恒定**（单面连续旋转静态映射恰好有效）；
- Y/Z 层成员随转动变化 → **组合旋转时静态层映射失效**（错误转动不属于该层的块 → 错位）。
- 正确做法：**每轮按当前坐标实时筛选层成员**（如 y>3 判 U 层），或用循环遍历 8 块逐一判断。

## 6. 定时器与段衔接

- **预计算全部段速度**（基于转动起始位置），定时器回调直接取用，**不再读取运行时位置**——
  消除逐段误差累积（v4 缺陷：逐段读实时位置，orbit2 读到 orbit1 结束位置含误差 → 逐段放大）。
- 运动器按 `mover_name` 标识；duration 到点自动结束（tick 不稳导致的段间衔接误差待量化，⚪）。

## 7. DSL 实现笔记（2026-08-13/14 实证）

| 主题 | 结论 |
|---|---|
| getCorrespondingValueFromList 下标 | **0-based**（1..4 会越界返回空实体，日志实证） |
| 循环变量类型 | `for (let i = 0; ...)` 的 i 为 **float**；字典 key 等 int 参数须用 `let i = 0n`（bigint） |
| 循环内 setTimeout | 支持（循环体只物化 1 次：节点数 2400→240）；回调可 capture 循环变量（int） |
| 函数内联 | helper 函数被每个调用点内联展开；6 分支 × 4 块 × 5 段 = 节点爆炸（2400）——合并分支/循环化可降到 240 |
| capture 字典机制 | 每个 setTimeout 回调的捕获变量 = set_or_add + get_corresponding 链（~6 节点/回调）；**DSL 方法返回的 vec3 捕获报 any 失败**（capture 只支持可推断类型）→ 用图变量/字典中转 |
| dict 图变量 | `dict([{k: 0, v: vec3([0,0,0])}])` 声明（int→vec3 等）；查询用 asDict 显式类型 |
| 图变量共享槽 | 定时器回调读共享槽（cur0..3）会被后续轮覆写 → 每块独立槽或按块索引查字典 |
| 数组字面量 | `[c0, c1, ...]` 作为 setNodeGraphVariable 值（entity_list）支持；setOrAdd 的 value 传数组也支持 |

## 7.5 负载（Load）与定时器稳定性（2026-08-14 用户定义 + 游戏核验）

- **负载定义（用户）**：单位时间内能执行的运算量。长时间操作时偶尔会瞬间达到服务器运算上限
  → 卡顿、定时器 tick 延迟、运动变慢。
- **绝对时刻解锁的脆弱性**：解锁定时器依赖绝对时刻（如 1000ms）时，负载高峰使 orbit5 触发/结束延迟；
  高峰恢复后立即放行新操作 → 新运动器替换/中断未完成的旧运动器 → 缺末段位移 → 永久偏差。
- **相对时序解锁（推荐模式）**：把解锁绑定到"运动器实际触发时刻"（orbit5 回调内嵌套 +250ms），
  即使卡顿一秒，恢复后仍按实际时序完成才放行 → **负载高峰下行为稳定**（用户游戏核验通过）。
- **通用原则**：涉及"完成后才能继续"的时序，用相对触发（嵌套定时器/事件）而非绝对时刻；
  绝对时刻在负载高峰下不可靠。
## 8. 验证记录（2026-08-13/14）

| 版本 | 修复 | 证据 |
|---|---|---|
| v4 | 基线（逐段读位置 + 公式无平行分量保持） | 日志 23-32-10：8 轮漂移 +0.256 |
| v5 | 预计算 5 段速度 | 日志 00-14-20：layers 空 → 全部空实体 |
| v5.1/5.2 | 数据驱动 + layers 填充 | 日志 00-14-20/00-20-15：0-based 下标 + 平行分量 → 单面连续精确 |
| v5.3 | 平行分量保持 + 0-based | 日志 00-20-15：位置精确，单面连续核验通过 |
| v5.4 | 循环 + 按坐标筛选层成员 | 日志 00-26-27：组合旋转错位根因（静态层失效） |
| v5.5 | 自旋轴局部系转换（罗德里格斯×3） | 日志 00-37-42：矩阵实证；组合旋转核验通过（位置+朝向） |

## 9. 待验证

- ⚪ 定时器 tick 不稳对 0.2s 段衔接/总位移的影响量化（P4-2 后续）
- ⚪ type 4 组件 f14 配置变体（mount_records 样本多 2 字节）语义（P4-5）

## 10. 定点运动器与旋转运动器的叠加（2026-08-23 足球实证）

> 证据：日志 2828（ballPos 正常推进但 Get Entity Location 连续多 tick 停在 (0,0.25,0)）、
> 2829；修复提交 6fdcfa3；真实地图 1073741908.gil 注入后回读。
> 状态：修复已生效（匀速直线替换）；冲突的精确机制（类型叠加 vs lockRotation 旋转通道）待最小差分。

- **不要在同一 exec 链里同时用 activate_fixed_point_motion_device 做匀速直线、又叠加旋转设备**：
  两个节点帧都会出现，但直线设备会被秒停，实体位置纹丝不动，只剩旋转设备一帧帧重启带来的微量自旋。
- **要兼顾“移动到指定点”与“同时自旋”时，用可叠加组合**：
  add_uniform_basic_linear_motion_device + add_uniform_basic_rotation_based_motion_device；
  直线设备的 velocity 显式算成 (target - current)/duration，可同时拿到“精确到点”和“不漂移”两个优点。
- 旧提交 bd9da07 只把定点器 move_speed 从 0 改成 dist/duration，日志证明 speed 正确仍然不动——
  **怀疑“参数默认值”之前，先核对日志里设备帧与实体位置变化**。
- 定点器仍可用于 INSTANT_MOVEMENT 瞬移（如复位），不要因本结论把定点器全盘禁用。
- **lockRotation 语义（日志 2832 闭合）**：`activate_fixed_point_motion_device` 的 `lockRotation=true` 是“保留当前朝向”，
  `false` 才会把 `targetRotation` 应用到实体。要“复位同时把朝向清零/设为目标朝向”，必须传 `false`；
  传 `true` 会让上一段旋转残留在实体上，后续 `addUniformBasicRotationBasedMotionDevice` 的 local axis 不再等于 world axis，
  表现为“第一段旋转对、第二段错”。
