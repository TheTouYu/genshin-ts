// FNV-1a 64 位确定性哈希 —— 轨迹哈希工具（5.2 规则 7）
// 对状态序列逐 tick 哈希：浮点按 IEEE754 位模式（小端字节序）入哈希，
// 同平台同输入逐位一致；哈希状态可序列化（快照回滚，D2）。

const FNV_OFFSET = 0xcbf29ce484222325n
const FNV_PRIME = 0x100000001b3n
const MASK64 = 0xffffffffffffffffn

export class Hash64 {
  private h: bigint

  constructor(stateHex?: string) {
    this.h = stateHex ? BigInt('0x' + stateHex) : FNV_OFFSET
  }

  updateByte(b: number): void {
    this.h = ((this.h ^ BigInt(b & 0xff)) * FNV_PRIME) & MASK64
  }

  updateBytesLE(view: DataView, byteLength: number): void {
    for (let i = 0; i < byteLength; i++) this.updateByte(view.getUint8(i))
  }

  updateF64(x: number): void {
    const buf = new DataView(new ArrayBuffer(8))
    buf.setFloat64(0, x, true)
    this.updateBytesLE(buf, 8)
  }

  updateF64Array(xs: readonly number[]): void {
    const buf = new DataView(new ArrayBuffer(8))
    for (const x of xs) {
      buf.setFloat64(0, x, true)
      this.updateBytesLE(buf, 8)
    }
  }

  updateU32(x: number): void {
    const buf = new DataView(new ArrayBuffer(4))
    buf.setUint32(0, x >>> 0, true)
    this.updateBytesLE(buf, 4)
  }

  updateStr(s: string): void {
    for (let i = 0; i < s.length; i++) this.updateByte(s.charCodeAt(i))
  }

  hex(): string {
    return this.h.toString(16).padStart(16, '0')
  }
}
