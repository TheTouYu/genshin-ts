import fs from 'node:fs'
import path from 'node:path'

import fg from 'fast-glob'

import { loadDocsSearchConfig } from '../src/docs_search/config.js'
import { EmbeddingClient } from '../src/docs_search/embedding.js'
import { extractEngineApiChunks } from '../src/docs_search/engine_api.js'
import { extractMarkdown } from '../src/docs_search/markdown.js'
import type { SearchIndex } from '../src/docs_search/types.js'

const root = process.cwd()
const config = loadDocsSearchConfig(root)
const files = await fg(
  ['README*.md', 'docs/**/*.md', '.agents/skills/**/*.md', 'AGENTS.md', 'CLAUDE.md', 'REASONIX.md'],
  {
    cwd: root,
    ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/.pi-subagents/**'],
    onlyFiles: true
  }
)
const chunks = [
  ...files.flatMap((file) => extractMarkdown(root, path.join(root, file))),
  ...extractEngineApiChunks(root)
]
const embed = new EmbeddingClient(config)
const embeddings: number[][] = []
for (let start = 0; start < chunks.length; start += 64) {
  const batch = chunks.slice(start, start + 64)
  embeddings.push(
    ...(await embed.embed(batch.map((chunk) => `${chunk.path}\n${chunk.title}\n${chunk.text}`)))
  )
  console.log(
    `[progress] embedded ${Math.min(start + batch.length, chunks.length)}/${chunks.length}`
  )
}
const indexed: SearchIndex = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  embedding: {
    provider: 'vectorengine',
    model: config.model,
    dimensions: embeddings[0]?.length ?? 0
  },
  chunks: chunks.map((chunk, index) => ({ ...chunk, embedding: embeddings[index] }))
}
fs.mkdirSync(config.indexDir, { recursive: true })
fs.writeFileSync(path.join(config.indexDir, 'index.json'), JSON.stringify(indexed))
console.log(`[ok] indexed ${files.length} documents and ${chunks.length} chunks`)
