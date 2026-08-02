import fs from 'node:fs'
import path from 'node:path'

export type DocsSearchConfig = {
  apiKey?: string
  baseUrl: string
  model: string
  indexDir: string
}

function loadDotEnv(file: string): Record<string, string> {
  if (!fs.existsSync(file)) return {}
  const values: Record<string, string> = {}
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!match) continue
    values[match[1]] = match[2].replace(/^("|')|("|')$/g, '')
  }
  return values
}

export function loadDocsSearchConfig(root = process.cwd()): DocsSearchConfig {
  const dotEnv = loadDotEnv(path.join(root, '.env'))
  const get = (name: string, fallback: string) => process.env[name] ?? dotEnv[name] ?? fallback
  return {
    apiKey: process.env.VECTORENGINE_API_KEY ?? dotEnv.VECTORENGINE_API_KEY,
    baseUrl: get('VECTORENGINE_BASE_URL', 'https://api.vectorengine.ai/v1'),
    model: get('VECTORENGINE_EMBEDDING_MODEL', 'text-embedding-3-small'),
    indexDir: path.join(root, '.gsts-doc-search')
  }
}
