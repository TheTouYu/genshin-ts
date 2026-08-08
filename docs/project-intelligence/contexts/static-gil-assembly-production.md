# Static GIL Assembly Production Context

> 状态：当前恢复指针
> 作用：只提供静态 GIL 生产任务的入口、Authority 和下一步，不复制历史证据或完整规则。

## 任务边界

静态 GIL 资产包括官方预制元件、自定义元件、场景实体、装饰物、组件和节点图挂载。
当前实现与真实 GIL 规则分开维护：

- 真实结构 Authority：`docs/game-engine-knowledge/gil-structure-semantics.md`
- 静态资产生产说明：`docs/architecture/gil-static-model-assets.md`
- 当前 CLI：`src/cli/assets_static_assemblies.ts`、`src/cli/assets_entities.ts`、`src/cli/gsts.ts`（`assets:mounts` 路由）
- 当前核心实现：`src/cli/gil_static_assemblies.ts`、`src/cli/gil_entities.ts`、`src/cli/gil_graph_mounts.ts`
- focused 回归：`tests/gil_static_assemblies.ts`、`tests/gil_entities.ts`、`tests/gil_graph_mounts.ts`

详细实验快照、哈希、用户游戏反馈和失败历史只在对应证据目录或 Authority 中维护，不复制到本 Context。

## 加载规则

1. `maps:create`、`maps`、`maps:rename`、CLI `--help` 和已闭合的只读 inspect/export 直接走命令路径。
2. 需要候选、ID 分配、实体/元件/装饰物生成或真实地图写回时，才通过 Project Adapter 进入 `map-writeback`。
3. 需要未知 GIL 编码、编辑器增量差分或规则冲突时，才进入 `editor-incremental-gia-investigator`。
4. 只有命中明确 Claim 或 Authority 缺口时，才读取 PKC L3、历史 handoff 或更大范围文档。

## 当前范围

静态拼装、官方预制直引、实体导入/局部 patch、装饰物闭包和节点图挂载已有自动回归；
适用范围、跨地图/跨版本边界以及编辑器/游戏验证状态以 Authority 和测试为准，不在这里重复声明。

## 验证门

```text
focused regression → candidate/raw-wire 回读 → 写回前哈希确认
→ CLI 备份与写后回读 → 编辑器/游戏验证（如任务要求）→ git diff --check
```

真实地图写回、覆盖、删除、注入和游戏验证仍需遵守根 `AGENTS.md` 与 Project Adapter 的安全确认。
