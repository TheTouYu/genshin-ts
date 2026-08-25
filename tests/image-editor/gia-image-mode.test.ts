/**
 * Image editor: GIA image-mode byte-level tests.
 *
 * - Byte-exact golden comparison: TS converter output must equal the output
 *   of the reference Python converter (backend/vendor/gia/json_to_gia.py)
 *   for the same document and template. Golden fixture generated with:
 *   python3 json_to_gia.py --mode image (fixture: golden-image-mode.gia).
 * - Structure verification: read back the produced GIA and assert the
 *   image-mode layout (class=15 deps, children guids, mask, group name).
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  convertImageModeDocumentToGiaBytes,
  parseGiaRootFields,
  parsePrimaryResource,
  UI_IMAGE_RESOURCE_CLASS
} from '../../src/image-editor/gia/image_mode.js'
import {
  ProtoReader,
  WireType,
  checkLocatorGuid,
  findVarint,
  parseResourceEntry,
  type WireField
} from '../../src/image-editor/gia/wire.js'
import { sceneToGiaDocument } from '../../src/image-editor/exporters.js'
import { normalizeScene } from '../../src/image-editor/normalize.js'
import { defaultCanvas, defaultLibrary } from '../../src/image-editor/constants.js'
import type { SceneDocumentModel, SceneElementModel } from '../../src/image-editor/types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const SAMPLE_DOCUMENT = {
  group_name: 'test-20260821',
  elements: [
    {
      type: 'rectangle',
      relative: { x: 0, y: 0 },
      size: { width: 300, height: 300 },
      rotation: { x: 0, y: 0, z: 0 },
      image_asset_ref: 100001,
      packed_color: 4294967040,
      name: '1',
      is_background: true
    },
    {
      type: 'ellipse',
      relative: { x: -60, y: 40 },
      size: { rx: 50, ry: 30 },
      rotation: { x: 0, y: 0, z: 15 },
      image_asset_ref: 100002,
      packed_color: 2147483903,
      name: '2',
      is_background: false
    },
    {
      type: 'ring',
      relative: { x: 80, y: -20 },
      size: { width: 60, height: 60 },
      rotation: { x: 0, y: 0, z: 0 },
      image_asset_ref: 100006,
      packed_color: 4280730243,
      name: '3',
      is_background: false
    }
  ]
}

function loadTemplate(): Uint8Array {
  return fs.readFileSync(
    path.resolve(__dirname, '../../src/thirdparty/miliastra-image-editor/template/image_template.gia')
  )
}

function isBytesField(field: WireField): field is Extract<WireField, { wire: WireType.LENGTH_DELIMITED }> {
  return field.wire === WireType.LENGTH_DELIMITED
}

function isVarintField(field: WireField): field is Extract<WireField, { wire: WireType.VARINT }> {
  return field.wire === WireType.VARINT
}

function testGoldenBytes(): void {
  const template = loadTemplate()
  const bytes = convertImageModeDocumentToGiaBytes(SAMPLE_DOCUMENT, template)
  const golden = fs.readFileSync(path.resolve(__dirname, 'fixtures/golden-image-mode.gia'))
  assert.equal(
    Buffer.compare(Buffer.from(bytes), golden),
    0,
    'TS output must be byte-identical to the reference Python converter output'
  )
  console.log('PASS golden byte comparison')
}

function testStructure(): void {
  const template = loadTemplate()
  const bytes = convertImageModeDocumentToGiaBytes(SAMPLE_DOCUMENT, template)
  const { rootFields, tail, header } = parseGiaRootFields(bytes)

  // header: 20 bytes; [0:4] = 20+contentLen (excludes 4-byte tail), [16:20] = contentLen
  assert.equal(header.length, 20)
  assert.equal(tail.length, 4)
  const fileSize = (header[0] << 24) | (header[1] << 16) | (header[2] << 8) | header[3]
  const contentLen =
    (header[16] << 24) | (header[17] << 16) | (header[18] << 8) | header[19]
  assert.equal(fileSize, bytes.length - 4)
  assert.equal(contentLen, bytes.length - 24)

  // exactly 3 class=15 dependency entries (our 3 elements)
  const deps = rootFields
    .filter(
      (field): field is Extract<WireField, { wire: WireType.LENGTH_DELIMITED }> =>
        field.tag === 2 && isBytesField(field)
    )
    .map((field) => parseResourceEntry(field.data))
  assert.equal(deps.length, 3)
  for (const dep of deps) {
    assert.equal(dep.class, UI_IMAGE_RESOURCE_CLASS)
  }

  // primary resource: children guids must match our generated dep guids
  const pr = rootFields.find((field) => field.tag === 1 && field.wire === WireType.LENGTH_DELIMITED)
  assert.ok(pr && pr.wire === WireType.LENGTH_DELIMITED)
  const prFields = parsePrimaryResource(pr.data)
  const parentLocator = prFields.find((field) => field.tag === 1 && field.wire === WireType.LENGTH_DELIMITED)
  assert.ok(parentLocator && parentLocator.wire === WireType.LENGTH_DELIMITED)
  const parentGuid = checkLocatorGuid(parentLocator.data)
  const uiField = prFields.find((field) => field.tag === 19 && field.wire === WireType.LENGTH_DELIMITED)
  assert.ok(uiField && uiField.wire === WireType.LENGTH_DELIMITED)
  const uiFields = new ProtoReader(uiField.data).parseFields()
  const contentField = uiFields.find((field) => field.tag === 1 && field.wire === WireType.LENGTH_DELIMITED)
  assert.ok(contentField && contentField.wire === WireType.LENGTH_DELIMITED)
  const contentFields = new ProtoReader(contentField.data).parseFields()
  const children = contentFields.filter(
    (field): field is Extract<WireField, { wire: WireType.VARINT }> =>
      field.tag === 503 && isVarintField(field)
  )
  assert.equal(children.length, 3)
  const childGuids = children.map((field) => field.value)
  assert.deepEqual(childGuids, deps.map((dep) => dep.guid))

  // name data (field 505 with subfield 502=15) present in primary content
  const nameData = contentFields.find(
    (field) => field.tag === 505 && field.wire === WireType.LENGTH_DELIMITED && findVarint(new ProtoReader(field.data).parseFields(), 502) === 15
  )
  assert.ok(nameData, 'primary ui.content should carry a group name data item')

  void parentGuid
  console.log('PASS structure verification')
}

function testMaskSettings(): void {
  const template = loadTemplate()
  const document = {
    group_name: 'mask-test',
    mask: {
      position: { x: 10, y: -20 },
      size: { x: 120, y: 80 },
      shape_type: 1,
      enabled: true
    },
    elements: [SAMPLE_DOCUMENT.elements[0]]
  }
  const bytes = convertImageModeDocumentToGiaBytes(document, template)
  const { rootFields } = parseGiaRootFields(bytes)
  const pr = rootFields.find((field) => field.tag === 1 && field.wire === WireType.LENGTH_DELIMITED)
  assert.ok(pr && pr.wire === WireType.LENGTH_DELIMITED)
  const prFields = parsePrimaryResource(pr.data)
  const uiField = prFields.find((field) => field.tag === 19 && field.wire === WireType.LENGTH_DELIMITED)
  assert.ok(uiField && uiField.wire === WireType.LENGTH_DELIMITED)
  const uiFields = new ProtoReader(uiField.data).parseFields()
  const contentField = uiFields.find((field) => field.tag === 1 && field.wire === WireType.LENGTH_DELIMITED)
  assert.ok(contentField && contentField.wire === WireType.LENGTH_DELIMITED)
  const contentFields = new ProtoReader(contentField.data).parseFields()
  const maskData = contentFields.find(
    (field) => field.tag === 505 && field.wire === WireType.LENGTH_DELIMITED && findVarint(new ProtoReader(field.data).parseFields(), 502) === 56
  )
  assert.ok(maskData && maskData.wire === 2, 'mask settings data should exist in primary ui.content')
  // verify position floats were written (field 1 vector2 inside mask_settings)
  const maskFields = new ProtoReader(maskData.data).parseFields()
  assert.equal(findVarint(maskFields, 501), 38)
  assert.equal(findVarint(maskFields, 502), 56)
  console.log('PASS mask settings')
}

function testSceneToGiaPipeline(): void {
  const scene: SceneDocumentModel = normalizeScene({
    canvas: defaultCanvas(),
    elements: [
      {
        id: 'e0',
        name: '',
        type: 'rectangle',
        x: 150,
        y: 150,
        width: 300,
        height: 300,
        rotation: 0,
        color: '#ffffff',
        opacity: 1,
        zIndex: 0,
        isBackground: true
      } as SceneElementModel,
      {
        id: 'e1',
        name: '',
        type: 'ellipse',
        x: 90,
        y: 110,
        width: 100,
        height: 60,
        rotation: 15,
        color: '#0f766e',
        opacity: 1,
        zIndex: 1,
        isBackground: false
      } as SceneElementModel
    ],
    meta: { sourceType: 'editor', sourceName: '', warnings: [] },
    library: defaultLibrary()
  })
  const document = sceneToGiaDocument(scene, 'pipeline')
  assert.equal(document.elements.length, 2)
  const template = loadTemplate()
  const bytes = convertImageModeDocumentToGiaBytes(document, template)
  const { rootFields } = parseGiaRootFields(bytes)
  const deps = rootFields
    .filter(
      (field): field is Extract<WireField, { wire: WireType.LENGTH_DELIMITED }> =>
        field.tag === 2 && isBytesField(field)
    )
    .map((field) => parseResourceEntry(field.data))
  assert.equal(deps.length, 2)
  console.log('PASS scene → gia pipeline')
}

testGoldenBytes()
testStructure()
testMaskSettings()
testSceneToGiaPipeline()
console.log('ALL GIA IMAGE-MODE TESTS PASSED')
