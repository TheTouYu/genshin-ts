# PKC Bundle 治理与生命周期

> 状态：当前推荐
> 来源：项目 canonical PKC 入口能力审计 + 项目级 staged validator
> 最近校验：2026-07-27
> 适用范围：Genshin-TS 的 Project Memory 与 Domain Knowledge 稳定语义写入；不修改 portable-knowledge runtime

## 批准前检查

稳定语义只能通过不可变 Bundle 写入。创建前必须记录并完成：

1. `duplicate`：没有同 assertion/scope 的现有 Claim 或待处理 Bundle；
2. `conflict`：与 active Claim、Context、Route 和 Authority 状态不冲突；
3. `authority`：每个 fact class 有当前 Authority Ref，或明确保持 coverage gap；
4. `scope`：assertion、适用边界和失效/重新验证条件明确；
5. `repository_state`：Authority 基线来自已提交内容；工作树观察不得升级为稳定事实；
6. `deletion_test`：删除该语义是否会让恢复/诊断退化；若不会，不应进入知识树。

创建后必须展示 Bundle ID、完整 `content_hash`、风险、语义前后差异、权限影响和精确变更文件。普通“继续”不等于对未展示哈希的批准。

## Staged validation

批准前运行：

```bash
python tools/validate_pkc_bundle.py \
  data/knowledge/bundles/<bundle-id>.json --format text
```

该工具把 Git 跟踪文件复制到临时快照。对于已经由前一批准 Bundle 应用、但尚未进入 Git 跟踪集的链式基线，它只按仓库内 `.applied.json → immutable Bundle` 审计链恢复缺失输出，并要求 applied content hash、Bundle action content 与当前文件逐字节一致；当前 proposed Bundle 明确列出、`before` 非空且匹配的路径也可作为直接基线。它不会扫描或复制其它未跟踪文件。随后校验 action 的 before/expected/new hash，叠加 action，并通过临时快照的 `tools/pkc.py` 调用项目锁定 runtime，运行：

- 在临时快照内 `pkc rebuild` 一次性重建可丢弃投影；
- `pkc validate`；
- `pkc tree`；
- 完整检索评估；
- Authority Ref 路径存在性检查。

它只接受尚未应用、其 before 状态仍可复现的 proposed Bundle；已应用 Bundle 应改跑真实工作树的 apply 后验证。它不 apply Bundle、不访问 SQLite、不安装/替换 runtime、不修改 Git 或工作树，也不复制构建输出、缓存或 action 外的未跟踪内容。临时快照通过只读 symlink 复用 `.local/pkc-runtime`。若 Bundle 将修改 staged validator 本身，必须先用当前已信任版本验证，并在 apply 后再运行一次目标版本。

项目层工具能提前发现 schema、Topic/Claim、Authority fact coverage、路径和检索回归问题；它不能替代 portable-knowledge runtime 内部事务原子性，也不能证明真实 GIA、编辑器、写回或游戏行为。

## 批准、应用与 staged authority validation

只有 project-owner 明确批准展示过的完整 `content_hash` 后，才运行：

```bash
python tools/pkc.py bundle-approve <bundle-id> --apply
python tools/pkc.py bundle-apply <bundle-id> --apply
python tools/pkc.py validate --format text
python tools/pkc.py tree --format text
python tools/evaluate_pkc_retrieval.py
```

apply 后的验证使用真实工作树，称为 staged authority validation。若 Authority Ref 状态变为 stale/invalidated，停止采用相关 Claim；不得用工作树新哈希静默更新 approved hash。

## 生命周期

| 状态 | 项目处理 |
|---|---|
| proposed | Bundle 已创建，未批准；允许审查和 staged validation，不允许 apply。 |
| approved | 只批准精确 content hash；Bundle 内容变化必须生成新 Bundle 和新批准。 |
| applied | 保留 `.json`、`.approval.json`、`.applied.json` 作为审计链；不得重放或修改。 |
| failed | 保留 Bundle 和失败输出；不得沿用旧批准。修正版必须用新 ID/hash，并在 intent/证据记录被取代的旧 Bundle。 |
| abandoned | 未应用 Bundle 可明确标为放弃；保留审计材料，但不纳入发布提交，除非项目需要持久化失败链。 |
| superseded | 由新 Bundle 替代旧 Bundle；新 Bundle 重新执行全部 preflight、staged validation 和精确哈希批准。 |
| rolled back | 仅使用 runtime 提供的 `bundle-rollback`，并把回滚后的知识状态作为新事实重新验证；回滚不抹除历史。 |

## 当前 runtime gap

固定的 `portable-knowledge 0.2.0rc1` 提供 immutable Bundle、approve/apply、recover/rollback 和 operation abandon，但当前项目可见 schema/CLI 没有一等的跨 Bundle `supersedes`/`abandoned` 关系，也没有“在批准前模拟 Bundle 并运行项目检索评估”的单一 runtime 命令。

项目层 staged validator 安全补足后一个缺口。前一个缺口只记录为 portable-knowledge runtime 改进项：项目不得给 Bundle JSON 伪造未支持字段，不直接改锁定 runtime，不把失败 Bundle 混入正常发布；修正版 Bundle 必须在 intent/evidence 中明确旧 ID，并取得全新精确哈希批准。
