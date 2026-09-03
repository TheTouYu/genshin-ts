# 14 — 原生客户端写通道可行性原型（idea②）

**What to build:** 验证「客户端原生可写节点」能否成为比 P 信号更快/更直的写通道：客户端写完，
服务端（和后续读取方）能低延迟读到，不再受「读-算-寄-写」0.19s 单圈限制。

**Blocked by:** 13（先有基线数字做对照）

**Status:** ready-for-agent

官方节点盘点起点（20008 造物技能图执行节点，已查 official-guide-nodes-client.md）：
- 设置技能变量 / 增加技能变量值：技能变量配置ID + **float**（标量；3 个拼一向量需 3 个变量）
- 造物恢复生命值：**任意目标实体** + float 恢复量（球实体是否有 HP 组件、治疗修正/上限语义污染待验）
- 仇恨设置/增加：目标实体 + 数值（整数为主，语义污染重，float 支持待查）
- 造物转向指定朝向 / 复杂造物瞬移 / 定点位移：仅作用于造物自身，**不能直接移动球**（排除）
- 20008 查询库无「获取客户端时间」（影响 idea①，见票 15）

- [x] 最小注入原型（R1/3132 完成，**正向**：选 2~3 个候选（优先技能变量 + 造物恢复生命值），客户端写→服务端定时读回，
      端到端时延/可达频率对照基线（票 13 数字）
- [x] 球实体可写字段结论（R1 收证：能否挂/用 HP、技能变量归属（造物技能实例还是球实体）、
      服务端读路径（哪些图类型/节点能读到）
- [x] 产出：可行通道（R1 正向： + 向量映射方案（3×float 或 float 打包），或**否证**（复制通道同源/不可读/语义不可用）

## 执行备注

### 2026-09-03 · 状态首查 + 候选核对（调研小类）

- **状态首查（全过）**：双 SHA Save=Temp=`416bd420…b086`（=E2 回退基线）；球实体变量
  `fb_p_dt=0.12`/`fb_p_drive=0.18`（=E1 定稿）；挂载 1825/1828/1829/1830 不变。
- **候选核对表**：`.scratch/football-v2/issues/14-candidate-research.md`（3 候选×4 维度+证据行号）。
- **核心结论**：
  1. **技能变量**：客户端写+读闭环（`setSkillVariable`/`querySkillVariableValue` 在 20008 图族），
     但**服务端读回零路径确证**（服务端节点/事件/别名全零命中）→ 作为服务端读回通道判据 B 否证；
     归属=全局技能变量存储（系统菜单【技能变量管理】，非实体/非技能实例），前置=用户编辑器一次性创建。
  2. **HP 通道**：唯一双端闭环——客户端 `recoverCreationSHp(任意实体, float, bool字面量)` +
     服务端双读路径（轮询 `getObjectAttribute`→当前/上限 HP；事件 `whenHpIsRecovered`→实际恢复量）；
     语义污染：满血恢复量=0、单向、上限顶满（变体设计须配掉血循环/计数重建）。
  3. **球实体可写性**：组件槽仅 basicMotion+tabBar（战斗未装配≠不可用，用户口径）；物件实体天然带
     战斗属性面板（官方《基础战斗属性》）+用户确认球有生命值 → HP 理论可写可读，实测留游戏轮。
- **用户口径（两条）**：①工具链缺口可拆分补齐（官方有的都能支持）②组件=未装配、球有 HP。
- **附带发现（不扩散）**：技能变量全局存储可能跨施放保持（vs 20008 局部变量不跨施放）→ 票 15 潜力。

### 2026-09-03 · 资产注册与技能配置（大类 2 小类 1）

- **写回完成（5 步链，全部新增零修改）**：①fb-loop 图 **1082130436**（20008 占位）②fb-svlisten 图 **1073741831**（20000 占位）③信号 fb_sv_echo **777/778/779**（tag:str, e:int 免 donor）④变量 ×10 挂球实体（fb_sv_count_a/fb_sv_last_a/fb_tp_self_x: int；fb_tp_seen_x/y/z/ry/fb_hp_seen/fb_hp_evt_amt: float；fb_hp_evt_count: int）⑤技能配置 **1191182338** GSTS-fb-loop-exp（28 瞬发绑 1082130436）
- **候选链**：cand-graph1→graph2→sig→vars→f2 逐步 --output 回读验证后 --write；写后 SHA=最终候选 **5701f314…**，Temp 双 SHA 同步 ✅
- **备份**（.gsts/backups/ 5 个）：03-45-45-013 / 03-45-45-907 / 03-45-53-369 / 03-45-54-560 / 03-45-55-422
- **现网验证**：1191182337（fb-calc）与旧四图挂载零改动
- **分层（编辑器侧，用户操作）**：①技能变量管理创建 1 个 float→回填配置 ID ②放置新造物绑 GSTS-fb-loop-exp（决策层不动，默认执行技能 1；CD 0.01s+忽略公共冷却）——**用户方案：新造物零触碰现有 5 造物**，并行堆率=后续 +15/s/造物
- **触发口径（用户补充）**：造物 AI 自主持续触发，近距 ~15/s、远距 ~5/s

### 2026-09-03 · 实验图 DSL 编译（大类 2 小类 2）

- **编译 0 error 全链**（gsts.fb-client.config.ts --noinject，entries=src-fb 全 7 图）：
  fb-loop.gia(**1082130436**) + fb-svlisten.gia(**1073741831**) 产出；现网四图（fb-phys/fb-server/
  fb-status/fb-decision）重编译无回归；主配置 gsts.config.ts（src/ 旧四图）25 产物全 ok 零影响。
- **节点预算账**：fb-loop=26 节点、fb-svlisten=44 节点（IR JSON 计数；红线 <2000，余量 97.9%+）。
- **零 print**：两实验图 grep printString/f.print=0 命中（数据走变量+按图详情）。
- **编译门禁逮住并修复 5 处**（证据=编译报错逐条）：
  1. creation_skill 无 `%` 运算/无 moduloOperation → 瞬移位置改 **sin 编码** x=2·sin(0.3n)（有界往返，
     n 保持单调递增不影响 SVA 判据）
  2. football 本地 signals.ts 缺 fb_sv_echo（CLI register 只更新根仓库副本）→ 手工补 defineSignal
  3. `float()` 类构造器裸调报错（技能三-6 坑）→ 全部改数字字面量（fb-phys FIXK 先例）
  4. hpLoss 第 6 参枚举 damagePopUpType → DamagePopUpType.NoPopUp（无跳字，避免视觉污染）
  5. 服务端 getEntityLocationAndRotation 返回字段=rotate（非 rotation）→ 查签名修正
- **⚠️ 注入前必做**：CFG_X 占位 ID（1191182339n）回填用户真实技能变量配置 ID——未回填禁止注入
  （cfg 无效与「不保持」在 SVA 恒 1 上不可区分）。

### 2026-09-03 · decode 断言与读图核验（大类 2 小类 3）

- **decode 断言全过**（tools/decode-gia + gia-verify-pin + decode-gia-constant-scan.py 三工具）：
  - 节点数=IR 一致：fb-loop=26 / fb-svlisten=44；entries 数与源码一一对应（Set Custom Variable ×10
    =源码 10 调用点、Addition ×2、Assembly List ×3、Start Timer ×2 等逐项核对）
  - 关键写通道节点全在位：complex_creation_teleport/recover_creation_s_hp/set_skill_variable/
    query_skill_variable_value×2/向服务器发送信号×2(1610612779)/监听信号(1610612778)/
    When HP Is Recovered/Get Object Attribute×2/Lose HP/Recover HP Directly/
    Get Entity Location and Rotation/Query Entity by GUID×2
  - 常量/GUID/字符串 ALL PASS：0.5/2/0.3/9/100/0.06/1/0.1 浮点形态、CFG_X=1191182339×2 处、
    球 1077936135、造物 1082130437、SVA/SVT/fb_sv_poll/fb_hp_drain/fbx；信号三件套 777/778/779 两图在位
  - 变量名 pin 完整：fb-svl 10 个变量名全落盘（count 类 get+set=2、纯 set=1，与源码逐点吻合）
- **执行流健康**：fb-loop exec=5（六节点五边链：begins→set→teleport→recover→sendSVA→sendSVT）、
  fb-svl exec=17（created/timer/HP 事件/信号四入口链完整）；**0 环、0 同针脚多入边**（DFS 三色+入度）
- **排查记录**：自写扫描器两处"裁判=选手"坑（值嵌套 bFloat.val 子对象、kind 在 connects[].connect.kind）
  ——官方工具对照逮住，弃自写改技能沉淀脚本；"fb_tp_seen_x 期望 2"系断言笔误（SVT 写 fb_tp_self_x）
- **体积预算表**：fb-loop ≈1.3KB/拍（26/503×fb-phys 25KB 基准）×16/s≈21KB/s；fb-svl 轮询 16.7/s+
  事件+信号≈40-60KB/s；**峰值合计 <100KB/s（E2 踢出线 2MB/s 的 5%）**；详情分级=只开 fb-loop+
  fb-svlisten 两图（fb-phys/fb-server/旧四图全关）
- **收官补录**：①composite refs 干跑（注入前，两实验 .gia 对当前 .gil --incoming）=0 悬空 0 残留覆盖
  （两图无复合 def，注入后仍需对注入产物全量复跑）；②活动画像粗测方案=复测首轮日志落地后先跑
  gia_log_activity.py --graph 1082130436/1073741831 复核实际体积桶（对照 <100KB/s 预算），超标即降详情
  再续测；③fb-svlisten 挂载（attach 球实体）属大类 3「GIA 注入与图级核验」验收项（注入后一并核验 mounts）。

### 2026-09-03 · GIA 注入与图级核验（大类 3 小类 1）

- **cfg_x 回填**：真 ID **1207959553**（用户创建 5 个 1207959553~57，其余 4 个登记备用票 16 向量扩展）；
  重编译 25 ok；decode 复核 ID 落位 3 处（set×1+query×2=源码 3 参数点，bId 形态）。
- **注入前四件套**：①游戏会话退出（用户确认对话"注入"）②用户明确批准（同上）③备份（注入器+attach 各自动：
  .gsts/backups/ 04-15-22-768Z 等）④写前双 SHA=5701f314…（Save=Temp 已同步）。
- **注入**：批量 6 ok / 0 fail（fb 族既定流程，现网四图幂等重注入）；fb-loop→1082130436、fb-svlisten→1073741831。
- **挂载**：fb-svlisten attach 球实体（候选回读一致后 write，备份在案）——球=1825/1828/1829/1830/**1831**(_GSTS_fbSvlisten)。
- **注入后读图核验四项 0 错**：①composite refs ×2 --incoming=0 悬空 0 残留 ②var-pins=12 节点全部
  变量名 pin 完整（result: ok）③mounts=+1831 与设计一致 ④技能配置 1191182338↔1082130436 绑定在位。
- **写后 SHA=0a2955de35d79541…，Temp 双 SHA 同步一致** ✅。
- **移交用户编辑器步骤（复测前置）**：重载地图 → 放置新造物（绑 GSTS-fb-loop-exp，决策层不动执行技能 1，
  CD 0.01s+忽略公共冷却）→ 开 fb-loop+fb-svlisten 两图详情 → 进图近距跑 30~60s → 完全退出落盘。

### 2026-09-03 · 近距复测与日志落盘（大类 3 小类 2，复测轮 R1）

- **日志 3132**（2026-09-03_12-24-09，会话 53s，4382 条）：
  - fb-loop 客户端 **776 条**（f8=4194308 单实例恒定）≈**14.6 施放/s**（近距节流正常）
  - fb-svlisten 服务端 **3341 条** ≈63/s（轮询 16.7+信号 SVA/SVT ~29+HP 事件 ~14.6 加和吻合，三路活跃）
  - fb-server 265 条 0B（详情关闭，正常）
- **体积复核**：25+45=~70KB/s < 100KB/s 预算（2MB/s 踢出线的 3.5%），无踢出。
- **用户登记**：R1 按协议执行（重载/新造物/两图详情/近距 30-60s/完全退出），回复"好了"未报异常。
- 判据判读移交下一小类（3132 为判据数据源）。

### 2026-09-03 · 判据数据表判读（大类 3 小类 3，R1/3132）

- **判据数据表**：`14-criteria-data.md`（提取 TSV：analysis/3132-{extract,svl-extract}.tsx 可追溯）。
- **核心结论**：①信号到达 15.0/s 中位+HP 事件 776/776 全到 15/s——**双路 >8Hz 打破锁步、达 15Hz 单造物
  节流顶**（基线 3.9/4.6Hz 的 3.3-3.9×，E2 锁步顶的 1.8×）②判据 A：信号滞后中位 1 拍 68ms≈0.08s 常数
  （共享网络层，但吞吐不受限）③技能变量跨施放保持 ✅+同拍零延迟 ✅（路线一存储成立）④HP 恢复量
  0.5×758（值通道活）⑤轮询路读错实体（旧造物 ID），第二轮修；引擎定时器实测 ~0.09s 粒度上限 11/s。
- 20Hz 如实报：单造物不可达（15 顶）；2 造物 29-30/s 待第二轮。

### 2026-09-03 · 收口（R1 正向结论）

- 三 checkbox 勾选口径：①原型=三探针超集（瞬移+技能变量+HP），双路 15/s 打破锁步 ②球 HP 可写实证
  （recoverCreationSHp 球字面量 776 事件）、技能变量归属=全局存储、服务端读路径=事件/信号/轮询三路
  ③可行映射方案=3×float（用户备 5 cfg）+float 打包（SVT ×100 示范）+瞬移 6float（待实体修正）。
- **遗留（第二轮清单，见 14-final-report.md ③栏）**：服务端 CREATION1 回填新造物实体 ID（本轮读错实体）、
  2 造物堆率验 20Hz（29-30/s 理论）。最终报告：`14-final-report.md`；判据数据：`14-criteria-data.md`。
