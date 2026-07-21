import fs from 'node:fs'

import {
  client_literal_value,
  client_value_base
} from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/gia_gen/client_basic.js'
import { loadGiaProto } from '../../src/injector/proto.js'

const PROTO_PATH =
  'src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto'

type ShapeEntry = {
  clientVarType: number
  typeName: string
  shape: any
  count: number
}

type ShapesFile = { shapes: ShapeEntry[] }

const SUPPORTED_LITERALS: Array<{ clientVarType: number; typeName: string; literal: unknown }> = [
  { clientVarType: 3, typeName: 'int', literal: 42 },
  { clientVarType: 5, typeName: 'bool', literal: true },
  { clientVarType: 7, typeName: 'float', literal: 1.5 },
  { clientVarType: 9, typeName: 'str', literal: 'gsts' },
  { clientVarType: 11, typeName: 'vec3', literal: [1, 2, 3] },
  { clientVarType: 13, typeName: 'enum', literal: 201 },
  { clientVarType: 14, typeName: 'guid', literal: 123 },
  { clientVarType: 16, typeName: 'faction', literal: 7 }
]

const VALUE_FIELDS = [
  'bId',
  'bInt',
  'bFloat',
  'bString',
  'bEnum',
  'bVector',
  'bArray',
  'bStruct',
  'bMap',
  'bMapPair'
] as const

function literalShapeOf(value: any): unknown {
  const shape: Record<string, unknown> = {
    class: Number(value.class ?? 0),
    alreadySetVal: Boolean(value.alreadySetVal)
  }
  if (value.itemType) {
    shape.itemType = {
      classBase: Number(value.itemType.classBase ?? 0),
      type_client: value.itemType.type_client
        ? { type: Number(value.itemType.type_client.type ?? 0) }
        : undefined
    }
  }
  const setFields = VALUE_FIELDS.filter((f) => value[f] !== undefined)
  shape.valueFields = setFields
  return shape
}

/**
 * Canonical observed literal shape per clientVarType from the extractor census:
 * prefer the direct (non-ConcreteBase) alreadySetVal=true shape; fall back to
 * the inner value of a ConcreteBase wrapper whose inner alreadySetVal=true.
 */
function observedLiteralShape(shapes: ShapeEntry[], clientVarType: number): unknown | undefined {
  const candidates = shapes.filter((s) => s.clientVarType === clientVarType)
  for (const c of candidates.sort((a, b) => b.count - a.count)) {
    if (Number(c.shape.class) !== 10000 && c.shape.alreadySetVal === true) {
      return normalizeObservedShape(c.shape)
    }
  }
  for (const c of candidates.sort((a, b) => b.count - a.count)) {
    const inner = c.shape.bConcreteValue?.value
    if (inner && inner.alreadySetVal === true) {
      return normalizeObservedShape(inner)
    }
  }
  return undefined
}

function normalizeObservedShape(shape: any): unknown {
  return {
    class: Number(shape.class ?? 0),
    alreadySetVal: Boolean(shape.alreadySetVal),
    itemType: shape.itemType
      ? {
          classBase: Number(shape.itemType.classBase ?? 0),
          type_client: shape.itemType.type_client
            ? { type: Number(shape.itemType.type_client.type ?? 0) }
            : undefined
        }
      : undefined,
    valueFields: VALUE_FIELDS.filter((f) => shape[f] !== undefined)
  }
}

function main() {
  const shapesFile = JSON.parse(
    fs.readFileSync('tests/client_generated/_value_shapes.json', 'utf8')
  ) as ShapesFile
  const { root } = loadGiaProto(PROTO_PATH)
  const varBaseType = root.lookupType('VarBase')

  const results: Array<Record<string, unknown>> = []
  const failures: string[] = []

  for (const { clientVarType, typeName, literal } of SUPPORTED_LITERALS) {
    const observed = observedLiteralShape(shapesFile.shapes, clientVarType)
    if (!observed) {
      failures.push(`${typeName}(${clientVarType}): no observed literal shape in census`)
      continue
    }

    const built = client_literal_value(clientVarType, literal)
    const encoded = varBaseType.encode(varBaseType.fromObject(built)).finish()
    const decoded = varBaseType.toObject(varBaseType.decode(encoded), { longs: Number })
    const decodedShape = literalShapeOf(decoded)

    const match = JSON.stringify(decodedShape) === JSON.stringify(observed)
    results.push({
      clientVarType,
      typeName,
      literal,
      observedShape: observed,
      decodedShape,
      match
    })
    if (!match) {
      failures.push(
        `${typeName}(${clientVarType}): decoded shape ${JSON.stringify(decodedShape)} != observed ${JSON.stringify(observed)}`
      )
    } else {
      console.log(`[ok] ${typeName}(${clientVarType}): literal round-trip matches sample shape`)
    }
  }

  // typed-but-unset base values must also round-trip against alreadySetVal=false shapes
  const unsetChecks: Array<Record<string, unknown>> = []
  for (const { clientVarType, typeName } of SUPPORTED_LITERALS) {
    const built = client_value_base(clientVarType)
    const encoded = varBaseType.encode(varBaseType.fromObject(built)).finish()
    const decoded = varBaseType.toObject(varBaseType.decode(encoded), { longs: Number })
    const decodedShape = literalShapeOf(decoded) as any
    const ok =
      decodedShape.class === Number(built.class) &&
      decodedShape.alreadySetVal === false &&
      decodedShape.itemType?.type_client?.type === clientVarType
    unsetChecks.push({ clientVarType, typeName, decodedShape, ok })
    if (!ok) failures.push(`${typeName}(${clientVarType}): unset base value round-trip mismatch`)
  }

  fs.writeFileSync(
    'tests/client_generated/_value_roundtrip.json',
    JSON.stringify(
      {
        description:
          'Round-trip verification of client_literal_value against observed sample shapes',
        supportedClientVarTypes: SUPPORTED_LITERALS.map((s) => s.clientVarType),
        literalResults: results,
        unsetBaseResults: unsetChecks,
        failures
      },
      null,
      2
    ) + '\n',
    'utf8'
  )

  if (failures.length) {
    console.error(`[fail] ${failures.length} mismatches:`)
    for (const f of failures) console.error('  ' + f)
    process.exit(1)
  }
  console.log(`[ok] all ${SUPPORTED_LITERALS.length} supported client literal types verified`)
}

main()
