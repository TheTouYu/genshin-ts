# 看板 · 游戏技能族刷新（skill-refresh）

> 状态：**执行中**（2026-10-17 建板；用户三点裁决：①插件侧不扩生态、只在自己 fork 里改+按需 PR ②P1 建新技能 ③跨根重名：全局=上游基线、本仓=项目特化）
> 触发：用户「我们现在是时候更新全部的游戏技能了」。**设计权威**=本板 + 两份侦察报告（见"资产速查"）。

## ① 资产速查（高频引用的事实，动手前必看）

| 事实 | 值 |
|---|---|
| 游戏技能面 | 20 个 = 本仓 18（`/home/h/genshin-ts/.agents/skills/`）+ 插件预设 1（`qxqy-game-studio`，4017 B）+ 插件单体 1（`qxqy-simulator` = `dsh-plugin/skill.md`，19354 B，**不在任何 skills/ 目录**） |
| 插件技能三副本 | `miliastra-beyond-simulator/dsh-plugin/presets/wonderland-lua-builder/skills/`（主维护源）· `/home/h/.dsh/.agent-presets/wonderland-lua-builder/skills/` · `profiles/web/node_modules/...`（会话实际发现路径）；**哈希一致（68fafdf2…）**，改一处须同步 |
| CLI 机制坑 | 全部 commander **叶子命令** ⇒ `gsts <族> --help` **不列子命令**；动作全集只在 `src/cli/*.ts` 的 `usage()` 里 |
| 能力面 | CLI 顶级 35 条（`src/cli/gsts.ts:1750-2270`）· tools 36 + `ys-editor/` 21 · 引擎知识 33 篇 · examples 12 |
| 枢纽技能（被引数） | `gil-node-graph-reading` 9 · `verify-injection` 8 · `editor-incremental-gia-investigator` 8 · `genshin-ts-asset-operations` 7 · `gil-node-graph-editing` 6 · `debug-log-investigator` 6 |
| 侦察报告 | （会话内）三路只读侦察：技能清单 / 能力面 / 吸收矩阵；结论已入河 **D299** |

## ② 当前前沿

**T05/T06** ← T01–T04 已闭环。

**用户令（2026-10-17）**：①`device-playtest-loop` 与全局 `computer-use` **职责分离、相互引用**（通用方法论 vs 千星专属资产）——已双向落引用；②**正向表述准则**（写「要 X」而非「禁止 Y」）已入全局守则第 8 条 + `skill-creator` 实施细则。**后续所有技能改动按正向表述写**。

## ③ 票据清单

| # | 票名 | blocked by | 状态 |
|---|---|---|---|
| T01 | 修「3000→2000」硬错误 + 全仓口径一致性 | — | ✅ |
| T02 | 新建技能「真机试玩与取数闭环」 | — | ✅ |
| T03 | 命令面补全 | — | ✅ |
| T04 | 六组重复主题归一 + 双通道打通 | — | ✅ |
| T05 | 卫生批次：占位符/.pyc/日期标记/tools 头注释/examples PROGRESS | — | ⬜ |
| T06 | 正向表述 sweep（20 个游戏技能；安全红线刻意保留） | — | ⬜ |

## ④ 已完成划掉区

- ~~T04 六组重复归一~~（2026-10-17：ASSET「通用安全写回流程」标为**唯一权威**，SGM/EDIT/EINC/VERIFY/GFS 各加指针；① 节点预算 6 技能全为 2000；③ 模板实例指向 ui-controls.md；⑤ 三层联动权威在 ASSET:148；④ 外部 Lua 双通道互指）
- ~~T03 命令面补全~~（2026-10-17：E/F/G 三节进 asset-operations；`src/cli/AGENTS.md` 表对齐 35/35；`client:sim` 进 game-from-scratch；`--help` 机制坑入册）
- ~~T02 新建 `device-playtest-loop` 技能~~（2026-10-17：六项零吸收能力收拢为可自动加载技能；`game-from-scratch` 阶段 7 挂引用）
- ~~T01 修「3000→2000」硬错误~~（2026-10-17，`gil-node-graph-reading/SKILL.md:277` 改为「生产红线 implTotal ≤ 2000 / 实测 2465 拒载 / 2026-08-31 作废旧 3000 口径」；全仓残留扫描 0）
