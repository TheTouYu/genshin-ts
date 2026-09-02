# 17 — E2：gate 常开量真实应用天花板

**What to build:** 把客户端 fb-phys 的「gate 开门才计算」依赖去掉（球非 Rest 且 e==a 即算），
让每次施放都能试算并发 P，服务端 first-wins 照旧——直接量「去掉拍门节流后」的真实应用频率
天花板，并做 dt 配套实验验证时间流速是否仍≈真实时间。这是票 13 结论推出来的第三条候选线
（近距 76/s 施放下，理论上限 ≈1/(cast gap+0.08s) ≈10~11Hz）。

**Blocked by:** 13（基线数字已就绪）

**Status:** ready-for-agent

- [ ] fb-phys 计算条件改造：hasTask ∨ (e==a ∧ state≠Rest)（不再依赖 fb_ball_gate）；
      编译 0 error + 注入 + 读图核验（Rest 防呆/瞬移门不受影响）
- [ ] 近距一轮双详情日志：cast Hz / P 发送 Hz / apply Hz / cast gap 中位 / 送达中位 表，
      与票 13 基线（3125/3127）对照
- [ ] dt 配套实验（0.1 附近 2~3 档）：模拟时间流速 = apply Hz × dt 是否 ≈1.0
- [ ] 结论落票：E2 能否作 16 正式选型（含负载/详情日志体积/远距变速成本；若变速不可接受，
      给出 gate 保留与 E2 的混合方案）
