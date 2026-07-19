// @ts-nocheck

import assert from 'node:assert/strict'

import { buildServerGraphRegistriesIRDocuments, g } from '../../dist/src/runtime/core.js'
import { bool, int, listLiteral, str } from '../../dist/src/runtime/value.js'

const child = g.defineComposite('multi-outflow warning child', {
  outflows: ['yes', 'no'],
  build(_args, f) {
    f.fork(
      () => {
        const yes = f.registerExecNode('print_string', [new str('yes')])
        f.outflow('yes', yes, 0)
      },
      () => {
        const no = f.registerExecNode('print_string', [new str('no')])
        f.outflow('no', no, 0)
      }
    )
    return {}
  }
})

const parent = g.defineComposite('multi-outflow warning parent', {
  outflows: ['done'],
  build(_args, f) {
    f.callComposite(child, {})
    const tail = f.registerExecNode('print_string', [new str('parent tail')])
    f.outflow('done', tail, 0)
    return {}
  }
})

g.server({ name: 'multi-outflow-formal-branch', id: 1073742322 }).on(
  'whenEntityIsCreated',
  (_event, f) => {
    f.doubleBranch(
      new bool(true),
      () => f.printString(new str('formal yes')),
      () => f.printString(new str('formal no'))
    )
    f.printString(new str('formal join'))
  }
)

g.server({ name: 'multi-outflow-multiple-branches', id: 1073742323 }).on(
  'whenEntityIsCreated',
  (_event, f) => {
    f.multipleBranches(new int(1), {
      1: () => f.printString(new str('case 1')),
      2: () => f.printString(new str('case 2')),
      3: () => f.printString(new str('case 3')),
      default: () => f.printString(new str('case default'))
    })
    f.printString(new str('multiple after'))
  }
)

g.server({ name: 'multi-outflow-loops', id: 1073742324 }).on('whenEntityIsCreated', (_event, f) => {
  f.finiteLoop(new int(0), new int(1), () => f.printString(new str('finite body')))
  f.printString(new str('finite complete'))
  f.listIterationLoop(new listLiteral('int', [1n]), () => f.printString(new str('list body')))
  f.printString(new str('list complete'))
})

const warnings: string[] = []
const originalWarn = console.warn
console.warn = (...args: unknown[]) => warnings.push(args.join(' '))
try {
  g.server({ name: 'multi-outflow-default-continuation-warning', id: 1073742321 }).on(
    'whenEntityIsCreated',
    (_event, f) => {
      f.callComposite(child, {})
      f.callComposite(parent, {})
      f.doubleBranch(
        new bool(true),
        () => f.printString(new str('main yes')),
        () => f.printString(new str('main no'))
      )
      f.printString(new str('main tail'))
    }
  )

  const docs = buildServerGraphRegistriesIRDocuments({
    defaultName: 'multi-outflow-default-continuation-warning'
  })
  const doc = docs.find((candidate) =>
    candidate.graph?.name?.includes('multi-outflow-default-continuation-warning')
  )
  assert.ok(doc)

  const formalDoc = docs.find((candidate) =>
    candidate.graph?.name?.includes('multi-outflow-formal-branch')
  )
  assert.ok(formalDoc)
  const formalAfter = formalDoc.nodes?.find(
    (node) => node.type === 'print_string' && node.args?.[0]?.value === 'formal join'
  )
  assert.ok(formalAfter)
  const formalAfterIncoming = (formalDoc.nodes ?? []).filter((node) =>
    node.next?.some(
      (connection) =>
        (typeof connection === 'number' ? connection : connection.node_id) === formalAfter.id
    )
  )
  assert.equal(formalAfterIncoming.length, 1)

  const switchDoc = docs.find((candidate) =>
    candidate.graph?.name?.includes('multi-outflow-multiple-branches')
  )
  assert.ok(switchDoc)
  const switchNode = switchDoc.nodes?.find((node) => node.type === 'multiple_branches')
  assert.ok(switchNode)
  const switchAfter = switchDoc.nodes?.find(
    (node) => node.type === 'print_string' && node.args?.[0]?.value === 'multiple after'
  )
  assert.ok(switchAfter)
  assert.equal(
    (switchDoc.nodes ?? []).filter((node) =>
      node.next?.some(
        (connection) =>
          (typeof connection === 'number' ? connection : connection.node_id) === switchAfter.id
      )
    ).length,
    1
  )

  const loopDoc = docs.find((candidate) => candidate.graph?.name?.includes('multi-outflow-loops'))
  assert.ok(loopDoc)
  for (const [nodeType, afterText] of [
    ['finite_loop', 'finite complete'],
    ['list_iteration_loop', 'list complete']
  ] as const) {
    const loopNode = loopDoc.nodes?.find((node) => node.type === nodeType)
    const after = loopDoc.nodes?.find(
      (node) => node.type === 'print_string' && node.args?.[0]?.value === afterText
    )
    assert.ok(loopNode)
    assert.ok(after)
    assert.ok(
      loopNode.next?.some(
        (connection) =>
          typeof connection !== 'number' &&
          connection.node_id === after.id &&
          connection.source_index === 1
      )
    )
  }

  const explicit = g.defineComposite('multi-outflow explicit wiring', {
    outflows: ['yes', 'no'],
    build(_args, f) {
      const branch = f.node('double_branch', [new bool(true)])
      const yes = f.node('print_string', [new str('explicit yes')])
      const no = f.node('print_string', [new str('explicit no')])
      f.link(f.entry(), 0, branch)
      f.link(branch, 0, yes)
      f.link(branch, 1, no)
      f.outflow('yes', yes, 0)
      f.outflow('no', no, 0)
      return {}
    }
  })
  const explicitResult = g.server({ name: 'multi-outflow-explicit', id: 1073742325 })
  explicitResult.on('whenEntityIsCreated', (_event, f) => {
    const result = f.callComposite(explicit, {})
    f.connectOutFlow(result, 0, () => f.printString(new str('explicit after yes')))
    f.connectOutFlow(result, 1, () => f.printString(new str('explicit after no')))
  })

  const parentDef = doc.compositeDefs?.find((def) => def.name === parent.name)
  assert.ok(parentDef)
  assert.deepEqual(parentDef.implEdges?.[2], [{ node_id: 3, source_index: 0 }])

  const mainCall = doc.nodes?.find((node) => node.type === '__composite_call__')
  assert.ok(mainCall)
  assert.deepEqual(mainCall.next, [{ node_id: mainCall.id + 1, source_index: 0 }])

  assert.ok(
    warnings.some(
      (warning) =>
        warning.includes('GSTS-MULTI-OUTFLOW-DEFAULT-CONTINUATION') &&
        warning.includes('multi-outflow warning child') &&
        warning.includes('OutFlow[0]')
    ),
    warnings.join('\n')
  )
  assert.ok(
    warnings.some(
      (warning) =>
        warning.includes('node "double_branch"') &&
        warning.includes(
          'Move code intended for each branch into the corresponding branch callback'
        ) &&
        warning.includes('f.node()/f.link()')
    ),
    warnings.join('\n')
  )
  assert.ok(
    warnings.some(
      (warning) =>
        warning.includes('composite "multi-outflow warning child"') &&
        warning.includes('connectOutFlow(result, index, callback)') &&
        warning.includes('declareDetached() + f.link()')
    ),
    warnings.join('\n')
  )
  assert.equal(
    warnings.filter((warning) => warning.includes('multi-outflow explicit')).length,
    0,
    warnings.join('\n')
  )
} finally {
  console.warn = originalWarn
}

console.log('PASS multi-outflow default continuation warning')
