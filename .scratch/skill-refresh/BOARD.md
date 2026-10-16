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

**全部票已闭环（T01–T06）** → 进入关账沉淀。

**用户令（2026-10-17）**：①`device-playtest-loop` 与全局 `computer-use` **职责分离、相互引用**（通用方法论 vs 千星专属资产）——已双向落引用；②**正向表述准则**（写「要 X」而非「禁止 Y」）已入全局守则第 8 条 + `skill-creator` 实施细则。**后续所有技能改动按正向表述写**。

## ③ 票据清单

| # | 票名 | blocked by | 状态 |
|---|---|---|---|
| T01 | 修「3000→2000」硬错误 + 全仓口径一致性 | — | ✅ |
| T02 | 新建技能「真机试玩与取数闭环」 | — | ✅ |
| T03 | 命令面补全 | — | ✅ |
| T04 | 六组重复主题归一 + 双通道打通 | — | ✅ |
| T05 | 卫生批次 | — | ✅ |
| T06 | 正向表述 sweep | — | ✅ |
| T07 | 模拟器 2D 能力纳入我方体系 + persona 降权 | — | ✅ |

## ④ 已完成划掉区

- ~~T06 正向表述 sweep~~（2026-10-17：全量 336 处；30 处裸禁令逐条判；**28 处刻意保留**（安全红线/事实约束/已配动作），实改 1 处；准则价值定位在新写内容）
- ~~T05 卫生批次~~（2026-10-17：占位符✅/22 .pyc✅/9 技能日期标记✅/6 tools 头注释✅/5 examples 说明✅/跨根重名 3 个按全局版同步✅）
- ~~T04 六组重复归一~~（2026-10-17：ASSET「通用安全写回流程」标为**唯一权威**，SGM/EDIT/EINC/VERIFY/GFS 各加指针；① 节点预算 6 技能全为 2000；③ 模板实例指向 ui-controls.md；⑤ 三层联动权威在 ASSET:148；④ 外部 Lua 双通道互指）
- ~~T03 命令面补全~~（2026-10-17：E/F/G 三节进 asset-operations；`src/cli/AGENTS.md` 表对齐 35/35；`client:sim` 进 game-from-scratch；`--help` 机制坑入册）
- ~~T02 新建 `device-playtest-loop` 技能~~（2026-10-17：六项零吸收能力收拢为可自动加载技能；`game-from-scratch` 阶段 7 挂引用）
- ~~T01 修「3000→2000」硬错误~~（2026-10-17，`gil-node-graph-reading/SKILL.md:277` 改为「生产红线 implTotal ≤ 2000 / 实测 2465 拒载 / 2026-08-31 作废旧 3000 口径」；全仓残留扫描 0）

---

## ⑤ 关账（2026-10-17）

**六票全闭环**，8 笔提交：

| 票 | 交付 | 提交 |
|---|---|---|
| T01 | `gil-node-graph-reading` 节点预算 3000→**2000**（全仓残留 0） | `0b5cfff0` |
| T02 | **新技能 `device-playtest-loop`**（六项 0 吸收能力 → 可自动加载闭环） | `1b2ebcb1` |
| T03 | 命令面补全：E/F/G 三节进 asset-operations；`src/cli/AGENTS.md` 表 **35/35 对齐**；`client:sim` 进 game-from-scratch | `0e0a7cd1` `c8055a31` |
| T04 | 六组重复主题归一（唯一权威 + 指针制）+ 外部 Lua 双通道互指 | `d17d5ddc` |
| T05 | 卫生：占位符 / 22 .pyc / 9 技能日期标记 / 6 tools 头注释 / 5 examples 说明 / 跨根重名同步 | `fba9eed8` |
| T06 | 正向表述 sweep：336 处判读，28 处刻意保留，实改 1 处 | `6a56ea63` |
| — | 职责分离（device-playtest-loop ↔ computer-use）+ 正向表述准则入册 | `b89fb146` |
| — | 建板 | `29bfca20` |

**遗留（下批候选）**：
1. **四项待覆盖能力**（日志窗口勾选 / 负载记录报告 / 编辑器重载保存流程 / 沙箱就绪判据）——T02 技能里已登记为"先补工具再依赖"，需单独立项。
2. `tools/analyze-gia-arch.ts` 顶部硬编码样本路径 → 改 argv。
3. 插件技能族（`qxqy-game-studio`/`qxqy-simulator`/persona）**本轮按用户裁决不动**；遇到问题时在**我们自己的 fork** 里改 + 按需 PR。
4. 未虚标日期标记的 9 个游戏技能（保持 mtime 信号）——下轮巡检时补。
