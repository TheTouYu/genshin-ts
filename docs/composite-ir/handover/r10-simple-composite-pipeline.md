# Session 交接：最简单的复合节点端到端管线验证

> **会话日期：** 2026-07-03
> **当前分支：** `feat/fork-api-and-layout`（已 stash）
> **干净状态基底：** `8335329 add docs`

---

## 1. 本会话完成的工作

### 1.1 目标

编写一个最简单的复合节点（pure data, 1 input → `addition` → 1 output），从 TypeScript 定义到 GIA 产物的完整管线，并用分析工具链验证源代码结构是否与 GIA 一致。

### 1.2 最终产物

**测试脚本**: `tests/composite/simple-double.ts`

```
Composite "加倍" (pure data)
  input:  x (int)  →  output: result (int)
  build:  f.addition(x, x)    ← "x + x"

Main Graph
  whenEntityIsCreated
    → f.callComposite(加倍, { x: 7 })         ← 复合调用
    → f.dataTypeConversion(result, 'str')     ← int→str 类型转换
    → f.printString(...)                       ← 打印终端
```

**输出文件**:
- `tests/composite/output/simple_double.gia` (1038 bytes) — 游戏可注入的 GIA 二进制
- `tests/composite/output/simple-double.ir.json` — Stage 2 IR JSON（调试用）

### 1.3 游戏验证通过

- 数据流: ✅ printString ← typeConversion ← composite_call ← 复合内部 addition ← x=7
- 控制流: ✅ Event → printString 直连
- 复合内部: ✅ 仅 1 个节点 (Addition, nodeId=200)，无多余控制流节点

---

## 2. 管线验证方法论

### 2.1 三层验证策略

```
层 1: IR JSON 校验 (jq)
  验证节点数、控制流链、数据流链、compositePins 完整性

层 2: GIA 工具链验证
  trace-exec-flow  → 控制流正确（正向：事件 → 终端）
  trace-dataflow   → 数据流正确（反向：终端 → 字面量）
  ascii-layout     → 布局合理、无孤立/碰撞

层 3: 游戏内验证
  复制到 BeyondLocal 导出目录，在节点编辑器中打开检查
```

### 2.2 推荐工作流

```bash
# 1. 编写测试脚本
code tests/composite/my-test.ts

# 2. Build
npm run build

# 3. 生成 GIA
npx tsx tests/composite/my-test.ts

# 4. 验证
npx tsx tests/composite/trace-exec-flow.ts tests/composite/output/my-test.gia
npx tsx tests/composite/trace-dataflow.ts tests/composite/output/my-test.gia  4 0
npx tsx tests/composite/ascii-layout.ts tests/composite/output/my-test.gia

# 5. 复制到游戏目录
cp tests/composite/output/my-test.gia \
  "/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/"

# 6. 在游戏中打开验证
```

### 2.3 IR JSON 核验命令速查

```bash
# 节点总数
jq '.[0] | {nodeCount: (.nodes | length)}' output/simple-double.ir.json

# 控制流链
jq -r '.[0].nodes[] | select(.next != null) | "exec: n\(.id) → n\(.next[])"'

# 数据流（反向）
jq -r '.[0].nodes[] | select(.args != null) | . as $p | $p.args[] | select(.type == "conn") | "data: n\($p.id) ← n\(.value.node_id) (\(.value.type))"'

# 复合定义结构
jq '.[0].compositeDefs[] | {name, id, inputCount: (.inputs | length), outputCount: (.outputs | length), implNodeCount: (.implNodes | length), pinCount: (.compositePins | length)}'

# 引脚映射
jq -r '.[0].compositeDefs[0].compositePins[] | "outer: kind=\(.outerPinKind) idx=\(.outerPinIndex)  →  inner: n\(.innerNodeId) kind=\(.innerPinKind) idx=\(.innerPinIndex)"'
```

---

## 3. 修复的两处 Bug（核心知识）

### 3.1 Bug 1：控制流连接错误

**根因**: `.on()` handler 在 `buildServerGraphRegistriesIRDocuments` 的 Phase A（复合捕获）之前执行。`runCompositeCall` 中 `def.captured` 为 `undefined`，导致：

```typescript
const isPureData = def?.captured?.isPureData ?? false  // → false!
```

`__composite_call__` 标记节点被注册为 `type: 'exec'` 而非 `type: 'data'`，控制流链错误地经过 composite_call，在 GIA 中 exec 边丢失。

**修复**: 在 handler 之前强制触发一次 Phase A 捕获：

```typescript
// 强迫 buildServerGraphRegistriesIRDocuments 执行 Phase A
const dummy = buildServerGraphRegistriesIRDocuments({ defaultName: '__precapture__' })
```

> **注意**: 这是临时方案。理想方案是提供只跑 Phase A 的 API，或者让 handler 的注册推迟到 Phase B。

### 3.2 Bug 2：`__composite_capture__` 被映射为 Double Branch

**根因**: `src/compiler/ir_to_gia_transform/mappings.ts:426`：

```typescript
__composite_capture__: 2  // GIA nodeId=2 = Double Branch（条件分支！）
```

`__composite_capture__` 是 IR 层的输入占位符（通过 compositePins 路由），不需要在 GIA 中存在物理节点。但 `resolveImplNodeId` 把所有 implNodes 都编码进 GIA，capture 节点被赋予 nodeId=2（Double Branch）——一个控制流节点。

**r10 修复（有缺陷）**: 只在无 exec 出边时跳过 capture，exec 复合中 capture 有出边所以仍被编码为 Double Branch。

**r11 完全修复（当前有效）**: 在 `src/compiler/ir_to_gia_transform/composite.ts` 的 `buildCompositeAccessories` 中：

1. **始终**过滤 `__composite_capture__`，不关心是否有 exec 出边
2. 找到 capture 的第一个 exec 子节点（`implEdges[captureId][0]`）
3. 将 `compositePins` 中对 capture 的引用（InFlow）重定向到该子节点
4. 从 `implEdges` 中移除 capture 的出边，避免布局引擎看到已删除节点的入边

```typescript
// 始终过滤 capture 节点
const implNodesForEncoding = def.implNodes.filter(
  n => n.type !== '__composite_capture__'
)

// 重定向 compositePins：指向 capture 的 pin 改为指向首个 exec 子节点
const actualNodeId = captureNodeId !== undefined && entry.innerNodeId === captureNodeId && captureFirstChildId !== undefined
  ? captureFirstChildId
  : entry.innerNodeId
```

**验证**: ascii-layout 显示 impl 图无 Double Branch 节点，游戏编辑器内复合内部无多余节点。

### 3.3 Bug 3：字符串拼接产生 `[object Object]`

**根因**（初步修复，发生在第 1 轮修正中）:

```typescript
// 错误: JS 侧 'str' + proxyObj → "[object Object]"
f.printString('加倍结果=' + result)
```

`callComposite` 返回的 output 值是代理对象（pin 引用），和 JS 字符串字面量用 `+` 拼接时触发 `.toString()` → `[object Object]`。

**修复**: 用 DSL 层的数据类型转换：

```typescript
const resultStr = f.dataTypeConversion(result, 'str')  // int → str
f.printString(resultStr)
```

---

## 4. 三阶段管线概念映射

### 4.1 每个 Stage 的角色

```
TS 源码
  │
  ▼ Stage 1 (ts_to_gs_transform)
  │  语法变换: g.server().on() → 捕获 AST
  │  常量折叠、循环展开、类型推导
  │
  ▼ Stage 2 (gs_to_ir_json_transform)
  │  运行时执行 .gs.ts → 捕获 MetaCallRecord
  │  IR JSON: nodes, edges, compositeDefs
  │  核心接口: buildServerGraphRegistriesIRDocuments()
  │
  ▼ Stage 3 (ir_to_gia_transform)
  │  IR JSON → protobuf GIA 二进制
  │  nodeId 映射、布局计算、compositePins 编码
  │  核心文件: composite.ts, layout.ts, node_id.ts, mappings.ts
  │
  ▼ GIA 文件 → 注入游戏
```

### 4.2 关键概念在不同 Stage 的命名

| 概念 | Stage 2 (IR) | Stage 3 (GIA) |
|------|-------------|---------------|
| 复合调用标记 | `__composite_call__` (type: data/exec) | `nodeId` + compositePins |
| 输入占位符 | `__composite_capture__` (implNode) | 不存在（始终跳过，compositePins 重定向至首个 exec 子节点） |
| 引脚连接 | `{ type: "conn", value: { node_id, index, type } }` | `NodePin.connects` 数组 |
| 类型转换 | `data_type_conversion_str` | `data_type_conversion__int_str` (nodeId 查找) |
| 字面量 | `{ type: "int", value: 7 }` | `bInt: { val: 7 }` |
| 执行流 | `next: [nodeId]` | `OutFlow pin → connects → InFlow pin` |

### 4.3 四种引脚类型 (NodePin_Index_Kind)

| Kind | 名称 | 说明 |
|:----:|------|------|
| 1 | InFlow | 控制流输入 |
| 2 | OutFlow | 控制流输出 |
| 3 | InParam | 数据参数输入 |
| 4 | OutParam | 数据参数输出 |

compositePins 映射使用这四种 kind 在外部引脚和内部引脚之间建立连接。

---

## 5. 核心代码位置速查

| 位置 | 内容 |
|------|------|
| `src/compiler/ir_to_gia_transform/composite.ts` | 复合节点 GIA 编码主逻辑 |
| `src/compiler/ir_to_gia_transform/mappings.ts:420-427` | `SPECIAL_NODE_IDS` — 特殊 IR 节点 → GIA nodeId 映射 |
| `src/compiler/ir_to_gia_transform/mappings.ts:429-` | `SPECIAL_NODE_MAPPINGS` — IR nodeType 别名映射 |
| `src/compiler/ir_to_gia_transform/node_id.ts:373-` | `resolveNodeId()` — IR nodeType → GIA nodeId 通用逻辑 |
| `src/compiler/ir_to_gia_transform/layout.ts` | 主图布局引擎 |
| `src/runtime/core.ts:1098-1180` | `runCompositeCall()` — 复合调用运行时 |
| `src/runtime/core.ts:1539-1595` | Phase A 捕获（`isPureData`, `execNodes`, `dataNodes`） |
| `src/runtime/core.ts:1420-1500` | `removeUnusedNodesFromFlow()` — IR 优化 |
| `src/runtime/ir_builder.ts:148-195` | `buildNodesFromFlow()` — IR 节点构建 |
| `src/runtime/composite_registry.ts` | CompositeRegistry, `toCompositeDefIR()` |
| `src/runtime/IR.d.ts:233-249` | `CompositeDefIR` 类型定义 |
| `src/definitions/nodes.ts:16547` | `callComposite()` — DSL API |
| `src/definitions/nodes.ts:815-865` | `dataTypeConversion()` — 类型转换 DSL API |
| `docs/composite-ir/01-ir-types.md` | IR JSON 类型定义文档 |
| `docs/composite-ir/02-ir-examples.md` | IR JSON 完整示例 |
| `docs/gia-tools-reference.md` | 工具链索引 |

---

## 6. 分析工具链

| 工具 | 用途 | 用法 |
|------|------|------|
| `trace-exec-flow.ts` | 控制流分析 | `npx tsx ... file.gia` |
| `trace-dataflow.ts` | 数据流追溯 | `npx tsx ... file.gia <nodeIdx> <paramIdx> [--composite <name>]` |
| `ascii-layout.ts` | 布局可视化 | `npx tsx ... file.gia [--compact]` |
| `audit-layout.ts` | 布局质量检查 | `npx tsx ... file.gia` |
| `decode-gia.ts` (tools/) | GIA 二进制解码 | `npx tsx tools/decode-gia.ts file.gia` |
| `verify-composite-gia.ts` | 对比生成 vs 参考 | `npx tsx ... output.gia reference.gia` |

**核心工作流**: 先用 `trace-exec-flow` 看控制流骨架，再用 `trace-dataflow` 反向追数据源，最后用 `ascii-layout` 确认布局。

---

## 7. 已知遗留问题

| 问题 | 优先级 | 位置 | 说明 |
|------|--------|------|------|
| `LAYOUT_DATA_Y_OFFSET = -250` | P1 | `composite.ts` | 纯数据复合内部节点 Y 坐标为负。主图布局引擎（`layout.ts`）使用 `placeDetachedGrid` 保证 `maxY ≥ 300`，但复合内部用不同的布局路径。需对照参考 GIA 确认编辑器是否能消化负坐标 |
| 主图控制流三节点未平齐 | P1 | `layout.ts` | event → composite_call → printString，Y 坐标略有不齐；间距偏小 |
| 预捕获 hack | P2 | 测试脚本 | 当前用 dummy `buildServerGraphRegistriesIRDocuments` 调用触发 Phase A。应改为只跑 Phase A 的 API，或让 `.on()` handler 注册推迟到 Phase B |
| 纯数据复合的 exec 边编码 | P2 | `ir_to_gia_transform/` | `__composite_call__` type='data' 时，IR 中 `next` 边不应存在（当前由注册时序间接解决，未根治） |
| `trace-dataflow` 与 `trace-exec-flow` 的 `--json` 格式 | P3 | `tests/composite/` | 两工具输出 schema 不统一，无法管道组合 |
| handover 文档引用旧文件名 | P3 | `docs/composite-ir/handover/` | `find-event-sources-handover.md` 等引用已重命名的 `trace-exec-flow.ts` |
| 复合节点测试覆盖 | P3 | `tests/composite/` | 大多数复合定义测试只验证 IR 层，未走完整 GIA 编码 + 工具链验证 |

### r11 已修复

| 问题 | 修复位置 |
|------|----------|
| `__composite_capture__` 在 exec 复合中被映射为 Double Branch | `composite.ts`: 始终过滤 capture + remap compositePins |
| `test-two-exec.ts` 事件检测变量被覆盖、链尾终端断言错误 | `test-two-exec.ts`: 用 `nodeId===71` 检测事件，终端断言改检查 OutFlow→terminal |
| `demo_addsub2.ts` 字符串拼接 `[object Object]` | `demo_addsub2.ts`: 改为 `dataTypeConversion` |

---

## 8. 扩展指南

### 8.1 新增一个节点类型

1. 在 `src/definitions/nodes.ts` 添加 `f.xxx()` 方法（data 或 exec）
2. 如果节点类型名与 GIA 不一致，在 `mappings.ts:SPECIAL_NODE_MAPPINGS` 添加别名
3. 如果节点需要特殊类型映射，在 `node_id.ts` 添加处理逻辑
4. 考虑它是否是 data producer → 加入 `isDataProducerNode()` 或 `needsConcreteWrapping()`
5. 写测试 → IR jq 验证 → 工具链验证 → 游戏验证

### 8.2 新增一个复合节点类型

1. `g.defineComposite()` 定义接口 + `build` 回调
2. 决定是否纯数据（内部无 exec 节点 → `isPureData = true`）
3. 如果纯数据：输出值必须通过 `dataTypeConversion` 转为消费端期望的类型
4. 如果 exec：使用 `f.leaf(outflowIndex)` 标记出口
5. 验证 compositePins 映射完整（输入 fanout、输出映射）

### 8.3 三阶段管线添加新功能

每次添加新功能，问三个问题：

| 问题 | 对应层 |
|------|--------|
| 这个新概念在 IR 里长什么样？ | Stage 2 |
| 它映射到 GIA 的哪个 nodeId/pin/struct？ | Stage 3 |
| 纯数据和 exec 两种模式下行为是否一致？ | 两者 |

---

## 9. 快速启动检查清单（给新手）

```markdown
- [ ] 运行 `npm run build` — 编译成功
- [ ] 运行 `npx tsx tests/composite/simple-double.ts` — GIA 生成成功
- [ ] 运行 `npx tsx tests/composite/trace-exec-flow.ts output/simple_double.gia`
- [ ] 运行 `npx tsx tests/composite/trace-dataflow.ts output/simple_double.gia 4 0`
- [ ] 运行 `npx tsx tests/composite/ascii-layout.ts output/simple_double.gia`
- [ ] jq 核验 IR JSON 结构正确
- [ ] 复制 GIA 到游戏目录 → 编辑器打开验证
- [ ] 用 `npm test` 验证所有已有测试不破坏
```
