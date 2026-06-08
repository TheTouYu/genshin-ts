# 复合节点验证与 GIA 比对指南

## 概述

本文档指导如何对复合节点（Composite Node）的两轮提交进行回归验证，以及对生成的 GIA 文件与参考文件做结构化比对。

## 提交历史

```
9cb31c8 ─── 984fc68 ─── 0d2877f
  (baseline)  (commit 1)   (commit 2)
```

- **基线** (`9cb31c8`, release v0.1.10): 无复合节点支持
- **Commit 1** (`984fc68`, feat: add composite node support foundation): IR 类型、Registry、DSL API、供应商层、GIA accessories
- **Commit 2** (`0d2877f`, feat: implement composite node capture and call wiring): impl 节点捕获、callComposite 连线

---

## 一、Commit 1 验证方法

### 1.1 验证 defineComposite API

```bash
cd /Users/wonder/Desktop/explore/genshin-ts
npm run build

npx tsx -e "
import { defineComposite } from './dist/src/index.js'

const add = defineComposite('整数加法', {
  inputs: { a: { type: 'int' }, b: { type: 'int' } },
  outputs: { sum: { type: 'int' } },
  build: ({ a, b }, f) => {
    const sum = f.addition(a, b)
    return { sum }
  }
})

console.log('name:', add.name)
console.log('id:', add.id)
console.log('inputs:', JSON.stringify(add.definition.inputs))
console.log('outputs:', JSON.stringify(add.definition.outputs))
"
```

预期输出：`name: 整数加法`、`inputs/outputs` 与定义一致。

### 1.2 验证 CompositeDefIR 生成

```bash
npx tsx -e "
import { defineComposite } from './dist/src/index.js'

const add = defineComposite('整数加法', {
  inputs: { a: { type: 'int' }, b: { type: 'int' } },
  outputs: { sum: { type: 'int' } },
  build: ({ a, b }, f) => {
    const sum = f.addition(a, b)
    return { sum }
  }
})

const ir = add.definition.toCompositeDefIR()
console.log('type:', ir.type)
console.log('inputs:', ir.inputs.length)
console.log('outputs:', ir.outputs.length)
ir.inputs.forEach(i => console.log('  input:', i.name, i.type))
ir.outputs.forEach(o => console.log('  output:', o.name, o.type))
"
```

预期输出：`type: composite`、inputs/outputs 类型正确。

### 1.3 验证 GIA accessories 编码

```bash
npx tsx -e "
import { defineComposite } from './dist/src/index.js'
import { g, buildServerGraphRegistriesIRDocuments } from './dist/src/runtime/core.js'

defineComposite('双倍运算', {
  inputs: { val: { type: 'int' } },
  outputs: { result: { type: 'int' } },
  build: ({ val }, f) => ({ result: f.addition(val, val) })
})

g.server({ name: 'test' })
  .on('whenEntityIsCreated', () => {})

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'test' })
console.log('compositeDefs count:', docs[0]?.compositeDefs?.length)
"
```

> **注意**: Commit 1 时 implNodes 为空（捕获功能在 Commit 2 才实现）。

### 1.4 验证供应商层输出

```bash
npx tsx -e "
import { composite_pin_body, graph_affiliation_body } from './dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/gia_gen/basic.js'

const pin = composite_pin_body({
  outerPinKind: 3, outerPinIndex: 0,
  innerNodeId: 1, innerPinKind: 3, innerPinIndex: 0
})
console.log('composite_pin:', JSON.stringify(pin))

const aff = graph_affiliation_body(12345)
console.log('affiliation:', JSON.stringify(aff))
"
```

---

## 二、Commit 2 验证方法

### 2.1 验证 impl 节点捕获

```bash
npm run build

npx tsx -e "
import { defineComposite } from './dist/src/index.js'
import { compositeRegistry } from './dist/src/runtime/composite_registry.js'
import { g, buildServerGraphRegistriesIRDocuments } from './dist/src/runtime/core.js'

defineComposite('加法', {
  inputs: { a: { type: 'int' }, b: { type: 'int' } },
  outputs: { sum: { type: 'int' } },
  build: ({ a, b }, f) => ({ sum: f.addition(a, b) })
})

g.server({ name: 'test' }).on('whenEntityIsCreated', () => {})

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'test' })
const def = compositeRegistry.get('加法')
console.log('captured:', !!def?.captured)
console.log('execNodes:', def?.captured?.execNodes?.length)
console.log('dataNodes:', def?.captured?.dataNodes?.length)
def?.captured?.dataNodes?.forEach(n => console.log('  node:', n.nodeType))
"
```

预期输出：
- `captured: true`
- `dataNodes: 1` 且类型为 `addition`

### 2.2 验证 exec-only 复合

```bash
npx tsx -e "
import { defineComposite } from './dist/src/index.js'
import { g, buildServerGraphRegistriesIRDocuments } from './dist/src/runtime/core.js'

defineComposite('打印', {
  inputs: {}, outputs: {},
  build: (_, f) => { f.printString('test'); return {} }
})

g.server({ name: 'test' })
  .on('whenEntityIsCreated', (e, f) => {
    f.callComposite(compositeRegistry.get('打印'), {})
  })

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'test' })
console.log('main graph nodes:', docs[0]?.nodes?.length)
docs[0]?.nodes?.forEach(n => console.log('  node:', n.id, n.type))
"
```

预期：主图有 `eventNode` + `print_string` 两个节点。

### 2.3 验证 callComposite 注册到主图

```bash
npx tsx -e "
import { defineComposite } from './dist/src/index.js'
import { compositeRegistry } from './dist/src/runtime/composite_registry.js'
import { g, buildServerGraphRegistriesIRDocuments } from './dist/src/runtime/core.js'

defineComposite('双倍', {
  inputs: { v: { type: 'int' } },
  outputs: { r: { type: 'int' } },
  build: ({ v }, f) => ({ r: f.addition(v, v) })
})

g.server({ name: 'test' })
  .on('whenEntityIsCreated', (e, f) => {
    const r = f.callComposite(compositeRegistry.get('双倍'), { v: e.createdEntity })
    f.printString(r.r)
  })

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'test' })
console.log('nodes:', docs[0]?.nodes?.length)
docs[0]?.nodes?.forEach(n => console.log('  node:', JSON.stringify({ id: n.id, type: n.type })))
"
```

### 2.4 验证 CompositeDefIR 带 implNodes

```bash
npx tsx -e "
import { defineComposite } from './dist/src/index.js'
import { compositeRegistry } from './dist/src/runtime/composite_registry.js'
import { g, buildServerGraphRegistriesIRDocuments } from './dist/src/runtime/core.js'

defineComposite('双倍', {
  inputs: { v: { type: 'int' } },
  outputs: { r: { type: 'int' } },
  build: ({ v }, f) => ({ r: f.addition(v, v) })
})

g.server({ name: 'test' }).on('whenEntityIsCreated', () => {})

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'test' })
const def = docs[0]?.compositeDefs?.[0]
console.log('implNodes:', def?.implNodes?.length)
def?.implNodes?.forEach(n => console.log('  impl:', n.id, n.type))
"
```

预期：implNodes > 0，且包含 `addition` 节点。

---

## 三、GIA 解码比对方法

### 3.1 解码参考 GIA 文件

使用项目已有的解码工具：

```bash
REF_DIR="/Users/wonder/Desktop/explore/Beyond_Local_Export/真-测试通过"

npx tsx -e "
import { decode_gia_file } from './dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'

const root = decode_gia_file('${REF_DIR}/ts_整数加法_test.gia')
const g = root.graph
console.log('name:', g.name)
console.log('which:', g.which)
console.log('compositeDef:', !!g.compositeDef)

if (g.compositeDef) {
  const def = g.compositeDef.inner.def
  console.log('inputs:', def.inputs.length)
  def.inputs?.forEach(i => console.log('  input:', i.name, 'type1:', i.type?.type1))
  console.log('outputs:', def.outputs.length)
  def.outputs?.forEach(o => console.log('  output:', o.name, 'type1:', o.type?.type1))
}
"
```

### 3.2 生成自己的 GIA 并比对

```bash
cat << 'SCRIPT' > /tmp/test_composite_to_gia.ts
import { defineComposite } from 'genshin-ts'
import { g, buildServerGraphRegistriesIRDocuments } from 'genshin-ts/runtime/core'
import { decode_gia_file, encode_gia_file } from 'genshin-ts/thirdparty/.../protobuf/decode'
import { irToGia } from 'genshin-ts/compiler/ir_to_gia_transform'
import { IrToGiaOptions } from 'genshin-ts/compiler/ir_to_gia_transform'

// 1. 定义 + 使用复合节点
defineComposite('整数加法', {
  inputs: { a: { type: 'int' }, b: { type: 'int' } },
  outputs: { sum: { type: 'int' } },
  build: ({ a, b }, f) => ({ sum: f.addition(a, b) })
})

g.server({ name: 'test' })
  .on('whenEntityIsCreated', (e, f) => {
    f.callComposite(registry.get('整数加法'), { a: e.createdEntity, b: e.createdEntity })
  })

// 2. 生成 IR
const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'test' })

// 3. 转为 GIA
for (const doc of docs) {
  const bytes = irToGia(doc, {
    graphId: doc.graph?.id ?? 1073741825,
    name: doc.graph?.name ?? 'test',
    protoPath: 'path/to/gia.proto'
  })
  // 写出到文件
  writeFileSync('/tmp/output.gia', Buffer.from(bytes))
}

// 4. 解码并输出摘要
const out = decode_gia_file('/tmp/output.gia')
console.log('Generated GIA graph:', out.graph.name)
console.log('accessories:', out.accessories?.length)
SCRIPT
echo "See above for the pattern; fill in paths and run."
```

### 3.3 结构化比对参考文件

得到两份 JSON（参考 vs 生成）后，对比要点：

```
CompositeDef 对比字段:
├── name              (必须一致)
├── id.genericId.id   (不必一致，GIA 编译时分配)
├── id.concreteId.id  (不必一致)
├── id.graphId.id     (必须指向正确的 impl 图)
├── type.kind         (必须为 1000)
├── inputs[]          (数量/名称/typeClass/type1/type2 必须一致)
├── outputs[]         (数量/名称/typeClass/type1/type2 必须一致)
├── inflows[]         (执行流入口)
└── outflows[]        (执行流出口)

Accessories[0] NodeGraph (impl 图) 对比:
├── nodes[]           (节点数量和类型)
├── compositePins[]   (内外引脚映射)
└── affiliations[]    (复合引用关系)
```

### 3.4 自动化比对脚本

将以下脚本保存为 `scripts/verify-composite-gia.ts` 并运行：

```typescript
// scripts/verify-composite-gia.ts
// 用法: npx tsx scripts/verify-composite-gia.ts <参考.gia> <生成.gia>

import { readFileSync } from 'fs'
import { decode_gia_file } from '../src/thirdparty/.../protobuf/decode.js'

const refPath = process.argv[2]
const genPath = process.argv[3]

if (!refPath || !genPath) {
  console.error('用法: npx tsx scripts/verify-composite-gia.ts <参考.gia> <生成.gia>')
  process.exit(1)
}

const ref = decode_gia_file(refPath)
const gen = decode_gia_file(genPath)

let passed = 0
let failed = 0

function check(label: string, refVal: unknown, genVal: unknown) {
  const rf = JSON.stringify(refVal)
  const gf = JSON.stringify(genVal)
  if (rf === gf) {
    console.log(`  ✅ ${label}`)
    passed++
  } else {
    console.log(`  ❌ ${label}`)
    console.log(`    参考: ${rf}`)
    console.log(`    生成: ${gf}`)
    failed++
  }
}

// 对比 CompositeDef
const refDef = ref.graph.compositeDef?.inner.def
const genDef = gen.graph.compositeDef?.inner.def

if (!refDef && !genDef) {
  console.log('两个文件都不是 CompositeDef')
  process.exit(0)
}

console.log('\n=== CompositeDef 基本信息 ===')
check('type.kind', refDef.type?.kind, genDef.type?.kind)
check('name', refDef.name, genDef.name)
check('inputs 数量', refDef.inputs?.length, genDef.inputs?.length)
check('outputs 数量', refDef.outputs?.length, genDef.outputs?.length)
check('inflows 数量', refDef.inflows?.length, genDef.inflows?.length)
check('outflows 数量', refDef.outflows?.length, genDef.outflows?.length)

console.log('\n=== CompositeDef inputs ===')
for (let i = 0; i < Math.max(refDef.inputs?.length ?? 0, genDef.inputs?.length ?? 0); i++) {
  const r = refDef.inputs?.[i]
  const g = genDef.inputs?.[i]
  if (!r || !g) {
    console.log(`  ❌ input[${i}] 不存在于 ${!r ? '参考' : '生成'} 文件`)
    failed++
    continue
  }
  check(`input[${i}].name`, r.name, g.name)
  check(`input[${i}].type.class`, r.type?.class, g.type?.class)
  check(`input[${i}].type.type1`, r.type?.type1, g.type?.type1)
}

console.log('\n=== CompositeDef outputs ===')
for (let i = 0; i < Math.max(refDef.outputs?.length ?? 0, genDef.outputs?.length ?? 0); i++) {
  const r = refDef.outputs?.[i]
  const g = genDef.outputs?.[i]
  if (!r || !g) {
    console.log(`  ❌ output[${i}] 不存在于 ${!r ? '参考' : '生成'} 文件`)
    failed++
    continue
  }
  check(`output[${i}].name`, r.name, g.name)
  check(`output[${i}].type.class`, r.type?.class, g.type?.class)
  check(`output[${i}].type.type1`, r.type?.type1, g.type?.type1)
}

console.log('\n=== Accessories ===')
check('accessories 数量', ref.accessories?.length, gen.accessories?.length)

console.log(`\n✅ 通过: ${passed}, ❌ 失败: ${failed}`)
if (failed > 0) process.exit(1)
```

### 3.5 使用参考测试文件进行回归验证

```bash
REF="/Users/wonder/Desktop/explore/Beyond_Local_Export/真-测试通过"

# 对每个简单复合节点解码并提取接口签名
for f in "$REF"/ts_整数加法_test.gia "$REF"/ts_整数减法_test.gia \
         "$REF"/ts_整数乘法_test.gia "$REF"/ts_整数除法_test.gia \
         "$REF"/ts_g_define_双倍运算.gia "$REF"/ts_g_define_浮点四则运算.gia; do
  echo "=== $(basename $f) ==="
  npx tsx -e "
    import { decode_gia_file } from './dist/src/thirdparty/.../protobuf/decode.js'
    const root = decode_gia_file('$f')
    const def = root.graph.compositeDef?.inner.def
    if (def) {
      console.log('name:', def.name)
      console.log('inputs:', def.inputs?.map(i => i.name + ':' + i.type?.type1))
      console.log('outputs:', def.outputs?.map(o => o.name + ':' + o.type?.type1))
      console.log('accessories:', root.accessories?.length)
    } else {
      console.log('not a CompositeDef')
    }
  "
done
```

---

## 四、IR 级别对比（替代方案）

在 IR JSON 阶段（阶段②输出）做 diff，避免了 GIA 格式的序列化差异：

```bash
# 启用 IR JSON 输出
export GSTS_EMIT_IR_JSON=1

# 生成 IR JSON 并保存
npx tsx -e "
import { defineComposite } from './dist/src/index.js'
import { g, buildServerGraphRegistriesIRDocuments } from './dist/src/runtime/core.js'
import { writeFileSync } from 'fs'

defineComposite('加法', {
  inputs: { a: { type: 'int' }, b: { type: 'int' } },
  outputs: { sum: { type: 'int' } },
  build: ({ a, b }, f) => ({ sum: f.addition(a, b) })
})

g.server({ name: 'test' }).on('whenEntityIsCreated', () => {})

const docs = buildServerGraphRegistriesIRDocuments({ defaultName: 'test' })
writeFileSync('/tmp/test-ir.json', JSON.stringify(docs, null, 2))
console.log('IR JSON written to /tmp/test-ir.json')
"

# 查看 compositeDefs
python3 -c "
import json
with open('/tmp/test-ir.json') as f:
  docs = json.load(f)
for doc in docs:
  defs = doc.get('compositeDefs', [])
  for d in defs:
    print(f\"Composite: {d['name']}\")
    print(f\"  inputs: {len(d['inputs'])}\")
    print(f\"  outputs: {len(d['outputs'])}\")
    print(f\"  implNodes: {len(d.get('implNodes', []))}\")
    for n in d.get('implNodes', []):
      print(f\"    {n['type']}\")
"
```

---

## 五、回归测试流程

每次修改代码后：

```bash
# 1. 编译
npm run build

# 2. 运行基础测试
npm run quicktest

# 3. 验证复合节点定义/调用（使用上面的测试脚本）
# 3a. Commit 1 验证
npx tsx -e "import { defineComposite } from './dist/src/index.js'; /* ... */"

# 3b. Commit 2 验证
npx tsx -e "import { defineComposite } from './dist/src/index.js'; import { compositeRegistry } from './dist/src/runtime/composite_registry.js'; /* ... */"

# 4. GIA 解码对比
npx tsx scripts/verify-composite-gia.ts \
  /path/to/reference.gia \
  /path/to/generated.gia
```
