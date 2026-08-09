/**
 * 足球几何：标准截角二十面体 + 矩形条带面覆盖 + 边线（2026-08-08）。
 *
 * 纯数学模块，不触碰 GIL。构造确定性：
 * 1. 二十面体 12 顶点（黄金比），归一化到目标半径；
 * 2. 每条边三等分，取两个三等分点并归一化 → 60 个截角顶点（共球面）；
 * 3. 原顶点 → 12 个正五边形（5 个近端点按角度排序）；
 *    原三角形面 → 20 个正六边形（6 个截角点沿三角形边界凸序）；
 * 4. 面覆盖：面平面局部 2D 基，沿跨度较小方向等分条带（条带数 = ceil(跨度/宽度)），
 *    每条带中心线与该凸多边形求交得到 v 范围 → 一个压扁长方体；
 * 5. 边线：弦中点 + 长轴对齐弦方向 + 径向为厚方向。
 *
 * 欧拉角：编辑器多轴 rotation 顺序已闭合（2026-08-08 真实样本，三证据交叉）：
 * 用户分步旋转（X45→Z25→Y30→X-45）面板值序列与 wire 逐值一致，且按
 * YXZ 内旋（R = Ry·Rx·Rz）分解的三步矩阵一致性误差 ≈ 0，其他 5 种顺序 0.3+；
 * 旧脚本 X 符号反了（rot_x 应为 -asin(n_y)），正是“飞散方板”原因。
 */

export type Vec3 = readonly [number, number, number]
export type FaceKind = 'pentagon' | 'hexagon'

export type PolyFace = {
  kind: FaceKind
  /** 凸序顶点，共面、共球面（半径 = radius） */
  vertices: Vec3[]
}

export type TruncatedIcosahedron = {
  radius: number
  /** 60 个截角顶点，全部 |v| = radius */
  vertices: Vec3[]
  /** 32 个面：12 五边形 + 20 六边形 */
  faces: PolyFace[]
  /** 90 条唯一边（端点对，无序） */
  edges: [Vec3, Vec3][]
}

/** 面片条带（压扁长方体）规格 */
export type FaceStrip = {
  center: Vec3
  /** 局部基列：[x=宽方向, y=厚度方向(面法线), z=长方向] */
  xAxis: Vec3
  yAxis: Vec3
  zAxis: Vec3
  /** scale=[宽, 厚, 长] */
  width: number
  thickness: number
  length: number
}

/** 边线长方体规格 */
export type EdgeBar = {
  center: Vec3
  /** 局部基列：[x=截面方向1, y=径向, z=长轴=边方向] */
  xAxis: Vec3
  yAxis: Vec3
  zAxis: Vec3
  scale: [number, number, number]
}

/** 三/五棱柱球壳面片；两种资源的零旋转高度轴均为 Y，单顶点朝 -Z。 */
export type PrismPanel = {
  kind: 'pentagon' | 'triangle'
  center: Vec3
  xAxis: Vec3
  yAxis: Vec3
  zAxis: Vec3
  /** 资源 scale 语义 = 底面外接圆直径 1（2026-08-09 用户实测），故：五棱柱 [2×外接半径, 厚, 2×外接半径]；三棱柱 [边长/0.866, 厚, 边长/0.866]。 */
  scale: [number, number, number]
}

export type PrismPanelOptions = {
  thickness: number
  /** 面片中心从多面体面平面沿外法线偏移的距离。 */
  surfaceOffset: number
}

const PHI = (1 + Math.sqrt(5)) / 2

function norm(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2])
}

function normalize(v: Vec3, radius: number): Vec3 {
  const n = norm(v)
  const s = radius / n
  return [v[0] * s, v[1] * s, v[2] * s]
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s]
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

/** 二十面体 12 顶点（黄金比构造），归一化到 radius。 */
function icosahedronVertices(radius: number): Vec3[] {
  const raw: Vec3[] = [
    [0, 1, PHI],
    [0, -1, PHI],
    [0, 1, -PHI],
    [0, -1, -PHI],
    [1, PHI, 0],
    [-1, PHI, 0],
    [1, -PHI, 0],
    [-1, -PHI, 0],
    [PHI, 0, 1],
    [-PHI, 0, 1],
    [PHI, 0, -1],
    [-PHI, 0, -1]
  ]
  return raw.map((v) => normalize(v, radius))
}

/** 二十面体 20 个三角形面（凸序、外法线朝外）。 */
function icosahedronFaces(vertices: Vec3[]): [Vec3, Vec3, Vec3][] {
  const faces: [Vec3, Vec3, Vec3][] = []
  for (const v of vertices) {
    // 最近 5 个邻居（二十面体每个顶点度 5）
    const neighbors = vertices
      .filter((w) => w !== v)
      .sort((a, b) => norm(sub(a, v)) - norm(sub(b, v)))
      .slice(0, 5)
    if (neighbors.length !== 5) throw new Error(`[geometry] icosahedron vertex degree ${neighbors.length} != 5`)
    const n = normalize(sub(neighbors[0], v), 1)
    neighbors.sort((a, b) => {
      const pa = normalize(sub(a, v), 1)
      const pb = normalize(sub(b, v), 1)
      const sin = dot(cross(n, pa), pb)
      const cos = dot(pa, pb)
      return Math.atan2(sin, cos)
    })
    for (let i = 0; i < 5; i++) {
      faces.push([v, neighbors[i], neighbors[(i + 1) % 5]])
    }
  }
  // 去重（每面 3 个顶点各生成一次）
  const key = (f: Vec3[]): string => f.map((p) => vertices.indexOf(p)).sort((x, y) => x - y).join(',')
  const seen = new Set<string>()
  const out: [Vec3, Vec3, Vec3][] = []
  for (const f of faces) {
    const k = key(f)
    if (seen.has(k)) continue
    seen.add(k)
    // 保证外法线朝外（顶点在单位球面，面心指向外）
    const c = normalize(add(add(f[0], f[1]), f[2]), 1)
    const n = cross(sub(f[1], f[0]), sub(f[2], f[0]))
    out.push(dot(n, c) > 0 ? f : [f[0], f[2], f[1]])
  }
  if (out.length !== 20) throw new Error(`[geometry] icosahedron faces ${out.length} != 20`)
  return out
}

/**
 * 标准截角二十面体。radius = 外接球半径（≈ 用户确认的足球外径一半）。
 */
export function truncatedIcosahedron(radius: number): TruncatedIcosahedron {
  if (!(radius > 0)) throw new Error('[geometry] radius must be positive')
  const v = icosahedronVertices(radius)
  const triFaces = icosahedronFaces(v)

  // 唯一边（无向），每条边生成两个截角顶点
  const edgeKey = (a: Vec3, b: Vec3): string => {
    const ia = v.indexOf(a)
    const ib = v.indexOf(b)
    return ia < ib ? `${ia},${ib}` : `${ib},${ia}`
  }
  const edgeMap = new Map<string, { a: Vec3; b: Vec3; t1: Vec3; t2: Vec3 }>()
  for (const f of triFaces) {
    for (let i = 0; i < 3; i++) {
      const a = f[i]
      const b = f[(i + 1) % 3]
      const k = edgeKey(a, b)
      if (edgeMap.has(k)) continue
      edgeMap.set(k, {
        a,
        b,
        // t1 近 a、t2 近 b；三等分后归一化回球面
        t1: normalize(add(scale(a, 2), b), radius),
        t2: normalize(add(a, scale(b, 2)), radius)
      })
    }
  }

  // 截角顶点 → 索引（有向近端点：near(a,b) = 边 (a,b) 中近 a 的截角点）
  const vertexList: Vec3[] = []
  const near = new Map<string, number>()
  const keyOf = (p: Vec3): string => `${v.indexOf(p)}`
  for (const [k, e] of edgeMap) {
    const ia = v.indexOf(e.a)
    const ib = v.indexOf(e.b)
    const iT1 = vertexList.length
    vertexList.push(e.t1)
    const iT2 = vertexList.length
    vertexList.push(e.t2)
    near.set(`${ia}:${ib}`, iT1) // 近 a
    near.set(`${ib}:${ia}`, iT2) // 近 b
    void k
    void keyOf
  }
  if (vertexList.length !== 60) throw new Error(`[geometry] truncated vertices ${vertexList.length} != 60`)

  // 五边形：原顶点 p 的 5 条入射边的近 p 截角点，绕 p 径向排序
  const faces: PolyFace[] = []
  for (const p of v) {
    const inc = [...edgeMap.values()].filter((e) => e.a === p || e.b === p)
    if (inc.length !== 5) throw new Error(`[geometry] incident edges ${inc.length} != 5`)
    const n = normalize(p, 1)
    const first = inc[0].a === p ? inc[0].b : inc[0].a
    const ref = normalize(sub(first, p), 1)
    inc.sort((x, y) => {
      const wa = x.a === p ? x.b : x.a
      const wb = y.a === p ? y.b : y.a
      const pa = normalize(sub(wa, p), 1)
      const pb = normalize(sub(wb, p), 1)
      const sin = dot(cross(ref, pa), n)
      const cos = dot(ref, pa)
      const sa = Math.atan2(sin, cos)
      const sin2 = dot(cross(ref, pb), n)
      const cos2 = dot(ref, pb)
      return sa - Math.atan2(sin2, cos2)
    })
    const verts = inc.map((e) => {
      const other = e.a === p ? e.b : e.a
      return vertexList[near.get(`${v.indexOf(p)}:${v.indexOf(other)}`)!]
    })
    faces.push({ kind: 'pentagon', vertices: verts })
  }

  // 六边形：三角形 (a,b,c) 边界上 6 个截角点，凸序
  for (const f of triFaces) {
    const [a, b, c] = f
    const ia = v.indexOf(a)
    const ib = v.indexOf(b)
    const ic = v.indexOf(c)
    const verts = [
      vertexList[near.get(`${ia}:${ib}`)!], // 近 a
      vertexList[near.get(`${ib}:${ia}`)!], // 近 b
      vertexList[near.get(`${ib}:${ic}`)!], // 近 b
      vertexList[near.get(`${ic}:${ib}`)!], // 近 c
      vertexList[near.get(`${ic}:${ia}`)!], // 近 c
      vertexList[near.get(`${ia}:${ic}`)!] // 近 a
    ]
    faces.push({ kind: 'hexagon', vertices: verts })
  }

  // 90 条唯一边：面边去重
  const edgeSet = new Map<string, [Vec3, Vec3]>()
  for (const f of faces) {
    for (let i = 0; i < f.vertices.length; i++) {
      const a = f.vertices[i]
      const b = f.vertices[(i + 1) % f.vertices.length]
      const k = `${vertexList.indexOf(a)},${vertexList.indexOf(b)}`
      const rk = `${vertexList.indexOf(b)},${vertexList.indexOf(a)}`
      const key = k < rk ? k : rk
      if (!edgeSet.has(key)) edgeSet.set(key, [a, b])
    }
  }
  if (edgeSet.size !== 90) throw new Error(`[geometry] unique edges ${edgeSet.size} != 90`)

  return { radius, vertices: vertexList, faces, edges: [...edgeSet.values()] }
}

/**
 * 用 12 个五棱柱和 120 个三棱柱精确覆盖截角二十面体的 32 个面。
 * 资源局部 Y 对齐面外法线，局部 -Z 对齐五边形顶点或三角片的中心顶点。
 */
export function prismPanels(
  ball: TruncatedIcosahedron,
  options: PrismPanelOptions
): PrismPanel[] {
  if (!(options.thickness > 0) || !Number.isFinite(options.surfaceOffset)) {
    throw new Error('[geometry] prism thickness must be positive and surface offset finite')
  }
  const panels: PrismPanel[] = []
  for (const face of ball.faces) {
    const center = scale(
      face.vertices.reduce((sum, vertex) => add(sum, vertex), [0, 0, 0]),
      1 / face.vertices.length
    )
    const yAxis = normalize(center, 1)
    const makePanel = (
      kind: PrismPanel['kind'],
      panelCenter: Vec3,
      targetVertex: Vec3,
      planarScale: number
    ): PrismPanel => {
      const intendedZ = normalize(sub(panelCenter, targetVertex), 1)
      const xAxis = normalize(cross(yAxis, intendedZ), 1)
      const zAxis = normalize(cross(xAxis, yAxis), 1)
      return {
        kind,
        center: add(panelCenter, scale(yAxis, options.surfaceOffset)),
        xAxis,
        yAxis,
        zAxis,
        scale: [planarScale, options.thickness, planarScale]
      }
    }
    if (face.kind === 'pentagon') {
      // 直径语义：外接半径 r -> scale = r / 0.5 = 2r
      panels.push(
        makePanel('pentagon', center, face.vertices[0], 2 * norm(sub(face.vertices[0], center)))
      )
      continue
    }
    for (let index = 0; index < face.vertices.length; index++) {
      const current = face.vertices[index]
      const next = face.vertices[(index + 1) % face.vertices.length]
      const triangleCenter = scale(add(add(center, current), next), 1 / 3)
      // 直径语义：边长 s -> scale = s / 0.866 = 2s/√3
      panels.push(
        makePanel(
          'triangle',
          triangleCenter,
          center,
          (2 / Math.sqrt(3)) * norm(sub(next, current))
        )
      )
    }
  }
  return panels
}

/** 凸多边形内一条竖直线段（u=uc）与多边形边的交点 v 集合。 */
function sliceV(faceVertices: readonly Vec3[], uAxis: Vec3, vAxis: Vec3, center: Vec3, uc: number): [number, number] {
  const values: number[] = []
  const n = faceVertices.length
  for (let i = 0; i < n; i++) {
    const p = faceVertices[i]
    const q = faceVertices[(i + 1) % n]
    const pu = dot(sub(p, center), uAxis)
    const qu = dot(sub(q, center), uAxis)
    if (Math.abs(qu - pu) < 1e-12) continue
    if (uc < Math.min(pu, qu) - 1e-9 || uc > Math.max(pu, qu) + 1e-9) continue
    const t = (uc - pu) / (qu - pu)
    const pv = dot(sub(p, center), vAxis)
    const qv = dot(sub(q, center), vAxis)
    values.push(pv + t * (qv - pv))
  }
  if (values.length < 2) throw new Error(`[geometry] slice u=${uc} produced ${values.length} intersections`)
  return [Math.min(...values), Math.max(...values)]
}

export type FaceCoverOptions = {
  /** 条带目标宽度（米）；实际宽度 = 多边形跨度 / ceil(跨度/宽度) */
  stripWidth: number
  /** 面片厚度（米，压扁方向） */
  thickness: number
  /** 面片中心沿法线向外偏移（米），让面片浮在球面上 */
  surfaceOffset: number
}

/**
 * 用压扁长方体条带确定性覆盖一个凸多边形面：
 * 局部 2D 基（u 推进轴、v 长轴），推进轴取跨度较小的方向（条带数最少），
 * 等分 u 全程 → 条带拼接无缝隙；每条带在中心线 u_c 处与多边形求交得 v 范围。
 */
export function coverFace(face: PolyFace, options: FaceCoverOptions): FaceStrip[] {
  const { stripWidth, thickness, surfaceOffset } = options
  const verts = face.vertices
  // 面中心 = 顶点平均（在面平面内，不归一化——归一化会径向投影到球面，偏离平面）
  const sum = verts.reduce((acc, p) => add(acc, p), [0, 0, 0])
  const center: Vec3 = [sum[0] / verts.length, sum[1] / verts.length, sum[2] / verts.length]
  let normal = normalize(cross(sub(verts[1], verts[0]), sub(verts[2], verts[0])), 1)
  if (dot(normal, center) < 0) normal = scale(normal, -1)
  // 候选基 1：推进 u1=normalize(v0-center)，长轴 v1=N×u1
  let u1 = normalize(sub(verts[0], center), 1)
  let v1 = cross(normal, u1)
  // 候选基 2：交换角色（推进 v1，长轴 u1）
  let push = u1
  let long = v1
  const spanPush = (ax: Vec3): number => {
    const us = verts.map((p) => dot(sub(p, center), ax))
    return Math.max(...us) - Math.min(...us)
  }
  if (spanPush(v1) < spanPush(u1)) {
    push = v1
    long = u1
  }
  const us = verts.map((p) => dot(sub(p, center), push))
  const uMin = Math.min(...us)
  const uMax = Math.max(...us)
  const strips = Math.max(1, Math.ceil((uMax - uMin) / stripWidth))
  const out: FaceStrip[] = []
  for (let i = 0; i < strips; i++) {
    const uLo = uMin + (i * (uMax - uMin)) / strips
    const uHi = uMin + ((i + 1) * (uMax - uMin)) / strips
    const uc = (uLo + uHi) / 2
    const [vLo, vHi] = sliceV(verts, push, long, center, uc)
    const yAxis = normal
    const zAxis = long
    const xAxis = cross(yAxis, zAxis) // 右手系：x = y × z（可能 = ±push，宽度方向对称无妨）
    const center3 = add(add(center, scale(push, uc)), scale(long, (vLo + vHi) / 2))
    out.push({
      center: add(center3, scale(normal, surfaceOffset)),
      xAxis,
      yAxis,
      zAxis,
      width: uHi - uLo,
      thickness,
      length: vHi - vLo
    })
  }
  return out
}

export type EdgeBarOptions = {
  /** 边线截面宽度（米，方形截面） */
  width: number
  /** 边线中心沿径向向外偏移（米） */
  radialOffset: number
}

/** 90 条边线：弦中点，长轴 z=边方向，厚轴 y=径向，x 完成右手系。 */
export function edgeBars(edges: readonly [Vec3, Vec3][], options: EdgeBarOptions): EdgeBar[] {
  const { width, radialOffset } = options
  return edges.map(([p1, p2]) => {
    const mid = scale(add(p1, p2), 0.5)
    const radial = normalize(mid, 1)
    const dir = normalize(sub(p2, p1), 1)
    const length = norm(sub(p2, p1))
    const zAxis = dir
    const yAxis = radial
    const xAxis = cross(yAxis, zAxis)
    return {
      center: add(mid, scale(radial, radialOffset)),
      xAxis,
      yAxis,
      zAxis,
      scale: [width, width, length]
    }
  })
}

/**
 * 局部基（列 = [x,y,z] 世界方向）→ 欧拉角（度）。
 * 编辑器真实规则：YXZ 内旋，R = Ry(β)·Rx(α)·Rz(γ)；面板值 = wire 值。
 */
export type EulerOrder = 'zyx' | 'yxz' | 'xyz'
export const EULER_ORDER: EulerOrder = 'yxz'

export function basisToEuler(x: Vec3, y: Vec3, z: Vec3, order: EulerOrder = EULER_ORDER): Vec3 {
  const rad = (v: number): number => (v * 180) / Math.PI
  const m = [
    [x[0], y[0], z[0]],
    [x[1], y[1], z[1]],
    [x[2], y[2], z[2]]
  ]
  if (order === 'yxz') {
    // R = Ry·Rx·Rz：α=asin(-R12)、β=atan2(R02,R22)、γ=atan2(R10,R11)
    const alpha = Math.asin(Math.min(1, Math.max(-1, -m[1][2])))
    const beta = Math.atan2(m[0][2], m[2][2])
    const cosA = Math.cos(alpha)
    const gamma = Math.abs(cosA) < 1e-6 ? 0 : Math.atan2(m[1][0], m[1][1])
    return [rad(alpha), rad(beta), rad(gamma)]
  }
  if (order === 'zyx') {
    const beta = Math.asin(Math.min(1, Math.max(-1, -m[2][0])))
    const alpha = Math.atan2(m[2][1], m[2][2])
    const gamma = Math.atan2(m[1][0], m[0][0])
    return [rad(alpha), rad(beta), rad(gamma)]
  }
  // xyz: R = Rx·Ry·Rz：β=asin(R02)、α=asin(-R12/cosβ)、γ=atan2(-R01,R00)
  const beta2 = Math.asin(Math.min(1, Math.max(-1, m[0][2])))
  const cosB = Math.cos(beta2)
  const alpha2 =
    Math.abs(cosB) < 1e-6 ? 0 : Math.asin(Math.min(1, Math.max(-1, -m[1][2] / cosB)))
  const gamma2 = Math.abs(cosB) < 1e-6 ? 0 : Math.atan2(-m[0][1], m[0][0])
  return [rad(alpha2), rad(beta2), rad(gamma2)]
}

/** 面覆盖预算摘要（面片条带总数 + 边线数）。 */
export function coverBudget(ball: TruncatedIcosahedron, options: FaceCoverOptions): {
  stripCount: number
  faceStripCount: number
  edgeBarCount: number
  totalAux: number
} {
  const faceStripCount = ball.faces.reduce((acc, f) => acc + coverFace(f, options).length, 0)
  const edgeBarCount = ball.edges.length
  return { stripCount: faceStripCount, faceStripCount, edgeBarCount, totalAux: faceStripCount + edgeBarCount }
}
