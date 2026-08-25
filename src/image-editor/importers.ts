/**
 * Scene importers: JSON / CSS (Primitive Shaper style) / SVG → SceneDocument.
 * Ported from the Miliastra image editor web UI backend semantics.
 */

import { defaultCanvas, newId } from './constants.js'
import { normalizeColor } from './color.js'
import { fitSceneCanvasToElements, normalizeScene } from './normalize.js'
import {
  ALL_SHAPE_TYPES,
  DEFAULT_CANVAS_BACKGROUND,
  DEFAULT_CANVAS_HEIGHT,
  DEFAULT_CANVAS_WIDTH,
  DEFAULT_SHAPE_COLOR,
  DEFAULT_SHAPE_SIZE,
  RING_INNER_RATIO,
  type CanvasModel,
  type MetaModel,
  type SceneDocumentModel,
  type SceneElementModel,
  type ShapeType
} from './types.js'

const TRIANGLE_CLIP_PATH = 'polygon(50% 0%, 0% 100%, 100% 100%)'
const RING_GRADIENT_RE =
  /radial-gradient\([^)]*transparent\s+[\d.]+%\s*,\s*(#[0-9a-f]{3,8}|rgb\([^)]*\)|[a-z]+)\s*[\d.]+%/

export class ImageImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImageImportError'
  }
}

function normalizeShapeType(type: string): ShapeType {
  return (ALL_SHAPE_TYPES as readonly string[]).includes(type) ? (type as ShapeType) : 'rectangle'
}

function shapeElement(
  partial: Partial<SceneElementModel> & { type: ShapeType }
): SceneElementModel {
  return {
    id: partial.id ?? newId(),
    name: partial.name ?? '',
    type: partial.type,
    x: partial.x ?? 0,
    y: partial.y ?? 0,
    width: partial.width ?? DEFAULT_SHAPE_SIZE,
    height: partial.height ?? DEFAULT_SHAPE_SIZE,
    rotation: partial.rotation ?? 0,
    color: partial.color ?? DEFAULT_SHAPE_COLOR,
    opacity: partial.opacity ?? 1,
    zIndex: partial.zIndex ?? 0,
    isBackground: partial.isBackground ?? false
  }
}

// ---------------------------------------------------------------------------
// JSON
// ---------------------------------------------------------------------------

function convertBasicJsonElement(item: unknown, index: number): SceneElementModel {
  if (typeof item !== 'object' || item === null) {
    throw new ImageImportError('JSON elements 中存在非对象元素')
  }
  const record = item as Record<string, unknown>
  const shapeType = normalizeShapeType(typeof record.type === 'string' ? record.type : 'rectangle')
  const asFloat = (value: unknown, fallback: number): number => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return shapeElement({
    id: typeof record.id === 'string' ? record.id : newId(),
    name: typeof record.name === 'string' ? record.name : '',
    type: shapeType,
    x: asFloat(record.x ?? record.left, 150),
    y: asFloat(record.y ?? record.top, 150),
    width: asFloat(record.width ?? record.w, DEFAULT_SHAPE_SIZE),
    height: asFloat(record.height ?? record.h, DEFAULT_SHAPE_SIZE),
    rotation: asFloat(record.rotation, 0),
    color: normalizeColor(typeof record.color === 'string' ? record.color : DEFAULT_SHAPE_COLOR),
    opacity: asFloat(record.opacity, 1),
    zIndex: Number.isFinite(Number(record.zIndex)) ? Number(record.zIndex) : index,
    isBackground: Boolean(record.isBackground)
  })
}

function parseJsonPayload(payload: unknown): SceneDocumentModel {
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'canvas' in payload &&
    'elements' in payload
  ) {
    const scene = payload as Partial<SceneDocumentModel>
    const document: SceneDocumentModel = {
      canvas: (scene.canvas as CanvasModel) ?? defaultCanvas(),
      elements: (scene.elements as SceneElementModel[]) ?? [],
      meta: (scene.meta as MetaModel) ?? {
        sourceType: 'json',
        sourceName: '',
        warnings: []
      },
      library: scene.library ?? { activeCategory: '基础形状', categories: [], baseShapePresets: [], savedItems: [] }
    }
    document.meta.sourceType = 'json'
    return normalizeScene(document)
  }
  if (typeof payload === 'object' && payload !== null && 'elements' in payload) {
    const list = (payload as { elements: unknown[] }).elements
    const scene: SceneDocumentModel = {
      canvas: defaultCanvas(),
      elements: list.map((item, index) => convertBasicJsonElement(item, index)),
      meta: { sourceType: 'json', sourceName: '', warnings: [] },
      library: { activeCategory: '基础形状', categories: [], baseShapePresets: [], savedItems: [] }
    }
    return normalizeScene(
      fitSceneCanvasToElements(scene, {
        expandOnly: false,
        warningMessage: 'JSON 未提供画布尺寸，已根据图元范围自动拟合画布。'
      })
    )
  }
  if (Array.isArray(payload)) {
    const scene: SceneDocumentModel = {
      canvas: defaultCanvas(),
      elements: payload.map((item, index) => convertBasicJsonElement(item, index)),
      meta: { sourceType: 'json', sourceName: '', warnings: [] },
      library: { activeCategory: '基础形状', categories: [], baseShapePresets: [], savedItems: [] }
    }
    return normalizeScene(
      fitSceneCanvasToElements(scene, {
        expandOnly: false,
        warningMessage: 'JSON 未提供画布尺寸，已根据图元范围自动拟合画布。'
      })
    )
  }
  throw new ImageImportError('不支持的 JSON 结构，期望为 SceneDocument 或 elements 数组')
}

export function parseJsonScene(content: string): SceneDocumentModel {
  let payload: unknown
  try {
    payload = JSON.parse(content)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new ImageImportError(`JSON 解析失败: ${message}`)
  }
  if (typeof payload === 'object' && payload !== null && 'scene' in payload) {
    payload = (payload as { scene: unknown }).scene
  }
  return parseJsonPayload(payload)
}

// ---------------------------------------------------------------------------
// CSS (Primitive Shaper style)
// ---------------------------------------------------------------------------

function findCssValue(body: string, property: string): string | undefined {
  const match = new RegExp(`${property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*([^;]+);`).exec(
    body
  )
  return match ? match[1].trim() : undefined
}

function selectorToElementName(selector: string): string {
  const primary = selector.split(',')[0].trim().replace(/\s+/g, ' ')
  return primary || 'css-element'
}

function resolveCssFillColor(body: string, fallback: string): string {
  return findCssValue(body, 'background') ?? findCssValue(body, 'background-color') ?? fallback
}

function normalizeClipPath(value: string | undefined): string {
  if (!value) return ''
  return value.replace(/\s+/g, ' ').trim().toLowerCase()
}

function parsePx(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const match = /-?\d+(\.\d+)?/.exec(value)
  return match ? Number(match[0]) : fallback
}

function parseFloatValue(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/** CSS screen-space rotation is clockwise; scene rotation is CCW → negate. */
function parseRotation(transform: string): number {
  const match = /rotate\((-?\d+(\.\d+)?)deg\)/.exec(transform)
  return match ? -Number(match[1]) : 0
}

function parseBorderShorthand(value: string | undefined): { width: number; color: string } | undefined {
  if (!value) return undefined
  const match = /(-?\d+(\.\d+)?)px\s+\w+\s+(.+)/i.exec(value.trim())
  if (!match) return undefined
  return { width: Number(match[1]), color: match[3].trim() }
}

function parseTriangleBorder(body: string): { width: number; height: number; color: string } | undefined {
  const left = parseBorderShorthand(findCssValue(body, 'border-left'))
  const right = parseBorderShorthand(findCssValue(body, 'border-right'))
  const bottom = parseBorderShorthand(findCssValue(body, 'border-bottom'))
  if (!left || !right || !bottom) return undefined
  if (bottom.color.trim().toLowerCase() === 'transparent') return undefined
  if (left.width <= 0 || right.width <= 0 || bottom.width <= 0) return undefined
  return { width: left.width + right.width, height: bottom.width, color: bottom.color }
}

function parseCssRuleBlocks(content: string): { selector: string; body: string }[] {
  const blocks: { selector: string; body: string }[] = []
  const pattern = /([^{}]+)\{([^{}]*)\}/gs
  for (const match of content.matchAll(pattern)) {
    blocks.push({
      selector: match[1].trim().replace(/\s+/g, ' '),
      body: match[2]
    })
  }
  return blocks
}

export function parseCssScene(content: string): SceneDocumentModel {
  const warnings: string[] = []
  const canvasMatch = /\.shaper-container\s*\{(?<body>[\s\S]*?)\}/.exec(content)
  let width = DEFAULT_CANVAS_WIDTH
  let height = DEFAULT_CANVAS_HEIGHT
  const background = DEFAULT_CANVAS_BACKGROUND
  if (canvasMatch) {
    const body = canvasMatch.groups?.body ?? ''
    width = parsePx(findCssValue(body, 'width'), DEFAULT_CANVAS_WIDTH)
    height = parsePx(findCssValue(body, 'height'), DEFAULT_CANVAS_HEIGHT)
    if (findCssValue(body, 'background') !== undefined || findCssValue(body, 'background-color') !== undefined) {
      warnings.push('已忽略 .shaper-container 的背景颜色；如需背景，请使用铺满画布的矩形图元表示。')
    }
  }

  const elements: SceneElementModel[] = []
  for (const rule of parseCssRuleBlocks(content)) {
    if (rule.selector.includes('.shaper-container')) continue
    const body = rule.body
    if (findCssValue(body, 'left') === undefined || findCssValue(body, 'top') === undefined) continue
    if (findCssValue(body, 'width') === undefined || findCssValue(body, 'height') === undefined) continue

    const index = elements.length
    const triangleBorder = parseTriangleBorder(body)
    const elementBackground = findCssValue(body, 'background') ?? ''
    const ringGradient =
      elementBackground.toLowerCase().includes('radial-gradient')
        ? RING_GRADIENT_RE.exec(elementBackground.toLowerCase())
        : null
    const color = normalizeColor(resolveCssFillColor(body, DEFAULT_CANVAS_BACKGROUND))
    const opacity = parseFloatValue(findCssValue(body, 'opacity'), 1)
    const rotation = parseRotation(findCssValue(body, 'transform') ?? '')
    const borderRadius = (findCssValue(body, 'border-radius') ?? '').trim()
    const clipPath = normalizeClipPath(findCssValue(body, 'clip-path'))

    let shapeType: ShapeType
    let shapeWidth: number
    let shapeHeight: number
    let shapeX: number
    let shapeY: number
    let shapeColor = color
    if (triangleBorder) {
      shapeType = 'triangle'
      shapeWidth = triangleBorder.width
      shapeHeight = triangleBorder.height
      shapeColor = normalizeColor(triangleBorder.color)
      shapeX = parsePx(findCssValue(body, 'left'), width / 2)
      shapeY = parsePx(findCssValue(body, 'top'), height / 2) + shapeHeight / 2
    } else if (clipPath === TRIANGLE_CLIP_PATH) {
      shapeType = 'triangle'
      shapeWidth = parsePx(findCssValue(body, 'width'), DEFAULT_SHAPE_SIZE)
      shapeHeight = parsePx(findCssValue(body, 'height'), DEFAULT_SHAPE_SIZE)
      shapeX = parsePx(findCssValue(body, 'left'), width / 2)
      shapeY = parsePx(findCssValue(body, 'top'), height / 2)
    } else if (ringGradient) {
      shapeType = 'ring'
      shapeWidth = parsePx(findCssValue(body, 'width'), DEFAULT_SHAPE_SIZE)
      shapeHeight = parsePx(findCssValue(body, 'height'), DEFAULT_SHAPE_SIZE)
      shapeX = parsePx(findCssValue(body, 'left'), width / 2)
      shapeY = parsePx(findCssValue(body, 'top'), height / 2)
      shapeColor = normalizeColor(ringGradient[1])
    } else if (borderRadius === '50%') {
      shapeType = 'ellipse'
      shapeWidth = parsePx(findCssValue(body, 'width'), DEFAULT_SHAPE_SIZE)
      shapeHeight = parsePx(findCssValue(body, 'height'), DEFAULT_SHAPE_SIZE)
      shapeX = parsePx(findCssValue(body, 'left'), width / 2)
      shapeY = parsePx(findCssValue(body, 'top'), height / 2)
    } else {
      shapeType = 'rectangle'
      shapeWidth = parsePx(findCssValue(body, 'width'), DEFAULT_SHAPE_SIZE)
      shapeHeight = parsePx(findCssValue(body, 'height'), DEFAULT_SHAPE_SIZE)
      shapeX = parsePx(findCssValue(body, 'left'), width / 2)
      shapeY = parsePx(findCssValue(body, 'top'), height / 2)
    }

    elements.push(
      shapeElement({
        id: `css-${index}`,
        name: selectorToElementName(rule.selector),
        type: shapeType,
        x: shapeX,
        y: shapeY,
        width: shapeWidth,
        height: shapeHeight,
        rotation,
        color: shapeColor,
        opacity,
        zIndex: Number(parseFloatValue(findCssValue(body, 'z-index'), index)),
        isBackground: index === 0 && shapeType === 'rectangle'
      })
    )
  }

  if (elements.length === 0) {
    throw new ImageImportError('没有从 CSS 中解析出任何可定位图元')
  }

  const scene: SceneDocumentModel = {
    canvas: { width, height, background },
    elements,
    meta: { sourceType: 'css', sourceName: '', warnings },
    library: { activeCategory: '基础形状', categories: [], baseShapePresets: [], savedItems: [] }
  }

  if (!canvasMatch) {
    scene.meta.warnings.push('未找到 .shaper-container，已根据图元范围自动拟合画布尺寸。')
    return normalizeScene(fitSceneCanvasToElements(scene, { expandOnly: false }))
  }

  let hasOverflow = false
  for (const element of elements) {
    const radians = (element.rotation * Math.PI) / 180
    const bboxWidth = element.width * Math.abs(Math.cos(radians)) + element.height * Math.abs(Math.sin(radians))
    const bboxHeight = element.width * Math.abs(Math.sin(radians)) + element.height * Math.abs(Math.cos(radians))
    if (
      element.x - bboxWidth / 2 < 0 ||
      element.y - bboxHeight / 2 < 0 ||
      element.x + bboxWidth / 2 > width ||
      element.y + bboxHeight / 2 > height
    ) {
      hasOverflow = true
      break
    }
  }
  if (hasOverflow) {
    return normalizeScene(
      fitSceneCanvasToElements(scene, {
        expandOnly: true,
        warningMessage: '检测到部分图元超出 CSS 容器范围，已自动扩展画布以容纳全部图元。'
      })
    )
  }
  return normalizeScene(scene)
}

// ---------------------------------------------------------------------------
// SVG (supported subset: rect / circle / ellipse / 3-point polygon)
// ---------------------------------------------------------------------------

interface SvgTag {
  name: string
  attributes: Record<string, string>
}

function parseSvgTags(content: string): SvgTag[] {
  const withoutComments = content.replace(/<!--[\s\S]*?-->/g, '')
  const tags: SvgTag[] = []
  const tagPattern = /<([a-zA-Z][\w:.-]*)([^>]*)>/g
  for (const match of withoutComments.matchAll(tagPattern)) {
    const name = match[1]
    const rest = match[2]
    if (rest.trim().startsWith('/') || name.startsWith('/')) continue
    const attributes: Record<string, string> = {}
    const attrPattern = /([a-zA-Z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g
    for (const attr of rest.matchAll(attrPattern)) {
      attributes[attr[1]] = attr[3] ?? attr[4] ?? ''
    }
    tags.push({ name: name.split(':').pop() ?? name, attributes })
  }
  return tags
}

function stripNs(tag: string): string {
  return tag.split(':').pop() ?? tag
}

function parseSvgNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback
  const match = /-?\d+(\.\d+)?/.exec(value)
  return match ? Number(match[0]) : fallback
}

function parsePolygonPoints(value: string): [number, number][] {
  const points: [number, number][] = []
  const pattern = /(-?\d+(\.\d+)?)[\s,]+(-?\d+(\.\d+)?)/g
  for (const match of value.matchAll(pattern)) {
    points.push([Number(match[1]), Number(match[3])])
  }
  return points
}

export function parseSvgScene(content: string): SceneDocumentModel {
  const warnings: string[] = []
  let tags: SvgTag[]
  try {
    tags = parseSvgTags(content)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new ImageImportError(`SVG 解析失败: ${message}`)
  }

  const root = tags.find((tag) => stripNs(tag.name) === 'svg')
  let width = parseSvgNumber(root?.attributes['width'], DEFAULT_CANVAS_WIDTH)
  let height = parseSvgNumber(root?.attributes['height'], DEFAULT_CANVAS_HEIGHT)
  const viewBox = root?.attributes['viewBox']
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/)
    if (parts.length === 4) {
      width = parseFloatValue(parts[2], width)
      height = parseFloatValue(parts[3], height)
    }
  }

  const elements: SceneElementModel[] = []
  const unsupportedTags: string[] = []
  let index = 0
  for (const node of tags) {
    const tag = stripNs(node.name)
    if (tag === 'svg') continue
    const fill = normalizeColor(node.attributes['fill'] ?? DEFAULT_SHAPE_COLOR)
    const opacity = parseFloatValue(node.attributes['opacity'], 1)
    const zIndex = index

    if (tag === 'rect') {
      const x = parseSvgNumber(node.attributes['x'], 0)
      const y = parseSvgNumber(node.attributes['y'], 0)
      const w = parseSvgNumber(node.attributes['width'], DEFAULT_SHAPE_SIZE)
      const h = parseSvgNumber(node.attributes['height'], DEFAULT_SHAPE_SIZE)
      elements.push(
        shapeElement({
          type: 'rectangle',
          x: x + w / 2,
          y: y + h / 2,
          width: w,
          height: h,
          color: fill,
          opacity,
          zIndex,
          isBackground: zIndex === 0
        })
      )
      index += 1
    } else if (tag === 'circle') {
      const cx = parseSvgNumber(node.attributes['cx'], width / 2)
      const cy = parseSvgNumber(node.attributes['cy'], height / 2)
      const r = parseSvgNumber(node.attributes['r'], DEFAULT_SHAPE_SIZE / 2)
      elements.push(
        shapeElement({
          type: 'ellipse',
          x: cx,
          y: cy,
          width: r * 2,
          height: r * 2,
          color: fill,
          opacity,
          zIndex,
          isBackground: zIndex === 0
        })
      )
      index += 1
    } else if (tag === 'ellipse') {
      const cx = parseSvgNumber(node.attributes['cx'], width / 2)
      const cy = parseSvgNumber(node.attributes['cy'], height / 2)
      const rx = parseSvgNumber(node.attributes['rx'], DEFAULT_SHAPE_SIZE / 2)
      const ry = parseSvgNumber(node.attributes['ry'], DEFAULT_SHAPE_SIZE / 2)
      elements.push(
        shapeElement({
          type: 'ellipse',
          x: cx,
          y: cy,
          width: rx * 2,
          height: ry * 2,
          color: fill,
          opacity,
          zIndex,
          isBackground: zIndex === 0
        })
      )
      index += 1
    } else if (tag === 'polygon') {
      const points = parsePolygonPoints(node.attributes['points'] ?? '')
      if (points.length === 3) {
        const xs = points.map((p) => p[0])
        const ys = points.map((p) => p[1])
        elements.push(
          shapeElement({
            type: 'triangle',
            x: (Math.min(...xs) + Math.max(...xs)) / 2,
            y: (Math.min(...ys) + Math.max(...ys)) / 2,
            width: Math.max(...xs) - Math.min(...xs),
            height: Math.max(...ys) - Math.min(...ys),
            color: fill,
            opacity,
            zIndex,
            isBackground: zIndex === 0
          })
        )
        index += 1
      } else {
        unsupportedTags.push('polygon')
      }
    } else {
      unsupportedTags.push(tag)
    }
  }

  if (unsupportedTags.length > 0) {
    warnings.push(`部分 SVG 节点未导入: ${[...new Set(unsupportedTags)].sort().join(', ')}`)
  }
  if (elements.length === 0) {
    throw new ImageImportError('SVG 中没有可导入的基础图形')
  }

  return normalizeScene({
    canvas: { width, height, background: DEFAULT_CANVAS_BACKGROUND },
    elements,
    meta: { sourceType: 'svg', sourceName: '', warnings },
    library: { activeCategory: '基础形状', categories: [], baseShapePresets: [], savedItems: [] }
  })
}
