/**
 * Image editor scene model — the unified document format for the Miliastra
 * image editor capability (基础形状图元 → GIA image-mode export).
 *
 * Shape semantics follow the game image editor:
 * - x/y is the CENTER of the element in canvas pixels (not top-left).
 * - rotation is degrees, CCW-positive (screen-space CSS exports negate it).
 * - zIndex orders layers; isBackground marks the full-canvas base rectangle.
 */

export const IMAGE_SHAPE_TYPES = [
  'ellipse',
  'rectangle',
  'triangle',
  'four_point_star',
  'five_point_star',
  'ring'
] as const

export const ALL_SHAPE_TYPES = [...IMAGE_SHAPE_TYPES, 'other'] as const

export type ImageShapeType = (typeof IMAGE_SHAPE_TYPES)[number]
export type ShapeType = (typeof ALL_SHAPE_TYPES)[number]

/** The game's built-in image materials referenced by image_asset_ref. */
export const IMAGE_ASSET_REFS: Record<ImageShapeType, number> = {
  rectangle: 100001,
  ellipse: 100002,
  triangle: 100003,
  four_point_star: 100004,
  five_point_star: 100005,
  ring: 100006
}

export const DEFAULT_CANVAS_WIDTH = 300
export const DEFAULT_CANVAS_HEIGHT = 300
export const DEFAULT_CANVAS_BACKGROUND = '#ffffff'
export const DEFAULT_SHAPE_SIZE = 80.0
export const DEFAULT_SHAPE_COLOR = '#4f46e5'
export const RING_INNER_RATIO = 0.8

export type SourceType = 'json' | 'css' | 'svg' | 'editor'

export interface CanvasModel {
  width: number
  height: number
  background: string
}

export interface MetaModel {
  sourceType: SourceType
  sourceName: string
  warnings: string[]
}

export interface SceneElementModel {
  id: string
  name: string
  type: ShapeType
  x: number
  y: number
  width: number
  height: number
  rotation: number
  color: string
  opacity: number
  zIndex: number
  isBackground: boolean
}

export interface LibraryCategoryModel {
  key: string
  label: string
  supported: boolean
}

export interface LibraryBaseShapePresetModel {
  type: ShapeType
  color: string
  width: number
  height: number
}

export interface LibrarySavedItemModel {
  id: string
  name: string
  category: string
  element: SceneElementModel
}

export interface SceneLibraryModel {
  activeCategory: string
  categories: LibraryCategoryModel[]
  baseShapePresets: LibraryBaseShapePresetModel[]
  savedItems: LibrarySavedItemModel[]
}

export interface SceneDocumentModel {
  canvas: CanvasModel
  elements: SceneElementModel[]
  meta: MetaModel
  library: SceneLibraryModel
}

/** Import source payload accepted by parseJsonScene / parseCssScene / parseSvgScene. */
export type ImportSourceType = Exclude<SourceType, 'editor'>
