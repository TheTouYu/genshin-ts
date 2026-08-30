// 遥测（5.2 规则 7）：每 tick 记录 {t, state, pos, quat, v, ω, active_forces, contact_normal,
// penetration, v_slip} 到环形缓冲；可导出 CSV/JSON；轨迹哈希逐 tick 覆盖状态序列。

import { Hash64 } from './hash.js'

export interface TelemetryRecord {
  t: number
  tick: number
  /** 状态机状态（impact tick 显示 BOUNCING 瞬态） */
  state: number
  px: number
  py: number
  pz: number
  qw: number
  qx: number
  qy: number
  qz: number
  vx: number
  vy: number
  vz: number
  wx: number
  wy: number
  wz: number
  forces: number
  cnx: number
  cny: number
  cnz: number
  hasContact: number
  penetration: number
  vSlip: number
}

export class Telemetry {
  private recs: TelemetryRecord[] = []
  private cap: number

  constructor(cap = 1 << 20) {
    this.cap = cap
  }

  push(r: TelemetryRecord): void {
    this.recs.push(r)
    if (this.recs.length > this.cap) this.recs.splice(0, this.recs.length - this.cap)
  }

  get length(): number {
    return this.recs.length
  }

  at(i: number): TelemetryRecord {
    return this.recs[i]
  }

  all(): readonly TelemetryRecord[] {
    return this.recs
  }

  toCSV(stateNames: string[]): string {
    let out =
      't,tick,state,px,py,pz,qw,qx,qy,qz,vx,vy,vz,wx,wy,wz,forces,forcesNames,cnx,cny,cnz,hasContact,penetration,vSlip\n'
    for (const r of this.recs) {
      out +=
        r.t.toFixed(6) + ',' + r.tick + ',' + stateNames[r.state] +
        ',' + r.px.toFixed(6) + ',' + r.py.toFixed(6) + ',' + r.pz.toFixed(6) +
        ',' + r.qw.toFixed(6) + ',' + r.qx.toFixed(6) + ',' + r.qy.toFixed(6) + ',' + r.qz.toFixed(6) +
        ',' + r.vx.toFixed(6) + ',' + r.vy.toFixed(6) + ',' + r.vz.toFixed(6) +
        ',' + r.wx.toFixed(6) + ',' + r.wy.toFixed(6) + ',' + r.wz.toFixed(6) +
        ',' + r.forces + ',"' + forceNames(r.forces) + '"' +
        ',' + r.cnx.toFixed(6) + ',' + r.cny.toFixed(6) + ',' + r.cnz.toFixed(6) +
        ',' + r.hasContact + ',' + r.penetration.toFixed(6) + ',' + r.vSlip.toFixed(6) + '\n'
    }
    return out
  }
}

const FORCE_FLAG_NAMES: [number, string][] = [
  [1, 'GRAVITY'],
  [2, 'DRAG'],
  [4, 'MAGNUS'],
  [8, 'SPIN_DECAY'],
  [16, 'CONTACT_NORMAL'],
  [32, 'IMPACT_FRICTION'],
  [64, 'SLIDE_FRICTION'],
  [128, 'ROLL_RESIST'],
  [256, 'SUPPORT'],
  [512, 'DEPENETRATE'],
  [1024, 'IMPULSE'],
  [2048, 'EXT_FORCE'],
  [4096, 'CLAMP']
]

function forceNames(bits: number): string {
  const names: string[] = []
  for (const [m, n] of FORCE_FLAG_NAMES) if ((bits & m) !== 0) names.push(n)
  return names.join('|')
}

/** 轨迹哈希：tick、状态、pos/quat/v/ω、力位掩码（状态序列逐 tick 哈希） */
export function hashRecord(h: Hash64, r: TelemetryRecord): void {
  h.updateU32(r.tick)
  h.updateU32(r.state)
  h.updateF64Array([
    r.px, r.py, r.pz,
    r.qw, r.qx, r.qy, r.qz,
    r.vx, r.vy, r.vz,
    r.wx, r.wy, r.wz
  ])
  h.updateU32(r.forces >>> 0)
}
