import type {
  GstsResolvedStaticAssembly,
  StaticAssemblyPlanV1,
  StaticAssemblySourceLocator
} from '../../compiler/gsts_config.js'
import { analyzeStaticAssemblyClosure } from './closure.js'
import { hashCanonicalJson, sha256Bytes } from './json.js'
import { createStaticAssemblyMapIndex } from './map_index.js'
import { isOfficialResourceId } from '../official_prefabs.js'

export type StaticAssemblyPlanInput = {
  bytes: Uint8Array
  sourceLocator: StaticAssemblySourceLocator
  assetConfig: { displayName: string; bytes: Uint8Array }
  assemblies: readonly {
    resolved: GstsResolvedStaticAssembly
    structure?: { displayName: string; bytes: Uint8Array }
  }[]
}

type Diagnostic = { code: string; field?: string; message: string }

function color(value: GstsResolvedStaticAssembly['color']) {
  if (!value) return undefined
  return value.enabled
    ? { ...value, reviewRgb: `0x${value.rgb.toString(16).padStart(6, '0').toUpperCase()}` }
    : value
}

// 自定义元件 ID 区间：游戏/编辑器只认 0x40400000 区间（>=1077936129）的元件
// def/inst/entity ID。0x4000xxxx 区间的元件加载时被整体丢弃 → 地图打开为空
// （2026-08-09 R4 空图根因：1073742xxx 全空，1077936xxx 全正常；aux ID 无此限制）。
const MIN_CUSTOM_PREFAB_ID = 1077936129 // 0x40400001

function normalizeAssembly(
  input: StaticAssemblyPlanInput['assemblies'][number],
  index: ReturnType<typeof createStaticAssemblyMapIndex>,
  errors: Diagnostic[]
): Record<string, unknown> {
  const assembly = input.resolved
  if (assembly.prefabId < MIN_CUSTOM_PREFAB_ID) {
    errors.push({
      code: 'prefab-id-out-of-range',
      field: `assets.staticAssemblies.${assembly.name}.prefabId`,
      message: `prefabId ${assembly.prefabId} is below the custom prefab ID range (>= ${MIN_CUSTOM_PREFAB_ID}); such prefabs are dropped by the game and the map opens empty`
    })
  }
  // 官方模板源：templatePrefabId 是官方 resID（[1e7,1e9)）时目标地图没有本地模板
  // 定义/实例，closure 检查不适用，骨架由 official_prefabs 程序化生成。
  const officialTemplate = isOfficialResourceId(assembly.templatePrefabId)
  const closure = officialTemplate
    ? undefined
    : analyzeStaticAssemblyClosure(index, {
        definitionId: assembly.templatePrefabId,
        instanceId: assembly.templateInstanceId,
        name: assembly.templateName
      })
  if (closure && closure.status !== 'complete') {
    errors.push({
      code: 'template-closure-incomplete',
      field: `assets.staticAssemblies.${assembly.name}`,
      message: `template closure is ${closure.status}`
    })
  }
  const requested = [
    { kind: 'prefab', id: assembly.prefabId },
    ...assembly.definitionAuxiliaryIds.map((id) => ({ kind: 'definitionAuxiliary', id })),
    ...assembly.instanceAuxiliaryIds.map((id) => ({ kind: 'instanceAuxiliary', id }))
  ]
  const occupied = new Set([
    ...index.occupiedIds.prefabs,
    ...index.occupiedIds.instances,
    ...index.occupiedIds.definitionAuxiliaries,
    ...index.occupiedIds.instanceAuxiliaries
  ])
  const conflicts = requested.filter(
    (entry, entryIndex) =>
      occupied.has(entry.id) ||
      requested.findIndex((candidate) => candidate.id === entry.id) !== entryIndex
  )
  for (const conflict of conflicts) {
    errors.push({
      code: 'id-conflict',
      field: `${assembly.name}.${conflict.kind}`,
      message: `ID ${conflict.id} is occupied or duplicated`
    })
  }
  const item = (value: GstsResolvedStaticAssembly['items'][number]) => ({
    resourceId: value.resourceId,
    transform: {
      position: value.position,
      rotation: value.rotation ?? [0, 0, 0],
      scale: value.scale ?? [1, 1, 1]
    },
    ...(value.color ? { color: color(value.color) } : {})
  })
  return {
    name: assembly.name,
    prefabId: assembly.prefabId,
    template: {
      definitionId: assembly.templatePrefabId,
      instanceId: assembly.templateInstanceId,
      name: assembly.templateName,
      closureStatus: closure?.status ?? 'official-resource',
      compatibility: 'unknown',
      diagnostics: closure?.diagnostics ?? []
    },
    definitionAuxiliaryIds: assembly.definitionAuxiliaryIds,
    instanceAuxiliaryIds: assembly.instanceAuxiliaryIds,
    transform: {
      position: assembly.position,
      rotation: assembly.rotation ?? [0, 0, 0],
      scale: assembly.scale ?? [1, 1, 1]
    },
    ...(assembly.color ? { color: color(assembly.color) } : {}),
    ...(assembly.components ? { components: assembly.components } : {}),
    items: assembly.items.map(item),
    resources: assembly.items.map((value) => value.resourceId),
    ...(input.structure
      ? {
          structure: {
            locator: { kind: 'structureFile', displayName: input.structure.displayName },
            sha256: sha256Bytes(input.structure.bytes),
            itemCount: assembly.items.length,
            resources: assembly.items.map((value) => value.resourceId)
          }
        }
      : { structure: { locator: { kind: 'inline' }, itemCount: assembly.items.length } }),
    conflicts
  }
}

export function createStaticAssemblyPlan(input: StaticAssemblyPlanInput): StaticAssemblyPlanV1 {
  const index = createStaticAssemblyMapIndex(input.bytes)
  const errors: Diagnostic[] = []
  const warnings: Diagnostic[] = []
  const assemblies = input.assemblies.map((assembly) => normalizeAssembly(assembly, index, errors))
  const requestedIds = input.assemblies.flatMap(({ resolved }) => [
    { id: resolved.prefabId, assembly: resolved.name, field: 'prefabId' },
    ...resolved.definitionAuxiliaryIds.map((id, index) => ({
      id,
      assembly: resolved.name,
      field: `definitionAuxiliaryIds[${index}]`
    })),
    ...resolved.instanceAuxiliaryIds.map((id, index) => ({
      id,
      assembly: resolved.name,
      field: `instanceAuxiliaryIds[${index}]`
    }))
  ])
  for (const entry of requestedIds) {
    const owners = requestedIds.filter((candidate) => candidate.id === entry.id)
    if (owners.length > 1 && owners[0] === entry) {
      errors.push({
        code: 'cross-assembly-id-conflict',
        field: owners.map((owner) => `${owner.assembly}.${owner.field}`).join(','),
        message: `ID ${entry.id} is requested ${owners.length} times across the plan`
      })
    }
  }
  const status = errors.length ? 'blocked' : 'ready'
  const stableDiagnostics = (values: Diagnostic[]) =>
    values.map(({ code, field }) => ({ code, ...(field ? { field } : {}) }))
  const hashPayload = {
    schemaVersion: 1,
    source: { sha256: sha256Bytes(input.bytes), size: input.bytes.length },
    assetConfigSha256: sha256Bytes(input.assetConfig.bytes),
    assemblies,
    touchedTopLevelFields: [4, 6, 8, 27],
    field9: 'unchanged-by-current-implementation',
    status,
    warnings: stableDiagnostics(warnings),
    errors: stableDiagnostics(errors)
  }
  return {
    schemaVersion: 1,
    kind: 'gsts.static-assembly.plan',
    status,
    source: {
      locator: input.sourceLocator,
      size: input.bytes.length,
      sha256: sha256Bytes(input.bytes)
    },
    assetConfig: {
      locator: { kind: 'assetConfig', displayName: input.assetConfig.displayName },
      sha256: sha256Bytes(input.assetConfig.bytes)
    },
    assemblies,
    touchedTopLevelFields: [4, 6, 8, 27],
    field9: 'unchanged-by-current-implementation',
    warnings,
    errors,
    evidenceBoundary: {
      structuralInspection: true,
      templateCompatibility: 'not-proven',
      editorOrGameValidation: 'not-performed',
      candidateGenerated: false,
      sourceModified: false
    },
    planHashAlgorithm: 'sha256-canonical-json-v1',
    planHash: hashCanonicalJson(hashPayload)
  }
}
