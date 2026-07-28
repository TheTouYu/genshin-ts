import { emitWireMessage as emit, type WireField } from '../../../src/cli/static_assembly/wire.js'
import { buildFile } from '../../../src/injector/binary.js'

const TEXT = new TextEncoder()

function msg(number: number, fields: readonly WireField[]): WireField {
  return { number, wire: 2, value: emit(fields) }
}

function text(number: number, value: string): WireField {
  return { number, wire: 2, value: TEXT.encode(value) }
}

function packed(ids: readonly number[]): Uint8Array {
  const values = ids.flatMap((id) => {
    const bytes: number[] = []
    let value = id
    while (value >= 0x80) {
      bytes.push((value & 0x7f) | 0x80)
      value = Math.floor(value / 128)
    }
    bytes.push(value)
    return bytes
  })
  return Uint8Array.from(values)
}

function vector(number: number, values: readonly number[]): WireField {
  return msg(
    number,
    values.map((value, index) => {
      const bytes = Buffer.alloc(4)
      bytes.writeFloatLE(value)
      return { number: index + 1, wire: 5, value: bytes }
    })
  )
}

function transform(ownerNumber: number, position: readonly number[]): WireField {
  return msg(ownerNumber, [
    { number: 1, wire: 0, value: 1 },
    msg(11, [vector(1, position), msg(2, []), vector(3, [1, 1, 1])])
  ])
}

function namedRecord(
  id: number,
  name: string,
  extra: readonly WireField[] = [],
  ownerNumber = 5
): Uint8Array {
  return emit([
    { number: 1, wire: 0, value: id },
    ...extra,
    msg(5, [{ number: 1, wire: 0, value: 99 }, text(11, name)]),
    transform(ownerNumber, [1, 2, 3]),
    { number: 99, wire: 0, value: 777 }
  ])
}

export const FIXTURE_IDS = {
  definition: 100,
  instance: 101,
  definitionAuxiliary: 200,
  instanceAuxiliary: 201
} as const

export function buildStaticAssemblyFixture(): Uint8Array {
  const definition = namedRecord(FIXTURE_IDS.definition, '模板', [
    { number: 2, wire: 0, value: 10009001 },
    { number: 501, wire: 2, value: packed([FIXTURE_IDS.definitionAuxiliary]) }
  ])
  const instance = namedRecord(
    FIXTURE_IDS.instance,
    '模板',
    [
      msg(2, [{ number: 1, wire: 0, value: FIXTURE_IDS.definition }]),
      { number: 501, wire: 2, value: packed([FIXTURE_IDS.instanceAuxiliary]) }
    ],
    6
  )
  const definitionAuxiliary = namedRecord(FIXTURE_IDS.definitionAuxiliary, '装饰物_1', [
    { number: 2, wire: 0, value: 10009001 },
    { number: 3, wire: 0, value: FIXTURE_IDS.definition }
  ])
  const instanceAuxiliary = namedRecord(FIXTURE_IDS.instanceAuxiliary, '装饰物_1', [
    { number: 2, wire: 0, value: 10009001 },
    { number: 3, wire: 0, value: FIXTURE_IDS.instance },
    msg(12, [{ number: 1, wire: 0, value: FIXTURE_IDS.definitionAuxiliary }])
  ])
  const registry = msg(1, [
    msg(3, [
      msg(5, [
        { number: 1, wire: 0, value: 1 },
        { number: 2, wire: 0, value: FIXTURE_IDS.definition }
      ])
    ])
  ])
  const top = emit([
    msg(4, [{ number: 1, wire: 2, value: definition }]),
    msg(6, [registry]),
    msg(8, [{ number: 1, wire: 2, value: instance }]),
    { number: 9, wire: 2, value: Uint8Array.from([8, 42]) },
    msg(27, [
      { number: 1, wire: 2, value: definitionAuxiliary },
      { number: 2, wire: 2, value: instanceAuxiliary }
    ])
  ])
  return buildFile(top, { schema: 1, headTag: 2, fileType: 3, tailTag: 4 })
}
