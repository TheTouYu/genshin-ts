# Static GIL Assembly Production Context

> 生命周期：active
> 恢复角色：current recovery
> 最近更新：2026-07-26

## 目标

把静态 `.gil` 拼装从一次性逆向实验发展为可配置、可回归、有自动备份且经过用户游戏验证的生产工作流。Project Memory 只记录当前状态与下一恢复点；稳定方法和证据边界从关联 Knowledge Nodes 按需查询。

## 当前检查点

- 当前实现入口：`gsts assets:static-assemblies`。
- 实现提交：`99b75f7 feat: add static GIL assembly tool`。
- 生产复跑必要修复：`48b8152 fix: preserve static assembly instance metadata`。
- 权威生产验证记录：`docs/architecture/gil-static-model-assets.md` §19.2.1。
- 知识沉淀提交：`4db6c96 docs: record static assembly production validation`。
- 第一轮生产候选/写后 SHA-256：`067edfb3...8f3315`。
- 证据状态：自动回归通过、独立 raw-wire 候选校验通过、CLI 备份与写回成功、写后回读通过、用户游戏验证通过。

上述状态证明当前地图、`静态拼装H1` 模板、长方体资源 `10009001` 和本次四件配置形成了生产闭环；不推广到其它地图、模板或资源。

## 新会话恢复顺序

1. 读取根和最近的 `AGENTS.md`，检查并保护工作树。
2. 通过项目 Adapter 选择本 Context。
3. Knowledge L1 查询 `static-gil-assets`、`game-map-writeback`、`validation-evidence`。
4. L2 只读取命中 Topics；需要精确实现、验证或证据范围时再读 L3。
5. L3 用 `show-claim` 读取 Claim/Evidence，再按 Claim ID 连接 `data/knowledge/authority-refs.json` 的 `claim_ids`；不要假设 `show-claim` 已经返回 Authority Refs。
6. 当前事实以已登记的提交、源码、测试和权威文档为准；不依赖 `/tmp` handoff。


## Authority References 恢复导航

下列 committed-baseline Ref 是当前静态拼装 Context 的实现、回归和安全入口；实际读取前仍须按 Claim ID 定向连接，并核对状态为 `current`：

| Authority Ref | 路径 | 作用 |
|---|---|---|
| `auth-static-assembly-core` | `src/cli/gil_static_assemblies.ts` | 配置 Transform、闭包和显式 ID 的当前实现 |
| `auth-static-assembly-cli` | `src/cli/assets_static_assemblies.ts` | 配置加载、候选、备份和写回 CLI 行为 |
| `auth-static-assembly-focused-regression` | `tests/gil_static_assemblies.ts` | 创建与 ID 冲突拒绝的 focused regression |
| `auth-static-assembly-cli-safety` | `src/cli/AGENTS.md` | CLI 地图写回确认与验证规则 |
| `auth-static-assembly-injector-safety` | `src/injector/AGENTS.md` | GIL 边界、备份及游戏验证分层规则 |

当前 PKC `show-claim` 返回 Claim 和 Evidence，不内嵌本表。新会话回答“下一步读取哪些 Authority Refs”时，应从命中的静态 Claim 出发，通过 `claim_ids` 返回相关子集，而不是无差别读取五个文件；如果 Ref 哈希变化，先报告 stale/invalidated 风险，不把 working-tree 内容当成稳定事实。

## 下一恢复点

当前首轮目标已完成。下一次推进先让用户选择新的生产目标，例如扩展配置类型、增加模板/资源覆盖、改进 ID 分配或新增 update 模式；不得从历史临时工件猜测下一目标。任何新的真实地图写回都必须重新确认目标、当前哈希、ID、候选、回滚和验证方案。

## 验证门

```text
npm run build
focused static assembly regression
independent candidate/raw-wire validation
git diff --check
```

真实地图操作另有不可替代的门：写回前用户明确确认、CLI 自动备份、写后独立回读、用户编辑器/游戏核验。自动验证、写回成功和游戏验证必须分别报告。

## 安全边界

- 不记录或输出私人 Windows 用户路径。
- 不猜 `mapId`、`nodeGraphId`、目标路径或下一可用 ID。
- 静态 GIL 资产写回与 `.gia` NodeGraph 注入分开处理。
- 未经明确确认，不覆盖、删除、恢复或清理真实游戏文件。
- `/tmp` 工件可用于一次性复现，但不是 Project Memory 或 Domain Knowledge 权威。
