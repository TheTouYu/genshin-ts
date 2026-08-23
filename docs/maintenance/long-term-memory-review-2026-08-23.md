# 长期记忆复盘：genshin-ts 主战场（最近 3 天）

> 审查对象：`/home/h/genshin-ts` + `/home/h/genshin-ts-ui`（genshin-ts 主战场，多会话）
> 评判标准：记与忆双循环——记（结论是否沉淀到可检索载体并能被查回）· 忆（需要时是否触发通道并命中复用）· 跨项目（通用规则是否上枢纽、能否跨项目忆回）
> 时间范围：2026-08-21 00:00 ~ 2026-08-23 17:16（共扫 26 个会话，8 个 genshin-ts + 5 个 genshin-ts-ui 做深读；其余 08-21 02:01 批量 mtime 的为历史归档，未逐个深读）

## 忆量化基线（本轮锚点）

| 仓库 | PKC 知识树 | 检索评估（golden-set） |
|---|---|---|
| genshin-ts | 13 nodes / 74 topics / **320 claims** | 59 cases 通过 51，retrieval_miss=0，coverage_gap=0，top3_recall=1.0，dangerous_wrong_routes=0 |
| genshin-ts-ui | 13 nodes / 72 topics / **316 claims** | 59 cases 通过 59，retrieval_miss=0，coverage_gap=4，top3_recall=1.0，dangerous_wrong_routes=0 |

结论：PKC 层非常健康——树里 320/316 条 claim，语义/降级检索 top3 召回 100%，危险的错路由为 0。**瓶颈不在知识树内容，而在"触发"与"落盘到 git"这两个环节。**

## 任务全景

| 会话 | 时段 | 干了什么 | 阻碍 |
|---|---|---|---|
| S4d33a5b2（18MB） | 08-20→08-21 | 魔方 2x2/3x3 + 足球场圆弧 + 草皮/地形差分学习 | 0 次 PKC/历史检索（before 锚点），纯靠技能+差分 |
| Sf97f1e8b / Sfd36c853 | 08-21 | /game-from-scratch 建足球 demo，草皮/足球场差分学习 | 圆弧旋转/罚球圆弧多画，用户多轮指正 |
| Sa296f579（5.2MB） | 08-22 | 3×3 魔方 bug 马拉松：黑面→无响应→节点超限→负载踢出 | 91 次 llm/retry、35 次 checkpoint、5 error/2 max-tokens/4 aborted |
| S9ea9df32 / S5d39749f / S86a1d800 | 08-22 | 悬空 exec 检出 + 3×3 并行修复 + 元件/实体差分 | 高 retry、高 checkpoint，多会话并行同一任务 |
| S79710577（6.4MB） | 08-22→08-23 | 知识树录入主战场：元件三层→删除四层、装饰物不透明度 f3A、坐标两套体系 | 63 次 PKC 实际调用，knowledge-plan 全链正常 |
| S3531ada3（3.1MB） | 08-22→08-23 | 复合节点资源包学习/复刻 → 13 类资源库 + 两轮 bundle 录入 | 51 次 PKC，plan 因 baseline 前进 rebase 数次 |
| S56d97ae9 | 08-22→08-23 | 灯阵 lights-out v7 难度重构 | 难度梯度返工，goal 数轮 |
| S4a89eb1a | 08-23 | 3×3 求解器落到节点图运行时（活跃中） | 只到"可解第一层"，渲染/UI/游戏验证未做 |
| S7bcaf46f | 08-23 | 足球物理修复（活跃中） | 球躺平→旋转方向→摩擦力→日志模块 |
| UI-c31d4878（10MB） | 08-21→08-22 | UI 资产生成 + 素材库注入地图差分 | 存档损坏、字段错配，差分多轮 |
| UI-95091d89（5.3MB） | 08-22→08-23 | UI 引导闭环 + 知识落地 + 生产力 CLI | 差分不能省、删除能力补做 |
| UI-187a3812 / 7b0bd7b9 | 08-22→08-23 | task-trace-review + 把历史复盘流程做成全局技能 | 这就是本技能（long-term-memory-review）的诞生会话 |

## ① 障碍排序（按打断程度）

| 排名 | 障碍 | 证据 | 性质 |
|---|---|---|---|
| 1 | 卡住后第一动作不是检索：节点预算/定稿方案已在知识树，却靠用户多次点破才去查 | Sa296f579 11:57 报"节点数超限回归"→ 直到 12:42 用户明确"搜历史会话找定稿计算方案"才触发 `dsh-session-history` + `pkc query`；该会话 12:21 前实际 PKC 调用 = 0 | 记忆缺失（纪律缺口） |
| 2 | llm/retry 高频打断 | Sa296f579=91、S79710577=108、S5d39749f=102、S9ea9df32=90 | 记忆无关（基础设施） |
| 3 | 上下文压缩高频，会话结论易蒸发 | Sa296f579=35 次 checkpoint、S79710577=36 次 | 记忆漂移风险 |
| 4 | 已闭环结论/知识未落盘到 git | 两仓库均有大量 modified/untracked（详见 ②记侧） | 记忆缺失（记侧滞后） |

## ② 记/忆双侧断点清单

### 忆侧（想不起来 → 修通道，不重复加知识）

- **没查（纪律缺口）**：Sa296f579 在 08-22 12:20 前 0 次 PKC/历史检索，用户两度提醒（12:20"把上下文写知识树"、12:42"搜历史会话"）才开始查询。载体里已经有 `节点<3000拒载/有限循环/预算公式`（clm_213B9BC24、clm_2637768577 等），检索一次就能命中。修法已由 AGENTS.md（0a29251"复合节点资源库可发现性"+ 8d63e6f"任务迭代节奏固化"）覆盖，本轮不需再加知识，只需在后续会话验证该触发真的被执行。
- **查错方式基本已修**：08-22 后 AGENTS.md/CLAUDE.md 已强制 `--level 2`（hub 提交 541c289 修默认 level 1→2），progressive-query 中文长句 coverage gap 也已有降级链。本轮实际调用里 `--level 2` 已普遍出现，说明纪律在收敛。
- **跨项目已接**：`dsh-session-history` 全局技能 + `pkc-project-operator` 全局技能在两仓库都在用；全局"记/忆复盘"流程本次已固化为 long-term-memory-review 技能（枢纽），推进这类检查不再靠人提醒。

### 记侧（没沉淀 → 补介质，优先 git 落盘）

- **git 未落盘（最高优先）**：
  - genshin-ts 工作树：13+ 个 `src/` 核心文件修改未提交；`docs/game-engine-knowledge/retrospective-2026-08-21-dangling-exec-fix.md`、`-orientation-table-convention.md`、`-rubik-performance-p0-1.md` 三个复盘文档 untracked；`data/knowledge/bundles/bnd_a1fc4455...json` + `.approval.json`、`bnd_fab275183...json` untracked（其中 bnd_a1fc4455 在 S79710577 已 approve+apply、bnd_fab275183 在 S3531ada3 已 approve+apply，但 bundle 数据文件没提交）；`examples/rubik-3x3/`、`examples/cube-replica-c4/`、`examples/football/evidence/` 等 untracked。
  - genshin-ts-ui 工作树：一批 `src/cli` 修改 + `docs/game-engine-knowledge/retrospective-2026-08-21-football-field-arcs.md`、`retrospective-2026-08-21-orientation-table-convention.md`、`terrain-grass.md` untracked；`resources/first-save-template.gil`、`examples/football/`、`examples/ui-interact-test/` untracked；`assets/images/guide-arrow-right.css` 已删除未提交。
- **账本**：`docs/maintenance/open-items.md` 已存在且维护良好（本次已追加开放项，见文末）。
- **权威文档/技能**：知识落盘节奏健康（足球逐次修复都挂 retrospective + 技能补行 + open-items 登记；UI wire 规则 δ 验证后落 `docs/game-engine-knowledge` 并 bundle-apply）。

## ③ 当前障碍（被审任务此刻卡在哪）

1. 3×3 求解器（S4a89eb1a，活跃）：当前"可解第一层"，尚未接入自动求解交互渲染 + 实体设置选项卡组件 + 用户游戏核验。
2. 足球（S7bcaf46f，活跃）：正做"变量 tag 日志模块"复合资产（固定标识搜日志），待回读核验。
3. UI（UI-95091d89）：15:56 测试通过，清理/删除能力、产物与 CLI 收尾尚未全部提交。
4. 两仓库工作树未提交积压：已闭环知识/复盘/样例/bundle 数据文件缺乏 git 落盘，存在丢失与污染风险。

## 优化落地清单（按 trace 证据）

- **提示词类**：见「继续提示词」三块；核心是"缺信息先查 PKC --level 2，查不到再动手"。
- **命令工具类**：`portable-knowledge/tools/memory-health-report.py` 的 `pkc query ... --status any --format json <词>` 已与 rc5 CLI 不一致（`--status` 报 unrecognized arguments），导致一键健康报告不可用，本轮基线只能手工 `tree`+`query`+`evaluate_pkc_retrieval.py`。**这是枢纽工具 bug，按本轮约定不升级枢纽，仅登记为跨项目 OPEN。** 两仓库自身的 `tools/evaluate_pkc_retrieval.py` 可用，继续当检索基线。
- **技能知识类**：本轮不再往技能/AGENTS 重复加"检索纪律"文本（已有 0a29251/8d63e6f）；待验证的是执行率，不是内容。若下一轮复盘中"卡住第一动作是检索"仍未上升，再回来强化触发条件。
- **文档类**：本报告 + open-items 追加（本次已做）。

## 继续提示词（给被审查的活跃会话）

1. **3×3 求解器（S4a89eb1a）**：先查 `python tools/pkc.py query "rubik 3x3 solver 状态转换 面转 十字" --level 2` 读取刚落的求解器/离线表记忆，再把"解第一层"接入转动渲染 + 实体设置选项卡组件节点图，注意大循环>20 次用定时器分片负载均衡；完成后回读 GIL 核验再让用户游戏测试。
2. **足球（S7bcaf46f）**：按用户 17:04 建议做"变量 tag 日志复合资产"（固定标识 + 数据类型转 str 存变量，日志记原始帧可 grep 固定标识）；完成后把该模式写进 `debug-log-investigator` 技能与 `docs/composite-library`，并落 PKC 知识树 bundle。
3. **UI（UI-95091d89）**：把 15:56 通过的"删除/清理"能力与素材注入 CLI 收尾，逐小点提交；已闭环的 UI wire 规则先查 `docs/game-engine-knowledge` 是否已落（避免重复推导），缺的走 knowledge-plan 录入。

## 本次落地改动清单

| 仓库 | 落地 | 内容 |
|---|---|---|
| genshin-ts | 已提交 `aae4c67`（活跃足球会话顺带提交，commit 消息未显式提及） | open-items.md 开放项登记（8 行） |
| genshin-ts | 本提交 | long-term-memory-review-2026-08-23.md 复盘报告 |
| genshin-ts / genshin-ts-ui | 由各自活跃会话自行小步提交（AGENTS.md 已授权） | 见 ②记侧 / ③当前障碍 的积压清单 |

## 最高收益 1 条

**修"卡住第一动作不是检索"**（Sa296f579 节点超限回归被用户点破才去查历史/知识树，白耗约 40 分钟）。载体内容已具备（320 claims，top3 召回 100%），剩下的只是执行触发——把"缺信息先 `pkc query --level 2` 再动手"变成任务进行中的第一动作，而不是等用户提醒。

## 规则反馈检查

- **不一致**：hub 的 `memory-health-report.py` 仍用旧 `--status` 调用，与 rc5 CLI 不一致（登记跨项目 OPEN，本轮不动 hub）。
- **证据**：本报告全部编号可对应 `~/.dsh/sessions/--home-h-genshin-ts--` 与 `--home-h-genshin-ts-ui--` 的 session.jsonl.zstd + 两仓库 git log/status。
- **更新的最小文件**：`docs/maintenance/long-term-memory-review-2026-08-23.md`（新增）、`docs/maintenance/open-items.md`（追加 OPEN）。
- **未推广的局部经验**：genshin-ts 的 knowledge-plan 全链 + retrieve 验证（`query --level 2` 命中即算记成）已在 `pkc-project-operator` 全局技能中覆盖，不算未推广；真正未推广的是"卡住先检索"的**执行纪律**，需靠每轮复盘的检索率指标来闭环。
