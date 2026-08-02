import fs from 'node:fs'
import path from 'node:path'

import { loadDocsSearchConfig } from '../src/docs_search/config.js'
import { EmbeddingClient } from '../src/docs_search/embedding.js'
import type { DocumentChunk, SearchIndex, SearchResult } from '../src/docs_search/types.js'

const args = process.argv.slice(2)
const options = new Map<string, string>()
const queryParts: string[] = []
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index]
  if (arg.startsWith('--')) {
    const [key, inlineValue] = arg.slice(2).split('=', 2)
    const value = inlineValue ?? args[index + 1]
    if (inlineValue === undefined) index += 1
    options.set(key, value ?? 'true')
  } else queryParts.push(arg)
}
const query = queryParts.join(' ').trim()
if (!query) throw new Error('Usage: npm run docs:search -- "query" [--collection name] [--json]')

const config = loadDocsSearchConfig()
const indexPath = path.join(config.indexDir, 'index.json')
if (!fs.existsSync(indexPath)) throw new Error('Index not found. Run npm run docs:index first')
let index: SearchIndex
try {
  index = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as SearchIndex
} catch {
  throw new Error('Invalid docs search index. Run npm run docs:index')
}
if (!index || index.schemaVersion !== 1 || !Array.isArray(index.chunks) || !index.embedding)
  throw new Error('Invalid docs search index. Run npm run docs:index')
const { model, dimensions } = index.embedding
if (model !== config.model)
  throw new Error(
    `Search index uses embedding model ${model}, but config uses ${config.model}. ` +
      'Run npm run docs:index'
  )
if (!Number.isInteger(dimensions) || dimensions <= 0)
  throw new Error('Invalid embedding dimensions in docs search index. Run npm run docs:index')
const invalidChunk = index.chunks.find(
  (chunk) => !Array.isArray(chunk.embedding) || chunk.embedding.length !== dimensions
)
if (invalidChunk)
  throw new Error('Docs search index contains invalid embeddings. Run npm run docs:index')
const [queryEmbedding] = await new EmbeddingClient(config).embed([query])
if (!Array.isArray(queryEmbedding) || queryEmbedding.length !== dimensions)
  throw new Error('Query embedding dimensions do not match the docs search index')
const queryTokens = new Set(query.toLowerCase().match(/[a-z0-9_./:-]+|[\u4e00-\u9fff]/g) ?? [])
const collection = options.get('collection')
const includeHistory = options.get('include-history') === 'true'

function lexicalScore(chunk: DocumentChunk): number {
  if (queryTokens.size === 0) return 0
  let hits = 0
  for (const token of queryTokens) if (chunk.tokens.includes(token)) hits += 1
  return hits / queryTokens.size
}

function cosine(a: number[], b: number[]): number {
  let dot = 0
  let aa = 0
  let bb = 0
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    dot += a[i] * b[i]
    aa += a[i] * a[i]
    bb += b[i] * b[i]
  }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0
}

const results: SearchResult[] = index.chunks
  .filter((chunk) => !collection || chunk.collection === collection)
  .filter((chunk) => includeHistory || chunk.collection !== 'historical')
  .map((chunk) => {
    const semanticScore = chunk.embedding ? cosine(queryEmbedding, chunk.embedding) : 0
    const lexical = lexicalScore(chunk)
    const authority =
      chunk.collection === 'historical'
        ? 0.35
        : chunk.collection === 'engine-api-usage'
          ? 1.05
          : chunk.collection === 'engine-api-signatures'
            ? 0.9
            : chunk.status === '待验证'
              ? 0.3
              : 1
    return {
      rank: 0,
      score: semanticScore * 0.45 + lexical * 0.4 + authority * 0.15,
      lexicalScore: lexical,
      semanticScore,
      chunk
    }
  })
  .sort((a, b) => b.score - a.score)
  .slice(0, Number(options.get('limit') ?? 8))
  .map((result, rank) => ({ ...result, rank: rank + 1 }))

if (options.has('json')) {
  const publicResults = results.map(({ chunk, ...result }) => {
    const { tokens: _tokens, embedding: _embedding, ...publicChunk } = chunk
    return { ...result, chunk: publicChunk }
  })
  console.log(
    JSON.stringify({ query, indexVersion: index.updatedAt, results: publicResults }, null, 2)
  )
} else {
  for (const result of results) {
    console.log(
      `\n${result.rank}. ${result.chunk.path}#${result.chunk.title} (${result.score.toFixed(4)})`
    )
    console.log(`${result.chunk.status} / ${result.chunk.source} / ${result.chunk.scope}`)
    console.log(result.chunk.text.slice(0, 800))
  }
}
