import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import type { EmbeddingCache } from './types.js'

const CACHE_FILE = 'embedding-cache.json'
const REQUEST_BATCH_SIZE = 16
const REQUEST_CONCURRENCY = 8

function emptyCache(): EmbeddingCache {
  return { schemaVersion: 1, entries: {} }
}

function isEmbedding(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === 'number' && Number.isFinite(item))
  )
}

function isEmbeddingCache(value: unknown): value is EmbeddingCache {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as { schemaVersion?: unknown; entries?: unknown }
  return (
    candidate.schemaVersion === 1 &&
    !!candidate.entries &&
    typeof candidate.entries === 'object' &&
    !Array.isArray(candidate.entries)
  )
}

function loadEmbeddingCache(file: string): EmbeddingCache {
  if (!fs.existsSync(file)) return emptyCache()
  try {
    const value: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
    return isEmbeddingCache(value) ? value : emptyCache()
  } catch {
    return emptyCache()
  }
}

function writeJsonAtomically(file: string, value: unknown): void {
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`
  fs.writeFileSync(temporary, JSON.stringify(value), 'utf8')
  fs.renameSync(temporary, file)
}

export class EmbeddingClient {
  private readonly cachePath: string
  private cache: EmbeddingCache

  constructor(
    private readonly config: { apiKey?: string; baseUrl: string; model: string; indexDir: string }
  ) {
    this.cachePath = path.join(config.indexDir, CACHE_FILE)
    this.cache = loadEmbeddingCache(this.cachePath)
  }

  async embed(inputs: string[]): Promise<number[][]> {
    if (inputs.length === 0) return []
    const output: number[][] = []
    const missing: { index: number; input: string; key: string }[] = []
    for (const [index, input] of inputs.entries()) {
      const inputHash = crypto.createHash('sha256').update(input).digest('hex')
      const key = `${this.config.model}:${inputHash}`
      const cached = this.cache.entries[key]
      if (cached?.model === this.config.model && isEmbedding(cached.embedding))
        output[index] = cached.embedding
      else missing.push({ index, input, key })
    }
    if (missing.length > 0) {
      if (!this.config.apiKey)
        throw new Error('Missing VECTORENGINE_API_KEY in .env or environment')

      let nextBatch = 0
      const processBatch = async () => {
        while (true) {
          const start = nextBatch
          nextBatch += REQUEST_BATCH_SIZE
          if (start >= missing.length) return
          const batch = missing.slice(start, start + REQUEST_BATCH_SIZE)
          let response: Awaited<ReturnType<typeof globalThis.fetch>> | undefined
          let lastError: unknown
          for (let attempt = 0; attempt < 4; attempt += 1) {
            response = undefined
            try {
              response = await globalThis.fetch(
                `${this.config.baseUrl.replace(/\/$/, '')}/embeddings`,
                {
                  method: 'POST',
                  headers: {
                    authorization: `Bearer ${this.config.apiKey}`,
                    'content-type': 'application/json'
                  },
                  body: JSON.stringify({
                    model: this.config.model,
                    input: batch.map((item) => item.input),
                    encoding_format: 'float'
                  })
                }
              )
            } catch (error) {
              lastError = error
            }
            if (response && response.status !== 429 && response.status < 500) break
            if (attempt === 3) break
            const retryAfter = Number(response?.headers.get('retry-after'))
            const delayMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : 1000 * 2 ** attempt
            await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, 30_000)))
          }
          if (!response) {
            if (lastError instanceof Error) throw lastError
            throw new Error('Embedding API request failed without a response')
          }
          if (!response.ok) throw new Error(`Embedding API failed: HTTP ${response.status}`)
          const body = (await response.json()) as {
            data?: { embedding?: unknown; index?: number }[]
          }
          if (!body.data || body.data.length !== batch.length)
            throw new Error('Embedding API returned an invalid response')
          for (const [offset, item] of batch.entries()) {
            const embedding = body.data[offset]?.embedding
            if (!isEmbedding(embedding))
              throw new Error('Embedding API returned an invalid embedding')
            this.cache.entries[item.key] = {
              model: this.config.model,
              embedding,
              createdAt: new Date().toISOString()
            }
            output[item.index] = embedding
          }
          fs.mkdirSync(this.config.indexDir, { recursive: true })
          writeJsonAtomically(this.cachePath, this.cache)
        }
      }
      const workerCount = Math.min(
        REQUEST_CONCURRENCY,
        Math.ceil(missing.length / REQUEST_BATCH_SIZE)
      )
      await Promise.all(Array.from({ length: workerCount }, processBatch))
    }
    return output
  }
}
