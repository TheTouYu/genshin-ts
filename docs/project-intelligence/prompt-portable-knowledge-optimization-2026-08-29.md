# 任务：portable-knowledge 项目优化——2026-08-29 批次需求（R9-R13 + R3 验证更新）

> 本提示词由 genshin-ts 项目方按 task-prompt-builder 七角度骨架生成（2026-08-29）。
> 去向：portable-knowledge 项目（本地仓库 /home/h/portable-knowledge，远程
> TheTouYu/portable-knowledge）——由该项目维护者或在其仓库工作区执行的会话使用。

## 一、任务目标

- 目标层 1（需求落地）：对 genshin-ts 项目提交的新批次需求 R9-R13（见
  docs/pkc-improvement-requests.md 的「2026-08-29 批次」段）逐条闭环：修复或文档化，
  每条在需求文档标注状态与 commit。
- 目标层 2（现状复核）：先复核旧批次 R1-R8 在项目当前 main/HEAD 的修复状态（0.2.0rc5 已
  部分落地——本批次实测 R2 的 A 方案已生效：historical 非关联 refs 降级为 non-blocking warning；
  R3 原场景未复现但新变体复现，见 R3 验证更新），避免重复修复已修项。
- 成功的样子：R9-R13 逐条有「现状→修复/文档→验证命令→commit」闭环记录；
  genshin-ts 侧无需任何额外绕行即可按新文档完成批量 capture 与连续维护。

## 二、铁律（不可软化）

- **只改 portable-knowledge 项目**（代码/测试/技能文档），不动 genshin-ts 的知识内容、
  tools/pkc-lock.json、.local 运行时与任何 bundle 文件。
- **证据锚点必须真实**：本提示词引用的所有路径与命令均已由提交方核实；在 genshin-ts 项目
  做复现时用真实命令，输出以实际为准，不复述本提示词的预期。
- **先复现后修复**：每条需求先在 genshin-ts（0.2.0rc5 运行环境）复现出描述的行为，再动手；
  复现不了的在需求文档标注「未能复现」并说明环境差异，不强行修。
- **评估门口径改动必须全量回归**：涉及 evaluation_contract / post-apply 检查的改动，跑全量
  评估用例，确认不破坏既有绿色用例（尤其 full-closure-and-id-integrity-1 与 static-gil-assets 系）。
- **语义变更走该项目自身 review 门**（L3：精确 hash 审阅；PR/分支提交按项目惯例）。
- 遇阻行为：卡住先读该项目 MODES.md/文档/测试，仍卡则登记 issue 式说明，不猜实现、不绕过门。

## 三、核验标准

模型侧（提交前全过）：
- 每条需求的修复附复现→修复→验证三段命令输出（以 genshin-ts 为复现场地）；
- 文档化类需求：新文档片段存在且可用（按文档写出 DRAFT.json 能被 capture --preview-only 接受）；
- 代码类需求：新增/更新测试通过 + 相关既有测试不回归；
- 报错信息类需求：按新信息操作者能一次定位（对照 R3 期望的验收口径）。

用户侧（该项目维护者）：PR/分支审阅；涉及语义变更的 bundle 走精确 hash 确认。

最终验收（可测量）：R9-R13 五条在 docs/pkc-improvement-requests.md 全部标注 closed/调整说明；
genshin-ts 侧 O-2026-08-29-10 的残留问题（post-apply 阻塞口径）获得明确答复或修复。

## 四、多轮迭代与多会话拆分

轮次骨架（顺序可调整，由你按探索结果调整）：

```text
R0 现状核对：git log 核对 R1-R8 修复状态 + 在 genshin-ts 复现 R9/R10/R13 最小路径
   + 定位 capture/apply/evaluation 相关实现与测试 → 产出「现状核对表 + 修复计划」
R1 修复批次 1（P0）：R9（DRAFT 契约文档）+ R10（post-apply 阻塞口径与事务状态报告）
R2 修复批次 2（P1）：R11（评估失败报告排名明细 + 夹具治理文档）+ R12（topic 元数据规则文档/容错）
R3 修复批次 3（P2）+ 回归：R13（proposals drift 判定）+ 全量评估回归 + 需求文档闭环标注
```

会话衔接：新会话先读 ①docs/pkc-improvement-requests.md ②docs/project-intelligence/
knowledge-capture-common-errors.md §14 ③docs/maintenance/open-items.md O-2026-08-29-10
④本提示词 ⑤该项目 MODES.md。每轮结束落：需求文档状态标注 + 该项目自身的提交/复盘闭环。

## 五、复用清单（先查再用，不要重新发明）

- 需求池：docs/pkc-improvement-requests.md（R1-R8 旧批次含复现命令；08-29 批次 R3 更新 + R9-R13）。
- 证据链：docs/project-intelligence/knowledge-capture-common-errors.md §14（PKC 连续维护三坑）；
  docs/maintenance/open-items.md O-2026-08-29-10（评估门行为记录）；
  data/knowledge/bundles/bnd_81d5378d*/bnd_f5dc558f*/bnd_253802ff*（本批次 bundle 记录，
  post-apply 评估失败的现场就在 bnd_81d5378d 的 apply 输出）。
- 技能与契约：全局技能 pkc-project-operator（/home/h/.agents/skills/pkc-project-operator/，
  含 references/MODES.md）——R9/R11/R12 的文档化落点优先在这里。
- 运行环境事实（tools/pkc-lock.json）：portable_knowledge 0.2.0rc5，source_commit 85b3cf8e，
  runtime 在 .local/pkc/runtimes/85b3cf8e…；genshin-ts 项目内用 python tools/pkc.py 复现。
- 评估契约实现参考：.local/pkc/runtimes/*/lib/python3.14/site-packages/portable_knowledge/
  evaluation_contract.py（topic_top_n 默认 3 等断言口径，只读参考，修复改的是源码仓库）。

## 六、已知局限与风险

- 提交方锁定的是 0.2.0rc5（85b3cf8e）；项目 main 可能已演进，先核对再改，避免重复或冲突。
- 评估门口径改动影响面大（所有用例的 blocking 判定）——保持 preflight/post-apply 口径一致，
  并给全量评估回归留时间。
- R10 的「事务已落盘」报告需要 apply 事务层提供状态，可能牵动 bundle 生命周期结构——若改动
  过大，先落文档化说明（错误信息带 bundle-status 指引）也算闭环，记录为「文档化降级」并在
  需求文档标注。
- 不要顺带做大规模重构（如重写 evaluation_contract）——需求池之外的改进单独提。

## 七、第 0 轮任务（现在开始）

1. 读 docs/pkc-improvement-requests.md 全文 + common-errors §14 + O-2026-08-29-10 + MODES.md。
2. 在 /home/h/portable-knowledge 仓库 git log/status 核对 R1-R8 现状，列出已修/未修对照。
3. 在 genshin-ts 项目用真实命令复现 R9（capture --help 无格式说明）、R10（bundle-status/
   validate 与评估门行为）、R13（apply 重放 drift）的最小路径，记录实际输出。
4. 产出「现状核对表 + 按 P0→P1→P2 的修复计划」，交维护者确认后进 R1。

> 设计说明（给本提示词使用者的旁注，可删）：①复用清单只写「哪里有什么」，修复方案留给执行者
  探索（如 R10 是改口径还是加 defer 开关，由项目上下文决定）；②铁律里「先复现后修复」是本次
  元复盘的核心教训（未复现就定性导致误判）；③0.2.0rc5 与 main 的版本差异风险显式列出，
  避免执行者把锁定版本行为当最新行为；④第 0 轮交付物刻意只到「核对表+计划」，修复轮次由
  维护者确认后展开。
