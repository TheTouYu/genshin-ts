# 复盘：GUI 世界状态模块从「9 分钟未完成」到「39.1s 完成」（2026-10-21）

> 状态：当前实现 + 真机行为读数（非推测）
> 证据：72 个当日提交；`tools/failure-ledger`（64 条账目）；真机 evidence 目录
> `.scratch/gui-service/evidence/{friends-run,realrun-20261021}/`
> 读者：接手 GUI 感知层 / 真机自动化的兄弟代理

## 零、生效路径表（每条经验靠什么被自动触发）

| 教训 | 载体 | 触发方式（不靠人读） | 验证 |
|---|---|---|---|
| 单批上限 ≠ 总量上限（`--rows` 被 clamp） | 技能 `gui-perception-loop` §3-b + `ys-scroll` 分批实现 | 技能自动加载 / 代码内建循环 | `ys-scroll --rows 48 --plan` → `clicks=423` |
| 身份字段必须来自对象本身，不是属性 | 技能 `gui-perception-loop` §3（反模式表） | 自动加载 | `scan_session` 的 `name_of` 跳过 `N天前` |
| 无 seek 时不许建议二分 | `ys_advice.SEEK_MAX_ROWS` + 代码分支 | 代码硬逻辑 | `ADVICE-RESULT ... code=LINEAR_ONLY_NO_SEEK PASS` |
| 桌面借用并入屏幕授权 | `ys-session begin/end` 代码 | 运行时行为 | `begin` 自动切、`end` 回 `prev_desktop` |
| 交还三件（窗口/堆叠/桌面） | `ys-hand-back` + `handback_ok` | 代码硬判 | 每轮真机 `handback_ok=true` |
| 抓帧裁决只认 KWin strict | `instruments._capture_frame_via_ys_capture` | 代码 | `world-entry` 门禁 |
| 测试夹具不许放会被覆盖的目录 | 技能 `gui-world-state` §11 + `tests/fixtures/advice/` | 自动加载 / 缺失即 `rc=2` | `advice-fixture-neg` INJECT-PASS |
| 测组件要测接缝（主入口） | 门禁 `world-entry` | 门禁跑 | `WORLD-ENTRY-RESULT pass=5` |
| 失败必须自解释（原因+状态+下一步） | `ys-screen-grant explain` / `resolve-window` / `InstrumentError` | 代码硬输出 | `cross-desktop` 门禁 5 断言 |

> **判定**：上表"载体"列没有一项是"复盘文档/日记"——文档只作为索引。

## 一、仪表盘（`tools/failure-ledger dashboard`）

```
总数 64｜已建机械防线 60｜未建防线 4（真债）
类别分布：判据 27 / 静默 15 / 身份 11 / 归因 5 / 环境 4 / 遗漏 2
未建防线：F-20261020-42、F-20261021-48、F-20261021-57、F-20261021-62（全部是"多仪器读数冲突"族）
```

## 二、错误谱系（当日 20 条，按发现顺序）

| # | 现象 | 根因层 | 修法 | 门禁 |
|---|---|---|---|---|
| 1 | `ys-lookd` 卡死，`Recv-Q=4`，60s 零输出 | 单线程串行 + recv 无超时 | recv 10s + handler 90s 看门狗 | `lookd-wedge` |
| 2 | `ys-capture` 常驻没在跑 | 写死旧窗 id + 取第一个命中 + 失败静默 | 默认 auto + 面积最大 + 限频日志 | `capture-liveness` |
| 3 | `ys-scroll` 画面没动仍 `rc=0` | 无差异量 | `frame_diff` + `moved_confirmed` + `rc=6` | `scroll-movement` |
| 4 | 好友面板被判成 `GAME_WORLD` | 状态词表缺面板态 | 加 `GAME_FRIENDS/GAME_CHARACTER` + PRECEDENCE | `state-precedence` |
| 5 | 说"已归还"却还在游戏上 | 归还语义错（只 activate 不 raise） | `ys-hand-back` 单一实现 + 三件校验 | `focus-default` |
| 6 | 回归测试在无人知晓时抬窗（用户听到声音） | 测试动了真屏 | `YS_ALLOW_SCREEN_TEST` 闸门 | `screen-grant` |
| 7 | 提示音不止一处 | `import -window` 敲 X11 bell + 测试注入 ESC | 14 个工具加 `-silent` + 测试闸门 | `no-xbell` |
| 8 | 对已是活动窗的 firefox 再做 activate（多一声响） | 三处键名写错（`id` vs `internalId`、`index` vs `i`、`caption` vs `c`） | 零操作检查 `noop:true` | `screen-grant` |
| 9 | 租期到期屏幕不还 | 归还依赖调用方调 `revoke` | 常驻守护自动交还 | `grant-expiry` |
| 10 | 被拒只说 `NO_GRANT` | 失败不自解释 | `explain` 输出 state+next_action | `screen-grant` |
| 11 | 17 个工具写死过期窗 id | 把一次性的 id 当常量 | 一处解析 + `${YS_WIN:?}` fail-loud | `no-dead-window-id` |
| 12 | `--rows 48` 只走 5 行 | 单批 clamp 当总量上限 | 分批循环 | `scroll-movement` |
| 13 | advice 建议做不到的二分 | 建议未校验可执行性 | `SEEK_MAX_ROWS` + `LINEAR_ONLY_NO_SEEK` | `advice` |
| 14 | `worldsvc look` 直接 TypeError 崩 | 形参加在调用点漏了签名 | 补签名 + 主入口门禁 | `world-entry` |
| 15 | advice 门禁随机变红 | 夹具放 `.scratch/evidence/**` 被真机跑覆盖 | 固定 fixtures + 缺失 `rc=2` | `advice` |
| 16 | 单调性判据把重叠行算进去 | 判据口径错 | 只看本屏新行 | `advice` |
| 17 | STALL 误判（`1天前` 当好友名） | 属性当身份 | `name_of` 跳过天数标签 | — |
| 18 | 跨桌面 5 次挡住任务 | 桌面与屏幕被当成两件事 | 借用并入授权 | `cross-desktop` |
| 19 | 抓帧只信 fast/EWMH，与 strict 相反 | 裁决者选错 | strict 独裁 | `world-entry` |
| 20 | 交还目标错成 `素材快收[Tk]` | `prev_active` 未优先用户窗 | begin 取 firefox 桌面 | — |

## 三、三条系统性根因

1. **"一次性的限制被当成永久约束"**（#11 #12 #13 #17）：窗口 id、单批 clicks、视口行数、属性值——
   都是"当下这一刻的读数"，却被写进常量或判据。**修法不是改值，而是让"读"发生在运行时**。
2. **"多仪器/多通道对同一事实读数冲突，而没人写谁权威"**（#2 #19 #20 + 4 条 open 真债）：
   fast vs strict、XShm vs import、`ys-wins` vs `kwin-state`。**修法：每个事实指定唯一裁决者，其余降级为提示**。
3. **"测组件不测接缝"**（#14 #15 #16）：单测全绿而主入口崩、夹具丢失而门禁静默变红。
   **修法：每条新能力必须有一条门禁跑"生产入口"，而不是跑它的内部函数。**

## 四、流程与方法论教训

- **用户三次纠正我的"分析"**（不是修 bug，是分析方法）：第一次我把"任务 9 分钟"归因到 read_image；
  第二次我以为是删除界面；第三次才问到"为什么模块不主动发现笨办法"。→ **归因先问"瓶颈在哪一层"，别先修看得见的那个**。
- **"人类 5 秒"是最硬的标尺**：它一眼看出 39s 与 5s 的差距不是"慢"，是"没有 seek"。
- **诚实建议 > 乐观建议**：`LINEAR_ONLY_NO_SEEK` 比"二分估算"更有用，因为后者不可执行。
- **每个失败都要带下一步**：`explain` / `next_action` 之后，模型不再瞎试（对比翻车 3 次的 cross-desktop）。
- **测试不许碰真屏**：用户三次听到"已完成后的操作音"，根因全是测试在抬窗/注入。

## 五、未闭合（按优先级）

1. **seek 能力**（`scrollbar-det` 队友在做）：滚轮饱和 ~7 行、拖动 0.2–0.45 rows/s、键盘待用**分两条注入**重测、
   滚动条像素通道可检（f10/f11 双边缘 x=2422..2434）但容器层不可见。
2. **4 条 open 真债**：全是"仪器读数冲突"，需要统一裁决者（与根因 2 同族）。
3. **对象检测 32–35ms vs ≤10ms**（3× 欠账）。
4. **首行名字被视口上缘裁掉**：本次靠上滚 2 行补拍解决；`scan_session` 应在命中后**自动上滚一轮确认**。

## 六、产出清单

- 代码：`ys-session`（占用会话）、`ys-hand-back`（唯一交还）、`ys-advice`（策略建议）、
  `ys-scroll`（分批 + `--rows`）、`ys-capture`（auto 窗）、`ys-screen-grant`（explain/租期/桌面借用）
- 门禁 21 条：lookd-wedge / capture-liveness / scroll-movement / state-precedence / screen-grant /
  grant-expiry / no-xbell / no-dead-window-id / world-entry / cross-desktop / advice / skill-coverage / …
- 技能：`gui-world-state`（项目，含 §4.5/§4.6/§4.7/§11）、`gui-perception-loop`（全局，含任务级工作法、单批≠总量）
- 账本：64 条（60 有机械防线）
- 记忆：D459–D473
- 真机证据：`.scratch/gui-service/evidence/realrun-20261021/{boundary*.png,boundary_name.json,main*_run.out}`
