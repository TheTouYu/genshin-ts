/**
 * flatten-empty-model — 把「空模型 + 装饰物」场景实体压扁（scale.y → targetScaleY），
 * 同时对它挂接的每个装饰物 aux 记录做 pos.y 与 scale.y ×(1/targetScaleY) 补偿，
 * 使装饰物世界尺寸/高度完全不变（消除空模型碰撞体把出生点顶起一格）。
 *
 * 用法：
 *   npx tsx examples/football/scripts/flatten-empty-model.ts <gil> <entityId> <targetScaleY> [--write] [--out <候选路径>]
 *
 * 行为：
 *   1. 设实体 f6.f11.f3.y = targetScaleY；
 *   2. 对实体 f5{f1=40}.f50.f501 列出的每个 root27 实例侧 aux 记录：
 *      f5{f1=1}.f11 的 pos.y 与 scale.y 各乘 1/targetScaleY；
 *   3. 全部字节等长替换：先断言每条记录修改前后长度一致，再断言候选与源的差异区间
 *      全部落在目标记录区间内（未涉及记录逐字节相同），任一失败报错退出；
 *   4. 自检：候选回读后逐 aux 验证 (pos.y × targetScaleY, scale.y × targetScaleY)
 *      与源原始值误差 < 1e-4；
 *   5. --write 落盘前自动备份源文件到 <gil 所在目录>/.gsts/backups/。
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseWireMessage } from '/home/h/genshin-ts/src/cli/static_assembly/wire.js'
import {
  readEntityAuxIds,
  readTransform,
  setTransform
} from '/home/h/genshin-ts/src/cli/gil_entities.js'

const ERROR_TOLERANCE = 1e-4

interface Span {
  num: number
  wire: number
  start: number
  end: number
}

function readVarintAt(buf: Buffer, off: number): { value: number; next: number } {
  let result = 0
  let shift = 0
  let pos = off
  for (;;) {
    if (pos >= buf.length) throw new Error(`varint out of range at ${off}`)
    const b = buf[pos]!
    result += (b & 0x7f) * Math.pow(2, shift)
    pos += 1
    if ((b & 0x80) === 0) return { value: result, next: pos }
    shift += 7
    if (shift > 42) throw new Error(`varint too long at ${off}`)
  }
}

/** protobuf message 内部的字段字节区间（只用于 message 内部，不用于 GIL 顶层容器分块）。 */
function messageSpans(bytes: Uint8Array): Span[] {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const out: Span[] = []
  let off = 0
  while (off < bytes.length) {
    const key = readVarintAt(buf, off)
    const num = key.value >>> 3
    const wire = key.value & 7
    let end: number
    if (wire === 0) end = readVarintAt(buf, key.next).next
    else if (wire === 1) end = key.next + 8
    else if (wire === 5) end = key.next + 4
    else if (wire === 2) {
      const len = readVarintAt(buf, key.next)
      end = len.next + len.value
    } else throw new Error(`unsupported wire type ${wire} at ${off}`)
    out.push({ num, wire, start: off, end })
    off = end
  }
  return out
}

/** wire=2 字段的 value 子区间（跳过 key varint + len varint）。 */
function spanValueSpan(buf: Buffer, span: Span): { start: number; end: number } {
  if (span.wire !== 2) throw new Error('spanValueSpan on non-length-delimited field')
  const key = readVarintAt(buf, span.start)
  const len = readVarintAt(buf, key.next)
  return { start: len.next, end: span.end }
}

/** 双路对齐：messageSpans 的逐字段字节必须与 parseWireMessage 完全一致，否则拒绝操作。 */
function assertSpansMatchParse(bytes: Uint8Array, spans: Span[]): void {
  const parsed = parseWireMessage(bytes)
  if (!parsed) throw new Error('parseWireMessage failed on a section we are about to patch')
  if (parsed.length !== spans.length) {
    throw new Error(`span/parse count mismatch: ${spans.length} vs ${parsed.length}`)
  }
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let i = 0; i < spans.length; i += 1) {
    const span = spans[i]!
    const field = parsed[i]!
    if (span.num !== field.number || span.wire !== field.wire) {
      throw new Error(`span/parse field mismatch at index ${i}`)
    }
    if (field.wire === 2) {
      const value = spanValueSpan(buf, span)
      const spanBytes = bytes.subarray(value.start, value.end)
      const fieldBytes = field.value as Uint8Array
      if (spanBytes.length !== fieldBytes.length) {
        throw new Error(`span/parse value length mismatch at index ${i}`)
      }
      for (let k = 0; k < spanBytes.length; k += 1) {
        if (spanBytes[k] !== fieldBytes[k]) {
          throw new Error(`span/parse value bytes mismatch at index ${i}`)
        }
      }
    }
  }
}

interface Patch {
  kind: 'entity' | 'aux'
  id: number
  resourceId?: number
  at: number
  end: number
  oldLen: number
  newLen: number
  oldPosY?: number
  newPosY?: number
  oldScaleY?: number
  newScaleY?: number
}

function diffRanges(a: Buffer, b: Buffer): Array<{ start: number; end: number }> {
  if (a.length !== b.length) throw new Error(`file length changed ${a.length} → ${b.length}`)
  const ranges: Array<{ start: number; end: number }> = []
  let i = 0
  while (i < a.length) {
    if (a[i] === b[i]) {
      i += 1
      continue
    }
    const start = i
    while (i < a.length && a[i] !== b[i]) i += 1
    ranges.push({ start, end: i })
  }
  return ranges
}

function floatEq(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) < tolerance
}

function main(): void {
  const args = process.argv.slice(2)
  const write = args.includes('--write')
  const positional = args.filter((a) => a !== '--write' && a !== '--out')
  const outIndex = args.indexOf('--out')
  const outOverride = outIndex >= 0 ? args[outIndex + 1] : undefined
  const [gilText, entityIdText, targetYText] = positional as [string, string, string]
  if (!gilText || !entityIdText || !targetYText) {
    console.error('usage: flatten-empty-model.ts <gil> <entityId> <targetScaleY> [--write] [--out <path>]')
    process.exit(2)
  }
  const entityId = Number(entityIdText)
  const targetScaleY = Number(targetYText)
  if (!Number.isFinite(targetScaleY) || targetScaleY <= 0) {
    throw new Error(`invalid targetScaleY: ${targetYText}`)
  }
  const factor = 1 / targetScaleY

  const srcBuf = Buffer.from(fs.readFileSync(gilText))
  const payloadBytes = new Uint8Array(srcBuf.subarray(20, srcBuf.length - 4))
  const payloadBuf = Buffer.from(
    payloadBytes.buffer,
    payloadBytes.byteOffset,
    payloadBytes.byteLength
  )
  const topSpans = messageSpans(payloadBytes)
  assertSpansMatchParse(payloadBytes, topSpans)

  // ---- 定位 root5 实体记录（在 root5.value 内部按 span 定位，避免字节重复撞位） ----
  const r5span = topSpans.find((s) => s.num === 5 && s.wire === 2)
  if (!r5span) throw new Error('root5 section not found')
  const GIL_HEADER = 20
  const r5valueStart = spanValueSpan(payloadBuf, r5span).start
  const r5value = payloadBytes.subarray(r5valueStart, spanValueSpan(payloadBuf, r5span).end)
  const r5valueBuf = Buffer.from(r5value.buffer, r5value.byteOffset, r5value.byteLength)
  const r5spans = messageSpans(r5value)
  assertSpansMatchParse(r5value, r5spans)
  let entitySpan: Span | undefined
  for (const span of r5spans) {
    if (span.num !== 1 || span.wire !== 2) continue
    const v = spanValueSpan(r5valueBuf, span)
    const rec = r5value.subarray(v.start, v.end)
    const fields = parseWireMessage(rec)
    const f1 = fields?.find((x) => x.number === 1 && x.wire === 0)
    if (f1?.value === entityId) {
      if (entitySpan) throw new Error(`entity ${entityId} appears twice in root5`)
      entitySpan = span
    }
  }
  if (!entitySpan) throw new Error(`entity ${entityId} not found in root5`)
  const entityValueSpan = spanValueSpan(r5valueBuf, entitySpan)
  const entityAt = GIL_HEADER + r5valueStart + entityValueSpan.start
  const entityRecBytes = r5value.subarray(entityValueSpan.start, entityValueSpan.end)

  // ---- 实体 scale.y 补丁 ----
  const entityTf = readTransform(entityRecBytes, 6)
  const entityPatched = setTransform(
    entityRecBytes,
    {
      position: entityTf.position,
      rotation: entityTf.rotation,
      scale: [entityTf.scale[0], targetScaleY, entityTf.scale[2]]
    },
    6
  )
  if (entityPatched.length !== entityRecBytes.length) {
    throw new Error(
      `entity record length changed: ${entityRecBytes.length} → ${entityPatched.length}`
    )
  }
  const patches: Patch[] = [
    {
      kind: 'entity',
      id: entityId,
      at: entityAt,
      end: entityAt + entityRecBytes.length,
      oldLen: entityRecBytes.length,
      newLen: entityPatched.length
    }
  ]

  // ---- 收集 root27 实例侧 aux 记录（全部顶层 27 段） ----
  const auxBytesById = new Map<number, { bytes: Uint8Array; at: number }>()
  for (const span of topSpans) {
    if (span.num !== 27 || span.wire !== 2) continue
    const v = spanValueSpan(payloadBuf, span)
    const value = payloadBytes.subarray(v.start, v.end)
    const valueBuf = Buffer.from(value.buffer, value.byteOffset, value.byteLength)
    const spans = messageSpans(value)
    assertSpansMatchParse(value, spans)
    for (const s of spans) {
      if (s.num !== 2 || s.wire !== 2) continue
      const sv = spanValueSpan(valueBuf, s)
      const rec = value.subarray(sv.start, sv.end)
      const f1 = parseWireMessage(rec)?.find((x) => x.number === 1 && x.wire === 0)
      if (!f1 || typeof f1.value !== 'number') continue
      const auxId = f1.value
      if (auxBytesById.has(auxId)) throw new Error(`duplicate inst-side aux id ${auxId}`)
      auxBytesById.set(auxId, { bytes: rec, at: GIL_HEADER + v.start + sv.start })    }
  }
  console.log(`inst-side aux records indexed: ${auxBytesById.size}`)

  // ---- aux 补丁 ----
  const auxIds = readEntityAuxIds(entityRecBytes)
  console.log(`entity ${entityId}: ${auxIds.length} aux refs, scale.y ${entityTf.scale[1]} → ${targetScaleY}`)
  const originalValues = new Map<number, { posY: number; scaleY: number }>()
  for (const auxId of auxIds) {
    const entry = auxBytesById.get(auxId)
    if (!entry) throw new Error(`aux ${auxId} referenced by entity but not found in root27`)
    const fields = parseWireMessage(entry.bytes)
    const res = fields?.find((x) => x.number === 2 && x.wire === 0)?.value
    const tf = readTransform(entry.bytes, 5)
    originalValues.set(auxId, { posY: tf.position[1], scaleY: tf.scale[1] })
    const patched = setTransform(
      entry.bytes,
      {
        position: [tf.position[0], tf.position[1] * factor, tf.position[2]],
        rotation: tf.rotation,
        scale: [tf.scale[0], tf.scale[1] * factor, tf.scale[2]]
      },
      5
    )
    if (patched.length !== entry.bytes.length) {
      throw new Error(`aux ${auxId} record length changed: ${entry.bytes.length} → ${patched.length}`)
    }
    patches.push({
      kind: 'aux',
      id: auxId,
      resourceId: typeof res === 'number' ? res : undefined,
      at: entry.at,
      end: entry.at + entry.bytes.length,
      oldLen: entry.bytes.length,
      newLen: patched.length,
      oldPosY: tf.position[1],
      newPosY: tf.position[1] * factor,
      oldScaleY: tf.scale[1],
      newScaleY: tf.scale[1] * factor
    })
  }

  // ---- 区间互斥断言 + 应用补丁 ----
  patches.sort((a, b) => a.at - b.at)
  for (let i = 1; i < patches.length; i += 1) {
    if (patches[i]!.at < patches[i - 1]!.end) {
      throw new Error(`patch ranges overlap at ${patches[i]!.at}`)
    }
  }
  const outBuf = Buffer.from(srcBuf)
  for (const p of patches) {
    const newBytes =
      p.kind === 'entity'
        ? entityPatched
        : (() => {
            const entry = auxBytesById.get(p.id)!
            const tf = readTransform(entry.bytes, 5)
            return setTransform(
              entry.bytes,
              {
                position: [tf.position[0], tf.position[1] * factor, tf.position[2]],
                rotation: tf.rotation,
                scale: [tf.scale[0], tf.scale[1] * factor, tf.scale[2]]
              },
              5
            )
          })()
    newBytes.copy(outBuf, p.at)
  }

  // ---- 自检 1：差异区间全部落在目标记录内（未涉及记录逐字节相同） ----
  const diffs = diffRanges(srcBuf, outBuf)
  const outside = diffs.filter((d) => !patches.some((p) => d.start >= p.at && d.end <= p.end))
  const changedBytes = diffs.reduce((acc, d) => acc + (d.end - d.start), 0)
  console.log(
    `self-check 1 (byte diff): ${diffs.length} diff ranges, ${changedBytes} bytes changed, ` +
      `target record ranges: ${patches.length}, outside-target diffs: ${outside.length}`
  )
  if (outside.length > 0) {
    for (const d of outside) console.error(`  OUTSIDE diff at ${d.start}..${d.end}`)
    throw new Error('self-check 1 failed: diffs outside target records')
  }

  // ---- 自检 2：候选回读，补偿守恒（pos.y × targetScaleY ≈ 原值，误差 < 1e-4） ----
  const candPayload = new Uint8Array(outBuf.subarray(20, outBuf.length - 4))
  const candTop = parseWireMessage(candPayload)!
  const candAuxById = new Map<number, Uint8Array>()
  for (const field of candTop) {
    if (field.number !== 27 || field.wire !== 2) continue
    for (const sec of parseWireMessage(field.value as Uint8Array) ?? []) {
      if (sec.number !== 2 || sec.wire !== 2) continue
      const f1 = (parseWireMessage(sec.value as Uint8Array) ?? []).find(
        (x) => x.number === 1 && x.wire === 0
      )
      if (f1 && typeof f1.value === 'number') candAuxById.set(f1.value, sec.value as Uint8Array)
    }
  }
  const candR5 = candTop.find((f) => f.number === 5 && f.wire === 2)
  const candEntities = parseWireMessage(candR5!.value as Uint8Array)!
  const candEntityRec = candEntities.find((f) => {
    if (f.number !== 1 || f.wire !== 2) return false
    const f1 = (parseWireMessage(f.value as Uint8Array) ?? []).find(
      (x) => x.number === 1 && x.wire === 0
    )
    return f1?.value === entityId
  })
  const candEntityTf = readTransform(candEntityRec!.value as Uint8Array, 6)
  const entityApplied = floatEq(candEntityTf.scale[1], targetScaleY, 1e-6)
  console.log(
    `self-check 2 (entity scale.y): candidate ${candEntityTf.scale[1]} ≈ target ${targetScaleY}: ` +
      `${entityApplied} (float32 口径)`
  )
  if (!entityApplied) {
    throw new Error('self-check 2 failed: entity scale.y not applied')
  }
  let worstPos = 0
  let worstScale = 0
  for (const auxId of auxIds) {
    const arec = candAuxById.get(auxId)
    if (!arec) throw new Error(`candidate missing aux ${auxId}`)
    const tf = readTransform(arec, 5)
    const orig = originalValues.get(auxId)!
    const errPos = Math.abs(tf.position[1] * targetScaleY - orig.posY)
    const errScale = Math.abs(tf.scale[1] * targetScaleY - orig.scaleY)
    worstPos = Math.max(worstPos, errPos)
    worstScale = Math.max(worstScale, errScale)
    if (!floatEq(tf.position[1] * targetScaleY, orig.posY, ERROR_TOLERANCE)) {
      throw new Error(`aux ${auxId} pos.y compensation off: ${errPos}`)
    }
    if (!floatEq(tf.scale[1] * targetScaleY, orig.scaleY, ERROR_TOLERANCE)) {
      throw new Error(`aux ${auxId} scale.y compensation off: ${errScale}`)
    }
  }
  console.log(
    `self-check 2 (compensation): ${auxIds.length} aux verified, worst pos.y err ${worstPos.toExponential(3)}, ` +
      `worst scale.y err ${worstScale.toExponential(3)}, tolerance ${ERROR_TOLERANCE}`
  )

  // ---- 改动表 ----
  console.log('\nentity record:')
  console.log(
    `  entity ${entityId} scale.y ${entityTf.scale[1]} → ${targetScaleY} (${entityRecBytes.length}B, range ${entityAt}..${entityAt + entityRecBytes.length})`
  )
  console.log('\naux records (id | res | pos.y old→new | scale.y old→new | len):')
  for (const p of patches) {
    if (p.kind !== 'aux') continue
    console.log(
      `  ${p.id} | ${p.resourceId} | ${p.oldPosY} → ${p.newPosY} | ${p.oldScaleY} → ${p.newScaleY} | ${p.oldLen}B`
    )
  }

  // ---- 输出：候选恒写 outPath；--write 才把同一份 outBuf 写回 GIL 本体（先备份） ----
  const outPath =
    outOverride ?? path.join(path.dirname(gilText), path.basename(gilText).replace(/\.gil$/, '.flatten.gil'))
  fs.writeFileSync(outPath, outBuf)
  if (write) {
    const backupDir = path.join(path.dirname(gilText), '.gsts', 'backups')
    fs.mkdirSync(backupDir, { recursive: true })
    const backupPath = path.join(
      backupDir,
      path.basename(gilText).replace(/\.gil$/, `.pre-flatten-${Date.now()}.gil`)
    )
    fs.writeFileSync(backupPath, srcBuf)
    fs.writeFileSync(gilText, outBuf)
    console.log(`\nwritten (with backup): ${gilText}`)
    console.log(`backup: ${backupPath}`)
    console.log(`candidate copy: ${outPath}`)
  } else {
    console.log(`\ncandidate: ${outPath}`)
  }
}

try {
  main()
} catch (err) {
  console.error(`[flatten-empty-model] ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
