import path from 'node:path'

import parser from '@typescript-eslint/parser'
import { RuleTester } from 'eslint'

import builtinMathSupport from '../../src/eslint/rules/builtin-math-support.js'
import clientFilterReturn from '../../src/eslint/rules/client-filter-return.js'
import clientGraphScopedF from '../../src/eslint/rules/client-graph-scoped-f.js'
import clientScopedGlobals from '../../src/eslint/rules/client-scoped-globals.js'
import noJson from '../../src/eslint/rules/no-json.js'

const filename = path.join(process.cwd(), 'tests/eslint/client-graph-rules.test.ts')
const ruleTester = new RuleTester({
  languageOptions: {
    parser,
    parserOptions: {
      project: './tsconfig.json',
      tsconfigRootDir: process.cwd(),
      ecmaVersion: 2022,
      sourceType: 'module'
    }
  }
})

const importG = `import { g } from 'genshin-ts/runtime/core'`

ruleTester.run('client-scoped-globals', clientScopedGlobals, {
  valid: [
    {
      filename,
      code: `${importG}
g.characterSkill().on('start', (_evt, _f) => {})
g.characterControlSkill().on('start', (_evt, _f) => {})
g.creationSkill().on('start', (_evt, _f) => {})
g.creationStatus().on('start', (_evt, _f) => {})
g.creationStatusDecision().on('start', (_evt, _f) => {})
g.boolFilter().on('start', (_evt, _f) => true)
g.intFilter().on('start', (_evt, _f) => 0n)`
    },
    {
      filename,
      code: `${importG}
const graph = g.characterSkill({ mode: 'classic' })
graph.on('start', (_evt, _f) => { self })`
    }
  ],
  invalid: [
    {
      filename,
      code: `${importG}
g.characterSkill().on('start', (_evt, _f) => { setTimeout(() => {}, 1) })`,
      errors: [{ message: /setTimeout is not available in character_skill beyond mode/ }]
    },
    {
      filename,
      code: `${importG}
const options = { mode: 'classic' } as const
const graph = g.characterSkill(options)
graph.on('start', (_evt, _f) => { setTimeout(() => {}, 1) })`,
      errors: [{ message: /setTimeout is not available in character_skill classic mode/ }]
    }
  ]
})

ruleTester.run('client-graph-scoped-f', clientGraphScopedF, {
  valid: [
    {
      filename,
      code: `${importG}
g.characterSkill().on('start', (_evt, _f) => {
  gsts.fCharacterSkill.printString('ok')
  globalThis.gsts.fCharacterSkill.printString('ok')
})`
    }
  ],
  invalid: [
    {
      filename,
      code: `${importG}
g.characterSkill().on('start', (_evt, _f) => {
  gsts.f.printString('bad')
  gsts.fServer.printString('bad')
})`,
      errors: [
        { message: /gsts\.f is a server namespace/ },
        { message: /gsts\.fServer is a server namespace/ }
      ]
    },
    {
      filename,
      code: `${importG}
g.characterSkill().on('start', (_evt, _f) => {
  gsts.fBoolFilter.printString('bad')
})`,
      errors: [{ message: /belongs to bool_filter/ }]
    },
    {
      filename,
      code: `${importG}
gsts.fCharacterSkill.printString('bad')`,
      errors: [{ message: /only available inside a matching character_skill/ }]
    }
  ]
})

ruleTester.run('builtin-math-support client', builtinMathSupport, {
  valid: [
    {
      filename,
      code: `${importG}
g.creationSkill().on('start', (_evt, _f) => {
  const values = [
    Math.abs(-1), Math.sin(1), Math.cos(1), Math.tan(1),
    Math.asin(1), Math.acos(1), Math.atan(1), Math.min(1, 2), Math.max(1, 2)
  ]
})`
    }
  ],
  invalid: [
    {
      filename,
      code: `${importG}
g.creationSkill().on('start', (_evt, _f) => { Math.sqrt(4) })`,
      errors: [{ message: /Math\.sqrt is not supported.*available methods: Math\.abs/ }]
    }
  ]
})

ruleTester.run('client-filter-return', clientFilterReturn, {
  valid: [
    {
      filename,
      code: `${importG}
g.boolFilter().on('start', (_evt, _f) => true)
g.intFilter().on('start', (_evt, _f) => 1n)`
    },
    {
      filename,
      code: `${importG}
g.boolFilter().on('start', (_evt, _f) => {
  if (true) return true
  return false
})`
    }
  ],
  invalid: [
    {
      filename,
      code: `${importG}
g.boolFilter().on('start', (_evt, _f) => {
  if (true) return true
})`,
      errors: [{ message: /All execution paths.*must return/ }]
    },
    {
      filename,
      code: `${importG}
g.boolFilter().on('start', (_evt, _f) => 'bad')`,
      errors: [{ message: /must return a boolean\/bool compatible value/ }]
    },
    {
      filename,
      code: `${importG}
g.intFilter().on('start', (_evt, _f) => false)`,
      errors: [{ message: /must return a bigint\/number\/int compatible value/ }]
    }
  ]
})

ruleTester.run('no-json client default scope', noJson, {
  valid: [
    {
      filename,
      code: `${importG}
JSON.stringify({ ok: true })
g.creationStatus().on('start', (_evt, _f) => {})`
    },
    {
      filename,
      options: [{ scope: 'server' }],
      code: `${importG}
g.creationStatus().on('start', (_evt, _f) => { JSON.stringify({ ok: true }) })`
    }
  ],
  invalid: [
    {
      filename,
      code: `${importG}
g.creationStatus().on('start', (_evt, _f) => { JSON.stringify({ ok: true }) })`,
      errors: [{ message: /Compiler does not support this/ }]
    },
    {
      filename,
      code: `${importG}
g.server().on('update', (_evt, _f) => { JSON.stringify({ ok: true }) })`,
      errors: [{ message: /Compiler does not support this/ }]
    }
  ]
})
