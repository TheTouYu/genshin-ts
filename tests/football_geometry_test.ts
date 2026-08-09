/**
 * 足球几何红绿断言（2026-08-08）。
 *
 * 纯数学断言，不依赖 GIL：截角二十面体拓扑（60/32/90、面边归属、顶点度数、
 * 共球面、正多边形），面片条带覆盖（无缝隙、在面上），边线（长度/方向）。
 * 宿主 f501/f502、ID 闭包、源文件不变等 GIL 层断言由候选生成脚本负责。
 */
import assert from 'node:assert/strict'
import {
  basisToEuler,
  coverFace,
  edgeBars,
  prismPanels,
  truncatedIcosahedron,
  type FaceStrip,
  type Vec3
} from '../src/cli/static_assembly/football_geometry.js'

const RADIUS = 1.0
const FACE = { stripWidth: 0.12, thickness: 0.02, surfaceOffset: 0.01 }
const EDGE = { width: 0.02, radialOffset: 0.005 }
const PRISM = { thickness: 0.02, surfaceOffset: 0.01 }

const ball = truncatedIcosahedron(RADIUS)

// ---- 拓扑 ----
assert.equal(ball.vertices.length, 60, '顶点=60')
assert.equal(ball.faces.length, 32, '面=32')
assert.equal(ball.edges.length, 90, '边=90')
assert.equal(ball.faces.filter((f) => f.kind === 'pentagon').length, 12, '五边形=12')
assert.equal(ball.faces.filter((f) => f.kind === 'hexagon').length, 20, '六边形=20')
console.log(`PASS 拓扑: 60 顶点 / 32 面 (12 五 + 20 六) / 90 边`)

// ---- 每条边恰好属于两个面 ----
const edgeFaces = new Map<string, number>()
for (const f of ball.faces) {
  for (let i = 0; i < f.vertices.length; i++) {
    const a = ball.vertices.indexOf(f.vertices[i])
    const b = ball.vertices.indexOf(f.vertices[(i + 1) % f.vertices.length])
    const k = a < b ? `${a},${b}` : `${b},${a}`
    edgeFaces.set(k, (edgeFaces.get(k) ?? 0) + 1)
  }
}
assert.equal(edgeFaces.size, 90, '唯一面边=90')
for (const [k, count] of edgeFaces) {
  assert.equal(count, 2, `边 ${k} 属于 ${count} 个面（应为 2）`)
}
console.log('PASS 每条边恰好属于 2 个面')

// ---- 每个顶点度数 = 3 ----
const vertexDegree = new Map<number, number>()
for (const [a, b] of ball.edges) {
  vertexDegree.set(ball.vertices.indexOf(a), (vertexDegree.get(ball.vertices.indexOf(a)) ?? 0) + 1)
  vertexDegree.set(ball.vertices.indexOf(b), (vertexDegree.get(ball.vertices.indexOf(b)) ?? 0) + 1)
}
assert.equal(vertexDegree.size, 60, '60 个顶点都有边')
for (const [i, d] of vertexDegree) {
  assert.equal(d, 3, `顶点 ${i} 度数 ${d}（应为 3）`)
}
console.log('PASS 每个顶点度数=3')

// ---- 共球面 ----
for (const v of ball.vertices) {
  const r = Math.hypot(v[0], v[1], v[2])
  assert.ok(Math.abs(r - RADIUS) < 1e-6, `顶点 |v|=${r} != radius`)
}
console.log('PASS 全部 60 顶点到中心距离一致 (= 1.0)')

// ---- 面共面且正多边形 ----
for (const f of ball.faces) {
  const [a, b, c] = f.vertices
  const n = cross(sub(b, a), sub(c, a))
  const nn = Math.hypot(n[0], n[1], n[2])
  for (const p of f.vertices) {
    const d = Math.abs(dot(n, sub(p, a))) / nn
    assert.ok(d < 1e-6, `${f.kind} 顶点离面平面 ${d}`)
  }
  // 正多边形：边长一致
  const len = Math.hypot(...sub(f.vertices[1], f.vertices[0]))
  for (let i = 1; i < f.vertices.length; i++) {
    const l = Math.hypot(...sub(f.vertices[(i + 1) % f.vertices.length], f.vertices[i]))
    assert.ok(Math.abs(l - len) < 1e-6, `${f.kind} 边长不一致 ${l} vs ${len}`)
  }
}
console.log('PASS 32 面全部共面且为正多边形')

// ---- 棱柱面片 ----
const panels = prismPanels(ball, PRISM)
assert.equal(panels.length, 132, '棱柱面片=132')
assert.equal(panels.filter((panel) => panel.kind === 'pentagon').length, 12, '五棱柱=12')
assert.equal(panels.filter((panel) => panel.kind === 'triangle').length, 120, '三棱柱=120')
let panelIndex = 0
for (const face of ball.faces) {
  const sum = face.vertices.reduce((acc, vertex) => add(acc, vertex), [0, 0, 0])
  const center: Vec3 = [
    sum[0] / face.vertices.length,
    sum[1] / face.vertices.length,
    sum[2] / face.vertices.length
  ]
  const normal = normalize(center)
  const count = face.kind === 'pentagon' ? 1 : 6
  for (let piece = 0; piece < count; piece++) {
    const panel = panels[panelIndex++]
    const planeCenter = sub(panel.center, scale(normal, PRISM.surfaceOffset))
    const expectedCenter =
      face.kind === 'pentagon'
        ? center
        : scale(
            add(add(center, face.vertices[piece]), face.vertices[(piece + 1) % 6]),
            1 / 3
          )
    assertVec(planeCenter, expectedCenter, '面片中心')
    assert.ok(Math.abs(dot(panel.yAxis, normal) - 1) < 1e-6, '局部 Y 对齐外法线')
    assert.ok(Math.abs(dot(cross(panel.xAxis, panel.yAxis), panel.zAxis) - 1) < 1e-6, '局部基右手系')
    assert.equal(panel.scale[1], PRISM.thickness, '棱柱厚度')
    if (face.kind === 'pentagon') {
      const radius = Math.hypot(...sub(face.vertices[0], center))
      assert.ok(
        Math.abs(panel.scale[0] - 2 * radius) < 1e-12 &&
          Math.abs(panel.scale[2] - 2 * radius) < 1e-12,
        '五棱柱直径语义缩放（scale = 2×外接半径）'
      )
      assertVec(
        sub(planeCenter, scale(panel.zAxis, radius)),
        face.vertices[0],
        '五棱柱本地 -Z 顶点'
      )
    } else {
      const next = face.vertices[(piece + 1) % 6]
      const side = Math.hypot(...sub(next, face.vertices[piece]))
      assert.ok(
        Math.abs(panel.scale[0] - (2 * side) / Math.sqrt(3)) < 1e-12 &&
          Math.abs(panel.scale[2] - (2 * side) / Math.sqrt(3)) < 1e-12,
        '三棱柱直径语义缩放（scale = 边长/0.866）'
      )
      assertVec(
        sub(planeCenter, scale(panel.zAxis, side / Math.sqrt(3))),
        center,
        '三棱柱本地 -Z 顶点'
      )
      const edgeMidpoint = add(
        planeCenter,
        scale(panel.zAxis, side / (2 * Math.sqrt(3)))
      )
      const reconstructed = [
        add(edgeMidpoint, scale(panel.xAxis, side / 2)),
        sub(edgeMidpoint, scale(panel.xAxis, side / 2))
      ]
      for (const vertex of [face.vertices[piece], next]) {
        assert.ok(
          reconstructed.some((candidate) => distance(candidate, vertex) < 1e-6),
          '三棱柱相对边端点'
        )
      }
    }
  }
}
assert.equal(panelIndex, panels.length, '全部棱柱面片均已核对')
console.log('PASS 棱柱面片: 12 个五棱柱 + 120 个三棱柱，Transform 与资源基准一致')

// ---- 面片条带覆盖 ----
let stripCount = 0
for (const f of ball.faces) {
  const strips = coverFace(f, FACE)
  assert.ok(strips.length >= 1, '每面至少 1 条带')
  stripCount += strips.length
  // 条带拼接覆盖 u 全程：第一条 uLo=min、最后一条 uHi=max、相邻无缝
  const centers = f.vertices.map((p) => dot(sub(p, strips[0].center), strips[0].xAxis))
  // 用面中心重算 u 范围（条带中心已偏移，仅用方向）
  const sum = f.vertices.reduce((acc, p) => add(acc, p), [0, 0, 0])
  const faceCenter: Vec3 = [sum[0] / f.vertices.length, sum[1] / f.vertices.length, sum[2] / f.vertices.length]
  const us = f.vertices.map((p) => dot(sub(p, faceCenter), strips[0].xAxis))
  const uMin = Math.min(...us)
  const uMax = Math.max(...us)
  const total = strips.reduce((acc, s) => acc + s.width, 0)
  assert.ok(Math.abs(total - (uMax - uMin)) < 1e-9, '条带宽度和 = u 跨度（无缝隙）')
  // 条带中心在面平面上（surfaceOffset 距离外）
  for (const s of strips) {
    const d = Math.abs(dot(sub(s.center, faceCenter), s.yAxis))
    assert.ok(Math.abs(d - FACE.surfaceOffset) < 1e-6, `条带中心离面平面 ${d}`)
    assert.ok(s.length > 0 && s.width > 0 && s.thickness === FACE.thickness, '条带尺寸合法')
    // 局部基右手系
    const x = cross(s.yAxis, s.zAxis)
    assert.ok(Math.abs(dot(x, s.xAxis) - 1) < 1e-6, '局部基右手系')
  }
}
console.log(`PASS 面片条带: 共 ${stripCount} 条，无缝隙、全部落在面平面上`)

// ---- 边线 ----
const bars = edgeBars(ball.edges, EDGE)
assert.equal(bars.length, 90, '边线=90')
const edgeLen = Math.hypot(...sub(ball.edges[0][1], ball.edges[0][0]))
for (let i = 0; i < bars.length; i++) {
  const [p1, p2] = ball.edges[i]
  const bar = bars[i]
  const l = Math.hypot(...sub(p2, p1))
  assert.ok(Math.abs(bar.scale[2] - l) < 1e-9, `边线 ${i} 长度=边长`)
  assert.deepEqual(bar.scale, [EDGE.width, EDGE.width, l], `边线 ${i} 截面=${EDGE.width}`)
  const mid: Vec3 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2, (p1[2] + p2[2]) / 2]
  assert.ok(Math.hypot(...sub(bar.center, mid)) < 1e-9 + EDGE.radialOffset, `边线 ${i} 中心=弦中点+径向偏移`)
  // 长轴对齐边方向
  const d = Math.hypot(...sub(p2, p1))
  const dir: Vec3 = [(p2[0] - p1[0]) / d, (p2[1] - p1[1]) / d, (p2[2] - p1[2]) / d]
  assert.ok(Math.abs(dot(bar.zAxis, dir) - 1) < 1e-6, `边线 ${i} 长轴对齐边方向`)
}
console.log('PASS 90 条边线: 长度=边长、中心=弦中点、长轴对齐边方向')

// ---- 欧拉角自洽（round-trip；真实编辑器规则 = YXZ 内旋，2026-08-08 三步样本闭合） ----
function eulerToBasis(e: Vec3, order: 'zyx' | 'yxz' | 'xyz'): [Vec3, Vec3, Vec3] {
  const rad = (v: number) => (v * Math.PI) / 180
  const [a, b, g] = [rad(e[0]), rad(e[1]), rad(e[2])]
  const rx = (t: number): number[][] => [
    [1, 0, 0],
    [0, Math.cos(t), -Math.sin(t)],
    [0, Math.sin(t), Math.cos(t)]
  ]
  const ry = (t: number): number[][] => [
    [Math.cos(t), 0, Math.sin(t)],
    [0, 1, 0],
    [-Math.sin(t), 0, Math.cos(t)]
  ]
  const rz = (t: number): number[][] => [
    [Math.cos(t), -Math.sin(t), 0],
    [Math.sin(t), Math.cos(t), 0],
    [0, 0, 1]
  ]
  const mul = (m: number[][], n: number[][]): number[][] =>
    m.map((row, i) => n[0].map((_, j) => row.reduce((acc, v, k) => acc + v * n[k][j], 0)))
  const R = order === 'yxz' ? mul(mul(ry(b), rx(a)), rz(g)) : order === 'zyx' ? mul(mul(rz(g), ry(b)), rx(a)) : mul(mul(rx(a), ry(b)), rz(g))
  return [
    [R[0][0], R[1][0], R[2][0]],
    [R[0][1], R[1][1], R[2][1]],
    [R[0][2], R[1][2], R[2][2]]
  ]
}
for (const s of [
  ...panels,
  ...coverFace(ball.faces[0], FACE),
  ...edgeBars(ball.edges.slice(0, 3), EDGE)
]) {
  const e = basisToEuler(s.xAxis, s.yAxis, s.zAxis)
  const [x2, y2, z2] = eulerToBasis(e, 'yxz')
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(x2[i] - s.xAxis[i]) < 1e-6 && Math.abs(y2[i] - s.yAxis[i]) < 1e-6 && Math.abs(z2[i] - s.zAxis[i]) < 1e-6, '欧拉角 round-trip')
  }
}
console.log('PASS 欧拉角(YXZ 内旋，真实编辑器规则) round-trip 自洽')

// ---- 预算 ----
const totalAux = stripCount + bars.length
console.log(`摘要: 面片条带=${stripCount} 边线=${bars.length} 总 aux=${totalAux}（预算含 1 宿主实体 → ${totalAux + 1} 条新记录）`)
assert.ok(totalAux < 400, `aux 预算 ${totalAux} < 400`)

console.log('\n全部足球几何断言 PASS')

// ---- 本地工具 ----
function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}
function scale(v: Vec3, factor: number): Vec3 {
  return [v[0] * factor, v[1] * factor, v[2] * factor]
}
function normalize(v: Vec3): Vec3 {
  return scale(v, 1 / Math.hypot(...v))
}
function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(...sub(a, b))
}
function assertVec(actual: Vec3, expected: Vec3, label: string): void {
  assert.ok(distance(actual, expected) < 1e-6, `${label}: ${actual} != ${expected}`)
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
