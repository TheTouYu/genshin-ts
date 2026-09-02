# 03 十字单元三图 + solverPlan v2 dispatcher

## What to build
- 客户端 20008 十字图（435）：seqlock 门（epoch≠ack+sum 校验+二读）→ 读 solver 实体状态变量 →
  十字 mask/策略/宏查表（一把算完模式，E1 在 #04 定论；截断回退分步游标模式）→
  每码 sendSignal(rbx_echo, e=idx*10+code) + done(mask)
- 20009（438）executeSkill(1)；20007（439）无条件切状态
- 服务端 solverPlan v2：pStep 机替换为「写任务寄存器→onSignal 收码写 solveBuf→done 判
  mask/交棒→op6」+ 4s 看门狗重提交（足球 fb-server 模式，砍拍门/镜像流）
- 预检：solver_cp/co/ep/eo/ct 是否预注册可客户端读（不可读则 CLI 补注册）
- 主配置全图编译（单 entry 客户端图必失败——技能三-1）

## Blocked by
- 02

## 验收项
- [x] 状态变量客户端可读性预检结论：**1914 三张控制器实体 + 玩家实体全部零注册**（对照足球球实体 31 变量阳性验证过 CLI 行为）→ 注册清单定稿并合并 #04 一次写入：宿主 1077936201 × 13（solver_*×5 + rbt_*×8 表值烘焙）+ 玩家 × 5（rbx_*×4 + rb_host）；生成器 tools/gen-rbt-vars.mjs（npx tsx 运行，表值=cfopTables 定稿）
- [x] 预算（GSTS_BEYOND_LOCAL_ROOT=/tmp 沙箱注入干跑 + assets:node-graphs nodes 实测）：solverPlan v2 初测 **2219 ❌拒载** → 删 pStep2/3/4 stage-1 死分支 + 十字表变量（CF_X_*/sep/seo/crossHomes/mC0..2）后 **1159 ✅**（反而小于改前 1765：十字段整体搬走的净收益）；rbCrossSkill 20 ✅；turn 610 / visual 不变 ✅
- [x] 编译 13 GIA 0 错；wire 断言全过：rbCrossSkill（信号 server id 1610612767 + rbt_/solver_/rb_host 字面量 + 无 MB 节点）、rbStatus(200126 入口)、rbDecision(200126 + configId 1082130438)、solverPlan（rb_lane_post def+impl 写链 rbx_t1/sum/host/epoch、rbx_echo 三元组 …65/66/67、def 1610700090；根 nodes 段查不到是因 def 在 accessories 段——已复核）
- [x] 离线对拍口径：客户端算法=服务端 solverCore 复合逐式转写（同表同式），结构层由 wire 断言覆盖；**行为层帧级对拍落在 #04**（30s 测试日志 vs 现行十字宏序列）——如实登记，不以转写等价冒充行为验证
- [x] 编译期踩坑闭合 5 条（客户端图 DSL 新实证）：无 variables（表走实体变量）、禁可变外层捕获、循环变量是运行时值（禁 BigInt(s)/裸数组索引/算术需显式 f.addition）、无 moduloOperation、无 multipleBranches、模块级标识符被泛型捕获（表名内联）
- [x] 精确 commit
