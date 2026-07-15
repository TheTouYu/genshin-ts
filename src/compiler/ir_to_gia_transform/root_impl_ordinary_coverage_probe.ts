/**
 * P5-W6/W7 encode probes for the root→impl ordinary coverage matrix.
 *
 * Runs under shared-beta surface only. Does not change production defaults.
 * Evidence class: automatic generation under GSTS_STAGE3_VENDOR_IMPL_GRAPH=1.
 *
 * Uses one combined residual-scalar fixture (plus print_string) so runtime
 * registries are registered once. Row statuses are derived from the combined
 * encode result plus static classification.
 */

import { RoundingMode } from '../../definitions/enum.js'
import { irToGia } from './index.js'
import {
  classifyStaticCoverageStatuses,
  listStaticOrdinaryCoverageRows,
  summarizeOrdinaryCoverage,
  type CoverageProbeSummary,
  type OrdinaryCoverageRow,
  RESIDUAL_BINARY_SCALAR_NODE_TYPES,
  RESIDUAL_UNARY_SCALAR_NODE_TYPES
} from './root_impl_ordinary_coverage_matrix.js'
import { STAGE3_VENDOR_IMPL_GRAPH_ENV } from './stage3_backend.js'

const PROTO_DEFAULT = new URL(
  '../../thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname

export type RunCoverageProbesOptions = {
  /** Force shared beta env for probes. Default true. */
  enableSharedBeta?: boolean
  /** Optional proto path override. */
  protoPath?: string
}

function camelMethod(nodeType: string): string {
  return nodeType.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
}

/**
 * Encode residual+generic fixture. Safe for single call per process.
 */
export async function encodeResidualAndGenericFixtureOnce(
  protoPath: string = PROTO_DEFAULT
): Promise<{
  ok: boolean
  message: string
  exercisedRowIds: string[]
  byteLength: number
}> {
  const core = await import('../../runtime/core.js')
  const value = await import('../../runtime/value.js')
  const runtimeConfig = await import('../../runtime/runtime_config.js')

  runtimeConfig.setRuntimeOptions({
    optimize: { precompileExpression: false, removeUnusedNodes: false }
  })

  const { g, buildServerGraphRegistriesIRDocuments } = core
  const { int, float, bool, str, asRuntimeValue } = value

  const residualUnary = [...RESIDUAL_UNARY_SCALAR_NODE_TYPES]
  const residualBinary = [...RESIDUAL_BINARY_SCALAR_NODE_TYPES]
  // P5-W7: residual scalar rows live under residual-scalar-* after shared identity migration.
  const exercisedRowIds = [
    'generic-print_string',
    ...residualUnary.map((t) => `residual-scalar-${t}`),
    ...residualBinary.map((t) => `residual-scalar-${t}`)
  ]

  const composite = g.defineComposite('P5W6_CoverageProbe_ResidualBatch', {
    inflows: [{ name: '执行' }],
    inputs: {
      i: { type: 'int' },
      f: { type: 'float' },
      b1: { type: 'bool' },
      b2: { type: 'bool' }
    },
    outputs: {},
    build(inputs: any, f: any) {
      const prints: any[] = []
      prints.push(f.node('print_string', [new str('p5w6-generic')]))

      for (const nodeType of residualUnary) {
        const method = camelMethod(nodeType)
        if (typeof f[method] !== 'function') {
          throw new Error(`runtime missing method ${method} for ${nodeType}`)
        }
        let result: any
        if (nodeType === 'round_to_integer_operation') {
          result = f[method](asRuntimeValue(inputs.f), RoundingMode.RoundToNearest)
        } else if (nodeType === 'arithmetic_square_root_operation') {
          result = f[method](asRuntimeValue(inputs.f))
        } else if (nodeType === 'logical_not_operation') {
          result = f[method](asRuntimeValue(inputs.b1))
        } else {
          result = f[method](asRuntimeValue(inputs.i))
        }
        prints.push(
          f.node('print_string', [f.dataTypeConversion(asRuntimeValue(result), 'str')])
        )
      }

      for (const nodeType of residualBinary) {
        const method = camelMethod(nodeType)
        if (typeof f[method] !== 'function') {
          throw new Error(`runtime missing method ${method} for ${nodeType}`)
        }
        let result: any
        if (nodeType.startsWith('logical_')) {
          result = f[method](asRuntimeValue(inputs.b1), asRuntimeValue(inputs.b2))
        } else if (nodeType === 'range_limiting_operation') {
          result = f[method](asRuntimeValue(inputs.i), new int(0), new int(10))
        } else {
          result = f[method](asRuntimeValue(inputs.i), new int(3))
        }
        prints.push(
          f.node('print_string', [f.dataTypeConversion(asRuntimeValue(result), 'str')])
        )
      }

      f.inflow('执行', prints[0])
      let tail = prints[0]
      for (const p of prints.slice(1)) {
        f.link(tail, 0, p)
        tail = p
      }
      return {}
    }
  })

  g.server({ name: 'P5W6-coverage-residual-batch', id: 1073742690 }).on(
    'whenEntityIsCreated',
    (_e: any, f: any) => {
      const call = f.declareDetached(composite, {
        i: new int(8),
        f: new float(9.0),
        b1: new bool(true),
        b2: new bool(false)
      })
      f.link(f.entry(), 0, call, 0)
    }
  )

  try {
    const docs = buildServerGraphRegistriesIRDocuments({
      defaultName: 'P5W6-coverage-residual-batch'
    })
    const doc = docs.at(-1)
    if (!doc) throw new Error('no IR document produced')
    const bytes = irToGia(doc, {
      graphId: 1073742690,
      name: 'P5W6-coverage-residual-batch',
      protoPath
    })
    if (!(bytes instanceof Uint8Array) || bytes.byteLength < 32) {
      throw new Error(`encoded GIA too small: ${bytes?.byteLength}`)
    }
    return {
      ok: true,
      message: `encoded ${bytes.byteLength} bytes under shared beta`,
      exercisedRowIds,
      byteLength: bytes.byteLength
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      ok: false,
      message: message.slice(0, 500),
      exercisedRowIds,
      byteLength: 0
    }
  }
}

/**
 * Run W1 classification + encode probes. Returns full summary.
 */
export async function runOrdinaryCoverageProbes(
  options: RunCoverageProbesOptions = {}
): Promise<CoverageProbeSummary> {
  const enableSharedBeta = options.enableSharedBeta !== false
  const previousEnv = process.env[STAGE3_VENDOR_IMPL_GRAPH_ENV]
  if (enableSharedBeta) {
    process.env[STAGE3_VENDOR_IMPL_GRAPH_ENV] = '1'
  }

  try {
    const staticRows = classifyStaticCoverageStatuses(listStaticOrdinaryCoverageRows())
    const byId = new Map(staticRows.map((r) => [r.id, { ...r } as OrdinaryCoverageRow]))

    const encode = await encodeResidualAndGenericFixtureOnce(options.protoPath)
    for (const id of encode.exercisedRowIds) {
      const current = byId.get(id)
      if (!current) continue
      if (encode.ok) {
        byId.set(id, {
          ...current,
          status: 'green',
          reason: `shared-beta-encode-probe-passed: ${encode.message}`,
          probeKind: 'generic-encode',
          evidence: [
            ...current.evidence,
            'encode-probe:residual-batch',
            `${STAGE3_VENDOR_IMPL_GRAPH_ENV}=1`
          ]
        })
      } else {
        byId.set(id, {
          ...current,
          status: 'red',
          reason: `shared-beta-encode-probe-failed: ${encode.message}`,
          probeKind: 'generic-encode',
          evidence: [...current.evidence, 'encode-probe:residual-batch']
        })
      }
    }

    return summarizeOrdinaryCoverage([...byId.values()])
  } finally {
    if (previousEnv === undefined) delete process.env[STAGE3_VENDOR_IMPL_GRAPH_ENV]
    else process.env[STAGE3_VENDOR_IMPL_GRAPH_ENV] = previousEnv
  }
}
