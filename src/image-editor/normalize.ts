/**
 * Scene normalization and canvas fitting.
 * Mirrors the reference web UI backend semantics so imported scenes are
 * always consistent before export.
 */

import {
  LIBRARY_CATEGORY_DEFINITIONS,
  defaultBaseShapePresets,
  defaultLibraryCategories,
  newId
} from './constants.js'
import { normalizeColor } from './color.js'
import { unionElementBounds } from './geometry.js'
import {
  ALL_SHAPE_TYPES,
  DEFAULT_CANVAS_BACKGROUND,
  type CanvasModel,
  type LibraryBaseShapePresetModel,
  type LibraryCategoryModel,
  type LibrarySavedItemModel,
  type MetaModel,
  type SceneDocumentModel,
  type SceneElementModel,
  type SceneLibraryModel,
  type ShapeType,
  type SourceType
} from './types.js'

export function normalizeRotation(value: number): number {
  if (!Number.isFinite(value)) return 0
  let normalized = ((value + 180) % 360) - 180
  if (Math.abs(normalized + 180) < 1e-9 && value > 0) return 180
  return Math.abs(normalized) < 1e-9 ? 0 : normalized
}

function normalizeShapeType(type: string): ShapeType {
  return (ALL_SHAPE_TYPES as readonly string[]).includes(type) ? (type as ShapeType) : 'rectangle'
}

export function normalizeScene(scene: SceneDocumentModel): SceneDocumentModel {
  const canvas: CanvasModel = {
    width: Math.max(1, scene.canvas.width),
    height: Math.max(1, scene.canvas.height),
    background: normalizeColor(scene.canvas.background || DEFAULT_CANVAS_BACKGROUND)
  }
  const sorted = [...scene.elements].sort((a, b) => a.zIndex - b.zIndex)
  const elements = sorted.map((element, index) => ({
    id: element.id || newId(),
    name: element.name || '',
    type: normalizeShapeType(element.type),
    x: element.x,
    y: element.y,
    width: Math.max(1, element.width),
    height: Math.max(1, element.height),
    rotation: normalizeRotation(element.rotation),
    color: normalizeColor(element.color),
    opacity: Math.max(0, Math.min(1, element.opacity)),
    zIndex: index,
    isBackground: element.isBackground
  }))
  const meta: MetaModel = {
    sourceType: scene.meta.sourceType,
    sourceName: scene.meta.sourceName,
    warnings: [...scene.meta.warnings]
  }
  return {
    canvas,
    elements,
    meta,
    library: normalizeLibrary(scene.library)
  }
}

export interface FitCanvasOptions {
  /** Only grow the canvas; keep original size when elements fit inside. */
  expandOnly: boolean
  warningMessage?: string
}

/**
 * Fit canvas size (and optionally shift elements) to contain every element.
 * When elements extend past the origin, they are shifted into view.
 */
export function fitSceneCanvasToElements(
  scene: SceneDocumentModel,
  options: FitCanvasOptions
): SceneDocumentModel {
  if (scene.elements.length === 0) return scene
  const bounds = unionElementBounds(scene.elements)
  const shiftX = -Math.min(0, bounds.minX)
  const shiftY = -Math.min(0, bounds.minY)
  const fittedWidth = bounds.maxX + shiftX
  const fittedHeight = bounds.maxY + shiftY
  const targetWidth = options.expandOnly ? Math.max(scene.canvas.width, fittedWidth) : fittedWidth
  const targetHeight = options.expandOnly ? Math.max(scene.canvas.height, fittedHeight) : fittedHeight
  const shouldShift = shiftX > 0.001 || shiftY > 0.001
  const shouldResize =
    Math.abs(targetWidth - scene.canvas.width) > 0.001 ||
    Math.abs(targetHeight - scene.canvas.height) > 0.001
  if (!shouldShift && !shouldResize) return scene

  const shifted = scene.elements.map((element) => ({
    ...element,
    x: element.x + shiftX,
    y: element.y + shiftY
  }))
  const warnings = [...scene.meta.warnings]
  if (options.warningMessage && !warnings.includes(options.warningMessage)) {
    warnings.push(options.warningMessage)
  }
  return {
    canvas: { width: targetWidth, height: targetHeight, background: scene.canvas.background },
    elements: shifted,
    meta: { ...scene.meta, warnings },
    library: scene.library
  }
}

export function normalizeLibrary(library: SceneLibraryModel): SceneLibraryModel {
  const defaultByLabel = new Map(
    LIBRARY_CATEGORY_DEFINITIONS.map((item) => [item.label, item] as const)
  )
  const categories: LibraryCategoryModel[] = []
  const seenLabels = new Set<string>()
  for (const category of library.categories) {
    const label = category.label || category.key
    const definition = defaultByLabel.get(label)
    categories.push({
      key: category.key || (definition ? definition.key : label),
      label,
      supported: definition ? definition.supported : Boolean(category.supported)
    })
    seenLabels.add(label)
  }
  for (const definition of LIBRARY_CATEGORY_DEFINITIONS) {
    if (!seenLabels.has(definition.label)) categories.push({ ...definition })
  }

  const savedItems = library.savedItems.map((item, index) => {
    const shapeType = normalizeShapeType(item.element.type)
    const element = item.element
    return {
      id: item.id || `saved-${index}`,
      name: item.name || `${shapeType}-${index + 1}`,
      category: item.category || '基础形状',
      element: {
        id: element.id || newId(),
        name: element.name || item.name || '',
        type: shapeType,
        x: element.x,
        y: element.y,
        width: Math.max(1, element.width),
        height: Math.max(1, element.height),
        rotation: element.rotation,
        color: normalizeColor(element.color),
        opacity: Math.max(0, Math.min(1, element.opacity)),
        zIndex: Math.max(0, element.zIndex),
        isBackground: element.isBackground
      }
    }
  })

  let activeCategory = library.activeCategory || '基础形状'
  if (!categories.some((category) => category.label === activeCategory)) {
    activeCategory = '基础形状'
  }

  const presetsByType = new Map<string, LibraryBaseShapePresetModel>()
  for (const preset of library.baseShapePresets) {
    const shapeType = normalizeShapeType(preset.type)
    presetsByType.set(shapeType, {
      type: shapeType,
      color: normalizeColor(preset.color),
      width: Math.max(1, preset.width),
      height: Math.max(1, preset.height)
    })
  }
  const baseShapePresets = defaultBaseShapePresets().map(
    (defaultPreset) => presetsByType.get(defaultPreset.type) ?? defaultPreset
  )

  return { activeCategory, categories, baseShapePresets, savedItems }
}

/** Shape a sourceType string into a valid SourceType. */
export function normalizeSourceType(value: string): SourceType {
  return (['json', 'css', 'svg', 'editor'] as const).includes(value as SourceType)
    ? (value as SourceType)
    : 'editor'
}

export type { LibrarySavedItemModel }
