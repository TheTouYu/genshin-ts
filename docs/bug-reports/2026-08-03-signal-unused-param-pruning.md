# Bug 汇报：onSignal 未消费的信号参数被 IR 裁剪，触发误导性的 schema mismatch

- 日期：2026-08-03
- 来源项目：star-cube-nexus（星序方枢，2×2 魔方核心操作 MVP，Phase 2 选项卡信号驱动）
- 严重程度：中（编译中断，有 workaround；不影响已注入产物）
- 状态：已修复（2026-08-03，校验层；项目侧真实编译复验待 owner）

## 修复记录（2026-08-03）

- `src/compiler/ir_to_gia_transform/build_signal_definition.ts` 的 `assertRegisteredSchema`：
  - monitor-only（无 send）时改为**按 pinIndex 对齐注册表参数**校验（IR 输出引脚 3+i 对应注册表第 i 个声明参数，见 `runtime/core.ts` 中 `markPin(eventNode, paramName, 3 + i)`）；未消费参数合法缺失（子集校验），消费越界/类型不符仍报错。
  - 有 send 时保持全量比对（send args 为权威声明），错误信息补充"IR 端为 send args / 消费推断"说明，不再误导排查方向。
  - GIA 产物不受影响：监听信号 CompositeDef 输出始终来自注册表全量参数（`buildSignalDefinitionAccessories` 末尾 `params = registered.params`），IR 裁剪只影响校验推断。
- 新增回归 `tests/composite/test-signal-monitor-partial-consume.ts`：
  - 正例：注册表 (str, str)、onSignal 只消费 face → 不抛错；产物监听信号 CompositeDef 输出含 face+direction 全量；
  - 正例：全量消费 → 不抛错（保持原行为）；
  - 负例：消费第 3 个不存在参数 → 报错；消费 face 但推断类型 float → 报错。
- 验证：红灯（修复前 `IR=[str], map=[str, str]` 复现）→ 绿灯；`tests/composite/test-signal-registered-layout.ts` 通过；`npm run build` 通过；`npm run quicktest` 全过（65 个 GIA，--noinject）；`git diff --check` 通过。**未运行**：star-cube-nexus 真实编译（可移除 `direction='flip'` workaround 后验证）与游戏内验证。

## 现象

`cube_turn` 信号在编辑器注册表为 `(str, str)` 两个参数。当服务器图 `.onSignal` 回调只读取其中一个参数（例如 `evt.params.face`），不再读取 `evt.params.direction` 时，`gsts build` 失败：

```
[error] signal schema mismatch for cube_turn: IR=[str], map=[str, str]
    at assertRegisteredSchema (src/compiler/ir_to_gia_transform/build_signal_definition.ts:580)
[error] ir_to_gia failed: <outDir>/src/cube2/param-turn.json
```

## 最小复现

1. 编辑器侧注册信号 `cube_turn`，参数 `(str, str)`（本项目为 send=1610612741 / monitor=1610612742 / server=1610612743）。
2. 服务器图 `.onSignal(CubeTurnSignal, (evt, f) => { ... })` 中只消费 `evt.params.face`，不消费 `evt.params.direction`。
3. 客户端图 `sendSignal(CubeTurnSignal, 'U', 'cw')` 正常发送两个参数。
4. 运行 `gsts build` → 步骤 2 的图 `.gia` 生成失败，报 schema mismatch。

复现源码：star-cube-nexus `src/cube2/param-turn.ts`（改动前读 `evt.params.direction` 编译成功；改为只读 `evt.params.face` 后失败；恢复消费 `direction` 后成功）。

## 根因分析

- IR 中 `monitor_signal` 节点只携带信号名（`args: ["cube_turn"]`），参数输出引脚按**实际被消费的 `evt.params.X` 访问**生成（IR 为 SSA 风格，未消费的输出没有连接）。
- `collectSignalUsages`（`build_signal_definition.ts`）从 monitor 输出引脚（`connIndex` 中 `pinIndex >= 3` 的输出）**推断** IR 端参数 schema；未消费的参数因此从推断结果中消失 → `IR=[str]`。
- `assertRegisteredSchema` 用推断结果与编辑器注册表比对 → 不匹配抛错。

关键问题：信号参数 schema 的权威来源是 `defineSignal` 声明与编辑器注册表，但 IR 端以"是否被消费"推断，导致：
1. 声明了但未消费的参数触发虚假的 schema mismatch；
2. 报错信息未说明 `IR=` 是从使用情况推断的，误导排查方向（初看像注册表问题，实际是 IR 生成问题）。

## 证据边界

- 已确认：star-cube-nexus 内编译层证据——读参数 → 编译/生成/注入成功；不读 → 编译失败；恢复读 → 成功。三次均为同一提交基线上仅改动参数消费点。
- 未确认：编译器内部 IR 生成的精确裁剪位置（`monitor_signal` 输出引脚生成逻辑），上述为从 IR JSON 与 `collectSignalUsages` 源码反推。
- 未涉及：GIA 编码、游戏内行为不受影响（失败的图未生成）。

## Workaround（当前采用）

在 `.onSignal` 中消费全部声明参数以保留 IR 输出引脚。本项目将"方向切换"请求编码进 `direction` 参数（`direction === 'flip'` 表示切换），既保留参数又自然使用。代价：参数语义被占用，需要注释说明。

## 期望行为 / 建议修复方向

- IR 生成 `monitor_signal` 输出引脚时，以 `defineSignal` 声明的 schema（runtime 已知，见 `core.js` 中 `signalInfo.params.forEach` 填充 `evt.params`）为准，为全部声明参数生成输出引脚，而非按消费裁剪；
- 或 `assertRegisteredSchema` 比对时以注册表 schema 为准补齐推断缺失的参数，并改进错误信息（说明 IR 端为推断值）。

## 附注

- 编译器仓库内最小复现测试已补：`tests/composite/test-signal-monitor-partial-consume.ts`（声明 2 参数信号、onSignal 只读 1 个参数，含越界/类型不符负例）。
- 修复后本项目可移除 `direction='flip'` workaround，回到更直观的 `face='toggle'` 语义。
