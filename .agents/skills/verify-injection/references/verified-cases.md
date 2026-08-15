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

## verify-u1-cross-graph + verify-u2-multi-mount（2026-08-16，用户游戏核验通过）

- 背景：S4 测评暴露 U1（跨图信号投递未验证）与 U2（同图多实体挂载未验证）——信号灯阵
  第二 demo 的架构命门。
- 地图：`1073741888.gil`「GSTS核验-复合族4」（现有实例，未新建）。
- 分支图：placeholder 1830/1831/1832 → 注入后 `_GSTS_send`（3 节点）/`_GSTS_recv`（5 节点）/
  `_GSTS_u2-multi-mount`（2 节点）；attach：1830/1831→1077936151，1832→1077936151+1086324737
  （日志实际执行实体 1086324738——默认模版实例，与 attach 目标同 def）。
- case 源：`verify/u1-cross-graph/send.ts|recv.ts`（verify_ping2）、`verify/u2-multi-mount/u2-multi-mount.ts`。
- 自动证据：GIA wire 断言（send=1610612744/monitor=1610612745 与注册表精确一致、字面量在位）；
  注入后图名索引逐节点吻合；Temp 同步 MD5 一致。
- 用户游戏证据：2699 日志——**U1 跨图投递成立**（send 图 1830 发送 5 次 → 图 1831 与 1828
  均收到，参数 ping-u1/tag-u1 完整传递）；**U2 多挂载成立**（图 1832 在两个实体上独立执行，
  u2-fire ×2）。证据 `~/genshin-ts-evidence/u1-u2-verify/`（SHA ac82e67a…）。
- 规则结论：跨图信号投递 = 广播语义（所有监听该信号的图均收到）；同图可挂多实体且各实例
  独立执行（whenEntityIsCreated 每实体触发）。已同步 signals.md「尚未闭合」条目闭合。

## verify-u4-color-change + verify-u4b-model-display（2026-08-16，用户游戏核验）

- 背景：U4 判定节点 835（modifyModelColorAndMaterial）有效性 + 灯阵明暗方案选择；
  835 不在编辑器 data.json/server 静态元数据，committed DSL 支持为旧快照遗产。
- 地图：`1073741888.gil`；分支图 1833 `_GSTS_u4-color-change`（835）/ 1834
  `_GSTS_u4b-model-display`（308），均 attach 1077936151。
- case：`verify/u4-color-change/`（图 1835 DSL：whenTabIsSelected → 835 改色 0xFF0000/
  opacity 100）+ `verify/u4b-model-display/`（图 1836 DSL：tabId==1 → 308 false 隐藏，
  其他 → 308 true 显示）。
- 自动证据：GIA wire 断言（835 帧 IN3=16711680、IN4=100.0 参数正确；308 双分支结构）。
- 用户游戏证据（2701/2702 日志）：**835 执行但不变色 → 无效节点 ID**（三重重证据）；
  **308 生效**——点 R 实体隐藏（u4b-hide-fire ×1）、点 L 重现（u4b-show-fire ×5）。
- 结论：灯阵明暗用 308 显隐（亮=显示/暗=隐藏）；835 从 M4 同步保留清单移除（新资源
  删除方向正确）。证据 `~/genshin-ts-evidence/u4-color-change/` + `u4b-model-display/`。
