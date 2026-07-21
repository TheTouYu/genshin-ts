import fs from 'node:fs'

import ts from 'typescript'

export type EnumPickMap = Map<string, string>

function readText(p: string): string {
  return fs.readFileSync(p, 'utf8')
}

function createSourceFile(fileName: string, text: string): ts.SourceFile {
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS)
}

export function loadEnumPicks(enumTsPath: string): EnumPickMap {
  const text = readText(enumTsPath)
  const sf = createSourceFile(enumTsPath, text)
  const map: EnumPickMap = new Map()

  const visit = (node: ts.Node) => {
    if (ts.isClassDeclaration(node) && node.name) {
      const className = node.name.text
      const statics = node.members
        .filter(
          (m): m is ts.PropertyDeclaration =>
            ts.isPropertyDeclaration(m) &&
            m.modifiers?.some((x) => x.kind === ts.SyntaxKind.StaticKeyword) === true &&
            ts.isIdentifier(m.name)
        )
        .map((m) => (m.name as ts.Identifier).text)
      if (statics[0]) map.set(className, statics[0])
    }
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(sf, visit)

  for (const statement of sf.statements) {
    if (
      !ts.isExportDeclaration(statement) ||
      statement.moduleSpecifier ||
      !statement.exportClause ||
      !ts.isNamedExports(statement.exportClause)
    ) {
      continue
    }
    for (const element of statement.exportClause.elements) {
      const target = element.propertyName?.text
      if (!target) continue
      const pick = map.get(target)
      if (pick) map.set(element.name.text, pick)
    }
  }

  return map
}
