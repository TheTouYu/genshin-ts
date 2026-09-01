# 02 — fb-server 扩建：握手节拍服务端半边

**What to build:** 服务端图 1073741830 从 79 节点扩至 ~310-410 节点，长出 T3 握手节拍的
服务端半边——会话启动自动种下球引用与初始 RESET 任务、球运动期间 0.2s 拍门开合、
接收客户端回传后 first-wins 提交真相镜像并挂球运动器、进球判定打点。做完本票，
服务端具备「收计算结果、当裁判、驱动视觉」的完整能力（等 03 的客户端半边上线即合体）。

**Blocked by:** 01（信号 fb_ball_state 与镜像/参数变量必须先在图上）

**Status:** ✅ done（2026-09-03；主图 169+复合展开 222 节点（预算带下沿以下——复合去重邮箱连写，如实入账）、
编译 0 error、decode-gia 结构核验+执行边健康通过；fb-server 已挪挂球实体，地图 SHA
4ce87ed5→**51f60721**，Temp 双 SHA 一致；内容注入归 04 票）

- [x] 会话种子：whenEntityIsCreated 写 fb_ball_entity=球实体 1077936135（entity 型；**按 09-03 裁决挂丘丘人 def+5 实体**，运行时逐实例写 1082130437..441，def=模板不写）+ 初始 RESET 任务进邮箱（R2-DESIGN §4 载荷编码：t1=2/t2..t4=pos×1000/t5..t7=vel×1000/t8=state；种子=2m 落体校准锚点 (0,2.25,0) Airborne）
- [x] beat 定时器链：fb_beat 0.2s loop（名单制分发 else 空分支）置 fb_ball_gate=1；REST stopTimer；任务应用 startTimer（读邮箱 t1，type∈{KICK,RESET} 的 ack 才唤醒——垃圾测试载荷不唤醒保 REST 期≈0）；gate 死锁看门狗并入 fb_wd（gate=1 → 置 0 重开，4s 粒度实现 0.8s 阈值口径）
- [x] onSignal(fb_ball_state)：first-wins（tag='P' 且 base_tick==镜像 tick）→ 镜像 11 写+gate=0+tick+1（fb_mirror_apply 复合 12 连写）+ 挂球运动器（fb_drive：速度=(新位−实体当前位)/0.25s 同名 'fb_phys' 顶替，时长 0.25>拍距 0.2）+ REST→stopTimer；dup/tear 打点
- [x] 进球判定简版：镜像 pos 过门线（|px|>52.5 ∧ |pz|<3.66 ∧ py<2.5，去重 fb_scored）→ print 判定帧值 + RESET 任务回中圈 (0,0.25,0) Rest（tab 计分 UI 留后续轮）
- [x] 结构层核验：gsts.fb-client.config.ts 主配置全图编译 0 error（All GIA generated 4）；节点 222 ≤2000 ✓；decode-gia 回读（监听双信号/复合调用点×5/常量落位全对账/执行边无重复入边无环）
- [x] 服务端图纪律自查：定时器名单制（本图 3 名+else 空；反向旧四图分发 else 均空已核对）；运动器同名顶替时长 0.25>0.2；贴地不积分重力=03 票 fb-phys 职责（服务端零积分）；根图 handler 全 f.xxx 高层 API
- [x] 收轮：勾票+看板+PROGRESS「下一步=03」+精确 commit

## 执行备注（给 03 票的接口事实）

- **状态枚举定稿**：0=Airborne 1=Bouncing 2=Sliding 3=Rolling 4=Rest 5=DribbleControlled（单一事实源 `sim/src/state.ts`；fb-server 已按 Rest=4 停拍——fb-phys 六态积分必须同枚举回传）
- **唤醒契约**：真实任务（fb_t1∈{1=KICK, 2=RESET}）的 ack 才 startTimer(fb_beat)；RESET ack 额外置瞬移门+清 fb_scored。dispatcher 测试载荷 t1=pe*1000+1 恒为未知类型——**03 的 fb-phys 按未知类型跳过应用但仍走 seqlock/ack**（E1 观测面不断链）
- **fb_sum 语义变化**：E1 闭式 pe*8000+36 仅 dispatcher 测试载荷路径保留；种子/进球走 fb_mail_post 复合 sum=Σtᵢ 投递时求值——03 求和校验式不变（同式求和比对）
- **服务端消费契约**：tag='P' 且 base_tick==镜像 tick 才应用（first-wins；dup='P' 同 base / tear=tag='T' 均不应用只打点）；回传参数序=注册序（tag,tick,px..sz,state）
- **视觉归服务端**：'fb_phys' 运动器（常态 fb_drive 0.25s 同名顶替；RESET 应用后首拍 INSTANT 瞬移防百米条纹——瞬移门在 RESET 的 ack 置位、首个应用拍消费）——03 不碰运动器
- **镜像写者=服务端唯一**：fb-phys 只读镜像+回传，勿写 fb_ball_*（gate 由 beat/看门狗/first-wins 管理）
- **挪挂已完成**：fb-server 1073741830 已挂球实体 1077936135（与旧四图同实体，双向定时器名单制已核）；球实体 gate/镜像 11 由本图 getSelfEntity 直写
- 编译坑：entity() 必须接字面量参数——数组索引 `ENTS[i]` 被 TS→GS 改写为运行时列表取值节点直接编译失败（实证 09-03）
- 编译命令：`node ./bin/gsts.mjs -c examples/football/gsts.fb-client.config.ts --noinject`（dev 子命令=watch 会挂住勿用；`build` 子命令不存在，默认动作即编译）
