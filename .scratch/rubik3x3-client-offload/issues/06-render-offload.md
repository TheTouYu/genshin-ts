# 06 渲染负载分载——服务端只保留「添加运动器」

> Spec：`spec-06-render-offload.md`（2026-09-04 用户定调 + seam/边界已确认）
> 用户裁定边界：logic_apply_face 与状态发布留服务端（权威性）；渲染参数计算全去客户端；
> 分两阶段：先 turnblock 段（自旋+orbit1）→ 对拍通过 → orbit2 段。手动 0.3s 与自动还原共用渲染单元。

## What to build
把服务端 visual 图（19.6MB/1470 条负载大头）与 turn 图 flowDoMove 里的渲染参数计算搬去客户端：
- 新建渲染参数单元（rbv_ 链：20008 图 + 20009/20007 + 28 瞬发配置 + 独立信号组）——复用票 03/04
  通道全套（实例级变量、first-wins 门、客户端 DSL 约束 6 条）
- 服务端 flowDoMove 视觉分支改为：发任务（moveId）→ 收执行包（9 槽 × spin/orbit1/orbit2 参数，vec3
  化信号 ≤10 参，1914 需先注册 vec3 donor 先例信号）→ 只做动作：add 设备 + 按包启动定时器
- 删除（搬客户端）：view_turn_lookup 槽位查表、motion_orbit_prep/step 数学（C1/S1 常量）、localAxis
  长表查询+符号、自旋参数换算、orbit2 延时与定时器列表构造
- 保留服务端：设备调用、start_timer、logic_apply_face+发布、unlock/lock、事件分派
- 阶段 1 范围：turnblock 段（spin+orbit1 数学）；阶段 2：orbit2 段

## Blocked by
- 无（优先于票 05；05 角块单元顺延——本票同构地实证第二客户端单元）

## 验收项（seam 按 spec）
- [x] 数学对拍：rbv-math-kernel 464/464 PASS（S0~S4 几何锚 + 288 组正向全槽 A/B 对拍 + 96 组负折叠；样本留档）
- [ ] 帧级协议：客户端任务拍回传信号 vs 服务端每槽设备帧参数逐槽一致
- [ ] 行为对拍（用户）：面转/自动还原 9 块两段轨道+自旋+节奏与现在一致（失败判据=视觉坍缩/少块/节奏错乱）
- [ ] 负载验收：开详情日志转动段 perf 对比 3143 基线，turn+visual 记录字节 ↓≥60%、全程不被踢
- [x] 预算（沙箱注入干跑 + recursive-count 规则预测，与票 03 同口径）：visual 217 / turn 838（≤1300✅，删数学前基线为负载大头）；rbRenderSkill 218 / status 2 / decision 2（≤2000✅）
- [x] 三栏报告 + PROGRESS 记轮 + 精确 commit（本轮代码+资产+注入；帧级/行为/负载 seam 待用户侧，见注记）

## 阶段①执行注记（2026-09-05 开工，随轮更新）

### 范围裁定（用户）
- 阶段①一次全搬三种运动类型（面 9 槽/中层 8 槽/整转 26 槽）的 turnblock 数学；orbit2 段的
  延时编排/定时器列表构造仍属阶段②（服务端现有 orbit2 定时器机械消费包内 vel2）。
- 本轮直通真图写回+注入（用户确认 approval=never；真图破坏性步骤仍按确认制逐项报告）。

### 链形态（复用票 03/04 rbx_ 通道，新前缀 rbv_；实现注记 2026-09-05 定稿）
- 客户端单元：20008 rbRenderSkill（1082130443，实空位从 443 起——1082130442 已被 03 轮探针占用）+ 20009 rbVStatus（1082130444）+ 20007
  rbVDecision（1082130445）；28+瞬发技能配置 1191182340（绑 1082130443；1191182339 已被 Round3 探针占用）。
- 信号：rbv_echo（C→S，7 参：tag:'s'/e:epoch/slot/piece/axis:vec3/vel1:vec3/vel2:vec3）+ rbv_go
  （S→S，e:epoch；visual 图收齐后通知 turn 图起定时器）。vec3 参数需先在 1914 注册（donor 沿
  football_push 先例/CLI 直注）。
- 寄存器：玩家 rbv_epoch/rbv_ack/rbv_host（独立宿主引用——3148 实证 rb_host 仅 rbx 链写、空 host→空包；修复后 rbRenderPost 每任务写 rbv_host=6201）；宿主 1077936201 任务字段 rbv_move（signed
  moveId）/rbv_orient（26，转动前 blockOrientPre 快照）。**不再发布 rows/tempP 行快照**——
  客户端按「槽位→全局格点（烘焙表）→ solver_cp/ep/ct（P 排列）直取块号」计算；负折叠面转的
  交错序与旧实现不同但动的是同一 9 块集合、几何正确（S4 独立校验），对拍口径已更新。
- 烘焙表（gen-rbv-vars.mjs 输出并写 tools/rbv-render-tables.json）：rbv_slotsF(54)/slotsM(24)/slotsW(78)
  槽位→格点、rbv_off(26 vec3 格点偏移)、rbv_axes(13)、rbv_ax0/1/2(96×3，localAxis 288 分块)。
- 槽位缓冲（visual 图图变量 rbvPiece/rbvAxis/rbvVel1/rbvVel2/rbvFlags + rbvRcvd/rbvDone）：
  onSignal(rbv_echo) 逐槽写入（flags first-wins 吸收 dup 实例），收齐 N 槽 → 玩家 rbv_ack=e +
  sendSignal(rbv_go,e)；turn 图 onSignal(rbv_go) 校验 epoch 后按 |curMove| 起既有定时器
  （面 A/B×2 段 / 中 1×2 / 整 4 批量 turnblock + 2 批量 orbit2）。
- 数学常量归属：kVel（面 10/中 6.6667/整 2.0）随数学搬客户端（rbRenderSkill 内字面量）；
  dur/seg/av/turnLastSlot/turnCompletionDelay 仍服务端（flowDoMove 按类型 set，rbRenderPost 发布到
  visualHost，visual 首事件同步图变量，设备壳机械使用）。
- 服务端保留：logic_apply_face 与发布、设备调用、start_timer（收齐包后）、unlock/lock、事件分派、
  wholeTurn 拆段/批量事件结构；删除：viewTurnLookup 槽位查表、motion_orbit_prep/step/velocity/store
  数学与 C1/S1、localAxis/axes/vels1/visualP/centerPos/tempP 相关变量与发布（publishShared 移除）。

### 数学对拍 seam 口径（tools/rbv-math-kernel.mjs）
- S0/S1/S2/S3 独立锚：格点=spawn 坐标；+90° 绕轴=move 表 to 行；-90°≡三次 +90°（负折叠等价）；
  轨道 45° 落位=罗德里格斯；localAxis 抽取 288。
- A（服务端现行复合 JS 转写：rows 行快照→块 + 实体格点 loc）vs B（客户端新算法：槽→格点→P 直取）
  正向 move 全槽执行包（piece/axis/av/dur/vel1/vel2）全等；负折叠 move 断言「同一 9 块集合」+
  S4 落点独立校验（交错序差异如实登记，不冒充等价）。
- 结构层（编译 wire 断言）+ 帧级（客户端任务拍 vs 服务端设备帧）分层验收，不互相冒充。

### 写回/注入顺序（编译需真图信号注册表先行）
1. SHA 锁定 + 备份 → 注册 rbv_echo/rbv_go（CLI assets:signals register，vec3 donor 沿 football 先例）
   → 提取更新 src/resources/signals.ts；
2. 宿主 1077936201 + 玩家实体变量注册（gen-rbv-vars.mjs host|player 输出）；
3. 全图编译（registry 读真图）→ wire 断言 → 沙箱预算干跑；
4. assets:node-graphs create 1082130443/444/445 + assets:skill-config create 1191182339（28+瞬发绑 443）；
5. 批量注入 → 回读核验（composite-refs/var-pins/图名节点数/Temp md5）；
6. 用户编辑器：第二造物（小体型近出生点）配置（决策图=444、技能管理引用 1191182339、CD 忽略公共
   冷却）+ 游戏对拍/负载日志。


### 负载修复注记（3165 实证，2026-09-03 晚）
- 状态：转动数值/节奏已正确（3162 rlu 三连 + 手动/自动各型通过）；完整自动还原仍被踢。
- 铁证链（3165，82s/3947 条）：峰值秒 81 负载 10024 vs 3143 基线峰值 5397；被踢秒无 execMove，
  832 收包 320 条/615KB + 443 双实例任务拍 727KB 洪泛。
- 根因：**每任务拍 9-26 槽×双实例=18-52 条信号突发超引擎 onSignal 投递容量**——rec3459 客户端
  9 条发送帧齐全但服务端 832 只收到 2 条（rec3457/58），78-80s 信号积压、81s 集中涌入 320 条
  ×74 帧 → 单秒 2.4 万帧被踢。客户端无 ack 永不停止 → 风暴自激。
- 方案（06-R7，用户方向已授权"继续拆服务端大头到客户端"）：**客户端分片发送协议**
  1) rbRenderSkill 每任务拍只发 3 槽（游标窗口 [c, c+2]∩[0,N)），突发降到 2 实例×3=6 条/拍
     （与 fb 双实例回传同量级）；face 9 槽 3 拍=0.2s 收齐≈动画时长，节奏不回退；
  2) 游标 c 存技能变量 1207959553（float），上次 epoch 存 1207959554；任务 epoch 变化重置 c=0；
     c 推进 c=(c+3)%N 用减法式（无 modulo）；跨拍 flags 累积由服务端 viewRcvPkg 已支持（fresh
     仅一次）→ 服务端零改动；
  3) 每拍只重算窗口内槽（客户端记录由 103KB/拍 降到 ~15KB/拍，日志洪泛同步降）；
  4) 整转 26 槽 9 拍=0.6s 收齐（整转动画 1.0s，前 0.6s 收包可接受）；若复测仍丢包再加重试退避
     （每轮间歇 1-2 拍）。
- 验证标准：完整自动还原（全量详情日志）跑完不被踢；峰值秒负载回落 ≤3143 水平（5397）。

### Round 7 注记（2026-09-04，日志 3185）：R7 分片落地 + 节拍根因

- R7 分片（3 槽/拍）已注入实证：任务拍 ~7.9KB/条、127s 无踢出（3165 的 82s 被踢已修复）。
- **次生 bug**：rbv 链每步 ~0.9-1.1s 物理下限 > fast 模式 emitTick 0.61s/doneTick 0.80s →
  doneTick→op5 早于宏尾步 solver_cp 发布 → 规划器读旧状态重发宏 → 角块 mask 9→1 振荡。
- 修复：solver.ts emit/done 固定延时（1.52/2.01s，不参与 fast 折扣）；编译+wire 断言已过，待注入复测。
- **open-item：emit/done 事件驱动化**（unlock→步完成信号→执行器推进），替代定时器容差——
  当前修复是止血（容差放大），根治需信号闭环。优先级：完整自动还原全程验收（票 07）之前完成。
