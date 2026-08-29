# 元复盘：二轮复盘任务的执行过程（2026-08-29）

> 状态：当前推荐（元复盘——对「二轮复盘 R0-R3」本身的任务级复盘）
> 范围：二轮复盘任务全流程（R0 基线 → R1 族细化 → R2 PKC 扩容 → R3 验证提交）
> 证据：本会话 5 笔提交（bde71d3 / c9457a5 / fc49a3f / 951a93e / 7164981）+ PKC 三个 bundle
>   （bnd_81d5378d / bnd_f5dc558f / bnd_253802ff）+ 用户 6 项裁决记录 + open-items O-2026-08-29-10
> 视角：不评复盘结论本身（已交付），只复盘执行过程——哪里绕了路、哪些纪律被自己复现

## 一、执行错误谱系总览

| # | 层 | 具体错误 | 根因 | 处理 | 成本
|---|---|---|---|---|---|
| 1 | 工具环境 | run_code 模板字面量内联大段 Markdown：反斜杠转义序列变成字面量污染文件 ×1、
  | 语法错误 Expected ',' got '=' ×1 | 与 08-28「正则转义被 JS 模板字符串吃掉」同族（该教训只写了正则版，
  | 没抽象成通用纪律） | 拆分小步重写；确立「大文本先 write 落文件」 | 低（两次重试） |
| 2 | PKC 流程 | capture --file 的 DRAFT schema 在技能/帮助里均无文档 | 契约文档覆盖缺口（按技能纪律未深挖实现，选择正确） | 改走交互式 plan（init→add-claim→add-authority-ref→delta→finalize，40+ 命令） | 中（命令量大但可靠） |
| 3 | PKC 流程 | 批量脚本给同 topic 的第 2 条 claim 仍带 topic 元数据 → PLAN_TOPIC_INVALID | 元数据仅在创建 topic 时有效，脚本未处理 | 拆分脚本：首条带元数据、后续只带 topic-id | 低 |
| 4 | PKC 判读 | bundle-apply 报 PLAN_POST_APPLY_EVALUATION_FAILED（exit 1），最初按「apply 失败」定性 | 事务其实已落盘（validate ok、357 claims、.applied.json 在）——评估门失败 ≠ 事务失败 | 先 validate / bundle-status / tree 定性，再处理评估门 | 中（误判方向一次） |
| 5 | PKC 检索 | 新 R12 topic 把评估用例期望 topic 挤出 top-3，三连修仍未绿 | 只看到「关键词竞争」表象；实际是 claim 标题也参与排名 + 最终根因=新知识语义合法重叠 | 逐层实测排名；夹具 expected_topic_ids 增加新 topic（用户批准） | 高（三个 bundle + 三次 hash 门） |
| 6 | PKC 基线 | 新 plan full preflight 把 6 条新 ref 判 missing、2 条阻塞 finalize；update/refresh-authority-ref 报 not found | apply 后 PKC 状态未提交——新 ref 不在 committed 基线；提交后 rebase 又冲突（authority-refs.json 跨基线变化） | 提交落盘（fc49a3f）→ rebase 冲突 → abandon 重 init 重做 | 高（连环三跳） |
| 7 | 知识判读 | 覆盖率矩阵 v1 把 R11 PKC 标红「未入树」 | 建表时未经 query 查证就断言——R10 族「推断必须标 inferred」纪律在自己身上复现 | R2 dedupe 查证修正为绿（六条历史 claim 早就在树） | 低（修正即绿，但暴露纪律盲区） |
| 8 | 入口同步 | v2 四件套落盘后未同步 index.md 复盘档案导航 | docs/AGENTS.md 常见坑第 1 条「只改内容不同步入口」复现 | 本轮补 index 导航 | 低 |

## 二、最大一课：PKC 评估门连锁（#4-#6 完整调查链）

现象：主 capture bundle（bnd_81d5378d）apply 后 exit 1，报评估用例 full-closure-and-id-integrity-1 失败。

调查链（每一步都是实测，不猜）：
1. validate/tree 取证：357 claims 已在树、.applied.json 已落盘 → 定性为「事务成功，评估门失败」而非「apply 失败」（#4 教训）。
2. 实测评估 query：新 R12 claim 排名第 3（score 0.25），旧期望 topic closure-and-id-integrity 被挤到第 4 → 断言 topic_top_n=3 失败。
3. 第一杠杆 topic 元数据（官方杠杆）：去「静态/拼装」关键词 + 改题 → 仍红（claim 标题也参与排名）。
4. 第二杠杆 claim 标题措辞（clarify）：去「静态拼装族」短语 → 仍红。
5. 才看清根因：我的新 claim 讲的就是「模板 ID 审计/引用完整性」——它命中该 query 是**语义合法重叠**，不是措辞撞车。
6. 第三杠杆评估夹具：expected_topic_ids 增加 static-assembly-family（语义断言不变）——用户批准后恢复绿。

旁支（#6）：修标题的小 plan finalize 被 2 条新 ref「missing」阻塞——根因是 PKC 状态未提交，
新 ref 不在 committed 基线；提交后 rebase 因 authority-refs.json 跨基线变化冲突，最终 abandon 重来。

## 三、系统性根因（3 条）

1. **「先查证再断言」纪律对元层同样适用**：#7（矩阵标红未查证）与 #4（exit 1 先按失败定性）同族——
   我对引擎/图行为守铁证，但对自己产出的「知识库状态断言」「工具返回码判读」没有先取证。
   规则：任何 已入树/未入树/已应用/未应用 类断言，先跑 query/validate 取证，否则标「待查证」。
2. **PKC 多计划生命周期经验整体缺失**：apply 与提交的时序耦合（#6）、评估门与事务的分离（#4）、
   检索竞争的三级杠杆与夹具更新（#5）——三条都指向同一缺口：技能与 common-errors 只覆盖了
   「单 bundle 单会话 capture」，没有「capture 之后的连续维护」。本轮是项目第一次在一天内做
   3 个 bundle + 跨提交边界的 plan，暴露是必然的。
3. **工具环境教训写窄了**：08-28 只沉淀了「正则转义」版本，没有抽象成「run_code 内联大文本
   统一走 write 工具」的通用纪律，于是本轮踩了同族的反引号版本（#1）。M20 同族扩展扫描的欠账。

## 四、流程与方法论教训

**做得对（保持）**：
- 复用 v1 表结构 + 批量抽取 34 份文档的错误谱系表，没有逐份重读——上下文成本大幅下降。
- 地图盘点用后台作业 + 与读旧复盘并行；34 vs 32 的差异不猜，实测目录后列差异清单交用户裁决。
- L3 门 3 次精确 hash 确认、L4 提交单独授权、地图全程只读零写回——权限纪律零违规。
- dedupe query 先行：R11 六条、M7/M8/M13/M15 查证已在树，免重复 capture（省 6+ 条重复 claim）。
- 「按族一条 claim」约束遵守：18 条新 claim 对应 6 族 + 12 方法论，无逐文档碎片化。

**绕路的（改进）**：
- 评估门连锁消耗约一半轮次——如果开 capture 前先补查「维护场景」文档，或先把 PKC 状态
  提交再开第二个 plan，能省 3 个 bundle 里的 2 个。
- #5 的前两杠杆（topic 元数据、claim 标题）是「合法杠杆但没先诊断根因」——应先跑一次
  评估 query 看排名构成（claim 行 vs topic 行、各字段命中），再决定改哪层。

## 五、风险与未闭合项

- O-2026-08-29-10 已登记：post-apply 评估门对 affected_by 不相交用例也阻塞，待 PKC 维护轮确认。
- 本轮 PKC 三条新经验（#4/#5/#6）已落 common-errors §14 文档；是否作为 claim 入树待定
  （入树需再走 L3 hash 门，按克制原则先放文档层）。
- 魔方客户端优化版本 SHA 差异（496e1b5d vs f90ac5438c）照录在覆盖率矩阵 §5，引用旧结论前先核版本。

## 六、产出清单（本轮元复盘迭代）

- 文档：本复盘 + index.md 复盘档案补 v2 四件套入口（总纲 v2 / 族卡片 / 地图矩阵 / 覆盖率矩阵）+ 本复盘链接
- 权威文档：docs/project-intelligence/knowledge-capture-common-errors.md §14（PKC 三坑：同 topic 多 claim 元数据规则 / apply 后先提交再开 plan / post-apply 评估失败≠事务失败 + 检索竞争三级杠杆）
- 技能：gil-node-graph-reading Step 2.6 补「run_code 模板字面量反引号 + 大文本用 write 工具」同族一行
- open-items：O-2026-08-29-10（上轮已登记，本轮不改）
- 提交：本复盘 + 迭代文件（分主题）
