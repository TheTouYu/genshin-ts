import fs from 'node:fs'

import ts from 'typescript'

type OfficialNodeName = {
  genericId: number
  nameZh?: string
  nameEn?: string
}

type OfficialNames = {
  nodes: OfficialNodeName[]
}

type TextEdit = {
  start: number
  end: number
  text: string
}

const NAMES_PATH = 'resources/mihoyo_editor_names.json'
const SERVER_RECORDS_PATH =
  'src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.ts'
const CLIENT_METADATA_JSON_PATH = 'resources/client_node_metadata.json'
const CLIENT_METADATA_PATH =
  'src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.ts'

function arrayInitializer(sourceFile: ts.SourceFile, variableName: string) {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== variableName) continue
      let initializer = declaration.initializer
      while (
        initializer &&
        (ts.isAsExpression(initializer) ||
          ts.isSatisfiesExpression(initializer) ||
          ts.isParenthesizedExpression(initializer))
      ) {
        initializer = initializer.expression
      }
      if (!initializer || !ts.isArrayLiteralExpression(initializer)) {
        throw new Error(`[error] ${variableName} is not initialized with an array`)
      }
      return initializer
    }
  }
  throw new Error(`[error] cannot find ${variableName}`)
}

function objectProperty(object: ts.ObjectLiteralExpression, name: string) {
  return object.properties.find(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) &&
      ((ts.isIdentifier(property.name) && property.name.text === name) ||
        (ts.isStringLiteral(property.name) && property.name.text === name))
  )
}

function numberProperty(object: ts.ObjectLiteralExpression, name: string) {
  const property = objectProperty(object, name)
  if (!property || !ts.isNumericLiteral(property.initializer)) return undefined
  return Number(property.initializer.text)
}

function stringProperty(object: ts.ObjectLiteralExpression, name: string) {
  const property = objectProperty(object, name)
  if (!property || !ts.isStringLiteral(property.initializer)) return undefined
  return property.initializer
}

function collectNameEdits(
  filePath: string,
  variableName: string,
  idProperty: string,
  nameProperty: string,
  officialById: Map<number, OfficialNodeName>,
  language: 'nameZh' | 'nameEn'
) {
  const source = fs.readFileSync(filePath, 'utf8')
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true)
  const array = arrayInitializer(sourceFile, variableName)
  const edits: TextEdit[] = []
  const differences: Array<{ id: number; current: string; official: string }> = []

  for (const element of array.elements) {
    if (!ts.isObjectLiteralExpression(element)) continue
    const id = numberProperty(element, idProperty)
    const currentNode = stringProperty(element, nameProperty)
    if (id === undefined || !currentNode) continue
    const official = officialById.get(id)?.[language]
    if (official === undefined || currentNode.text === official) continue
    differences.push({ id, current: currentNode.text, official })
    edits.push({
      start: currentNode.getStart(sourceFile),
      end: currentNode.getEnd(),
      text: JSON.stringify(official)
    })
  }

  return { source, edits, differences }
}

function applyEdits(source: string, edits: TextEdit[]) {
  let output = source
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    output = `${output.slice(0, edit.start)}${edit.text}${output.slice(edit.end)}`
  }
  return output
}

function synchronizeClientMetadataJson(
  officialById: Map<number, OfficialNodeName>,
  write: boolean
) {
  const source = fs.readFileSync(CLIENT_METADATA_JSON_PATH, 'utf8')
  const sourceFile = ts.parseJsonText(CLIENT_METADATA_JSON_PATH, source)
  const statement = sourceFile.statements[0]
  if (
    !statement ||
    !ts.isExpressionStatement(statement) ||
    !ts.isArrayLiteralExpression(statement.expression)
  ) {
    throw new Error(`[error] ${CLIENT_METADATA_JSON_PATH} is not an array`)
  }
  const edits: TextEdit[] = []
  const differences: Array<{ id: number; current: string; official: string }> = []
  for (const element of statement.expression.elements) {
    if (!ts.isObjectLiteralExpression(element)) continue
    const id = numberProperty(element, 'genericId')
    const currentNode = stringProperty(element, 'displayName')
    if (id === undefined || !currentNode) continue
    const official = officialById.get(id)?.nameZh
    if (official === undefined || currentNode.text === official) continue
    differences.push({ id, current: currentNode.text, official })
    edits.push({
      start: currentNode.getStart(sourceFile),
      end: currentNode.getEnd(),
      text: JSON.stringify(official)
    })
  }
  if (write && edits.length) {
    fs.writeFileSync(CLIENT_METADATA_JSON_PATH, applyEdits(source, edits))
  }
  return differences
}

function main() {
  const write = process.argv.includes('--write')
  const names = JSON.parse(fs.readFileSync(NAMES_PATH, 'utf8')) as OfficialNames
  const officialById = new Map(names.nodes.map((node) => [node.genericId, node]))

  const server = collectNameEdits(
    SERVER_RECORDS_PATH,
    'NODE_PIN_RECORDS',
    'id',
    'name',
    officialById,
    'nameEn'
  )
  const client = collectNameEdits(
    CLIENT_METADATA_PATH,
    'CLIENT_NODE_METADATA',
    'genericId',
    'displayName',
    officialById,
    'nameZh'
  )
  const clientJsonDifferences = synchronizeClientMetadataJson(officialById, write)

  console.log(
    `[check] editor display-name differences: ` +
      `server=${server.differences.length}, client JSON=${clientJsonDifferences.length}, ` +
      `client TS=${client.differences.length}`
  )
  for (const difference of server.differences) {
    console.log(
      `[server ${difference.id}] ${JSON.stringify(difference.current)} -> ` +
        JSON.stringify(difference.official)
    )
  }
  for (const difference of client.differences) {
    console.log(
      `[client ${difference.id}] ${JSON.stringify(difference.current)} -> ` +
        JSON.stringify(difference.official)
    )
  }
  for (const difference of clientJsonDifferences) {
    console.log(
      `[client JSON ${difference.id}] ${JSON.stringify(difference.current)} -> ` +
        JSON.stringify(difference.official)
    )
  }

  if (write) {
    fs.writeFileSync(SERVER_RECORDS_PATH, applyEdits(server.source, server.edits))
    fs.writeFileSync(CLIENT_METADATA_PATH, applyEdits(client.source, client.edits))
    console.log(
      `[ok] synchronized ` +
        `${server.edits.length + client.edits.length + clientJsonDifferences.length} display names`
    )
    return
  }
  if (server.edits.length || client.edits.length || clientJsonDifferences.length) {
    throw new Error('[error] editor display names are out of date; rerun with --write')
  }
  console.log('[ok] editor display names match the extracted CHS/EN TextMaps')
}

main()
