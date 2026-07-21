import assert from 'node:assert/strict'

import { buildServerGraphRegistriesIRDocuments, g } from '../src/runtime/core.js'
import type { NextConnection, ServerNode } from '../src/runtime/IR.js'

const graphId = 1073741901
const fallbackGraphId = 1073741902
const noStageGraphId = 1073741903
const labels = ['first entity-created handler', 'second entity-created handler']

g.server({ id: graphId, name: 'stage_event_prelude_assert', prefix: false })
  .on('whenEntityIsCreated', (_evt, f) => {
    f.printString(labels[0])
  })
  .on('whenEntityIsCreated', (_evt, f) => {
    // Deliberately discover stage after an exec node and after another handler was registered.
    // The generated initialization still has to be inserted before both handlers.
    f.printString(labels[1])
    stage.set('stage_event_prelude_probe', 1n)
  })

g.server({ id: fallbackGraphId, name: 'stage_event_fallback_assert', prefix: false }).on(
  'whenAttacked',
  (_evt, _f) => {
    stage.set('stage_event_fallback_probe', 1n)
  }
)

g.server({ id: noStageGraphId, name: 'no_stage_event_fallback_assert', prefix: false }).on(
  'whenAttacked',
  (_evt, f) => {
    f.printString('no stage used')
  }
)

const documents = buildServerGraphRegistriesIRDocuments()
const doc = documents.find((item) => item.graph.id === graphId)
assert.ok(doc, `Expected server graph ${graphId}`)

const nodes = (doc.nodes ?? []) as ServerNode[]
const nodesById = new Map(nodes.map((node) => [node.id, node]))
const entityCreatedEvents = nodes.filter((node) => node.type === 'when_entity_is_created')
const stageInitializers = nodes.filter((node) => {
  if (node.type !== 'set_node_graph_variable') return false
  const name = node.args?.[0]
  return name?.type === 'str' && name.value === '__gsts_stage'
})
const stageQueries = nodes.filter(
  (node) => node.type === 'get_specified_type_of_entities_on_the_field'
)
const stageListLookups = nodes.filter(
  (node) => node.type === 'get_corresponding_value_from_list'
)

assert.equal(entityCreatedEvents.length, 2, 'Expected no extra event when user handlers exist')
assert.equal(stageInitializers.length, entityCreatedEvents.length)
assert.equal(stageQueries.length, entityCreatedEvents.length)
assert.equal(stageListLookups.length, entityCreatedEvents.length)

function targetId(connection: NextConnection): number {
  return typeof connection === 'number' ? connection : connection.node_id
}

for (const event of entityCreatedEvents) {
  assert.equal(event.next?.length, 1, `Expected event ${event.id} to have one initial exec node`)
  const firstNode = nodesById.get(targetId(event.next![0]))
  assert.ok(firstNode, `Expected first node for event ${event.id}`)
  assert.equal(
    firstNode.type,
    'set_node_graph_variable',
    `Expected event ${event.id} to initialize __gsts_stage before user code`
  )
  assert.equal(firstNode.args?.[0]?.type, 'str')
  assert.equal(firstNode.args?.[0]?.value, '__gsts_stage')
}

for (const label of labels) {
  const printNode = nodes.find(
    (node) =>
      node.type === 'print_string' && node.args?.[0]?.type === 'str' && node.args[0].value === label
  )
  assert.ok(printNode, `Expected print node for ${label}`)
  assert.ok(
    stageInitializers.some((initializer) =>
      initializer.next?.some((connection) => targetId(connection) === printNode.id)
    ),
    `Expected __gsts_stage initialization immediately before ${label}`
  )
}

const fallbackDoc = documents.find((item) => item.graph.id === fallbackGraphId)
assert.ok(fallbackDoc, `Expected fallback server graph ${fallbackGraphId}`)
const fallbackNodes = (fallbackDoc.nodes ?? []) as ServerNode[]
const fallbackEvents = fallbackNodes.filter((node) => node.type === 'when_entity_is_created')
assert.equal(fallbackEvents.length, 1, 'Expected one fallback event when stage is used')
const fallbackFirst = fallbackEvents[0]?.next?.[0]
assert.ok(fallbackFirst, 'Expected fallback event to initialize stage')
const fallbackFirstNode = fallbackNodes.find((node) => node.id === targetId(fallbackFirst))
assert.ok(fallbackFirstNode, 'Expected fallback stage initialization node')
assert.equal(fallbackFirstNode.type, 'set_node_graph_variable')
assert.equal(fallbackFirstNode.args?.[0]?.type, 'str')
assert.equal(fallbackFirstNode.args?.[0]?.value, '__gsts_stage')

const noStageDoc = documents.find((item) => item.graph.id === noStageGraphId)
assert.ok(noStageDoc, `Expected no-stage server graph ${noStageGraphId}`)
assert.equal(
  noStageDoc.nodes?.filter((node) => node.type === 'when_entity_is_created').length,
  0,
  'Expected no fallback event when stage is unused'
)

const rebuiltDoc = buildServerGraphRegistriesIRDocuments().find((item) => item.graph.id === graphId)
assert.ok(rebuiltDoc, `Expected rebuilt server graph ${graphId}`)
assert.equal(
  rebuiltDoc.nodes?.filter((node) => {
    if (node.type !== 'set_node_graph_variable') return false
    const name = node.args?.[0]
    return name?.type === 'str' && name.value === '__gsts_stage'
  }).length,
  entityCreatedEvents.length,
  'Expected repeated IR builds not to duplicate stage initialization'
)

console.log('[ok] stage initialization reuses user events and creates only the required fallback')
