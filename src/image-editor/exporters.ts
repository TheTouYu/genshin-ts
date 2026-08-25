/**
 * Scene exporters: JSON / CSS / SVG / GIA document.
 * The GIA document is the normalized input consumed by gia/image_mode.ts.
 */

import { formatPoints, starPoints, trianglePoints } from './geometry.js'
import { toPackedArgb } from './color.js'
import {
  IMAGE_ASSET_REFS,
  RING_INNER_RATIO,
  type ImageShapeType,
  type SceneDocumentModel,
  type SceneElementModel
} from './types.js'

const TRIANGLE_CLIP_PATH = 'polygon(50% 0%, 0% 100%, 100% 100%)'

export interface GiaElementDocument {
  type: ImageShapeType
  relative: { x: number; y: number }
  size: { rx?: number; ry?: number; width?: number; height?: number }
  rotation: { x: number; y: number; z: number }
  image_asset_ref: number
  packed_color: number
  name: string
  is_background: boolean
}

export interface GiaDocument {
  group_name: string
  elements: GiaElementDocument[]
}

export function sceneToJson(scene: SceneDocumentModel): string {
  return JSON.stringify(scene, null, 2)
}

export function sceneToCss(scene: SceneDocumentModel): string {
  const lines = [
    '/* Miliastra CSS Export */',
    '.shaper-container {',
    '  position: relative;',
    `  width: ${scene.canvas.width.toFixed(0)}px;`,
    `  height: ${scene.canvas.height.toFixed(0)}px;`,
    '  background: #ffffff;',
    '  overflow: hidden;',
    '}',
    '.shaper-element {',
    '  position: absolute;',
    '  box-sizing: border-box;',
    '}'
  ]

  const sorted = [...scene.elements].sort((a, b) => a.zIndex - b.zIndex)
  sorted.forEach((element, index) => {
    lines.push(`.shaper-element.shaper-e${index} {`)
    lines.push(`  left: ${element.x.toFixed(2)}px;`)
    lines.push(`  top: ${element.y.toFixed(2)}px;`)
    lines.push(`  width: ${element.width.toFixed(2)}px;`)
    lines.push(`  height: ${element.height.toFixed(2)}px;`)
    if (element.type === 'ring') {
      lines.push(
        `  background: radial-gradient(closest-side, transparent 79.5%, ${element.color} 80.5%, ${element.color} 100%, transparent 100%);`
      )
    } else {
      lines.push(`  background: ${element.color};`)
    }
    lines.push(`  opacity: ${element.opacity.toFixed(4)};`)
    lines.push(`  transform: translate(-50%, -50%) rotate(${(-element.rotation).toFixed(2)}deg);`)
    lines.push('  transform-origin: 50% 50%;')
    lines.push(`  z-index: ${element.zIndex};`)
    if (element.type === 'ellipse') lines.push('  border-radius: 50%;')
    if (element.type === 'triangle') lines.push(`  clip-path: ${TRIANGLE_CLIP_PATH};`)
    lines.push('}')
  })
  return lines.join('\n')
}

export function sceneToSvg(scene: SceneDocumentModel): string {
  const sorted = [...scene.elements].sort((a, b) => a.zIndex - b.zIndex)
  const ringCount = sorted.filter((element) => element.type === 'ring').length
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${scene.canvas.width.toFixed(0)}" height="${scene.canvas.height.toFixed(0)}" viewBox="0 0 ${scene.canvas.width.toFixed(0)} ${scene.canvas.height.toFixed(0)}">`,
    `<rect x="0" y="0" width="${scene.canvas.width.toFixed(0)}" height="${scene.canvas.height.toFixed(0)}" fill="${scene.canvas.background}" />`
  ]
  if (ringCount > 0) {
    parts.push(
      `<!-- Miliastra-Warning: SVG 导出已忽略 ${ringCount} 个圆环图元；如需圆环，请改用 CSS 或 JSON 导出。 -->`
    )
  }
  for (const element of sorted) {
    if (element.type === 'ring') continue
    const transform = `rotate(${(-element.rotation).toFixed(2)} ${element.x.toFixed(2)} ${element.y.toFixed(2)})`
    const opacity = element.opacity.toFixed(4)
    if (element.type === 'ellipse') {
      parts.push(
        `<ellipse cx="${element.x.toFixed(2)}" cy="${element.y.toFixed(2)}" rx="${(element.width / 2).toFixed(2)}" ry="${(element.height / 2).toFixed(2)}" fill="${element.color}" opacity="${opacity}" transform="${transform}" />`
      )
    } else if (element.type === 'triangle') {
      parts.push(
        `<polygon points="${formatPoints(trianglePoints(element.x, element.y, element.width, element.height))}" fill="${element.color}" opacity="${opacity}" transform="${transform}" />`
      )
    } else if (element.type === 'four_point_star') {
      parts.push(
        `<polygon points="${formatPoints(starPoints(element.x, element.y, element.width, element.height, 4, 0.45))}" fill="${element.color}" opacity="${opacity}" transform="${transform}" />`
      )
    } else if (element.type === 'five_point_star') {
      parts.push(
        `<polygon points="${formatPoints(starPoints(element.x, element.y, element.width, element.height, 5, 0.42))}" fill="${element.color}" opacity="${opacity}" transform="${transform}" />`
      )
    } else {
      parts.push(
        `<rect x="${(element.x - element.width / 2).toFixed(2)}" y="${(element.y - element.height / 2).toFixed(2)}" width="${element.width.toFixed(2)}" height="${element.height.toFixed(2)}" fill="${element.color}" opacity="${opacity}" transform="${transform}" />`
      )
    }
  }
  parts.push('</svg>')
  return parts.join('\n')
}

function normalizeGiaGroupName(value: string | undefined, fallback: string): string {
  if (!value) return fallback
  const trimmed = value.trim()
  if (!trimmed) return fallback
  const base = trimmed.split(/[\\/]/).pop() ?? trimmed
  const stem = base.replace(/\.[^.]*$/, '')
  return stem || base
}

export function defaultGiaGroupName(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}${month}${day}`
}

/** Convert a scene to the normalized GIA image-mode document. */
export function sceneToGiaDocument(scene: SceneDocumentModel, groupName?: string): GiaDocument {
  const elements: GiaElementDocument[] = []
  const canvasCenterX = scene.canvas.width / 2
  const canvasCenterY = scene.canvas.height / 2

  const ordered = [...scene.elements].sort(
    (a, b) => (a.isBackground ? 0 : 1) - (b.isBackground ? 0 : 1) || a.zIndex - b.zIndex
  )
  for (const element of ordered) {
    if (!(element.type in IMAGE_ASSET_REFS)) continue
    const shapeType = element.type as ImageShapeType
    const size: GiaElementDocument['size'] =
      shapeType === 'ellipse'
        ? { rx: round4(element.width / 2), ry: round4(element.height / 2) }
        : { width: round4(element.width), height: round4(element.height) }
    elements.push({
      type: shapeType,
      relative: {
        x: round4(element.x - canvasCenterX),
        y: round4(canvasCenterY - element.y)
      },
      size,
      rotation: { x: 0, y: 0, z: round4(element.rotation) },
      image_asset_ref: IMAGE_ASSET_REFS[shapeType],
      packed_color: toPackedArgb(element.color, element.opacity),
      name: String(element.zIndex + 1),
      is_background: element.isBackground
    })
  }

  if (elements.length === 0) {
    throw new Error('当前场景没有可导出的 GIA 基础图元')
  }

  return {
    group_name: normalizeGiaGroupName(groupName, defaultGiaGroupName()),
    elements
  }
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000
}
