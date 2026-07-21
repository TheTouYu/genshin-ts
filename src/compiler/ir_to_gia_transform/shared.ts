import fs from 'node:fs'
import path from 'node:path'

import { DEFAULT_GIA_PROTO } from '../../injector/proto.js'
import { resolveGraphIdForGraph } from '../../runtime/graph_defaults.js'
import type { IRDocument } from '../../runtime/IR.js'
import type { SignalRegistry } from '../signal_registry.js'
import { irToGia } from './index.js'

function ensurePrefixedDefaultName(raw: string): string {
  if (raw.startsWith('_GSTS')) return raw
  return `_GSTS_${raw}`
}

function resolveGraphId(ir: IRDocument): number {
  return resolveGraphIdForGraph(ir.graph)
}

export type WriteGiaFromIrJsonFileOptions = {
  /**
   * Only emit selected document indices from the IR list (when the input json is an array).
   * If omitted, emits all.
   */
  includeIndices?: number[]
  /**
   * When includeIndices is provided and the input is an array, keep the original index in
   * output file names (e.g. `foo_3.gia`), instead of re-numbering.
   */
  preserveIndices?: boolean
  signalRegistry?: SignalRegistry
}

export type GiaWriteResult = {
  irPath: string
  giaPath: string
  graphId: number
  sourceIndex: number
}

export function writeGiaFromIrJsonFile(
  irPath: string,
  outFile?: string,
  opts?: WriteGiaFromIrJsonFileOptions,
  onWriteGia?: (res: GiaWriteResult) => void
): GiaWriteResult[] {
  const raw: unknown = JSON.parse(fs.readFileSync(irPath, 'utf-8'))
  const list: unknown[] = Array.isArray(raw) ? (raw as unknown[]) : [raw]
  if (list.length === 0) {
    throw new Error(`[error] empty IR list: ${irPath}`)
  }

  const inputBaseName = path.basename(irPath, path.extname(irPath))
  const inputDir = path.dirname(irPath)
  const outPath = outFile ?? inputDir
  const isOutputDirectory =
    !path.extname(outPath) || (fs.existsSync(outPath) && fs.statSync(outPath).isDirectory())

  const indices =
    opts?.includeIndices?.length && list.length > 1
      ? [...new Set(opts.includeIndices)]
          .filter((n) => Number.isInteger(n) && n >= 0 && n < list.length)
          .sort((a, b) => a - b)
      : list.map((_, i) => i)

  const outputs: GiaWriteResult[] = []
  indices.forEach((idx) => {
    const item = list[idx]
    if (!item) return

    const ir = item as IRDocument

    let target: string
    if (list.length === 1) {
      target = isOutputDirectory ? path.join(outPath, `${inputBaseName}.gia`) : outPath
    } else {
      const outputDir = isOutputDirectory ? outPath : path.dirname(outPath)
      const suffix =
        opts?.includeIndices?.length && opts.preserveIndices ? String(idx) : String(outputs.length)
      target = path.join(outputDir, `${inputBaseName}_${suffix}.gia`)
    }

    if (!ir.graph.name) {
      ir.graph.name = ensurePrefixedDefaultName(inputBaseName)
    }

    const bytes = irToGia(ir, {
      protoPath: DEFAULT_GIA_PROTO,
      signalRegistry: opts?.signalRegistry
    })
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, Buffer.from(bytes))
    const res = { irPath, giaPath: target, graphId: resolveGraphId(ir), sourceIndex: idx }
    outputs.push(res)
    onWriteGia?.(res)
  })
  return outputs
}
