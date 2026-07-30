import fs from 'node:fs'
import path from 'node:path'

export type DiagnosticSeverity = 'warning' | 'error'
export type DiagnosticSource = 'user' | 'generated' | 'system'

export type Diagnostic = {
  code: string
  severity: DiagnosticSeverity
  source: DiagnosticSource
  message: string
  suggestion?: string
  graphId?: number
  graphName?: string
  entryFile?: string
  nodeId?: number
  nodeType?: string
  composite?: { id?: number; name?: string }
  relatedNodes?: Array<{ id: number; type?: string }>
  location?: { file?: string; line?: number; column?: number }
}

type DiagnosticOptions = {
  outputFile?: string
  outputDir?: string
  print?: boolean
}

let options: DiagnosticOptions = {
  outputFile: process.env.GSTS_WARNINGS_FILE,
  outputDir: process.env.GSTS_WARNINGS_DIR,
  print: true
}
const diagnostics: Diagnostic[] = []

export function configureDiagnostics(next: DiagnosticOptions) {
  options = { ...options, ...next }
}

export function formatDiagnostic(diagnostic: Diagnostic): string {
  const prefix = diagnostic.severity === 'error' ? '[error]' : '[warning]'
  const lines = [`${prefix} ${diagnostic.code}: ${diagnostic.message}`]
  if (diagnostic.suggestion) lines.push(`  suggestion: ${diagnostic.suggestion}`)
  lines.push(`  source: ${diagnostic.source}`)
  if (diagnostic.graphName || diagnostic.graphId !== undefined) {
    const graphName = diagnostic.graphName ?? '<unnamed>'
    const graphId = diagnostic.graphId === undefined ? '' : ` (${diagnostic.graphId})`
    lines.push(`  graph: ${graphName}${graphId}`)
  }
  if (diagnostic.entryFile) lines.push(`  entry: ${diagnostic.entryFile}`)
  if (diagnostic.nodeType || diagnostic.nodeId !== undefined) {
    const nodeType = diagnostic.nodeType ?? '<unknown>'
    const nodeId = diagnostic.nodeId === undefined ? '' : ` (IR ${diagnostic.nodeId})`
    lines.push(`  node: ${nodeType}${nodeId}`)
  }
  if (diagnostic.location) {
    const file = diagnostic.location.file ?? diagnostic.entryFile ?? '<unknown>'
    const line = diagnostic.location.line === undefined ? '' : `:${diagnostic.location.line}`
    const column = diagnostic.location.column === undefined ? '' : `:${diagnostic.location.column}`
    lines.push(`  location: ${file}${line}${column}`)
  }
  return lines.join('\n')
}

export function reportDiagnostic(diagnostic: Diagnostic): Diagnostic {
  diagnostics.push(diagnostic)
  if (options.print) console.warn(formatDiagnostic(diagnostic))
  persistDiagnostics()
  return diagnostic
}

export function getDiagnostics(): Diagnostic[] {
  return diagnostics.map((diagnostic) => ({ ...diagnostic }))
}

export function clearDiagnostics() {
  diagnostics.length = 0
}

function persistDiagnostics() {
  const configuredFile = options.outputFile
    ? path.resolve(options.outputFile)
    : options.outputDir
      ? path.join(path.resolve(options.outputDir), `warnings-${process.pid}.json`)
      : undefined
  if (!configuredFile) return
  const outputFile = configuredFile
  fs.mkdirSync(path.dirname(outputFile), { recursive: true })
  fs.writeFileSync(outputFile, JSON.stringify(diagnostics, null, 2) + '\n', 'utf8')
}

export function readDiagnosticsFile(file: string): Diagnostic[] {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
    return Array.isArray(raw) ? (raw as Diagnostic[]) : []
  } catch {
    return []
  }
}

export function readDiagnosticsDir(dir: string): Diagnostic[] {
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => /^warnings-.*\.json$/.test(name))
      .flatMap((name) => readDiagnosticsFile(path.join(dir, name)))
  } catch {
    return []
  }
}

export function diagnosticSourceForNode(nodeType?: string): DiagnosticSource {
  return nodeType?.startsWith('when_timer_') || nodeType === 'start_timer'
    ? 'generated'
    : 'user'
}
