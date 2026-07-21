import fs from 'node:fs'

import ts from 'typescript'

import {
  getNodeIdLowerMap,
  SPECIAL_NODE_MAPPINGS
} from '../../src/compiler/ir_to_gia_transform/mappings.js'
import { NODE_PIN_RECORDS } from '../../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.js'

type OfficialNode = {
  genericId: number
  pins: Array<{
    kind: string
    index: number
    nameEn?: string
  }>
}

type OfficialNames = {
  nodes: OfficialNode[]
}

type Edit = {
  start: number
  end: number
  text: string
}

type PinDifference = {
  domain: 'node' | 'event'
  genericId: number
  methodName: string
  direction: 'input' | 'output'
  pinIndex: number
  apiName: string
  officialName: string
}

const NODES_PATH = 'src/definitions/nodes.ts'
const EVENTS_PATH = 'src/definitions/events-payload.ts'
const NAMES_PATH = 'resources/mihoyo_editor_names.json'
const INTERNAL_PIN_LABELS = new Set(['3:input:1'])

const officialNames = JSON.parse(fs.readFileSync(NAMES_PATH, 'utf8')) as OfficialNames
const officialNodeById = new Map(officialNames.nodes.map((node) => [node.genericId, node]))
const pinRecordById = new Map<number, (typeof NODE_PIN_RECORDS)[number]>(
  NODE_PIN_RECORDS.map((record) => [record.id, record])
)
const nodeIdLower = getNodeIdLowerMap()

function propertyName(node: ts.PropertyName): string | undefined {
  return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : undefined
}

function normalizedIdentifier(value: string) {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function camelToSnake(value: string) {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

function resolveGenericId(methodName: string): number | undefined {
  const nodeType = camelToSnake(methodName)
  const vendorKey = SPECIAL_NODE_MAPPINGS[nodeType] ?? nodeType
  return nodeIdLower.get(vendorKey) ?? nodeIdLower.get(`${vendorKey}__generic`)
}

function visiblePinIndexes(types: readonly string[], publicCount: number): number[] | undefined {
  if (types.length === publicCount) return types.map((_, index) => index)
  const indexes = types.flatMap((type, index) => (type === 'Unk' ? [] : [index]))
  return indexes.length === publicCount ? indexes : undefined
}

function jsdoc(node: ts.Node, source: ts.SourceFile, code: string) {
  const doc = ts.getJSDocCommentsAndTags(node).find(ts.isJSDoc)
  return doc ? { start: doc.pos, end: doc.end, text: code.slice(doc.pos, doc.end) } : undefined
}

function commentLineText(line: string) {
  return line
    .replace(/^\s*\/\*\*\s?/, '')
    .replace(/^\s*\*\s?/, '')
    .replace(/\s*\*\/\s*$/, '')
    .trim()
}

function hasOfficialLine(lines: string[], officialName: string) {
  const expected = normalizedIdentifier(officialName)
  return lines.some((line) => normalizedIdentifier(commentLineText(line)) === expected)
}

function insertTagOfficialName(
  text: string,
  tag: '@param' | '@returns',
  officialName: string,
  parameterName?: string
) {
  const lines = text.split(/\r?\n/)
  if (hasOfficialLine(lines, officialName)) return text
  const tagText = parameterName ? `${tag} ${parameterName}` : tag
  const index = lines.findIndex((line) => commentLineText(line).startsWith(tagText))
  if (index < 0) return text

  const star = lines[index].match(/^(\s*\*)/)?.[1] ?? ' *'
  const lineText = commentLineText(lines[index])
  const description = lineText.slice(tagText.length).trim()
  if (description && normalizedIdentifier(description) === normalizedIdentifier(officialName)) {
    lines[index] = `${star} ${tagText}`
  }

  const additions = [`${star}`, `${star} ${officialName}`]
  if (commentLineText(lines[index + 1] ?? '') !== '') additions.push(`${star}`)
  lines.splice(index + 1, 0, ...additions)
  return lines.join('\n')
}

function insertPropertyOfficialName(text: string, officialName: string) {
  const lines = text.split(/\r?\n/)
  if (hasOfficialLine(lines, officialName)) return text
  const chineseIndex = lines.findIndex((line) => /[\p{Script=Han}]/u.test(commentLineText(line)))
  const closingIndex = lines.findIndex((line) => line.includes('*/'))
  const index = chineseIndex >= 0 ? chineseIndex : closingIndex
  if (index < 0) return text
  const star =
    lines[Math.max(0, index - 1)].match(/^(\s*\*)/)?.[1] ??
    lines[index].match(/^(\s*\*)/)?.[1] ??
    ' *'
  lines.splice(index, 0, `${star} ${officialName}`, `${star}`)
  return lines.join('\n')
}

function applyEdits(code: string, edits: Edit[]) {
  const unique = new Map(edits.map((edit) => [`${edit.start}:${edit.end}`, edit]))
  return [...unique.values()]
    .sort((left, right) => right.start - left.start)
    .reduce(
      (current, edit) => current.slice(0, edit.start) + edit.text + current.slice(edit.end),
      code
    )
}

function transformServerNodes(code: string) {
  const source = ts.createSourceFile(NODES_PATH, code, ts.ScriptTarget.Latest, true)
  const serverClass = source.statements.find(
    (statement): statement is ts.ClassDeclaration =>
      ts.isClassDeclaration(statement) && statement.name?.text === 'ServerExecutionFlowFunctions'
  )
  if (!serverClass) throw new Error('ServerExecutionFlowFunctions not found')

  const edits: Edit[] = []
  const differences: PinDifference[] = []
  for (const member of serverClass.members) {
    if (!ts.isMethodDeclaration(member) || !member.body) continue
    const methodName = propertyName(member.name)
    if (!methodName || methodName.startsWith('__')) continue

    let nodeType: string | undefined
    let argumentCount: number | undefined
    const outputLabels = new Map<number, string>()
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        if (node.expression.name.text === 'registerNode' && nodeType === undefined) {
          const object = node.arguments[0]
          if (object && ts.isObjectLiteralExpression(object)) {
            const nodeTypeProperty = object.properties.find(
              (property): property is ts.PropertyAssignment =>
                ts.isPropertyAssignment(property) && propertyName(property.name) === 'nodeType'
            )
            const argsProperty = object.properties.find(
              (property): property is ts.PropertyAssignment =>
                ts.isPropertyAssignment(property) && propertyName(property.name) === 'args'
            )
            if (
              nodeTypeProperty &&
              ts.isStringLiteral(nodeTypeProperty.initializer) &&
              argsProperty &&
              ts.isArrayLiteralExpression(argsProperty.initializer)
            ) {
              nodeType = nodeTypeProperty.initializer.text
              argumentCount = argsProperty.initializer.elements.length
            }
          }
        }
        if (
          node.expression.name.text === 'markPin' &&
          ts.isStringLiteral(node.arguments[1]) &&
          ts.isNumericLiteral(node.arguments[2])
        ) {
          outputLabels.set(Number(node.arguments[2].text), node.arguments[1].text)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(member.body)
    if (nodeType === undefined || argumentCount === undefined) continue

    const vendorKey = SPECIAL_NODE_MAPPINGS[nodeType] ?? nodeType
    const genericId = nodeIdLower.get(vendorKey) ?? nodeIdLower.get(`${vendorKey}__generic`)
    const pinRecord = genericId === undefined ? undefined : pinRecordById.get(genericId)
    const official = genericId === undefined ? undefined : officialNodeById.get(genericId)
    if (genericId === undefined || !pinRecord || !official) continue

    let methodDoc = jsdoc(member, source, code)
    if (!methodDoc) {
      const overload = serverClass.members.find(
        (candidate) =>
          ts.isMethodDeclaration(candidate) &&
          !candidate.body &&
          propertyName(candidate.name) === methodName
      )
      if (overload) methodDoc = jsdoc(overload, source, code)
    }
    let methodDocText = methodDoc?.text
    const inputIndexes = visiblePinIndexes(pinRecord.inputs, argumentCount)
    if (inputIndexes && member.parameters.length >= argumentCount) {
      member.parameters.slice(0, argumentCount).forEach((parameter, offset) => {
        if (!ts.isIdentifier(parameter.name)) return
        const pinIndex = inputIndexes[offset]
        if (INTERNAL_PIN_LABELS.has(`${genericId}:input:${pinIndex}`)) return
        const officialName = official.pins.find(
          (pin) => pin.kind === 'input' && pin.index === pinIndex
        )?.nameEn
        if (
          !officialName ||
          normalizedIdentifier(parameter.name.text) === normalizedIdentifier(officialName)
        ) {
          return
        }
        differences.push({
          domain: 'node',
          genericId,
          methodName,
          direction: 'input',
          pinIndex,
          apiName: parameter.name.text,
          officialName
        })
        if (!methodDocText) throw new Error(`${methodName}: missing method JSDoc`)
        methodDocText = insertTagOfficialName(
          methodDocText,
          '@param',
          officialName,
          parameter.name.text
        )
      })
    }

    if (member.type && ts.isTypeLiteralNode(member.type)) {
      const properties = member.type.members.filter(ts.isPropertySignature)
      const outputIndexes = visiblePinIndexes(pinRecord.outputs, properties.length)
      if (outputIndexes) {
        properties.forEach((property, offset) => {
          const apiName = propertyName(property.name)
          const officialName = official.pins.find(
            (pin) => pin.kind === 'output' && pin.index === outputIndexes[offset]
          )?.nameEn
          if (
            !apiName ||
            !officialName ||
            normalizedIdentifier(apiName) === normalizedIdentifier(officialName)
          ) {
            return
          }
          differences.push({
            domain: 'node',
            genericId,
            methodName,
            direction: 'output',
            pinIndex: outputIndexes[offset],
            apiName,
            officialName
          })
          const propertyDoc = jsdoc(property, source, code)
          if (!propertyDoc) {
            throw new Error(`${methodName}.${apiName}: missing return property JSDoc`)
          }
          edits.push({
            ...propertyDoc,
            text: insertPropertyOfficialName(propertyDoc.text, officialName)
          })
        })
      }
    } else if (pinRecord.outputs.length === 1) {
      const officialName = official.pins.find(
        (pin) => pin.kind === 'output' && pin.index === 0
      )?.nameEn
      const apiName = outputLabels.get(0)
      if (
        apiName &&
        officialName &&
        normalizedIdentifier(apiName) !== normalizedIdentifier(officialName)
      ) {
        differences.push({
          domain: 'node',
          genericId,
          methodName,
          direction: 'output',
          pinIndex: 0,
          apiName,
          officialName
        })
        if (!methodDocText) throw new Error(`${methodName}: missing method JSDoc`)
        methodDocText = insertTagOfficialName(methodDocText, '@returns', officialName)
      }
    }

    if (methodDoc && methodDocText && methodDocText !== methodDoc.text) {
      edits.push({ ...methodDoc, text: methodDocText })
    }
  }
  return { code: applyEdits(code, edits), differences }
}

function transformServerEvents(code: string) {
  const source = ts.createSourceFile(EVENTS_PATH, code, ts.ScriptTarget.Latest, true)
  const payloads = source.statements.find(
    (statement): statement is ts.TypeAliasDeclaration =>
      ts.isTypeAliasDeclaration(statement) && statement.name.text === 'ServerEventPayloads'
  )
  if (!payloads || !ts.isTypeLiteralNode(payloads.type)) {
    throw new Error('ServerEventPayloads not found')
  }

  const edits: Edit[] = []
  const differences: PinDifference[] = []
  for (const event of payloads.type.members) {
    if (!ts.isPropertySignature(event) || !event.type || !ts.isTypeLiteralNode(event.type)) {
      continue
    }
    const eventName = propertyName(event.name)
    if (!eventName) continue
    const genericId = resolveGenericId(eventName)
    const pinRecord = genericId === undefined ? undefined : pinRecordById.get(genericId)
    const official = genericId === undefined ? undefined : officialNodeById.get(genericId)
    if (genericId === undefined || !pinRecord || !official) continue

    const properties = event.type.members.filter(ts.isPropertySignature)
    const outputIndexes = visiblePinIndexes(pinRecord.outputs, properties.length)
    if (!outputIndexes) continue
    properties.forEach((property, index) => {
      if (!ts.isPropertySignature(property)) return
      const apiName = propertyName(property.name)
      const officialName = official.pins.find(
        (pin) => pin.kind === 'output' && pin.index === outputIndexes[index]
      )?.nameEn
      if (
        !apiName ||
        !officialName ||
        normalizedIdentifier(apiName) === normalizedIdentifier(officialName)
      ) {
        return
      }
      differences.push({
        domain: 'event',
        genericId,
        methodName: eventName,
        direction: 'output',
        pinIndex: outputIndexes[index],
        apiName,
        officialName
      })
      const propertyDoc = jsdoc(property, source, code)
      if (!propertyDoc) {
        throw new Error(`${eventName}.${apiName}: missing event property JSDoc`)
      }
      edits.push({
        ...propertyDoc,
        text: insertPropertyOfficialName(propertyDoc.text, officialName)
      })
    })
  }
  return { code: applyEdits(code, edits), differences }
}

function main() {
  const nodes = fs.readFileSync(NODES_PATH, 'utf8')
  const events = fs.readFileSync(EVENTS_PATH, 'utf8')
  const transformedNodes = transformServerNodes(nodes)
  const transformedEvents = transformServerEvents(events)
  const changed = transformedNodes.code !== nodes || transformedEvents.code !== events

  if (process.argv.includes('--check')) {
    if (changed) {
      throw new Error(
        'server pin comments are stale; run npm run gen:server:pin-comments and commit the result'
      )
    }
  } else {
    fs.writeFileSync(NODES_PATH, transformedNodes.code)
    fs.writeFileSync(EVENTS_PATH, transformedEvents.code)
  }

  console.log(
    `[ok] checked ${transformedNodes.differences.length} server node and ` +
      `${transformedEvents.differences.length} server event compatibility pin names`
  )
  if (process.argv.includes('--verbose')) {
    for (const difference of [...transformedNodes.differences, ...transformedEvents.differences]) {
      console.log(
        `[${difference.domain} ${difference.genericId}] ${difference.methodName} ` +
          `${difference.direction}#${difference.pinIndex}: ` +
          `${difference.apiName} -> ${difference.officialName}`
      )
    }
  }
}

main()
