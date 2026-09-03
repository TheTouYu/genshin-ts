# 进度记录 — 真实足球

## 最近轮次

- 2026-09-03（**票 14 R1 收口（正向：原生写通道锁步已破）**；地图 SHA 0a2955de，注入 6 ok/0 fail）：
  - **判据 B 达成**：信号到达 15.0/s 中位 + HP 事件 776/776 全到 15/s——>8Hz 打破锁步、达单造物节流顶
    （基线 apply 3.9/4.6Hz 的 3.3-3.9×、E2 锁步顶 1.8×）；判据 A=共享送达（68ms≈0.08s，吞吐不受限）。
  - **副判据全收**：技能变量跨施放保持 ✅（q_first 递增至 776）+ 同拍写读零延迟 ✅（路线一存储成立）；
    HP 值通道 0.5×758（扣血循环保空间成功）；球 HP 语义实证（recoverCreationSHp 球字面量直通）。
  - **通道结论**：路线一（技能变量自写自读+信号回传）全通；路线二·HP 全通；瞬移路待修
    （服务端轮询读错实体 1082130437=旧造物，新造物 ID 未回填）。
  - **新引擎事实**：服务端定时器 0.06s 请求实测 ~0.09s 粒度（轮询上限 11/s）——open-items 登记。
  - **下一步=15（时间预算预测重发）**；14 遗留小轮（CREATION1 实体修正+2 造物堆率验 20Hz 29-30/s 理论）
    可并入 16 选型前置。产物：issues/14-{research,latency,design,criteria,final}·md 五件套。


- 2026-09-03（**R3 06 收口（复测通过+3104 判读量化）+ 新票 10/11/12 立项**；地图 SHA a868412e，commit 3024e85 + 收口 commit）：
  - **用户复测通过**（进图自动链+九选项 1..8；选项 6 按两次；tab9 复位未手动按，自动链 RESET 段覆盖语义）。
  - **3104 判读量化**（f22 秒级时间轴 + mirror 透视表）：种子落体 apex 递减 1.14→0.32 ✓；K1 快踢 (24.5,2,0)=**46.7m 滑滚停、0 可见弹跳**（vy=2 在 0.2s 步长第一拍即被重力吃平——预期句修正，演出参数归票 12）；K2 斜射 apex≈1.4m、两跳后 45m 停；K3 侧旋 −Z 方向正确、15m 处横偏 2.9m 入带 / 20m 处 ≈5.0m 边界（离散下首落提前至 ~19m，测点恰逢落地反弹——锚点协议归票 12）；K4 8m/s 停距 **8.70m**（8~11m 张力坐实 → 编辑器热调 fb_p_slide_enter 4.5→9 后重测，免注入）；踢球 tab→ack 全同秒（≤1s 分辨率，目视无延迟感）；六态序列全对、无瞬移、fb:goal 0。
  - **新发现问题（移交票 10）**：tab7(123s)→epoch126 撕裂风暴 ~3-4s 冻结（rec8941..9227，看门狗只重发 sum+epoch 不重写载荷，tab8 覆盖恢复）；wdgate 22 次（gate 开 ≥4s 无有效回传，造物远距断流/拍丢失候选）。
  - **用户新需求立项**：10=卡顿排查（撕裂风暴/定时器抖动 vs 运动器时长/远距断流三候选）；11=落地摩擦改自旋（PORTING-MAP §3 #3——弹跳压力→摩擦→ω 真实变化）；12=演出增强（开局 ~2s 进入、更多冲量类型与运动中追加冲量组合段、锚点协议修正）。
  - **下一步=10 卡顿排查**（11/12 可并行；07 R4 顺延）。

- 2026-09-03（**R2.4 全链注入完成（票 04 收口）**：用户架构评审两轮 + 确认注入 ok 4/0 + 注入后全套核验；地图 SHA 438c2bcf→**958a4020** Temp 双 SHA；下一步=05 用户复测）：
  - **用户架构评审定案两条**：①逻辑真相/渲染呈现分层确认——引擎运动器即持续渲染层（60fps 自插值），重定目标挂采纳信号（最新鲜零采样抖动），独立渲染定时器留作 10Hz+ 限频开关；**逻辑帧率瓶颈=环路延迟（估 ~150ms 未实测），0.2s 基线先行，05 日志量出延迟后两分钟小轮升 10Hz**（beat 0.1/DRIVE 0.12~0.15 重编译 + dt/kw_air 0.980391/kw_gnd 0.943875/bounce_vy 0.5 编辑器热调）。②**fb_drive 补 fb_spin 旋转设备**（用户指正"位置和旋转必须都挂载"）：世界自旋轴经实体朝向转局部轴（v4 2832 教训 YXZ 内旋式）+INSTANT 瞬移不叠旋转（同链互断教训）+lockRotation=false 复位朝向（4c59554）。
  - **注入（用户确认制过门）**：`All injections done (ok 4, fail 0, total 4)` 整行核对全输出零 error——fb-phys 34→503、fb-server 79→172 主图+复合、status/decision 原样。
  - **注入后核验（读图红线全套）**：composite-refs --incoming **0 错**（30 impl 图 0 悬空，新 def 1610700040-43 落位，旧 v5 家族零影响）；scan-gil-var-pins 228 变量节点**全完整**；list 回读 fb-phys=503/_GSTS_fbPhysSkill、fb-server=172/_GSTS_fbServer；explain 执行流与源码意图一致（入口→tick/eEq 物化→seqlock→ack→19 参数链→门柱五连→墙四连→8 信号节点）；Temp 手动同步 cmp 逐字节一致 **958a4020**。
  - **顺手回填**：注入流程重提取 signals.ts（+fb_ball_state 6 参定义，01 票注册后本地资源文件首次同步）。
  - **下一步 R2.5（票 05）**：用户复测——进对图 1073741908/重载/详情日志只开 1082130433；主验收任意冲量全程 + 校准锚点 + 负载锚点；协议与四层签名排查序在 05 票内。
- 2026-09-03（**R2.4 注入前全链核验（票 04 前半）+ 复合 def ID 冲突修复；停在注入确认门**）：
  - 全绿项：build 0 error；sim **31/31 PASS**；主配置全图编译 0 error；fb-phys 断言 42/42 复过 + fb-server 16/16（内容零变化）；**.gil 变量注册表 fb_p_* 19/19 对照 PORTING-MAP**（float32 形态精确命中）+ 镜像 11/gate 初始 0 + fb_ball_state 6 参 vec3 注册表在位；挂载互斥盘点=球实体五图（旧四图静止无 loop，v5 基线）。
  - **注入预检逮住真问题（composite-refs --incoming）**：fb-server 四复合默认 def ID 1610700000..03 会覆盖地图旧 v5 家族 def（dribble_field_get_role/ball_render_frame/ball_render_halt），残留复合 ball_dribble_decide(_atomic) 引用 → 类型错位=拒载（08-30 事故模式）。修复=defineComposite 显式 id **1610700040..43**（目录占用 0..32；impl 1610710040..43 同空闲；commit e3782a5 零行为变化）。复查覆盖冲突清零，剩余 4 条「注入后缺失」=新 def 待落位正常态。
  - 注入清单已展示（fb-phys 34→503 / fb-server 79→222 展开 / status+decision 原样；前置 SHA 438c2bcf Temp 已同步）——**待用户确认后执行**，注入后一条龙核验（整段输出/composite-refs 复查/var-pins/.gil 定点回读/Temp 双 SHA）。
  - 05 复测协议已备好（票 05 文件：会话自动链/观察要点/四层签名排查序/已知张力预告）。
- 2026-09-03（**重建 v2 R2.3 fb-phys 扩建（票 03）：六态物理客户端半边交付**；编译 0 error、断言门禁 42/42、执行流健康全过；内容注入归 04 票，游戏行为层零验证）：
  - **交付（34→503 节点，预估带 850~1250 之下——如实入账；≤2000 红线余量 75%）**：①拍门（gate=1 ∧ epoch==ack 才计算——防任务在途时旧镜像计算顶掉任务回传）；②球寻址 E5 主链 getSelfEntity→fb_ball_entity→球变量（观测链降级：getEntityType 客户端 f 面无此方法→位置对账 fb_echo tag='e5' 回传 mm 差）；③镜像 11+tick 二读防撕裂（撕裂→任务拍 tearE 不 ack 交看门狗重提交/拍门拍 'T' 不应用重算）+参数 19 当拍物化（不变量 1）；④任务三分支：KICK（vel/spin 覆盖）、RESET（pos/vel/state 覆盖+spin 清零）、未知类型跳过应用仍 ack（02 契约）；**ack 延迟到镜像一致后**（防丢任务闭环设计）；⑤六态积分单拍闭式：飞行（重力+KD·|v|v+KM·ω×v+kw_air）/地面（滑滚同构、减速率按态选择、自旋收敛纯滚目标+y 独立 kw_gnd）/门柱×2+横梁+网+四面墙+地面反弹/分类器（停4>弹1>空0>滑入2>滑滞回>滚3，sim 枚举）；⑥回传 'P'（base_tick=镜像 tick）+E5 观测。
  - **结构层核验（decode-gia 全对账）**：断言门禁 **42/42**（str：P/T/e5/ok×2/tearE×2/tearH+fb_ball_gate/tick×2/entity+fb_p_* 19+fb_epoch×2/ack/sum/t1..t8；float：52.5×2/3.6×4/2.5×4/1000×13/-55×4/60×4——**图内零物理参数字面量**，全部走变量）；执行流：入口 200042 单源、0 环 0 不可达、8 个多入边全为互斥 else 链合法汇流（goal 五连写汇流/墙分支缝/顺序链）、ack(120)→P(494)→E5(500) 执行序断言过；TS 源码零 +=、min/max 对称式（max(s,0)=(s+|s|)/2）、本图无复合无 outflows 义务。
  - **已知标定张力（05 收证口径）**：8m/s 平踢按现参数（slide_enter 4.5/slide_decel 4.41）滚停 ≈8~11m < §7 校准带 15~35m（PORTING-MAP #2 slip 判据 R4 才上）；复测若失准编辑器热调 fb_p_slide_enter（→9 平踢纯滚 32m 入带）即时生效。另备案：fb_drive 无自旋设备（“旋转可见”依赖球 basicMotion 自转或补运动器）、vec3 信号参数运行时行为、帧数实测——皆 05 游戏内收证。
  - **客户端面差异沉淀（编译坑规避实录）**：_3dVectorZoom(标量,向量) 与服务端 (向量,标量) **反序**；getEntityType 七段皆无；f.localVariable 支持 float/vec3/entity（物化通道）；dv/b2f 箭头助手跨分支闭包内联编译通过（×13 展开实证）。
  - **下一步 R2.4（票 04）**：build+sim 31 门+全链 decode+变量注册表初始值核对+确认制注入+读图核验+Temp 双 SHA；05 复测协议随后。
- 2026-09-03（**R2.2 补丁：fb_ball_state 信号形态修正——引擎参数上限 10 → 6 参 vec3 定稿**（用户知识输入）；编译 0 error、14 断言回读全过、地图 SHA 51f60721→**ecdd679c** Temp 双 SHA）：
  - **用户知识**：引擎信号参数上限=**10**；超限信号注册表可写入（工具 MAX_PARAMS=12 放行）但运行不可用。**首版实为 12 参**（str+int+9float+int——票 01"11 参"标签系计数笔误，编译器 schema 对照报"registered map has 12 param(s)"实证），用户"12 个超过了"计数正确。
  - **定稿方案（用户建议）**：浮点九连合并 vec3 → `(tag:str, tick:int, pos:vec3, vel:vec3, spin:vec3, state:int)` **6 参**。ID 774/775/776 保号原位 update（同型 vec3×3/int×2 经 e231402 共享槽去重生成器落地）；消费端 fb-server onSignal 改 split3dVector 拆分量（+3 节点），fbDrive/fbTeleport 改 pos:vec3 直传（各 -1 节点），镜像 11 标量变量**不动**（球实体状态容器结构稳定）。
  - **验证（结构层）**：编译 0 error（编译器信号 schema fail-closed 对照新注册表通过——修正前曾以 `signal schema mismatch` 拦住 6 参消费 vs 12 参旧表，保护机制实测有效）；decode-gia 新扫描器 14 断言全过；主图 169→172、复合展开 223≤2000；执行边无重复入边无环。候选零改动验证（挂载/图内容 CMP-SAME，信号 diff 仅 fb_ball_state 一条）→ 写后 SHA=候选 → Temp 双 SHA。
  - **幸运窗口**：fb_ball_state 零已注入消费者（旧 fb-server 只监听 fb_echo），原位改形态无兼容包袱；03 票客户端半边未开写零返工。**vec3 信号参数运行时行为未游戏验证**（04/05 顺带收证；注册表有单 vec3 参信号 football_push 先例）。
  - **知识更正落盘**：signals.md 新增「信号参数数量上限与超限合并」节（含待澄清：官方「绘制圆弧」12 参与上限 10 关系→影响 CLI MAX_PARAMS 是否收紧）；R2-DESIGN §5 定稿表重写；BOARD/票 01（追加修正注）/票 02 备注契约更新；client 技能矩阵行更正。
  - **下一步不变 R2.3（票 03）**：fb-phys 扩建——回传打包按新 6 参契约 `sendSignalToServerNodeGraph(fb_ball_state, 'P', tick, posVec, velVec, spinVec, state)`。
- 2026-09-03（**重建 v2 R2.2 fb-server 扩建（票 02）：T3 握手节拍服务端半边交付 + 挪挂球实体**；编译 0 error、decode-gia 结构核验通过、地图 SHA 4ce87ed5→51f60721 Temp 双 SHA；内容注入归 04 票，游戏行为层零验证）：
  - **交付（79→主图 169+复合展开 222 节点，预算带 310~410 下沿以下——四复合去重邮箱连写，如实入账；≤2000 红线余量 89%）**：①会话种子=5 丘丘人实例逐个写 fb_ball_entity=球（def 1082130433=模板不写）+ 初始 RESET 进邮箱（t1=2，pos=(0,2.25,0)×1000，state=Airborne——§7 首行 2m 落体校准锚点，会话启动即自动全程跑链）；②fb_beat 0.2s loop 拍门置 gate=1（名单制第 3 名）+ fb_wd 并入 gate 死锁重开（gate=1→0，4s 粒度实现 0.8s 口径）+ REST 回传 stopTimer + **任务应用唤醒=ack 时读邮箱 t1、type∈{KICK,RESET} 才 startTimer**（dispatcher 垃圾测试载荷不唤醒，REST 期≈0）；③onSignal(fb_ball_state) first-wins（tag='P' ∧ base_tick==镜像 tick）→ fb_mirror_apply 复合 12 连写（镜像 11+gate=0，tick+1）+ 视觉驱动 + 进球判定；dup/tear 只打点。④进球简版：|px|>52.5 ∧ |pz|<3.66 ∧ py<2.5（fb_scored 去重）→ print 帧值 + RESET 回中圈 (0,0.25,0) Rest。
  - **视觉驱动两形态（防百米条纹，本轮设计新增）**：常态拍 fb_drive=速度(新位−实体当前位)/0.25s 同名 'fb_phys' 顶替（时长 0.25>拍距 0.2 防断档；区别于 2026-08-27 反例——彼处逻辑速度是真相禁反推，此处镜像即真相+实体位为插值起点）；**RESET 应用后首拍 fbTeleport INSTANT 瞬移**（瞬移门在 RESET 的 ack 置位、首个应用拍消费——直接投递时置位会在投递~应用间的普通拍误触发，时序铁证推理）。'fb_phys' 与旧图 'physics'/'spin' 不同名避同名级联。
  - **挪挂球实体完成**：候选两步（detach 1094713345→attach 1077936135）→ 节点图内容 CMP-SAME 零改动验证 → 两步 --write（自动备份×2）→ 写后=候选 SHA **51f60721** → Temp 双 SHA。**双向定时器串扰已核**：球实体五图（825/826/828/829/1830）分发全部名单制 else 空。旧四图零改动纪律保持。
  - **结构核验（decode-gia 全对账）**：监听双信号（772 fb_echo/775 fb_ball_state）；复合调用点×5（mail_post×2/mirror/drive/teleport，impl 17/12/5/2 节点）；常量落位=fb_beat×4/fb_dsp×2/fb_wd×2/fb_phys×2/fb_ball_entity×5/P/ok + 浮点 0.2×2/0.25/4.0×2/52.5/3.66/2.5 + int 2250/250（嵌套 bConcreteValue 双层值形态，首轮单层扫描器漏报——扫描器已修正认知）；执行边 75 条无重复入边无环。**尚未验证（诚实分层）**：注入后 .gil 回读/composite-refs --incoming/var-pins（04 票注入后跑）、游戏行为全层（04/05 票）。
  - **状态枚举定稿（03 票硬契约）**：0=Airborne 1=Bouncing 2=Sliding 3=Rolling 4=Rest 5=DribbleControlled（单一事实源 sim/src/state.ts；服务端按 Rest=4 停拍）。fb_sum 语义：dispatcher 测试载荷仍闭式 pe*8000+36，种子/进球走 Σtᵢ 投递时求值——03 求和校验式不变。详见 02 票执行备注（唤醒契约/消费契约/视觉归服务端/镜像写者唯一）。
  - **编译坑（已回票备注）**：entity() 必须接字面量——数组索引 ENTS[i] 被 TS→GS 改写成运行时列表取值节点，`Generic parameter not matched` 编译失败；编译命令=`node ./bin/gsts.mjs -c examples/football/gsts.fb-client.config.ts --noinject`（**dev 子命令=watch 挂死勿用；build 子命令不存在**，用户当轮指正）。
  - **下一步 R2.3（票 03）**：fb-phys 34→850~1250 扩建——拍门/球寻址/镜像读/参数组读取物化/任务应用（RESET 解码+未知类型跳过仍 ack）/六态积分（sim 单拍移植，同枚举）/回传打包 fb_ball_state('P', base_tick, ...)；完成后 04 票全链核验+注入。
- 2026-09-03（**重建 v2 R2.1 资产注册（票 01，两段式）**：fb_ball_state 信号 + 球实体状态容器 31 变量 + 丘丘人球引用落图；终版地图 SHA 4ce87ed5，Temp 双 SHA，六图零改动；R2.2 可开写）：
  - **信号**：`fb_ball_state` 11 参主案——(tag:str, tick:int, 9×float, state:int)，send/monitor/server=**1610612774/775/776**，builtin 布局无 donor。降级链未动用：donor 扫描（全库 117 信号）float 最多仅 4 参，主案被**工具**而非引擎卡住——两处工具债当轮偿还：①CLI MAX_PARAMS 9→12（b6cf894，官方「绘制圆弧」12 参背书）；②非 str 同型重复 fail-closed 解除（e231402，四轮编辑器差分"引擎不校验 pin 值、n3 field2=参数全局序号"+dedupeByPins）。E3 游戏内终验（float 信号端到端）并入 R2.3/R2.5。
  - **挂载定案（用户三轮修正裁决，推翻 R2-DESIGN §4 挂玩家实体——多人 1~8 不定逐副本维护不合理）**：**球实体 1077936135 = 唯一状态容器**（fb_ball_gate + 镜像 11 + fb_p_* 19 参数含 PORTING-MAP 定稿值，一次 --vars 31 个写入；服务端图挂球 getSelfEntity 直写=v4 成熟先例，02 票 fb-server 挪挂球）；**丘丘人 def 1082130433 + 5 实体 437..441 各带 fb_ball_entity:entity=0**（球引用，运行时 fb-server 会话种子逐实体写；fb-phys 读链 getSelfEntity→球引用→球变量=E5 主链原样）；玩家九副本零 fb_ball*（E1 寄存器 11 个保留）。§4"镜像组 12"系计数笔误（名字清单实 11），已备案。
  - **写回两轮**：首轮 11 步（挂玩家九副本，安全门用户确认）→ 用户挂载修正 → **备份恢复**（最早备份=写前原状 a0dae9e5，恢复后核验九副本/球归零、E1 完好、信号回 11）→ 终版候选链 8 步全量回读 → 8 步 CLI --write → 写后 SHA=候选 **4ce87ed5** → Temp 双 SHA。**六图零改动**（`node-graphs read --json` 内容摘要排除源路径字段，写前备份 vs 写后逐一一致；中途踩坑：JSON 含 gil 路径字段，不排除会误报差异）。
  - **vec3 镜像化议题（用户提议，已评估）**：R2 按标量定稿走（float 变量读已验 E1/1915，vec3 客户端读无已验记录），vec3 读并入 03 票顺带验证，验过后 R3+ 再迁移；fb_p_* 无向量语义+编辑器一行一参数调参体验，维持标量。
  - **CLI 经验**：`node ./bin/gsts.mjs maps`=地图定位正道（游戏目录 /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/<uid>/Beyond_Local_Save_Level）；tsx 沙箱故障时 bin 通道是替代路径；--vars entity 型必须带值 `name:entity=0`；**批量撤销已写回内容优先用最早备份恢复**（.gsts/backups 第一个时间戳=写前原状），别手写 wire 删除脚本（本轮教训：脚本驯了两轮未成，恢复路径 1 分钟搞定）；CLI 变量操作无删除命令（全 upsert）。
  - **下一步 R2.2（票 02）**：fb-server 扩建并挪挂球实体——会话种子（fb_ball_entity 逐丘丘人写+初始 RESET 任务）+ beat 定时器链 + onSignal(fb_ball_state) first-wins 提交（球 31 变量写+预测式运动器）+ 进球判定简版。
- 2026-09-02 深夜（**重建 v2 R2 第 0 轮：设计稿+三前置收口**，交付 `R2-DESIGN.md`，零代码零注入，R2.1 待执行）：
  - **新静态判据（决定节拍机制）**：`getCurrentClientTime` 仅在 character_skill/character_control_skill/bool_filter/int_filter 四段声明，**creation_skill(20008) 段无** → 客户端时间戳降频不可用 → 节拍三候选（T1 常驻门/T2 自速 dt 回写/T3 活动期握手门）收敛 **T3 主案**：服务端 fb_beat 0.2s loop 仅球活动期运行置 gate=1 → 客户端 15Hz 拍读 gate 开才积分（DT 固定 0.2s）→ 回传 → 服务端 first-wins（base_tick==镜像 tick）应用+关门+挂运动器（预测式插值）；REST stopTimer 保静止零定时器；看门狗防 gate 死锁；多造物并发与 E1 收口同构。服务端运动期负载预估 ~750 帧/s（旧 ~6900，降 ~89%）。
  - **用户五输入（定性级，已回灌设计稿 §0.4）**：①运动器（加速度/加旋转）**仅服务端有节点**→(b) 客户端直驱判死关闭（反证口随之关闭）；②信号参数支持完善→E3 降级顺手验证；③旧架构 0.5s/0.2s 低频纯为压日志洪泛非物理需要→T3 服务端 5Hz 轻门可承受；④R4 前瞻：触球判定移客户端（15Hz+ 采样）；⑤**物理参数一律挂球实体自定义变量+初始值**（fb_p_* 19 个，两端可拿+编辑器边测边调即时生效，PARAM 任务通道降级预留）。
  - **裁决定案（用户 2026-09-02 夜拍板）**：A=ROLL_DECEL **1.0**（sim 基准）；B=带球参数**不继承 v4 调优值**（R4 按 PORTING-MAP §1.5 连续速度控制器范式重定）；**跳过独立实验轮直接 R2.1**（E3/E5 并入正式实施顺带验证——镜像组 12 变量主案挂玩家实体（owner 链已验），E5 风险归零为零阻塞观测链）。
  - **设计稿要点**：fb-phys 34→**850~1250** 节点（9 模块：拍门/球寻址观测/镜像读/参数组读取物化/任务应用/六态积分/回传打包）；fb-server 79→**310~410**（会话种子/beat 链/onSignal 提交/进球判定简版）；载荷 fb_t1..t8 三类型（KICK/RESET/PARAM 预留）；回传信号 fb_ball_state 三档形态（float 11 参主案→int 定点→拆双信号）；参数 19 项=PORTING-MAP 定稿值落球实体变量初始值（核验口径从 decode-gia 常量扫描改为 .gil 变量注册表初始值核验）。
  - **环境故障记录（未解决，R2.1 前必须处理）**：本 DSH 会话 bash 沙箱下 `npx tsx`/`node --import tsx` 跑 gsts CLI 均 `Cannot resolve tsconfig at path: /home/h/tsconfig.tsx.json`——node 进程内 env(TSX_TSCONFIG_PATH 绝对路径正确)+cwd(仓库根)已验证无误，tsx loader 仍按 /home/h 解析相对名；推断沙箱 hook 干扰，待试 npm scripts 通道或 `npm run build` 后走 `node dist/cli/gsts.js`。
  - **下一步 R2.1**：修 CLI 通道 → donor 静态扫描（1916 优先）→ fb_ball_state 信号注册（float 多参主案）+ 变量预注册（玩家实体 +gate/entity/镜像 12；球实体参数 19 含初始值）→ SHA 锁定→候选→回读→写回→Temp 双 SHA→报告。
- 2026-09-02·夜（**E1 客户端算力通路游戏内验证收口**，日志 3087/3088/3089 三会话；E2 定论不保持）：
  - **四层签名结果**：①fb:armed ✅；②f8=4194308 客户端记录 ✅（3089 会话 337 条/23s=**15.4/s 达标**；空转拍 450B×300 + 信号拍 ~2170B×37——seqlock 门空转成本极低）；③fb:ack ✅ 37/37 零丢失、e 严格递增、stale/tear/repub 全零（15Hz 轮询下每 epoch 1~2 回声=幂等 dup 无害）；④fb:cnt 恒 1 → **E2 定论：局部变量不跨技能施放保持**（每次施放=新图执行上下文，Get 重置默认值）——R2 物理移植走预案物理降频 5Hz，跨拍状态一律实体变量（客户端无 setCustomVariable，只能服务端单写者）。
  - **距离节流实证（用户 2026-09-02 补充，已回灌技能；修正首报"详情日志拖帧"错误归因）**：玩家离造物远时引擎自动降低施放频率——3088（远）4~5/s vs 3089（用户把丘丘人拖近）15~16/s；15~16/s 是**近距离上限**，部署时造物须放玩家活动范围内。
  - **日志侧新知识**：客户端记录需按图开详情日志（只开目标 20008 图；缺席≠未执行，先看服务端 f22/onSignal 间接证据）——已回灌 debug-log-investigator+debug-log-format.md（553ac5c）与 client-nodegraph 技能（1481218）。
  - **E1 状态：收口**。下一步 R2 物理移植（REBUILD-V2-PLAN；裁决点 A/B 仍待用户）。
- 2026-09-02（**客户端算力最小通路 E1 配置+注入 4/4 完成**，REBUILD-V2-PLAN R1 主线，未做物理移植，待用户编辑器配置+日志验证）：
  - **资产全链**（全部新 ID，旧四图未动）：CLI 写回 1908 七项——信号 fb_echo(tag:str,e:int,c:int)=1610612771/772/773（内置三参布局，无需 donor）；客户端图 1082130433(fb-phys,20008)/1082130434(fb-status,20009)/**1082130435(fb-decision,20007)**；服务端 fb-server=1073741830 挂关卡实体 1094713345；技能配置 1191182337（28 自定义造物+瞬发，body-78-f4 绑 433）；寄存器 fb_epoch/fb_ack/fb_sum/fb_t1..t8（11 个 int，玩家模板实体 1086324737，单副本边界=多人需逐副本同步，E1 单人够用）。
  - **源码与产物**：`src-fb/` 五件套（照抄 zt-lane 缩比 8 载荷+E2 计数器 fb_tick——单名局部变量 tick.set(tick.value+1n)，编译产物 Get/Set 执行序已断言）+ `gsts.fb-client.config.ts`（隔离编译，dist-fb/）。节点预算：fb-phys 34+fb-status 2+fb-server 79+fb-decision 2=117 << 2000。
  - **20007 CLI 接入**（顺手闭环用户早前教学）：GRAPH_TYPES 加行（folderId 58/typeValue 6600，自动节点与 20009 同族 200126/4000+f11）——1915 真实图 1082130438 逐字节同构验证（f11=`5a070801a206020801`）后 build+commit 1da3fae；client 技能三处"20007 建不了"旧文案已同步更新。
  - **核验（结构层）**：四图注入 ok 4/0；Temp 双 SHA 一致；composite-refs ×4 = 0 悬空；图清单回读节点数与编译产物一致；fb-phys wire 断言（入口 200042+8 载荷读+三 sendSignal(773)；fb-server onSignal(772) 监听+定时器名单制空分支）。
  - **待办两步**：①用户编辑器配造物 4 项（小体型模型+技能引用 CD 0.01s+忽略公共冷却+自主逻辑模板_1+决策图 1082130435 绑定）；②进图 1 分钟留 Beyond_Debug_Log 验四层签名：fb:armed → f8=4194308 → fb:ack → fb:cnt 逐拍 +1（E2 图变量跨拍保持=R1 最高风险点；失败兜底=物理降频 5Hz）。

- 2026-09-01（**重建 v2 R0 盘点与裁决**：客户端算力基座 + 球独立物理体，未动代码未动地图，交付 `REBUILD-V2-PLAN.md` 待用户裁决）：
  - **通读**：client-nodegraph-development 技能全文 / PROGRESS 近轮 / PORTING-MAP / 目录 AGENTS / retrospective-2026-08-31-compute-lane-sync（另补读 ARCHITECTURE-V5.md）。
  - **静态盘点（新证据）**：客户端图节点面（src/definitions/client_nodes.ts）**无** setCustomVariable / addBasicMotionDevice / setEntityLocation（有 getEntityLocation 只读、setLocalVariable、getControlMotorCurrentVelocity）→ ①(b) 客户端图直驱运动器**静态判死**（保留编辑器 10 秒差分反证口），视觉驱动收敛 (a) 回传-服务端挂运动器；②客户端球态必须图内自持（每拍读服务端变量 0~1s 复制延迟不可行）；③R4 玩家速度可客户端直取。
  - **交付四件**（REBUILD-V2-PLAN.md）：①退役 10 项/继承 16 项两清单（逐条注替代物与来源）；②架构骨架 v6（计算层 20008×15Hz/同步层 seqlock/真相层 fb-server；双通道意图分流=踢球走 20002 即时、缓变参数走 seqlock；两笔账 fb-phys 700~1100 节点、fb-server 500~800 均预算内；服务端帧负载预估降 75~90%）；③旧四图退役方案（改名 RETIRED-v6-+摘挂载与新图同批+活图盘点先行）；④用户编辑器一次性配置清单草稿。
  - **R1 实验设计**：E1 最小闭环（照抄 zaowu+zt-lane 模板）+ E2 图内变量跨拍保持（**最高风险未验点**，失败兜底=物理降频 5Hz）+ E3 float/多参信号验证 + E4 (a) 视觉链路端到端（15Hz vs 5Hz 降频对比）。
  - **用户输入（同日）**：客户端走造物路径运算 + **服务端把球实体引用写进造物实体变量** → 客户端 getSelfEntity 后读出引用即可查球位置/球变量。静态查证落地：getSelfEntity 在 20008 supported（官方样本背书）、queryEntityByGuid 在 20008 partial supported（备选路径）——骨架新增 §2.7-B'（实体寻址三路径，用户方案为主，新验证点=E5 entity 型变量 S 写 C 读）与 §2.7-B''（位置真相两模式：P1 自持+对账 vs P2 每拍读实体闭环反馈，P2 为用户方案推论=漂移结构性归零，E4 对比定产）；E4 扩为 P1/P2 对比。
  - **裁决点六项待用户拍板**：A ROLL_DECEL 1.0 vs 2.0（建议 1.0 sim 基准）；B 带球参数继承 v4 调优值（建议继承）；C 旧信号 def 保留（建议保留）；D 退役命名（RETIRED-v6-/*.v5.ts）；E 回传频率 15Hz 起步；F 两清单整体确认。确认后才进 R1。

- 2026-08-31（第三阶段 R4 手感三调，R3 复测反馈驱动，已注入+全核验，待用户复测）：
  - **用户反馈三点**：①推球感有了但滑动距离再稍稍增大；②滚停时间/距离再增加一点；③方向合成比例对调——位置（相对方向）0.7 / 玩家朝向 0.3（原参考版 0.7F/0.3Dn）。
  - **改动（5 常量 + 1 数据选择）**：①TOUCH_GAIN 1.6→**1.8** + CONV_C 1.5→**2.0**（surge 衰减放缓→分离/滑动距离加长）；②**新增 COAST_C=4.0**——刹车分支（target=0）收敛常数数据选择 cEff=CONV_C·drive+COAST_C·(1−drive)（3038 实测旧急刹 v=4 时 G=0.73 一拍砍 73% 把滑动掐死；大 C→缓刹，滑行距离约翻倍）；③ROLL_DECEL 3.0→**2.0**（物理链滚停 @3m/s 从 1s/1.5m→1.5s/2.25m）；④FWD_WEIGHT 0.7→**0.3** / REL_WEIGHT 0.3→**0.7**（位置拉引主导，球更被拉向脚下）。
  - **核验**：build 绿（0 error）；All GIA generated (2)；gia-verify-pin——0.3×2+0.7@compute（权重对调）、1.8@compute n23、2.0@tick n42、4.0@tick n44（cEff 链）；物理折叠 0.4=2.0×DT；源码一致性（driveF L212 先于 cEff L220）；注入 ok 2/0；Temp 双 SHA ee1f41a0；refs ×2 0 悬空；var-pins 全完整；真实 .gil 回读 0.699999988079071/字面量 2×2（compute）/tick 4 处 2|4/roll 链 0.4 折叠全在位。
  - **待用户复测**：①触球推球感（冲量 1.8× + 衰减放缓）与滑动距离（出区缓刹）；②脱手/踢后滚停时间距离；③带球方向跟手感（位置主导：球更容易回到脚下，玩家转向的即时带动变弱——若觉得"转身球跟不上"再回调 FWD_WEIGHT）。

- 2026-08-31（第三阶段 R3 触球冲量+脚跟死锁修复，日志 3038 铁证驱动，已注入+全核验，待用户复测）：
  - **日志 3038 取证（15s，触球段 rec218-248 / 尾段 rec538-586）**：①冲量弱实锤——触球拍 v=2.16 vs vP=4.87（44%）：v=1.2×k×vP，k=0.37（触球时球已贴脚 dist²=0.06 几何退化+侧向进入），且 vTarget 随玩家减速立刻跌、无保底；②滑差收敛**工作正常**（100%→65%→42%→18% 逐拍，ω 0→9.3 rad/s——"看不到滑动"根源是 v 太小不是 ω 链问题；此前会话疑"angVel 恒 0.2"是提取错参数列，日志纠错）；③**新 bug 脚跟死锁**——CARRIED+球身后 0.89m（fwd=−0.957）→ fwd 守卫关驱动+距离滞回关脱手 → 玩家跑球不动（R2 把脱手从"出牵引区"改成"仅>2m"时堵死了身后出路）；④信号无风暴（全程 2 次切换）。
  - **修复（用户确认 A+B+E）**：①TOUCH_GAIN=1.6 + TOUCH_MIN=3.0——compute 新增 touch 向量输出（dir×max(3.0, 1.6×vFinal)，max 无节点实现 (a+b+|a−b|)/2），tick 触球拍数据选择 conv·(1−e)+touch·e（瞬时超调仅一拍，后续拍 G 律收敛回 target，不叠加不越带越快）；②脱手判据恢复并联：carriedLost = CARRIED &&（dist²>4 ∥ fwd≤−0.3）持续 3 拍；③获得加前向门：state_possess_check 增 fwd>−0.3（球须在前方才可获得，消除 脱手→身后再获得 死循环；impl 7→12 节点）。
  - **核验**：build 绿；All GIA generated (2)；gia-verify-pin 常量落位（1.6@compute n23、3.0×2@n24/25 max 对、−0.3@possess n9）；源码一致性（touchX/Z 输出↔消费、gEff/cfPF 零残留、并联链完整）；注入 ok 2/0；Temp 双 SHA 115902b8；refs --incoming ×2=0 悬空；var-pins 全完整；parse --list 唯一 (1)=旧段良性；真实 .gil 回读 1.6/3×2/−0.30000001192092896/Logical OR 并联链全在位。
  - **待用户复测**：①慢走/站立触球也有可感知推球（保底 3 m/s）+冲刺触球冲量明显（≈2.6×旧值量级）；②触球滑动→纯滚过渡可见（v 大了滑差段自然显形）；③球到身后不再冻死（0.36s 后脱手成滚动态，转身再获得）；④连续带球回归：球速仍收敛 ≈玩家×1.2 不爬升。

- 2026-08-31（第三阶段 R2 续：**已注入 + 注入后全核验通过 + 三技能迭代**，待用户四点游戏复测）：
  - **注入链（用户确认后执行）**：①state_changed 正式注册进真实 1073741908（donor=rubik3x3_solve[1073741899.gil]，send/mon/srv=1610612753/754/755，与沙箱编译产物 ID 一致，备份在 .gsts/backups）；②重编译 All GIA generated (2)；③注入 **ok 2, fail 0**（game.gia+ dribble-field.gia）；④Temp 手动同步**双 SHA 一致 4d8a20ce**。
  - **注入后核验（Step 3.5 逐项勾对全过）**：refs --incoming ×2 = 0 悬空（仅文档化良性残留：跨 gia 双 def 家族 + phys_integrate(1) 旧段）；parse --list 无新增 (1)（唯一 = 08-30 记录的旧段）；scan-gil-var-pins 30 图 207 var-nodes 全完整（+2 = spinW/drivePrev）；真实 .gil 回读——监听信号节点（state_changed）在 _GSTS_dribble-field n10 ✓、state_commit 执行流 Double Branch→true:发送信号→Set图变量→Set实体变量（先发后写）✓、tick 写回链 ball_dropped→tmpDribbleVel→ballVx→ballVz→lostTicks→drivePrev + 设备 LinDev→RotDev→spinW ✓、常量 4/2.25/1.5/0.25/8.33/3/0.3499/0.15 全落位 ✓、possess_check 4.0/3.5 ✓、game 主图 Start Timer ×2 间隔 0.11999999731779099（=0.12 float32）✓。
  - **三技能迭代（本轮踩坑回灌，commit 见 git log）**：①gil-node-graph-reading——Step 3.6 新增「.gia 值定位与常量浮点形态速查」（0.12→0.11999… 字符串 grep 会 0 命中必须数值扫、decode-gia 与 parse --json 两套值键名、accessories def+impl 成对、信号三件套定位、connects 执行序判读），frontmatter 描述加"编译/注入后核验必须先加载本技能"（实证：不加载手写 JSON 探测浪费 6+ 轮）；②dsl-nodegraph-development——C1 后新增「信号工作流」节（两种注册、地图注册是编译硬前置、--map-id 不认 --config、重复非 str 参数需 donor+跨图找法、GSTS_LOCALLOW_DIR 沙箱通道、sc/cg/cc 命名撞车 TS2451）；③task-prompt-builder——陷阱清单加三条（前置硬条件必须命令级不能只提名词"当年的流程"、多图指代必须带 ID、核验标准与前置条件不脱节）。
  - **待用户四点复测**（留 Beyond_Debug_Log 供量化验收）：①状态：带球→脱脚→再接近循环干脆不粘滞（CARRIED↔ROLLING 无风暴）；②追球：球滑行减速后 2m 内自动接管（不再 10s 僵局）；③速度：持续带球球速稳定 ≈玩家×1.2（上限 1.44×vP），不再越带越快；④旋转：触球瞬间明显滑动→渐变纯滚→减速停止（滑差 |v|−ωR 从显著非零逐拍收敛，对比 R1 后的恒 0）。量化口径：接管距离分布 ≤2.0m 且球速 ≤3.5；state_changed 信号条数=状态切换次数；带球期 max 球速 ≤1.6×vP 峰值。
  - **遗留待办**：PKC 录入（信号注册工作流 clm + 浮点形态对照，本轮技能文件已承载、PKC 层待补）；冻结现象（设备排队 duty 1%）本轮未改设备机制，复测若仍在凭新旧日志单独立案；role 实体偶发跳变（3031 rec258→270）继续观察。

- 2026-08-31（第三阶段 R2 四点合一：状态信号化 + 获得放宽 + 速度非线性收敛 + 摩擦旋转累积，已实现+模型侧全核验，待用户确认注入）：
  - **改动六文件**：①signals.ts 注册 `state_changed(prev:int,next:int)`（donor=rubik3x3_solve[1073741899.gil]，双 int 布局；send/mon/srv=1610612753/754/755）；②state.ts stateCommit 信号化（读 prev→changed 分支→**先发信号后双写**，同态提交不发包=无重复风暴）+ CARRY_DIST2 2.25→**4.0**（2m）+ CARRY_SPEED 2.0→**3.5**；③game.ts HEARTBEAT 0.5→**0.12**；④physics.ts 三个 tick 裸提交对统一改走 stateCommit（物理链状态切换也发信号，FLY→FLY 同态占位不发包）；⑤composites/dribble-field.ts tick 重写：删节流链（sinceKick/canPulse/lastKickTick/tickCount 全套）与 lastSeenState 轮询复位链，速度律改 **v←v+(target−v)·G，G=d/(d+C)，C=1.5**（d 大快贴合/d 小无限逼近/恒<1 永不超调），进区上升沿（drivePrev 记忆）G:=1 全额设定=首冲量保持，出区 target=0 同式=摩擦刹车；脱脚改**滞回判据**（>2m 持续 3 拍才 drop，与获得 2m 构成施密特带，根除 CARRIED↔ROLLING 震荡）；**spinW 摩擦链**：新图变量 spinW(rad/s)，Δω=K_F·(v/R−ω)≡K_F·slip/R（K_F=0.35 凸组合收敛），roll_spin 复合改读 spinRad 状态量×180/π 喂设备（R1 的 |v|/R 直写被替代，tmpDribbleVel 快照 v 源保留）；⑥根图 dribble-field.ts：变量表 7 个（−lastSeenState/tickCount/lastKickTick，+spinW/drivePrev），新增 onSignal(state_changed) 监听——进场监护态（next∈{FREE,CARRIED}）记忆复位（ballVx/Vz/spinW/lostTicks/drivePrev 清零，重新接近必有滑动）。
  - **编译流程要点**：信号注册表从目标地图 .gil 读取——state_changed 必须先注册进 1073741908 才能编译（"signal is not registered in target map"）。本轮用 **GSTS_LOCALLOW_DIR 沙箱副本**（tmp/sig-sandbox，SHA 与真实地图一致 8ad13883）完成注册+编译+全核验，**未动真实游戏文件**；正式注册+注入待用户确认后执行（同 ball_dropped 08-30 流程）。
  - **模型侧核验全过**：npm run build 绿；足球配置 All GIA generated (2)；decode-gia 四项——①双信号三件套 def 在两 gia（45-47/8-10）+ dribble 主图 n10 监听节点（gid 1610612754，信号名 pin="state_changed"）+ state_commit impl n3 发送节点（gid 1610612753，wire 铁证 send→SetVar→SetVar 先发后写、prev←GetVar 读旧值）；②HEARTBEAT=0.12 主图两处（0.11999999731779099 浮点形态）+ possess_check impl n3=4.0/n5=3.5；③节流链 IR 字样 0/0/0+变量表无踪，G 链 Sub×2→CreateVec→V3Mod(d)→Add(d,1.5)→Div 落位，滞回链 Gt(dist2,4)+Add(+1)+Ge(3) 落位；④spinW 链 V3Mod(vh)→Div(0.25)→Sub(wRoll−spinW)→Mul(0.35)→Add→roll_spin 复合→RotDev(0.15) 全链在位，RAD2DEG(57.29578)×spinRad 设备入参在位。变量查重：7 变量精确匹配无重复（tsc 容忍重复键前科防了）。节点预算：game 729 + dribble-field 138 = 867 << 3000。
  - **待办**：用户确认 → 正式注册 state_changed 到真实 1073741908（同一 CLI，donor 同源）→ 重编译 → 注入 ok 2/0 → Temp 双 SHA → refs --incoming ×2 / parse --list / scan-gil-var-pins / 真实 .gil 回读四处改动点 → 用户四点复测（①状态干脆不粘滞 ②球滑行减速后 2m 内接管 ③持续带球球速稳定 ≈1.2×vP ④触球滑动→渐变纯滚）→ 留 Beyond_Debug_Log 做量化验收（滑差非零收敛/球速无爬升/接管距离 ≤2m/state_changed 计数=切换次数）。

- 2026-08-30 深夜（第三阶段 R1：旋转表达失真修复，已注入+全核验通过，待用户游戏复测）：
  - **改动（dribble-field.ts，单变量）**：spin 复合 vel 输入从 decayVx/decayVz 改为读 write-back 前物化快照 **tmpDribbleVel**（与线速度设备同源）→ ω=|v|/R 原样表达当前拍球速；设备机制（0.15s 同名顶替）未动，数值计算未动。
  - **核验链**：build 绿；根配置编译遇他人 lights-out 遗留错误（game-level1.ts:165 已记录），按足球专属配置编译 All GIA generated (2)；.gia 解码=spin vel ← #87 Create3DVector ← #78 Split ← #77 Get tmpDribbleVel，0.95 乘链不再喂 spin；注入 ok 2/0；Temp 同步双 SHA 9b1fc272；composite-refs --incoming 双 0 悬空；parse --list 无新增错位副本；scan-gil-var-pins 全完整；真实 .gil 回读 n88 roll_spin.vel ← n87 ← n78 ← n77 tmpDribbleVel 落位。
  - **待用户游戏核验**：对照足球_2 复测：①旋转是否还会突然停；②触球是否出现滑动→滚动的自然过渡（不再恒 5% 滑差）；③带球距离与卡顿现象留待后续轮次。
- 2026-08-30 深夜（第三阶段 R0 取证·四症状归因，**未动代码未注入**，日志 3028=21:58 最新）：
  - **取证范围**：日志 3028（999 记录/37s）全量帧表回放——270 条 dribble 记录逐帧对齐球位/玩家位/线速指令/旋转指令/设备 add→stop 配对/每秒负载。
  - **症状①异常卡顿（球瞬停）证据**：冻结窗 rec242-264（f3=11）：线速指令 1.95→1.17 m/s 连续供给，球位移仅 **0.002-0.004m/tick**（有效驱动 ≈1.3-3ms/拍，正常相 duty=1.32 ≈0.15s/tick 满效）。同签名第二次：rec872-898（f3=36）指令 4.19→2.04、位移 0.003-0.007。**注：冻结窗内 tick 在跑（276 帧/条完整记录），图逻辑没错，错在运动器未被引擎执行**。
  - **症状①根因（证据链）**：①【用户旁证·08-30 深夜：卡顿时游戏本体流畅，只有球停——排除引擎级停顿】f3=9+10 记录稀疏是运动器执行侧排队；恢复后循环定时器**追赶爆发**：f3=11 一秒内 13 条 dribble tick（标称 8.3/s），拍距被压缩；②设备 add→stop 间隔在此窗变长 **+21~+36 记录**（正常 +5~+7）→ 设备排队未执行、没有立即 stop 事件=不是"同 tick 替换杀死"而是**后到同名 add 顶掉了还没起跑的排队设备**（替换取消排队中设备不出 stop）；③窗尾 engine 追平：最后一台设备跑了满时长（rec264→299 位移 0.157m ≈1.2×0.15s ✓）→ ball_dropped（窗口期失区 3tick）→ ROLLING 物理链接管（rec269-271 加 physics+spin 0.2s）→ 球恢复移动。**结论=任务风险①立案：DEVICE_T=0.15>拍距0.12 的同名重叠在"压缩爆发"下成为排队设备的取消器**。
  - **症状②旋转停止证据+根因**：同冻结窗（rec246 帧[275] 旋转指令 403.6°/s=每拍应转 48°，实测 rotDelta≈1°/拍）→ 与①同根：每拍同名 角度 设备同样被顶掉，旋转随线速度一起冻结。
  - **症状③无滑动 + ④滑滚切换缺失**：相位 A 全段滑差 |v|−ω·R 恒为 **5.0%·v**（0.211→0.103 全程等比例，逐拍实测 0.211/0.200/0.190…）——自旋"滞后一拍"在编译图里没成立：spin 链在 write-back 后**重读新 ballVx 再乘 0.95**（rec165 帧[108-109] 旧值衰减→v_lin=2.88/2.78，帧[257-258] 对新值再乘 0.95=2.74/2.64）→ 双衰减，滑差恒定 5%、永不向纯滚收敛，滑动段根本不存在。**修法=R2：真滑差收敛模型（ω 按增益向纯滚收敛，PORTING-MAP 第3节 第2项前移），替代"滞后一拍"**。
  - **症状⑤带球距离**：相位 A 球-玩家距离 0.56→**3.61m**（rec200）；相位 B 0.62→**7.35m**（rec868）——SPEED_GAIN=1.2 脉冲 4.2m/s + 出区仅 0.95/tick 慢衰减（0.65/s）→ 球冲出 1.5m 区后长滑难停。目标 [0.25,0.8]m（sim C1 0.34~0.60）。**修法=R3：PULL_DIST2 2.25→0.64（0.8m）+ SPEED_GAIN 1.2→1.0 + 出区急停衰减（候选 0.9/tick）**。
  - **修复方案分级（待用户确认后逐轮进）**：R1 卡顿+旋转（同根）=**交替双设备名**（dribbleCtrlA/B + 角度A/B，tickCount 奇偶数据选择，+4~6 节点；3012 冲量链唯一名先例；比"等长 0.12"更强——证据显示压缩爆发时连标称拍距都被压缩）；R2 滑动=滑差收敛模型（+12~18 节点，图变量 ω 状态）；R3 距离=三常量；R4 A/B 终验；R5 回归主线。
  - **用户答复（08-30 深夜）**：①只有球停、游戏流畅（引擎级停顿排除，坐实运动器排队顶替）；②~④提问太技术化没看懂；⑤**参考版效果不错，它怎么做的，先借鉴**。
- **决策转向（用户拍板）：先按参考版逐项平替，再测再调**。参考版（docs/game-engine-knowledge/football-dribble-velocity-field.md 已逐节点核验）与我们现实现的三处结构偏离，正好逐条对上四症状（第二轮校准见下方轮次更新 v3）。
  ① **设备时长 0.12=拍距（不叠压）** vs 我们 0.15>0.12 ——参考版从不产生同名设备排队顶替（我们 R1 根因即此处长子设备）；
  ② **自旋直接按当前球速纯滚（omega=|v|/R，每拍重算）** vs 我们【滞后一拍】（编译成双衰减=5% 恒定滑差）——参考版高速触球的滑动感来自逐拍速度跳变+引擎设备插值，不靠自造状态；
  ③ **前后/左右分档调速表 k1/k2（5 档）** vs 我们连续斜坡——参考版侧面位只给 0.96 乘玩家速（球等玩家）、仅正前加速；我们的斜坡在侧面给 1.22 乘玩家速（球越带越远）。3016 三修曾删参考 clamp 是因慢走跟不上，那是调参问题不是结构问题，本次借结构、慢走位微调。
- **轮次更新 v6（用户终稿定调 08-30 深夜）：设备 API 调用模式 = 数值到视觉的表达层，不动；计算数值本身不打改，只修表达失真。**用户原话转述：只要按【0.12s 定时器 + 0.15s 同名运动器自动顶替】调用真实的施加物理效果 API，就能把逻辑计算出的连续变化数值【原样】表达成丝滑的视觉运动与旋转；问题出在表达层没有原样传数值。据此收敛为最小改法：①R1/R2 收回滑差状态机大改（+12~18 节点方案废止）——回到日志实锤：旋转设备收到的 omega 被多乘了一次 0.95（spin 在 write-back 后重读新 ballVx 再衰减，双衰减=恒 5% 滑差），修法=固定取值点（把当拍 v 物化到写回前，omega=v/R 原样入设备）；这样触球瞬间 v 跳上去、omega 仍是上拍慢值→自动滑动；次拍 omega 跟新 v→自动收敛纯滚，与用户物理模型完全一致，数值计算一律不改。②R3 仅恢复参考 k1/k2 档位数值（球等人），其余不动。③冻结窗的设备排队现象保留观察，不在本轮改任何设备机制。①机制维持：0.12s 定时器触发 + 0.15s（大于拍距）同名运动器自动顶替 = 丝滑保证，DEVICE_T/命名/定时器一律不改；②用户物理模型（原话确认）：触球瞬间线速度大于切线速度 omega·R → 滑动，地面摩擦力拉 v 降、omega 升，渐进纯滚后停——这就是 R2 的内容；③顺滑前提转述为用户验收标准：计算出来的【速度和旋转】都必须丝滑。因此三个轮次全部落在计算侧，不碰任何设备机制。用户原话定调：丝滑很简单——每 0.12s 定时器触发就加一个 0.15s（大于拍距）的同名运动器，同名自动顶替即保证丝滑，**前提 = 计算出来的旋转和速度本身要丝滑**。因此：DEVICE_T=0.15 保留、同名 dribbleCtrl/角度 保留、0.12s loop 定时器保留，（v3 里改 0.12 等长与 A/B 交替名两个方案全部作废）；修复落点全部转移到计算侧：①速度丝滑——区内脉冲不得瞬间跳变（现在的 v←0.95v+velDir 拍级跳变）；②旋转丝滑——按用户物理：触球瞬间 v 大于 omega·R 则滑，摩擦把 omega 拉向纯滚（滑差由大变小，不是瞬间纯滚也不是恒 5%），即 PORTING-MAP 3 第2项滑差滞回前移；③距离——恢复参考 k1/k2 分档表。日志冻结窗（指令连续、球不动）如实保留：按用户方向先做完计算侧丝滑三轮，若冻结仍在再单独开设备执行调查（不预设结论）。


- 2026-08-31（第二阶段 R1 反馈六修·丝滑三件套：脉冲节流 + 设备重叠 + 自旋滞后）：
  - **用户 A/B 对比足球_2 结论**：触球瞬间给速太快；高速触球应有相对滑动；每次速度要有变化才丝滑；**设备时长应略大于拍距**防断档瞬冻。
  - **本轮日志 3025 量化**：设备速度 max=**82.35 m/s**（均值 13.6）——上轮恢复了 v←0.95v+pulse 却没带配套**节流器**，区内每拍叠加平衡点=20×velDir（参考图 tickDiff≥3 才发完整脉冲，我拆了配套件之一）。
  - **参考图常量全提取**（足球带球逻辑.gia 145 节点 pin 级）：0.7/0.3、0.95、1.2、2.25、-0.3、tickDiff≥3、k 表 0.1~1.2 全对上文档；设备时长 0.12=拍距（其 tick 链轻，等长即可；我们链重需重叠余量）。
  - **修复三件套（dribble-field.ts）**：①PULSE_EVERY_TICKS=3 节流（tickCount/lastKickTick 记账，脉冲-衰减锯齿=速度自然变化+限幅）；②DEVICE_T=0.15>0.12 相邻设备重叠 25%（消灭调度抖动安全间隙=瞬冻）；③自旋用脉冲前衰减速度算 ω（触球滑动→渐追纯滚）。顺手修根图 lostTicks 重复声明（上轮 D1 编辑残留，tsc 竟容忍重复键——需警惕）。
  - **核验**：build 绿；编译过；.gia 回读 0.15×2/0.12×1/节流变量在场。**已注入（用户确认）：ok 2/0 + Temp 双 SHA 5c108312；refs×2 0 悬空/var-pins 全完整；目录 phys_integrate(1)=2000000000 旧段复用副本（08-30 文档化良性家族，非错位副本）。待用户复测丝滑度对照足球_2**。

- 2026-08-31（第二阶段 R1 反馈五修·带球**范式重设计**：连续速度控制器）：
  - **用户指点**：以参考图『足球地面运动』（足球_2 地图单节点图，解析在 docs/game-engine-knowledge/football-dribble-velocity-field.md，导出 .gia 145 节点已核）为诊断仪器找本质，不照抄。
  - **本质（3019 铁证：vP 正常 4.8~5.3、CARRIED 22 次、整场仅 8 个 dribbleCtrl 设备）**：我们=闸门式开关控制器——pull=false 分支**零设备**，而运动器是实体唯一运动来源→球一出 1.5m 牵引区即"断电死停"；参考=连续速度控制器，每拍无条件写设备（区内驱动/区外滑行），速度是带记忆的状态（脉冲+0.95 衰减），反馈=每拍实时几何无状态机延时。四轮 bug 全是这组不变量缺失的不同表象；我此前删"积分发散"叠加、删"压速"表都是在拆参考系统里配套工作的部件。
  - **重设计（dribble-field.ts 全重写，不变量①②③入注释）**：canDrive=state∈{FREE,CARRIED}（几何即门，心跳获得不再门控驱动→延时消除）；速度律 v←0.95v+(在区?velDir:0)；k(fwd) 连续坡度 0.1→1.2（自研形状）；custody 记忆复位（物理链监管归来清零）；设备供给=canDrive 期间每拍无条件 lin+spin；根图改 0.12s **loop 循环定时器**（弃自重启链与 _init）。SPEED_GAIN 回 1.2（乘性零对零）。脱脚语义保留（持续出区 3 tick→ball_dropped 交接滑行速度）。
  - **核验**：build 绿；编译过；.gia 回读 DAMP×2/K_MIN/1.2×2/TICK×3、主图 12→9 节点（自重启链删除）、start_timer loop 引脚 bEnum=1。**已注入（用户确认）：ok 2/0 + Temp 双 SHA 0e8c0206；refs×2 0 悬空/var-pins 全完整。待用户复测连续控制器手感**。

- 2026-08-31（第二阶段 R1 反馈四修·**本质级**：图变量与实体位置跨会话分歧——获得判定量的是幽灵球）：
  - **日志 3017 铁证（用户多速度靠近球，球全程不动）**：整场 0 次 state 写入、0 个运动器；心跳正常跑 108 次、获得判定在跑——但 ballPos 图变量 = (-41.34, 0.25, 56.27)，实体球 = (-42.27, 0.25, 50.19)，**分歧 6m**；玩家站真球上 dist²≈37、偶然走过幽灵附近 dist²=5.0，永远进不了 2.25 圈。地图文件声明默认 (0,0.25,0) 但运行态读出 (-41.34,56.27)——**图变量运行态跨会话持久**，与实体位置（同样持久）无任何同步机制。前三轮症状（偶尔动/窜出/不动）皆是这对分歧的不同表象。
  - **修复（game.ts）**：①whenEntityIsCreated 无条件 ballPos:=实体位置 + ballVel/ballSpin/scored 清零 + stateCommit(FREE)（_init 防重删除——标志持久化不可靠且同名定时器重启为替换语义）；②FREE 心跳每拍把 ballPos 拉回实体真实位置，获得判定用可见球位置。kickReset 复位本就写变量（无需改）。**已注入（用户确认）：ok 2/0 + Temp 双 SHA b6a0a489；核验 refs×2 0 悬空/var-pins 全完整/主图 75 节点含对账链（Get Entity Location×10）。待用户复测**。注意：球实体当前实际停在 (-42, 50) 角区——复测可先 tab9 复位回中。
  - **待 PKC 的本质规则**：运动器驱动实体的图，凡维护"位置变量"副本，必须在安全边界（会话启动/静止期）与实体位置对账，否则分歧累积后全部位置逻辑失效。

- 2026-08-31（第二阶段 R1 反馈三修：慢走/穿行球完全不动——参考版分段 clamp 压速）：
  - **日志 3016 铁证**：tmpDribbleVel 绝大多数 tick≈(0, 0.025, 0)（只剩贴地回拉 vy），偶发真实驱动（Z -3~-5.6=玩家跑动瞬间，k1k2=1.44@正前位）；dribbleCtrl 设备多数 (0,0,0)。CARRIED engage 6 次正常。
  - **根因**：参考版分段 clamp 表把非正前位球速压到 vP×0.32~0.4（慢走 1.2m/s→球 0.4m/s 追不上玩家→落身后→牵引断）；正前位又 ×1.44 窜出牵引区。注：站着碰撞球不动=设计内（球为运动学体仅运动器驱动；速度场输入=玩家速度，站定=0）。
  - **修复**：删 dribble_field_clamp 复合（含定义），vFinal = vP × SPEED_GAIN（牵引时球速=玩家速，方向合成 0.7F+0.3Dn 拢脚前）；超前引导留 R3 按 sim touchLeadSpeed 模型。**已注入（用户确认，793888f）：ok 2/0 + Temp 双 SHA 91880e4c；核验 composite-refs 双 incoming 0 悬空 / var-pins 全完整 / clamp 复合目录 0 残留（同 ID 覆盖清除，比预期干净）。待用户复测带球跟手性**。

- 2026-08-31（第二阶段 R1 反馈二修：带球"偶尔才动一下"根因——速度场积分发散 + 获得阈值过严）：