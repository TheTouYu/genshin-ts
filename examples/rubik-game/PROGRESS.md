# PROGRESS — rubik-game（魔方残局挑战）

> 状态头：**进行中**（2026-09-08 立项）
> 设计权威：`.scratch/rubik-game/RG-DESIGN.md`；推进看板：`.scratch/rubik-game/BOARD.md`（票据 01-08）
> donor：examples/rubik-3x3（地图 1073741899，用户复测通过 2026-09-02）

## 状态表

| 阶段 | 状态 | 说明 |
|---|---|---|
| 0 规划 | ✅ | RG-DESIGN.md 定稿（用户三裁决+UI v3） |
| 1 地图骨架 | ✅ | 票02（1073741920+36 roots） |
| 2 建模 | ✅结构层 | 票07 美术三元件+三实例（基座 350/353、聚光 351/354、铭牌 352/355）+胜利动画 rgWin 1838（自旋 360 v1） |
| 3 写回+视觉核验 | ✅结构层 | 票03 迁移结构层全绿；票04 UI 31 控件已应用（g4-art ALL GREEN） |
| 4 输入 | ✅结构层 | rgInput 1837 已注入+挂玩家模板（def+9 副本），行为层待游戏联调 |
| 5 节点图 | ✅结构层 | rgState 118+rgHint 11 已注入挂 6260；提示机制三 plan 图门在位（g3 判据全绿） |
| 6 编译注入 | ✅ | 13 图 1144 节点全注入（g5-close 四组判据复跑 ALL GREEN，双址 SHA 一致） |
| 7 日志验证 | 🔄 | 票08 用户游戏全流程核验（挂账：用户 2026-09-09 推进令先行） |
| 8 沉淀收尾 | ✅本轮 | 判据脚本×5+MIGRATION/UI-CHANNELS/G3-PLAN 落盘；正式复盘留下一轮 |

## 关键资产（随进度更新）

- 新地图 ID：**1073741920「魔方残局挑战」**（2026-09-09 create+init，骨架 36 roots）
- 迁移完成（2026-09-09，checks/g2-map.mjs ALL GREEN）：元件 28（200/202/204..229）+实体 6+信号 7 带参+图 9 张注入（1825..1833，节点数=donor 逐张，总和 957）+挂载 9（donor 矩阵）；切换镜头 1834 悬空待 G4 DSL 重建
- 源码：examples/rubik-game/src（31 .ts，g.server id=1825..1833）；gsts.config.ts 带 inject 块（信号注册表取自 1920）
- donor 资产映射表：MIGRATION.md（.scratch/rubik-game/）

## 变更记录

- 2026-09-08 立项：目录+配置+占位主图+本 PROGRESS；编译管线闭环验证中。
- 2026-09-09 地图骨架：maps:create 1073741920+temp 同步；maps:init 补 36 骨架 roots（root3-49）；BOARD/PROGRESS 回填 MAP_ID。票02 完成。
- 2026-09-09 资产迁移（票03）：三通道（static-assemblies ID 保留变换/entities import+--definitions-gil/src 改 id 重编译批量注入）+信号模板注册+挂载还原；深读核验 1825 通过（4 事件入口：Entity Created spawn 链→flow_spawn_rubik 复合→blocks 变量→Start Timer；Timer dispatch MB→rubik3x3_solve 发送×4；Tab Is Selected；监听 rubik3x3_tab——信号名与注册一致）；resync 后 Save_Level/Temp sha256 一致。陷阱三条入 MIGRATION（entities 缺 import 动词静默导出/color 往返不对称/signals --param 必须一次性显式+备份=写前快照回滚须重放后置写入）。
- 2026-09-09 玩家输入图落位：rgInput 1837（11 节点）注入+挂玩家模板 def 1086324737+九副本 737..745（用户确认门过）；explain 深读逐条吻合（2 UI 事件入口+字面量 0/4/100/200+4 发送信号）；check-gil-composite-refs --incoming 0 悬空。陷阱：assets:node-graphs read 用 --graph 非 --id；read --json 对泛型 R<T> 引脚显示「ConcreteBase N」不含常量值——常量核验必须 gia-verify-pin/explain（字面量显示）双通道。
- 2026-09-09 提示机制（票06 核心）：rgHint 1836（11 节点，btnId=20 门控+rg_hint_used 置位+rg_hint_mode 旗标+发 op12）；三张 plan 图 seq-ready 位点加同一门（solverPlan 271/solverEPlan 161 图体+solverLPlan llPublishSeq 复合）：rg_hint_mode=1 → solve_len 截断 1+phase=0+旗标复位——solver 恰执行一步，播完 op5 因 phase=0 熄火；rgState op7 分支兜底清旗标。donor op12 路径零行为变化（旗标缺省 0 走 else phase=2 原路径）。6230 已预注册 rg_hint_mode:int=0（2026-09-09 注入轮落地）。
- 2026-09-09 UI 零差分集应用（票04 核心）：候选链 fp1→fp36（纯 --output 迭代）→用户确认→整包应用（备份 16-17-50.manual.bak，SHA db9942f4→15d2ea00，Temp resync 双址一致）。内容：①残局挑战悬浮页（1077936300，三页签+开始挑战 310）+③结算悬浮页（1077936303，文本 311/312+按钮 313/314/315）+HUD 默认布局直加（文本框 320/321+21 按钮 322..342）。侦察报告 UI-CHANNELS.md（缺口 G1 插值/G2 进度条/G3 计时器/G4 页内状态；G1-G3 可一轮差分打包）。经验：tab create 自动带默认页（rename 首页再 add）；custom-button 默认布局直达（assets_ui.ts:337）；整包应用=SHA 锁定→备份→cp→resync。

## 待闭合规则清单

- 按钮交互事件链（2026-09-09 定案）：官方铁证 docs/ui-tutorial/official-guide-nodes-server.md#L4260「只有交互按钮、道具展示、自定义按钮、自定义开关的界面控件，才会触发本事件」——默认形态自定义按钮可触发，无需额外交互配置（配置缺失只影响素材/键鼠映射）。**行为核验项**：默认布局散置按钮的 compositeIndex 取值序列（G5 游戏联调实测）；兜底=若布局散置按钮不触发（仅控件组库模板激活形态触发），把 21 按钮迁入库内控件组+rgState 加「激活控件组库内界面控件组」节点（L1604）。单个控件组上限 1000 控件（L2126），21 按钮无忧。
- UI 运行时文本更新能力（RG-DESIGN §6 风险 4：f505 插值 wire 形态）+ 进度条/计时器控件创建（UI-CHANNELS 缺口 G1-G3，一轮差分打包）
- 用户编辑器重载 1920+保存+游戏核验 1899 等价行为（G2 行为层闭环，挂账）；UI 形态+全流程游戏核验（用户 2026-09-09 实答：需进游戏核验，先推进跑完整流程）

## W3 客户端优化栈移植（2026-09-09，反馈3 修复）

- 源码合并：rubik-3x3-client src 整体移植（16 文件）+ ID 重映射（1914→1920 布局）+ G3 补丁重放（op11/三 plan 门/flowScrambleN）+ solverPlan 补 lane 支双门。commit 711339e
- 1920 资产：信号×3（rbx_echo/rbv_go/rbv_echo 含 vec3×3）/宿主 6201 变量×23/玩家 def+8 副本×9/27 球 def+inst（6233..259）/26 块 followMotion 组件/技能配置 1191182338+1191182340/图槽 14（ballvisual 1839+客户端 6 真位+7 保留位）。commit 50d99fc
- 注入：20/20 ok（「All injections done (ok 20, fail 0)」）；挂载切换 6203: visual(1827)卸挂保留→ballvisual(1839)。
- 读回：28 图 1946 节点全在预算内；G3 门增量吻合（EPlan+9/solverPlan+20/LPlan 复合内）；双址 SHA c821b747 一致。
- **行为依赖（阻碍台账 B1/B2）**：游戏可玩性依赖用户编辑器侧两步——技能变量段 553..652 + 造物实体×2 放置配置；未完成前自动还原停十字段、块视觉不转。
- 设计/台账：.scratch/rubik-game/{PORT-DESIGN,BLOCKERS}.md

## W1 UI 重构（2026-09-09，部分完成：HUD✅ 图侧✅ 悬浮页内容→编辑器轮）

- HUD：删 6 无语义按钮（X/Y/Z±，donor op3 只支持 12 面转）；12 转动按钮重排底部两行（+行 y=120/−行 y=55）；提示/重开/菜单右下竖排；步数框顶中插变量「档 {1:ps.rg_level} · 步 {1:ps.rg_moves}/{1:ps.rg_par}」（官方文本变量插值语法，运行时更新知识缺口闭合）。
- 15 按钮×3 状态文字素材（白/金/橙）——「素材全空」修复。
- rgInput v2（已注入）：compositeIdx→btnId 映射表（0 基假设：0..11→1..12 转动、12/13/14→提示/重开/菜单）；页0 item0..3→100..103、4→200；页1 item0/1/2→21/23/22；开局 whenEntityIsCreated（rg_stage∈{0,1}）自动唤起选关页；rubikgame_state 编排（ev1 val1 开页0 / val2,3 关页0 / ev4 关页0+开页1）。
- rgState v2（已注入）：重开 21 脱离 PLAYING 门（结算页「重试」可用）；新增下一关 23（3→5→8→12 递进，12 档后回菜单）；rg_stars 变量同步（结算页插值源）。
- **fail-closed（B6）**：悬浮页内容 CLI 填充不通——转编辑器轮。
- **编辑器轮规格单（选关页=残局挑战 1073741864）**：5 个交互按钮（名称依次「3步·新手」「5步·进阶」「8步·挑战」「12步·大师」「自由模式」，交互项索引 0..4 对应 btnId 100..103/200）+标题文本框+说明文本框。**结算页（1073741865）**：3 个交互按钮（「重试」「下一关」「菜单」→btnId 21/23/22）+星级文本框「★×」+步数文本框。
- **首轮核验校准点**（对 rgInput 开详情日志）：HUD compositeIdx 实际基数（0 基假设）；悬浮页索引 0/1 假设；页内交互项计数是否含页签。
