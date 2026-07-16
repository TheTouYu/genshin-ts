import type {
  CharacterEntity,
  EntityOf,
  EntityOfByMode,
  EntityValueByMode,
  PlayerEntity
} from '../../../src/definitions/entity_helpers.js'
import type { ServerEventPayloadsByMode } from '../../../src/definitions/events-payload-mode.js'
import type { ServerExecutionFlowFunctions } from '../../../src/definitions/nodes.js'
import type { EntityValue } from '../../../src/runtime/value.js'

type Assert<T extends true> = T
type IsAssignable<From, To> = [From] extends [To] ? true : false

type LocationInput = Parameters<ServerExecutionFlowFunctions['getEntityLocationAndRotation']>[0]
type BeyondEnteringEntity =
  ServerEventPayloadsByMode<'beyond'>['whenEnteringCollisionTrigger']['enteringEntity']
type ClassicEnteringEntity =
  ServerEventPayloadsByMode<'classic'>['whenEnteringCollisionTrigger']['enteringEntity']

type _BeyondEventEntityCanBeUsedAsLocationInput = Assert<
  IsAssignable<BeyondEnteringEntity, LocationInput>
>
type _ClassicEventEntityCanBeUsedAsLocationInput = Assert<
  IsAssignable<ClassicEnteringEntity, LocationInput>
>
type _BeyondEntityCanBeUsedAsGenericEntityInput = Assert<
  IsAssignable<EntityValueByMode<'beyond'>, EntityValue>
>
type _ClassicEntityCanBeUsedAsGenericEntityInput = Assert<
  IsAssignable<EntityValueByMode<'classic'>, EntityValue>
>
type _ModeSpecificCharacterCanBeUsedAsCharacterInput = Assert<
  IsAssignable<EntityOfByMode<'character', 'beyond'>, EntityOf<'character'>>
>
type _CharacterCanBeUsedAsSpatialEntityInput = Assert<IsAssignable<CharacterEntity, LocationInput>>
type _PlayerCannotBeUsedAsSpatialEntityInput = Assert<
  IsAssignable<PlayerEntity, LocationInput> extends false ? true : false
>
