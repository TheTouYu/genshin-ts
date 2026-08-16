# 知识树长期记忆基线报告（Phase 0，2026-08-16）

> 状态：基线测量完成，供后续每波优化对照（黄金集固定：`docs/project-intelligence/golden-set-v1.json`，36 问）
> 方法：①36 问黄金集（direct 22/combo 8/ancient 6，五领域）②knowledge-search 词法 recall ③progressive-query 路由测试 ④isolated-model-evaluator 5 个代表性任务（干净上下文 + 只加载 pkc-project-operator / genshin-ts-project-adapter）
> 评估配置：deepseek-v4-flash / thinking=max / 只读（--assert-no-changes）/ 5 任务总成本 ≈ $0.013

## 一、四层指标总览

| 层 | 指标 | 基线值 | 判定 |
|---|---|---|---|
| L0 维护度 | authority current / pending | 142 / 81（stale 82→81 未清零） | 🔴 欠账大 |
| L1 检索质量 | claim-rec@5 / @any（词法） | direct 0.92/0.96、combo 0.65/0.65、ancient 1.00/1.00 | 🟡 单点够、组合差 |
| L1 路由 | progressive-query 自由文本 | **6/6 coverage gap（100% 失败）** | 🔴 全坏 |
| L1 路由 | intent_routes 显式意图 | 28 条可用（bypass 阈值），但仅覆盖 2 领域 | 🟡 白名单窄 |
| L2 使用率 | 任务中主动检索 | 5/5 任务主动检索（平均 8-12 次查询+show-claim） | 🟢 高 |
| L3 正确率 | 任务答案正确 | **5/5 = 100%**（T1/T2/T3/T4/T5 全部答对） | 🟢 高 |
| L3 严格 | evaluate ok（含零工具错误） | 2/5 = 40%（T2/T4）；T1/T3/T5 因 progressive-query 报错被扣 | 🟡 |

## 二、五大发现（按瓶颈严重度排序）

### 🔴 F1：progressive-query 自由文本路由 100% 失败（最大瓶颈）
- 全部测试查询报 `RETRIEVAL_CANDIDATE_UNKNOWN / coverage_gap`，即使命中正确主题（compositePins 问题命中 capture-ir-contract，confidence 0.217）
- **根因**：`project-intelligence.json` retrieval.dynamic.confidence_threshold=0.25 > 实际词法匹配分（0.17-0.22）——词法归一化分数系统性低于阈值
- **影响**：模型按 adapter 技能引导优先走 progressive-query → 试错浪费（T3 为此绕路 6 次错误、去读技能源码）→ 部分任务被扣 ok 分
- **修复候选（Phase 1）**：阈值调低（如 0.15）/ 改进主题匹配 / 扩大 intent_routes 覆盖（当前信号/游戏开发领域 0 条路由）

### 🔴 F2：L1 组合检索 recall 仅 0.65（combo 档）
- 多 claim 组合问题（拒载排查 5 claim、复合修复流程 3 claim）词法搜索平均只召回 1 个
- 词法检索对"标题含关键词"的单点规则够用（direct 0.92），组合语义（流程/排查类）检索不到相关 claim
- **修复候选（Phase 1/2）**：intent_routes 覆盖流程类意图（拒载排查、修复流程、写回流程）；claim 标题补流程关键词

### 🟡 F3：知识缺口暴露但未补（ancient 档 Q009）
- v19"变更消失先核对 hash"规则**知识树无 claim**（黄金集缺口探针按预期触发 MISS）
- 该规则是高频纪律（AGENTS.md 有、复盘文档有），知识树缺 → 独立模型无法从知识树召回
- **修复候选**：补 1 条 claim（hash 核对纪律 + v19 证据链）

### 🟢 F4：knowledge-search + show-claim 链路可靠（正向）
- 模型用它可答对全部 5 题（含一年前知识 T3：U1 实验 2699 日志、str v2 可加载全部召回）
- T3 证明**长期记忆目标可行**：ancient 档 recall 1.00、答案 100% 正确
- **结论**：内容层质量 OK，瓶颈在检索/路由层，不在内容层

### 🟢 F5：模型行为韧性好（正向）
- progressive-query 全坏时 T2/T3/T4 均"按纪律上报不一致、不静默猜测"，改用 knowledge-search 完成——行为层纪律已生效
- T4 还能从 coverage gap 恢复（按候选主题显式路由）

## 三、L3 任务明细

| 任务 | 档/领域 | ok | 工具错误 | 答案判定 | 备注 |
|---|---|---|---|---|---|
| T1 field2 monitor | direct/signals | ✗ | 1（gap） | ✅ 四数值全对 | knowledge-search 命中 clm_ABB786BA |
| T2 拒载排查 | combo/signals | ✅ | 0 | ✅ 覆盖 10+ claim | 最佳实践：gap 后按纪律切换 |
| T3 历史 str v2 | ancient/signals | ✗ | 6（gap 试错） | ✅ 完整召回 U1 实验 | 一年前知识召回成功 |
| T4 复合修复 | combo/composite | ✅ | 0 | ✅ 10 claims | 从 gap 恢复，显式路由成功 |
| T5 空模型宿主 | direct/assets | ✗ | 1（gap） | ✅ 答案正确 | |

## 四、成本与可重复性

- 5 任务总成本 ≈ $0.013，单任务 2-7 分钟——每波优化后全量重跑 ≈ $0.02/轮，成本可接受
- 评估配置固定（模型/思考/技能/只读），黄金集文件固定——支持前后对照
- 注意：--assert-no-changes 受并行进程污染（本轮 5 任务全部无污染，正常）

## 五、Phase 1 建议（按 ROI 排序）

1. **修路由**：confidence_threshold 0.25→0.15（或 margin 调整）+ 信号/游戏开发领域补 intent_routes（预期消除全部 coverage gap 试错，T1/T3/T5 的 ok 分直接提升）
2. **补知识缺口**：Q009 hash 核对纪律 claim（+ v19 证据）
3. **combo 检索增强**：流程类意图路由 + claim 标题补流程关键词（拒载排查/修复流程/写回流程）
4. **L0 清理**：81 条 stale refs 按 claim 边界 refresh/retire（知识树可信度基线）

**重跑纪律**：Phase 1 每改一层 → 重跑黄金集 36 问词法基线 + 5 任务 → 与本文对照，diff 归因单层。

## 附：复现命令

```bash
# L1 词法基线（脚本见会话记录，逻辑：对每问 keywords 前 3 词跑 knowledge-search，判定 top5/any 命中 expected claims）
python3 tools/pkc.py knowledge-search "<关键词>" --status any
# 路由测试
python3 tools/pkc.py progressive-query --context compiler-diagnostics --intent "<自由文本>" --max-level 2 --limit 3
# 任务评测
python3 ~/.pi/agent/skills/isolated-model-evaluator/scripts/evaluate.py --root /home/h/genshin-ts \
  --skill /home/h/.agents/skills/pkc-project-operator --skill /home/h/genshin-ts/.agents/skills/genshin-ts-project-adapter \
  --task-file /tmp/eval-task-tN.md --assert-no-changes --timeout 900 --output-dir /tmp/eval-tN
```
