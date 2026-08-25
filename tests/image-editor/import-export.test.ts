/**
 * Image editor: import/export roundtrip tests (pure Node logic, run with tsx).
 */

import assert from 'node:assert/strict'

import { parseCssScene, parseJsonScene, parseSvgScene } from '../../src/image-editor/importers.js'
import {
  sceneToCss,
  sceneToGiaDocument,
  sceneToJson,
  sceneToSvg
} from '../../src/image-editor/exporters.js'
import { normalizeScene } from '../../src/image-editor/normalize.js'
import { defaultCanvas, defaultLibrary } from '../../src/image-editor/constants.js'
import type { SceneDocumentModel, SceneElementModel } from '../../src/image-editor/types.js'

function makeScene(elements: Partial<SceneElementModel>[]): SceneDocumentModel {
  return normalizeScene({
    canvas: defaultCanvas(),
    elements: elements.map((element, index) => ({
      id: `e${index}`,
      name: element.name ?? '',
      type: element.type ?? 'rectangle',
      x: element.x ?? 150,
      y: element.y ?? 150,
      width: element.width ?? 80,
      height: element.height ?? 80,
      rotation: element.rotation ?? 0,
      color: element.color ?? '#4f46e5',
      opacity: element.opacity ?? 1,
      zIndex: element.zIndex ?? index,
      isBackground: element.isBackground ?? false
    })),
    meta: { sourceType: 'editor', sourceName: '', warnings: [] },
    library: defaultLibrary()
  })
}

function testJsonRoundtrip(): void {
  const scene = makeScene([
    { type: 'rectangle', x: 150, y: 150, width: 300, height: 300, color: '#ffffff', isBackground: true, zIndex: 0 },
    { type: 'ellipse', x: 90, y: 110, width: 100, height: 60, color: '#0f766e', rotation: 15, zIndex: 1 },
    { type: 'ring', x: 230, y: 130, width: 60, height: 60, color: '#f59e0b', zIndex: 2 }
  ])
  const parsed = parseJsonScene(sceneToJson(scene))
  assert.equal(parsed.elements.length, 3)
  assert.equal(parsed.elements[0].type, 'rectangle')
  assert.equal(parsed.elements[0].isBackground, true)
  assert.equal(parsed.elements[1].type, 'ellipse')
  assert.equal(parsed.elements[1].rotation, 15)
  assert.equal(parsed.elements[2].type, 'ring')
  assert.equal(parsed.meta.sourceType, 'json')
  console.log('PASS json roundtrip')
}

function testCssRoundtrip(): void {
  const scene = makeScene([
    { type: 'rectangle', x: 150, y: 150, width: 300, height: 300, color: '#ffffff', isBackground: true, zIndex: 0 },
    { type: 'ellipse', x: 90, y: 110, width: 100, height: 60, color: '#0f766e', rotation: 15, zIndex: 1 },
    { type: 'triangle', x: 230, y: 200, width: 96, height: 86, color: '#7c3aed', zIndex: 2 },
    { type: 'ring', x: 100, y: 220, width: 60, height: 60, color: '#f59e0b', zIndex: 3 }
  ])
  const css = sceneToCss(scene)
  const parsed = parseCssScene(css)
  assert.equal(parsed.elements.length, 4)
  const byType = new Map(parsed.elements.map((element) => [element.type, element]))
  assert.ok(byType.has('rectangle'))
  assert.ok(byType.has('ellipse'))
  assert.ok(byType.has('triangle'))
  assert.ok(byType.has('ring'))
  assert.equal(byType.get('ellipse')?.rotation, 15)
  assert.equal(byType.get('ellipse')?.color, '#0f766e')
  assert.equal(byType.get('ring')?.color, '#f59e0b')
  console.log('PASS css roundtrip')
}

function testSvgImport(): void {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
  <rect x="0" y="0" width="300" height="300" fill="#ffffff"/>
  <circle cx="90" cy="110" r="50" fill="#0f766e"/>
  <ellipse cx="230" cy="130" rx="40" ry="25" fill="#be123c"/>
  <polygon points="150,60 110,160 190,160" fill="#7c3aed"/>
  <path d="M0 0 L10 10"/>
</svg>`
  const parsed = parseSvgScene(svg)
  assert.equal(parsed.elements.length, 4)
  assert.equal(parsed.elements[0].type, 'rectangle')
  assert.equal(parsed.elements[0].isBackground, true)
  assert.equal(parsed.elements[1].type, 'ellipse')
  assert.equal(parsed.elements[1].width, 100)
  assert.equal(parsed.elements[2].type, 'ellipse')
  assert.equal(parsed.elements[2].width, 80)
  assert.equal(parsed.elements[3].type, 'triangle')
  assert.ok(parsed.meta.warnings.some((warning) => warning.includes('path')))
  console.log('PASS svg import')
}

function testSvgExport(): void {
  const scene = makeScene([
    { type: 'rectangle', x: 150, y: 150, width: 300, height: 300, color: '#ffffff', isBackground: true, zIndex: 0 },
    { type: 'five_point_star', x: 150, y: 120, width: 92, height: 92, color: '#be123c', zIndex: 1 },
    { type: 'ring', x: 250, y: 200, width: 60, height: 60, color: '#f59e0b', zIndex: 2 }
  ])
  const svg = sceneToSvg(scene)
  assert.ok(svg.includes('Miliastra-Warning'))
  const reparsed = parseSvgScene(svg)
  // ring is skipped by SVG export
  assert.equal(reparsed.elements.length, 2)
  console.log('PASS svg export')
}

function testGiaDocument(): void {
  const scene = makeScene([
    { type: 'rectangle', x: 150, y: 150, width: 300, height: 300, color: '#ffffff', isBackground: true, zIndex: 0 },
    { type: 'ellipse', x: 90, y: 110, width: 100, height: 60, color: '#0f766e', rotation: 15, zIndex: 1 },
    { type: 'ring', x: 230, y: 130, width: 60, height: 60, color: '#f59e0b', zIndex: 2 }
  ])
  const document = sceneToGiaDocument(scene, 'my-group')
  assert.equal(document.group_name, 'my-group')
  assert.equal(document.elements.length, 3)
  // background rect first, centered → relative (0, 0)
  assert.deepEqual(document.elements[0].relative, { x: 0, y: 0 })
  assert.deepEqual(document.elements[0].size, { width: 300, height: 300 })
  // y is flipped relative to canvas: element.y=110, center=150 → 40
  assert.deepEqual(document.elements[1].relative, { x: -60, y: 40 })
  assert.deepEqual(document.elements[1].size, { rx: 50, ry: 30 })
  assert.equal(document.elements[1].image_asset_ref, 100002)
  assert.equal(document.elements[1].name, '2')
  assert.equal(document.elements[2].image_asset_ref, 100006)
  console.log('PASS gia document')
}

function testJsonBasicList(): void {
  const parsed = parseJsonScene(
    JSON.stringify([
      { type: 'ellipse', x: 40, y: 40, width: 80, height: 80, color: '#ff0000' },
      { type: 'rectangle', left: 120, top: 160, w: 100, h: 60 }
    ])
  )
  assert.equal(parsed.elements.length, 2)
  assert.equal(parsed.elements[0].type, 'ellipse')
  assert.equal(parsed.elements[1].type, 'rectangle')
  assert.equal(parsed.elements[1].x, 120)
  assert.equal(parsed.elements[1].width, 100)
  // canvas auto-fitted from element bounds (ellipse at 40±40, rect 120±50/160±30)
  assert.ok(parsed.canvas.width >= 170)
  assert.ok(parsed.canvas.height >= 190)
  assert.ok(parsed.meta.warnings.length > 0)
  console.log('PASS json basic list')
}

testJsonRoundtrip()
testCssRoundtrip()
testSvgImport()
testSvgExport()
testGiaDocument()
testJsonBasicList()
console.log('ALL IMPORT/EXPORT TESTS PASSED')
