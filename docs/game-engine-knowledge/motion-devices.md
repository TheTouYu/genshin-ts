# 运动器（Motion Device）运行时行为

> 状态：核心结论已闭合（2026-08-13 魔方 P4 全流程：真实日志逐帧 + 用户游戏验证）
> 来源：真实 Beyond_Debug_Log 矩阵分析 + 官方节点定义（第三方包 data.json）+ 用户游戏核验
> 最近校验：2026-08-14
> 适用范围：基础运动器（匀速旋转/匀速直线）的运行时语义；组件配置见 components.md

## 1. 组件前置依赖

- 实体必须预配置 **basicMotion 组件（type 4，9B 默认快照 `080410017203c81f01`）**，运行时节点 `addUniformBasicRotationBasedMotionDevice` / `addUniformBasicLinearMotionDevice` 才会生效。
- 运行时节点只动态添加具体运动器，**不会替实体补齐基础运动器能力**。
- 组件编码与历史误判记录见 [components.md](components.md)。

## 2. 节点 API 与返回字段

| 方法 | 参数 | 说明 |
|---|---|---|
| addUniformBasicRotationBasedMotionDevice | target_entity, mover_name, duration, angular_velocity(°/s), axis | 匀速旋转 |
| addUniformBasicLinearMotionDevice | target_entity, mover_name, duration, velocity | 匀速直线 |

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
