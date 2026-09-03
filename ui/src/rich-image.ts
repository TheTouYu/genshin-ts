/**
 * ui/src/rich-image.ts — 图文输入框富文本内联图片引擎（票10 · 轮21/22 donor 驱动）
 *
 * 范围（DESIGN §3.4 `update --rich-image`；09 R4 backlog 闭合）：
 *   - setRichImageCandidate：input-box(type45) 的 f19 配置——
 *     · resourceId 给定且 f62 无图 → 插入完整图块（无图态 f62 = 6B {f502:1.0f} →
 *       42B {f501:内层, f502:1.0f}；内层 = {f1:宿主ID, f3:资源ID, f4:{f501:2^64-1},
 *       f8:空, f9:1.0f, f10:1}——轮21 实读，+47B 记录增量）；
 *     · resourceId 给定且 f62 已有图 → 内层 f3 单点换资源（轮22：100101→100102 等长）；
 *     · text 给定 → f505 = {f501: utf8}（富文本插值 {5:img_N} 原文透传，轮21 语义）。
 *   - 嵌套区含 2^64-1 哨兵（f4.f501）→ 一律 wire-safe 层手术（unsafe 重发必损坏）。
 * 多图（{5:img_2}+）无 donor → slot>1 fail-closed。
 */

import { parseRoot9 } from './record.js'
import { ownIdOf, withSection } from './section-ops.js'
import { emitSafe, parseSafe, safeNum, s0, s2, type SafeField } from './wire-safe.js'

const SENTINEL_UINT64 = 18446744073709551615n

export interface RichImageOptions {
  /** 图文输入框记录 ID */
  targetId: number
  /** 富文本（含 {5:img_N} 插值原文透传；只写 f505，不拆插值） */
  text?: string
  /** 官方图形池资源 ID（100101 类）；给定即插/换 f62 内层 f3 */
  resourceId?: number
  /** 图片槽序号（{5:img_N} 的 N；本票仅 1，多图无 donor fail-closed） */
  slot?: number
}

export interface RichImageResult {
  bytes: Uint8Array
  targetId: number
  action: 'insert' | 'swap' | 'text-only'
  resourceId?: number
}

export function setRichImageCandidate(
  sourceBytes: Uint8Array,
  options: RichImageOptions
): RichImageResult {
  if (options.text === undefined && options.resourceId === undefined) {
    throw new Error('[error] 需要至少 --text 或 --rich-image')
  }
  const slot = options.slot ?? 1
  if (slot !== 1) {
    throw new Error(`[error] 图片槽 #${slot} 无 donor（多图未差分）——fail-closed`)
  }
  const parsed = parseRoot9(sourceBytes)
  const target = parsed.recordsById.get(options.targetId)
  if (!target) throw new Error(`[error] 目标控件不存在: ${options.targetId}`)
  if (!target.compTypes.includes(45)) {
    throw new Error(`[error] ${options.targetId} 不是图文输入框（无 type45）`)
  }
  let action: RichImageResult['action'] = 'text-only'
  const bytes = withSection(sourceBytes, (section) => {
    const field = section.find((f) => ownIdOf(f) === options.targetId)
    if (!field) throw new Error(`[error] 目标字段未找到: ${options.targetId}`)
    const recordFields = parseSafe(field.value as Uint8Array)
    if (!recordFields) throw new Error('[error] 记录解析失败')
    // 定位 type45 → f503 → f19（保留逐层引用供回发）
    let hit = false
    for (const f of recordFields) {
      if (f.number !== 505 || f.wire !== 2) continue
      const comp = parseSafe(f.value as Uint8Array)
      if (!comp || safeNum(comp, 502) !== 45) continue
      const f503 = comp.find((x) => x.number === 503 && x.wire === 2)
      const f503m = f503 ? parseSafe(f503.value as Uint8Array) : undefined
      const f19 = f503m?.find((x) => x.number === 19 && x.wire === 2)
      const f19m = f19 ? parseSafe(f19.value as Uint8Array) : undefined
      if (!f503 || !f503m || !f19 || !f19m) continue
      // f505 文本
      if (options.text !== undefined) {
        const textBytes = new Uint8Array(Buffer.from(options.text, 'utf8'))
        const f505 = f19m.find((x) => x.number === 505 && x.wire === 2)
        if (f505) f505.value = emitSafe([s2(501, textBytes)])
        else f19m.push(s2(505, emitSafe([s2(501, textBytes)])))
      }
      // f62 图块
      if (options.resourceId !== undefined) {
        const f62 = f19m.find((x) => x.number === 62 && x.wire === 2)
        const f62m = f62 ? parseSafe(f62.value as Uint8Array) : undefined
        const existingInner = f62m?.find((x) => x.number === 501 && x.wire === 2)
        if (existingInner) {
          // 换资源：内层 f3 单点（轮22 等长语义），逐层回发
          const inner = parseSafe(existingInner.value as Uint8Array)!
          const f3 = inner.find((x) => x.number === 3 && x.wire === 0)
          if (!f3) throw new Error('[error] f62 内层缺 f3 资源 ID——fail-closed')
          f3.value = options.resourceId
          existingInner.value = emitSafe(inner)
          f62!.value = emitSafe(f62m!)
          action = 'swap'
        } else {
          // 插入完整图块（轮21 +42B f62 / +47B 记录）
          const f32 = (v: number): Uint8Array => {
            const buf = Buffer.alloc(4)
            buf.writeFloatLE(v)
            return new Uint8Array(buf)
          }
          const inner = emitSafe([
            s0(1, options.targetId),
            s0(3, options.resourceId),
            s2(4, emitSafe([s0(501, SENTINEL_UINT64)])),
            s2(8, new Uint8Array(0)),
            { number: 9, wire: 5, value: f32(1.0) },
            s0(10, 1)
          ])
          const block = emitSafe([s2(501, inner), { number: 502, wire: 5, value: f32(1.0) }])
          if (f62) {
            // 无图态 f62 = {f502:1.0f}（6B）→ 完整块替换（保序：f501 在前）
            f62.value = block
          } else {
            f19m.push(s2(62, block))
          }
          action = 'insert'
        }
      }
      f19.value = emitSafe(f19m)
      f503.value = emitSafe(f503m)
      f.value = emitSafe(comp)
      field.value = emitSafe(recordFields)
      hit = true
      break
    }
    if (!hit) throw new Error('[error] type45.f503.f19 文本配置缺失——fail-closed')
  })
  return {
    bytes,
    targetId: options.targetId,
    action,
    ...(options.resourceId !== undefined ? { resourceId: options.resourceId } : {})
  }
}
