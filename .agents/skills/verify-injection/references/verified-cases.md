# 已核验分支记录

按 SKILL.md 闭环流程登记。日期格式 YYYY-MM-DD；证据分层：自动（编译/wire/注入）与用户游戏证据分开。

## verify-signal（2026-08-06，用户游戏核验通过）

- 背景：新地图 1073741853「gsts-verify」上验证自定义信号全链路（`assets:signals register`
  自动初始化注册表 field 10.5 + sendSignal/onSignal 注入）。
- 地图：`1073741853.gil`（`maps:create` 新建，无 --graphs 的最小骨架；分支 placeholder
  `verify-graph-1` id=1073741825，注入后替换为 `_GSTS_verify-signal`，7 节点）。
- 信号：`verify_signal`（send=1610612741/monitor=1610612742/server=1610612743，
  params=[face:str direction:str]），donor=1073741848 的 cube_turn 模板。
- case 源：`verify/verify-signal/verify-signal.ts`（DSL id=1073741826，多分支共存规则）。
- 自动证据：GIA 解码 sendId=1610612741/monitorId=1610612742 节点存在；单文件注入成功；
  注入后回读 7 节点完好；`assets:signals inspect` 回读 `verify_signal` 带参数。
- 用户游戏证据：编辑器打开正常、信号行为符合预期，核验通过。
- 踩坑记录（已回写 SKILL.md 关键点）：信号 case 编译必须配 inject（GIA 生成从
  `cfg.inject` 读注册表）+ `--noinject`；多分支 DSL id 必须互不相同（merge 按图 id 合并）。

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
