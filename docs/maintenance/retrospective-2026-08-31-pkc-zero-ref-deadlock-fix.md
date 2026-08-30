# 完整复盘：PKC 零 ref claim 死锁上游修复 + 跨仓库批量升级（2026-08-31）

> 范围：O-28-10⑤ 死锁的复现（R0）→ 上游修复+红绿测试（R1/R2）→ genshin-ts 升级与 claim 修正 apply（R3/R4）→ 批量升级其余 PKC 仓库
> 视角：上游工具语义修复 + 多仓库运维 + DSH 会话工程，三类坑各成谱系
> 证据：本项目 8dd5fab/ac62d33/b8526c8/b9db96a；上游 bccf0c9/0c86356/9e94413/112703a/cedc078；ui 22adfd9；abl 53bdc35；
>   设计文档 docs/maintenance/O-28-10-pkc-deadlock-round0-design.md；上游测试 test_semantic_plan_contract.py（198 OK）
> 状态：全链闭合（上游测试固化 / 本项目 claim 落地并提交 / 4 仓库升级完成 / 1 仓库安全回滚待既有债修复）

## 一、错误谱系总览

| # | 层 | 具体错误 | 根因 | 处置 | 提交 |
|---|---|---|---|---|---|
| 1 | DSH 会话工程 | run_code 模板字面量含反引号/markdown 代码标记与美元花括号插值序列，解析失败 ×2 | 大段含特殊字符文本内联进 JS 模板字面量（08-28 正则版、08-29 技能登记版的同族新变体） | 转义后重写成功；纪律确认：大段文本一律 write 工具或 bash heredoc | — |
| 2 | DSH 会话工程 | bash 脚本误当作 run_code 的 code 参数（解析报 Expected 括号） | 复制粘贴通道混淆 | 包装进 tools.bash | — |
| 3 | DSH 会话工程 | 变量名笔误（r 与 sc 混用）、bash 调用缺 description ×2 | 手误 | 即改 | — |
| 4 | 上游仓库契约 | fad3dad（前身技能登记提交）把源项目名/个人绝对路径写进 SKILL.md 与 long-term-memory-review 参考文档，全量测试被 test_repository_contract 拦下 | 技能/文档类提交未跑契约测试（上游无此提交纪律） | 全库扫描定位仅 2 处 → 脱敏 → 198 测试绿 | 0c86356 |
| 5 | 批量脚本 | plan_hash 误用文件字节 sha256；实际是 plan 内嵌 canonical 哈希 | 写摘要逻辑前未读 apply-plan 校验实现 | 首个 apply mismatch 暴露（无副作用）→ 读源码修正脚本 | 112703a |
| 6 | 批量脚本 | 统一 --project-check "npm run build" 对 genshin-ts-ui（无 build 脚本）/AI-Brand-Lab（非 npm）/上游（Python 仓库）不适用 | 批量操作假设项目同构（上轮「--all-stale 范围未先读」教训的同族变体：批量参数未逐项目核实） | plan 阶段不执行检查故未污染；apply 前按项目重出 4 份计划 | — |
| 7 | 环境 | star-cube-nexus 既有 TS 错误（src/cube2/demo-turn.ts TS2345 两处）挡住 typecheck | 项目自身既有债（与本波无关） | project-check 正确拦截 + 自动回滚旧 runtime；报备用户，未静默换弱检查 | — |
| 8 | 流程 | 上游自举 apply 报 target Git state changed after planning | 出计划后源仓库又提交（9e94413/112703a），防漂移守卫生效 | 用最新 commit 重出计划再 apply | — |
| 9 | 观察 | 并行会话两次穿插 genshin-ts 提交（fcea719 在本波两提交之间；信号组三连 3af8745/1f5cd06/38fc35c 在 b9db96a 之后） | 多会话并行常态 | 全程精确暂存 + 提交前 status 核对，零冲突零污染 | — |

## 二、关键调查链：死锁四墙与修复（方法重于结论）

1. 读实现而非盲试（对上轮教训的直接闭环）：第 0 轮先读 semantic_plan.py，快速画出四墙判定路径——revise 写 existing_claim_changes(502)、add 只认 plan 内新 claim(576) 且指引 refresh(580)、refresh 需 ref 已存在(779-781)、check 强制 coverage(1053-1055)。对比上轮三次盲试才读码，本轮零试错。
2. staging overlay 洞察把修复面压到最小：check 1048 行 all_refs 读自 staging overlay（含本计划 writes）——只要 add 放行，1052/1054 两道校验自动满足，check/finalize 零改动。修复收敛为 add_authority_ref 单函数入口分支，claim 上下文（fact_classes/permission）取自 staging baseline parse（parse_claims 自带），校验强度不减。
3. 红绿 + 守护：新用例 RED 确认失败点正是墙 1；修复后 GREEN；1707/1728 守护用例不改而绿 = 「有 ref 仍拒」语义收窄的证明。同族扩展：grep existing_claim_changes 全部 7 处引用，确认仅 add 入口有此拦截形态，refresh/retire/update 均按 ref_id 操作无同族风险——单点修复即完整修复。
4. 复现证据对账：四错误码与 open-items 登记逐条对照（PLAN_CLAIM_REVISED_NEEDS_REFRESH / PLAN_AUTHORITY_REF_MISSING / PLAN_CLAIM_AUTHORITY_INSUFFICIENT + 对照 PLAN_CLAIM_MISSING），补全了当时未落码的 refresh 错误码，复现现场 abandon 清理。

## 三、为什么出问题——系统性根因

1. 上游公开资产缺「提交前契约自检」防线：fad3dad 先例说明技能/文档类提交可以不跑 test_repository_contract 就进主干。已补：上游 AGENTS.md 提交纪律新增一条（公开资产提交前必须过契约测试；且规则文本本身不得引用禁词——本波写规则时用禁词举例再次触发扫描，二次实证连例子都不能写）。
2. 批量操作的同构假设：--all-stale（上轮）与统一 --project-check（本轮）同族——批量入口把「单条语义」外推到全体。本轮已把批量升级工具化（幂等跳过 + 摘要报告 + 人审 apply），并在 MODES.md 明示 --project-check 必须逐项目为真。剩余改进（脚本内做 project-check 存在性预检）登记未闭合，不在本波膨胀。
3. plan_hash 语义只有读实现才知道：两阶段升级的哈希校验语义（canonical 内嵌哈希）无文档直述，靠 mismatch 实测暴露。已在脚本注释 + 本复盘双落点修正；下次走批量脚本不会再接触该细节。

## 四、流程与方法论教训（正收益）

- 计划-人审-apply 两阶段在批量场景三次正确拦截：nexus typecheck 失败回滚、上游 git 漂移拒绝、plan_hash mismatch 拒绝——全部零副作用，证明「先出计划再动 target」的守卫链值得在所有多仓库运维中沿用。
- 精确暂存 + 提交前 status 核对在并行会话穿插环境（两次）零冲突。
- 方案先行 + 用户裁决（候选 A/B/C 报裁决再动上游）：修复方向零返工。
- 上游先行 + 项目跟进的升级链（修复 → 测试固化 → plan-upgrade → 复现场景 → bundle 审批）全程无 PLAN_* 错误。

## 五、风险探索与未闭合项

| 项 | 状态 |
|---|---|
| star-cube-nexus 既有 TS 错误（demo-turn.ts TS2345 两处）+ runtime 仍 fe838a0 | 待项目侧修复 typecheck 后跑批量脚本一条命令升级（已报备用户，未静默换弱检查） |
| O-2026-08-29-11 全库 stale refs 维护轮（126 条） | 独立维护轮，本次未触碰；零 ref 修复后其工具条件不变 |
| genshin-ts 工作树历史未跟踪残留（7 个旧 bundle json + 杂项文件） | 非本波产物，留用户处置 |
| batch_plan_upgrade 的 project-check 存在性预检 | 登记不做，避免范围膨胀；当前靠 MODES.md 纪律约束 |

## 六、产出清单

- 上游 portable-knowledge：修复 bccf0c9（+红绿用例+契约段）/ 技能同步+脱敏 0c86356 / 批量脚本 9e94413+112703a / 自举升级 cedc078；198 测试全绿
- 本项目 genshin-ts：R0 复现+设计 8dd5fab / 裁决落档 ac62d33 / 升级 b8526c8 / bundle apply+O-28-10⑤ 闭合 b9db96a
- 其他仓库：genshin-ts-ui 22adfd9、AI-Brand-Lab 53bdc35（均升级至 0c86356）
- 文档：O-28-10-pkc-deadlock-round0-design.md（复现记录+方案）+ 本复盘
- 技能/契约：SKILL.md 零 ref 新语义（全局 4 安装位已 install-global 同步）、MODES.md 批量脚本指引、上游 AGENTS.md 公开资产提交纪律、batch_plan_upgrade.py 新工具
- PKC 知识：clm_CAE30537 按钮字典精确映射落地（bundle afd9abe3...，claim 总数 358）+ 首条 authority ref aref_430adf7d
- 初始文件核对：两仓库 AGENTS.md 无过期死锁描述；genshin-ts CLAUDE.md 与 PKC runtime 语义无交集，无需改
- 技能迭代自查：pkc-project-operator（本波已迭代）/ task-retrospective（已检查，DSH 纪律已有登记，本次为其同族实证，无需改）
