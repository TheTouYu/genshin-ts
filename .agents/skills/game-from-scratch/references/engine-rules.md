# 游戏引擎规则参考（千星沙箱运行时）

> 已通过源码定义 / 真实 GIL / 游戏核验的引擎规则速查，按章节分类积累。
> 新增规则必须先经实验闭环（改图→编译→注入→用户运行→日志解析）再入表，并标注验证层级。
> 权威源码：`src/definitions/nodes.ts`（节点）、`src/definitions/events.ts`（事件）、`src/runtime/variables.ts`（图变量）。
> 运动类节点官方参数定义：`~/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/utils/node_data/data.json`。

## 世界坐标系

- **Y 轴垂直向上，XZ 为地面平面**。证据：平面 10009003 零旋转平躺、法线 +Y（真实 GIL + 用户核验）；棱柱高度轴 Y；长方体 scale=1 = 1×1×1。
- vec3 参数顺序 = (x, y, z)；旋转角速度/朝向同理。
- 旋转方向符号（顺/逆时针）不凭推断，先按 WCA 惯例写、游戏内视觉核验后再闭合。

## 运动器（Mover）

官方共 **6 类**，**无椭圆/圆弧/轨道类**：

| 节点 | 关键参数 | 语义与选择准则 |
|---|---|---|
| 匀速旋转 | target, name, duration, angular_velocity(°/s), axis | 自旋用。已验证：90°/1s 连续累积、世界轴语义（游戏核验） |
| 匀速直线 | target, name, duration, velocityVector | 位移=速度×时长，**只需相对量，不依赖当前位置** → 分段轨迹/公转首选 |
| 定点运动 | target, name, movementMode(瞬间\|匀速直线), spd, targetLocation, targetRotation, lockRotation, parameterType, movementTime | 需要**绝对目标位置**（要查位置或自跟踪状态），且带目标旋转/锁旋转参数——对纯位移是干扰，慎用 |
| 朝向目标旋转 | target, name, duration, targetAngle | 朝向类 |
| 跟随运动 | switchTargetByGuid/Entity 等 | 绑定跟随类（跟随与基础运动器不能同配一实体） |
| 操控运动 | — | 玩家操控类，与玩法实体无关 |

通用事实：
- **一个实体可同时挂多个运动器**（名称唯一标识，供停止/暂停/恢复引用）。
- 运动器停止 → `whenBasicMotionDeviceStops` 事件（payload：eventSourceEntity / eventSourceGuid / motionDeviceName）。
- **组件前置依赖**：运动器要求目标实体带基础运动器组件（basicMotion），否则节点执行报错（P4 最小实验真实踩坑：用户手动补组件后恢复；基础元件模板自带 preset=default）。
- 轨迹类需求（圆弧/椭圆/公转）：用 **N 段匀速直线逼近**（分段折线），段数=视觉/节点数折中（2×2 取 5，每段 18°）。

## 事件（实体挂载图触发）

| 事件 | payload | 备注 |
|---|---|---|
| whenTabIsSelected | eventSourceEntity / eventSourceGuid / tabId / selectorEntity | tabId 从 1 开始（1~6=R/L/U/D/F/B，游戏+日志核验） |
| whenEntityIsCreated | eventSourceEntity / eventSourceGuid | 任意实体创建时触发；关卡实体创建 = 游戏开始信号 |
| whenEntityIsDestroyed | + location / orientation / entityType / faction / damageSource / ownerEntity / snapshot | 关卡实体上可监听 |
| whenBasicMotionDeviceStops | + motionDeviceName | 分段动作推进的驱动事件 |
| whenTimerIsTriggered | + timerName / timerSequenceId / numberOfLoops | timerSequenceId = 序列第几个时间点（从 1 起） |
| whenNodeGraphVariableChanges | + variableName / preChangeValue / postChangeValue | 跨图通信备用 |

- **事件要挂载到实体才触发**：`gsts assets:mounts attach <实体ID> --graph <图ID> --gil <地图.gil> --write`。挂载玩法图到实体的规则已闭环（root5 type 3 槽）。
- **关卡实体例外**：游戏自动创建、不在 root5 场景实体列表，CLI 挂载支持待闭环（2026-08-13 阻碍项登记，见下节）。

## 关卡实体（Stage Entity）

- 游戏必然存在的默认实体（DSL：`g.stage` / `getStageEntity`），可理解为"游戏开始了"的标志。
- **起始状态/创建逻辑挂关卡实体，不挂角色**：多人游戏多个角色，挂角色事件会重复触发多次。
- 挂载玩法图到关卡实体：需要用户在编辑器配置一次 → 保存相邻快照 → 拆分解析比对 → CLI `--stage` 支持（流程见 `editor-incremental-gia-investigator`）。

## 实体动态创建

- `createPrefab(prefabId, location, rotate, ownerEntity, overwriteLevel, level, unitTagIndexList) → entity`：运行时创建实体，**无 GUID**（queryEntityByGuid 对动态创建实体无效）。
- `createPrefabGroup` 按组创建，返回 entity 列表。
- 动态创建的实体引用跨事件保存：**图变量**（`g.server({ variables })` 支持 entity 类型，含 entity 数组/dict）。
- 整体移位设计：创建位置 = 基准点（图变量，改一处即整体移动）+ 固定角位偏移。
- 创建时机模式：`whenEntityIsCreated`（关卡实体）→ 可选 `startTimer` 延时（如过几秒）→ createPrefab ×N。

## 定时器

- `startTimer(targetEntity, name, loop, sequence[])`：序列为从小到大秒数数组（≤100），到点触发 `whenTimerIsTriggered`。
- **同步推进多实体分段动作**：把序列设成"每段结束时刻"（如 [0.2,0.4,0.6,0.8,1.0]），一次触发统一给所有目标加下一段——避免"停止事件交错"问题（多实体各自停止事件到达顺序不可控，共享段号变量会错乱）。
- 定时器终止不可恢复：`terminateTimer`；暂停可恢复。

## 输入锁模式

- 长动作（旋转等）进行中：入口事件先查锁（bool 图变量）→ 置真 → 动作完成（最后一段停止/定时器末次触发）→ 解锁。
- 目的：连点/多点会叠加运动器导致状态错乱。

## 图变量

- `g.server({ variables: { name: <类型字面量> } })` 声明，`f.get`/`f.set` 读写；类型必须一致。
- 支持 entity / entity 数组（entity_list 用长度声明，无初值）/ dict（entity 键类型声明用 entity(0) 单对）。
- 多事件共享状态（创建出来的 8 个角块引用、输入锁、段号）都走图变量。
