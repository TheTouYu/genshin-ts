import path from 'node:path'

import parser from '@typescript-eslint/parser'
import { RuleTester } from 'eslint'

import builtinMathSupport from '../../src/eslint/rules/builtin-math-support.js'
import builtinWrapperArity from '../../src/eslint/rules/builtin-wrapper-arity.js'
import clientFilterReturn from '../../src/eslint/rules/client-filter-return.js'
import clientGraphScopedF from '../../src/eslint/rules/client-graph-scoped-f.js'
import clientLocalVariableSupport from '../../src/eslint/rules/client-local-variable-support.js'
import clientScopedGlobals from '../../src/eslint/rules/client-scoped-globals.js'
import gstsFunctionPrefix from '../../src/eslint/rules/gsts-function-prefix.js'
import noJson from '../../src/eslint/rules/no-json.js'
import switchRestrictions from '../../src/eslint/rules/switch-restrictions.js'

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

ruleTester.run('builtin-wrapper-arity client conversions', builtinWrapperArity, {
  valid: [
    {
      filename,
      code: `${importG}
g.creationStatus().on('start', () => {
  bool(1n); int(1); float(1n); str(1n)
})`
    }
  ],
  invalid: [
    {
      filename,
      code: `${importG}
g.creationStatus().on('start', () => {
  int(); float(1, 2)
})`,
      errors: [
        { message: /int\(\) requires exactly one argument/ },
        { message: /float\(\) requires exactly one argument/ }
      ]
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

ruleTester.run('client-local-variable-support', clientLocalVariableSupport, {
  valid: [
    {
      filename,
      code: `${importG}
g.characterSkill().on('start', (_evt, f) => {
  const ready = f.equal(1n, 1n)
  if (ready) f.absoluteValueOperation(-1n)
  if (ready) f.absoluteValueOperation(-2n)
  const result = ready ? 1n : 0n
  f.absoluteValueOperation(result)
})`
    },
    {
      filename,
      code: `${importG}
g.creationStatus().on('start', (_evt, f) => {
  const ready = true
  if (ready) f.absoluteValueOperation(-1n)
  if (ready) f.absoluteValueOperation(-2n)
})
g.boolFilter().on('start', (_evt, f) => f.equal(1n, 1n) ? true : false)`
    }
  ],
  invalid: [
    {
      filename,
      code: `${importG}
g.creationStatus().on('start', (_evt, f) => {
  const ready = f.equal(1n, 1n)
  if (ready) f.absoluteValueOperation(-1n)
  if (ready) f.absoluteValueOperation(-2n)
})`,
      errors: [{ message: /non-pure const "ready" is read 2 times.*local-variable snapshot/ }]
    },
    {
      filename,
      code: `${importG}
g.creationStatusDecision().on('start', (_evt, f) => {
  const result = f.equal(1n, 1n) ? 1n : 0n
  f.absoluteValueOperation(result)
})`,
      errors: [{ message: /conditional expressions require a temporary local variable/ }]
    },
    {
      filename,
      code: `${importG}
function gstsCreationStatusNeedsLocal() {
  const ready = gsts.fCreationStatus.equal(1n, 1n)
  if (ready) gsts.fCreationStatus.absoluteValueOperation(-1n)
  if (ready) gsts.fCreationStatus.absoluteValueOperation(-2n)
}`,
      errors: [{ message: /non-pure const "ready" is read 2 times.*local-variable snapshot/ }]
    }
  ]
})

ruleTester.run('switch-restrictions client capabilities', switchRestrictions, {
  valid: [
    {
      filename,
      code: `${importG}
g.creationStatus().on('start', (_evt, _f) => {
  switch (1n) {
    case 1n:
      break
    default:
      break
  }
})`
    }
  ],
  invalid: [
    {
      filename,
      code: `${importG}
g.boolFilter().on('start', (_evt, _f) => {
  switch (1n) {
    case 1n:
      return true
    default:
      return false
  }
})`,
      errors: [{ message: /Client bool_filter graphs do not support switch/ }]
    },
    {
      filename,
      code: `${importG}
g.intFilter().on('start', (_evt, _f) => {
  switch (1n) {
    case 1n:
      return 1n
    default:
      return 0n
  }
})`,
      errors: [{ message: /Client int_filter graphs do not support switch/ }]
    },
    {
      filename,
      code: `${importG}
g.characterSkill().on('start', (_evt, _f) => {
  switch (1n) {
    case 1n:
      break
    default:
      break
  }
})`,
      errors: [{ message: /Client character_skill graphs do not support switch/ }]
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

ruleTester.run('gsts-function-prefix', gstsFunctionPrefix, {
  valid: [
    {
      filename,
      code: `${importG}
function gstsServerShared() {}
function gstsClientCharacterSkillShared() {}
const gstsCharacterSkillShared = () => {}
function gstsClientCharacterControlSkillShared() {}
const gstsCharacterControlSkillShared = () => {}
function gstsClientCreationSkillShared() {}
const gstsCreationSkillShared = () => {}
function gstsClientCreationStatusShared() {}
const gstsCreationStatusShared = () => {}
function gstsClientCreationStatusDecisionShared() {}
const gstsCreationStatusDecisionShared = () => {}
function gstsClientBoolFilterShared() {}
const gstsBoolFilterShared = () => {}
function gstsClientIntFilterShared() {}
const gstsIntFilterShared = () => {}
gsts.fCharacterSkill`
    }
  ],
  invalid: [
    {
      filename,
      code: `
function gstsUnknownShared() {}
const gstsClientShared = () => {}`,
      errors: [
        {
          message:
            /available prefixes: gstsServer,[\s\S]*gstsClientCharacterSkill[\s\S]*gstsCharacterSkill/
        },
        { message: /Function name "gstsClientShared" uses an unknown gsts prefix/ }
      ]
    }
  ]
})
