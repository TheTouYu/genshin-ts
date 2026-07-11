import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { fetch } from 'undici'

import type { EmbeddingCache } from './types.js'

const CACHE_FILE = 'embedding-cache.json'

export class EmbeddingClient {
  private readonly cachePath: string
  private cache: EmbeddingCache

  constructor(
    private readonly config: { apiKey?: string; baseUrl: string; model: string; indexDir: string }
  ) {
    this.cachePath = path.join(config.indexDir, CACHE_FILE)
    this.cache = fs.existsSync(this.cachePath)
      ? JSON.parse(fs.readFileSync(this.cachePath, 'utf8'))
      : { schemaVersion: 1, entries: {} }
  }

  async embed(inputs: string[]): Promise<number[][]> {
    if (inputs.length === 0) return []
    const output: number[][] = []
    const missing: { index: number; input: string; key: string }[] = []
    for (const [index, input] of inputs.entries()) {
      const inputHash = crypto.createHash('sha256').update(input).digest('hex')
      const key = `${this.config.model}:${inputHash}`
      const cached = this.cache.entries[key]
      if (cached?.model === this.config.model) output[index] = cached.embedding
      else missing.push({ index, input, key })
    }
    if (missing.length > 0) {
      if (!this.config.apiKey)
        throw new Error('Missing VECTORENGINE_API_KEY in .env or environment')

      for (let start = 0; start < missing.length; start += 16) {
        const batch = missing.slice(start, start + 16)
        let response: Awaited<ReturnType<typeof fetch>> | undefined
        for (let attempt = 0; attempt < 4; attempt += 1) {
          response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/embeddings`, {
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
          })
          if (response.status !== 429 && response.status < 500) break
          const retryAfter = Number(response.headers.get('retry-after'))
          const delayMs = Number.isFinite(retryAfter) ? retryAfter * 1000 : 1000 * 2 ** attempt
          await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, 30_000)))
        }
        if (!response?.ok)
          throw new Error(`Embedding API failed: HTTP ${response?.status ?? 'unknown'}`)
        const body = (await response.json()) as {
          data?: { embedding?: number[]; index?: number }[]
        }
        if (!body.data || body.data.length !== batch.length)
          throw new Error('Embedding API returned an invalid response')
        for (const [offset, item] of batch.entries()) {
          const embedding = body.data[offset]?.embedding
          if (!embedding) throw new Error('Embedding API returned a missing embedding')
          this.cache.entries[item.key] = {
            model: this.config.model,
            embedding,
            createdAt: new Date().toISOString()
          }
          output[item.index] = embedding
        }
        fs.mkdirSync(this.config.indexDir, { recursive: true })
        fs.writeFileSync(this.cachePath, JSON.stringify(this.cache))
      }
    }
    return output
  }
}
