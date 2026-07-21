import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import ts from 'typescript'

import {
  classifyExpressionSemantics,
  localValueTypeOf
} from '../src/compiler/ts_to_gs_transform/expression_semantics.js'
import { transformToGs } from '../src/compiler/ts_to_gs_transform/index.js'
import type { Env } from '../src/compiler/ts_to_gs_transform/types.js'

const source = `
import { g } from 'genshin-ts/runtime/core'
import { float, int, vec3 } from 'genshin-ts/runtime/value'

const multi = g.defineComposite('stage1 semantics multi', {
  inputs: { value: { type: 'float' } },
  outputs: { x: { type: 'float' }, position: { type: 'vec3' } },
  build(args, f) {
    return { x: args.value, position: f.create3dVector(args.value, 0, 0) }
  }
})

const scalar = new float(1)
const integer = new int(1)
const vector = new vec3(1, 2, 3)
const values: float[] = [scalar]
const complete = g.server({ name: 'stage1-semantics', id: 1073742193 }).on(
  'whenEntityIsCreated',
  (_evt, f) => {
    const result = f.callComposite(multi, { value: scalar })
    const output = f.callComposite(multi, { value: scalar }).x
    const timer = setTimeout(() => {}, 1000)
    const object = { x: scalar }
    f.log(result.x)
    f.log(result.position)
    f.log(output)
    f.log(output)
    clearTimeout(timer)
    f.log(object.x)
  }
)
`

function makeProgram(text: string) {
  const dir = fs.mkdtempSync(path.resolve('.tmp-stage1-semantics-'))
  const fileName = path.join(dir, 'fixture.ts')
  fs.writeFileSync(fileName, text)
  const config = ts.readConfigFile(path.resolve('tsconfig.json'), ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.resolve('.'))
  const program = ts.createProgram({ rootNames: [fileName], options: parsed.options })
  const file = program.getSourceFile(fileName)
  assert(file)
  return { dir, file, program }
}

function variableInitializers(file: ts.SourceFile): Map<string, ts.Expression> {
  const out = new Map<string, ts.Expression>()
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      out.set(node.name.text, node.initializer)
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return out
}

function classifyFixture() {
  const fixture = makeProgram(source)
  try {
    const env = {
      gstsIdent: 'gsts',
      config: { compileRoot: '.', entries: [], outDir: 'dist-test' },
      file: fixture.file,
      checker: fixture.program.getTypeChecker(),
      loopMax: 100,
      tempCounter: 0,
      timerCounterRef: { value: 0 },
      features: {
        whileCondition: true,
        doWhile: true,
        continue: false,
        switch: false,
        destructuring: false,
        ternary: false,
        nullishCoalesce: false
      }
    } satisfies Env
    const vars = variableInitializers(fixture.file)
    const semantics = (name: string) => {
      const expr = vars.get(name)
      assert(expr, `missing fixture expression ${name}`)
      return classifyExpressionSemantics(env, expr)
    }

    assert.deepEqual(semantics('scalar'), { kind: 'runtime-value', valueType: 'float' })
    assert.deepEqual(semantics('integer'), { kind: 'runtime-value', valueType: 'int' })
    assert.deepEqual(semantics('vector'), { kind: 'runtime-value', valueType: 'vec3' })
    assert.equal(localValueTypeOf(semantics('values')), 'float_list')

    const result = semantics('result')
    assert.equal(result.kind, 'composite-result')
    if (result.kind === 'composite-result') {
      assert.deepEqual([...result.outputs], [
        ['x', 'float'],
        ['position', 'vec3']
      ])
    }
    assert.deepEqual(semantics('output'), { kind: 'runtime-value', valueType: 'float' })
    assert.equal(semantics('timer').kind, 'timer-handle')
    assert.equal(semantics('object').kind, 'unsupported')
  } finally {
    fs.rmSync(fixture.dir, { recursive: true, force: true })
  }
}

function transformFixture(text: string): string {
  const fixture = makeProgram(text)
  try {
    const output = transformToGs(fixture.file, {
      checker: fixture.program.getTypeChecker(),
      config: { compileRoot: '.', entries: [], outDir: 'dist-test' },
      timerCounterRef: { value: 0 }
    })
    return ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(output)
  } finally {
    fs.rmSync(fixture.dir, { recursive: true, force: true })
  }
}

function assertStage1Output() {
  const output = transformFixture(source)
  assert.match(output, /const result = f\.callComposite\(multi/)
  assert.doesNotMatch(output, /initLocalVariable\(['"]entity['"]\)/)
  assert.doesNotMatch(output, /setLocalVariable\(result\.localVariable/)
  assert.match(output, /initLocalVariable\(['"]float['"]\)/)
}

function assertFailure(text: string, expected: RegExp) {
  assert.throws(() => transformFixture(text), expected)
}

function assertNegativeDiagnostics() {
  assertFailure(
    source.replace(
      'const result = f.callComposite(multi, { value: scalar })',
      `let result = f.callComposite(multi, { value: scalar })
    if (scalar > 0) result = f.callComposite(multi, { value: new float(2) })`
    ),
    /cannot store a complete composite result in LocalVariable; select a named output such as result\.x/
  )

  assertFailure(
    source.replace(
      'const object = { x: scalar }',
      `let object = { x: scalar }
    if (scalar > 0) object = { x: new float(2) }`
    ),
    /cannot store value of type .* in LocalVariable/
  )

  assertFailure(
    source.replace(
      'const output = f.callComposite(multi, { value: scalar }).x',
      `let output = f.callComposite(multi, { value: scalar }).x
    if (scalar > 0) output = f.callComposite(multi, { value: scalar }).position`
    ),
    /LocalVariable type mismatch: declared float, assigned vec3/
  )
}

function assertTimerCompositeOutputContainerPreserved() {
  const timerSource = `${source}

g.server({ name: 'stage1-timer-composite-capture', id: 1073742194 }).on(
  'whenEntityIsCreated',
  (_evt, f) => {
    setInterval((_timerEvt, timerF) => {
      const result = timerF.callComposite(multi, { value: scalar })
      timerF.log(result.x)
      timerF.log(result.position)
      timerF.log(result.x)
    }, 1000)
  }
)
`
  const output = transformFixture(timerSource)
  assert.match(output, /const result = timerF\.callComposite\(multi/)
  assert.doesNotMatch(output, /initLocalVariable\(['"]entity['"]\)/)
  assert.doesNotMatch(output, /setLocalVariable\(result\.localVariable/)
}

classifyFixture()
assertStage1Output()
assertNegativeDiagnostics()
assertTimerCompositeOutputContainerPreserved()
console.log('stage1 expression semantics tests passed')
