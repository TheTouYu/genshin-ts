// tests/gil_terrain.ts — 地形/草皮（root 7 f4）读写回归
// 规则来源：docs/game-engine-knowledge/terrain-grass.md（用户编辑器实测闭合）

import assert from 'node:assert'
import { readTerrainTiles, setTerrainRange } from '../src/cli/gil_terrain.js'
import { emitWireMessage as emit, parseWireMessage as parse, type WireField } from '../src/cli/static_assembly/wire.js'
import { buildFile } from '../src/injector/binary.js'

// 构造一个带 root 7 地形的微型 GIL
// 真实结构（用户地图实测）：
//   root7.value = { f1: bytes(地形记录) }
//   地形记录 = { f1: varint 地形ID, f2: bytes 名称, f3: bytes 参数, f4: bytes 地块... }
function buildMiniMapWithTerrain(tiles: [number, number][]): Uint8Array {
  const recordFields: WireField[] = [
    { number: 1, wire: 0, value: 1073741825 },
    { number: 2, wire: 2, value: emit([{ number: 1, wire: 2, value: new TextEncoder().encode('地形01') }]) },
    { number: 3, wire: 2, value: emit([
      { number: 1, wire: 2, value: emit([
        { number: 1, wire: 5, value: new Uint8Array([0, 0, 0, 0]) },
        { number: 2, wire: 5, value: new Uint8Array([0, 0, 0, 0]) },
        { number: 3, wire: 5, value: new Uint8Array([0, 0, 0, 0]) }
      ]) }
    ]) }
  ]
  for (const [r, c] of tiles) {
    recordFields.push({ number: 4, wire: 2, value: emit([
      { number: 1, wire: 0, value: (r << 16) | c },
      { number: 2, wire: 0, value: 1 }
    ]) })
  }
  const terrainRecord = emit(recordFields)
  const root7 = { number: 7, wire: 2, value: emit([{ number: 1, wire: 2, value: terrainRecord }]) }
  const rebuilt = emit([root7])
  return buildFile(rebuilt, { schema: 1, headTag: 2, fileType: 3, tailTag: 4 })
}

// 默认 20x20 网格（100..119）
const defaultTiles: [number, number][] = []
for (let c = 100; c <= 119; c++) {
  for (let r = 100; r <= 119; r++) defaultTiles.push([r, c])
}

const mini = buildMiniMapWithTerrain(defaultTiles)

// 1. 读取默认 400 块
const read = readTerrainTiles(mini)
assert.equal(read.length, 400, 'default map has 400 tiles')
assert.deepEqual(read[0], [100, 100], 'first tile is (row=100, col=100)')
assert.deepEqual(read[399], [119, 119], 'last tile is (row=119, col=119)')

// 2. set-range 扩到 col 97..122 × row 100..121（26×22 = 572）
const expanded = setTerrainRange(mini, 97, 122, 100, 121)
const read2 = readTerrainTiles(expanded)
assert.equal(read2.length, 572, 'expanded range has 26*22 = 572 tiles')
assert.deepEqual(read2[0], [100, 97], 'first tile is (row=100, col=97)')
assert.deepEqual(read2[571], [121, 122], 'last tile is (row=121, col=122)')
// 验证 column-major：col 97 整列在前
const col97 = read2.filter(([r, c]) => c === 97)
assert.equal(col97.length, 22, 'col 97 has 22 rows')
assert.deepEqual(col97[0], [100, 97])
assert.deepEqual(col97[21], [121, 97])

// 3. set-range 缩小（移除默认范围外的块）
const shrunk = setTerrainRange(mini, 100, 119, 100, 119)
const read3 = readTerrainTiles(shrunk)
assert.equal(read3.length, 400, 'shrunk back to 400')

// 4. 保留非 f4 字段（f1/f2/f3）——验证 root7 里名称还在
const shrunkTop = parse(shrunk.slice(20, -4))
assert.ok(shrunkTop)
const root7 = shrunkTop.find((f) => f.number === 7 && f.wire === 2)
assert.ok(root7, 'root 7 exists')
const terrain = parse(root7.value as Uint8Array)
assert.ok(terrain, 'terrain parsed')
const f1 = terrain.find((f) => f.number === 1 && f.wire === 2)
assert.ok(f1, 'terrain record f1 exists')
const f1Fields = parse(f1.value as Uint8Array)
assert.ok(f1Fields, 'f1 fields parsed')
const name = f1Fields.find((f) => f.number === 2 && f.wire === 2)
assert.ok(name, 'name field preserved')

console.log('gil terrain tests passed')
