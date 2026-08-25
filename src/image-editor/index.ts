/**
 * Image editor capability — public API.
 *
 * Author and convert Miliastra (原神·奇巧工坊) image scenes: unified
 * SceneDocument model, CSS/JSON/SVG import, JSON/CSS/SVG export and
 * GIA image-mode (kind=8, class=15) export for the game image editor.
 */

import fs from 'node:fs'

import { loadDefaultImageTemplate } from './gia/template.js'
import { convertImageModeDocumentToGiaBytes } from './gia/image_mode.js'
import { sceneToGiaDocument } from './exporters.js'
import type { SceneDocumentModel } from './types.js'

export * from './types.js'
export * from './constants.js'

export { normalizeColor, toPackedArgb, colorWithAlphaCss, rgbStringToHex } from './color.js'
export {
  getElementBounds,
  unionElementBounds,
  trianglePoints,
  starPoints,
  ellipsePoints,
  rotatePoints,
  formatPoints,
  type Point
} from './geometry.js'
export {
  normalizeScene,
  normalizeLibrary,
  normalizeRotation,
  fitSceneCanvasToElements,
  normalizeSourceType,
  type FitCanvasOptions
} from './normalize.js'
export {
  parseJsonScene,
  parseCssScene,
  parseSvgScene,
  ImageImportError
} from './importers.js'
export {
  sceneToJson,
  sceneToCss,
  sceneToSvg,
  sceneToGiaDocument,
  defaultGiaGroupName,
  type GiaDocument,
  type GiaElementDocument
} from './exporters.js'
export {
  convertImageModeDocumentToGiaBytes,
  createUiImagePayload,
  createUiImageEntry,
  createReferenceLocator,
  patchPrimaryResourceImage,
  patchUiContentChildren,
  parseGiaRootFields,
  parsePrimaryResource,
  rebuildGia,
  normalizeMaskSettings,
  colorToPacked,
  DEFAULT_PACKED_COLOR,
  DEFAULT_IMAGE_ASSET_REFS,
  UI_IMAGE_RESOURCE_CLASS,
  UI_IMAGE_KIND,
  type ImageModeDocument,
  type ImageModeElement,
  type MaskSettingsInput,
  type NormalizedMaskSettings,
  type UiImagePayloadOptions
} from './gia/image_mode.js'
export { resolveDefaultImageTemplatePath, loadDefaultImageTemplate } from './gia/template.js'

export interface ConvertSceneToImageGiaOptions {
  /** GIA group name; defaults to today's date (YYYYMMDD). */
  groupName?: string
  /** Custom template GIA path (defaults to the vendored template). */
  templatePath?: string
  verbose?: boolean
}

/**
 * Convert a scene document to image-mode GIA bytes.
 * Throws when the scene has no exportable base shapes.
 */
export function convertSceneToImageGia(
  scene: SceneDocumentModel,
  options: ConvertSceneToImageGiaOptions = {}
): Uint8Array {
  const document = sceneToGiaDocument(scene, options.groupName)
  const template = options.templatePath
    ? fs.readFileSync(options.templatePath)
    : loadDefaultImageTemplate()
  return convertImageModeDocumentToGiaBytes(document, template, {
    verbose: options.verbose
  })
}
