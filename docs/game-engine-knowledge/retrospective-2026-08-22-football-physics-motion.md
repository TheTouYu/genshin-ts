# 完整复盘：足球真实物理 + 运动器参数 + 预制体底座（2026-08-22）

> 范围：足球 demo（map 1073741908）从"固定距离停止"的粗糙 demo 升级为真实物理（重力+空气阻力+马格努斯+滚动摩擦+反弹+停止）的一波任务。
> 视角：运动器 API 语义、旋转轴语义、预制体版本差异、草地覆盖。
> 证据：提交 d97b285（物理+视觉+运动器+草地+去底座）、c20f689（dsl-nodegraph-development 技能补 2 条错误行）；真实地图 1073741908.gil；用户 7 点反馈原话。
> 状态：代码/编译/注入已完成，游戏内视觉与物理手感待用户核验。

## 一、错误谱系总览

| # | 根因层 | 具体错误 | 修复 | 提交 |
| --- | --- | --- | --- | --- |
| 1 | 运动器 API 语义 | 物理模拟用定点运动器 `activate_fixed_point_motion_device` 填 `move_speed=0`，球不动/行为异常 | 改用匀速直线运动器 `add_uniform_basic_linear_motion_device`（velocity 速度向量 + duration） | d97b285 |
| 2 | 旋转轴语义 | 旋转运动器 axis 传错，自旋轴漂移 | 绕世界轴 ω 自旋时 axis 直接传 ω（局部轴=世界轴，ω 是 R 特征向量），angVel=\|ω\|·180/π | d97b285 |
| 3 | 预制体版本差异 | 球下出现跟随实体（用户反馈）——V4 预制体自带展示底座装饰 | 切 V2/V3 无底座版本，重建预制体 1077936138 | d97b285 |
| 4 | 地形覆盖 | 草地未覆盖全场（无 margin） | `assets:terrain set-range` 扩到 625 tiles 带 margin | d97b285 |
| 5 | 物理模型 | 固定距离停止（太粗糙） | 三力积分（重力+空气阻力+马格努斯）+ 自旋衰减 + 地面反弹 + 滚动摩擦 + 停止判定 | d97b285 |

## 二、最近一次错误的完整调查链（运动器参数）

**现象**：用户反馈"基础运动器更新足球位置"参数填错——初始速度没填对，其他参数含义也不清楚。

**调查**：查官方文档 + 项目文档 + PKC 知识树，确认三类运动器语义：

- `add_uniform_basic_linear_motion_device(target_entity, mover_name, duration, velocity)`：velocity 是**速度向量**（Vec），duration 是运动时长。物理模拟"以速度 v 移动 dt"应表达为 velocity=v、duration=dt。
- `add_uniform_basic_rotation_based_motion_device(target_entity, mover_name, duration, angularVelocity, axis)`：angularVelocity 是 °/s 标量，axis 是**局部轴**。
- `activate_fixed_point_motion_device(...)`：是"移动到 target_position"（绝对位置），move_speed 是移动速度标量，param_type=SPEED/TIME，move_mode=INSTANT/LINEAR。**只用于瞬间移动/复位**，不用于物理模拟。

**根因**：把"移动到绝对位置"的定点运动器误当成"以速度移动"的物理运动器，move_speed=0 语义错误。

**修复**：物理 tick 改用 `motionLinear`（匀速直线运动器，velocity=当前速度向量，duration=0.2s）+ `motionSpin`（旋转运动器，axis=ω 方向，angVel=|ω|·180/π）。

**验证**：编译通过 → 注入成功 → 回读真实 .gil 核验执行流（13 节点物理图 + 2 节点输入图，13 composites，var pins OK）→ 待用户游戏核验。

## 三、为什么反复出问题——系统性根因

1. **运动器 API 语义靠猜，未先查权威文档**：三类运动器（直线/旋转/定点）参数含义差异大（速度向量 vs 速度标量 vs 绝对位置），凭直觉填参数必然错。教训：**用运动器前先查 `docs/game-engine-knowledge/motion-devices.md` + PKC，确认参数是向量还是标量、是相对还是绝对**。

2. **旋转轴"局部 vs 世界"的直觉陷阱**：旋转运动器 axis 是局部轴，但绕世界轴 ω 自旋时局部轴恰好等于世界轴（ω 是 R 的特征向量，R^T·ω=ω）。这个"恰好相等"容易让人误以为 axis 就是世界轴，从而在非自旋场景（绕局部轴旋转）传错。教训：**区分"绕世界轴自旋"（axis=ω 直接传）与"绕局部轴旋转"（axis 需按实体朝向换算）**。

3. **预制体版本差异未在建模前确认**：复用官方预制体时没确认版本差异（V4 自带展示底座），导致球下出现跟随实体。教训：**复用官方预制体前先确认版本（V2/V3/V4）差异，尤其是否自带装饰物/底座**。

## 四、流程与方法论教训

- **用户反馈"球下出现实体"先归因到代码 bug，实际是预制体自带装饰**：排查游戏行为问题要分层归因（代码层 / 资源层 / 预制体版本层），不要默认是代码 bug。用户澄清后确认是 V4 预制体底座，切 V2/V3 解决。
- **物理模型要"能量耗尽才停"**：固定距离停止是错的，正确做法是积分到 |v|<0.3 才停（动能耗尽），中间经历上升→落地→滑动摩擦→滚动摩擦→反弹→再反弹→停止的完整过程。
- **草地要带 margin 覆盖全场**：`assets:terrain set-range` 支持 CLI 创建草地，但需按场地尺寸 + margin 计算 col/row 范围。

## 五、风险探索与未闭合项

- 游戏内物理手感（反弹系数 e=0.65、滚动摩擦 ×0.985/tick、马格努斯系数 KM）待用户核验，可能需要调参。
- 5Hz tick（dt=0.2s）的离散积分精度，高速球可能穿模（需用户测试确认）。
- 旧预制体 1077936131（带底座）仍存在但未引用，可后续清理。

## 六、产出清单

- 修复：`examples/football/src/composites/physics.ts`（三力积分+滚动摩擦+停止）、`motion.ts`（三类运动器）、`kick.ts`（kickLaunch 用 motionLinear）、`game.ts`（物理图 1073741825）、`input.ts`（输入图 1073741826）。
- 资源：`stage0-fix-config.mjs`（重建无底座预制体 1077936138）、`football.structure.json`（去 2 底座 item，222 items）、草地 625 tiles。
- 技能：`dsl-nodegraph-development` 补 2 条错误行（c20f689）。
- 文档：本复盘文档、PROGRESS.md 底座方案更新。
- 提交：d97b285、c20f689。
