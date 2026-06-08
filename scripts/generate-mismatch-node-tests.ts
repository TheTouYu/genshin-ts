import { execSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

import { assignTypeParamsFromCase, emitArgFromNodesTypeText } from './testgen/args_from_nodes.js'
import { emitFile, writeText, type GeneratedCall } from './testgen/emit.js'
import { buildGenericsMap, loadNodeGenerics } from './testgen/generics_data.js'
import { extractServerFMethods } from './testgen/methods.js'
import { loadEnumPicks } from './testgen/picks.js'
import { emitProducers, type Ctx } from './testgen/values.js'
import { canResolveNodeType, readVendorNodeIdKeysLower } from './testgen/vendor_ids.js'

import { NODE_ID } from '../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_id.js'

type Bucket = { literal: GeneratedCall[]; wire: GeneratedCall[] }

function getChangedNodeIdsFromGitDiff(repoRoot: string): Set<number> {
  const rel = 'src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.ts'
  // 用较大的上下文，确保 multiline entry 的 `id: ...` 行也会被包含进 diff 输出
  const out = execSync(`git diff --unified=50 -- ${rel}`, { cwd: repoRoot, encoding: 'utf8' })
  const ids = new Set<number>()
  let currentId: number | null = null
  for (const line of out.split(/\r?\n/)) {
    // update current id context (both inline and multiline entries)
    const mId = /\bid:\s*(\d+)\b/.exec(line)
    if (mId) {
      const n = Number(mId[1])
      if (Number.isInteger(n)) currentId = n
    }
    // capture only hunks that actually changed inputs
    if (/^[+-].*\binputs\s*:/.test(line) && currentId !== null) {
      ids.add(currentId)
    }
  }
  return ids
}

function nodeTypesFromNodeIds(changedIds: Set<number>): Set<string> {
  const out = new Set<string>()
  for (const [key, id] of Object.entries(NODE_ID)) {
    if (!changedIds.has(id as number)) continue
    const lower = key.toLowerCase()
    const base = lower.split('__')[0] ?? lower
    out.add(base)
  }
  return out
}

function main() {
  const repoRoot = process.cwd()
  const nodesTsPath = path.join(repoRoot, 'src/definitions/nodes.ts')
  const enumTsPath = path.join(repoRoot, 'src/definitions/enum.ts')
  const outDir = path.join(repoRoot, 'tests/generated')

  // output files
  const outLit = path.join(outDir, 'mismatch_only.literal.ts')
  const outWire = path.join(outDir, 'mismatch_only.wire.ts')

  const vendorKeysLower = readVendorNodeIdKeysLower(repoRoot)
  const enumPick = loadEnumPicks(enumTsPath)
  const methods = extractServerFMethods(nodesTsPath)

  const generics = loadNodeGenerics(repoRoot)
  const genericsMap = buildGenericsMap(generics)

  const changedIds = getChangedNodeIdsFromGitDiff(repoRoot)
  if (changedIds.size === 0) {
    throw new Error('[error] no changed node ids found from git diff; nothing to generate')
  }
  const wantedNodeTypes = nodeTypesFromNodeIds(changedIds)

  const picked = methods.filter((m) => m.nodeType && wantedNodeTypes.has(m.nodeType))

  fs.mkdirSync(outDir, { recursive: true })

  const mkBucket = (): Bucket => ({ literal: [], wire: [] })
  const bucket = mkBucket()

  const BASE_GRAPH_ID = 1073741873

  for (const m of picked) {
    if (m.nodeType && !canResolveNodeType(m.nodeType, vendorKeysLower)) {
      continue
    }

    // 仍缺少稳定的 snapshot producer（与全量生成器一致：跳过）
    if (m.params.some((p) => /\bCustomVariableSnapshotValue\b|\bcustomVariableSnapshot\b/.test(p.typeText))) {
      continue
    }

    const ginfo = genericsMap.get(m.name)

    const ctxLit: Ctx = { n: 0 }
    const ctxWire: Ctx = { n: 0 }

    const buildOne = (mode: 'literal' | 'wire', typeCase: string | undefined): GeneratedCall => {
      const assign = typeCase ? assignTypeParamsFromCase(m, typeCase) : new Map()
      const args: string[] = []
      for (let i = 0; i < m.params.length; i++) {
        const p = m.params[i]!

        if (p.rest) {
          const baseTypeText = p.typeText.trim().replace(/\[\]$/, '').trim()
          const e1 = emitArgFromNodesTypeText(
            mode,
            m,
            i,
            baseTypeText,
            mode === 'literal' ? ctxLit : ctxWire,
            enumPick,
            assign
          )
          const e2 = emitArgFromNodesTypeText(
            mode,
            m,
            i,
            baseTypeText,
            mode === 'literal' ? ctxLit : ctxWire,
            enumPick,
            assign
          )
          const e3 = emitArgFromNodesTypeText(
            mode,
            m,
            i,
            baseTypeText,
            mode === 'literal' ? ctxLit : ctxWire,
            enumPick,
            assign
          )
          args.push(e1, e2, e3)
          continue
        }

        const expr = emitArgFromNodesTypeText(
          mode,
          m,
          i,
          p.typeText,
          mode === 'literal' ? ctxLit : ctxWire,
          enumPick,
          assign
        )
        args.push(expr)
      }
      return { fn: m.name, typeCase, code: `f.${m.name}(${args.join(', ')})` }
    }

    const typeCases: string[] = []
    if (ginfo) {
      // 仅取前 1 个 availableType（足够覆盖“参数填充/连线”正确性）
      if (ginfo.availableTypes.length) typeCases.push(ginfo.availableTypes[0]!)
    }

    // 没有泛型 case 的方法也生成一条 default
    const cases = typeCases.length ? typeCases : [undefined]
    for (const tc of cases) {
      bucket.literal.push(buildOne('literal', tc))
      bucket.wire.push(buildOne('wire', tc))
    }
  }

  writeText(outLit, emitFile('literal', 'mismatch_only', BASE_GRAPH_ID, null, bucket.literal))
  writeText(outWire, emitFile('wire', 'mismatch_only', BASE_GRAPH_ID + 1, emitProducers(), bucket.wire))

  process.stdout.write(`[ok] wrote ${path.relative(repoRoot, outLit)}\n`)
  process.stdout.write(`[ok] wrote ${path.relative(repoRoot, outWire)}\n`)
  process.stdout.write(`[ok] methods: ${picked.length}, nodeTypes: ${wantedNodeTypes.size}, changedIds: ${changedIds.size}\n`)
}

main()


