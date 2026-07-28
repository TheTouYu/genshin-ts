import type { StaticAssemblyIndexedRecord, StaticAssemblyMapIndex } from './map_index.js'

export type StaticAssemblyClosureStatus =
  | 'complete'
  | 'missing-definition'
  | 'missing-instance'
  | 'missing-definition-auxiliary'
  | 'missing-instance-auxiliary'
  | 'missing-owner-registry'
  | 'ambiguous-name'
  | 'unsupported-layout'

export type StaticAssemblyClosure = {
  definition?: StaticAssemblyIndexedRecord
  instance?: StaticAssemblyIndexedRecord
  definitionAuxiliaries: readonly StaticAssemblyIndexedRecord[]
  instanceAuxiliaries: readonly StaticAssemblyIndexedRecord[]
  status: StaticAssemblyClosureStatus
  diagnostics: readonly string[]
}

function matchName(record: StaticAssemblyIndexedRecord, name: string): boolean {
  return record.names.filter((candidate) => candidate === name).length === 1
}

export function analyzeStaticAssemblyClosure(
  index: StaticAssemblyMapIndex,
  input: { definitionId: number; instanceId: number; name?: string }
): StaticAssemblyClosure {
  const diagnostics: string[] = []
  const definitionMatches = index.definitions.filter((record) => record.id === input.definitionId)
  const instanceMatches = index.instances.filter((record) => record.id === input.instanceId)
  const definition = definitionMatches.length === 1 ? definitionMatches[0] : undefined
  const instance = instanceMatches.length === 1 ? instanceMatches[0] : undefined
  if (!definition) diagnostics.push('definition-not-found-or-not-unique')
  if (!instance) diagnostics.push('instance-not-found-or-not-unique')
  if (input.name && definition && instance) {
    if (!matchName(definition, input.name) || !matchName(instance, input.name)) {
      diagnostics.push('template-name-not-unique-on-definition-and-instance')
    }
  }
  if (instance && instance.definitionId !== definition?.id) {
    diagnostics.push('instance-definition-reference-mismatch')
  }
  const definitionAuxiliaries = (definition?.packedIds ?? []).flatMap((id) =>
    index.definitionAuxiliaries.filter((record) => record.id === id)
  )
  const instanceAuxiliaries = (instance?.packedIds ?? []).flatMap((id) =>
    index.instanceAuxiliaries.filter((record) => record.id === id)
  )
  if (definition && definitionAuxiliaries.length !== definition.packedIds.length) {
    diagnostics.push('definition-auxiliary-closure-incomplete')
  }
  if (instance && instanceAuxiliaries.length !== instance.packedIds.length) {
    diagnostics.push('instance-auxiliary-closure-incomplete')
  }
  if (definition && !index.ownerRegistryIds.includes(definition.id)) {
    diagnostics.push('owner-registry-not-observed')
  }
  let status: StaticAssemblyClosureStatus = 'complete'
  if (!definition) status = 'missing-definition'
  else if (!instance) status = 'missing-instance'
  else if (input.name && diagnostics.some((code) => code.includes('name')))
    status = 'ambiguous-name'
  else if (instance.definitionId !== definition.id) status = 'missing-definition'
  else if (definitionAuxiliaries.length !== definition.packedIds.length)
    status = 'missing-definition-auxiliary'
  else if (instanceAuxiliaries.length !== instance.packedIds.length)
    status = 'missing-instance-auxiliary'
  else if (!index.ownerRegistryIds.includes(definition.id)) status = 'missing-owner-registry'
  return { definition, instance, definitionAuxiliaries, instanceAuxiliaries, status, diagnostics }
}
