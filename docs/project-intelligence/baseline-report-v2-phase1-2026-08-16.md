# 知识树长期记忆基线报告 v2（Phase 1 对照，2026-08-16）

> 前置：Phase 0 基线见 `baseline-report-2026-08-16.md`（黄金集 36 问固定）
> 本报告为 Phase 1 修复后对照：路由层修复 + 知识缺口补录 + 向量检索能力探查

## 一、Phase 1 变更清单

| 变更 | 提交 | 内容 |
|---|---|---|
| context 链接补齐 | 090c552 | game-engine-knowledge/debug-log-format 链接到 context（此前 0 链接 = 路由 100% gap 根因之一） |
| intent_routes +8 | 090c552 | 信号版本/拒载/参数布局/注册验证/挂载变量/写回 hash/空模型/装饰物偏移 |
| blocked_by 互斥 | 2f9258b | rejection/version-rules 排除词，消除组合意图 AMBIGUOUS |
| 知识缺口补录 | 8f89d28 | v19"变更消失 hash 核对"claim（Q009 探针暴露，bnd_07de235e） |

## 二、四层指标对照

| 层 | 指标 | Phase 0 | Phase 1 | 变化 |
|---|---|---|---|---|
| L0 | authority current/pending | 142/81 | 143/80 | +1（v19 claim current） |
| L1 词法 | direct / combo / ancient（逐题 recall@any） | 0.96 / 0.35 / 1.00 | 0.96 / 0.35 / 1.00 | 持平（内容未变） |
| L1 路由 | 36 问 progressive-query 命中 | **0/35 (0%)** | **15/35 (43%)** | 🟢 +15 命中，ambiguous 2→0 |
| L1 路由 | 定点回归 11 问 | 全 gap | 11/11 explicit_route | 🟢 |
| L2 | 任务主动检索 | 5/5 | 5/5 | 持平 |
| L3 答案 | 任务答案正确 | 5/5 | 5/5 | 持平 |
| L3 严格 | evaluate ok | 2/5 | 3/5（T2 环境噪声不计） | 🟢 T1 gap 错误消除 |

**口径注**：Phase 0 报告 combo 0.65 为"跨题累积"口径（任一题搜索命中即算）；逐题口径（每问自己的搜索是否命中自己的 claims）两阶段均为 0.35。以逐题口径为准。

## 三、任务明细对照

| 任务 | Phase 0 ok/errors | Phase 1 ok/errors | 答案 | 说明 |
|---|---|---|---|---|
| T1 field2 | ✗ 1 gap error | ✅ **0** | ✅ | 路由修复直接收益 |
| T2 拒载排查 | ✅ 0 | ✗* 0（tsbuildinfo 环境噪声） | ✅ 18 处 claim 引用 | 5 检查点全覆盖，还引用了新 v19 claim |
| T3 历史 | ✗ 6 | ✗ 5（context 参数误用） | ✅ | 模型把 claim/topic id 当 --context——提示引导问题（Phase 2 候选） |
| T4 复合 | ✅ 0 | ✅ 0 | ✅ | 保持 |
| T5 空模型 | ✗ 1 | ✗ 1 | ✅ | 答案正确 |

## 四、向量检索能力探查（用户提示后新增）

**结论：向量检索"配置存在但未生效"，共 4 层问题：**

1. **API 当前不可达**：`.env` 已配 `VECTORENGINE_BASE_URL=https://api.vectorengine.ai/v1`（text-embedding-3-small，1536 维）。实测：DNS 解析到 Twitter/Meta IP 段（104.244.46.186 / 2a03:2880:...face:b00c），带 key 调用 `/embeddings` 报 `Errno 101 Network is unreachable`；8-15 索引构建成功说明当时 API 可达。⚠️ **需用户确认：该域名在你的网络环境是否可达？还是应更换 provider/本地代理？**
2. **索引过期**：`index.json` 8-15 构建（133 条），当前 149 条 claim，16 条新 claim（含 Phase 1 录入 4 条）未入索引。API 恢复后需 `pkc knowledge-index`（rebuild 索引）。
3. **集成缺口**：`progressive-query` 动态检索为纯词法（retrieval.py `_candidate_scores`），**不接向量**；向量仅在 `knowledge-search --semantic` 手动启用。模型默认查询路径（progressive-query）用不到向量。
4. **体验 bug**：API 不可达时 `--semantic` 对缺失文本重试 4 次 × 15s ≈ 60s 才 fallback 词法（embed_texts 的 URLError 也进重试循环）——应快速失败（如 1 次尝试或短超时）。

**向量可用后的预期收益**：词法误配（"布局"→node-graph-layout 0.199 vs 真目标 signal-production-encoding 0.077）可被语义相似度纠正；英文↔中文跨语言匹配（用户提到）；dynamic 检索 confidence 不再系统性低于阈值——届时阈值 0.25 可能反而合适。

## 五、Phase 2 建议（按 ROI）

1. **向量通道修复**（用户确认 API 后）：①确认/更换 BASE_URL ②`knowledge-index` 重建索引 ③评估是否把向量接入 progressive-query dynamic 路径（改 runtime 属 PKC 升级，需 pkc plan-upgrade 流程）④修 --semantic 快速失败
2. **T3 类提示引导**：adapter/任务文件明确"--context 只能是 compiler-diagnostics / static-gil-assembly-production 之一"（Phase 1 任务中模型 5 次误用）
3. **routes 边际补齐**：覆盖 Q010 跨图广播、Q012-015 复合 exec、Q026-027 诊断、Q031 挂载、Q022 写回（预计命中率 43%→55%+）
4. **L0 stale 清理**：80 条 stale refs 按 claim 边界 refresh/retire

## 六、复现

```bash
# 路由命中率（36 问）
# 脚本：对每问 progressive-query（assets→static context，其余→compiler context），判定 topics∩expected_topics
# 向量
python3 tools/pkc.py knowledge-search "<query>" --semantic --limit 5   # hybrid（API 不可达时 60s 后 fallback）
python3 tools/pkc.py knowledge-index                                   # 重建向量索引（需 API 可达）
```
