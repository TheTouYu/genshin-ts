import { g } from 'genshin-ts/runtime/core'

// Regression: an explicitly typed empty array must retain its declared list element type when
// lowered through LocalVariable and then passed to a list mutation node.
g.server({
  id: 1073741910
}).on('whenEntityIsCreated', (_evt, f) => {
  const target: number[] = []
  target.push(1)
  f.concatenateList(target, f.assemblyList([2, 3], 'float'))
})
