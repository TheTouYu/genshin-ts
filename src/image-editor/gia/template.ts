/**
 * Locate and load the GIA image-mode base template.
 * The template is vendored under src/thirdparty and accessed through
 * src/compiler/gia_vendor.ts per the thirdparty access rules.
 */

import fs from 'node:fs'

import { resolveImageTemplatePath } from '../../compiler/gia_vendor.js'

export function resolveDefaultImageTemplatePath(): string {
  return resolveImageTemplatePath()
}

/** Load the default vendored image-mode template bytes. */
export function loadDefaultImageTemplate(): Uint8Array {
  return fs.readFileSync(resolveDefaultImageTemplatePath())
}
