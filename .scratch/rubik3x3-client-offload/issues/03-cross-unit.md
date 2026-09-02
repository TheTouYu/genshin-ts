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
- [ ] 状态变量客户端可读性预检有结论（预注册或已补注册）
- [ ] 六+新图 gameNodeCount 全部 ≤2000（预算表落票）
- [ ] 编译 0 错 + decode-gia wire 断言（seqlock 门/表索引/信号节点全对位）
- [ ] 离线逻辑对拍：同一状态输入，客户端图算法输出与服务端现行十字宏序列一致（模拟脚本）
- [ ] 精确 commit
