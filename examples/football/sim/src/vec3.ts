// 确定性三维向量/四元数数学 —— 足球物理核心专用
// [iron:7] 物理核心与渲染解耦：本模块是纯函数算术库，不依赖渲染、时钟、GPU、DOM。
// 确定性声明：仅使用 + - * / 与 Math.sqrt/Math.abs/Math.pow/Math.PI（同平台同构建逐位一致）。
// 坐标系（4.1）：X=右，Y=上，Z=前；叉积按右手分量代数（x̂×ŷ=ẑ）。

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface Quat {
  x: number
  y: number
  z: number
  w: number
}

export const vec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z })

export const quat = (x = 0, y = 0, z = 0, w = 1): Quat => ({ x, y, z, w })

export const vClone = (a: Vec3): Vec3 => ({ x: a.x, y: a.y, z: a.z })

export const vAdd = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })

export const vSub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })

export const vScale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s })

export const vDot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z

export const vCross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x
})

export const vLenSq = (a: Vec3): number => a.x * a.x + a.y * a.y + a.z * a.z

export const vLen = (a: Vec3): number => Math.sqrt(vLenSq(a))

export const vDist = (a: Vec3, b: Vec3): number => vLen(vSub(a, b))

// 零向量返回零向量（调用方场景保证非零；这里不抛错以保持纯函数性）
export const vNorm = (a: Vec3): Vec3 => {
  const l = vLen(a)
  if (l === 0) return { x: 0, y: 0, z: 0 }
  return { x: a.x / l, y: a.y / l, z: a.z / l }
}

// 去除沿法线 n 的分量（切向投影）
export const vTangent = (a: Vec3, n: Vec3): Vec3 => vSub(a, vScale(n, vDot(a, n)))

export const vLerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t
})

export const vIsFinite = (a: Vec3): boolean =>
  Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z)

export const clamp = (x: number, lo: number, hi: number): number =>
  x < lo ? lo : x > hi ? hi : x

// 四元数运动学积分：q ← normalize(q + ½·h·(q ⊗ (0, ω)))
// 球姿态仅用于遥测/回放表现，不参与力求解（球是各向同性刚体）
export function integrateQuat(q: Quat, w: Vec3, h: number): Quat {
  const dx = q.w * w.x + q.y * w.z - q.z * w.y
  const dy = q.w * w.y + q.z * w.x - q.x * w.z
  const dz = q.w * w.z + q.x * w.y - q.y * w.x
  const dw = -(q.x * w.x + q.y * w.y + q.z * w.z)
  let nx = q.x + 0.5 * h * dx
  let ny = q.y + 0.5 * h * dy
  let nz = q.z + 0.5 * h * dz
  let nw = q.w + 0.5 * h * dw
  const l = Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw)
  if (l > 0) {
    nx /= l
    ny /= l
    nz /= l
    nw /= l
  }
  return { x: nx, y: ny, z: nz, w: nw }
}
