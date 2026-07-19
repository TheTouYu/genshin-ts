import fs from 'node:fs'
import path from 'node:path'

import ts from 'typescript'

import { ServerEventMetadata } from '../src/definitions/events.js'
import { assignTypeParamsFromCase, emitArgFromNodesTypeText } from './testgen/args_from_nodes.js'
import { buildGenericsMap, loadNodeGenerics } from './testgen/generics_data.js'
import { extractServerFMethods } from './testgen/methods.js'
import { loadEnumPicks } from './testgen/picks.js'
import { SERVER_ENUM_TYPES_WITHOUT_EQUALITY_NODE } from './testgen/server_enum_capabilities.js'
import { parseTypeSpec, type TypeSpec } from './testgen/typespec.js'
import { canResolveNodeType, readVendorNodeIdKeysLower } from './testgen/vendor_ids.js'

type ReturnValueSpec =
  | { kind: 'type'; spec: TypeSpec }
  | { kind: 'enum'; name: string }
  | { kind: 'generic' }
  | { kind: 'localVariable' }
  | { kind: 'customVariableSnapshot' }
  | { kind: 'unknown'; raw: string }

type ReturnInfo =
  | { kind: 'void' }
  | { kind: 'value'; spec: ReturnValueSpec }
  | { kind: 'object'; props: { name: string; spec: ReturnValueSpec }[] }

type NameCtx = { n: number }

function nextName(ctx: NameCtx, prefix: string): string {
  ctx.n += 1
  return `${prefix}${ctx.n}`
}

function trimTypeText(text: string): string {
  return text.trim().replace(/\s+/g, ' ')
}

function splitTopLevelComma(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let buf = ''
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!
    if (ch === '<') depth++
    if (ch === '>') depth--
    if (depth === 0 && ch === ',') {
      out.push(buf.trim())
      buf = ''
      continue
    }
    buf += ch
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

function runtimeStringToSpec(name: string): TypeSpec {
  const t = name.trim()
  if (t.endsWith('_list')) {
    const elem = parseTypeSpec(t.slice(0, -5))
    return { kind: 'list', elem }
  }
  return parseTypeSpec(t)
}

function resolveRuntimeReturnValueType(
  inner: string,
  assign: Map<string, TypeSpec>
): TypeSpec | null {
  const t = inner.trim()
  const mTemplate = /^`\$\{([^}]+)\}(_list)?`$/.exec(t)
  if (mTemplate) {
    const param = mTemplate[1]?.trim()
    const listSuffix = mTemplate[2] === '_list'
    if (param) {
      const spec = assign.get(param) ?? parseTypeSpec(param)
      if (listSuffix) {
        if (spec.kind === 'list') return spec
        return { kind: 'list', elem: spec }
      }
      return spec
    }
  }

  const mQuoted = /^'([^']+)'$/.exec(t) ?? /^"([^"]+)"$/.exec(t)
  if (mQuoted) return runtimeStringToSpec(mQuoted[1] ?? '')

  if (assign.has(t)) return assign.get(t)!

  return runtimeStringToSpec(t)
}

function parseDictTypeSpec(text: string, assign: Map<string, TypeSpec>): TypeSpec | null {
  const m = /^(ReadonlyDict|dict)\s*<([\s\S]+)>$/.exec(text)
  if (!m) return null
  const parts = splitTopLevelComma(m[2] ?? '')
  if (parts.length < 2) return null
  const k = parseTypeSpecFromReturnText(parts[0] ?? '', assign)
  const v = parseTypeSpecFromReturnText(parts[1] ?? '', assign)
  const key = k ?? parseTypeSpec('int')
  const value = v ?? parseTypeSpec('int')
  return { kind: 'dict', key, value }
}

function parseTypeSpecFromReturnText(text: string, assign: Map<string, TypeSpec>): TypeSpec | null {
  const t = trimTypeText(text)
  if (!t) return null

  if (t.endsWith('[]')) {
    const base = t.slice(0, -2).trim()
    const elem = parseTypeSpecFromReturnText(base, assign) ?? parseTypeSpec(base)
    return { kind: 'list', elem }
  }

  if (t === 'boolean') return { kind: 'primitive', name: 'bool' }
  if (t === 'bigint') return { kind: 'primitive', name: 'int' }
  if (t === 'number') return { kind: 'primitive', name: 'float' }
  if (t === 'string') return { kind: 'primitive', name: 'str' }

  if (t === 'vec3') return { kind: 'primitive', name: 'vec3' }
  if (t === 'guid') return { kind: 'primitive', name: 'guid' }
  if (t === 'entity') return { kind: 'primitive', name: 'entity' }
  if (t === 'configId') return { kind: 'primitive', name: 'configId' }
  if (t === 'prefabId') return { kind: 'primitive', name: 'prefabId' }
  if (t === 'faction') return { kind: 'primitive', name: 'faction' }

  const dict = parseDictTypeSpec(t, assign)
  if (dict) return dict

  const mReturnMap = /^RuntimeReturnValueTypeMap\s*\[\s*([^\]]+)\s*\]$/.exec(t)
  if (mReturnMap) {
    const inner = mReturnMap[1] ?? ''
    return resolveRuntimeReturnValueType(inner, assign)
  }

  return null
}

function parseReturnValueSpec(
  text: string,
  assign: Map<string, TypeSpec>,
  enumPick: Map<string, string>
): ReturnValueSpec {
  const t = trimTypeText(text)
  if (enumPick.has(t.replace(/\s+/g, ''))) {
    return { kind: 'enum', name: t.replace(/\s+/g, '') }
  }
  if (t === 'generic') return { kind: 'generic' }
  if (t === 'localVariable') return { kind: 'localVariable' }
  if (t === 'customVariableSnapshot') return { kind: 'customVariableSnapshot' }

  const spec = parseTypeSpecFromReturnText(t, assign)
  if (spec) return { kind: 'type', spec }

  return { kind: 'unknown', raw: t }
}

function loadReturnTypeNodes(nodesTsPath: string) {
  const text = fs.readFileSync(nodesTsPath, 'utf8')
  const sf = ts.createSourceFile(nodesTsPath, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS)
  const map = new Map<string, ts.TypeNode | undefined>()
  const overloads = new Map<string, ts.TypeNode | undefined>()

  const visit = (node: ts.Node) => {
    if (ts.isClassDeclaration(node) && node.name?.text === 'ServerExecutionFlowFunctions') {
      node.members.forEach((m) => {
        if (!ts.isMethodDeclaration(m)) return
        if (!m.name || !ts.isIdentifier(m.name)) return
        if (!m.body) {
          overloads.set(m.name.text, m.type)
          return
        }
        map.set(m.name.text, m.type ?? overloads.get(m.name.text))
      })
      return
    }
    ts.forEachChild(node, visit)
  }
  ts.forEachChild(sf, visit)
  return { sf, map }
}

function getReturnInfo(
  typeNode: ts.TypeNode | undefined,
  assign: Map<string, TypeSpec>,
  enumPick: Map<string, string>,
  sf: ts.SourceFile
): ReturnInfo {
  if (!typeNode) return { kind: 'void' }
  if (typeNode.kind === ts.SyntaxKind.VoidKeyword) return { kind: 'void' }

  if (ts.isTypeLiteralNode(typeNode)) {
    const props: { name: string; spec: ReturnValueSpec }[] = []
    for (const m of typeNode.members) {
      if (!ts.isPropertySignature(m) || !m.type || !m.name) continue
      const name = ts.isIdentifier(m.name) ? m.name.text : m.name.getText(sf)
      const spec = parseReturnValueSpec(m.type.getText(sf), assign, enumPick)
      props.push({ name, spec })
    }
    return { kind: 'object', props }
  }

  const spec = parseReturnValueSpec(typeNode.getText(sf), assign, enumPick)
  return { kind: 'value', spec }
}

function emitConsumeType(lines: string[], ctx: NameCtx, expr: string, spec: TypeSpec) {
  if (spec.kind === 'primitive') {
    if (spec.name === 'str') {
      lines.push(`  f.printString(${expr})`)
      return
    }
    if (spec.name === 'configId' || spec.name === 'prefabId') {
      const eq = nextName(ctx, 'eq')
      lines.push(`  const ${eq} = f.equal(${expr}, ${expr})`)
      emitConsumeType(lines, ctx, eq, { kind: 'primitive', name: 'bool' })
      return
    }
    const s = nextName(ctx, 's')
    lines.push(`  const ${s} = f.dataTypeConversion(${expr}, 'str')`)
    lines.push(`  f.printString(${s})`)
    return
  }

  if (spec.kind === 'list') {
    const len = nextName(ctx, 'len')
    lines.push(`  const ${len} = f.getListLength(${expr})`)
    const s = nextName(ctx, 's')
    lines.push(`  const ${s} = f.dataTypeConversion(${len}, 'str')`)
    lines.push(`  f.printString(${s})`)
    return
  }

  if (spec.kind === 'dict') {
    const len = nextName(ctx, 'len')
    lines.push(`  const ${len} = f.queryDictionarySLength(${expr})`)
    const s = nextName(ctx, 's')
    lines.push(`  const ${s} = f.dataTypeConversion(${len}, 'str')`)
    lines.push(`  f.printString(${s})`)
    return
  }

  if (spec.kind === 'enumConcrete') {
    const s = nextName(ctx, 's')
    lines.push(`  const ${s} = f.dataTypeConversion(${expr} as unknown as bigint, 'str')`)
    lines.push(`  f.printString(${s})`)
  }
}

function emitConsume(lines: string[], ctx: NameCtx, expr: string, spec: ReturnValueSpec) {
  if (spec.kind === 'type') {
    emitConsumeType(lines, ctx, expr, spec.spec)
    return
  }
  if (spec.kind === 'enum') {
    if (SERVER_ENUM_TYPES_WITHOUT_EQUALITY_NODE.has(spec.name)) {
      lines.push(`  // ${expr}: ${spec.name} has no Enumerations Equal concrete node`)
      return
    }
    const eq = nextName(ctx, 'enumEq')
    lines.push(`  const ${eq} = f.enumerationsEqual(${expr}, ${expr})`)
    emitConsumeType(lines, ctx, eq, { kind: 'primitive', name: 'bool' })
    return
  }
  if (spec.kind === 'generic') {
    const cast = nextName(ctx, 'gen')
    lines.push(`  const ${cast} = ${expr}.asType('int')`)
    emitConsumeType(lines, ctx, cast, { kind: 'primitive', name: 'int' })
    return
  }
  if (spec.kind === 'customVariableSnapshot') {
    const snap = nextName(ctx, 'snap')
    lines.push(`  const ${snap} = f.queryCustomVariableSnapshot(${expr}, "snapshot_var")`)
    const cast = nextName(ctx, 'snapVal')
    lines.push(`  const ${cast} = ${snap}.asType('int')`)
    emitConsumeType(lines, ctx, cast, { kind: 'primitive', name: 'int' })
    return
  }
  if (spec.kind === 'localVariable') {
    lines.push(`  f.setLocalVariable(${expr}, 1n)`)
    return
  }
  const s = nextName(ctx, 's')
  lines.push(`  const ${s} = f.dataTypeConversion(${expr} as unknown as bigint, 'str')`)
  lines.push(`  f.printString(${s})`)
}

function main() {
  const repoRoot = process.cwd()
  const nodesTsPath = path.join(repoRoot, 'src/definitions/nodes.ts')
  const enumTsPath = path.join(repoRoot, 'src/definitions/enum.ts')
  const outPath = path.join(repoRoot, 'tests/generated/final_all.ts')

  const enumPick = loadEnumPicks(enumTsPath)
  const vendorKeysLower = readVendorNodeIdKeysLower(repoRoot)
  const methods = extractServerFMethods(nodesTsPath)

  const generics = loadNodeGenerics(repoRoot)
  const genericsMap = buildGenericsMap(generics)

  const { sf, map: returnTypeNodes } = loadReturnTypeNodes(nodesTsPath)

  const skipped: { name: string; nodeType?: string; why: string }[] = []
  const included: string[] = []

  const lines: string[] = []
  lines.push(`import { g } from 'genshin-ts/runtime/core'`)
  lines.push(`import { configId, faction, guid, prefabId } from 'genshin-ts/runtime/value'`)
  lines.push(`import * as E from 'genshin-ts/definitions/enum'`)
  lines.push(``)
  lines.push(`// AUTO-GENERATED: final all nodes/events`)
  lines.push(`// Run: npx tsx scripts/generate-final-gia-test.ts`)
  lines.push(``)

  const graphId = 1073741866

  const nodeLines: string[] = []
  const ctx: NameCtx = { n: 0 }

  const returnMethod = methods.find((m) => m.name === 'return')
  const otherMethods = methods.filter((m) => m.name !== 'return')

  for (const m of otherMethods) {
    if (m.nodeType && !canResolveNodeType(m.nodeType, vendorKeysLower)) {
      skipped.push({ name: m.name, nodeType: m.nodeType, why: 'missing in vendor NODE_ID' })
      continue
    }
    if (m.name === 'modifyStructure') {
      skipped.push({ name: m.name, nodeType: m.nodeType, why: 'modifyStructure not supported yet' })
      continue
    }
    if (m.name === 'queryCustomVariableSnapshot') {
      skipped.push({ name: m.name, nodeType: m.nodeType, why: 'handled in event usage' })
      continue
    }

    const ginfo = genericsMap.get(m.name)
    const typeCase = ginfo?.availableTypes?.[0]
    const assign = typeCase ? assignTypeParamsFromCase(m, typeCase) : new Map()

    const args: string[] = []
    const pre: string[] = []

    for (let i = 0; i < m.params.length; i++) {
      const p = m.params[i]!
      if (p.typeText.trim() === 'LocalVariableValue') {
        const lv = nextName(ctx, 'lv')
        pre.push(`  const ${lv} = f.getLocalVariable(1n)`)
        emitConsumeType(pre, ctx, `${lv}.value`, { kind: 'primitive', name: 'int' })
        args.push(`${lv}.localVariable`)
        continue
      }

      if (p.rest) {
        const baseTypeText = p.typeText.trim().replace(/\[\]$/, '').trim()
        args.push(
          emitArgFromNodesTypeText('literal', m, i, baseTypeText, ctx, enumPick, assign),
          emitArgFromNodesTypeText('literal', m, i, baseTypeText, ctx, enumPick, assign),
          emitArgFromNodesTypeText('literal', m, i, baseTypeText, ctx, enumPick, assign)
        )
        continue
      }

      args.push(emitArgFromNodesTypeText('literal', m, i, p.typeText, ctx, enumPick, assign))
    }

    if (pre.length) nodeLines.push(...pre)

    if (typeCase) nodeLines.push(`  // ${m.name} :: ${typeCase}`)
    const callExpr = `f.${m.name}(${args.join(', ')})`

    const retInfo = getReturnInfo(returnTypeNodes.get(m.name), assign, enumPick, sf)
    if (retInfo.kind === 'void') {
      nodeLines.push(`  ${callExpr}`)
    } else if (retInfo.kind === 'value') {
      const retName = nextName(ctx, 'ret')
      nodeLines.push(`  const ${retName} = ${callExpr}`)
      emitConsume(nodeLines, ctx, retName, retInfo.spec)
    } else {
      const retName = nextName(ctx, 'ret')
      nodeLines.push(`  const ${retName} = ${callExpr}`)
      const hasLocalVar = retInfo.props.find((p) => p.name === 'localVariable')
      const hasValue = retInfo.props.find((p) => p.name === 'value')
      if (hasLocalVar && hasValue) {
        nodeLines.push(`  f.setLocalVariable(${retName}.localVariable, ${retName}.value)`)
        for (const p of retInfo.props) {
          if (p.name === 'localVariable' || p.name === 'value') continue
          emitConsume(nodeLines, ctx, `${retName}.${p.name}`, p.spec)
        }
      } else {
        for (const p of retInfo.props) {
          emitConsume(nodeLines, ctx, `${retName}.${p.name}`, p.spec)
        }
      }
    }

    included.push(m.name)
  }

  if (returnMethod) {
    nodeLines.push(`  f.return()`)
  }

  lines.push(`g.server({ id: ${graphId} }).on('whenEntityIsCreated', (evt, f) => {`)
  lines.push(`  const evtS1 = f.dataTypeConversion(evt.eventSourceEntity, 'str')`)
  lines.push(`  f.printString(evtS1)`)
  lines.push(`  const evtS2 = f.dataTypeConversion(evt.eventSourceGuid, 'str')`)
  lines.push(`  f.printString(evtS2)`)
  lines.push(...nodeLines)
  lines.push(`})`)
  lines.push(``)

  const events = Object.keys(ServerEventMetadata).sort()
  for (const e of events) {
    const params = ServerEventMetadata[e as keyof typeof ServerEventMetadata] ?? []
    const eventCtx: NameCtx = { n: 0 }
    const eventLines: string[] = []

    const header =
      e === 'monitorSignal'
        ? `g.server({ id: ${graphId} }).onSignal("monitor_signal", (evt, f) => {`
        : `g.server({ id: ${graphId} }).on(${JSON.stringify(e)}, (evt, f) => {`
    eventLines.push(header)

    for (const p of params) {
      const typeName = p.typeName
      const isArray = p.isArray
      const clean = typeName.trim()

      let spec: ReturnValueSpec
      if (enumPick.has(clean)) {
        spec = { kind: 'enum', name: clean }
      } else if (clean === 'generic') {
        spec = { kind: 'generic' }
      } else if (clean === 'customVariableSnapshot') {
        spec = { kind: 'customVariableSnapshot' }
      } else {
        const prim = parseTypeSpec(clean)
        spec = { kind: 'type', spec: prim }
      }

      if (isArray) {
        if (spec.kind === 'type') {
          spec = { kind: 'type', spec: { kind: 'list', elem: spec.spec } }
        } else {
          spec = { kind: 'unknown', raw: `${clean}[]` }
        }
      }

      emitConsume(eventLines, eventCtx, `evt.${p.name}`, spec)
    }

    eventLines.push(`})`)
    lines.push(...eventLines)
    lines.push(``)
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')

  process.stdout.write(`[ok] wrote ${path.relative(repoRoot, outPath)}\n`)
  process.stdout.write(`[ok] included methods: ${included.length}/${methods.length}\n`)
  process.stdout.write(`[warn] skipped methods: ${skipped.length}\n`)
}

main()
