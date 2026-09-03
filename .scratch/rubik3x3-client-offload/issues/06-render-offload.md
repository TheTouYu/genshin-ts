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
- [ ] 数学对拍：执行包生成 JS 离线模拟 vs 服务端现行复合输出一致（新建最小工具）
- [ ] 帧级协议：客户端任务拍回传信号 vs 服务端每槽设备帧参数逐槽一致
- [ ] 行为对拍（用户）：面转/自动还原 9 块两段轨道+自旋+节奏与现在一致（失败判据=视觉坍缩/少块/节奏错乱）
- [ ] 负载验收：开详情日志转动段 perf 对比 3143 基线，turn+visual 记录字节 ↓≥60%、全程不被踢
- [ ] 预算：服务端 turn/visual 删数学后 engineExpanded ≤1300/图；客户端渲染单元 ≤2000（沙箱实测）
- [ ] 三栏报告 + PROGRESS 记轮 + 精确 commit
