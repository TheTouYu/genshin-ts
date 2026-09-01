# 03 — fb-phys 扩建：六态物理客户端半边

**What to build:** 客户端图 20008/1082130433 从 34 节点扩至 ~850-1250 节点——sim 验证过的
六态物理（重力+气动+马格努斯+反弹+滑+滚）整体上客户端算力通道：每拍读拍门与镜像状态、
参数从球实体变量当拍物化、积分一拍、回传新状态。做完本票，球的物理大脑在客户端完整在位
（与 02 合体后游戏内可见行为）。E5 实体寻址观测分支顺带收证据，失败零阻塞。

**Blocked by:** 02（单变量轮次纪律：先服务端半边收口，客户端半边单独一轮可归因）

**Status:** ready-for-agent

- [ ] 拍门：读 fb_ball_gate，0=空转 / 1=进入计算（空转拍成本对齐 E1 实测 ~450B）
- [ ] 球寻址观测链（E5 顺带验证）：getCustomVariable(owner, fb_ball_entity)→getEntityType/getEntityLocation 帧值回传；失败=删模块不阻塞
- [ ] 镜像读 12 变量（挂玩家实体，owner 链已验）+ 参数组读取 19 项（经 fb_ball_entity 读球实体）→ 当拍物化快照（图内局部变量，多消费点先物化——不变量 1）
- [ ] 任务应用三分支：KICK（vel/spin 定点 ×1000 解码）/ RESET（pos/vel/state/tick 种子）/ PARAM=预留不实现（热调走编辑器直改变量）
- [ ] 六态积分一拍：sim core 单拍闭式移植（无循环），常量全部来自物化快照（图内零参数字面量）；六态机 FREE/FLY/BOUNCE→/SLIDE/ROLL/REST/GOAL 自动切换——「任意冲量对，全程连续无瞬移」
- [ ] 回传打包：fb_ball_state sendSignal（01 注册的形态；tag='P'/'T'）
- [ ] 结构层核验：全图编译 0 error；节点数 850~1250 ≤2000；decode-gia 积分链/门链形态回读；TS 源码不变量对照（min/max 对称、无 +=、outflows 声明）
- [ ] 收轮：勾票+看板+PROGRESS「下一步=04」+精确 commit
