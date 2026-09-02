# 06 — R3 操作台九选项冲量入口

**What to build:** 玩家有了踢球入口——操作台 1077936137 的 tabBar 9 选项每项绑定一个预设
冲量（力度/转速不同，参考旧 kick.ts 九选项标定），点一下=给球一个 KICK。手感敏感的踢球
走即时通道（20002 单次触发按 REBUILD-V2-PLAN §2.7-C 分流决策），缓变参数走 seqlock。
做完本票，训练场能踢。

**Blocked by:** 05

**Status:** ready-for-agent（05 收口遗留第 0 步：**注入打印纪律版 fb-server**——dist-fb 已编译（fb-server 含打印纪律、fb-phys=f516e23 修复版），需用户确认游戏会话已退出，走 04 票同款注入通道（`node ./bin/gsts.mjs -c examples/football/gsts.fb-client.config.ts` 整段核对 ok 4/fail 0）+ Temp 同步 + composite-refs/var-pins 快检；地图当前 SHA fada77c9）

- [ ] 入口设计定案：tab 意图→服务端组任务包（轻链）；踢球即时性 vs seqlock 0~1s 复制延迟的分流决策（引用 REBUILD-V2-PLAN §2.7-C）
- [ ] 九选项冲量标定表（旧 kick.ts 力度/转速移植，上界核对 limits.maxSpeed=50/maxAngSpeed=70）
- [ ] KICK 任务链端到端：选项→任务→客户端应用冲量→球响应（帧值链证据）
- [ ] 角色侧 cast 前置若走 20002：角色无禁锢类控制状态（静默失败第一嫌疑）
- [ ] 用户复测：九选项各自行为预期句式报告（如「点长传，球应飞 15m+ 落地弹滚；若贴地平窜即仰角编码错」）
- [ ] 收轮三件套
