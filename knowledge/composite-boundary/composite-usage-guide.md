# Composite usage guide (author view)

Author-facing guide: when to composite, four forms, interface design, three architecture patterns, known boundaries, verification flow

<!-- CLAIM:START clm_1EB7BE64DF651835F79AE4DB94 -->

### Composite usage guide: 5-7 node standard, four forms, call-flow/event-flow separation, verified boundaries

复合节点作者视角总纲（docs/game-engine-knowledge/composite-usage-guide.md，2026-08-15 成文）：①复合化标准 = 每层级打开 5~7 节点，超过即复合化；两种价值（复用型多处调用/封装型职责单元），价值公式=布局清晰→复用更赚→跨项目资产；②四种形态分类（纯数据流/调用流/纯事件流/混合复合）先分类再动手；③核心架构原则：调用流与事件流分开表达（用户 2026-08-14 指导），事件回调是独立执行流、capture 参数不可见（2690 实证）；④三种模式参考实现：调用流复合（gsts_orbit_scheduler：start_timer 序列+outflow）、纯事件流复合（gsts_orbit_trigger：事件载荷分发+字面量 case）、混合复合（verify_event_comp：事件独立旁路+调用流入口）；⑤已知边界：#19 capture 惰性引用、#20b impl exec 边物理 InFlow、#20c 纯事件复合三条件、#21 事件触发语义（custom 变量触发/图变量不触发）、setTimeout 与 dict 图变量读写不可用；⑥验证流程：编译→体检（npm run health:composite）→读图自检→游戏核验；设计检查清单 9 条。

#### 适用边界

示例全部来自已验证生产代码（rubik v20 游戏核验通过、verify/composite-family 2696 日志全通过）；使用指南是作者视角总纲，规则与 wire 细节以 composite-nodes.md 为准；能力边界为生产现状（2026-08-14），官方编辑器能力可能更宽。

<!-- CLAIM:END clm_1EB7BE64DF651835F79AE4DB94 -->
