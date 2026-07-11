// @ts-nocheck
/**
 * P0-W4: ordinary node contract normalization + root/impl parity compare.
 *
 * Excludes nodeIndex / position / outer wrapper noise. Locks ordinary schema:
 * generic/concrete identity, InParam pin type, concrete wrapper, and
 * connection shape (source pin kind/index only — not absolute node ids).
 */

export type OrdinaryPinContract = {
  kind: number
  index: number
  type: number | undefined
  valueClass: number | undefined
  alreadySetVal: boolean | undefined
  hasConcreteWrapper: boolean
  indexOfConcrete: number | null
  /** payload kind under the pin value (or under bConcreteValue.inner) */
  payloadKind: 'none' | 'float' | 'int' | 'str' | 'bool' | 'vec' | 'id' | 'enum' | 'other'
  /** stable literal summary when no connection; null when connected or absent */
  literalSummary: string | null
  hasConnection: boolean
  connectionSourcePinKind: number | null
  connectionSourcePinIndex: number | null
}

export type OrdinaryNodeContract = {
  genericId: number | undefined
  concreteId: number | undefined
  /** InParam/OutParam only, sorted by (kind, index) */
  pins: OrdinaryPinContract[]
}

export type ContractMismatch = {
  path: string
  expected: unknown
  actual: unknown
}

function payloadOf(value: any): { kind: OrdinaryPinContract['payloadKind']; summary: string | null } {
  if (!value || typeof value !== 'object') return { kind: 'none', summary: null }
  const inner = value.bConcreteValue?.value ?? value
  if (inner?.bFloat != null) {
    return { kind: 'float', summary: String(inner.bFloat.val) }
  }
  if (inner?.bInt != null) {
    return { kind: 'int', summary: String(inner.bInt.val) }
  }
  if (inner?.bString != null) {
    return { kind: 'str', summary: String(inner.bString.val) }
  }
  if (inner?.bEnum != null) {
    return { kind: 'bool', summary: String(inner.bEnum.val) }
  }
  if (inner?.bVector != null) {
    const v = inner.bVector.val ?? inner.bVector
    if (v && typeof v === 'object') {
      return {
        kind: 'vec',
        summary: `${Number(v.x ?? 0)},${Number(v.y ?? 0)},${Number(v.z ?? 0)}`
      }
    }
    return { kind: 'vec', summary: '{}' }
  }
  if (inner?.bId != null) {
    return { kind: 'id', summary: String(inner.bId.val) }
  }
  if (value.bConcreteValue) return { kind: 'none', summary: null }
  return { kind: 'other', summary: null }
}

function firstConnection(pin: any): { kind: number | null; index: number | null; has: boolean } {
  const c = pin?.connects?.[0]
  if (!c) return { kind: null, index: null, has: false }
  return {
    has: true,
    kind: c.connect?.kind ?? null,
    index: c.connect?.index ?? null
  }
}

export function extractOrdinaryPinContract(pin: any): OrdinaryPinContract {
  const kind = pin?.i1?.kind ?? pin?.kind
  const index = pin?.i1?.index ?? pin?.index
  const value = pin?.value
  const conn = firstConnection(pin)
  const payload = payloadOf(value)
  const hasConn = conn.has
  return {
    kind,
    index,
    type: pin?.type,
    valueClass: value?.class,
    alreadySetVal: value?.alreadySetVal,
    hasConcreteWrapper: value?.bConcreteValue != null,
    indexOfConcrete:
      value?.bConcreteValue?.indexOfConcrete === undefined
        ? null
        : Number(value.bConcreteValue.indexOfConcrete),
    payloadKind: payload.kind,
    // connected pins: ignore literal payload defaults (protobuf defaults / vendor defaults)
    literalSummary: hasConn ? null : payload.summary,
    hasConnection: hasConn,
    connectionSourcePinKind: conn.kind,
    connectionSourcePinIndex: conn.index
  }
}

export function extractOrdinaryNodeContract(node: any): OrdinaryNodeContract {
  const pins = (node?.pins ?? [])
    .filter((p: any) => {
      const kind = p?.i1?.kind ?? p?.kind
      return kind === 3 || kind === 4
    })
    .map(extractOrdinaryPinContract)
    .sort((a: OrdinaryPinContract, b: OrdinaryPinContract) =>
      a.kind !== b.kind ? a.kind - b.kind : a.index - b.index
    )

  return {
    genericId: node?.genericId?.nodeId ?? node?.GenericId,
    concreteId: node?.concreteId?.nodeId ?? node?.ConcreteId,
    pins
  }
}

export function compareOrdinaryNodeContracts(
  expected: OrdinaryNodeContract,
  actual: OrdinaryNodeContract,
  opts: { labelExpected?: string; labelActual?: string } = {}
): ContractMismatch[] {
  const expLabel = opts.labelExpected ?? 'expected'
  const actLabel = opts.labelActual ?? 'actual'
  const mismatches: ContractMismatch[] = []

  const push = (path: string, e: unknown, a: unknown) => {
    if (Object.is(e, a)) return
    // treat undefined/null as equal for optional absences
    if ((e === undefined || e === null) && (a === undefined || a === null)) return
    mismatches.push({ path, expected: e, actual: a })
  }

  push('genericId', expected.genericId, actual.genericId)
  push('concreteId', expected.concreteId, actual.concreteId)

  const expPins = expected.pins
  const actPins = actual.pins
  if (expPins.length !== actPins.length) {
    push('pins.length', expPins.length, actPins.length)
  }

  const max = Math.max(expPins.length, actPins.length)
  for (let i = 0; i < max; i++) {
    const e = expPins[i]
    const a = actPins[i]
    const base = `pins[${i}]`
    if (!e || !a) {
      push(base, e ?? null, a ?? null)
      continue
    }
    push(`${base}.kind`, e.kind, a.kind)
    push(`${base}.index`, e.index, a.index)
    push(`${base}.type`, e.type, a.type)
    push(`${base}.valueClass`, e.valueClass, a.valueClass)
    push(`${base}.alreadySetVal`, e.alreadySetVal, a.alreadySetVal)
    push(`${base}.hasConcreteWrapper`, e.hasConcreteWrapper, a.hasConcreteWrapper)
    push(`${base}.indexOfConcrete`, e.indexOfConcrete, a.indexOfConcrete)
    push(`${base}.payloadKind`, e.payloadKind, a.payloadKind)
    push(`${base}.literalSummary`, e.literalSummary, a.literalSummary)
    push(`${base}.hasConnection`, e.hasConnection, a.hasConnection)
    push(`${base}.connectionSourcePinKind`, e.connectionSourcePinKind, a.connectionSourcePinKind)
    push(
      `${base}.connectionSourcePinIndex`,
      e.connectionSourcePinIndex,
      a.connectionSourcePinIndex
    )
  }

  // annotate labels into path prefix for readability when printing
  if (mismatches.length > 0 && (opts.labelExpected || opts.labelActual)) {
    for (const m of mismatches) {
      m.path = `${expLabel}->${actLabel}:${m.path}`
    }
  }
  return mismatches
}

export function findSetterByVariableName(graph: any, variableName: string): any | undefined {
  for (const node of graph?.nodes ?? []) {
    const gid = node?.genericId?.nodeId
    if (gid !== 323) continue
    const namePin = (node.pins ?? []).find(
      (p: any) => p?.i1?.kind === 3 && p?.i1?.index === 0
    )
    const name = namePin?.value?.bString?.val ?? namePin?.value?.bConcreteValue?.value?.bString?.val
    if (name === variableName) return node
  }
  return undefined
}

export function findImplGraphByCompositeName(decoded: any, compositeName: string): any | undefined {
  const def = decoded?.accessories?.find((a: any) => a.name === compositeName)?.compositeDef
    ?.inner?.def
  const graphId = def?.id?.graphId?.id
  if (graphId == null) return undefined
  return decoded?.accessories?.find((a: any) => a.which === 9 && a.id?.id === graphId)?.graph
    ?.inner?.graph
}

export function formatMismatches(mismatches: ContractMismatch[]): string {
  if (mismatches.length === 0) return '(none)'
  return mismatches
    .map((m) => `  - ${m.path}: expected=${JSON.stringify(m.expected)} actual=${JSON.stringify(m.actual)}`)
    .join('\n')
}
