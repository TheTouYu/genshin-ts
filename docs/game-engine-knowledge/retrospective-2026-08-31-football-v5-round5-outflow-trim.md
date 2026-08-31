# 复盘：足球 v5 第五轮——复合无 outflow 声明致注入器裁边断链（2026-08-31 深夜）

> 范围：第四轮游戏测试回报（球完全不动）→ 日志取证 → 四层证据定位 → 修复 e348612 + 同族扩展 → 注入核验。
> 承接：retrospective-2026-08-31-football-v5-triple-race.md（第 1~3 轮竞态谱系）；第 4 轮快照污染终解 =
> 架构收编（1c5fea0，决策复合 ballDribbleDecideAtomic 收编 logic 图 CARRIED 分支同拍原子执行）。
> 证据：游戏日志 `2026-08-31_20-29-31_3069_110170759.gia` + IR logic.json + logic.gia 解码 + 注入后
> `1073741908.gil` 回读（read --composite 1610700028/1610700029/1610700031）。
> 状态：**待验证**——修复已注入且读图核验全过；第五轮游戏内核验 pending（用户重载地图后测）。
> 来源：真实 GIA 日志帧值 + 注入产物/.gil 回读（命令与观察见第二节）；源码结论指向
> examples/football/src/composites/ball-phys.ts（e348612）。

## 一、错误谱系总览（带球链五轮全谱）

| # | 日志 | 现象 | 根因层 | 修复 |
|---|---|---|---|---|
| 1~3b | 19-16-01 / 20-02-57 / 20-09-26 | 数据离谱（死锁→弹射 12 米/拍→依旧 ±20） | 判定域 / 队列竞态 / 表达式重求值 | 15d67cb / 6e870ac / 3fb7098（详见上篇复盘） |
| 4 | 20-14-30 | 物化快照仍被 drain 污染 | 双 loop 相位竞态（架构级） | 1c5fea0 决策收编同拍原子执行 |
| **5** | **20-29-31** | **球完全不动**（新形态：非数据离谱，纯静止） | **注入层：复合 def 无 outflow → 注入器按接口裁调用点 exec 出边** | **e348612**（decide 声明 outflows + 同族修 applyImmediate） |

第 5 轮与前四轮本质不同：不再是玩法/竞态层问题，而是**架构修正自身的 DSL 声明缺陷在注入环节爆雷**——
决策逻辑全对（感知→G 律判定→drive=true 全部执行），但"用决策结果"的下半场整条链在注入后不存在。

## 二、第五轮完整调查链（方法 > 结论）

### 现象与首个反直觉点

交接文档预期的失配信号（impVel 仍被写 / vel 模 >10 / 一拍跳 >5m）**全部未命中**——实际形态是"该动没动"。
教训：失败信号清单要同时覆盖「动了但数值错」与「该动没动」两类；后者看**帧的有无**而非帧的值。

### 取证路径（每步的判据）

1. **records --summary**：三图各 128 条、f3 范围 1..37s——图都活着，排除"图没加载"。
2. **三类统计扫描**（本方法可复用）：timer 事件名分布（`grep -o "OUT2:String=[a-z_]*" | sort | uniq -c`）、
   关键复合帧计数（carried_tick/decide_atomic=986）、变量写入统计（`grep "Set Custom Variable" |
   grep -o "IN1:String=\w*" | sort | uniq -c`）→ 三个刺点：render_loop 事件进 825（三图广播，正常）、
   **impVel 被 825 写 59 次**（后证实为 drain 清零排水，非竞态）、**pos 全会话只写 1 次**（仅初始化）。
3. **单记录逐帧 dump**（rec36，首个 phys_loop，54 帧）：drain ✓ → state=4 分发 ✓ → decide 内部完整跑通
   （玩家实体 7、前向 (0.7107,0,0.7035)、dist²=0.189<2.25 ✓、fwd 点积 0.81>-0.3 ✓、drive=true、写 drivePrev）
   → **帧序列在 drivePrev 写入后戛然而止**：写 tmpVel / 欧拉积分 / 发布 / transition 零帧。
4. **源码对照**：carried_tick 设计链 `dec → sVel(写tmpVel) → 积分 → 发布 → transition` 存在于源码；
   ballDribbleDecideAtomic **未声明 outflows**（build 内含 exec：写 drivePrev）。全仓库审计
   （按 defineComposite 块扫描 exec 标志 × outflows 声明）：仅 3 处漏声明——decide（本轮主 bug）、
   ballPhysTick（同族）、dribbleFieldTick（v4 遗留无引用，不进产物，无害）。
5. **四层证据交叉定位断点**：
   - IR（logic.json implEdges）：`6→[7]`（decide 调用→写 tmpVel）边**存在**——编译层无错；
   - .gia 解码（decode-gia）：调用节点 pin connects 有 kind=1（exec）边指向写 tmpVel——产物层有边；
   - 注入后 .gil（read --composite 1610700028）：n=2（decide 调用）**无 OutFlow**、n=3（写 tmpVel）
     **无 InFlow**——边在注入时被裁；
   - 结论：注入器按 CompositeDef 接口裁剪调用点引脚（gil-node-graph-reading #20b/#20c 已记录模式），
     def 声明 outflows:[] = 告诉注入器"调用点没有出边可保留"。

### 修复（e348612，仅 ball-phys.ts）

1. **主修**：decide 声明 `outflows: ['done']` + `f.outflow('done', sPrev, 0)`（链尾=drivePrev 写回节点）。
2. **同族修**：ballApplyImmediate 中 `sendSignal(render_now)` 原挂在 physTick 调用之后——同样被裁边
   成孤儿（.gil 回读实证：发送信号节点无入边；踢球后渲染插队帧从未发过，无症状纯靠 render_loop 兜底）。
   改挂 transition.done 之后（其 def 有 outflow，边可存活；vel 交接此时已上黑板，语义等价）。

### 注入后核验（全部通过；命令与判据）

| 项 | 命令 | 结果 |
|---|---|---|
| decide def 接口 | `read --composite 1610700031` | OutFlow[0] done pinIndex=4 ✓ |
| carried 链接通 | `read --composite 1610700028` | n2 `OutFlow[0] cpi=4 → n3 InFlow` ✓，n3→n4→…→transition 全通 ✓ |
| render_now 链接通 | `read --composite 1610700029` | n3→n4(发送信号)→n5(physTick) 全通 ✓ |
| 节点预算 | `assets:node-graphs nodes` | 825 展开 1138 / carried 178 / decide 76（红线 2000 内）✓ |
| 变量名 pin | `scan-gil-var-pins` | 167 个全部完整 ✓ |
| def 目录 | `parse-gil-node-graph --list` | 无新增 (1) 副本（2 个旧 render_halt 副本为先轮遗留）✓ |

## 三、系统性根因（为什么前四轮修完又栽第五轮）

1. **读图核验红线的"低风险豁免"是程序性漏洞**：上一轮交接明写"carried 原子链未逐帧复核——低风险，
   游戏日志将覆盖"——赌注输掉整轮用户测试（第四轮白测，还要再约第五轮）。本轮唯一改动的复合调用链
   恰恰是断点所在。**"新增/改动复合调用点"从来不是低风险类目：调用点两侧的边是否在注入后存活，
   只能读图回答，日志覆盖是事后证据不是防线**。
2. **复合"三态分类"心智模型缺失**：纯数据复合（build 只算，可不声明 outflows）/ exec 复合（必须
   声明+锚定）/ **混合复合（主职责返回数据、内含 exec 写回或信号——最易漏）**。decide_atomic 按
   纯数据风格写（vel 入参、newVel 返回）却内含 drivePrev 写回。且编译期、IR、.gia 三层全部静默通过，
   唯一暴露点是注入后读图——防线位置与作者注意力位置（写 DSL 时）完全错位。
3. **注入器裁边是设计行为，但契约没有传导到 DSL 作者**：注入器按 def 接口裁调用点引脚是有意设计
   （接口=边的存活白名单），IR/.gia 层"边存在"给作者虚假安全感。该契约此前只记录在读图技能的
   #20b/#20c 案例里，没有进入 DSL 编写技能的复合铁律——写复合时看不到。

## 四、流程与方法论教训

- **有效**：统计扫描先行（事件名分布/复合计数/变量写入 uniq -c）30 秒锁定异常面 → 单记录逐帧定断点 →
  四层交叉一次闭环；同族扩展用脚本扫全仓库 defineComposite（一次抓出 physTick 同病），不靠记忆枚举。
- **绕路（三处都是既有技能规则警告过的坑，仍踩）**：
  ① /tmp 不跨沙箱持久（技能有记录，仍先写 /tmp，白耗一轮重跑）；
  ② run_code 模板字面量内联正则被转义吃掉（同族坑技能记录在案）——大文本/正则一律先 write 落文件；
  ③ 手工探测 decode-gia 的 JSON pin 格式走偏（技能明令"不要徒手探测 JSON 结构"，改用
    `read --composite` 后立即清晰）。
  另：git commit message 的 shell 引号转义翻车（amend 补救）——**"大文本先落文件"纪律应扩大到
  commit message（-F 文件式）**。
- **反直觉记录**：修复注入时沙箱对地图/备份目录只读（EROFS），按规范一次性升级重试成功——
  DSH 环境跑注入链需预留该步骤。

## 五、风险与未闭合项

- **第五轮游戏内核验 pending**（用户重载地图后带球测试；预期成功信号：carried_tick 内 decide 之后
  出现"Set Node Graph Variable tmpVel"+"发布 pos/vel/spin"帧，vel 模长收敛于玩家跑速×1.2 内）。
- def 残留债务：refs 检查 8 处"残留引用被覆盖"标记 + 2 个 ball_render_halt(1) 副本——先轮遗留、
  接口未变、已证可加载；建议一轮 def-clean（登记 O-2026-08-31-05）。
- 编译期防线缺口：对"build 含 exec 语句但未声明 outflows"的 defineComposite 报 warning（登记
  O-2026-08-31-05）。
- render 图既有悬空分支编译警告（GSTS-DANGLING-EXEC-NODE，IR 24 double_branch）——本轮未触碰，
  待查是否死代码（登记 O-2026-08-31-05）。
- ARCHITECTURE-V5.md 同步架构修正（决策收编/828 收缩/队列退役）——待第五轮结果一起做。
- 0.5s 降载手感复测（CONV_C/COAST_C 六常量联动，清单在 ball-state.ts LOOP_TICK 注释）。

## 六、产出清单

- 修复：e348612（ball-phys.ts 两处：decide outflows 声明+锚定；applyImmediate sendSignal 重排）；
- 本复盘文档；
- 技能迭代：dsl-nodegraph-development（+1 铁律：含 exec 复合必须声明 outflows，三态自查）；
  gil-node-graph-reading（Step 3.5 清单 +1 必跑项：改动复合调用点边存活核验）；
- open-items：O-2026-08-31-03 续记第五轮 + O-2026-08-31-05 新登记（def-clean / 编译期防线 / render 悬空分支）；
- 知识树待录（交维护者，走 O-31-03 提案流程）：①"含 exec 复合必须 outflows 声明，否则注入器裁
  调用点出边"（game-engine-rules context）；②"失败信号清单应含『该动没动』类（帧有无）而非仅数值类"。
- 同族审计脚本（3 行 python，defineComposite 块扫描 exec×outflows）记录于本文件第二节，未单独入库。

> 规则反馈检查：本轮证据与 AGENTS.md「读图核验红线」一致（红线本身无缺口，缺口在执行侧的"低风险豁免"）；
> 技能路由表覆盖本轮全部所涉技能；无 AGENTS.md/CLAUDE.md 需同步项。