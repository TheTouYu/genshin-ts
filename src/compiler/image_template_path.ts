/**
 * Resolve the vendored GIA image-mode template path.
 * Kept outside the @ts-nocheck vendor re-export file so it type-checks.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Absolute path of the vendored image-mode GIA template. */
export function resolveImageTemplatePath(): string {
  return path.resolve(
    __dirname,
    '../thirdparty/miliastra-image-editor/template/image_template.gia'
  )
}
