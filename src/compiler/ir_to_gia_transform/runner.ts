import { writeGiaFromIrJsonFile } from './shared.js'
import { createSignalRegistry, type RegisteredSignalDefinition } from '../signal_registry.js'

function parseIndicesCsv(csv: string | undefined): number[] | undefined {
  if (!csv) return undefined
  const trimmed = csv.trim()
  if (!trimmed) return undefined
  return trimmed
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n))
}

function main() {
  const [irPathArg, outFileArg, preserveFlag, indicesCsv, registryJson] = process.argv.slice(2)
  if (!irPathArg) {
    console.error('[error] irPath is required')
    process.exit(1)
  }

  const irPath = irPathArg
  const outFile = outFileArg || undefined
  const preserveIndices = preserveFlag === '1'
  const includeIndices = parseIndicesCsv(indicesCsv)
  const signalRegistry = registryJson
    ? createSignalRegistry(JSON.parse(registryJson) as RegisteredSignalDefinition[])
    : undefined

  const outputs = writeGiaFromIrJsonFile(
    irPath,
    outFile,
    { includeIndices, preserveIndices, signalRegistry },
    (x) => {
      // Print progress immediately (stderr is inherited by parent).
      process.stderr.write(`[ok] ${x.giaPath} (id=${x.graphId})\n`)
    }
  )
  process.stdout.write(JSON.stringify(outputs))
}

try {
  main()
} catch (err) {
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err))
  process.exit(1)
}
