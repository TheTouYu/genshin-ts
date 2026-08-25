import {
  ALL_SHAPE_TYPES,
  DEFAULT_CANVAS_BACKGROUND,
  DEFAULT_CANVAS_HEIGHT,
  DEFAULT_CANVAS_WIDTH,
  DEFAULT_SHAPE_COLOR,
  type CanvasModel,
  type LibraryCategoryModel,
  type LibraryBaseShapePresetModel,
  type SceneLibraryModel
} from './types.js'

/** Game image editor library categories (only 基础形状 is supported). */
export const LIBRARY_CATEGORY_DEFINITIONS: LibraryCategoryModel[] = [
  { key: 'function-icon-mono', label: '功能图标-单色', supported: false },
  { key: 'function-icon-color', label: '功能图标-彩色', supported: false },
  { key: 'gameplay-icon-mono', label: '玩法图标-单色', supported: false },
  { key: 'gameplay-icon-color', label: '玩法图标-彩色', supported: false },
  { key: 'ornament-mono', label: '装饰图案-单色', supported: false },
  { key: 'ornament-color', label: '装饰图案-彩色', supported: false },
  { key: 'floor-mono', label: '地板-单色', supported: false },
  { key: 'floor-color', label: '地板-彩色', supported: false },
  { key: 'basic-shape', label: '基础形状', supported: true },
  { key: 'divider', label: '分割线', supported: false },
  { key: 'skill-talent', label: '技能天赋', supported: false },
  { key: 'special-character', label: '特殊字符', supported: false },
  { key: 'item', label: '道具', supported: false },
  { key: 'creation', label: '造物', supported: false }
]

export function defaultLibraryCategories(): LibraryCategoryModel[] {
  return LIBRARY_CATEGORY_DEFINITIONS.map((item) => ({ ...item }))
}

export function defaultBaseShapePresets(): LibraryBaseShapePresetModel[] {
  return [
    { type: 'ellipse', color: '#0f766e', width: 88, height: 88 },
    { type: 'rectangle', color: '#c2410c', width: 102, height: 70 },
    { type: 'triangle', color: '#7c3aed', width: 96, height: 86 },
    { type: 'four_point_star', color: '#0f4c81', width: 90, height: 90 },
    { type: 'five_point_star', color: '#be123c', width: 92, height: 92 },
    { type: 'ring', color: '#f59e0b', width: 92, height: 92 }
  ]
}

export function defaultCanvas(): CanvasModel {
  return {
    width: DEFAULT_CANVAS_WIDTH,
    height: DEFAULT_CANVAS_HEIGHT,
    background: DEFAULT_CANVAS_BACKGROUND
  }
}

export function defaultLibrary(): SceneLibraryModel {
  return {
    activeCategory: '基础形状',
    categories: defaultLibraryCategories(),
    baseShapePresets: defaultBaseShapePresets(),
    savedItems: []
  }
}

/** Generate a short unique element id (8 hex chars). */
export function newId(): string {
  const bytes = new Uint8Array(4)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < 4; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** True when the shape type is a supported GIA base shape. */
export function isImageShapeType(type: string): boolean {
  return (ALL_SHAPE_TYPES as readonly string[]).includes(type)
}
