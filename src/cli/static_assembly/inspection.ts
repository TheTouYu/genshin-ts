import type { StaticAssemblyMapInspectionV1 } from '../../compiler/gsts_config.js'
import { analyzeStaticAssemblyClosure } from './closure.js'
import { sha256Bytes } from './json.js'
import { createStaticAssemblyMapIndex } from './map_index.js'

function ranges(values: readonly number[]): [number, number][] {
  if (!values.length) return []
  const sorted = [...new Set(values)].sort((a, b) => a - b)
  const result: [number, number][] = []
  let start = sorted[0]
  let end = start
  for (const value of sorted.slice(1)) {
    if (value === end + 1) end = value
    else {
      result.push([start, end])
      start = value
      end = value
    }
  }
  result.push([start, end])
  return result
}

function freeRuns(values: readonly number[]): [number, number][] {
  if (!values.length) return []
  const sorted = [...new Set(values)].sort((a, b) => a - b)
  const result: [number, number][] = []
  for (let index = 1; index < sorted.length; index++) {
    if (sorted[index] > sorted[index - 1] + 1) {
      result.push([sorted[index - 1] + 1, sorted[index] - 1])
    }
  }
  return result
}

export function inspectStaticAssemblyMap(input: {
  bytes: Uint8Array
  locator: StaticAssemblyMapInspectionV1['source']['locator']
}): StaticAssemblyMapInspectionV1 {
  const index = createStaticAssemblyMapIndex(input.bytes)
  const occupied = [
    ...index.occupiedIds.prefabs,
    ...index.occupiedIds.instances,
    ...index.occupiedIds.definitionAuxiliaries,
    ...index.occupiedIds.instanceAuxiliaries
  ]
  const templateCandidates = index.definitions
    .filter((definition) => definition.packedIds.length > 0)
    .flatMap((definition) =>
      index.instances
        .filter((instance) => instance.definitionId === definition.id)
        .map((instance) => {
          const commonNames = definition.names.filter((name) => instance.names.includes(name))
          const closure = analyzeStaticAssemblyClosure(index, {
            definitionId: definition.id,
            instanceId: instance.id,
            ...(commonNames.length === 1 ? { name: commonNames[0] } : {})
          })
          return {
            definitionId: definition.id,
            instanceId: instance.id,
            ...(commonNames.length === 1 ? { name: commonNames[0] } : {}),
            itemCount: Math.min(definition.packedIds.length, instance.packedIds.length),
            definitionAuxiliaryIds: definition.packedIds,
            instanceAuxiliaryIds: instance.packedIds,
            ...(instance.transform ? { transform: instance.transform } : {}),
            closureStatus: closure.status,
            diagnostics: closure.diagnostics,
            compatibility: 'unknown' as const
          }
        })
    )
  const record = (value: (typeof index.definitions)[number]) => ({
    id: value.id,
    ...(value.name ? { name: value.name } : {}),
    names: value.names,
    packedIds: value.packedIds,
    ...(value.definitionId !== undefined ? { definitionId: value.definitionId } : {}),
    ...(value.transform ? { transform: value.transform } : {})
  })
  const allOccupied = [...new Set(occupied)].sort((a, b) => a - b)
  return {
    schemaVersion: 1,
    kind: 'gsts.static-assembly.inspection',
    source: {
      locator: input.locator,
      size: input.bytes.length,
      sha256: sha256Bytes(input.bytes)
    },
    definitions: index.definitions.map(record),
    instances: index.instances.map(record),
    occupiedIds: {
      ...index.occupiedIds,
      ranges: {
        all: ranges(allOccupied),
        freeRuns: freeRuns(allOccupied),
        sourceSha256: sha256Bytes(input.bytes),
        proposalOnly: true
      }
    },
    templateCandidates,
    warnings: index.diagnostics,
    evidenceBoundary: {
      structuralInspection: true,
      templateCompatibility: 'not-proven',
      editorOrGameValidation: 'not-performed'
    }
  }
}
