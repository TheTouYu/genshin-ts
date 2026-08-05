# 已核验分支记录

按 SKILL.md 闭环流程登记。日期格式 YYYY-MM-DD；证据分层：自动（编译/wire/注入）与用户游戏证据分开。

## verify-inflow-index（2026-08-06，用户游戏核验通过）

- 背景：修复 `applyEditorConnectionWireRules()` 无条件删除 InFlow connect index 的生产 gap
  （真实证据 case3：非默认目标 InFlow 显式写目标 ShellIndex）。
- 地图：`1073741852.gil`「InFlow核验」（`maps:create` 新建，首个验证地图实例；mapId=max+1，
  placeholder 图 id=1073741825）。
- 分支图：placeholder `verify-inflow-index` → 注入后替换为 `_GSTS_inflow-index-repro`
  （id=1073741825，8 节点：事件→打印→有限循环→循环体打印→双分支→break_loop→打印）。
- case 源：`verify/inflow-index/inflow-index-repro.ts`（当时目录为 `verify-inflow-index/`，
  迁移后路径见仓库）。
- 自动证据：
  - 单元测试 red→green（默认 InFlow[0] 省略 index / 非默认保留 index=1，connect 与 connect2 均断言）；
  - 生成 GIA 解码：break_loop（genericId.nodeId=6）→ finite_loop 的
    `connect/connect2 = {kind: InFlow, index: 1}`，与 case3 真实证据逐字节同构；
  - 注入后 `.gil` 回读同一 wire 形态保持。
- 用户游戏证据：编辑器打开正常、行为符合预期（loop-body 仅 1 次 + after 打印），核验通过。
