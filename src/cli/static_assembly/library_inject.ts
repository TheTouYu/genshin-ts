/*
 * 素材库注入：CSS 资产 → .gil 素材库写回
 *
 * 管线：read .gil → extractTemplate（四条记录模板）→ parseCssAsset 各资产
 * → 按序构建记录（顶层容器 + 分类副本容器 + 每图元一组：顶层组 + 分类副本组）
 * → 素材段三处定点修改 → 重编码。所有规则来自真实 .gil 差分闭合：
 *
 *   - 素材段 = 501:w2(num501 注册表) + 502:w2 ×N(记录) + 503:w0=1
 *   - 素材段物理布局（真实 58 条 dump 闭合）：头部用户资产区（创建序）→ 1825 官方"默认布局"
 *     → 分类链 1840/1841/1842 → 分类副本子树；编辑器保存的新资产块插在 1825 之前
 *   - 注入插入位置 = 1825 锚点前（num501 与 502 记录同规则；无锚点回退末尾追加）
 *   - 顶层分类容器 1841 的 503 追加新分类副本容器 ID（分类树断链必须）
 *   - root46（保存历史）不动：注入器不是编辑器保存
 *   - 组形状 505{31} 只有一组 形状类型码 + ARGB，因此一个图元 = 一个组；
 *     组载体 4 槽 = 该图元的变换数据 ×4（复刻编辑器"1 形状 → 4 同槽"实测行为）
 */

import fs from 'node:fs'
import path from 'node:path'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { parseWireMessage, emitWireMessage, packedWireIds } from './wire.js'
import type { WireField } from './wire.js'
import { encodeVarint, readVarint } from '../../injector/binary.js'
import {
  extractTemplate,
  buildGroupRecord,
  buildContainerRecord,
  setPrimFloat,
  setPrimSeq,
} from './library_template.js'
import type { LibraryTemplate } from './library_template.js'
import { parseCssAsset } from './library_css.js'
import type { CssAsset, CssPrimitive } from './library_css.js'
import { syncGilToTemp } from '../gil_paths.js'

/** 顶层分类容器（分类树根，注入新分类副本容器的父节点） */
const ROOT_CATEGORY_ID = 1073741841
/** 初始区锚点：官方"默认布局"容器（素材段头部用户资产区与初始区的分界，
 *  编辑器实测：用户资产块按创建序排在它之前，num501 同序——注入插到它前面） */
const ANCHOR_RECORD_ID = 1073741825
/** 组名（用户决定：素材组名为资产名、组名固定为"图片"） */
const DEFAULT_GROUP_NAME = '图片'

export interface LibraryAssetPlan {
  name: string
  topId: number
  copyId: number
  topGroupIds: number[]
  copyGroupIds: number[]
}

export interface LibraryInjectionPlan {
  records: Uint8Array[]
  newTopIds: number[]
  newCopyIds: number[]
  assets: LibraryAssetPlan[]
  groupName: string
}

/** 解码一段 packed varint 列表 */
function decodeVarints(data: Uint8Array): number[] {
  const ids: number[] = []
  let offset = 0
  while (offset < data.length) {
    const decoded = readVarint(data, offset)
    if (!decoded) throw new Error('malformed packed varints')
    ids.push(decoded.value)
    offset = decoded.next
  }
  return ids
}

/** 素材段 502 记录的 ID（无 501:w0 返回 undefined） */
function recordId(record: Uint8Array): number | undefined {
  const m = parseWireMessage(record)
  if (!m) return undefined
  const id = m.find((x) => x.number === 501 && x.wire === 0)?.value
  return typeof id === 'number' ? id : undefined
}

/** 在素材段中找到指定 ID 的记录字节 */
function findSecRecord(sec: WireField[], id: number): Uint8Array | undefined {
  for (const f of sec) {
    if (f.number !== 502 || f.wire !== 2) continue
    if (recordId(f.value as Uint8Array) === id) return f.value as Uint8Array
  }
  return undefined
}

/** 替换素材段中指定 ID 记录的内容（就地改 WireField.value） */
function patchSecRecord(sec: WireField[], id: number, record: Uint8Array): boolean {
  for (const f of sec) {
    if (f.number !== 502 || f.wire !== 2) continue
    if (recordId(f.value as Uint8Array) === id) {
      f.value = record
      return true
    }
  }
  return false
}

/**
 * 纯规划：给定源 .gil、模板与 CSS 资产，计算新记录字节与 ID 分配。
 * 不修改任何输入。ID 自素材段最大记录 ID+1 递增；每资产分配
 * 顶层容器 → 分类副本容器 → （每图元：顶层组 → 分类副本组），
 * 记录按 build 顺序（容器在前、组随后），与编辑器 1843/1881 块布局一致。
 * 物理顺序规则（真实 dump 闭合）：新资产块插到 1825 锚点前。
 */
export function planLibraryInjection(
  gilBytes: Uint8Array,
  template: LibraryTemplate,
  assets: readonly CssAsset[],
  groupName = DEFAULT_GROUP_NAME,
): LibraryInjectionPlan {
  const top = parseWireMessage(gilBytes.slice(20, -4))
  if (!top) throw new Error('顶层解析失败')
  const root9 = top.find((f) => f.number === 9 && f.wire === 2)
  if (!root9) throw new Error('root9 素材段缺失')
  const sec = parseWireMessage(root9.value as Uint8Array)
  if (!sec) throw new Error('素材段解析失败')

  let maxId = 0
  for (const f of sec) {
    if (f.number !== 502 || f.wire !== 2) continue
    const id = recordId(f.value as Uint8Array)
    if (id !== undefined && id > maxId) maxId = id
  }

  let nextId = maxId + 1
  const records: Uint8Array[] = []
  const newTopIds: number[] = []
  const newCopyIds: number[] = []
  const assetsOut: LibraryAssetPlan[] = []
  const slotCount = template.primSlots.length

  for (const asset of assets) {
    const topId = nextId++
    const copyId = nextId++
    newTopIds.push(topId)
    newCopyIds.push(copyId)
    const topGroupIds: number[] = []
    const copyGroupIds: number[] = []
    const allSlots: Uint8Array[][] = []
    for (const prim of asset.primitives) {
      const topGroupId = nextId++
      const copyGroupId = nextId++
      topGroupIds.push(topGroupId)
      copyGroupIds.push(copyGroupId)
      // 4 槽 = 同一图元变换 ×N（复刻编辑器"1 形状 → 4 同槽"实测行为）
      const slots: Uint8Array[] = []
      for (let i = 0; i < slotCount; i++) {
        let slot = setPrimFloat(
          template.primSlots[0],
          { x: prim.x, y: prim.y },
          { w: prim.w, h: prim.h },
          prim.rotate,
        )
        if (i > 0) slot = setPrimSeq(slot, i)
        slots.push(slot)
      }
      allSlots.push(slots)
    }
    // 文件顺序：容器在前、组随后（与编辑器 1843/1881 块布局一致）
    records.push(buildContainerRecord(template.container, topId, copyId, topGroupIds, asset.name, false))
    for (let pi = 0; pi < asset.primitives.length; pi++) {
      records.push(
        buildGroupRecord(
          template.group,
          topGroupIds[pi],
          topId,
          groupName,
          allSlots[pi],
          asset.primitives[pi].shape,
          asset.primitives[pi].color,
        ),
      )
    }
    records.push(buildContainerRecord(template.containerCopy, copyId, topId, copyGroupIds, asset.name, true))
    for (let pi = 0; pi < asset.primitives.length; pi++) {
      records.push(
        buildGroupRecord(
          template.groupCopy,
          copyGroupIds[pi],
          copyId,
          groupName,
          allSlots[pi],
          asset.primitives[pi].shape,
          asset.primitives[pi].color,
        ),
      )
    }
    assetsOut.push({ name: asset.name, topId, copyId, topGroupIds, copyGroupIds })
  }

  return { records, newTopIds, newCopyIds, assets: assetsOut, groupName }
}

/**
 * 注入主流程：返回完整新 .gil 字节（20B 头 + 顶层消息 + 4B 尾）。
 * 素材段三处修改：①num501 新 ID 插到 1825 锚点前 ②502 新记录插到 1825 锚点记录前
 * ③1841 的 503 追加新分类副本容器 ID。root46/root21 等其余段不动。
 * 锚点规则来自真实 .gil 实测：素材段 = 头部用户资产区（创建序）+ 1825 官方"默认布局"
 * + 分类链 1840/1841/1842 + 分类副本子树；编辑器保存的新资产块始终插在 1825 之前。
 */
export function injectLibraryGil(
  gilBytes: Uint8Array,
  template: LibraryTemplate,
  assets: readonly CssAsset[],
  groupName = DEFAULT_GROUP_NAME,
): Uint8Array {
  const plan = planLibraryInjection(gilBytes, template, assets, groupName)
  const top = parseWireMessage(gilBytes.slice(20, -4))
  if (!top) throw new Error('顶层解析失败')
  const root9 = top.find((f) => f.number === 9 && f.wire === 2)
  if (!root9) throw new Error('root9 素材段缺失')
  const sec = parseWireMessage(root9.value as Uint8Array)
  if (!sec) throw new Error('素材段解析失败')

  // ① num501 注册表：新顶层容器 ID 插到 1825 锚点 ID 前（找不到锚点则末尾追加）
  const num501 = sec.find((f) => f.number === 501 && f.wire === 2)
  if (!num501) throw new Error('素材段 num501 注册表缺失')
  {
    const existing = decodeVarints(num501.value as Uint8Array)
    const anchorAt = existing.indexOf(ANCHOR_RECORD_ID)
    const merged = anchorAt === -1
      ? [...existing, ...plan.newTopIds]
      : [...existing.slice(0, anchorAt), ...plan.newTopIds, ...existing.slice(anchorAt)]
    num501.value = Buffer.concat(merged.map((id) => Buffer.from(encodeVarint(id))))
  }

  // ③ 顶层分类容器 1841 的 503 追加新分类副本容器 ID
  const category = findSecRecord(sec, ROOT_CATEGORY_ID)
  if (!category) throw new Error(`顶层分类容器 ${ROOT_CATEGORY_ID} 缺失`)
  {
    const cm = parseWireMessage(category)
    if (!cm) throw new Error(`分类容器 ${ROOT_CATEGORY_ID} 解析失败`)
    let g503 = cm.find((x) => x.number === 503 && x.wire === 2)
    if (!g503) {
      // 空素材库（清理后 503 空列表被省略）：补上空列表再追加
      g503 = { number: 503, wire: 2, value: new Uint8Array(0) }
      cm.push(g503)
    }
    const appended = Buffer.concat(
      plan.newCopyIds.map((id) => Buffer.from(encodeVarint(id))),
    )
    g503.value = Buffer.concat([Buffer.from(g503.value as Uint8Array), appended])
    patchSecRecord(sec, ROOT_CATEGORY_ID, emitWireMessage(cm))
  }

  // ② 新记录插到 1825 锚点记录前（找不到锚点则回退：首个非 501/502 字段前）
  const newFields: WireField[] = plan.records.map((r) => ({ number: 502, wire: 2, value: r }))
  const anchorAt = sec.findIndex((f) => f.number === 502 && f.wire === 2 && recordId(f.value as Uint8Array) === ANCHOR_RECORD_ID)
  let insertAt = anchorAt
  if (insertAt === -1) insertAt = sec.findIndex((f) => f.number !== 501 && f.number !== 502)
  const rebuilt = insertAt === -1 ? [...sec, ...newFields] : [...sec.slice(0, insertAt), ...newFields, ...sec.slice(insertAt)]
  root9.value = emitWireMessage(rebuilt)

  const out = Buffer.concat([
    Buffer.from(gilBytes.slice(0, 20)),
    Buffer.from(emitWireMessage(top)),
    Buffer.from(gilBytes.slice(-4)),
  ])
  // 同步 header 长度字段（gil-structure-semantics.md CONFIRMED，2026-08-05 实证：
  // 注入只改 payload 未同步 header → 游戏报"文件损坏"）：
  // hdr[0:4] = 文件总长 - 4；hdr[16:20] = payload 长 = 文件总长 - 24；其余 12B 不变
  out.writeUInt32BE(out.length - 4, 0)
  out.writeUInt32BE(out.length - 24, 16)
  return out
}

/** 读取容器记录的对端链接（14 顶层 / 13 分类），返回对端 ID */
function containerPairId(record: Uint8Array, linkNumber: 13 | 14): number | undefined {
  const m = parseWireMessage(record)
  if (!m) return undefined
  for (const f of m) {
    if (f.number !== 502 || f.wire !== 2) continue
    const im = parseWireMessage(f.value as Uint8Array)
    if (!im) continue
    for (const link of im) {
      if (link.number !== linkNumber || link.wire !== 2) continue
      const lm = parseWireMessage(link.value as Uint8Array)
      if (!lm) continue
      const inner501 = lm.find((x) => x.number === 501)
      if (inner501?.wire === 2) {
        const raw = inner501.value as Uint8Array
        const first = readVarint(raw, 0)
        return first ? first.value : undefined
      }
      if (inner501?.wire === 0) return inner501.value as number
    }
  }
  return undefined
}

/** 读取记录内单个 ID 字段（w0 直读或 w2 packed 首值） */
function recordFirstId(record: Uint8Array, fieldNumber: number): number | undefined {
  const m = parseWireMessage(record)
  if (!m) return undefined
  const f = m.find((x) => x.number === fieldNumber)
  if (!f) return undefined
  if (f.wire === 0) return f.value as number
  if (f.wire === 2) return decodeVarints(f.value as Uint8Array)[0]
  return undefined
}

/** 读取记录内 503 字段（packed varint 列表） */
function recordIdList(record: Uint8Array, fieldNumber: number): number[] | undefined {
  const m = parseWireMessage(record)
  if (!m) return undefined
  const f = m.find((x) => x.number === fieldNumber && x.wire === 2)
  if (!f) return undefined
  return decodeVarints(f.value as Uint8Array)
}

/** 读取记录 505 系列中的名字（505{12{501:utf8}}） */
function recordName(record: Uint8Array): string | undefined {
  const m = parseWireMessage(record)
  if (!m) return undefined
  for (const f of m) {
    if (f.number !== 505 || f.wire !== 2) continue
    const sm = parseWireMessage(f.value as Uint8Array)
    if (!sm) continue
    const t12 = sm.find((x) => x.number === 12 && x.wire === 2)
    if (!t12) continue
    const t12m = parseWireMessage(t12.value as Uint8Array)
    const s = t12m?.find((x) => x.number === 501 && x.wire === 2)
    if (s) return new TextDecoder().decode(s.value as Uint8Array)
  }
  return undefined
}

/** 读取组的形状与颜色（505{31(空) 503{31{2 类型 4 ARGB}}}，真实结构差分闭合） */
function recordShape(record: Uint8Array): { shape: number; color: number } | undefined {
  const m = parseWireMessage(record)
  if (!m) return undefined
  for (const f of m) {
    if (f.number !== 505 || f.wire !== 2) continue
    const sm = parseWireMessage(f.value as Uint8Array)
    if (!sm) continue
    const g503 = sm.find((x) => x.number === 503 && x.wire === 2)
    if (!g503) continue
    const g503m = parseWireMessage(g503.value as Uint8Array)
    const g31 = g503m?.find((x) => x.number === 31 && x.wire === 2)
    if (!g31) continue
    const g31m = parseWireMessage(g31.value as Uint8Array)
    const shape = g31m?.find((x) => x.number === 2 && x.wire === 0)?.value
    const color = g31m?.find((x) => x.number === 4 && x.wire === 0)?.value
    if (typeof shape === 'number' && typeof color === 'number') return { shape, color }
  }
  return undefined
}

/** 读取组载体内的图元槽（505{11{503{13{12: 槽}}}}） */
function groupSlots(record: Uint8Array): Uint8Array[] {
  const m = parseWireMessage(record)
  if (!m) return []
  for (const f of m) {
    if (f.number !== 505 || f.wire !== 2) continue
    const sm = parseWireMessage(f.value as Uint8Array)
    if (!sm?.find((x) => x.number === 11 && x.wire === 2)) continue
    const f503 = sm.find((x) => x.number === 503 && x.wire === 2)
    const f503m = f503 && parseWireMessage(f503.value as Uint8Array)
    const f13 = f503m?.find((x) => x.number === 13 && x.wire === 2)
    const f13m = f13 && parseWireMessage(f13.value as Uint8Array)
    const f12 = f13m?.find((x) => x.number === 12 && x.wire === 2)
    const f12m = f12 && parseWireMessage(f12.value as Uint8Array)
    if (!f12m) continue
    const slots = f12m.filter((x) => x.number === 501 && x.wire === 2)
    if (slots.length > 0) return slots.map((s) => s.value as Uint8Array)
  }
  return []
}

/** 读取槽内浮点：槽 502 数据块 → group(w2 子消息) → sub 字段 wire5 fixed32 */
function slotFloat(slot: Uint8Array, group: number, sub: number): number | undefined {
  const sm = parseWireMessage(slot)
  if (!sm) return undefined
  const data = sm.find((x) => x.number === 502 && x.wire === 2)
  const dm = data && parseWireMessage(data.value as Uint8Array)
  const g = dm?.find((x) => x.number === group)
  if (!g) return undefined
  let raw: Uint8Array | undefined
  if (g.wire === 5 || g.wire === 1) {
    raw = g.value as Uint8Array
  } else if (g.wire === 2) {
    const gm = parseWireMessage(g.value as Uint8Array)
    const subField = gm?.find((x) => x.number === sub && (x.wire === 5 || x.wire === 1))
    raw = subField?.value as Uint8Array | undefined
  }
  if (!raw || raw.length < 4) return undefined
  return new DataView(raw.buffer, raw.byteOffset, 4).getFloat32(0, true)
}

function slotSeq(slot: Uint8Array): number {
  const sm = parseWireMessage(slot)
  if (!sm) return 0
  const seq = sm.find((x) => x.number === 501 && x.wire === 0)?.value
  return typeof seq === 'number' ? seq : 0
}

export interface LibraryVerifyResult {
  pass: string[]
  recordCount: number
}

/**
 * 独立回读验证：从头重新解析候选字节，逐项断言注入结果。
 * 任一断言失败抛 Error；通过返回 PASS 清单。
 */
export function verifyLibraryInjection(
  candidate: Uint8Array,
  source: Uint8Array,
  template: LibraryTemplate,
  assets: readonly CssAsset[],
  groupName = DEFAULT_GROUP_NAME,
): LibraryVerifyResult {
  const pass: string[] = []
  const expect = (cond: boolean, label: string) => {
    if (!cond) throw new Error(`[verify] FAIL: ${label}`)
    pass.push(`PASS: ${label}`)
  }

  // 头尾：header 两个大端 uint32 长度字段必须同步（hdr[0:4]=总长-4, hdr[16:20]=总长-24），
  // 其余 12B（样本恒为 00000001/00000326/00000002）与源一致；尾部 4B 不随保存变化
  const head12Same =
    candidate.length >= 24 &&
    [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].every((i) => candidate[i] === source[i])
  const u32 = (off: number) =>
    new DataView(candidate.buffer, candidate.byteOffset, candidate.length).getUint32(off, false)
  expect(
    candidate.length >= 24 &&
      u32(0) === candidate.length - 4 &&
      u32(16) === candidate.length - 24 &&
      head12Same,
    '头部长度字段已同步（hdr[0:4]=len-4, hdr[16:20]=len-24），其余 12B 与源一致',
  )
  expect(
    candidate.slice(-4).every((b, i) => b === source[source.length - 4 + i]),
    '尾部 4B 与源一致',
  )

  const plan = planLibraryInjection(source, template, assets, groupName)
  const top = parseWireMessage(candidate.slice(20, -4))
  if (!top) throw new Error('[verify] 候选顶层解析失败')
  const root9 = top.find((f) => f.number === 9 && f.wire === 2)
  if (!root9) throw new Error('[verify] 候选 root9 缺失')
  const sec = parseWireMessage(root9.value as Uint8Array)
  if (!sec) throw new Error('[verify] 候选素材段解析失败')

  const sec502s = sec.filter((f) => f.number === 502 && f.wire === 2)
  const expectedTotal = plan.records.length + source502Count(source)
  expect(sec502s.length === expectedTotal, `502 记录数 ${sec502s.length} = ${expectedTotal}`)

  // num501：新 ID 插到 1825 锚点前（顺序保持），锚点及之后顺序不变
  const num501Ids = packedWireIds(root9.value as Uint8Array)
  {
    const anchorAt = num501Ids.indexOf(ANCHOR_RECORD_ID)
    const oldIds = sourceTop9(source)
      ? decodeVarints(parseWireMessage(sourceTop9(source)!)!.find((f) => f.number === 501 && f.wire === 2)!.value as Uint8Array)
      : []
    expect(anchorAt !== -1, `num501 锚点 ${ANCHOR_RECORD_ID} 存在`)
    expect(
      num501Ids.slice(anchorAt - plan.newTopIds.length, anchorAt).join(',') === plan.newTopIds.join(','),
      `num501 新 ID 插在锚点前 [${plan.newTopIds.join(',')}]`,
    )
    const oldAnchorAt = oldIds.indexOf(ANCHOR_RECORD_ID)
    const oldTail = oldAnchorAt === -1 ? [] : oldIds.slice(oldAnchorAt)
    const tail = num501Ids.slice(anchorAt)
    expect(tail.join(',') === oldTail.join(','), 'num501 锚点及之后顺序不变')
  }

  // 1841 的 503 追加
  const sourceSecBytes = sourceTop9(source)
  const oldCategory = sourceSecBytes
    ? findSecRecord(parseWireMessage(sourceSecBytes)!, ROOT_CATEGORY_ID)
    : undefined
  const oldCategory503 = oldCategory ? recordIdList(oldCategory, 503) ?? [] : []
  const newCategory503 = recordIdList(findSecRecord(sec, ROOT_CATEGORY_ID)!, 503) ?? []
  expect(
    newCategory503.join(',') === [...oldCategory503, ...plan.newCopyIds].join(','),
    `1841 的 503 追加 [${plan.newCopyIds.join(',')}]`,
  )

  // 逐资产断言
  for (let ai = 0; ai < plan.assets.length; ai++) {
    const ap = plan.assets[ai]
    const prims = assets[ai].primitives
    const topRecord = findSecRecord(sec, ap.topId)
    const copyRecord = findSecRecord(sec, ap.copyId)
    expect(!!topRecord, `资产 ${ap.name} 顶层容器 ${ap.topId} 存在`)
    expect(!!copyRecord, `资产 ${ap.name} 分类副本容器 ${ap.copyId} 存在`)
    if (!topRecord || !copyRecord) continue

    expect(containerPairId(topRecord, 14) === ap.copyId, `${ap.name} 顶层容器 14 对端=${ap.copyId}`)
    expect(containerPairId(copyRecord, 13) === ap.topId, `${ap.name} 分类容器 13 对端=${ap.topId}`)
    const topGroups = recordIdList(topRecord, 503) ?? []
    const copyGroups = recordIdList(copyRecord, 503) ?? []
    expect(topGroups.join(',') === ap.topGroupIds.join(','), `${ap.name} 顶层容器 503=[${ap.topGroupIds.join(',')}]`)
    expect(copyGroups.join(',') === ap.copyGroupIds.join(','), `${ap.name} 分类容器 503=[${ap.copyGroupIds.join(',')}]`)
    expect(recordName(topRecord) === ap.name, `${ap.name} 顶层容器名字`)
    expect(recordName(copyRecord) === ap.name, `${ap.name} 分类容器名字`)
    expect(recordFirstId(copyRecord, 504) === ROOT_CATEGORY_ID, `${ap.name} 分类容器 504=${ROOT_CATEGORY_ID}`)

    for (let pi = 0; pi < prims.length; pi++) {
      const prim = prims[pi]
      const tg = findSecRecord(sec, ap.topGroupIds[pi])
      const cg = findSecRecord(sec, ap.copyGroupIds[pi])
      expect(!!tg && !!cg, `${ap.name} 图元${pi} 组 ${ap.topGroupIds[pi]}/${ap.copyGroupIds[pi]} 存在`)
      if (!tg || !cg) continue
      expect(recordFirstId(tg, 504) === ap.topId, `${ap.name} 图元${pi} 顶层组 504=${ap.topId}`)
      expect(recordFirstId(cg, 504) === ap.copyId, `${ap.name} 图元${pi} 分类组 504=${ap.copyId}`)
      expect(recordName(tg) === groupName, `${ap.name} 图元${pi} 顶层组名字`)
      expect(recordName(cg) === groupName, `${ap.name} 图元${pi} 分类组名字`)
      const shape = recordShape(tg)
      expect(
        shape?.shape === prim.shape && (shape.color >>> 0) === (prim.color >>> 0),
        `${ap.name} 图元${pi} 形状 ${prim.shape} 颜色 0x${(prim.color >>> 0).toString(16)}`,
      )
      // 槽：数量与模板一致、变换值匹配、seq 0..n-1
      for (const [label, rec] of [
        ['顶层组', tg],
        ['分类组', cg],
      ] as const) {
        const slots = groupSlots(rec)
        expect(
          slots.length === template.primSlots.length,
          `${ap.name} 图元${pi} ${label} 槽数 ${slots.length}`,
        )
        if (slots.length !== template.primSlots.length) continue
        for (let s = 0; s < slots.length; s++) {
          const x = slotFloat(slots[s], 504, 501)
          const y = slotFloat(slots[s], 504, 502)
          const w = slotFloat(slots[s], 505, 501)
          const h = slotFloat(slots[s], 505, 502)
          const rot = slotFloat(slots[s], 508, 3)
          const close = (a: number | undefined, b: number) =>
            a !== undefined && Math.abs(a - b) < 1e-3
          expect(
            close(x, prim.x) && close(y, prim.y) && close(w, prim.w) && close(h, prim.h) && close(rot, prim.rotate),
            `${ap.name} 图元${pi} ${label} 槽${s} 变换 ${prim.x},${prim.y},${prim.w},${prim.h},${prim.rotate}°`,
          )
          expect(slotSeq(slots[s]) === s, `${ap.name} 图元${pi} ${label} 槽${s} seq=${s}`)
        }
      }
    }
  }

  // root46 等其余段不动：非 root9 顶层字段逐字节一致
  const sourceTop = parseWireMessage(source.slice(20, -4))!
  const moved = sourceTop.filter((f) => !(f.number === 9 && f.wire === 2))
  for (const sf of moved) {
    const cf = top.find((f) => f.number === sf.number && f.wire === sf.wire)
    expect(!!cf, `顶层字段 ${sf.number}:${sf.wire} 保留`)
    if (!cf) continue
    const same =
      typeof sf.value === 'number'
        ? sf.value === cf.value
        : (sf.value as Uint8Array).every((b, i) => b === (cf.value as Uint8Array)[i])
    expect(same, `顶层字段 ${sf.number}:${sf.wire} 内容不变`)
  }

  return { pass, recordCount: sec502s.length }
}

function sourceTop9(source: Uint8Array): Uint8Array | undefined {
  const top = parseWireMessage(source.slice(20, -4))
  if (!top) return undefined
  const root9 = top.find((f) => f.number === 9 && f.wire === 2)
  return root9?.value as Uint8Array | undefined
}

function source502Count(source: Uint8Array): number {
  const root9 = sourceTop9(source)
  if (!root9) return 0
  const sec = parseWireMessage(root9)
  return sec?.filter((f) => f.number === 502 && f.wire === 2).length ?? 0
}

const SHAPE_NAMES: Record<number, string> = {
  100001: '矩形',
  100002: '椭圆',
  100003: '圆角矩形',
  100006: '圆环',
}

function shapeName(shape: number): string {
  return SHAPE_NAMES[shape] ?? `形状${shape}`
}

function argbHex(color: number): string {
  return `#${(color >>> 0).toString(16).padStart(8, '0').toUpperCase()}`
}

function fmt(v: number | undefined): string {
  return v === undefined ? '?' : v.toFixed(3)
}

/**
 * 只读列出素材库内容（容器/分类副本/组/图元），不改文件。
 * 结构判定复用注入同款读路径：14 链接=顶层容器、13 链接=分类副本、504=父容器。
 */
export function listLibraryGil(gilPath: string): void {
  const bytes = new Uint8Array(fs.readFileSync(gilPath))
  const top = parseWireMessage(bytes.slice(20, -4))
  if (!top) throw new Error('顶层解析失败')
  const root9 = top.find((f) => f.number === 9 && f.wire === 2)
  if (!root9) throw new Error('root9 素材段缺失')
  const sec = parseWireMessage(root9.value as Uint8Array)
  if (!sec) throw new Error('素材段解析失败')

  const records = sec
    .filter((f) => f.number === 502 && f.wire === 2)
    .map((f) => ({ id: recordId(f.value as Uint8Array), record: f.value as Uint8Array }))
    .filter((r): r is { id: number; record: Uint8Array } => r.id !== undefined)

  console.log(`source=${gilPath} 记录=${records.length}`)
  // 容器 = 有 503 组列表且有名字且非分类副本（1825 布局容器无 14 链接也纳入）
  const tops = records.filter(
    (r) =>
      containerPairId(r.record, 13) === undefined &&
      recordIdList(r.record, 503) !== undefined &&
      recordName(r.record) !== undefined,
  )
  const copies = records.filter((r) => containerPairId(r.record, 13) !== undefined)
  console.log(`容器=${tops.length} 分类副本=${copies.length}`)

  // 已归属记录（顶层/分类组的 ID 集合），避免"其他记录"重复
  const owned = new Set<number>()
  for (const t of tops) {
    for (const gid of recordIdList(t.record, 503) ?? []) owned.add(gid)
  }
  for (const c of copies) {
    for (const gid of recordIdList(c.record, 503) ?? []) owned.add(gid)
  }

  for (const t of tops) {
    const name = recordName(t.record) ?? '(未命名)'
    const copy = containerPairId(t.record, 14)
    const groupIds = recordIdList(t.record, 503) ?? []
    console.log(`\n[容器] ${name} (${t.id}) 分类副本=${copy} 组=${groupIds.length}`)
    for (const gid of groupIds) {
      const g = records.find((r) => r.id === gid)
      if (!g) {
        console.log(`  [组] ${gid} (缺失)`)
        continue
      }
      const gname = recordName(g.record) ?? '(未命名)'
      const shape = recordShape(g.record)
      const slots = groupSlots(g.record)
      const shapeLabel = shape
        ? `${shapeName(shape.shape)} ${argbHex(shape.color)}`
        : '(无形状)'
      console.log(`  [组] ${gname} (${gid}) 图元=${slots.length} ${shapeLabel}`)
      slots.forEach((slot, i) => {
        const x = slotFloat(slot, 504, 501)
        const y = slotFloat(slot, 504, 502)
        const w = slotFloat(slot, 505, 501)
        const h = slotFloat(slot, 505, 502)
        const rot = slotFloat(slot, 508, 3)
        console.log(
          `    #${i} pos=(${fmt(x)}, ${fmt(y)}) size=(${fmt(w)}, ${fmt(h)}) rot=${fmt(rot)}°`,
        )
      })
    }
  }

  for (const c of copies) {
    const cname = recordName(c.record) ?? '(未命名)'
    const top = containerPairId(c.record, 13)
    const groupIds = recordIdList(c.record, 503) ?? []
    console.log(
      `\n[分类副本] ${cname} (${c.id}) ← 容器 ${top} 组=${groupIds.length}`,
    )
  }

  const unlinked = records.filter(
    (r) =>
      !owned.has(r.id) &&
      containerPairId(r.record, 13) === undefined &&
      containerPairId(r.record, 14) === undefined,
  )
  if (unlinked.length > 0) {
    console.log(`\n其他记录=${unlinked.length}`)
    for (const r of unlinked) {
      const name = recordName(r.record) ?? '(未命名)'
      console.log(`  [记录] ${name} (${r.id})`)
    }
  }
}

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function usage(exitCode = 1): never {
  const output = [
    'Usage: gsts assets:library-inject [options]',
    '',
    '  把 assets/images/*.css 资产注入 .gil 素材库',
    '',
    '  --gil <file>       源 .gil（默认无，必填）',
    '  --list             只读列出素材库内容（容器/组/图元），不改文件',
    '  --css <dir>        CSS 资产目录（默认 assets/images，相对当前目录）',
    '  --names <a,b>      只注入指定资产名（逗号分隔）',
    '  --group-name <s>   素材组名（默认：图片）',
    '  --output <file>    写候选文件 + 独立回读验证，不写源',
    '  --write            写回源 .gil（自动备份 + 同步 Temp），写前先验证',
    '  -h, --help         显示帮助',
  ].join('\n')
  console[exitCode === 0 ? 'log' : 'error'](output)
  process.exit(exitCode)
}

function value(argv: readonly string[], index: number): string {
  const result = argv[index + 1]
  if (!result || result.startsWith('--')) usage()
  return result
}

export function parseLibraryInjectArgs(argv: readonly string[]): {
  gilPath: string
  list: boolean
  cssDir: string
  names: string[] | undefined
  groupName: string
  outputPath: string | undefined
  write: boolean
} {
  let gilPath: string | undefined
  let list = false
  let cssDir = path.resolve('assets/images')
  let names: string[] | undefined
  let groupName = DEFAULT_GROUP_NAME
  let outputPath: string | undefined
  let write = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '-h' || arg === '--help') usage(0)
    else if (arg === '--gil') gilPath = value(argv, i++)
    else if (arg === '--list') list = true
    else if (arg === '--css') cssDir = value(argv, i++)
    else if (arg === '--names')
      names = value(argv, i++)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    else if (arg === '--group-name') groupName = value(argv, i++)
    else if (arg === '--output') outputPath = value(argv, i++)
    else if (arg === '--write') write = true
    else usage()
  }
  if (!gilPath) usage()
  return { gilPath, list, cssDir, names, groupName, outputPath, write }
}

/** 加载 CSS 资产（目录内 *.css，按文件名排序；--names 过滤） */
export function loadCssAssets(cssDir: string, names: string[] | undefined): CssAsset[] {
  if (!fs.existsSync(cssDir)) throw new Error(`[error] CSS 资产目录不存在: ${cssDir}`)
  const files = fs
    .readdirSync(cssDir)
    .filter((f) => f.endsWith('.css'))
    .sort()
  if (files.length === 0) throw new Error(`[error] ${cssDir} 无 .css 文件`)
  const assets: CssAsset[] = []
  for (const file of files) {
    const name = path.basename(file, '.css')
    if (names && !names.includes(name)) continue
    const css = fs.readFileSync(path.join(cssDir, file), 'utf-8')
    assets.push(parseCssAsset(css, name))
  }
  if (names) {
    for (const n of names) {
      if (!assets.some((a) => a.name === n)) throw new Error(`[error] 资产不存在: ${n}`)
    }
  }
  return assets
}

/** CLI 主入口 */
export async function runLibraryInject(argv: readonly string[]): Promise<void> {
  const args = parseLibraryInjectArgs(argv)
  if (args.list) {
    listLibraryGil(args.gilPath)
    return
  }
  const sourceBytes = new Uint8Array(fs.readFileSync(args.gilPath))
  const sourceHash = sha256(sourceBytes)
  const template = extractTemplate(args.gilPath)
  const assets = loadCssAssets(args.cssDir, args.names)
  console.log(
    `source=${args.gilPath} sha256=${sourceHash.slice(0, 16)} 资产=${assets.map((a) => `${a.name}(${a.primitives.length})`).join(' ')}`,
  )

  const candidate = injectLibraryGil(sourceBytes, template, assets, args.groupName)

  if (args.outputPath) {
    const absolute = path.resolve(args.outputPath)
    if (fs.existsSync(absolute)) throw new Error(`[error] 输出已存在: ${absolute}`)
    fs.mkdirSync(path.dirname(absolute), { recursive: true })
    fs.writeFileSync(absolute, candidate)
    const onDisk = new Uint8Array(fs.readFileSync(absolute))
    const result = verifyLibraryInjection(onDisk, sourceBytes, template, assets, args.groupName)
    for (const line of result.pass) console.log(line)
    console.log(
      `candidate=${absolute} size=${onDisk.length} 记录=${result.recordCount} sha256=${sha256(onDisk).slice(0, 16)}`,
    )
    console.log('[gate] 候选已验证。确认无误后加 --write 写回源文件。')
    return
  }

  // --write：先内存验证，再备份写回
  const result = verifyLibraryInjection(candidate, sourceBytes, template, assets, args.groupName)
  for (const line of result.pass) console.log(line)

  const nowBytes = new Uint8Array(fs.readFileSync(args.gilPath))
  if (sha256(nowBytes) !== sourceHash) {
    throw new Error('[error] 源 .gil 自读取后已变化，中止写回')
  }
  const backupDir = path.join(path.dirname(args.gilPath), '.gsts', 'backups')
  fs.mkdirSync(backupDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(backupDir, `${path.basename(args.gilPath)}.${stamp}.library-inject.bak`)
  fs.copyFileSync(args.gilPath, backupPath)
  fs.writeFileSync(args.gilPath, candidate)
  const after = new Uint8Array(fs.readFileSync(args.gilPath))
  if (sha256(after) !== sha256(candidate)) {
    throw new Error('[error] 写回后回读 hash 不一致')
  }
  console.log(`backup=${backupPath}`)
  console.log(`written=${args.gilPath} sha256=${sha256(after).slice(0, 16)}`)
  try {
    const synced = syncGilToTemp(path.dirname(args.gilPath), path.basename(args.gilPath))
    if (synced) console.log(`temp-sync=${synced}`)
  } catch (error) {
    console.log(`temp-sync-skipped=${(error as Error).message}`)
  }
}
