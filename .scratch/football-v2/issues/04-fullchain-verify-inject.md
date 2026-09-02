# 04 — 全链模型侧核验 + 注入

**What to build:** R2 两张扩建图与既有资产的全链合体核验与正式注入——所有模型侧证据层
（编译/解码/注入/读图）逐项绿灯后写入真实地图。做完本票，游戏文件层面 R2 完整就位，
只剩用户进图复测。

**Blocked by:** 02, 03

**Status:** ✅ done（2026-09-03；注入前用户架构评审补齐 fb_drive 旋转设备（4c59554）+
逻辑/渲染分层与 10Hz 升级路径定案（0.2s 基线先行、05 量环路延迟后热参升级）；
用户确认注入 → ok 4/fail 0；注入后全套核验过；地图 SHA 438c2bcf→**958a4020**
Temp 双 SHA 一致）

- [x] npm run build 0 error；npm run football:sim 31 门不回归（sim 是物理数学单一事实源）
  （build 0 error；sim **PASS 31 / FAIL 0 / 观察 1**）
- [x] 客户端图用 gsts.fb-client.config.ts 主配置全图编译（单 entry 必失败——编译前置铁律）
  （All GIA generated (4)，0 error）
- [x] decode-gia 结构核验：常量折叠形态数值扫（浮点 0.12→0.119999… 勿字符串 grep）；composite-refs 0 悬空；var-pins 完整
  （fb-phys 断言 42/42 + fb-server 断言 16/16（float32 形态数值扫）；**注入预检逮住真问题**：
  fb-server 复合默认 def ID 1610700000..03 覆盖旧 v5 家族 def → 类型错位拒载风险 →
  显式锚定 1610700040..43 修复（commit e3782a5，零行为变化），复查覆盖冲突清零；
  var-pins 于注入后跑）
- [x] .gil 变量注册表初始值核验：fb_p_* 19 项逐一对照 PORTING-MAP 定稿值
  （**19/19 全对**：ground_e 0.699999988079071/post_refl −1.7200000286102295/wall_e
  0.6499999761581421/slide_decel 4.409999847412109/ground_fx 0.8500000238418579/
  net_damp 0.25/bounce_vy 1/g −9.8100004196167/kd 0.013536999933421612/km
  0.008279000408947468/kw_air 0.9611660242080688/kw_gnd 0.8908990025520325/
  roll_decel 1/stop_speed 0.20000000298023224/slide_enter 4.5/slide_to_roll 2.5/
  roll_spin_gain 0.5/ball_r 0.25/dt 0.20000000298023224——float32 形态精确命中；
  镜像 11+gate 初始 0 ✓；信号 fb_ball_state 6 参 vec3 注册表在位 ✓）
- [x] 注入（**确认制**：注入清单先展示用户确认）→ 注入后回读真实 .gil 定点核验（执行流与源码意图一致——读图核验红线）
  （用户确认后执行：`All injections done (ok 4, fail 0, total 4)` 整行核对、全输出零 error；
  回读=fb-phys 503 节点/_GSTS_fbPhysSkill、fb-server 172 主图/_GSTS_fbServer；
  explain 执行流核对：入口→tick/eEq 物化→seqlock→ack→19 参数物化链→门柱五连→墙四连→8 信号节点，与源码意图一致；
  composite-refs --incoming 注入后复查 **0 错**（30 impl 图 0 悬空，新 def 1610700040-43 落位）；var-pins 228 节点全完整）
- [x] Temp 手动同步双 SHA 一致（README ⑥ 检查清单）（主图=Temp=**958a4020**，cmp 逐字节一致）
- [x] 球实体 1077936135 挂载互斥检查：旧图 825/828 仍挂球实体时新图不接管（双图同驱=双 loop 干扰铁律；正式接管在 08 退役轮同批执行——本轮以 825/828 当前静止无 loop 为前提，若盘点发现活 loop 先停下问用户）
  （挂载=825/826/828/829/1830 五图；旧四图 v5 静止零定时器基线+球当前 state=0/vel=0
  静止无活 loop；05 复测协议含「勿用旧操作台入口」防双驱提示）
- [x] 收轮：勾票+看板+PROGRESS「下一步=05」+精确 commit
