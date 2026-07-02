# GIA 原始数据探查 — 交接提示词

> 目的：使用**底层脚本组合**（非 trace-dataflow.ts 工具）对 GIA 文件做原始数据探查，
> 以此理解数据格式、发现模式、并从底层视角评价 trace-dataflow.ts 工具的不足与上限。

---

## 一、环境与入口

```sh
工作目录: /home/h/genshin-ts
运行器: npx tsx（TypeScript 直接执行）
```

### protobuf 解码器

```
dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js
```

导出函数：`decode_gia_file(filePath: string)` → 返回解码后的 JSON 对象

用法（独立脚本）：
```ts
import { decode_gia_file } from './dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import * as fs from 'fs'

const buf = fs.readFileSync('<文件路径>')
const data = decode_gia_file(buf)  // 传 Buffer 或 filePath 字符串均可
console.log(JSON.stringify(data, null, 2))
// 或只查看关键字段的结构
console.log(Object.keys(data))
```

### 节点名称数据库

```
dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.js
```

导出：`NODE_PIN_RECORDS` — 数组，每项 `{ id: number, name: string, inputs: string[], outputs: string[] }`

### 节点 ID 映射

```
dist/src/compiler/gia_vendor.js
```

导出：`NODE_ID` — 对象，键为字符串名如 `"Get_Self_Entity__Generic"`，值为数字 ID

---

## 二、GIA 原始数据结构（以 物理运动.gia 为例）

解码顶层结构：
```json
{
  "graph": { ... },          // 主图
  "accessories": [ ... ],    // 附属项（复合定义、编译体等）
  "graphValues": [ ... ],    // 图变量定义
  "signals": [ ... ]         // 信号定义
}
```

### 2.1 主图 (data.graph.graph.inner.graph)

```json
{
  "nodes": [
    { "nodeIndex": 0, "genericId": { "kind": 22000, "nodeId": 73 }, "pins": [...] },
    { "nodeIndex": 1, "genericId": { "kind": 22001, "nodeId": 1610612902 }, "pins": [...] },
  ],
  "connections": [   // 仅 IR 编译格式有；原生格式用 node.pins[].connects[]
    { "id": 0, "from": { "id": 7, "index": 0 }, "to": { "id": 9, "index": 0 } }
  ]
}
```

### 2.2 节点 (node)

```json
{
  "nodeIndex": 7,
  "genericId": { "kind": 22000, "nodeId": 3 },
  "pins": [
    { "i1": { "kind": 1, "index": 0 }, "connects": [{ "id": 2, "kind": 3, "connect2": { "index": 6 } }] },
    { "i1": { "kind": 3, "index": 0 }, "connects": [{ "id": 2, "kind": 22001, "connect2": { "index": 6 } }] },
    { "i1": { "kind": 3, "index": 1 }, "value": { "bConcreteValue": { "value": { "bArray": { "entries": [...] } } } } },
  ]
}
```

Pin 类型（`i1.kind`）：
- `1` = 执行流输入（OutFlow）
- `2` = 执行流输出（Branch）
- `3` = 数据输入（InParam）
- `4` = 数据输出（返回值/OutParam）

Pin 连接（`pin.connects[]`）：
- `connects[i].id` = 源节点索引
- `connects[i].connect?.index` 或 `connects[i].connect2?.index` = 源节点的 OutParam index

### 2.3 Accessories（复合定义与编译体）

Accessories 有两类：

**定义体 (which=8)**：
```json
{
  "which": 8,
  "id": { "id": 1610612905 },
  "compositeDef": {
    "inner": {
      "def": {
        "name": "获取三实体",
        "inputs": [{ "name": "a", "pinIndex": 0, "type": "float" }],
        "outputs": [{ "name": "结果", "pinIndex": 0, "type": "float" }]
      }
    }
  },
  "relatedIds": [{ "id": 1610612872 }]  // 关联的编译体 id
}
```

**编译体 (which=9)**：
```json
{
  "which": 9,
  "id": { "id": 1610612872 },
  "graph": {
    "inner": {
      "graph": {
        "nodes": [ /* impl 图节点 */ ],
        "compositePins": [
          { "innerNodeId": 10, "innerPin": { "kind": 4, "index": 0 }, "outerPin": { "kind": 4, "index": 0 } }
        ]
      }
    }
  }
}
```

`compositePins` 映射内节点 pin 到外部接口。`innerPin = {kind, index}` → `outerPin = {kind, index}`，其中 `kind=3` 是输入参数、`kind=4` 是返回值。

### 2.4 图变量 (data.graphValues)

```json
[
  { "id": "...","name": "运动实体","type": 1 },
  { "id": "...","name": "基础传球速度","type": 5 }
]
```

---

## 三、底层脚本探查方法

### 方法 A：写独立 .ts 脚本

创建 `/home/h/genshin-ts/_explore.ts`：

```ts
import { decode_gia_file } from './dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import * as fs from 'fs'

const buf = fs.readFileSync(process.argv[2])
const data = decode_gia_file(buf)

// === 探查主图节点 ===
const mainGraph = data.graph?.graph?.inner?.graph
if (mainGraph) {
  console.log('=== 主图节点 ===')
  for (const n of mainGraph.nodes) {
    const inp = (n.pins ?? []).filter((p: any) => p.i1?.kind === 3)
    const out = (n.pins ?? []).filter((p: any) => p.i1?.kind === 4)
    const flow = (n.pins ?? []).filter((p: any) => p.i1?.kind === 2)
    console.log(`n=${n.nodeIndex}  kind=${n.genericId?.kind}  nid=${n.genericId?.nodeId}  in=${inp.length}  out=${out.length}  flow=${flow.length}`)
  }
}

// === 追踪一个输入的数据源 ===
function traceInput(node: any, inIdx: number, nodes: Map<number,any>, depth = 0): string {
  const pin = (node.pins ?? []).find((p: any) => p.i1?.kind === 3 && p.i1?.index === inIdx)
  if (!pin) return `${'  '.repeat(depth)}InParam[${inIdx}]: 无 pin`
  if (!pin.connects?.length) {
    const lit = pin.value ? JSON.stringify(pin.value).slice(0, 80) : '(未连接)'
    return `${'  '.repeat(depth)}InParam[${inIdx}]: ${lit}`
  }
  const conn = pin.connects[0]
  const src = nodes.get(conn.id)
  if (!src) return `${'  '.repeat(depth)}InParam[${inIdx}]: → n=${conn.id} (未找到)`
  const outIdx = conn.connect2?.index ?? conn.connect?.index ?? 0
  let result = `${'  '.repeat(depth)}InParam[${inIdx}]: ← n=${conn.id} OutParam[${outIdx}]`
  // 递归追踪源节点的输入
  for (const sp of (src.pins ?? []).filter((p: any) => p.i1?.kind === 3)) {
    if ((sp.connects?.length ?? 0) > 0 || sp.value) {
      result += '\n' + traceInput(src, sp.i1.index, nodes, depth + 1)
    }
  }
  return result
}

const nodeMap = new Map(mainGraph.nodes.map((n: any) => [n.nodeIndex, n]))
const target = nodeMap.get(parseInt(process.argv[3]))
if (target) {
  console.log(`\n=== 追溯 n=${process.argv[3]} 的输入 ===`)
  for (const p of (target.pins ?? []).filter((p: any) => p.i1?.kind === 3)) {
    console.log(traceInput(target, p.i1.index, nodeMap))
    console.log('---')
  }
}
```

运行：`npx tsx _explore.ts <文件路径> <节点索引>`

### 方法 B：jq 批量查询

先导出 JSON：
```sh
npx tsx -e "
import { decode_gia_file } from '...decode.js';
import * as fs from 'fs';
const d = decode_gia_file(fs.readFileSync(process.argv[1]));
console.log(JSON.stringify(d, null, 2));
" <文件路径> 2>/dev/null > /tmp/gia.json
```

然后 jq 查询：

```sh
# 主图节点列表
jq '.graph.graph.inner.graph.nodes[] | {idx: .nodeIndex, kind: .genericId.kind, nid: .genericId.nodeId, pins: (.pins | length)}' /tmp/gia.json

# 所有复合定义名称
jq '.accessories[] | select(.which == 8) | .compositeDef.inner.def.name' /tmp/gia.json

# 所有编译体及 impl 节点数
jq '.accessories[] | select(.which == 9) | {id: .id.id, nodes: (.graph.inner.graph.nodes | length)}' /tmp/gia.json

# 图变量列表
jq '.graphValues[] | {name, type}' /tmp/gia.json

# 查找某个节点的所有连接
jq '.graph.graph.inner.graph.nodes[] | select(.nodeIndex == 7) | .pins[] | select(.connects) | {kind: .i1.kind, idx: .i1.index, connects: [.connects[] | {to: .id, outIdx: .connect2.index}]}' /tmp/gia.json

# 统计各 kind 节点数量
jq '[.graph.graph.inner.graph.nodes[] | .genericId.kind] | group_by(.) | map({kind: .[0], count: length})' /tmp/gia.json

# 找出所有复合的调用点
jq '[.accessories[] | select(.which == 9) | {id: .id.id, graphName: (input_filename)}] as $comps | .graph.graph.inner.graph.nodes[] | select(.genericId.kind == 22001) | {idx: .nodeIndex, id: .genericId.nodeId}' /tmp/gia.json
```

### 方法 C：jq 深度链追溯

对于树格式的 JSON 导出，可用 jq 递归探测。比如 IR 格式有 `connections` 数组，用 jq 做链追溯：

```sh
# 找出最终流向 n=9 InParam[0] 的源（连接跟踪）
jq '[.graph.graph.inner.graph.connections[] | select(.to.id == 9 and .to.index == 0)]' /tmp/gia.json

# 递归找上游（需要多次 jq，因为 jq 不支持递归搜索 connections 图）
```

### 方法 D：遍历所有复合 impl 图

```ts
for (const acc of data.accessories ?? []) {
  if (acc.which !== 9) continue
  const g = acc.graph?.inner?.graph
  if (!g) continue
  // 找这个编译体对应的定义体名称
  const defAcc = data.accessories.find((a: any) =>
    a.compositeDef?.inner?.def && a.relatedIds?.[0]?.id === acc.id?.id
  )
  const name = defAcc?.compositeDef?.inner?.def?.name ?? `id=${acc.id.id}`
  console.log(`\n=== 复合:${name} (${g.nodes.length} 节点) ===`)
  for (const n of g.nodes) {
    console.log(`  n=${n.nodeIndex}  kind=${n.genericId?.kind}  nid=${n.genericId?.nodeId}  pins=${(n.pins ?? []).length}`)
  }
}
```

---

## 四、GIA 文件资源

所有文件均在 `/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/` 下。

### 推荐首选（最复杂，适合充分测试工具上限）

```
复杂gia/物理运动.gia   — 117KB，~68 节点，50+ 复合定义。含深层数据链（depth ≥ 8）
复杂gia/弹球.gia        — 55KB，中等复杂度，信号驱动架构
复杂gia/传球.gia        — 21KB，24 节点，15 复合，有 R6 报告可对比
```

### 中等复杂度（user_edit/）

各种控制流模式：各种flow.gia、嵌套.gia、顺序执行*.gia、分支*.gia、数据流输入参数合并比对.gia

### 小文件（tests/composite/output/）

用于验证基础假设：basic_call.gia、two_exec.gia、两个复合节点.gia 等

### 其他目录

```
实用/   — 72 个文件，功能测试集
真-测试通过/ — 43 个文件，通过验证集
composite/ — 10+ 文件，demo_A/B/C 系列（基本→执行→嵌套调用）
```

---

## 五、可参照的 handover 文档

这些文档记录了之前同类型工作的结果和发现：

| 文档 | 内容 |
|------|------|
| `docs/composite-ir/handover/r5-json-vs-tree-eval.md` | JSON vs 树格式双 Agent 对比实验（发现问题清单） |
| `docs/composite-ir/handover/r6-report-agent-a-json.md` | Agent A 用自定义脚本+JSON 完整分析传球.gia |
| `docs/composite-ir/handover/r6-report-agent-b-tree.md` | Agent B 用 trace-dataflow.ts 树格式分析传球.gia |
| `docs/composite-ir/handover/r4-passball-impl.md` | 传球.gia 的复合展开手动记录 |
| `docs/composite-ir/handover/r7-trace-dataflow-tool-improvements.md` | trace-dataflow.ts 工具的改进记录（R6 反馈驱动） |

---

## 六、你的任务

用以上底层方法（脚本组合 + jq + 自定义解码分析）**完整地、彻底地**探查 1-2 个 GIA 文件（建议从 物理运动.gia 或 弹球.gia 开始），然后：

1. **用底层方法完成一套完整的数据流映射**（节点列表、数据链追踪、复合展开、架构总结）
2. **评价 trace-dataflow.ts 工具的不足与上限**：
   - 工具的自动化帮了你什么？如果只用脚本/jq，哪些事很难做？
   - 工具的限制在哪里？哪些数据或关系是工具无法揭示但脚本可以做到的？
   - 工具的输出格式（树/JSON）是否完整覆盖了底层数据的所有信息？
   - 如果有 `--list-nodes`、`--max-depth 0`、`--all-params`、`-c <复合名>` 这些功能，底层方法是否还有存在的必要？还是相反——工具只是"浅层封装"，深度分析永远需要底层脚本？
3. **给出工具改进的具体建议**
