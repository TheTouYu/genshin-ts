# 注入载体覆盖度清单（R0 实测，2026-09-01）

> 状态标签：**当前实现**（来源：文件系统实测 + PKC CLI 实测，非文档转述）

## 六类载体现状

| 载体 | 覆盖现状 | 实测证据 | 缺口（与本复盘的关联） |
|---|---|---|---|
| 1. 根 AGENTS.md / CLAUDE.md | ✅ 每会话注入，含三栏门禁、一次性授权边界（`3760a5a`）、卡住三问+分层归因（`7edfb35` 8/14） | 本会话注入内容亲证 | 规则措辞是"归因"名词，不是可操作排查流程（见 metrics-R0 反常数字） |
| 2. 目录级 AGENTS.md | ⚠️ **16 个工程目录覆盖，examples/ 全线零覆盖** | 实测清单：create-genshin-ts、docs、scripts、src(+cli/compiler×4/definitions/eslint/injector/runtime/thirdparty)、tests、tools（另 create-genshin-ts/templates/start 属模板）。**examples/ 下 9 个子目录（capture-set-repro、composite-replica、cube-replica-c4、football、lights-out、rubik-2x2、rubik-3x3-client、rubik-3x3、ui-interact-test）无任何 AGENTS.md/CLAUDE.md** | 足球/魔方主战场无自动注入：v4 不变量清单、地图 ID、复测流程、授权边界全靠 PROGRESS.md 手动读 |
| 3. 技能（22 个项目级） | ✅ 覆盖写图/读图/调试/复盘/交接/提示词全链路；9/1 已恢复 dsh-session-history/dsh-plugin-search（`ddbb708`）+ 体检脚本（`4d3eac1`） | `ls .agents/skills/`=22；`skills-health.py` 在位 | **排查类技能（debug-log-investigator）无"输入→逻辑→渲染逐层数据推演"操作规程**（grep 零命中，metrics-R0 指标②）；无"重写前必须加载目标模块不变量清单"的技能钩子 |
| 4. PKC 知识树 | ⚠️ 4 个 context（compiler-diagnostics / static-gil-assembly-production / official-guide / game-engine-rules） | `query "协作 交接 复盘" --level 2` = **0 命中** | **零协作类记忆**：60+ 篇复盘文档的协作教训无一进入知识树；无 collaboration context |
| 5. 工具脚本（硬门禁） | ⚠️ 仅 `scripts/skills-health.py`（技能引用体检，9/1 新增）；无行为类门禁 | `ls scripts/*.py` | 无"修复报告三栏完整性"机械检查、无"重写 diff 是否触碰不变量清单"检查 |
| 6. 用户习惯（无自动载体） | — | — | 待 R4 逐条标注 |

## 关键覆盖断层（R4 落地计划的靶点，此处只登记事实）

1. **examples/ 零覆盖 × 7 天 7 代重写**：足球带球模型 8/26-9/1 更替 7 代（弹簧场`a7c293d`→推`271e32c`→冲量`81f7672`→状态机`737a1f2`→速度场`be13897`→连续控制器`7a1e97f`→三层信号化 v5`7927753`→v6/v7），每代重写时上一代的已修复纪律无任何强制注入通道——实测两次纪律丢失：v4 `4ec9343`（tmpDribbleVel 物化）在 v5 重写中丢失、`3fb7098` 重新发现；v4 正确 clamp 在 v5 抄写成 max、`b2370a5` 修复。
2. **fix:feat = 36:18**（8/25 起 football），修复密度 2 倍于功能——与"越写越差"体感同向（初值，R2 归因）。
3. **协作知识有产出无载体**：61 篇复盘文档、每会话 handoff 纪律，但 PKC 协作类 claim=0、examples/ 无 AGENTS.md——沉淀只停在"读不读看 AI 自觉"层。
