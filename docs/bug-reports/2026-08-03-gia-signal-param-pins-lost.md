# Bug 汇报：IR→GIA 转换丢失信号节点参数引脚，信号参数判断恒为"否"

- 日期：2026-08-03
- 来源项目：star-cube-nexus（星序方枢，2×2 魔方核心操作 MVP，Phase 2 选项卡信号驱动）
- 严重程度：高（信号驱动的图在编辑器内条件恒"否"，参数链路整体失效，且无编译报错）
- 状态：待处理

## 现象

游戏编辑器打开 `_GSTS_param-turn` 服务器图（1073741826）时，方向切换分支（`direction === 'flip'`）的"等于"节点条件固定显示为"否"。用户怀疑"编译出来的代码里压根就没有这个双分支条件"。排查后确认：**双分支节点存在，但等于节点的参数输入连接悬空**——它连接的监听信号节点在 GIA 中不存在对应输出引脚，因此恒 false。

进一步排查发现整条信号参数链路在 IR→GIA 转换中丢失：

| 环节 | 状态 |
|---|---|
| 源码（tab-input.ts） | `sendSignal(CubeTurnSignal, 'U', 'flip')` 参数明确 |
| IR（tab-input.json） | `send_signal("cube_turn", "U", "flip")` 参数完整 |
| GIA（tab-input.gia） | 发送信号节点（genericId 1610612774）两个 InParam 引脚**空值且无连接** |
| IR（param-turn.json） | `equal(conn(monitor, index 3, str), "U")`、`equal(conn(monitor, index 4, str), "flip")` 正确消费参数输出 |
| GIA（param-turn.gia） | 监听信号节点（genericId 1610612775）**只有流引脚（OutFlow），无任何 OutParam 引脚**；equal 节点的连接 `connects: [{id: 31, connect: {kind: OutParam, index: 4}}]` 指向不存在的引脚 |

## 最小复现

1. 定义信号 `cube_turn (str, str)`（send=1610612741 / monitor=1610612742 / server=1610612743 已注册）。
2. 客户端实体图发送 `sendSignal(CubeTurnSignal, 'U', 'flip')`；服务器图 `.onSignal` 中 `equal(evt.params.direction, 'flip')` 判断。
3. `gsts build` 成功（无任何报错），注入成功。
4. 解码 `.gia`：发送信号节点参数 InParam 为空；监听信号节点无参数输出引脚；equal 的输入连接悬空。
5. 编辑器打开图：equal 条件恒"否"。

复现源码：star-cube-nexus `src/cube2/tab-input.ts` 与 `src/cube2/param-turn.ts`（当前提交基线）。

## 根因分析（推断）

`ir_to_gia_transform` 处理信号节点时未生成参数引脚：

- 发送侧：`send_signal` 的 args（信号名 + 参数列表）在 IR 中完整，但 GIA 编码时参数值（`'U'`/`'flip'` 等字符串常量）未写入节点的 InParam 引脚（既无 `value` 也无 `connects`）。
- 接收侧：`monitor_signal` 节点在 GIA 中只生成流引脚（InFlow/OutFlow），未按信号注册表 schema 生成参数 OutParam 引脚；IR 中消费参数输出的 equal 节点连接（OutParam index 3/4）因此悬空。

与既有问题 `2026-08-03-signal-unused-param-pruning.md`（IR 按消费裁剪信号参数 schema）处于同一条链路，可能共享根因：信号参数 schema 未在转换层显式展开。

对照证据：1848 地图中编辑器原生创建的监听信号节点（genericId 1610612743，图"信号-参数-完整参数"）具有完整参数引脚（9 个 kind=3 引脚），说明 GIA 格式本身支持信号参数引脚，问题在编译器生成端。

## 证据边界

- 已确认：IR 层参数完整；GIA 层发送侧参数引脚空、接收侧无参数输出引脚；equal 连接指向不存在的 OutParam；编辑器原生图信号节点有参数引脚（对照）。
- 推断：根因在 `ir_to_gia_transform` 信号节点处理逻辑，未定位具体函数行（`send_signal`/`monitor_signal` 的 GIA 引脚生成代码）。
- 未确认：游戏内运行时行为（编辑器显示恒"否"；运行时 equal 悬空输入取默认值 → face/flip 判断大概率全部失效，即旋转与切换均不触发；此前用户观察到的"自旋"现象来自更早注入的版本，与本 bug 的关联待游戏内复验）。

## Workaround（暂无）

信号驱动的图参数判断全部失效，无法通过项目侧代码规避；编辑器内手动连接参数引脚可作为临时手段（未验证）。

## 期望行为 / 建议修复方向

- 发送侧：`send_signal` 的参数字符串常量写入 GIA 节点 InParam 引脚的 `value`（参照普通节点常量参数编码方式）；
- 接收侧：`monitor_signal` 按信号注册表 schema 生成参数 OutParam 引脚（索引从 3 开始对应参数 1..n，与 IR 的 `conn(node, index)` 约定一致），并保证 IR 消费连接的引脚物理存在；
- 建议同时排查 `signal-unused-param-pruning` 是否同源（IR 端按消费生成输出引脚 vs GIA 端未生成引脚，两侧约定不一致）。

## 附注

- 编译器仓库最小复现测试待补：构建"发送 2 参信号 + 接收方 equal 消费参数"的图，解码 GIA 断言发送节点 InParam 有值、监听节点存在 OutParam 引脚且连接完整。
- 本项目当前 param-turn/tab-input 图已在 1073741849 注入（含本 bug），修复编译器后需重新 build 注入并游戏内复验（连续旋转、方向切换）。
