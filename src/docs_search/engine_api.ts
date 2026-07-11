import fs from 'node:fs'
import path from 'node:path'

import type { DocumentChunk } from './types.js'

type NodeDefinition = {
  name?: string
  raw_title?: string
  functions?: string[]
  parameters?: { io?: string; name?: string; data_type?: string; description?: string }[]
}

type DefinitionDocument = { sections?: { nodes?: NodeDefinition[] }[] }

const USAGE_SOURCES = [
  'docs/docs/zh',
  'docs/docs/en',
  'create-genshin-ts/templates/start/README_ZH.md',
  'create-genshin-ts/templates/start/README.md',
  'tests/builtins_math_success_test.ts',
  'tests/gsts_server_functions_test.ts',
  'tests/gsts_server_cross_entry.ts',
  'tests/signal_parameters_test.ts',
  'tests/timer_support_test.ts',
  'tests/variable_plan_semantics_test.ts'
]

const STATUS = '当前实现'
const SOURCE = '当前代码实现 + 用户文档'
const SCOPE = 'gsts 当前 API'

function languageFor(text: string): DocumentChunk['language'] {
  return /[\u4e00-\u9fff]/.test(text) ? 'mixed' : 'en'
}

function hash(text: string): string {
  let value = 2166136261
  for (let i = 0; i < text.length; i += 1) value = Math.imul(value ^ text.charCodeAt(i), 16777619)
  return (value >>> 0).toString(16)
}

function makeChunk(
  text: string,
  collection: 'engine-api-usage' | 'engine-api-signatures',
  title: string,
  index: number,
  apiId: string,
  category: string
): DocumentChunk {
  return {
    path: collection,
    collection,
    title,
    headingPath: [category, title],
    status: STATUS,
    source: SOURCE,
    scope: SCOPE,
    language: languageFor(text),
    apiCategory: category,
    apiId,
    id: `${collection}:${apiId}:${hash(text)}`,
    chunkIndex: index,
    contentHash: hash(text),
    text,
    tokens: text.toLowerCase().match(/[a-z0-9_./:-]+|[\u4e00-\u9fff]/g) ?? []
  }
}

function walkMarkdown(root: string, entry: string): string[] {
  const absolute = path.join(root, entry)
  if (!fs.existsSync(absolute)) return []
  if (fs.statSync(absolute).isFile()) return [absolute]
  const files: string[] = []
  const visit = (directory: string) => {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const itemPath = path.join(directory, item.name)
      if (item.isDirectory()) visit(itemPath)
      else if (item.name.endsWith('.md')) files.push(itemPath)
    }
  }
  visit(absolute)
  return files
}

function usageChunks(root: string): DocumentChunk[] {
  const chunks: DocumentChunk[] = []
  for (const source of USAGE_SOURCES) {
    for (const file of walkMarkdown(root, source)) {
      const relative = path.relative(root, file).split(path.sep).join('/')
      const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
      const sections = text.split(/(?=^#{1,6}\s)/m).filter((part) => part.trim())
      sections.forEach((section, index) => {
        const bounded = section.length > 3500 ? section.slice(0, 3500) : section
        const title = section.match(/^#{1,6}\s+(.+)$/m)?.[1] ?? relative
        chunks.push(
          makeChunk(
            `来源文件：${relative}\n标题：${title}\n${bounded}`,
            'engine-api-usage',
            title,
            chunks.length,
            `doc:${relative}:${index}`,
            'usage'
          )
        )
      })
    }
  }
  return chunks
}

function signatureChunks(root: string): DocumentChunk[] {
  const definitionsPath = path.join(root, 'resources/node_definitions.json')
  const definitions = JSON.parse(fs.readFileSync(definitionsPath, 'utf8')) as Record<
    string,
    DefinitionDocument
  >
  const chunks: DocumentChunk[] = []
  for (const [key, document] of Object.entries(definitions)) {
    if (!key.startsWith('server_') || !key.endsWith('_zh-cn')) continue
    for (const section of document.sections ?? []) {
      for (const node of section.nodes ?? []) {
        if (!node.name) continue
        const params = (node.parameters ?? [])
          .map((parameter) =>
            `${parameter.io ?? ''} ${parameter.name ?? ''}: ${parameter.data_type ?? ''} ${parameter.description ?? ''}`.trim()
          )
          .join('\n')
        const text = [
          `API 名称：${node.name}`,
          `原始标题：${node.raw_title ?? node.name}`,
          `分类：${key}`,
          ...(node.functions ?? []),
          params ? `参数：\n${params}` : ''
        ]
          .filter(Boolean)
          .join('\n')
        chunks.push(
          makeChunk(
            text,
            'engine-api-signatures',
            node.name,
            chunks.length,
            `node:${key}:${node.name}`,
            'node'
          )
        )
      }
    }
  }
  return chunks
}

function curatedUsageChunks(): DocumentChunk[] {
  const cards = [
    {
      id: 'event.whenEntityIsCreated',
      title: '实体创建事件 whenEntityIsCreated',
      category: 'event',
      text: `实体创建完成时触发。回调接收事件参数和节点图函数对象 f。\n\n示例：\nimport { g } from 'genshin-ts/runtime/core'\n\ng.server({ id: 1073741825 }).on('whenEntityIsCreated', (evt, f) => {\n  f.printString(str(evt.eventSourceGuid))\n})\n\n相关 API：g.server、f.printString、eventSourceEntity、eventSourceGuid。`
    },
    {
      id: 'math.Vector3.Add',
      title: '三维向量加法 Vector3.Add',
      category: 'vector3',
      text: `计算两个三维向量的和，返回 vec3。\n\n示例：\nconst a = vec3(1, 2, 3)\nconst b = vec3(4, 5, 6)\nconst result = Vector3.Add(a, b)\n\n自动回归：tests/builtins_math_success_test.ts。`
    },
    {
      id: 'variable.nodeGraph',
      title: '节点图变量读取和写入',
      category: 'variable',
      text: `在 g.server 的 variables 中声明节点图变量，然后在事件回调中使用 f.get 和 f.set。集合变量可通过 f.get 获得实时引用。\n\n示例：\ng.server({ id: 1073741825, variables: { score: 0n } })\n  .on('whenEntityIsCreated', (_evt, f) => {\n    f.set('score', f.get('score') + 1n)\n  })\n\n相关 API：variables、f.get、f.set、getNodeGraphVariable。`
    },
    {
      id: 'event.whenNodeGraphVariableChanges',
      title: '节点图变量变化事件',
      category: 'event',
      text: `当前节点图的节点图变量发生变化时触发。变化前值和变化后值是泛型，需要按实际变量类型转换后使用。\n\n示例：\ng.server({ id: 1073741825 }).on('whenNodeGraphVariableChanges', (evt, f) => {\n  f.printString(str(evt.variableName))\n})\n\n来源：resources/node_definitions.json 和 src/definitions/events.ts。`
    }
  ]
  return cards.map((card, index) =>
    makeChunk(card.text, 'engine-api-usage', card.title, index, card.id, card.category)
  )
}

export function extractEngineApiChunks(root: string): DocumentChunk[] {
  return [...curatedUsageChunks(), ...usageChunks(root), ...signatureChunks(root)]
}
