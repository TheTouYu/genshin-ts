# 完整复盘：从模拟器 demo 到真机落地（2026-10-24）

> 状态：当前实现（复盘 + 已建防线）
> 范围：2026-10-23 17:00 → 2026-10-24 12:00（本会话全程）：2D 产线恢复 → 客户端控件命令面 → 布局挂载差分 →
> 整图清理事故 → tetris demo → GIA 导入真机 → 键位/布局修复 → sim:import 骨架
> 证据：提交 `cac11c57`/`e04be573`/`f9d12524`/`7737e80d`/`14924841`/`ca477042`；日志
> `2026-10-24_00-29-15_3326`、`2026-10-24_11-11-18_3327`；快照 `~/genshin-ts-evidence/{ui-layout-attach,sim-import-tetris}/`
> 视角：主模型自复盘（含用户纠偏 4 次）

## 〇、生效路径表（每条教训下次靠什么被触发）

| 教训 | 载体 | 触发方式（不靠人读） | 验证 |
|---|---|---|---|
| 整图写回：501 是森林根集、f503 小序号不能剔、Temp 双写 | `tools/gil-guard.py` + `genshin-ts-asset-operations` 技能新节 | 写回前跑检查器；技能在资产类任务自动加载 | `python3 tools/gil-guard.py --selftest` → PASS（exit 0） |
| 同上（回归防线） | `tools/failure-ledger.gates.tsv` 新 gate `gil-guard-selftest` | `tools/failure-ledger check` 自动跑 | 账本 `F-20261024-86 [静默/prevented]` |
| 真机键位要枚举、模板索引会重编号、Lua 无护栏 | `simulator-2d-route` 技能「真机差异」表 | 走 2D 产线/真机导入时自动加载该技能 | 账本 `F-20261024-87/88 [open]`（尚无机械门禁，见 §五） |
| 真机 Lua 的唯一取证通道 = Debug_Log 的 `'lua'` 行 | `debug-log-investigator` 既有速查 + 本次日志实证 | 查日志时按技能流程第一步 | 两条日志实测可 grep 到 `listen fail …` |
| 模拟器绿 ≠ 真机绿 | `simulator-2d-route` 差异表首行 + 本复盘 §三 | 技能加载 | — |
| 游戏交付必须含引导/反馈/结算 | 本复盘 §四 + 用户 2026-10-24 反馈原话 | 下一轮 demo 交付清单（待补进 `game-from-scratch`） | — |

## 一、错误谱系（本轮 8 条）

| # | 现象 | 根因层 | 修复 | 证据 |
|---|---|---|---|---|
| 1 | 整图清理后编辑器报「存档已损坏」 | 我误解 `root9.501` 语义（当记录清单重建） | 501 只过滤不重建 | 备份 vs 产物对照：11 根 vs 20 全量 |
| 2 | 第二次仍损坏 | `f503` 小序号列表被当成 id 剔除 | 只剔 ≥1073741824 的值 | 逆运算对拍 sha 回到原值 |
| 3 | 同两次都漏 Temp 同步 | 绕过 CLI 写回链、直接 `cp` | Save_Level + Temp 双写、三方 sha | 事故 2026-10-24 21:0x |
| 4 | 客户端控件全被判成 `[official]` | `kindOfRecord` 只认服务端签名 | 新增 compTypes 84–99 判别表 | `assets:ui list` 36 条正确分类 |
| 5 | 「放入布局」后不知道编辑器怎么写 wire | 缺实例化语义样本 | 用户手动导入+放置各一轮差分 | `hl-v1/v2` 快照 |
| 6 | 真机 `newgame`/`fall y=` 全缺，画面不动 | Lua 无护栏，`AddKeyEventListener` 抛错中断 OnStart | pcall + 把 newGame 提前 | 日志 `3326` 只有 canvas/cellCount |
| 7 | 键位全部失效 | 真机要 `Enum.KeyEventType` 枚举，字符串非法 | 枚举优先 + 字符串回落 | 日志 `3327` 7 条 `listen fail` |
| 8 | WASD 无反应 / HUD 半出屏 | 脚本从未监听 WASD；HUD 坐标写死 x=0 | 补 4 个 Move* 键；HUD 按画布算 | 用户截图 + 代码核对 |

## 二、最近一次错误的完整链（#6/#7 键位链）

现象：试玩有棋盘、方块能落、Space 无效。
① 日志（`3326`）→ 只有 `canvas` / `cellCount=200`，`newgame` 缺 ⇒ OnStart 中断；
② 加 pcall + 提前 newGame → `3327` 出现 `newgame` 与 `fall y=2..17`，且 7 条
`listen fail … (KeyEventType expected, got string)` ⇒ 根因是**参数类型**而非键名；
③ 改「枚举优先、字符串回落」→ 用户第二轮：Space 生效、WASD 无效 ⇒ 脚本本来没监听 WASD；
④ 补 WASD + HUD 布局 → 待验证。
方法论：**print 落 Debug_Log 是真机 Lua 唯一的运行时取证通道**，比截图快一个数量级。

## 三、系统性根因（3 条）

1. **拿"我方解析器全绿"当目标宿主的验证**。`assets:ui list`/`gil-guard` 都通过，编辑器仍拒绝；
   模拟器 6/6 全绿，真机键位全废。⇒ 结论必须由**目标宿主**产生：编辑器能否打开、真机日志有无对应行。
2. **改写结构化文件时按"我看到的样子"而不是"字段语义"操作**。501 是森林根集、f503 混装 id 与小序号——
   两处都是"形状像列表就当列表"。⇒ 改写前先做**逆运算对拍**（造→删→字节相等），并只剔明确区间内的值。
3. **脚本宿主差异没有一页对照表**。键位枚举、模板索引、异常可见性、布局坐标——四处差异全部靠踩坑发现。
   ⇒ 固化进技能差异表（已做），下一轮先读表再写代码。

## 四、流程与方法论教训（含用户纠偏原话）

- 用户（10-23 20:1x）：「你清理地图里面的元素；假设我们要做俄罗斯方块」——**先清理再建 demo**，
  我把它做成两次整图写回，代价两轮回滚。正确顺序：能交给编辑器就交给编辑器。
- 用户（10-24 11:36）：「你的问题是没有设计引导，玩家进去不知道怎么操控。这个是一个游戏不可缺少的元素。」
  → **demo 交付清单必须含：引导、键位提示、失败提示、结算**，否则视为未完成。
- 用户（10-24 11:36）：「真正结算游戏需要在服务端节点图，触发结算（这个知识点在官方文档中有说明。如果相关技能
  水平不够高，需要及时更新。）」→ 我此前只想到显示 GAME OVER；正确路径是
  `结算关卡` + `设置玩家结算成功状态`（`official-guide-nodes-server.md:420`）。
  教训：**"能不能做"的答案先查官方文档，再谈实现**。
- 用户（10-24 11:36）：「确保玩家每一次操作都能获得及时、明确的反馈」→ 反馈是基础要求，不是加分项。

## 五、风险与未闭合

- `gil-guard.py` 只能抓**已知**两类破坏（501 全量、悬空引用）。第二次被拒的 `clean4` 能通过它但编辑器仍拒收
  ⇒ 还有未知不变量（疑 `503(varint)` 语义或记录物理排序）。**当前结论**：整图清理在拿到编辑器接受样本前，
  优先让编辑器删，不用 CLI。
- `F-20261024-87/88` 无机械门禁（真机键位/异常护栏）——需要在 `simulator-2d-route` 落一个 Lua 静态检查
  （`AddKeyEventListener` 必须枚举优先 + pcall），留待下一轮。
- tetris 的结算链路未实现（服务端节点图 + Lua 触发），本轮只做了能力评估。

## 六、产出清单

- 工具：`tools/gil-guard.py`（含 `--selftest`；真实地图 PASS、历史坏样本 FAIL）
- 门禁：`tools/failure-ledger.gates.tsv` 新增 `gil-guard-selftest`
- 账本：`F-20261024-86`（prevented）、`F-20261024-87/88`（open）
- 技能：`simulator-2d-route`「真机差异」节、`genshin-ts-asset-operations`「整图级写回安全门」节
- 代码：`ui/src/client-kinds.ts` + `record.ts`/`types.ts`/`tree.ts`、`src/cli/assets_ui.ts`（client-container 与 10 类 create）、
  `src/cli/sim_import.ts`（覆盖报告）、`workspace/tetris/**`
- 证据：`~/genshin-ts-evidence/ui-layout-attach/**`、`~/genshin-ts-evidence/sim-import-tetris/**`
