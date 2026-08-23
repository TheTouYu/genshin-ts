# 完整复盘：足球“球不动→能动能滚”两阶段修复（2026-08-23）

> 范围：examples/football 从“加力后球躺原地微旋”到“高吊可弹跳、横传可滚且旋转方向正确”的一波修复。
> 视角：运动器叠加语义 / 位置型与速度型运动器选择 / 状态机对弹跳-滚滑转换的建模。
> 证据：提交 6fdcfa3、48b680d；日志 2828（15:26 复测前）、2829（15:26 复测后，3.4 万帧解析产物 /tmp/fball-frames.txt）；
>       真实地图 1073741908.gil 注入后回读（composite 1610710011 / 1610710010 / 1610710000）。
> 状态：代码/编译/注入/GIL 回读已完成；游戏内手感已由用户核验第一轮“球能滚”，待用户复核本轮弹跳与旋转方向。

## 一、错误谱系总览

| # | 根因层 | 具体错误 | 修复 | 提交 |
| --- | --- | --- | --- | --- |
| 1 | 运动器参数（误判） | 同一事件链里 line motion 不动，先误判成 move_speed=0 | 改成 speed=dist/0.2 | bd9da07 |
| 2 | 运动器叠加语义 | 日志证明 speed 已非 0 仍不动：activate_fixed_point_motion_device（匀速直线）与 add_uniform_basic_rotation_based_motion_device 同链激活 → 直线设备被秒停、位置始终不动 | 改回匀速直线运动器，速度按 (target-loc)/dt 计算 | 6fdcfa3 |
| 3 | 物理状态机 | 一落地就转 ROLL，视觉上“钉”在地上没反弹；滚滑只用 0.985/tick 减速，太滑 | 落地后用 |vy| 阈值保留 FLYING 弹跳，摩擦调到 0.8 | 48b680d |
| 4 | 旋转表现 | 滚滑沿用初旋方向（绕 Z），横传往 +Z 滚方向不对 | 滚滑自旋按 v 实时推导 ω=(v_z/R,0,-v_x/R)，横传初旋改为 +X | 48b680d |

## 二、最近一次错误的完整调查链

### 2.1 现象（用户原话）

- 第一轮：“球施力后躺在原地不动，只有一点点自旋转”。
- 第二轮：“高吊飞到一半有回馈感/位置突变，落地不反弹一直往前滑，太光滑，旋转方向不对；横传也滑太远、旋转方向不对”。

### 2.2 日志铁证

- 日志 2828 逐帧：每次 physApplyMotion 里两个运动器节点都有帧，
  但 motion_to_point 下的 Get Entity Location 读到的球实体位置连续多 tick 都是
  (0.0, 0.25, 0.0)，逻辑位置 ballPos 却正常推进。→ 直线设备没作用在实体上。
- 日志 2829 逐帧：rec11 把 ballPos 拉到 0.25 后立刻写 state=2，
  之后 rec13..rec61 全是 phys_roll_tick；横传 rec68 同样落地即 ROLL。
  ballSpin 在滚滑阶段始终绕 Z 轴，而球在 +Z 方向移动。
- 摩擦：vel 从约 -9 只按 0.985/tick 衰减，滚到 x≈-52.7 仍未停。

### 2.3 根因

1. 位置型定点运动器与旋转运动器不能这样叠加：activate_fixed_point_motion_device
   在目标实体上动态添加的定点运动器，与随后添加的旋转运动器在同一事件链里冲突/打断，
   直线设备被秒停（commit bd9da07 只补了 speed，没解决设备本身被停的问题）。
   改用可与旋转叠加的匀速直线运动器；为保留“精确到目标点”的防穿模目标，
   速度显式计算为 (target - current)/duration，而不是给物理速度向量 free drift。
2. 落地→滚滑被建成一次性状态切换：原代码只看 pos.y < 0.3 就转 ROLL，
   忽略了反弹后 vy 仍很大的情况，导致球一触地就被水平滚动模型接管，视觉上永远不再弹跳。
   修复：|vy| < 1.0 才滚滑，否则继续 FLYING 走介质物理。
3. 滚滑没有把旋转和线速度耦合：滚滑阶段只衰减初旋，方向不变。
   无滑动滚动的正确自旋是 ω = (v_z/R, 0, -v_x/R)。

### 2.4 修复与验证

- 修改文件：examples/football/src/composites/motion.ts、
  examples/football/src/composites/physics.ts、examples/football/src/composites/kick.ts。
- 编译 game.gia；临时副本注入回读 → 真实地图注入 + Temp 同步 → 真实 GIL 回读：
  phys_fly_tick（impl 1610710011）出现 3 个 phys_apply_motion 分支
  （stop→FREE / grounded且bounceDead→ROLL / grounded且未dead→FLY / 离地→FLY），
  phys_roll_integrate（impl 1610710010）出现 ×4/−4 自旋耦合。执行流核对一致。

## 三、系统性根因（可复用）

1. 修“运动器不动”先证明设备是否真的持续运行，而不是先怀疑参数默认值：
   bd9da07 看到 speed=0 就修 speed，但日志里 speed 已非 0 仍不动。
   若先查“同一事件里另一个运动器是否把设备挤停/设备帧出现但实体位置不变”，能少一版误修。
2. 位置型运动器 vs 速度型运动器的选择，必须同时看“叠加规则”和“目标精度”：
   定点位置运动器精确但同链叠加风险高；匀速直线运动器可叠加但可能漂移。
   折中做法 = 匀速直线 + 显式把速度算成 (target-loc)/dt，把两者优点合起来。
3. 状态机建模要按能量/速度分界，而不是按“是否贴地”布尔分界：
   “触地即可滚”把弹跳吞掉；要用反弹后的垂直速度阈值区分“还会弹”与“开始滚”。

## 四、流程与方法论教训

- 日志解析先做紧凑时间线：把每个记录的首个 Set ballPos/ballVel/ballSpin/state 和末尾
  Get Entity Location 抽出来，比盯单帧直观得多（本轮的 Python 只读脚本可复用）。
- 候选注入到临时副本（不改真实地图）→ 回读 GIL 验证分支/执行流 → 确认后再真实注入，
  把“注入成功”和“行为正确”分层，符合铁证原则。
- 运动器叠加问题优先查 motion-devices.md 与 PKC；不要凭“官方表格看起来可叠加”代替游戏实例证据。

## 五、风险探索与未闭合项

- 定点运动器与旋转运动器的冲突精确机制尚未最小实验闭合：
  是“类型本身不可叠加”还是“固定点运动器的 lockRotation=true 目标旋转通道与旋转设备冲突”？
  本轮用匀速直线绕开，后续可在 LogFormatLab 做 lockRotation=false 最小差分。
- 0.2s 离散积分的落地/反弹仍是位置到位置的线性插值，高速球在触地 tick 仍可能有轻微弯折；
  若要更平滑可降 dt（0.1/0.05）或做碰撞扫掠（节点预算另行评估）。
- FK 手感值（ROLL_BOUNCE_VY=1.0、ROLL_FRICTION=0.8）是工程估参，待用户游戏手感最终确认；
  可按反馈只调这两个常量。

## 六、产出清单

- 修复：examples/football/src/composites/motion.ts、physics.ts、kick.ts。
- 提交：6fdcfa3（球能动）、48b680d（弹跳+摩擦+旋转耦合）。
- 文档：本文档 + motion-devices.md 新增定点器叠加规则节。
- 证据：日志 2828/2829；临时候选 /tmp/football-candidate.gil、/tmp/football-candidate2.gil；
  解析产物 /tmp/fball-frames.txt。
