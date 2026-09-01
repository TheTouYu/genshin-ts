# 02 — fb-server 扩建：握手节拍服务端半边

**What to build:** 服务端图 1073741830 从 79 节点扩至 ~310-410 节点，长出 T3 握手节拍的
服务端半边——会话启动自动种下球引用与初始 RESET 任务、球运动期间 0.2s 拍门开合、
接收客户端回传后 first-wins 提交真相镜像并挂球运动器、进球判定打点。做完本票，
服务端具备「收计算结果、当裁判、驱动视觉」的完整能力（等 03 的客户端半边上线即合体）。

**Blocked by:** 01（信号 fb_ball_state 与镜像/参数变量必须先在图上）

**Status:** ready-for-agent

- [ ] 会话种子：whenEntityIsCreated 写 fb_ball_entity=球实体 1077936135（entity 型，挂玩家实体）+ 初始 RESET 任务进邮箱（R2-DESIGN §4 载荷编码）
- [ ] beat 定时器链：fb_beat 0.2s loop（名单制分发 else 空分支）置 fb_ball_gate=1；REST stopTimer；任务应用 startTimer；gate 死锁看门狗并入 fb_wd（gate=1 超 0.8s 重开）
- [ ] onSignal(fb_ball_state)：first-wins（base_tick==镜像 tick）→ 镜像 12 变量写 + gate=0 + tick+1 + 挂球运动器（速度=(新位−当前位)/0.25s 同名顶替）+ REST→stopTimer；dup 打点
- [ ] 进球判定简版：镜像 pos 过门线 → print 判定帧值 + RESET 任务（tab 计分 UI 留后续轮）
- [ ] 结构层核验：gsts.fb-client.config.ts 主配置全图编译 0 error；节点数 ≤2000（预算 310~410）；decode-gia 回读执行流（名单制分支/first-wins 链/运动器链）
- [ ] 服务端图纪律自查：定时器名单制、运动器同名顶替时长略大于拍距、贴地不积分重力（AGENTS.md 不变量+服务端纪律清单）
- [ ] 收轮：勾票+看板+PROGRESS「下一步=03」+精确 commit
