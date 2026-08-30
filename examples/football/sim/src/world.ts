// 物理世界：地面（可倾斜）、四面墙、球门（门柱/横梁胶囊 + 球网平面）、进球判定
// 坐标系（4.1）：X=右，Y=上，Z=前（射门方向 +Z）；游戏内图 X=纵深 ↔ 本核心 Z（移植映射见 README）。

import { BallBody } from './state.js'
import { PhysicsParams, SurfaceParams } from './params.js'
import { Vec3, vec3 } from './vec3.js'

export type SurfaceKey = 'hard' | 'grass' | 'wall' | 'post' | 'net' | 'ballBall'

/**
 * 平面碰撞体：法线指向球允许存在的一侧。
 * 约束：n·p − offset ≤ −r（球未穿透）；接触条件 n·p − offset < r。
 */
export interface PlaneCollider {
  kind: 'plane'
  normal: Vec3
  offset: number
  surfaceKey: SurfaceKey
  tag: string
  /** 生效区域（球心位于区域内才检测；球网侧/顶面用） */
  region?: {
    xMin?: number
    xMax?: number
    zMin?: number
    zMax?: number
    yMin?: number
    yMax?: number
  }
}

/** 胶囊碰撞体：门柱（竖直）/横梁（水平），半径 = 柱半径 */
export interface CapsuleCollider {
  kind: 'capsule'
  a: Vec3
  b: Vec3
  radius: number
  surfaceKey: SurfaceKey
  tag: string
}

export type Collider = PlaneCollider | CapsuleCollider

export interface GoalDef {
  /** 门线 z（开口朝 −Z，射门沿 +Z 打向门） */
  lineZ: number
  /** 半门宽（门柱中心 |x|） */
  halfWidth: number
  /** 横梁中心高 */
  barY: number
  /** 门柱/横梁半径 */
  postRadius: number
  /** 球网深 */
  depth: number
}

export interface WorldDef {
  /** 地面法线（默认 (0,1,0)；C4 斜坡绕 X 轴倾斜） */
  groundNormal?: Vec3
  /** 地面参考点（默认原点） */
  groundPoint?: Vec3
  /** 地面表面（默认 grass） */
  surfaceKey?: SurfaceKey
  /** 四面墙（草地边界） */
  walls?: { xMin?: number; xMax?: number; zMin?: number; zMax?: number }
  /** 球门（lineZ 必填，其余 FIFA 默认） */
  goal?: { lineZ: number; halfWidth?: number; barY?: number; postRadius?: number; depth?: number } | null
  /** 无地面（A1/A2/A3 解析解场景） */
  disableGround?: boolean
}

export class PhysicsWorld {
  readonly groundNormal: Vec3
  readonly groundPoint: Vec3
  readonly groundSurfaceKey: SurfaceKey
  readonly hasGround: boolean
  readonly colliders: Collider[] = []
  goal: GoalDef | null = null

  constructor(def: WorldDef) {
    this.groundNormal = def.groundNormal ? vec3(def.groundNormal.x, def.groundNormal.y, def.groundNormal.z) : vec3(0, 1, 0)
    this.groundPoint = def.groundPoint ? vec3(def.groundPoint.x, def.groundPoint.y, def.groundPoint.z) : vec3(0, 0, 0)
    this.groundSurfaceKey = def.surfaceKey ?? 'grass'
    this.hasGround = def.disableGround !== true
    if (def.walls) this.buildWalls(def.walls)
    if (def.goal) this.buildGoal(def.goal)
  }

  private buildWalls(w: NonNullable<WorldDef['walls']>): void {
    if (w.xMin !== undefined) {
      this.colliders.push({ kind: 'plane', normal: vec3(1, 0, 0), offset: w.xMin, surfaceKey: 'wall', tag: 'wall-xmin' })
    }
    if (w.xMax !== undefined) {
      this.colliders.push({ kind: 'plane', normal: vec3(-1, 0, 0), offset: -w.xMax, surfaceKey: 'wall', tag: 'wall-xmax' })
    }
    if (w.zMin !== undefined) {
      this.colliders.push({ kind: 'plane', normal: vec3(0, 0, 1), offset: w.zMin, surfaceKey: 'wall', tag: 'wall-zmin' })
    }
    if (w.zMax !== undefined) {
      this.colliders.push({ kind: 'plane', normal: vec3(0, 0, -1), offset: -w.zMax, surfaceKey: 'wall', tag: 'wall-zmax' })
    }
  }

  private buildGoal(gd: NonNullable<WorldDef['goal']>): void {
    const hw = gd.halfWidth ?? 3.66
    const barY = gd.barY ?? 2.44
    const pr = gd.postRadius ?? 0.06
    const depth = gd.depth ?? 1.8
    this.goal = { lineZ: gd.lineZ, halfWidth: hw, barY, postRadius: pr, depth }
    // 门柱 ×2（竖直胶囊）+ 横梁（水平胶囊）
    this.colliders.push({
      kind: 'capsule',
      a: vec3(-hw, 0, gd.lineZ),
      b: vec3(-hw, barY, gd.lineZ),
      radius: pr,
      surfaceKey: 'post',
      tag: 'post-left'
    })
    this.colliders.push({
      kind: 'capsule',
      a: vec3(hw, 0, gd.lineZ),
      b: vec3(hw, barY, gd.lineZ),
      radius: pr,
      surfaceKey: 'post',
      tag: 'post-right'
    })
    this.colliders.push({
      kind: 'capsule',
      a: vec3(-hw, barY, gd.lineZ),
      b: vec3(hw, barY, gd.lineZ),
      radius: pr,
      surfaceKey: 'post',
      tag: 'crossbar'
    })
    // 球网：背面 + 两侧（仅门线之后区域生效，强阻尼表面）。
    // 不建网顶：越过横梁上方的球应正常飞过（真实球网为斜兜，简化不拦截上方来球——README 已记录）
    const zBack = gd.lineZ + depth
    this.colliders.push({
      kind: 'plane',
      normal: vec3(0, 0, -1),
      offset: -zBack,
      surfaceKey: 'net',
      tag: 'net-back',
      region: { xMin: -hw - 1, xMax: hw + 1, yMin: -1, yMax: barY + 1 }
    })
    this.colliders.push({
      kind: 'plane',
      normal: vec3(1, 0, 0),
      offset: -hw,
      surfaceKey: 'net',
      tag: 'net-left',
      region: { zMin: gd.lineZ, zMax: zBack + 1, yMin: -1, yMax: barY + 1 }
    })
    this.colliders.push({
      kind: 'plane',
      normal: vec3(-1, 0, 0),
      offset: hw,
      surfaceKey: 'net',
      tag: 'net-right',
      region: { zMin: gd.lineZ, zMax: zBack + 1, yMin: -1, yMax: barY + 1 }
    })
  }

  surfaceOf(params: PhysicsParams, key: SurfaceKey): SurfaceParams {
    return params.surfaces[key]
  }

  /** 球心相对地面的有向距离（沿法线；= 球底间隙 + r） */
  groundHeight(pos: { x: number; y: number; z: number }): number {
    const n = this.groundNormal
    const p = this.groundPoint
    return (
      (pos.x - p.x) * n.x + (pos.y - p.y) * n.y + (pos.z - p.z) * n.z
    )
  }
}

/** 进球判定：球心完全越线（z > lineZ + r）且整体在门框内（|x| < hw − r, y < barY − r） */
export function goalCheck(ball: BallBody, world: PhysicsWorld, ballRadius: number): boolean {
  const g = world.goal
  if (!g) return false
  if (ball.pos.z <= g.lineZ + ballRadius) return false
  if (Math.abs(ball.pos.x) >= g.halfWidth - ballRadius) return false
  if (ball.pos.y >= g.barY - ballRadius) return false
  return true
}
