// gil_terrain.ts — 地形/草皮（root 7）的 GIL 读取与修改
// 规则文档：docs/game-engine-knowledge/terrain-grass.md

import { parseWireMessage as parse, emitWireMessage as emit, wireMessage as message, type WireField } from './static_assembly/wire.js'
import { buildFile, readUint32BE } from '../injector/binary.js'

/** 读取当前地形的 f4 地块列表（row, col 对） */
export function readTerrainTiles(bytes: Uint8Array): [number, number][] {
  const top = parse(bytes.slice(20, -4))
  if (!top) return []
  const root7 = top.find((f) => f.number === 7 && f.wire === 2)
  if (!root7) return []
  const terrain = message(root7)
  // f1 是地形记录
  for (const f1 of terrain) {
    if (f1.number !== 1 || f1.wire !== 2) continue
    const fields = message(f1)
    const tiles: [number, number][] = []
    for (const f of fields) {
      if (f.number !== 4 || f.wire !== 2) continue
      const inner = message(f)
      for (const g of inner) {
        if (g.number === 1 && g.wire === 0) {
          const v = g.value as number
          tiles.push([v >> 16, v & 0xffff])
        }
      }
    }
    return tiles
  }
  return []
}

/** 设置地形地块范围为指定矩形（colMin..colMax × rowMin..rowMax） */
export function setTerrainRange(
  bytes: Uint8Array,
  colMin: number,
  colMax: number,
  rowMin: number,
  rowMax: number
): Uint8Array {
  const top = parse(bytes.slice(20, -4))
  if (!top) throw new Error('[error] malformed GIL payload')

  const root7 = top.find((f) => f.number === 7 && f.wire === 2)
  if (!root7) throw new Error('[error] root 7 (terrain) not found')

  const terrain = message(root7)
  const newTerrain: WireField[] = []

  for (const f1 of terrain) {
    if (f1.number === 1 && f1.wire === 2) {
      const fields = message(f1)
      const newFields: WireField[] = []
      // 保留 f1(f2=名称)、f3(地形参数) 等字段，替换 f4 列表
      for (const f of fields) {
        if (f.number === 4) continue // 跳过旧 f4
        newFields.push(f)
      }
      // 按 column-major 顺序生成新地块：col 外循环，row 内循环
      const tileCount = (colMax - colMin + 1) * (rowMax - rowMin + 1)
      for (let col = colMin; col <= colMax; col++) {
        for (let row = rowMin; row <= rowMax; row++) {
          const packed = (row << 16) | col
          const tileInner = emit([
            { number: 1, wire: 0, value: packed },
            { number: 2, wire: 0, value: 1 }
          ])
          newFields.push({ number: 4, wire: 2, value: tileInner })
        }
      }
      newTerrain.push({ number: 1, wire: 2, value: emit(newFields) })
    } else {
      newTerrain.push(f1)
    }
  }
  // 替换 root7 内容
  const newRoot7: WireField = { number: 7, wire: 2, value: emit(newTerrain) }
  const newTop = top.map((f) => (f.number === 7 ? newRoot7 : f))
  const rebuilt = emit(newTop)
  return buildFile(rebuilt, {
    schema: readUint32BE(bytes, 4),
    headTag: readUint32BE(bytes, 8),
    fileType: readUint32BE(bytes, 12),
    tailTag: readUint32BE(bytes, bytes.length - 4)
  })
}