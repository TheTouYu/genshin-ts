# 长期记忆复盘·第二轮：检索触发率实测 + 触发器补强（2026-08-23）

> 审查对象：`/home/h/genshin-ts`（+ genshin-ts-ui）+ 枢纽 portable-knowledge（工具/技能）
> 评判标准：记与忆双循环 · 跨项目
> 时间范围：2026-08-21 ~ 2026-08-23 18:20（承接上一轮 `long-term-memory-review-2026-08-23.md`，本轮聚焦上一轮留下的 B/C：把「检索触发率」变成可重复指标并用它验证执行率）

## 结论（先用一句话）

**忆侧触发仍是最大短板**：用新落地的量化工具实测，近 3 天主战场「卡住点→第一动作是检索」的触发率 **≈6%**（远低于 70% 达标线），且集中在「节点预算/帧数超限」这类高频场景——载体里规则齐全（clm_213B9BC24 等，`--level 2` 一查就中），但第一动作仍是拆图/测量/读源码，而不是查 PKC。**记侧已收敛**：新得出的规则已被 ca7b0be 落盘 + 账本健康 + 两仓库 tracked 文件无积压。

## 忆量化基线（本轮锚点）

| 仓库 | PKC 知识树 | 说明 |
|---|---|---|
| genshin-ts | 13 nodes / 74 topics / 320 claims（与上轮持平） | 树健康，瓶颈不在内容而在触发 |
| genshin-ts-ui | 13 nodes / 72 topics / 316 claims（上轮值） | 同左 |
| 检索验证 | `query "预算 3000 有限循环 截断 拒载" --level 2` → 5 hits，clm_213B9BC24 首位 | 预算硬限规则可被关键词召回 |

## 检索触发率实测（新工具，可重复）

工具：`portable-knowledge/skills/long-term-memory-review/scripts/retrieval_trigger_rate.py`
口径：TEXT 命中障碍词（卡住/不确定/超标/超限/预算/coverage gap/not sure…，排除「0 失败」等成功汇报）记一个卡住点 → 看下一个 tool/call 是否记忆调用（pkc / dsh-session-history / 读技能 / 读 docs→knowledge→AGENTS）。

| 会话 | 卡住点 | 检索 | 触发率 |
|---|---|---|---|
| a296f579（3×3 预算马拉松，上轮点名） | 96 | 4 | 4% |
| 79710577（知识录入主战场） | 114 | 6 | 5% |
| 4a89eb1a（3×3 求解器，本轮活跃） | 14 | 1 | 7% |
| 3531ada3（复合资源包） | 18 | 4 | 22% |
| **合计（本轮扫 11 个主力会话语义）** | **667** | **42** | **6%** |

口径说明：这是**粗粒度下界**——「预算」一词在预算核验循环里出现大量成功汇报/迭代核对，把分母冲高；
但它不影响方向性判断。逐条证据里的铁证两个：

1. **Sa296f579 08-22 11:57→12:44**：用户点破「节点超限回归」后，第一动作一直是「读节点数规则文档 / 读 PROGRESS / 读预算源码 / 注入测量」，直到 12:44 才 `dsh-session-history` 搜定稿公式——又是用户 12:42 提醒之后。预算硬限规则（clm_213B9BC24）在 PKC 里始终可查。
2. **4a89eb1a 08-23 18:03**：「game 主图 3054 超标，我先前归因错了」→ 第一动作是「拆 game 主图组成」，不是 `pkc query`。这正是上轮预言会复现的同一类缺口。

**纪律在慢慢变好但没达标**：08-23 的新会话里「卡住三问 → Query PKC」的引用明显增多（3531ada3 22%，且 79710577 出现「先查知识树现状」「Query PKC for motion device knowledge」等），说明 08-22 写的「信息检索优先级」在生效；但「预算/超限」这个最高频、最烧时间的场景没有被单独触发词覆盖。

## 本轮落地改动

| 仓库 | 提交 | 内容 |
|---|---|---|
| portable-knowledge | 本轮 | `skills/long-term-memory-review/scripts/retrieval_trigger_rate.py`（新工具：检索触发率量化，B 项）+ SKILL.md Phase 2 & session-depth-analysis.md 接入该脚本 |
| genshin-ts | 本轮 | AGENTS.md「信息检索优先级」加**预算超限高频触发词**：先 `pkc query "预算 3000 有限循环 截断 拒载" --level 2` + `dsh-session-history` 找定稿公式，再动刀测量 |

## 记侧结论（沉得住）

- **已闭环未提交 = 0**：genshin-ts / genshin-ts-ui 的 tracked 文件均无 modified（只有 `.dsh/`、`.jspace/` 等工具垃圾 + 2 个 tmp 文件 untracked），上轮清积压的成果守住了。
- **新规则已落盘**：4a89eb1a 这轮新得出的「节点预算真值在游戏不在本地工具 / 超限先删图差分定位 / 根图事件回调≠图开始」已进 ca7b0be 复盘文档 + 技能迭代。
- **账本健康**：open-items.md 维护到 O-2026-08-23-1（3×3 求解接线清理残留），证据链完整。

## 规则反馈检查（本轮）

- **不一致（已修）**：上一轮 B 项说「缺一个可重复的检索触发率口径」——现已闭环为脚本 + 接入技能，下轮不再靠人肉读轨迹。
- **更新的最小文件**：`genshin-ts/AGENTS.md`（+1 段触发词）、`portable-knowledge/skills/long-term-memory-review/{SKILL.md, references/session-depth-analysis.md, scripts/retrieval_trigger_rate.py}`。
- **未推广的局部经验**：「超限先查规则再测量」这条触发了 2 个项目面（genshin-ts + skills 引擎），已是通用纪律，不应只留在 genshin-ts——但当前只有 genshin-ts 有「节点预算」这一具体语境，先落在主战场，若其他项目复现同类「硬限打回」再上枢纽通用化。
- **留待下一轮/活跃会话**：ca7b0be 的新规则（节点预算真值在游戏）目前只在 docs+技能，**未进 PKC claim**（320 条未变）；应由活跃 3×3 会话走 `pkc-project-operator` knowledge-plan 入库（L2，需 hash 审批，复盘者不自审自批）。

## 继续提示词（给活跃的 3×3 求解器会话 4a89eb1a / 足球会话 7bcaf46f）

1. 预算/帧数类问题第一步按 AGENTS.md 新触发词查 PKC + 历史，别直接拆图。
2. 「节点预算真值在游戏不在本地工具 / 删图差分定位 / 根图事件回调」这几条规则已进 docs+技能，顺手用 `pkc-project-operator` 走 knowledge-plan 落 PKC。
3. 收尾时把 `test_dangling_3x3_tmp.ts` 与 `basic_tool.lean.js` 这两个 untracked 文件确认归属（临时脚本删掉或归档），别留进下一次提交。
