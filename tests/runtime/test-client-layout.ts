import assert from 'node:assert/strict'

import { clientLayoutPositions } from '../../src/compiler/client_layout.js'

const positions = clientLayoutPositions([
  { id: 1, type: 'client_graph_begins', next: [{ node_id: 2 }] },
  {
    id: 2,
    type: 'send_signal_to_server_node_graph',
    clientValues: [],
    next: [{ node_id: 3 }]
  },
  {
    id: 3,
    type: 'send_signal_to_server_node_graph',
    clientValues: [],
    next: []
  }
] as any)

assert.equal(positions.size, 3)
assert.notDeepEqual(positions.get(1), positions.get(2))
assert.notDeepEqual(positions.get(2), positions.get(3))

console.log('Client layout reuse checks passed.')
