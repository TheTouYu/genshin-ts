# 复盘：PKC 跨项目升级与知识树补录轮（2026-08-29）

> 范围：portable-knowledge `b79307f`→`fe838a0`；genshin-ts `c1165d4`→`9f80593`；五项目运行时升级 ×3 轮
> 视角：任务执行过程元复盘（错误谱系 + 系统性根因 + 方法论），不重复需求文档已有的需求级结论
> 证据：两仓库 git log + 本会话真实命令输出；状态：已闭环
> 产出：本文件 + 技能两处更新（portable-knowledge）+ AGENTS/CLAUDE 同步（genshin-ts）+ open-items O-2026-08-29-11

## 一、错误谱系总览

| # | 症状 | 根因层 | 处置 | 成本 |
|---|---|---|---|---|
| 1 | capture finalize 被 `PLAN_FULL_AUTHORITY_NOT_CURRENT … manual_review (plan_affected)` 阻塞 | 政策选择：新 ref 误用 `manual_review` 政策——该政策**永远 non-current**，任何触及其 claim 的 plan 必然阻塞。此坑 common-errors §10 早已记录（「引用刚提交的文档不要用 manual_review」），但规则在**文档**不在**技能**，操作前未查复用清单 | 改 `review_on_change` 重跑（bnd_8d32f392） | 1 次失败 capture + abandon 重建 |
| 2 | 新发布运行时上 update-topic 关键词-only 直接 TypeError 崩溃 | 潜伏代码 bug（85b3cf8e 就有）：`SemanticPlanError(path=…)` 非法参数 + 「Markdown 无变化」noop 误判拒掉 registry-only 合法变更（keywords 不在 Markdown 头里） | 修 `plan_update_topic` + 回归测试 → `0c02d2a` 二次发布 + 五项目重升级 | 发布周期 ×1、五项目重升级 |
| 3 | 已开 plan 报 `PLAN_STALE_BASELINE` | 操作时序：自己的锁升级提交推进 HEAD → open plan 失效（commit-unit 规则对**自身提交**同样生效） | 按恢复配方 abandon + 重建（无操作可回放） | 1 次计划重建 |
| 4 | progressive-query 被判「0 命中」 | 载荷键名误判：结果在 `claims` 字段（`results` 键只在 knowledge-search 用），按 query 习惯找 `results` | 核对 payload keys 修正判读 | 1 轮调试 |
| 5 | finalize 输出被 126 条 historical warnings 冲爆、结果截断 | 输出体积（非 bug，是 UX 债）：warnings 全量打印 | 重定向落盘文件再读 | 1 轮排查 |
| 6 | R13 测试初版场景失真 | 测试建模：plan 的 staged writes 未落盘前文件不存在，向空文件追加不等于「已 apply + 追加」 | 先写入 bundle 后镜像再追加（真实场景） | 测试迭代 2 次 |
| 7 | 关键词-only 测试断言「无 markdown 动作」失败 | 夹具自身 registry/markdown summary 不一致（预存），暴露 validate 不查 topic 头一致性 | 修正断言；登记 open-item | 1 次测试迭代 |

## 二、系统性根因（3 条）

1. **「技能才是生效载体，文档不是」的纪律对跨项目复用清单同样成立**（0827588 的元教训在 PKC 操作上的复现）。manual_review 政策语义、progressive-query 载荷键名这类坑写在 genshin-ts 文档里，操作者是按技能动作的——**必须把坑写进操作技能**（pkc-project-operator），而不是指望操作前翻完所有项目文档。
2. **发布前缺「下一波真实操作」的功能级 smoke test**。plan-upgrade 的校验链（capabilities/validate/rebuild/knowledge-check）全绿，但挡不住 update-topic 关键词-only 这类功能级回归——因为下一波要做的事恰好没进校验集。**发布清单必须包含「接下来要用的真实命令先在候选 wheel 上跑一遍」**。
3. **提交推进基线与 open plan 的时序耦合**。PKC 的 commit-unit 规则意味着任何提交（包括升级锁、配置）都推进基线，让所有 open plan 失效。批量操作时要么先收完所有 plan 再提交，要么接受重建成本；升级/配置提交应与 plan 工作显式错开。

## 三、方法论教训（正面沉淀）

- **plan-upgrade/apply-plan 机制让发布周期安全且廉价**：精确 commit 克隆构建 wheel、双态校验、失败回滚保留旧 runtime——本次三轮发布周期全部机械通过，这是可以继续依赖的基础设施。
- **git worktree 副本保真复现**：R10/R13 的 before/after 验证用基线 commit 副本 + bundle 后镜像恢复现场（含未跟踪文件补齐），不触碰主工作区。
- **补提交前验证 hash**：`node-graph-creation-skillconfig.md` 补提交前核对文件内容与已 apply 的 `bnd_ae7c7e87` 动作后镜像逐字节一致——把「未知内容」排除在知识提交之外。
- **落盘文件重定向**：预期 warnings 大时 `pkc ... > out.json 2>&1` 再解析，避免管道截断误判（谱系 #5）。

## 四、同族扩展检查结果（本轮修复的同类边界）

- `SemanticPlanError(非法 kwargs)` 同族：全库扫描 0 残留（修复前仅 plan_update_topic 3 处）。
- 「合法变更被 noop 守卫误拒」同族：revise_claim / move_topic / refresh / update-authority-ref 的 noop 守卫均为真 noop 判定，无误拒；不扩展。
- `manual_review` 政策存量普查：genshin-ts 448 条 ref 中 0 条（坑真实存在但无存量引爆）——**语义已写入操作技能**防复发。
- progressive-query 载荷键名：已在技能补注。

## 五、风险探索与未闭合项

- 126 条 historical stale refs 维护积压仍在（本批未处理，非阻塞）。
- 7 个未跟踪 bundle 文件（bnd_60015fd1f/bnd_9838cbe/bnd_9b1f27e/bnd_bc159e/bnd_c9263d/bnd_f7a55d6）属进行中工作，保护勿扫入提交 → 登记 O-2026-08-29-11。
- 评估夹具 topic 头一致性（registry vs Markdown summary）无校验 → 同 O 项登记为可选改进。

## 六、产出清单

- portable-knowledge：`0c02d2a`（update-topic 修复）、`fe838a0`（--context help）、技能 `capture-draft-format.md`/`MODES.md`（policy 语义 + 载荷键名 + 发布 smoke 检查）
- genshin-ts：AGENTS.md/CLAUDE.md context 清单同步（game-engine-rules）；本复盘文档；open-items O-2026-08-29-11
