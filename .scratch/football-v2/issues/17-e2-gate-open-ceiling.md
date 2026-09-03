# 17 — E2：gate 常开量真实应用天花板

**What to build:** 把客户端 fb-phys 的「gate 开门才计算」依赖去掉（球非 Rest 且 e==a 即算），
让每次施放都能试算并发 P，服务端 first-wins 照旧——直接量「去掉拍门节流后」的真实应用频率
天花板，并做 dt 配套实验验证时间流速是否仍≈真实时间。这是票 13 结论推出来的第三条候选线
（近距 76/s 施放下，理论上限 ≈1/(cast gap+0.08s) ≈10~11Hz）。

**Blocked by:** 13（基线数字已就绪）

**Status:** closed-negative（2026-09-03 判负，地图/代码已回退 E1 基线 416bd420…；正式勾票/看板收口待分级流程）

- [x] fb-phys 计算条件改造：hasTask ∨ (e==a ∧ state≠Rest)（不再依赖 fb_ball_gate）；
      编译 0 error + 注入 + 读图核验（Rest 防呆/瞬移门不受影响）——R0 注入 SHA 1898c6ae…，读图全绿
- [x] 近距一轮双详情日志：cast Hz / P 发送 Hz / apply Hz / cast gap 中位 / 送达中位 表，
      与票 13 基线（3125/3127）对照——R0-R2 三轮（3129/3130/3131）完成
- [x] dt 配套实验（0.1 附近 2~3 档）：模拟时间流速 = apply Hz × dt 是否 ≈1.0——0.1/0.12 两档
- [x] 结论落票：**E2 不作 16 正式选型（判负）**：apply 4.6→7.5-8.5Hz（+63-85%）但用户手感无差
      + 服务端负载超限被踢（详情 f21 2.0MB/s 级）+ 闭环锁步天花板 ~8Hz 触不到 20Hz 同步目标
      → 回退 E1（416bd420…b086 双 SHA）+ fb-phys.ts 还原 HEAD；代码归档
      `.scratch/football-v2/archives/2026-09-03-e2/`；主线转票 14（原生写通道破锁步）

## 执行备注（首查基线核对，组收口记录）
- 提交基线：HEAD=b1fd6a0（git log --oneline -3: b1fd6a0 票17立项 / 61e775c 票13收口 / 9ec3169），与 handoff §1 期望一致，未前移
- 地图双 SHA：Save 与 Temp 一致 = `416bd420a9e073b7c62b763959ed5ca2936ca5307f3e0d0516a29436f2b3b086`
  （1073741908.gil @ BeyondLocal/110170759/）
- 变量现值（球实体 1077936135）：fb_p_dt=0.11999999731779099(≈0.12 ✓) / fb_p_drive=0.18000000715255737(≈0.18 ✓) / fb_p_slide_enter=9(=9 ✓) / fb_test_mode=1(=1 ✓)——全符合 handoff
- 1830 图：`_GSTS_fbServer` id=1073741830 nodes=267 scope=main ✓
- 工作区说明：`M examples/football/src-fb/fb-phys.ts` = 本会话票17 E2 计划内改动（用户裁决保留，例外解释）；其余 M/?? = handoff §2/§5 预告平行 agent 脏区，未读未碰未提交
