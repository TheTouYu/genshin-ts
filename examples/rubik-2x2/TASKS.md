# rubik-2x2 P4 后续任务规划（2026-08-13）

> 状态：活跃（每轮一个任务，完成→自动验证→用户核验→提交）
> 背景：组件差分复盘闭合"基础运动器 = type 4"（生产修复+写回已完成，游戏核验转动通过）；
> 游戏核验暴露 2 个玩法 bug（初始间距、位移累积），另有 4 项跨域任务待安排。

## 已完成（本轮提交）

- 5473175：P4 第二步实现推进（v2/v3 工作树）——8 角块动态创建+6 选项分派+运动器组合、配色、挂载知识、game.ts import 修正
- da3f16f + 68afe5d：组件修复闭环——basicMotion type 18→4（生产编码/测试/export+entities 解码）、component-diff 差分资产、v4 写回 8 角块（游戏核验转动通过）、docs 全面修正

## 待办任务（按执行顺序）

### P4-1 角块初始间距（bug a）——✅ 已关闭（2026-08-14 游戏核验通过）

- 症状：createPrefab 创建后 8 块贴合无间隙，与装配体摆放不一致
- **修复（v5）**：createPrefab 位置 ±0.4825 → ±0.5（中心距 1.0，0.965 尺寸块留缝 0.035），已编译注入
- 假设：game.ts createPrefab 角偏移 ±0.4825（中心距 0.965 = 块尺寸 0.965 → 无缝），装配体 position 为 ±0.5（留缝 0.035）
- 验证：对照 gen-assets.py CORNERS 位置（±0.5）与 game.ts 注释，确认目标间距；
  ⚠️ 风险：动态实体 scale 来自 instance 槽（0.965），若 createPrefab 未应用 instance scale，缝宽会变——修复后需游戏核验实际缝隙
- 修复：game.ts createPrefab 位置改 ±0.5（或按目标缝反推偏移）
- 验收：游戏核验初始 8 块与装配体一致（有缝、对称）
- 证据层：源码对照 + 用户游戏核验

### P4-2 转动位移累积（bug b）——✅ 已关闭（2026-08-14 游戏核验通过：位置+朝向全精确）

- 完整修复链：v5 预计算 → v5.3 平行分量+0-based → v5.4 层成员动态（循环）→ v5.5 自旋轴局部系转换
- 知识落盘：docs/game-engine-knowledge/motion-devices.md

- 症状：每次 R/L 操作后块有小范围位移，8 轮（R×4+L×4）后多块重叠
- **日志实证（23-32-10 会话）**：①orbit 公式缺 v_perp 去平行分量（X 分量被错误缩放）②逐段读实时位置累积误差——第 8 轮位置读取 X 漂移 +0.256（每轮 ~0.032），自旋角也漂移（270.0862°）
- **修复（v5 方案 A）**：tab 事件一次性预计算 5 段速度（p_k = v0·Ck + (axis×v0)·Sk 递推，vel_k = (p_k−p_{k−1})·5），存 20 个 vec3 图变量；定时器回调读固定槽直接加运动器，不再读运行时位置
- **结构优化（v5.1）**：6 分支 → axes/layers 字典数据驱动（节点数 2400→498，单路径物化一次）
- 验收：连续多轮（≥8）转动后块仍对齐网格，无累积漂移
- 证据层：真实日志逐帧 + 用户游戏核验

### P4-3 CLI 组件移除能力 + 组件操作验证

- 背景：用户手动添加的命中检测（type 12）/物件镜头（type 13）仅用于规则确认，需**通过命令行移除**；
  并逐步验证文档已支持组件（1/3/4/6/12/13/16/17/27/28/29）均可命令行操作且游戏正常
- 工作①：CLI staticPrefabUpdates 扩展组件移除能力（当前 setStaticAssemblyComponents 只增/替换，无移除）；
  ⚠️ 注意：写回后需用户重新加载地图/游戏（避免编辑器旧内存覆盖）
- 工作②：用命令行移除 1077936135 的 12/13（差分确认）
- 工作③：逐组件验证矩阵（添加→回读→游戏核验→移除）
- 验收：命令行移除成功 + 差分回读一致 + 游戏正常；验证矩阵文档化
- 证据层：CLI 自动回归 + 差分回读 + 用户游戏核验

### P4-4 examples 构建类型问题——✅ 已关闭（2026-08-15，tsc + quicktest 全绿）

- **症状**：`npm run build` 被 examples 阻塞（最初 49 个错误；本轮接手时 34 个：game.ts + 旧转换产物 game.gs.ts）。
- **根因（分层定位）**：
  1. `defineComposite` 公开类型不接受 Stage 1 注入的 `provenance` 字段；
  2. `connect` 接口类型漏了 #10 生产实现已支持的 `FlowMarkerRef`；
  3. `f.node`/`f.registerExecNode` 的 `args: value[]` 与 DSL“伪装返回值类型”不匹配（equal→boolean、dataTypeConversion→string、assemblyList→number[] 等运行时都是 value 实例）；
  4. `createEntity/createPrefab/createPrefabGroup` 的 `unitTagIndexList` 不接受运行时已支持的 `list<'int'>` 实例；
  5. 历史 timerName 缺口仍未闭合：`server_globals.d.ts` 的 `setTimeout/setInterval` 没声明转换器传入的第三参 `meta`；
  6. 顺带暴露并修复：类型级 `typeof a.b`（QualifiedName）被定时器捕获逻辑误当运行时变量 → 生成跨作用域 `timerName` 引用。
- **修复**：`RuntimeExecNodeArg` 联合类型（value.ts）；core/nodes 契约同步；生成器 `applyDefinitionTypeContracts` 走 `--composite-contracts-only` 最小生成；`TimerOptions` 导出并接入 `server_globals.d.ts`；`shouldCaptureIdentifier` 排除 QualifiedName；`tests/timer_global_overload_type_safety_test.ts` 增加 evt/timerName 非 any 类型断言作为回归。
- **验收**：`npm run build` 绿（0 错误）；`npm run quicktest` 绿（66 GIA，--noinject）；`npm test` 在已知预存边界 `assert-enum-combinations.ts E_UNKNOWN_NODE_VARIANT` 失败（与本次改动无关，见 docs/architecture/composite/testing.md 2026-07-31 记录）。
- **证据层**：tsc 自动验证 + 无注入测试管线；纯类型层修复，无游戏验证需求。

### P4-5 type 4 配置变体调查（超范围，需安排）

- 现象：历史样本 tests/fixtures/mount_records.ts 中 type 4 槽 f14 为 `2001c81f01`（5B），默认快照为 `c81f01`（3B）
- 工作：受控实验（编辑器添加基础运动器后修改某项参数 → 差分归因 f14 内部字段语义）
- 验收：f14 字段语义闭合或标记不可变
- 证据层：相邻快照差分 + 用户编辑器操作

### P4-6 type 18 组件 UI 名（未闭合）

- 用户不确定 UI 显示名；不阻塞任何任务，待用户方便时查看编辑器组件面板后补充

## 执行节奏

1. 每轮只推进一个任务（P4-1 → P4-2 → P4-3 → …），每轮至少一个可唯一归因的变化
2. 每项完成标准：实现 → 自动验证（测试/差分）→ 用户游戏核验 → 提交（含文档同步）
3. 组件规则结论变更时同步 docs/game-engine-knowledge/components.md 与 component-diff reference