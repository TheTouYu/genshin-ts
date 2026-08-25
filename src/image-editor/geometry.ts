/**
 * Geometry helpers for base shapes: bounds, triangle/star polygons.
 * Scene rotation is CCW-positive; screen-space exports negate it.
 */

import type { SceneElementModel } from './types.js'

export type Point = readonly [number, number]

/** Rotated bounding box of an element (absolute canvas space). */
export function getElementBounds(element: SceneElementModel): {
  left: number
  top: number
  right: number
  bottom: number
} {
  const radians = (element.rotation * Math.PI) / 180
  const cosV = Math.abs(Math.cos(radians))
  const sinV = Math.abs(Math.sin(radians))
  const bboxWidth = element.width * cosV + element.height * sinV
  const bboxHeight = element.width * sinV + element.height * cosV
  return {
    left: element.x - bboxWidth / 2,
    top: element.y - bboxHeight / 2,
    right: element.x + bboxWidth / 2,
    bottom: element.y + bboxHeight / 2
  }
}

/** Union bounding box across all elements (Infinity when none). */
export function unionElementBounds(elements: SceneElementModel[]): {
  minX: number
  minY: number
  maxX: number
  maxY: number
} {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const element of elements) {
    const bounds = getElementBounds(element)
    minX = Math.min(minX, bounds.left)
    minY = Math.min(minY, bounds.top)
    maxX = Math.max(maxX, bounds.right)
    maxY = Math.max(maxY, bounds.bottom)
  }
  return { minX, minY, maxX, maxY }
}

export function trianglePoints(cx: number, cy: number, width: number, height: number): Point[] {
  const halfW = width / 2
  const halfH = height / 2
  return [
    [cx, cy - halfH],
    [cx - halfW, cy + halfH],
    [cx + halfW, cy + halfH]
  ]
}

export function starPoints(
  cx: number,
  cy: number,
  width: number,
  height: number,
  points: number,
  innerRatio: number
): Point[] {
  const outerRx = width / 2
  const outerRy = height / 2
  const innerRx = outerRx * innerRatio
  const innerRy = outerRy * innerRatio
  const total = points * 2
  const result: Point[] = []
  for (let index = 0; index < total; index++) {
    const angle = -Math.PI / 2 + (index * Math.PI) / points
    const radiusX = index % 2 === 0 ? outerRx : innerRx
    const radiusY = index % 2 === 0 ? outerRy : innerRy
    result.push([cx + Math.cos(angle) * radiusX, cy + Math.sin(angle) * radiusY])
  }
  return result
}

export function ellipsePoints(
  cx: number,
  cy: number,
  width: number,
  height: number,
  ratio = 1.0,
  segments = 36
): Point[] {
  const result: Point[] = []
  for (let index = 0; index < segments; index++) {
    const angle = (Math.PI * 2 * index) / segments
    result.push([
      cx + Math.cos(angle) * (width / 2) * ratio,
      cy + Math.sin(angle) * (height / 2) * ratio
    ])
  }
  return result
}

export function rotatePoints(points: Point[], cx: number, cy: number, degrees: number): Point[] {
  const radians = (degrees * Math.PI) / 180
  const cosV = Math.cos(radians)
  const sinV = Math.sin(radians)
  return points.map(([x, y]) => {
    const dx = x - cx
    const dy = y - cy
    return [cx + dx * cosV - dy * sinV, cy + dx * sinV + dy * cosV] as Point
  })
}

export function formatPoints(points: Point[]): string {
  return points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
}
