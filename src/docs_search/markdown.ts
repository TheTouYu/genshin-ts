import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import type { DocumentChunk, DocumentCollection, DocumentMetadata } from './types.js'

const STATUS_RE = /^> 状态：(.+)$/m
const SOURCE_RE = /^> 来源：(.+)$/m
const VERIFIED_RE = /^> 最近校验：(.+)$/m
const SCOPE_RE = /^> 适用范围：(.+)$/m

function hash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function collectionFor(file: string, text: string): DocumentCollection {
  if (file.includes('/handover/') || /状态：历史记录|状态：部分过期/.test(text)) return 'historical'
  if (file.includes('/composite-ir/') || /真实 GIA/.test(text)) return 'verified-gia'
  return 'current'
}

function languageFor(text: string): DocumentMetadata['language'] {
  const chinese = (text.match(/[\u4e00-\u9fff]/g) ?? []).length
  const latin = (text.match(/[A-Za-z]/g) ?? []).length
  if (chinese > latin * 1.5) return 'zh'
  if (latin > chinese * 1.5) return 'en'
  return 'mixed'
}

function metadataFor(root: string, file: string, text: string): DocumentMetadata {
  const relative = path.relative(root, file).split(path.sep).join('/')
  const firstHeading = text.match(/^#\s+(.+)$/m)?.[1] ?? relative
  return {
    path: relative,
    collection: collectionFor(relative, text),
    title: firstHeading,
    headingPath: [firstHeading],
    status: text.match(STATUS_RE)?.[1]?.trim() ?? '待验证',
    source: text.match(SOURCE_RE)?.[1]?.trim() ?? '推测',
    scope: text.match(SCOPE_RE)?.[1]?.trim() ?? '未声明',
    lastVerified: text.match(VERIFIED_RE)?.[1]?.trim(),
    language: languageFor(text)
  }
}

function tokens(text: string): string[] {
  return Array.from(new Set(text.toLowerCase().match(/[a-z0-9_./:-]+|[\u4e00-\u9fff]/g) ?? []))
}

function chunkText(text: string, maxLength = 3500): string[] {
  const sections = text
    .split(/(?=^#{1,6}\s)/m)
    .map((part) => part.trim())
    .filter(Boolean)
  const chunks: string[] = []
  for (const section of sections) {
    if (section.length <= maxLength) chunks.push(section)
    else {
      for (let i = 0; i < section.length; i += maxLength)
        chunks.push(section.slice(i, i + maxLength))
    }
  }
  return chunks
}

export function extractMarkdown(root: string, file: string): DocumentChunk[] {
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
  const metadata = metadataFor(root, file, text)
  return chunkText(text).map((chunk, chunkIndex) => ({
    ...metadata,
    id: hash(`${metadata.path}:${chunkIndex}:${chunk}`),
    chunkIndex,
    contentHash: hash(chunk),
    text: chunk,
    tokens: tokens(`${metadata.path} ${metadata.title} ${chunk}`)
  }))
}
