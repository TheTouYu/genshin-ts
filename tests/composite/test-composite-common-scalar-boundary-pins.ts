// @ts-nocheck
/**
 * Composite-only regression for common scalar operators.
 *
 * The main graph only calls these composites to force capture/IR materialization;
 * assertions deliberately inspect CompositeDef impl graphs and never root ordinary nodes.
 */
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'

import { decode_gia_file } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
import { irToGia } from '../../dist/src/compiler/ir_to_gia_transform/index.js'
import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { bool, float, int } from '../../dist/src/runtime/value.js'

const PROTO_PATH = new URL(
  '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname
const OUT_PATH = 'tests/composite/output/复合节点-常见标量边界物理参数.gia'
const GAME_OUT_PATH = 'Beyond_Local_Export/复合节点-常见标量边界物理参数-修复候选.gia'

type Case = {
  label: string
  inputType: 'int' | 'float' | 'bool'
  outputType: 'int' | 'float' | 'bool'
  args: (values: any) => any[]
  call: (f: any, values: any) => any
}

const scalarCases: Case[] = [
  {
    label: '绝对值-int',
    inputType: 'int',
    outputType: 'int',
    args: ({ a }: any) => [a],
    call: (f, { a }) => f.absoluteValueOperation(a)
  },
  {
    label: '绝对值-float',
    inputType: 'float',
    outputType: 'float',
    args: ({ a }: any) => [a],
    call: (f, { a }) => f.absoluteValueOperation(a)
  },
  {
    label: '取符号-int',
    inputType: 'int',
    outputType: 'int',
    args: ({ a }: any) => [a],
    call: (f, { a }) => f.signOperation(a)
  },
  {
    label: '取符号-float',
    inputType: 'float',
    outputType: 'float',
    args: ({ a }: any) => [a],
    call: (f, { a }) => f.signOperation(a)
  },
  {
    label: '幂运算-int',
    inputType: 'int',
    outputType: 'int',
    args: ({ a, b }: any) => [a, b],
    call: (f, { a, b }) => f.exponentiation(a, b)
  },
  {
    label: '幂运算-float',
    inputType: 'float',
    outputType: 'float',
    args: ({ a, b }: any) => [a, b],
    call: (f, { a, b }) => f.exponentiation(a, b)
  },
  {
    label: '范围限制-int',
    inputType: 'int',
    outputType: 'int',
    args: ({ a, b, c }: any) => [a, b, c],
    call: (f, { a, b, c }) => f.rangeLimitingOperation(a, b, c)
  },
  {
    label: '范围限制-float',
    inputType: 'float',
    outputType: 'float',
    args: ({ a, b, c }: any) => [a, b, c],
    call: (f, { a, b, c }) => f.rangeLimitingOperation(a, b, c)
  },
  {
    label: '取较大值-int',
    inputType: 'int',
    outputType: 'int',
    args: ({ a, b }: any) => [a, b],
    call: (f, { a, b }) => f.takeLargerValue(a, b)
  },
  {
    label: '取较大值-float',
    inputType: 'float',
    outputType: 'float',
    args: ({ a, b }: any) => [a, b],
    call: (f, { a, b }) => f.takeLargerValue(a, b)
  },
  {
    label: '取较小值-int',
    inputType: 'int',
    outputType: 'int',
    args: ({ a, b }: any) => [a, b],
    call: (f, { a, b }) => f.takeSmallerValue(a, b)
  },
  {
    label: '取较小值-float',
    inputType: 'float',
    outputType: 'float',
    args: ({ a, b }: any) => [a, b],
    call: (f, { a, b }) => f.takeSmallerValue(a, b)
  },
  {
    label: '模运算-int',
    inputType: 'int',
    outputType: 'int',
    args: ({ a, b }: any) => [a, b],
    call: (f, { a, b }) => f.moduloOperation(a, b)
  },
  {
    label: '逻辑与-bool',
    inputType: 'bool',
    outputType: 'bool',
    args: ({ a, b }: any) => [a, b],
    call: (f, { a, b }) => f.logicalAndOperation(a, b)
  },
  {
    label: '逻辑或-bool',
    inputType: 'bool',
    outputType: 'bool',
    args: ({ a, b }: any) => [a, b],
    call: (f, { a, b }) => f.logicalOrOperation(a, b)
  },
  {
    label: '逻辑异或-bool',
    inputType: 'bool',
    outputType: 'bool',
    args: ({ a, b }: any) => [a, b],
    call: (f, { a, b }) => f.logicalXorOperation(a, b)
  }
]

const literalFor = (type: Case['inputType'], index: number) => {
  if (type === 'int') return new int(index)
  if (type === 'float') return new float(index + 0.5)
  return new bool(index % 2 === 0)
}

const handles = scalarCases.map((testCase) =>
  g.defineComposite(`常见标量边界-${testCase.label}`, {
    inputs: {
      a: { type: testCase.inputType },
      b: { type: testCase.inputType },
      c: { type: testCase.inputType }
    },
    outputs: { result: { type: testCase.outputType } },
    build({ a, b, c }, f) {
      return { result: testCase.call(f, { a, b, c }) }
    }
  })
)

g.server({ name: '复合节点-常见标量边界物理参数', id: 1073742020 }).on(
  'whenEntityIsCreated',
  (_event, f) => {
    handles.forEach((handle, index) => {
      const testCase = scalarCases[index]
      const values = {
        a: literalFor(testCase.inputType, 3),
        b: literalFor(testCase.inputType, 5),
        c: literalFor(testCase.inputType, 7)
      }
      f.callComposite(handle, Object.fromEntries(testCase.args(values).map((value, argIndex) => [
        ['a', 'b', 'c'][argIndex], value
      ])))
    })
  }
)

const doc = buildServerGraphRegistriesIRDocuments({
  defaultName: '复合节点-常见标量边界物理参数'
}).at(-1)
assert.ok(doc)
mkdirSync('tests/composite/output', { recursive: true })
const bytes = irToGia(doc, {
  graphId: 1073742020,
  name: '复合节点-常见标量边界物理参数',
  protoPath: PROTO_PATH
})
writeFileSync(OUT_PATH, Buffer.from(bytes))
mkdirSync('Beyond_Local_Export', { recursive: true })
writeFileSync(GAME_OUT_PATH, Buffer.from(bytes))

const decoded = decode_gia_file(OUT_PATH, PROTO_PATH)
const report = handles.map((handle, index) => {
  const testCase = scalarCases[index]
  const def = decoded.accessories?.find(
    (item: any) => item.which === 12 && item.name === handle.name
  )?.compositeDef?.inner?.def
  const impl = decoded.accessories?.find(
    (item: any) => item.which === 9 && item.id?.id === handle.id + 10000
  )?.graph?.inner?.graph
  assert.ok(def, `${testCase.label}: CompositeDef missing`)
  assert.ok(impl, `${testCase.label}: impl graph missing`)

  const node = (impl.nodes ?? []).find((candidate: any) => candidate.genericId?.kind === 22000)
  assert.ok(node, `${testCase.label}: ordinary impl node missing`)
  const physicalInputs = (node.pins ?? [])
    .filter((pin: any) => pin.i1?.kind === 3)
    .sort((a: any, b: any) => a.i1.index - b.i1.index)
  const physicalOutputs = (node.pins ?? [])
    .filter((pin: any) => pin.i1?.kind === 4)
    .sort((a: any, b: any) => a.i1.index - b.i1.index)
  const boundaryInputs = (impl.compositePins ?? []).filter(
    (pin: any) => pin.outerPin?.kind === 3 && pin.innerNodeId === node.nodeIndex
  )

  assert.equal(def.inputs?.[0]?.type?.type1, testCase.inputType === 'int' ? 3 : testCase.inputType === 'float' ? 5 : 4)
  assert.equal(boundaryInputs.length, testCase.args({ a: 0, b: 0, c: 0 }).length)
  const expectedInputType = testCase.inputType === 'int' ? 3 : testCase.inputType === 'float' ? 5 : 4
  for (const boundary of boundaryInputs) {
    const physical = physicalInputs.find((pin: any) => pin.i1.index === boundary.innerPin?.index)
    assert.ok(physical, `${testCase.label}: missing physical boundary InParam[${boundary.innerPin?.index}]`)
    assert.equal(
      physical.type,
      expectedInputType,
      `${testCase.label}: physical InParam[${boundary.innerPin?.index}] type=${physical.type}`
    )
  }
  assert.equal(physicalOutputs.length, 1)
  assert.equal(physicalOutputs[0].type, testCase.outputType === 'int' ? 3 : testCase.outputType === 'float' ? 5 : 4)

  for (const boundary of boundaryInputs) {
    assert.ok(
      node.pins?.some(
        (pin: any) => pin.i1?.kind === 3 && pin.i1.index === boundary.innerPin?.index
      ),
      `${testCase.label}: compositePin points to missing physical pin`
    )
  }

  return {
    label: testCase.label,
    genericId: node.genericId?.nodeId,
    concreteId: node.concreteId?.nodeId,
    inputTypes: physicalInputs.map((pin: any) => pin.type),
    outputType: physicalOutputs[0].type,
    boundaryPins: boundaryInputs.length
  }
})

console.log(`输出: ${OUT_PATH}`)
console.log(`游戏测试候选: ${GAME_OUT_PATH}`)
console.log(`大小: ${bytes.length} 字节`)
console.log(JSON.stringify(report, null, 2))
console.log('PASS: Composite 常见标量节点边界物理参数完整')
