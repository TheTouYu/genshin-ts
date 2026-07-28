# Static GIL Assembly Production Context

> 生命周期：active
> 恢复角色：current recovery
> 最近更新：2026-07-28

## 目标

把静态 `.gil` 拼装从一次性逆向实验发展为可配置、可回归、有自动备份且经过用户游戏验证的生产工作流。Project Memory 只记录当前状态与下一恢复点；稳定方法和证据边界从关联 Knowledge Nodes 按需查询。

## 当前检查点

- 当前实现入口：`gsts assets:static-assemblies`。
- 实现提交：`99b75f7 feat: add static GIL assembly tool`。
- 生产复跑必要修复：`48b8152 fix: preserve static assembly instance metadata`。
- 权威生产验证记录：`docs/architecture/gil-static-model-assets.md` §19.2.1。
- 知识沉淀提交：`4db6c96 docs: record static assembly production validation`。
- 第一轮生产候选/写后 SHA-256：`067edfb3...8f3315`。
- 第二轮颜色生产验证：来源 SHA-256 `0225e4b2...fd2992`，候选/写后 SHA-256 `47ff681b...db9ecd`。
- 颜色验证状态：主体和六件装饰物 raw-wire 回归通过、CLI 自动备份与写回成功、写后闭包回读通过、用户反馈编辑器/游戏测试“完美通过”。
- 当前颜色范围：球体、圆锥、圆柱、线框长方体、线框圆柱；33/50/66/100% 透明度；覆盖、正片叠底和关闭自定义颜色。
- 声明式结构文件：严格 JSON `schemaVersion: 1` 已支持主颜色和 items；地图模板、ID 与场景 Transform 仍由配置提供。
- 发布消费回归：`npm pack` 后全新脚手架可从包名导入静态拼装公开类型并运行已安装 CLI help。
- 未决边界：`field 9=6710` 仍仅为保留的未知字段，不视为材质语义已验证；从 `.gil` 提取结构尚未实现。

上述状态证明两轮受限生产配置形成了生产闭环；不推广到其它地图、模板、未测资源、材质、update/delete 或自动 ID 分配。

## 新会话恢复顺序

1. 读取根和最近的 `AGENTS.md`，检查并保护工作树。
2. 通过项目 Adapter 选择本 Context。
3. 从项目根使用唯一入口 `python tools/pkc.py progressive-query --context static-gil-assembly-production --intent <intent> --max-level 2 --limit 3 --check-authority`；入口自动使用项目 `.local/` 内锁定的非 editable runtime，Agent 不安装或选择版本，也不要直接访问 SQLite。`screenshot-validation` 最多返回 `assembly-configuration`，`production-progress` 返回生产证据，`map-writeback` 才返回闭包与写回安全。runtime 缺失、损坏或版本不匹配时停止并请求项目维护者恢复，不猜个人源码路径。
4. 只读取返回的 `minimum_files`；`escalate_to_l3=false` 时不展开 Claim/Evidence 或完整权威文档。
5. L3 用 `show-claim` 读取精确 Claim/Evidence；Authority Refs 直接采用 progressive query 返回的 Claim 关联子集和 current/stale 状态。
6. 查询始终只读且不构成地图操作授权。当前事实以已登记的提交、源码、测试和权威文档为准；不依赖 `/tmp` handoff。

## Authority References 恢复导航

下列 committed-baseline Ref 是当前静态拼装 Context 的实现、回归和安全入口；实际读取前仍须按 Claim ID 定向连接，并核对状态为 `current`：

| Authority Ref                             | 路径                                  | 作用                                     |
| ----------------------------------------- | ------------------------------------- | ---------------------------------------- |
| `auth-static-assembly-core`               | `src/cli/gil_static_assemblies.ts`    | 配置 Transform、闭包和显式 ID 的当前实现 |
| `auth-static-assembly-cli`                | `src/cli/assets_static_assemblies.ts` | 配置加载、候选、备份和写回 CLI 行为      |
| `auth-static-assembly-focused-regression` | `tests/gil_static_assemblies.ts`      | 创建与 ID 冲突拒绝的 focused regression  |
| `auth-static-assembly-cli-safety`         | `src/cli/AGENTS.md`                   | CLI 地图写回确认与验证规则               |
| `auth-static-assembly-injector-safety`    | `src/injector/AGENTS.md`              | GIL 边界、备份及游戏验证分层规则         |

当前 PKC `show-claim` 返回 Claim 和 Evidence，不内嵌本表；`progressive-query --check-authority` 会从命中的 Claim 出发返回 Authority Ref 子集与哈希状态。不要无差别读取五个文件；如果 Ref 哈希变化，先报告 stale/invalidated 风险，不把 working-tree 内容当成稳定事实。

## 下一恢复点

颜色公开配置、显式模板实例 ID、多资源颜色生产验证、声明式 JSON 结构文件和发布包/脚手架消费回归已完成。下一次推进先让用户选择新的生产目标，例如从 `.gil` 独立提取结构、材质最小 A/B、增加资源覆盖、改进 ID 分配或新增 update 模式；不得从历史临时工件猜测下一目标。任何新的真实地图写回都必须重新确认目标、当前哈希、ID、候选、回滚和验证方案。

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
