import { g } from 'genshin-ts/runtime/core'

import { gstsServerCrossAdd } from './gsts_server_cross_lib.js'

function abc() {
  setTimeout(() => {
    console.log(214)
  })
}

setTimeout(() => {
  console.log(123)
})

// Expected:
// - cross-file gstsServer* can be resolved in dev incremental program
// - gstsServer* call is allowed inside handler
g.server({
  id: 1073741862
}).on('whenEntityIsCreated', (_evt, f) => {
  const total = gstsServerCrossAdd(5n, 6n)
  f.printString(str(total))
  print('22222')
})
