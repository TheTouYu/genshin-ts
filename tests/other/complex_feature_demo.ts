import { g } from 'genshin-ts/runtime/core'

// Complex demo: arithmetic, loops, switch, if, nested timers, closures,
// list methods, dict methods, index access/assignment, and gstsServer* functions.

const DEMO_TAG = `${'231'}:mode1`
let globalScale = 2n
let globalToggle = false

function gstsServerComputeScore(values: bigint[], mode: bigint) {
  const weights = [1n, 2n, 3n, 4n]
  weights[2] = weights[2] + globalScale

  const scaled = values.map((v) => v * weights[0])
  const filtered = scaled.filter((v) => v > 3n)
  const sum = filtered.reduce((acc, v) => acc + v, 0n)

  let bonus = 0n
  switch (mode) {
    case 0n:
      bonus = 10n
      break
    case 1n:
      bonus = 20n
      break
    default:
      bonus = 30n
      break
  }

  globalScale = globalScale + 1n

  setTimeout(() => {
    gsts.f.printString(`${DEMO_TAG}:score`)
    gsts.f.printString(str(sum + bonus))
    setTimeout(() => {
      gsts.f.printString(`${DEMO_TAG}:nested`)
      gsts.f.printString(str(globalScale))
    }, 200)
  }, 300)

  return sum + bonus
}

function gstsServerBuildDict(seed: bigint) {
  const result = dict([
    { k: 'seed', v: seed },
    { k: 'scaled', v: seed * globalScale }
  ])
  result.set('seed', result.get('seed') + 1n)
  setTimeout(() => {
    gsts.f.printString(`${DEMO_TAG}:dict_size`)
    // gsts.f.printString(str(result.size))
  }, 250)
  return result
}

g.server({
  id: 1073741862
}).on('whenEntityIsCreated', (_evt, f) => {
  f.printString(`${DEMO_TAG}:start`)

  const base = [1n, 2n, 3n, 4n, 5n]
  base[1] = base[1] + 10n

  const scoreA = gstsServerComputeScore(base, 1n)
  f.printString(str(scoreA))

  const scoreB = gstsServerComputeScore([2n, 4n, 6n], 2n)
  f.printString(str(scoreB))

  const info = gstsServerBuildDict(scoreA)
  f.printString(str(info.get('scaled')))
  info.set('bonus', scoreB)

  const keys = info.keys()
  f.printString(str(f.getListLength(keys)))
  info.forEach((value, key) => {
    f.printString(str(key))
    f.printString(str(value))
  })

  const mapped = base.map((v) => v + 1n)
  const even = mapped.filter((v) => v % 2n === 0n)
  const total = even.reduce((acc, v) => acc + v, 0n)
  const hasFive = mapped.includes(5n)
  const idx = mapped.findIndex((v) => v === 12n)
  const sliced = mapped.slice(1, 3)
  const removed = mapped.splice(1, 2)
  mapped.push(99n)
  const last = mapped.pop()!
  const first = mapped.shift()!
  mapped.unshift(7n)

  f.printString(str(total))
  f.printString(str(hasFive))
  f.printString(str(idx))
  f.printString(str(f.getListLength(sliced)))
  f.printString(str(f.getListLength(removed)))
  f.printString(str(last))
  f.printString(str(first))

  let acc = 0n
  for (let i = 0; i < 3; i += 1) {
    acc = acc + int(i)
    if (i === 1) continue
    acc = acc + 1n
  }

  let j = 0
  while (j < 3) {
    acc = acc + int(j)
    j = j + 1
  }

  let mode = 0n
  do {
    mode = mode + 1n
  } while (mode < 2n)

  switch (mode) {
    case 1n:
      f.printString(`${DEMO_TAG}:mode1`)
      break
    case 2n:
      f.printString(`${DEMO_TAG}:mode2`)
      break
    default:
      f.printString(`${DEMO_TAG}:modeX`)
      break
  }

  if (acc > 0n) {
    f.printString(str(acc))
  } else {
    f.printString(`${DEMO_TAG}:zero`)
  }

  const tag = 'closure'
  const localSeed = base[0]
  setTimeout(() => {
    f.printString(tag)
    f.printString(str(localSeed))
    let g = base[1]
    setTimeout(() => {
      f.printString('inner')
      f.printString(str(g))
    }, 150)
  }, 200)

  globalToggle = !globalToggle
  if (globalToggle) {
    f.printString(`${DEMO_TAG}:toggle_on`)
  } else {
    f.printString(`${DEMO_TAG}:toggle_off`)
  }

  f.printString(`${DEMO_TAG}:end`)
})
