import { g } from 'genshin-ts/runtime/core'

// Expected:
// - gstsServer* functions are transformed like handlers
// - only last return is used
// - setTimeout works without explicit "f" param
// - top-level vars are allowed (read/write) and not captured by timers

const TOP_TAG = 'gstsServer_timer'
let topCounter = 0n

function gstsServerSum(base: bigint, delta: bigint) {
  topCounter = topCounter + 1n
  const res = base + delta + topCounter
  setTimeout(() => {
    gsts.f.printString(TOP_TAG)
    gsts.f.printString(str(res))
  }, 200)
  return res
}

function gstsServerDouble(base: bigint) {
  const value = gstsServerSum(base, 2n)
  return value + value
}

g.server({
  id: 1073741862
}).on('whenEntityIsCreated', (_evt, f) => {
  const total = gstsServerDouble(5n)
  f.printString(str(total))
})
