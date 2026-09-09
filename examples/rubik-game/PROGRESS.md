# PROGRESS — rubik-game（魔方残局挑战）

> 状态头：**进行中**（2026-09-08 立项）
> 设计权威：`.scratch/rubik-game/RG-DESIGN.md`；推进看板：`.scratch/rubik-game/BOARD.md`（票据 01-08）
> donor：examples/rubik-3x3（地图 1073741899，用户复测通过 2026-09-02）

## 状态表

| 阶段 | 状态 | 说明 |
|---|---|---|
| 0 规划 | ✅ | RG-DESIGN.md 定稿（用户三裁决+UI v3） |
| 1 地图骨架 | ✅ | 票02（1073741920+36 roots） |
| 2 建模 | ⬜ | 票07 实体美术（基座/聚光/铭牌/围栏） |
| 3 写回+视觉核验 | ✅ | 票03 资产迁移（结构层全绿 2026-09-09；行为层待用户核验）/ 票04 UI 资产 ⬜ |
| 4 输入 | ✅结构层 | rgInput 1837 已注入+挂玩家模板（def+9 副本），行为层待 UI 资产联调 |
| 5 节点图 | 🔄 | rgState 1835 已注入已挂 6260 / rgHint 1836 编译级完成（提示机制，待注入）/ 票06 收尾 |
| 6 编译注入 | 🔄 | 9 图已注入（G2）；玩法/UI 新图待 G3/G4 |
| 7 日志验证 | ⬜ | 票08 用户核验 |
| 8 沉淀收尾 | ⬜ | 票08 |

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
- 2026-09-09 提示机制（票06 核心）：rgHint 1836（11 节点，btnId=20 门控+rg_hint_used 置位+rg_hint_mode 旗标+发 op12）；三张 plan 图 seq-ready 位点加同一门（solverPlan 271/solverEPlan 161 图体+solverLPlan llPublishSeq 复合）：rg_hint_mode=1 → solve_len 截断 1+phase=0+旗标复位——solver 恰执行一步，播完 op5 因 phase=0 熄火；rgState op7 分支兜底清旗标。donor op12 路径零行为变化（旗标缺省 0 走 else phase=2 原路径）。前置待办：6230 预注册 rg_hint_mode:int=0（注入步）。

## 待闭合规则清单

- UI 运行时文本更新能力（RG-DESIGN §6 风险 4：f505 插值 wire 形态）
- turn 图程序化转动入口（方案 A solver 信号通道 / B 入口手术，票05 定案）
- 用户编辑器重载 1920+保存+游戏核验 1899 等价行为（G2 行为层闭环，挂账）
