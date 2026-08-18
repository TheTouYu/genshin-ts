# 知识库能力评估（用户视角）· 2026-08-19

> 评估对象：genshin-ts 项目 PKC 知识树（13 节点 / 72 topic / 307 claim）
> 评估方式：真实实测（检索命中、耗时、全树回归门、持久性）
> 背景：知识树自 2026-07-26 起持续录入；本评估覆盖"老知识检索 / 速度 / 精准 / 长久记忆 / 易用性"五个维度。

## 一、能检索到多久以前的知识？

- 最早录入于 **2026-07-26**（评估当天约 24 天前）。实测用当时录入的**真实老知识**查询，全部命中：
  - `DTC 边界 bool 物理 pin 红灯基线` → `pipeline-localization`（rank 1）
  - `信号版本 下限 vec3 被引擎拒绝` → `signal-production-encoding`（rank 1）
  - `匀速旋转运动器 axis 局部轴` → `motion-device-runtime`（rank 1）
  - `局部变量 GIL 编码 E1016` → `variable-scopes-encoding`（rank 1）
- **结论**：老知识可达且精准。机制上知识存于 git 权威基线 + 持久检索索引，**不随年龄衰减**——满月/更早的知识同样可检索。
- 诚实边界：树当前才 ~24 天，尚无"满 30 天"知识可实测；但持久化机制保证其可达性。

## 二、快不快？

- `knowledge-search`（词法全文检索）：**308–596 ms / 条**（亚秒）。
- `progressive-query`（Adapter 上下文路由，`--context` + `--intent`）：**180–218 ms / 条**。
- **结论**：本地检索亚秒级，交互可接受。

## 三、准不准？

- 全树 68 topic 检索评测已接线为 `knowledge-check` 回归门，**68/68 PASS**。
- 抽查 8 条真实查询（4 条老知识专有 + 4 条新 UGC），目标 topic 全部 **rank 1**。
- **结论**：精准度高，且回归门防止将来退化。

## 四、能不能保持长久记忆？

- 持久层：claim 存于 **git 跟踪的 markdown + registry（权威基线）**；SQLite 是可重建投影（`rebuild` 自动重建），不依赖易失状态。
- 跨会话/跨天可恢复：昨天录入的 75 条 UGC 知识今天仍可检索。
- authority 时效：源码演进会 invalidate 关联 ref（`pending_review`）。升级 runtime 后可用新增 `refresh-authority-ref --all-stale` 一条命令批量收敛；指向**未提交用户文件**的 ref 会跳过（提交是用户职责）。
- **结论**：记忆持久；维护成本可控（配合新批量刷新 API）。

## 五、用起来麻不麻烦？

- **使用者（检索/查询）**：轻。`knowledge-search "一句话"` 亚秒返回；`progressive-query --context official-guide --intent ...` 按上下文路由。
- **维护者（录入/plan/bundle/apply）**：偏重——plan→bundle→approve→apply 治理门多，这是安全设计（精确 content hash 审批门）而非缺陷。
- 本轮已修复的真问题：official-guide intent 路由 keywords 曾写成"一长串"，导致 `progressive-query` 单 token（如"技能"）空返回；已拆成逐条关键词，复测全部正确路由。
- 新工具（runtime 升级后生效）：`update-topic`（检索调优不必改 claim 正文）、`update-authority-ref`（ref 改路径）、`--all-stale`（批量 refresh）、`--eval-coverage`（覆盖缺口）、`--preview-only`（草稿预览）、approve/apply hash 自动解析。

## 六、总体结论

| 维度 | 结论 |
|---|---|
| 老知识可达 | ✅ 24 天前知识 rank1 命中；机制保证不衰减 |
| 快速 | ✅ 亚秒（检索 308-596ms / 路由 180-218ms） |
| 精准 | ✅ 68/68 回归门 + 抽查 rank1 |
| 长久记忆 | ✅ git 权威基线 + 可重建投影 + 跨会话 |
| 易用 | ✅ 使用者轻；维护者偏重但有新 API 缓解 |

**一句话**：知识库在"检索/记忆"层面已真正发挥作用（快、准、持久、老知识可达），维护侧在新 runtime 下也显著减负。

## 附：本次配套动作

- PKC runtime 升级至 `cd85065`（含 P0/P1/P2 优化：稀疏 overlay、评估门不阻塞、update-topic/update-authority-ref、finalized rebase、批量 refresh、P2 UX 与技能沉淀）。
- `--all-stale` 批量刷新 16 条并发失效 ref；剩余 pending 主要为指向未提交文件的 dirty ref（等待对应文件落盘后刷新）。
- 遗留提示：`skills/isolated-model-evaluator/templates/ferris-task.md`（并行工作）含 "genshin-model-studio" 与 `/home/h/...` 路径，违反 portable-knowledge 公共资产契约测试，提交前需中立化。
