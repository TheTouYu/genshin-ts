# 节点图逻辑模块：普通数据/控制流连接

只在调查普通 NodeGraph 内 SysCall 的 DataOut→DataIn 或 FlowOut→FlowIn 时加载本模块。
信号注册、监听/发送定义和信号参数仍走 `signals.md`；Composite 边界仍走 Composite 专项流程。

## 最小恢复（唯一锚点 = manifest 恢复块）

普通连接续作只读 connection-v1 的 notes/manifest.md 顶部「恢复块」（~15 行），不在此重复字段：
`/home/h/genshin-ts-evidence/node-graph-logic/node-graph-systematic/2026-08-06-connection-v1/notes/manifest.md`
（证据目录在 genshin-ts-evidence，不在仓库内，勿 find/grep 全盘搜索；历史 case 段仅在核对
证据时读，恢复时跳过）。恢复块含 map path/mapId/GID/LOCKED_BEFORE/LOCKED_HASH/最近唯一
操作/当前图状态/下一选题；每轮结束更新它。

当前 Authority：

- 控制流：`docs/game-engine-knowledge/control-flow.md`
- 数据流：`docs/game-engine-knowledge/data-flow.md`
- 节点身份与 Variant：`docs/game-engine-knowledge/node-graphs.md`

## 在让用户动图前先验 pin

先从锁定快照读取源/目标 `nodeIndex`、generic/concrete ID 和 pinCount，再用
`extract-node-defs.py` 定点检查第三方定义：

```bash
python .agents/skills/editor-incremental-gia-investigator/scripts/extract-node-defs.py \
  <data.json> <source-generic-id> <target-generic-id>
```

- 控制流源必须有匹配的 `FlowPins[].Direction=Out`；目标必须有 `Direction=In`。
- 数据流源/目标必须有方向和类型相容的 `DataPins`。
- 为隔离 Variant，优先选择当前未配置的 Fixed 目标；不要让第二个未知 Variant 混入同轮。
  **源是未配置 Variant 时连线会触发自动实例化**（concreteId=KernelID + OutParam pin，
  v18 实测），选 Fixed 源可省去该联动。
- 明确用户要连接的语义槽位，例如 Default/Case1，而不是只说“某个分支”。
- 第三方定义只做操作可行性预检；若编辑器或真实 GIL 与其冲突，以真实文件为准并停止推广。

`FlowPins=[]` 的纯查询节点不能作为 FlowIn 目标。本预检必须发生在给用户操作指令之前，避免用户
完成一次无法产生目标连线的保存。

## 已锁定续轮

用户回复“好了/已保存”后，不再查询 PKC、列地图或打印整图：

```text
当前地图 hash 与 LOCKED_HASH 比较
→ capture-experiment.py 锁定 before/after
→ compare-gil-node-graph.ts 摘要
→ 只在唯一变化成立后 --full
→ inspect-graph-nodes.py 定点看源/目标
→ extract-node-raw.ts --pins 检查 presence
→ compare-gil-root-wire.py 记录图外同步变化
```

常用命令：

```bash
npx tsx tools/compare-gil-node-graph.ts "$BEFORE" "$AFTER" "$GID"
python .agents/skills/editor-incremental-gia-investigator/scripts/inspect-graph-nodes.py \
  "$AFTER" "$GID" --pins
npx tsx .agents/skills/editor-incremental-gia-investigator/scripts/extract-node-raw.ts \
  "$AFTER" "$GID" "$SOURCE_NODE" --pins
```

`extract-node-raw.ts --pins` 必须把 GraphNode 的每个重复 field 4 当作一个完整 NodePin；不要把
第一个 NodePin 的 i1/i2/value/connects 内部字段误当成 pin 列表。

#### 一条命令完成验证与重放（不要再手写 validator/replay）

```bash
# 控制流：源新增 OutFlow
npx tsx .agents/skills/editor-incremental-gia-investigator/scripts/verify-control-flow-experiment.ts \
  "$EXP" --graph-id 1073741836 --source 11 --target 27 --outflow-index 2 \
  --expected-pin-raw "0a0408021002 120408021002 2a0a081b 12020801 1a020801" \
  --before-hash <sha> --after-hash <sha>

# 数据流：目标新增 InParam（单线或 --wires 多线一次保存）
npx tsx .../verify-data-flow-experiment.ts "$EXP" --graph-id N \
  --source 12 --target 24 --target-index 1 --target-type 3 [--expected-pin-raw hex]
# 替换：目标已有 pin 的线被换源（connects.id 改写，不新增 pin）
npx tsx .../verify-data-flow-experiment.ts "$EXP" --graph-id N \
  --replace-wire "23:24:1:3:50"   # source:target:targetIndex:targetType[:kernelId]
# Variant 手动选型：concreteId=KernelID + R<T> pin 实例化
npx tsx .../verify-data-flow-experiment.ts "$EXP" --graph-id N \
  --variant-select "18:370:3:5" --variant-pins "0:1"  # node:kernelId:type:selector
```

输出 `<EXP>/verify/{validation.json,manual-flow-v1.gia,manual-flow-v1.gil,result.json}`，包含：
哈希、唯一变化、pin 语义与 raw、目标字节不变、root 变化报告、donor verify（通用
限界 shim：candidate 只允许携带与未修改 before 完全相同的 verify 错误）、手工同构重放。
脚本已在 case1-5 + Variant case1 上回归 ACCEPT；新增实验只需换参数，禁止凭记忆重写验证逻辑。

#### 续轮效率纪律（2026-08-06 复盘）

- 上轮样板优先：`experiments/control-flow-case2-node11-to-node27-v12-v13/` 的 validator/replay
  或上面的参数化脚本都是已回归样板；复制改参数，不要重写。
- `verify-control-flow-experiment.ts` 支持新增节点实验形态：传 `--allow-added <N>`
  （节点集合 = before + N，目标 genericId 查 after，candidate 从 after 并入该无 pin 节点
  并按 after 节点顺序排序）。目标 InFlow 非默认时传 `--target-index <N>`，candidate 的
  connect/connect2 自动携带 index。OutFlow index=0（默认输出）时传 `--outflow-index 0`，
  i1/i2 自动省略 index（v20 实测）。
- `readVarint` 返回 `{ value, next }`，`next` 是绝对游标；`position = key.next`，禁止 `+=`。
- structuredClone 会丢失 protobufjs Message 原型（toJSON 失效，enum 从名字变数字）；candidate
  与 after 的 pin 对比必须两侧都 clone 后再 JSON.stringify，否则全量误报（case4 --sync-extra-pin
  教训）。
- 第三方定义路径已记录在 manifest 恢复块，勿再全盘搜索。
- 工具脚本行为与预期矛盾时，先与已知正确版本 diff（一次调用），不要从零新写 debug 脚本。
- 新实验目录命名延续 `control-flow-caseN-<source>-to-<target>-v<M>-v<M+1>`。

#### 实验形态预检（case3 新增节点教训，2026-08-06）

预检阶段（用户动图前）先判定本轮实验形态，并确认 verify 脚本参数匹配，避免保存后才发现
工具不支持而反复修：

- **纯连线**：target 已在 before 图中 → 默认断言（节点集合不变、目标 bytes 相同）适用。
- **新增节点 + 连线**：target 不在 before 图中 → 必须用 `--allow-added <N>`；
  同时确认 `--target-generic` 会查 after（脚本已处理）。
- 新增节点落图规律：编辑器**复用空闲 nodeIndex**（case3 用了 v8→v9 删除的 nodeIndex 2），
  节点在 nodes 数组中按 nodeIndex 升序插入中间而非尾部追加 → `--target`、`--allow-added`
  和实验目录名里的目标 nodeIndex 必须**保存后从 after 确认**，不能预猜。
- 目标 InFlow 非默认时预期 `--target-index <N>`；若不知道编辑器目标 ShellIndex，
  data.json FlowPin ShellIndex 可预查（case3 Break=1）。
- **新增分支 + 连线**（多分支节点）：编辑器会联动 cases 列表 +1 项（case4 实测）→
  verify 加 `--sync-extra-pin 1`（允许恰好 1 个既有 pin 值变化，candidate 从 after 带值）。
- **替换既有线**：目标 pin 已连过线时，新线改写该 pin 的 connects.id（不新增 pin/connects）→
  数据流用 `--replace-wire`（见上）；连线前可从 before 的 connects.id 预知旧源。
- **Variant 手动选型（不连线）**：concreteId 缺失→KernelID + 所有 R<T> 数据 pin 实例化
  （固定类型 pin 不实例化）→ 数据流用 `--variant-select + --variant-pins`；
  TypeSelectorIndex 查 data.json `Variants` 列表 0-based 位置（0 省略）。
- **跨类型数据直连被编辑器拒绝**（用户游戏内确认）：需先手动改 Variant 类型再连线，
  不要设计跨类型连线实验。

#### root 图外变化摘要（case3 已验证样板）

compare-gil-root-wire.py 输出结构大，直接提取摘要，不要整包打印：

```bash
python3 .agents/skills/editor-incremental-gia-investigator/scripts/compare-gil-root-wire.py \
  "$BEFORE" "$AFTER" 2>&1 | python3 -c "
import json,sys
d=json.load(sys.stdin)
for c in d['changedRootFields']:
    print(c['fieldNumber'], c['beforeCount'],'->',c['afterCount'],
          c['beforeEncodedBytes'],'->',c['afterEncodedBytes'],
          'equalLen:',c['equalLengthContentChange'])
"
```

预期模式（已闭环）：root 10（NodeGraph）长度随图变化；root 46 等长变化标 INSUFFICIENT，
不归因给连线。

## 已确认的连接骨架

### 数据连接

- 挂在目标 InParam；`connects.id=源 nodeIndex`。
- `connect/connect2` 指向源 OutParam（kind=4）：源默认（Shell0）省略 index，**源非默认
  显式源 ShellIndex**（dataflow-case2：拆分 y Shell=1 → `connect.index=connect2.index=1`）。
- **Fixed 源 OutParam 不实例化**（dataflow-case1/2/4：默认与非默认源、一源多目标、缺号
  目标源侧 bytes 全不变）；**Variant 源连线时自动实例化**（v18：concreteId=目标类型
  KernelID + OutParam pin，value=ConcreteBase 嵌套，属变体选型机制而非连线行为，见下）。
- 目标 InParam 的 i1/i2 index=ShellIndex（默认省略、非默认显式：preset_index=1、
  preset_value=2、scale=1）；type 落盘（Int=3、Flt=5、Ety=1）；无默认值时不落 value。
- 一源多目标：各目标 pin 各挂 connects（id 同源），源不落盘；一次保存多线互不干扰。
- **多 pin 目标新增 pin 按 ShellIndex 升序插入数组**（v19 实测：已有 1/2 时补 0 号插头部；
  candidate 构造用升序 splice，不是尾部追加）。
- **替换语义**（v18 实测）：目标 InParam 已有线时，新线改写该 pin 的 connects.id
  （不新增 pin、不新增 connects 条目），旧线在源侧本就不落盘故无需清理。
- index=0 的 wire presence 与显式 `index:0` 必须通过 raw bytes 区分。
- 验证：`verify-data-flow-experiment.ts <dir> --graph-id N --source N --target N
  --target-index N --target-type N [--expected-pin-raw hex]`；多线一次保存用
  `--wires "s:t:i:ty[:srcIdx],..."`（changed=目标集合、每个 source byte-identical、
  candidate=before+各目标按 ShellIndex 升序插入新 pin）；替换与选型见上。

### 控制流连接

- 挂在源 OutFlow；`connects.id=目标 nodeIndex`。
- 默认 OutFlow[0] 省略 i1/i2 index（v20 实测：node 27 FlowOut→24）；非默认
  OutFlow[1]/[2]/[3]/[4] 显式 index（case1-4）。
- 默认目标 InFlow 的 connect/connect2 省略 index；非默认目标 InFlow 显式写目标
  ShellIndex（case3：Break index=1，`connect.index=connect2.index=1`）。
- 目标 GraphNode 无论默认还是非默认 InFlow 都不实例化 InFlow pin；
  **数据+控制流可同节点并存**（v20 实测：node 24 同时是 3 数据线目标 + 2 控制流线目标，
  目标侧只落数据 pins，控制流全在源侧）。
- 普通 SysCall OutFlow 无 compositePinIndex；新增 OutFlow 位于既有参数 pin 之前。

真实证据已闭合到源 OutFlow 0/1/2/3/4 与目标 InFlow 0/1：源侧默认省略 index、非默认显式；
目标侧同样默认省略、非默认显式写 ShellIndex；同一目标节点可同时挂默认+非默认 InFlow
（case4：node 2 Start+Break 双连，两条线分别落各自源侧、目标不落 pin）；新增分支时编辑器
联动 cases 列表（StringList +1 项）。更高源 index（>4）、游戏执行语义仍是独立问题，不能由
当前 production 行为反推。

### Variant 选型（v10-v11 + v18 + v21 实测闭合）

- Variant 节点 concreteId = 选中变体的 KernelID；**未配置变体时不落盘**（v9：9 个节点全缺）。
- **手动选型与连线自动实例化同构**（v21 vs v18）：concreteId 缺失→KernelID +
  **所有 R<T> 数据 pin 实例化**（按 ShellIndex 升序、i1/i2 index 默认省略/非默认显式、
  type 跟随、无 connects）；**固定类型 pin 不实例化**（v21：是否相等 result Out Bol 不落盘）。
- 实例化 pin 的 value=ConcreteBase(class=10000, alreadySetVal=true) +
  `bConcreteValue.indexOfConcrete = TypeSelectorIndex`（data.json `Variants` 列表 0-based
  位置；0 省略，非 0 显式：337 Int=2/Str=5、50 Int=0 省略、14 Int=5）+
  value={class: 具体类型 base, itemType:{classBase:Server, type_server:{type: VarType}}}。
- 连线时若 Variant 未配置，编辑器**按目标 pin 类型自动选型**并实例化（v18：node 23
  连 Int 目标 → concreteId=50 C<T:Int> + OutParam Int），随后正常挂 connects。
- 变体切换联动（v11）：concreteId/pin type/value/TypeSelectorIndex/列表元素类型全部跟随。
- 跨类型数据直连被编辑器拒绝（用户游戏内确认），需先手动改类型再连线。

> 生产 gap（已修复，2026-08-06）：`applyEditorConnectionWireRules()` 曾无条件删除所有
> InFlow index；现仅默认目标 InFlow[0] 省略、非默认保留 ShellIndex，
> `test-stage3-ordinary-graph-materializer.ts` 已覆盖默认与非默认目标，待用户编辑器/游戏核验。

## Validator 与重放预检

独立 Validator 直接从 raw before/after 重算哈希、节点集合、changed node、pin raw 和目标节点
不变性，不读取 coordinator 中间 JSON。

进入正式 GIA/临时 GIL 重放前，先对**未修改的 before NodeGraph**运行当前
`nodeGraphMessage.verify()`：

- before 已失败：这是 donor/schema 兼容缺口，不是本轮候选错误；先记录精确字段、值和错误文本。
- before 通过、candidate 失败：再检查本轮增量。
- 候选 NodeGraph bytes 应先与真实 after 严格相等，再调用 injector；这样 injector 失败不会重新打开
  已闭合的 wire 结论。
- 只有临时实验且已证明 before/candidate/after 的边界时，才可在实验脚本中对精确既有错误做限界
  兼容；不得修改 production 或写真实地图。production 兼容修复另开 red/green 工作包。

## 停止条件

- 目标定义没有所需方向的 pin，或用户实际连接槽位不明确；
- 除约定源节点外出现节点增删、metadata 或无法解释的 pin 变化；
- 目标 GraphNode 变化与“控制流挂源侧”既有证据冲突；
- decoded 默认值不足以证明 wire presence；
- donor 自身 verifier 失败却被误当作候选回归；
- 路径、GID、LOCKED_HASH 或唯一操作发生变化。
