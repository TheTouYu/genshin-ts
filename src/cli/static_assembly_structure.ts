import fs from 'node:fs'
import path from 'node:path'

import type {
  GstsResolvedStaticAssembly,
  GstsStaticAssembly,
  GstsStaticAssemblyComponent,
  GstsStaticAssemblyItem,
  GstsStaticAssemblyStructure,
  GstsStaticColor
} from '../compiler/gsts_config.js'

type JsonObject = Record<string, unknown>

function fail(filePath: string, field: string, message: string): never {
  throw new Error(`[error] static assembly structure ${filePath}: ${field} ${message}`)
}

function object(filePath: string, field: string, value: unknown): JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(filePath, field, 'must be an object')
  }
  return value as JsonObject
}

function exactFields(
  filePath: string,
  field: string,
  value: JsonObject,
  allowed: readonly string[]
): void {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key))
  if (unknown !== undefined)
    fail(filePath, field ? `${field}.${unknown}` : unknown, 'is an unknown field')
}

function finiteNumber(filePath: string, field: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(filePath, field, 'must be a finite number')
  }
  return value
}

function vector(
  filePath: string,
  field: string,
  value: unknown
): readonly [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) {
    fail(filePath, field, 'must contain exactly three finite numbers')
  }
  return [
    finiteNumber(filePath, `${field}[0]`, value[0]),
    finiteNumber(filePath, `${field}[1]`, value[1]),
    finiteNumber(filePath, `${field}[2]`, value[2])
  ]
}

function color(filePath: string, field: string, value: unknown): GstsStaticColor {
  const source = object(filePath, field, value)
  if (source.enabled === false) {
    exactFields(filePath, field, source, ['enabled'])
    return { enabled: false }
  }
  exactFields(filePath, field, source, ['enabled', 'rgb', 'opacity', 'overlay'])
  if (source.enabled !== true) fail(filePath, `${field}.enabled`, 'must be true or false')
  if (
    !Number.isInteger(source.rgb) ||
    (source.rgb as number) < 0 ||
    (source.rgb as number) > 0xffffff
  ) {
    fail(filePath, `${field}.rgb`, 'must be an integer from 0x000000 to 0xFFFFFF')
  }
  const opacity = finiteNumber(filePath, `${field}.opacity`, source.opacity)
  if (opacity < 0 || opacity > 100) fail(filePath, `${field}.opacity`, 'must be from 0 to 100')
  if (source.overlay !== 'overwrite' && source.overlay !== 'multiply') {
    fail(filePath, `${field}.overlay`, 'must be overwrite or multiply')
  }
  return {
    enabled: true,
    rgb: source.rgb as number,
    opacity,
    overlay: source.overlay
  }
}

function zeroVector(value: readonly [number, number, number]): boolean {
  return value.every((component) => component === 0)
}

function tabBarRegion(
  filePath: string,
  field: string,
  source: JsonObject
): {
  regionType: 'box' | 'sphere'
  regionSize: readonly [number, number, number]
  regionRadius: number
  regionCenter: readonly [number, number, number]
} {
  const regionType = source.regionType === undefined ? 'box' : source.regionType
  if (regionType !== 'box' && regionType !== 'sphere') {
    fail(filePath, `${field}.regionType`, 'must be box or sphere')
  }
  const center =
    source.regionCenter === undefined
      ? ([0, 0, 0] as const)
      : vector(filePath, `${field}.regionCenter`, source.regionCenter)
  if (regionType === 'box') {
    if (source.regionRadius !== undefined) {
      fail(filePath, `${field}.regionRadius`, 'must be omitted for box regionType')
    }
    const size =
      source.regionSize === undefined
        ? ([1, 1, 1] as const)
        : vector(filePath, `${field}.regionSize`, source.regionSize)
    if (size.some((axis) => axis <= 0)) {
      fail(filePath, `${field}.regionSize`, 'must contain positive sizes')
    }
    if (!zeroVector(center)) {
      // 真实样本只有盒体 f11.f1 空（= 无中心偏移），无非零证据：fail closed，不做猜测。
      fail(
        filePath,
        `${field}.regionCenter`,
        'non-zero box region center is unsupported (no real sample); keep [0,0,0]'
      )
    }
    return { regionType: 'box', regionSize: size, regionRadius: 1, regionCenter: center }
  }
  if (source.regionSize !== undefined) {
    fail(filePath, `${field}.regionSize`, 'must be omitted for sphere regionType')
  }
  const radius =
    source.regionRadius === undefined
      ? 1
      : finiteNumber(filePath, `${field}.regionRadius`, source.regionRadius)
  if (radius <= 0) fail(filePath, `${field}.regionRadius`, 'must be a positive number')
  return { regionType: 'sphere', regionSize: [1, 1, 1], regionRadius: radius, regionCenter: center }
}

function component(filePath: string, index: number, value: unknown): GstsStaticAssemblyComponent {
  const field = `components[${index}]`
  const source = object(filePath, field, value)
  exactFields(filePath, field, source, [
    'type',
    'preset',
    'regionName',
    'options',
    'regionType',
    'regionSize',
    'regionRadius',
    'regionCenter'
  ])
  if (source.type === 'followMotion') {
    if (source.preset !== 'fullFollow') fail(filePath, `${field}.preset`, 'must be fullFollow')
    return { type: 'followMotion', preset: 'fullFollow' }
  }
  if (source.type === 'basicMotion') {
    if (source.preset !== 'default') fail(filePath, `${field}.preset`, 'must be default')
    return { type: 'basicMotion', preset: 'default' }
  }
  if (source.type === 'tabBar') {
    if (source.preset !== undefined) fail(filePath, `${field}.preset`, 'must be omitted for tabBar')
    if (typeof source.regionName !== 'string' || !source.regionName) {
      fail(filePath, `${field}.regionName`, 'must be a non-empty string')
    }
    if (
      !Array.isArray(source.options) ||
      !source.options.length ||
      source.options.some(
        (option) => typeof option !== 'string' || !option || option.includes('\u0000')
      )
    ) {
      fail(filePath, `${field}.options`, 'must be a non-empty array of non-empty strings')
    }
    const region = tabBarRegion(filePath, field, source)
    return {
      type: 'tabBar',
      regionName: source.regionName as string,
      options: source.options as string[],
      regionType: region.regionType,
      ...(region.regionType === 'box'
        ? { regionSize: region.regionSize, regionCenter: region.regionCenter }
        : { regionRadius: region.regionRadius, regionCenter: region.regionCenter })
    }
  }
  fail(filePath, `${field}.type`, 'must be followMotion, basicMotion or tabBar')
}

function item(filePath: string, index: number, value: unknown): GstsStaticAssemblyItem {
  const field = `items[${index}]`
  const source = object(filePath, field, value)
  exactFields(filePath, field, source, ['resourceId', 'position', 'rotation', 'scale', 'color'])
  if (!Number.isSafeInteger(source.resourceId) || (source.resourceId as number) < 0) {
    fail(filePath, `${field}.resourceId`, 'must be a non-negative safe integer')
  }
  return {
    resourceId: source.resourceId as number,
    position: vector(filePath, `${field}.position`, source.position),
    ...(source.rotation === undefined
      ? {}
      : { rotation: vector(filePath, `${field}.rotation`, source.rotation) }),
    ...(source.scale === undefined
      ? {}
      : { scale: vector(filePath, `${field}.scale`, source.scale) }),
    ...(source.color === undefined
      ? {}
      : { color: color(filePath, `${field}.color`, source.color) })
  }
}

export function resolveStaticAssemblyStructure(
  assembly: GstsStaticAssembly,
  configPath: string
): GstsResolvedStaticAssembly {
  const structureFile = 'structureFile' in assembly ? assembly.structureFile : undefined
  const inlineItems = 'items' in assembly ? assembly.items : undefined
  const inlineColor = 'color' in assembly ? assembly.color : undefined
  const inlineComponents = 'components' in assembly ? assembly.components : undefined
  if (structureFile !== undefined && inlineItems !== undefined) {
    throw new Error('[error] structureFile and items are mutually exclusive')
  }
  if (structureFile !== undefined && inlineColor !== undefined) {
    throw new Error('[error] structureFile and color are mutually exclusive')
  }
  if (structureFile !== undefined && inlineComponents !== undefined) {
    throw new Error('[error] structureFile and components are mutually exclusive')
  }
  if (structureFile === undefined) {
    if (!inlineItems) throw new Error('[error] assembly requires items or structureFile')
    return assembly as GstsResolvedStaticAssembly
  }
  if (typeof structureFile !== 'string' || !structureFile) {
    throw new Error('[error] structureFile must be a non-empty string')
  }
  const structure = loadStaticAssemblyStructure(
    structureFile,
    path.dirname(path.resolve(configPath))
  )
  const { structureFile: _, ...target } = assembly
  return {
    ...target,
    ...(structure.color ? { color: structure.color } : {}),
    ...(structure.components ? { components: structure.components } : {}),
    items: structure.items
  }
}

export function loadStaticAssemblyStructure(
  structureFile: string,
  configDirectory: string
): GstsStaticAssemblyStructure {
  const filePath = path.resolve(configDirectory, structureFile)
  let parsed: unknown
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    const detail =
      error instanceof SyntaxError ? 'invalid JSON' : `cannot be read: ${String(error)}`
    throw new Error(`[error] static assembly structure ${filePath}: ${detail}`)
  }
  const source = object(filePath, '', parsed)
  exactFields(filePath, '', source, ['$schema', 'schemaVersion', 'color', 'components', 'items'])
  if (source.schemaVersion !== 1) fail(filePath, 'schemaVersion', 'must be 1')
  if (!Array.isArray(source.items) || source.items.length === 0) {
    fail(filePath, 'items', 'must contain at least one item')
  }
  if (source.$schema !== undefined && typeof source.$schema !== 'string') {
    fail(filePath, '$schema', 'must be a string')
  }
  if (source.components !== undefined && !Array.isArray(source.components)) {
    fail(filePath, 'components', 'must be an array')
  }
  const components = (source.components ?? []).map((value, index) =>
    component(filePath, index, value)
  )
  if (new Set(components.map((value) => value.type)).size !== components.length) {
    fail(filePath, 'components', 'must not contain duplicate component types')
  }
  return {
    schemaVersion: 1,
    ...(source.color === undefined ? {} : { color: color(filePath, 'color', source.color) }),
    ...(source.components === undefined ? {} : { components }),
    items: source.items.map((value, index) => item(filePath, index, value))
  }
}
