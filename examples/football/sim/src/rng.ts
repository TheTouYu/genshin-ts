// 固定种子 PRNG（mulberry32）—— 物理核心唯一随机源（5.2 规则 4）
// [iron:4] 不使用 Math.random；状态可序列化，快照回滚后序列一致。

export class Rng {
  private s: number

  constructor(seed: number) {
    this.s = seed >>> 0
  }

  nextUint32(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0
    let t = this.s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return (t ^ (t >>> 14)) >>> 0
  }

  next(): number {
    return this.nextUint32() / 4294967296
  }

  getState(): number {
    return this.s
  }

  setState(s: number): void {
    this.s = s >>> 0
  }
}
