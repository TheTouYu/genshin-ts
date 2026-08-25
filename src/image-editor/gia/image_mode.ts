/**
 * GIA image-mode (kind=8, resource_class=15) writer.
 *
 * Faithful TypeScript port of the reference converter used by the Miliastra
 * image editor web UI (https://github.com/1475505/Miliastra-image-editor-webui,
 * backend/vendor/gia/json_to_gia.py, image mode). Semantics:
 *
 * 1. Load an image-mode template GIA (see template.ts).
 * 2. Remove existing class=15 dependency entries; find the primary resource's
 *    parent guid from its reference list.
 * 3. Generate one UI image node entry per scene element (ui.content carries
 *    guid / info / parent / name / field14 / transform / image_settings).
 * 4. Patch the primary resource: replace reference_list entries, rewrite the
 *    ui.content children (only wire-0 varint field 503 entries; the packed
 *    wire-2 blob in the game template is preserved as-is), and optionally
 *    replace mask settings (field 505 / subfield 502=56) and group name.
 * 5. Rebuild the GIA (20-byte header + content + 4-byte tail).
 *
 * The game interprets children in reverse editor order, so elements are
 * reversed before creating entries and children lists.
 */

import {
  MAX_UINT64,
  ProtoReader,
  ProtoWriter,
  WireType,
  buildMessage,
  checkLocatorGuid,
  findVarint,
  parseResourceEntry,
  type WireField
} from './wire.js'

export const MODE_DECORATION = 'decoration'
export const MODE_IMAGE = 'image'

export const DEFAULT_IMAGE_ASSET_REFS: Record<string, number> = {
  rectangle: 100001,
  ellipse: 100002,
  triangle: 100003,
  four_point_star: 100004,
  five_point_star: 100005,
  ring: 100006
}

export const DEFAULT_PACKED_COLOR = 0x80ffffff // 50% white ARGB

export const UI_IMAGE_RESOURCE_CLASS = 15
export const UI_IMAGE_KIND = 8
export const DEFAULT_NEXT_GUID = 1073749460

export interface MaskSettingsInput {
  position?: { x?: number; y?: number }
  center?: { x?: number; y?: number }
  size?: { x?: number; y?: number; width?: number; height?: number }
  shape_type?: number | string
  enabled?: boolean
}

export interface NormalizedMaskSettings {
  position_x: number
  position_y: number
  size_x: number
  size_y: number
  shape_type: number
  enabled: boolean
}

/** Normalized element shape used by the converter. */
export interface ImageModeElement {
  type?: string
  name?: string
  relative?: { x?: number; y?: number }
  center?: { x?: number; y?: number }
  size?: { rx?: number; ry?: number; width?: number; height?: number }
  rotation?: { x?: number; y?: number; z?: number } | number
  image_asset_ref?: number
  packed_color?: number
  color?: string | number | number[]
  alpha?: number | null
}

export interface ImageModeDocument {
  group_name?: string
  mask?: MaskSettingsInput | null
  elements?: ImageModeElement[]
}

const SHAPE_ALIASES: Record<string, string> = {
  rect: 'rectangle',
  rectangle: 'rectangle',
  circle: 'ellipse',
  ellipse: 'ellipse',
  triangle: 'triangle',
  tri: 'triangle',
  four_point_star: 'four_point_star',
  'four-point-star': 'four_point_star',
  'four point star': 'four_point_star',
  '4_point_star': 'four_point_star',
  '4-point-star': 'four_point_star',
  '4 point star': 'four_point_star',
  '4star': 'four_point_star',
  star4: 'four_point_star',
  四角星: 'four_point_star',
  five_point_star: 'five_point_star',
  'five-point-star': 'five_point_star',
  'five point star': 'five_point_star',
  '5_point_star': 'five_point_star',
  '5-point-star': 'five_point_star',
  '5 point star': 'five_point_star',
  '5star': 'five_point_star',
  star5: 'five_point_star',
  五角星: 'five_point_star',
  ring: 'ring',
  circle_ring: 'ring',
  'circle-ring': 'ring',
  'circle ring': 'ring',
  donut: 'ring',
  annulus: 'ring',
  圆环: 'ring'
}

function normalizeShapeType(shapeType: unknown): string {
  if (typeof shapeType !== 'string') return String(shapeType)
  const lowered = shapeType.trim().toLowerCase()
  return SHAPE_ALIASES[lowered] ?? lowered
}

function normalizeMaskShapeType(shapeType: unknown): number {
  if (typeof shapeType === 'string') {
    const lowered = shapeType.trim().toLowerCase()
    if (lowered === 'rect' || lowered === 'rectangle') return 1
    if (lowered === 'circle' || lowered === 'ellipse') return 2
  }
  const parsed = Number(shapeType)
  return Number.isFinite(parsed) ? parsed : 1
}

export function normalizeMaskSettings(mask: MaskSettingsInput | null | undefined): NormalizedMaskSettings | null {
  if (!mask) return null
  const center = mask.position ?? mask.center ?? {}
  const size = mask.size ?? {}
  const sizeX = size.x ?? size.width ?? 0
  const sizeY = size.y ?? size.height ?? 0
  return {
    position_x: Number(center.x ?? 0),
    position_y: Number(center.y ?? 0),
    size_x: Number(sizeX),
    size_y: Number(sizeY),
    shape_type: normalizeMaskShapeType(mask.shape_type ?? 1),
    enabled: Boolean(mask.enabled ?? true)
  }
}

function normalizeGroupName(value: unknown, fallback = '素材组'): string {
  if (typeof value !== 'string') return fallback
  const raw = value.trim()
  if (!raw) return fallback
  const base = raw.split(/[\\/]/).pop() ?? raw
  const stem = base.replace(/\.[^.]*$/, '')
  return stem || base || fallback
}

function normalizeElementName(element: ImageModeElement | undefined, fallback: string): string {
  if (!element) return fallback
  const raw = element.name
  if (typeof raw !== 'string') return fallback
  return raw.trim() || fallback
}

/** Port of _color_to_packed: color (int/string/rgb list) + alpha → ARGB int. */
export function colorToPacked(color: unknown, alpha: unknown, fallback: number): number {
  if (typeof color === 'number') return color & 0xffffffff
  let alphaInt: number
  if (alpha === null || alpha === undefined) {
    alphaInt = (fallback >> 24) & 0xff
  } else if (typeof alpha === 'number' && alpha >= 0 && alpha <= 1) {
    alphaInt = Math.max(0, Math.min(255, Math.round(alpha * 255)))
  } else {
    alphaInt = Math.max(0, Math.min(255, Math.round(Number(alpha))))
  }
  if (typeof color === 'string') {
    const value = color.trim().replace(/^#/, '')
    const hex = value.length === 3 ? value.split('').map((ch) => ch + ch).join('') : value
    if (/^[0-9a-f]{6}$/i.test(hex)) {
      const rgb = parseInt(hex, 16)
      return ((alphaInt << 24) | rgb) & 0xffffffff
    }
    return fallback
  }
  if (Array.isArray(color) && color.length >= 3) {
    const rgb = color.slice(0, 3).map((part) => Math.max(0, Math.min(255, Math.round(Number(part)))))
    if (color.length >= 4) {
      const alphaComponent = color[3]
      if (typeof alphaComponent === 'number' && alphaComponent >= 0 && alphaComponent <= 1) {
        alphaInt = Math.max(0, Math.min(255, Math.round(alphaComponent * 255)))
      } else {
        alphaInt = Math.max(0, Math.min(255, Math.round(Number(alphaComponent))))
      }
    }
    return ((alphaInt << 24) | (rgb[0] << 16) | (rgb[1] << 8) | rgb[2]) & 0xffffffff
  }
  return fallback
}

// ---------------------------------------------------------------------------
// Message builders
// ---------------------------------------------------------------------------

function buildAssetInfo(guid: number): ProtoWriter {
  const info = new ProtoWriter()
  info.writeInt32(2, 1)
  info.writeInt32(3, UI_IMAGE_KIND)
  info.writeInt64(4, guid)
  return info
}

function buildVector3(x: number, y: number, z: number): ProtoWriter {
  const w = new ProtoWriter()
  w.writeFloat(1, x)
  w.writeFloat(2, y)
  w.writeFloat(3, z)
  return w
}

function buildVector2(x: number, y: number): ProtoWriter {
  const w = new ProtoWriter()
  w.writeFloat(501, x)
  w.writeFloat(502, y)
  return w
}

function buildRotation(zAngle: number): ProtoWriter {
  if (Math.abs(zAngle) < 1e-6) return new ProtoWriter()
  const w = new ProtoWriter()
  w.writeFloat(3, zAngle)
  return w
}

function buildRectTransform(
  offsetX: number,
  offsetY: number,
  sizeX: number,
  sizeY: number,
  pivotX = 0.5,
  pivotY = 0.5,
  rotZ = 0
): ProtoWriter {
  const w = new ProtoWriter()
  w.writeMessage(501, buildVector3(1, 1, 1)) // scale
  w.writeMessage(502, buildVector2(0.5, 0.5)) // anchor_min
  w.writeMessage(503, buildVector2(0.5, 0.5)) // anchor_max
  w.writeMessage(504, buildVector2(offsetX, offsetY)) // offset
  w.writeMessage(505, buildVector2(sizeX, sizeY)) // size
  w.writeMessage(506, buildVector2(pivotX, pivotY)) // pivot
  w.writeMessage(508, buildRotation(rotZ)) // rotation
  return w
}

function buildPlatform(
  platformType: number,
  offsetX: number,
  offsetY: number,
  sizeX: number,
  sizeY: number,
  pivotX = 0.5,
  pivotY = 0.5,
  rotZ = 0
): ProtoWriter {
  const w = new ProtoWriter()
  w.writeInt32(501, platformType)
  w.writeMessage(502, buildRectTransform(offsetX, offsetY, sizeX, sizeY, pivotX, pivotY, rotZ))
  return w
}

function buildMultiPlatform(
  offsetX: number,
  offsetY: number,
  sizeX: number,
  sizeY: number,
  pivotX = 0.5,
  pivotY = 0.5,
  rotZ = 0
): ProtoWriter {
  const w = new ProtoWriter()
  for (let platformType = 0; platformType < 4; platformType++) {
    w.writeMessage(
      501,
      buildPlatform(platformType, offsetX, offsetY, sizeX, sizeY, pivotX, pivotY, rotZ)
    )
  }
  w.writeInt32(502, 9)
  w.writeInt32(504, 1)
  return w
}

function buildTransformData(
  offsetX: number,
  offsetY: number,
  sizeX: number,
  sizeY: number,
  guid: number,
  pivotX = 0.5,
  pivotY = 0.5,
  rotZ = 0
): ProtoWriter {
  const w = new ProtoWriter()
  // field 11: builtin transform (empty multi_platform, type:2)
  const builtin = new ProtoWriter()
  builtin.writeMessage(12, new ProtoWriter()) // empty multi_platform
  builtin.writeInt32(501, 2)
  w.writeMessage(11, builtin)

  const details = new ProtoWriter()
  const detailsTransform = new ProtoWriter()
  detailsTransform.writeMessage(
    12,
    buildMultiPlatform(offsetX, offsetY, sizeX, sizeY, pivotX, pivotY, rotZ)
  )
  detailsTransform.writeInt32(501, 2)
  details.writeMessage(13, detailsTransform)
  details.writeInt32(501, 4)
  details.writeInt32(502, 12)
  details.writeInt32(503, 1)
  details.writeMessage(504, buildAssetInfo(guid))
  w.writeMessage(503, details)
  w.writeInt32(501, 1)
  w.writeInt32(502, 12)
  return w
}

function buildField14Data(guid: number): ProtoWriter {
  const w = new ProtoWriter()
  const field14Inner = new ProtoWriter()
  field14Inner.writeBytes(15, new Uint8Array(0))
  field14Inner.writeInt32(501, 5)
  w.writeMessage(14, field14Inner)
  w.writeInt32(501, 4)
  w.writeInt32(502, 23)

  const details = new ProtoWriter()
  const detailsField14 = new ProtoWriter()
  detailsField14.writeBytes(15, new Uint8Array(0))
  detailsField14.writeInt32(501, 5)
  details.writeMessage(14, detailsField14)
  details.writeInt32(501, 5)
  details.writeInt32(502, 23)
  details.writeInt32(503, 1)
  details.writeMessage(504, buildAssetInfo(guid))
  w.writeMessage(503, details)
  return w
}

function buildImageSettingsData(imageAssetRef: number, packedColor: number, guid: number): ProtoWriter {
  const w = new ProtoWriter()
  w.writeBytes(31, new Uint8Array(0)) // image_settings_component
  w.writeInt32(501, 21)
  w.writeInt32(502, 38)

  const details = new ProtoWriter()
  const imgSettings = new ProtoWriter()
  imgSettings.writeInt32(2, imageAssetRef)
  const sourceMeta = new ProtoWriter()
  sourceMeta.writeInt64(501, MAX_UINT64) // sentinel id
  imgSettings.writeMessage(3, sourceMeta)
  imgSettings.writeInt32(4, packedColor)
  imgSettings.writeBytes(6, new Uint8Array(0))
  imgSettings.writeBytes(10, new Uint8Array(0))
  details.writeMessage(31, imgSettings)
  details.writeInt32(501, 22)
  details.writeInt32(502, 38)
  details.writeInt32(503, 1)
  details.writeMessage(504, buildAssetInfo(guid))
  w.writeMessage(503, details)
  return w
}

function buildMaskSettingsData(
  positionX: number,
  positionY: number,
  sizeX: number,
  sizeY: number,
  shapeType: number,
  enabled: boolean,
  guid: number
): ProtoWriter {
  const w = new ProtoWriter()
  w.writeBytes(46, new Uint8Array(0)) // mask_settings_component
  w.writeInt32(501, 38)
  w.writeInt32(502, 56)

  const details = new ProtoWriter()
  const maskSettings = new ProtoWriter()
  maskSettings.writeMessage(1, buildVector2(positionX, positionY))
  maskSettings.writeMessage(2, buildVector2(sizeX, sizeY))
  maskSettings.writeInt32(3, shapeType)
  maskSettings.writeBool(4, enabled)
  details.writeMessage(47, maskSettings)
  details.writeInt32(501, 40)
  details.writeInt32(502, 56)
  details.writeInt32(503, 1)
  details.writeMessage(504, buildAssetInfo(guid))
  w.writeMessage(503, details)
  return w
}

function buildNameData(name = ''): ProtoWriter {
  const w = new ProtoWriter()
  const nameInner = new ProtoWriter()
  if (name) nameInner.writeString(501, name)
  w.writeMessage(12, nameInner)
  w.writeInt32(501, 2)
  w.writeInt32(502, 15)
  return w
}

export interface UiImagePayloadOptions {
  guid: number
  index: number
  parentGuid: number
  offsetX: number
  offsetY: number
  sizeX: number
  sizeY: number
  imageAssetRef?: number
  packedColor?: number
  rotZ?: number
  pivotX?: number
  pivotY?: number
  name?: string
}

export function createUiImagePayload(options: UiImagePayloadOptions): ProtoWriter {
  const {
    guid,
    index,
    parentGuid,
    offsetX,
    offsetY,
    sizeX,
    sizeY,
    imageAssetRef = 100002,
    packedColor = DEFAULT_PACKED_COLOR,
    rotZ = 0,
    pivotX = 0.5,
    pivotY = 0.5,
    name = ''
  } = options
  const content = new ProtoWriter()

  content.writeInt64(501, guid)

  const infoGuid = new ProtoWriter()
  const guidWrapper = new ProtoWriter()
  guidWrapper.writeInt64(501, guid)
  infoGuid.writeMessage(11, guidWrapper)
  infoGuid.writeInt32(501, 1)
  infoGuid.writeInt32(502, 5)
  content.writeMessage(502, infoGuid)

  const infoIndex = new ProtoWriter()
  const indexWrapper = new ProtoWriter()
  indexWrapper.writeInt32(501, index)
  infoIndex.writeMessage(12, indexWrapper)
  infoIndex.writeInt32(501, 2)
  infoIndex.writeInt32(502, 6)
  content.writeMessage(502, infoIndex)

  content.writeInt64(504, parentGuid)

  content.writeMessage(505, buildNameData(name))
  content.writeMessage(505, buildField14Data(guid))
  content.writeMessage(505, buildTransformData(offsetX, offsetY, sizeX, sizeY, guid, pivotX, pivotY, rotZ))
  content.writeMessage(505, buildImageSettingsData(imageAssetRef, packedColor, guid))
  return content
}

/** ResourceEntry for a UI image node (kind=8, resource_class=15, ui.content). */
export function createUiImageEntry(guid: number, name: string, uiContentPayload: ProtoWriter): ProtoWriter {
  const entry = new ProtoWriter()
  const ident = new ProtoWriter()
  ident.writeInt32(2, 1)
  ident.writeInt32(3, UI_IMAGE_KIND)
  ident.writeInt64(4, guid)
  entry.writeMessage(1, ident)
  // internal_name (field 3) intentionally NOT written for dependencies
  entry.writeInt32(5, UI_IMAGE_RESOURCE_CLASS)
  const ui = new ProtoWriter()
  ui.writeMessage(1, uiContentPayload)
  entry.writeMessage(19, ui)
  return entry
}

export function createReferenceLocator(guid: number, kind = 14): ProtoWriter {
  const loc = new ProtoWriter()
  loc.writeInt32(2, 1)
  loc.writeInt32(3, kind)
  loc.writeInt64(4, guid)
  return loc
}

// ---------------------------------------------------------------------------
// GIA file structure
// ---------------------------------------------------------------------------

export interface GiaRootParts {
  header: Uint8Array
  contentLen: number
  rootFields: WireField[]
  tail: Uint8Array
}

/** Parse a GIA file into header (20B), root fields, and tail (4B). */
export function parseGiaRootFields(fileData: Uint8Array): GiaRootParts {
  if (fileData.length < 24) throw new Error('GIA file too short')
  const header = fileData.slice(0, 20)
  const contentLen = readBigEndianUint32(header, 16)
  const content = fileData.slice(20, 20 + contentLen)
  const tail = fileData.slice(20 + contentLen, 24 + contentLen)
  const rootFields = new ProtoReader(content).parseFields()
  return { header, contentLen, rootFields, tail }
}

function readBigEndianUint32(data: Uint8Array, offset: number): number {
  return (
    (data[offset] << 24) |
    (data[offset + 1] << 16) |
    (data[offset + 2] << 8) |
    data[offset + 3]
  ) >>> 0
}

function writeBigEndianUint32(value: number): Uint8Array {
  return Uint8Array.from([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff
  ])
}

/** Parse a primary resource (Root field 1) into its raw fields. */
export function parsePrimaryResource(data: Uint8Array): WireField[] {
  return new ProtoReader(data).parseFields()
}

export interface RebuildGiaOptions {
  header: Uint8Array
  rootFields: WireField[]
  tail: Uint8Array
  newEntries: Uint8Array[]
  primaryResourceBytes: Uint8Array
  removedClass: number
}

/** Rebuild a GIA file: primary resource + kept deps + new deps + header/tail. */
export function rebuildGia(options: RebuildGiaOptions): Uint8Array {
  const { header, rootFields, tail, newEntries, primaryResourceBytes, removedClass } = options
  const finalBundle = new ProtoWriter()
  finalBundle.writeBytes(1, primaryResourceBytes)

  for (const field of rootFields) {
    if (field.tag === 2) {
      if (field.wire === WireType.LENGTH_DELIMITED) {
        const info = parseResourceEntry(field.data)
        if (info.class === removedClass) continue
      }
      writeField(finalBundle, field)
    } else if (field.tag !== 1) {
      writeField(finalBundle, field)
    }
  }
  for (const entry of newEntries) {
    finalBundle.writeBytes(2, entry)
  }

  const newContent = finalBundle.getBytes()
  const newLen = newContent.length
  const newFileSize = 20 + newLen
  const newHeader = new Uint8Array(20)
  newHeader.set(writeBigEndianUint32(newFileSize), 0)
  newHeader.set(header.slice(4, 16), 4)
  newHeader.set(writeBigEndianUint32(newLen), 16)

  const output = new Uint8Array(newHeader.length + newContent.length + tail.length)
  output.set(newHeader)
  output.set(newContent, newHeader.length)
  output.set(tail, newHeader.length + newContent.length)
  return output
}

function writeField(writer: ProtoWriter, field: WireField): void {
  if (field.wire === WireType.LENGTH_DELIMITED) {
    writer.writeBytes(field.tag, field.data)
  } else if (field.wire === WireType.VARINT) {
    writer.writeTag(field.tag, WireType.VARINT)
    writer.writeVarint(field.value)
  } else {
    writer.writeTag(field.tag, field.wire)
    writer.append(field.raw)
  }
}

/** Patch ui.content: replace varint children, mask (502=56) and name (502=15). */
export function patchUiContentChildren(
  uiContentData: Uint8Array,
  newChildGuids: number[],
  parentGuid: number,
  maskSettings: NormalizedMaskSettings | null,
  groupName: string | null
): Uint8Array {
  const fields = new ProtoReader(uiContentData).parseFields()
  const newFields: WireField[] = []
  let childrenWritten = false
  let maskWritten = false
  let nameWritten = false

  for (const field of fields) {
    if (field.tag === 503 && field.wire === WireType.VARINT) {
      if (!childrenWritten) {
        for (const guid of newChildGuids) {
          newFields.push({ tag: 503, wire: WireType.VARINT, value: guid })
        }
        childrenWritten = true
      }
      continue
    }
    if (field.tag === 505 && field.wire === WireType.LENGTH_DELIMITED) {
      const dataFields = new ProtoReader(field.data).parseFields()
      const field502 = findVarint(dataFields, 502)
      if (maskSettings !== null && field502 === 56) {
        newFields.push({
          tag: 505,
          wire: WireType.LENGTH_DELIMITED,
          data: buildMaskSettingsData(
            maskSettings.position_x,
            maskSettings.position_y,
            maskSettings.size_x,
            maskSettings.size_y,
            maskSettings.shape_type,
            maskSettings.enabled,
            parentGuid
          ).getBytes()
        })
        maskWritten = true
        continue
      }
      if (groupName && field502 === 15) {
        newFields.push({
          tag: 505,
          wire: WireType.LENGTH_DELIMITED,
          data: buildNameData(groupName).getBytes()
        })
        nameWritten = true
        continue
      }
      newFields.push(field)
      continue
    }
    newFields.push(field)
  }

  if (!childrenWritten) {
    for (const guid of newChildGuids) {
      newFields.push({ tag: 503, wire: WireType.VARINT, value: guid })
    }
  }
  if (maskSettings !== null && !maskWritten) {
    newFields.push({
      tag: 505,
      wire: WireType.LENGTH_DELIMITED,
      data: buildMaskSettingsData(
        maskSettings.position_x,
        maskSettings.position_y,
        maskSettings.size_x,
        maskSettings.size_y,
        maskSettings.shape_type,
        maskSettings.enabled,
        parentGuid
      ).getBytes()
    })
  }
  if (groupName && !nameWritten) {
    newFields.push({
      tag: 505,
      wire: WireType.LENGTH_DELIMITED,
      data: buildNameData(groupName).getBytes()
    })
  }
  return buildMessage(newFields)
}

/** Patch the primary resource for image mode (refs, ui.content, group name). */
export function patchPrimaryResourceImage(
  prFields: WireField[],
  removedGuids: Set<number>,
  newRefs: Uint8Array[],
  newChildGuids: number[],
  parentGuid: number,
  maskSettings: NormalizedMaskSettings | null,
  groupName: string | null
): Uint8Array {
  const prWriter = new ProtoWriter()
  let insertedNewRefs = false
  let resourceNameWritten = false

  for (const field of prFields) {
    if (field.tag === 2) {
      if (field.wire === WireType.LENGTH_DELIMITED) {
        const refGuid = checkLocatorGuid(field.data)
        if (removedGuids.has(refGuid)) {
          if (!insertedNewRefs) {
            for (const ref of newRefs) prWriter.writeBytes(2, ref)
            insertedNewRefs = true
          }
          continue
        }
      }
      writeField(prWriter, field)
    } else if (field.tag === 19 && field.wire === WireType.LENGTH_DELIMITED) {
      const uiFields = new ProtoReader(field.data).parseFields()
      const newUiFields: WireField[] = []
      for (const uiField of uiFields) {
        if (uiField.tag === 1 && uiField.wire === WireType.LENGTH_DELIMITED) {
          newUiFields.push({
            tag: 1,
            wire: WireType.LENGTH_DELIMITED,
            data: patchUiContentChildren(
              uiField.data,
              newChildGuids,
              parentGuid,
              maskSettings,
              groupName
            )
          })
        } else {
          newUiFields.push(uiField)
        }
      }
      prWriter.writeBytes(19, buildMessage(newUiFields))
    } else if (field.tag === 3 && field.wire === WireType.LENGTH_DELIMITED && groupName) {
      prWriter.writeString(3, groupName)
      resourceNameWritten = true
    } else {
      writeField(prWriter, field)
    }
  }

  if (!insertedNewRefs) {
    for (const ref of newRefs) prWriter.writeBytes(2, ref)
  }
  if (groupName && !resourceNameWritten) {
    prWriter.writeString(3, groupName)
  }
  return prWriter.getBytes()
}

export interface ConvertImageModeOptions {
  verbose?: boolean
}

/** Convert an image-mode document into GIA bytes using a template GIA. */
export function convertImageModeDocumentToGiaBytes(
  document: ImageModeDocument,
  templateBytes: Uint8Array,
  options: ConvertImageModeOptions = {}
): Uint8Array {
  const verbose = options.verbose ?? false
  const groupName = normalizeGroupName(document.group_name)
  const { header, rootFields, tail } = parseGiaRootFields(templateBytes)

  const removedGuids = new Set<number>()
  for (const field of rootFields) {
    if (field.tag === 2 && field.wire === WireType.LENGTH_DELIMITED) {
      const info = parseResourceEntry(field.data)
      if (info.class === UI_IMAGE_RESOURCE_CLASS) {
        if (verbose) console.log(`Removing image node: ${info.name} (${info.guid})`)
        removedGuids.add(info.guid)
      }
    }
  }

  let parentGuid = 0
  let prData: Uint8Array | null = null
  for (const field of rootFields) {
    if (field.tag === 1 && field.wire === WireType.LENGTH_DELIMITED) {
      prData = field.data
      break
    }
  }
  if (!prData) throw new Error('GIA template missing primary resource (field 1)')
  const prFields = parsePrimaryResource(prData)
  for (const field of prFields) {
    if (field.tag === 1 && field.wire === WireType.LENGTH_DELIMITED) {
      parentGuid = checkLocatorGuid(field.data)
      break
    }
  }
  if (verbose) console.log(`Parent GUID: ${parentGuid}`)

  const existingGuids = new Set<number>()
  for (const field of rootFields) {
    if (field.tag === 1 && field.wire === WireType.LENGTH_DELIMITED) {
      existingGuids.add(checkLocatorGuid(field.data))
    } else if (field.tag === 2 && field.wire === WireType.LENGTH_DELIMITED) {
      const info = parseResourceEntry(field.data)
      if (info.guid) existingGuids.add(info.guid)
    }
  }
  const reservedGuids = new Set([...existingGuids].filter((guid) => !removedGuids.has(guid)))
  let nextGuid = removedGuids.size > 0 ? Math.max(...removedGuids) + 1 : DEFAULT_NEXT_GUID
  while (reservedGuids.has(nextGuid)) nextGuid += 1

  const maskSettings = normalizeMaskSettings(document.mask ?? null)
  const elements = document.elements ?? []
  const orderedElements = [...elements].reverse()
  const serializedElements = [...elements].reverse()

  interface IndexedItem {
    guid: number
    entry: Uint8Array
    ref: Uint8Array
  }
  const indexedItems: IndexedItem[] = []

  for (let i = 0; i < orderedElements.length; i++) {
    const element = orderedElements[i]
    const shapeType = normalizeShapeType(element.type)
    const center = element.relative ?? element.center ?? {}
    const size = element.size ?? {}
    const rot = element.rotation
    const rotZ = typeof rot === 'object' && rot !== null ? (rot.z ?? 0) : typeof rot === 'number' ? rot : 0

    while (reservedGuids.has(nextGuid)) nextGuid += 1
    const newGuid = nextGuid
    reservedGuids.add(newGuid)
    nextGuid += 1

    const name = normalizeElementName(element, String(i + 1))
    const offsetX = Number(center.x ?? 0)
    const offsetY = Number(center.y ?? 0)

    let sizeX: number
    let sizeY: number
    if (shapeType === 'ellipse') {
      sizeX = Number(size.rx ?? 1) * 2
      sizeY = Number(size.ry ?? 1) * 2
    } else {
      sizeX = Number(size.width ?? 1)
      sizeY = Number(size.height ?? 1)
    }

    const imageAssetRef = Number(
      element.image_asset_ref ?? DEFAULT_IMAGE_ASSET_REFS[shapeType] ?? 100002
    )
    const fallbackPacked = Number(element.packed_color ?? DEFAULT_PACKED_COLOR)
    const packedColor = colorToPacked(element.color, element.alpha, fallbackPacked)
    const index = i + 2

    const uiContent = createUiImagePayload({
      guid: newGuid,
      index,
      parentGuid,
      offsetX,
      offsetY,
      sizeX,
      sizeY,
      imageAssetRef,
      packedColor,
      rotZ,
      pivotX: 0.5,
      pivotY: 0.5,
      name
    })
    indexedItems.push({
      guid: newGuid,
      entry: createUiImageEntry(newGuid, name, uiContent).getBytes(),
      ref: createReferenceLocator(newGuid, UI_IMAGE_KIND).getBytes()
    })
    if (verbose) {
      console.log(
        `Generated image node: ${name} (guid=${newGuid}, offset=(${offsetX}, ${offsetY}), size=(${sizeX}, ${sizeY}), rot_z=${rotZ})`
      )
    }
  }

  const newImageEntries: Uint8Array[] = []
  const newChildGuids: number[] = []
  const newRefs: Uint8Array[] = []
  for (const item of indexedItems) {
    newImageEntries.push(item.entry)
    newChildGuids.push(item.guid)
    newRefs.push(item.ref)
  }

  const prBytes = patchPrimaryResourceImage(
    prFields,
    removedGuids,
    newRefs,
    newChildGuids,
    parentGuid,
    maskSettings,
    groupName
  )
  return rebuildGia({
    header,
    rootFields,
    tail,
    newEntries: newImageEntries,
    primaryResourceBytes: prBytes,
    removedClass: UI_IMAGE_RESOURCE_CLASS
  })
}
