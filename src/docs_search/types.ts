export type DocumentCollection =
  | 'current'
  | 'verified-gia'
  | 'historical'
  | 'engine-api-usage'
  | 'engine-api-signatures'

export type DocumentMetadata = {
  path: string
  collection: DocumentCollection
  title: string
  headingPath: string[]
  status: string
  source: string
  scope: string
  lastVerified?: string
  language: 'zh' | 'en' | 'mixed'
  apiCategory?: string
  apiId?: string
}

export type DocumentChunk = DocumentMetadata & {
  id: string
  chunkIndex: number
  contentHash: string
  text: string
  tokens: string[]
  embedding?: number[]
}

export type SearchResult = {
  rank: number
  score: number
  lexicalScore: number
  semanticScore: number
  chunk: DocumentChunk
}

export type SearchIndex = {
  schemaVersion: 1
  createdAt: string
  updatedAt: string
  embedding?: {
    provider: string
    model: string
    dimensions: number
  }
  chunks: DocumentChunk[]
}

export type EmbeddingCache = {
  schemaVersion: 1
  entries: Record<string, { model: string; embedding: number[]; createdAt: string }>
}
