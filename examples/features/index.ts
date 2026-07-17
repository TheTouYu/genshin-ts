/**
 * GSTS 单文件功能回归案例。
 *
 * 在仓库根目录运行：
 *   npm run build
 *   node ./bin/gsts.mjs examples/features/index.ts --noinject
 *
 * CLI / 注入相关功能：
 *   node ./bin/gsts.mjs maps
 *   node ./bin/gsts.mjs open backup
 *   node ./bin/gsts.mjs dev
 *
 * 注入、资源提取、信号提取和 dev 自动重新注入由 gsts.config.ts 的 inject 配置控制；
 * 本文件只使用提取结果相同的数据形状，避免回归编译时修改真实地图。
 */

import { CharacterPrefab, CharacterPrefabZh } from 'genshin-ts/definitions/prefabs'
import { defineSignal, g } from 'genshin-ts/runtime/core'

const FeatureSignal = defineSignal('feature_probe', [
  ['amount', 'int'],
  ['message', 'str'],
  ['enabled', 'bool'],
  ['targets', 'entity_list']
])

// gsts 从地图提取的 resources/prefabs.ts 也使用这种对象形状。
const CustomPrefab = {
  FeatureProbe: 1077937001
} as const

const FlowCode = {
  Start: 10n,
  Stop: 11n,
  Label: 'ready',
  FoldedValue: (2n + 3n) * 4n
} as const

function gstsServerAddAndLog(left: bigint, right: bigint) {
  const result = gsts.f.addition(left, right)
  gsts.fServer.printString(str(result))
  return result
}

function gstsServerDouble(value: bigint) {
  return gstsServerAddAndLog(value, value)
}

function gstsCharacterSkillIncrement(value: bigint) {
  return gsts.fCharacterSkill.addition(value, 1n)
}

const gstsClientCharacterSkillDouble = (value: bigint) => value + value

function gstsClientCharacterControlSkillIncrement(value: bigint) {
  return gsts.fCharacterControlSkill.addition(value, 1n)
}

const gstsCharacterControlSkillDouble = (value: bigint) => value + value

function gstsClientCreationSkillIncrement(value: bigint) {
  return gsts.fCreationSkill.addition(value, 1n)
}

const gstsCreationSkillDouble = (value: bigint) => value + value

function gstsClientCreationStatusIncrement(value: bigint) {
  return gsts.fCreationStatus.addition(value, 1n)
}

const gstsCreationStatusDouble = (value: bigint) => value + value

function gstsClientCreationStatusDecisionIncrement(value: bigint) {
  return gsts.fCreationStatusDecision.addition(value, 1n)
}

const gstsCreationStatusDecisionDouble = (value: bigint) => value + value

function gstsClientBoolFilterNot(value: boolean) {
  return !value
}

const gstsBoolFilterNot = (value: boolean) => !value

function gstsClientIntFilterIncrement(value: bigint) {
  return gsts.fIntFilter.addition(value, 1n)
}

const gstsIntFilterDouble = (value: bigint) => value + value

const server = g.server({
  // 悬停以下参数、on 的事件名、evt 和 f，可核验中英文注释。
  id: 1073742401,
  name: 'Feature_All_In_One',
  prefix: true,
  type: 'entity',
  mode: 'beyond',
  lang: 'en',
  variables: {
    score: 0n,
    title: 'ready',
    items: list('int', [0n, 0n, 0n]),
    counters: dict([{ k: 'hits', v: 0n }])
  }
})

server
  .on('whenEntityIsCreated', (evt, f) => {
    // f.get/f.set 自动推断节点图变量类型；e.get/e.set 操作实体自定义变量。
    const nextScore = f.get('score') + 1n
    f.set('score', nextScore)
    f.set('title', 'created')
    evt.eventSourceEntity.set('feature_score', nextScore)
    const storedScore = evt.eventSourceEntity.get('feature_score').asType('int')

    console.log('feature: entity created')
    f.printString(str(evt.eventSourceGuid))
    gsts.f.printString(str(storedScore))

    // 全局辅助函数与全局实体。
    const enabled = bool(1n)
    const count = int(3)
    const ratio = float(count)
    const label = str(count)
    const location = vec3([1, 2, 3])

    self.set('feature_bool', enabled)
    self.set('feature_int', count)
    self.set('feature_float', ratio)
    self.set('feature_string', label)
    self.set('feature_guid', guid(10001n))
    self.set('feature_config', configId(20001n))
    self.set('feature_prefab', prefabId(30001n))
    self.set('feature_faction', faction(1n))
    self.set('feature_entity', entity(self))
    self.set('feature_vec3', location)

    stage.set('feature_stage_value', 7n)
    level.set('feature_level_value', 8n)
    const rawValue = raw(stage.get('feature_stage_value').asType('int'))
    f.printString(str(rawValue))

    // list(0)/dict(0) 表示引脚留空占位；带类型版本用于无法从上下文推断时。
    f.createEntity(guid(0n), list(0))
    f.addUnitStatus(entity(0), entity(0), configId(0n), 1n, dict(0))
    f.createDictionary(list('str', 0), list('int', 0))
    f.queryDictionaryValueByKey(dict('str', 'int', 0), 'missing')

    // JS 风格列表方法；forEach 回调允许不声明参数。
    const values = list('int', [1n, 2n, 3n])
    values.push(4n)
    values.forEach((value) => {
      f.printString(str(value))
    })
    values.forEach(() => {
      f.printString('forEach without params')
    })
    const filtered = values.filter((value) => value > 1n)
    const mapped = values.map((value) => value + 10n)
    const randomIndex = f.getRandomInteger(0n, 2n)
    f.printString(str(values[idx(randomIndex)]))
    f.printString(str(filtered.length))
    f.printString(str(mapped.length))

    // 获取节点图变量或自定义变量得到列表实时引用；copyList 才创建副本。
    const liveItems = f.get('items')
    liveItems[idx(0n)] = 10n
    const genericItems = f.getNodeGraphVariable('items').asType('int_list')
    genericItems[idx(1n)] = 11n
    const customItems = self.get('feature_items').asType('int_list')
    customItems[idx(2n)] = 12n
    const copiedItems = f.copyList(liveItems)
    copiedItems[idx(0n)] = 99n

    const counters = f.get('counters')
    counters.set('hits', counters.get('hits') + 1n)

    // if / while / switch / for / continue / break、常量折叠和 let 局部变量。
    let total = 0n
    let mutableLiteral = 1n
    for (let index = 0; index < 6; index++) {
      // eslint-disable-next-line gsts/prefer-bigint -- for 循环变量会按节点图 int 处理。
      if (index % 2 === 0) {
        total += int(index)
        continue
      }
      if (index === 5) break
      total += 10n
    }

    let remaining = 3n
    while (remaining > 0n) {
      remaining -= 1n
      mutableLiteral += 1n
    }

    const selectedCode: bigint = FlowCode.Start
    switch (selectedCode) {
      case FlowCode.Start:
        total += FlowCode.FoldedValue
        break
      case FlowCode.Stop:
        total = 0n
        break
      default:
        total = -1n
        break
    }

    const selectedLabel: string = FlowCode.Label
    switch (selectedLabel) {
      case FlowCode.Label:
        f.printString('ready')
        break
      default:
        f.printString('unknown')
        break
    }

    f.printString(str(total))
    f.printString(str(mutableLiteral))

    // GameObject / Vector3 / Math / Mathf 别名。
    const maximum = Math.max(Math.abs(-3.5), Math.sqrt(16))
    const rounded = Mathf.RoundToInt(maximum)
    const direction = Vector3.Normalize(Vector3.Add(Vector3.forward, Vector3.up))
    const distance = Vector3.Distance(Vector3.zero, direction)
    const foundByGuid = GameObject.Find(guid(10001n))
    const foundByTag = GameObject.FindWithTag(1n)

    console.log(str(rounded))
    f.printString(str(distance))
    f.printString(str(foundByGuid))
    f.printString(str(foundByTag))

    // player() 返回实体子类型，可直接使用对应快捷成员。
    const firstPlayer = player(1n)
    firstPlayer.setFaction(faction(1n))
    f.printString(firstPlayer.nickname)
    f.queryPlayerClass(firstPlayer)
    f.printString(str(firstPlayer.classLevel))

    // 内置中英文预设 ID；中文键使用点访问，才能作为常量折叠。
    const englishMatches = GameObject.FindByPrefabId(CharacterPrefab.Amber)
    const chineseMatches = GameObject.FindByPrefabId(CharacterPrefabZh.安柏)
    const customMatches = GameObject.FindByPrefabId(CustomPrefab.FeatureProbe)
    f.printString(str(englishMatches.length))
    f.printString(str(chineseMatches.length))
    f.printString(str(customMatches.length))

    // setTimeout / setInterval、闭包捕获、清理和 interval 自清理。
    const message = 'captured timeout value'
    let ticks = 0n
    const timeoutHandle = setTimeout(() => {
      f.printString(message)
    }, 500)
    const intervalHandle = setInterval(() => {
      ticks += 1n
      f.printString(str(ticks))
      if (ticks >= 3n) clearInterval(intervalHandle)
    }, 1000)
    setTimeout(() => {
      clearTimeout(timeoutHandle)
    }, 2000)

    // gstsServer、全局 send 和带参数类型的信号。
    f.printString(str(gstsServerDouble(5n)))
    send(FeatureSignal, 3n, 'created', true, [evt.eventSourceEntity])
  })
  .on('whenAttacked', (evt, f) => {
    f.printString(str(evt.damage))
    f.printString(str(evt.attackerEntity))
  })
  .onSignal(FeatureSignal, (evt, f) => {
    f.printString(str(evt.params.amount))
    f.printString(evt.params.message)
    f.printString(str(evt.params.enabled))
    f.printString(str(evt.params.targets.length))
  })

// 中文事件名和中文 f 别名。
g.server({ id: 1073742402, name: 'Feature_Zh_Hover', lang: 'zh' }).on('实体创建时', (evt, f) => {
  f.打印字符串(str(evt.eventSourceGuid))
})

// 经典模式专属事件、节点和 player() 快捷成员。
g.server({ id: 1073742403, name: 'Feature_Classic', mode: 'classic' })
  .on('whenEntityIsCreated', (_evt, f) => {
    const firstPlayer = player(1n)
    const activeCharacter = firstPlayer.activeCharacter
    activeCharacter.addElementalEnergy(5)
    activeCharacter.setElementalEnergy(25)
    f.printString(str(activeCharacter.classicModeId))
  })
  .on('whenTheActiveCharacterChanges', (_evt, f) => {
    f.printString('active character changed')
  })

// 七类客户端图同样覆盖配置、语言/模式、直接运算、流程控制、全局别名和 gsts.fXxx。
g.characterSkill({
  id: 1082130701,
  name: 'Feature_Character_Skill',
  prefix: true,
  mode: 'beyond',
  lang: 'en'
}).on('start', (_evt, f) => {
  // gstsCharacterXxx 函数、直接算术运算和客户端 Vector3 / Mathf / GameObject 别名。
  const fromGsts = gstsClientCharacterSkillDouble(gstsCharacterSkillIncrement(1n))
  const directValue = (fromGsts + 2n) * 3n
  const target = Vector3.Normalize(Vector3.Add(Vector3.forward, Vector3.up))
  const absolute = Mathf.Abs(-1.5)
  const floorToInt = Mathf.FloorToInt(-1.25)
  const ceilToInt = Mathf.CeilToInt(1.25)
  const trigonometric = Mathf.Sin(0.5) + Mathf.Cos(0.5) + Mathf.Tan(0.5)
  // GameObject/self 返回通用 entity；clientEntity() 显式收窄为客户端快捷方法表。
  const foundByGameObject = clientEntity(GameObject.Find(guid(10001n)))
  const targetEntity = f.queryEntityByGuid(guid(10001n))

  // 客户端列表节点的参数顺序与服务器不同；普通下标和 idx() 都由 Transform 自动适配。
  const values = list('int', [directValue, 2n, 3n, 4n])
  const firstValue = values[0]
  const secondValue = values[idx(1n)]
  const directFirstValue = f.getCorrespondingValueFromList(0n, values)
  if (firstValue > 0n) {
    f.fixedPointDisplacement(float(absolute), 0.5, 8, target, true)
  }

  // 基础转换、JS 包装函数以及客户端实体的属性、方法和自定义变量读取。
  const convertedFloat = float(secondValue)
  const convertedInt = int(convertedFloat)
  const convertedBool = bool(convertedInt)
  const convertedString = str(convertedBool)
  const numberValue = Number(convertedInt)
  const stringValue = String(convertedInt)
  const booleanValue = Boolean(convertedInt)
  const rawValue = raw(7n)
  const targetPosition = targetEntity.pos
  const targetFaction = targetEntity.faction()
  const customScore = targetEntity.get('feature_score').asType('int')
  targetEntity.addUnitStatus(1n, configId(20001n))

  // 客户端支持字典组装和只读查询；修改、删除、清空和遍历需要客户端不存在的节点。
  const lookup = dict([{ k: 1n, v: firstValue }])
  const lookupValue = lookup.get(1n)
  const lookupExists = lookup.has(1n)
  const lookupKeyCount = f.getListLength(lookup.keys())
  const lookupValueCount = f.getListLength(lookup.values())
  const lookupSize = lookup.size
  const prefabValue = prefabId(30001n)
  const prefabLookup = dict([{ k: prefabValue, v: secondValue }])
  const prefabScore = prefabLookup.get(prefabValue)
  const factionValue = faction(1n)
  const factionLookup = dict([{ k: factionValue, v: firstValue }])
  const factionScore = factionLookup.get(factionValue)
  const vectorValue = vec3([1, 2, 3])
  // 节点参数仍接受通用 entity；clientEntity 也可直接传入。
  const entityValue = clientEntity(foundByGameObject)

  let total = 0n
  for (let index = 0; index < 3; index++) {
    total += int(index)
    if (index === 1) break
  }
  while (total < 2n) total += 1n

  switch (total) {
    case FlowCode.Start:
      gsts.fCharacterSkill.notifyServerNodeGraph('start', '', '')
      break
    default:
      gsts.fCharacterSkill.sendSignalToServerNodeGraph('feature_debug', str(Math.max(1, 2)))
      break
  }

  gsts.fCharacterSkill.sendSignalToServerNodeGraph(
    'feature_debug',
    str(directFirstValue + rawValue),
    convertedString,
    stringValue
  )
  gsts.fCharacterSkill.sendSignalToServerNodeGraph(
    'feature_debug',
    str(numberValue),
    str(booleanValue),
    str(customScore + lookupValue + prefabScore + factionScore)
  )
  gsts.fCharacterSkill.sendSignalToServerNodeGraph(
    'feature_debug',
    str(lookupKeyCount + lookupValueCount + lookupSize),
    str(lookupExists),
    str(targetFaction)
  )
  gsts.fCharacterSkill.sendSignalToServerNodeGraph(
    'feature_debug',
    str(floorToInt),
    str(ceilToInt),
    str(trigonometric)
  )
  gsts.fCharacterSkill.sendSignalToServerNodeGraph(
    'feature_debug',
    str(Vector3.Magnitude(Vector3.Add(targetPosition, vectorValue))),
    str(Vector3.Magnitude(entityValue.pos)),
    str(Vector3.Magnitude(target))
  )
  send(FeatureSignal, directValue, 'client', true, [targetEntity])
})

// lang: 'zh' 开启客户端 f 的中文节点别名；start 是客户端固定入口事件名。
g.characterControlSkill({
  id: 1082130702,
  name: 'Feature_Character_Control_Skill_Zh',
  lang: 'zh'
}).on('start', (_evt, f) => {
  const motor = f.获取当前跟随操控运动器()
  const helperValue = gstsClientCharacterControlSkillIncrement(gstsCharacterControlSkillDouble(1n))
  f.添加速度(motor, float(helperValue), Vector3.up, 0.5)
  gsts.fCharacterControlSkill.setControlMotorToUngroundedState(motor, 0.2)
})

// 造物技能支持经典模式；同时核验中文别名、经典专属节点、self 和直接算术。
g.creationSkill({
  id: 1082130703,
  name: 'Feature_Creation_Skill_Classic_Zh',
  mode: 'classic',
  lang: 'zh'
}).on('start', (_evt, f) => {
  const classicCharacterId = f.查询经典模式角色编号(self)
  const helperValue = gstsClientCreationSkillIncrement(gstsCreationSkillDouble(classicCharacterId))
  f.复杂造物瞬移(Vector3.Add(Vector3.up, Vector3.forward), Vector3.zero)
  gsts.fCreationSkill.setSkillVariable(configId(1n), float(helperValue))
})

g.creationStatus({ id: 1082130704, name: 'Feature_Creation_Status' }).on('start', (_evt, f) => {
  const skillIndex = f.getRandomNumber(0n, 2n) + 1n
  const helperIndex = gstsClientCreationStatusIncrement(gstsCreationStatusDouble(skillIndex))
  const sameStageEntity = f.equal(stage, level)
  gsts.fCreationStatus.executeSkill(sameStageEntity, helperIndex)
})

g.creationStatusDecision({ id: 1082130705, name: 'Feature_Creation_Status_Decision' }).on(
  'start',
  (_evt, f) => {
    const helperValue = gstsClientCreationStatusDecisionIncrement(
      gstsCreationStatusDecisionDouble(1n)
    )
    const ready = f.greaterThan(float(helperValue), 0)
    gsts.fCreationStatusDecision.doubleBranch(
      ready,
      () => {},
      () => {}
    )
  }
)

g.boolFilter({
  id: 1082130706,
  name: 'Feature_Bool_Filter_Classic_Zh',
  mode: 'classic',
  lang: 'zh'
}).on('start', (_evt, f) => {
  const roll = f.获取随机数(1n, 10n)
  const ready = gsts.fBoolFilter.greaterThan(roll + 1n, 2n)
  return gstsClientBoolFilterNot(gstsBoolFilterNot(ready))
})

g.intFilter({
  id: 1082130707,
  name: 'Feature_Int_Filter',
  evaluationInterval: 0.5
}).on('start', (_evt, f) => {
  const roll = f.getRandomNumber(1n, 10n)
  return gstsClientIntFilterIncrement(gstsIntFilterDouble(roll)) - 1n
})

/*
 * 模式负例（按需取消注释，应当报错）：
 *
 * g.server({ mode: 'classic', type: 'class' })
 * g.characterSkill({ mode: 'classic' })
 * g.server({ mode: 'beyond' }).on('whenEntityIsCreated', (_evt, f) => {
 *   f.reviveActiveCharacter(player(1n))
 *   f.printString(str(player(1n).activeCharacter))
 * })
 *
 * 最后一行应报告：
 * node "get_active_character_of_specified_player" is classic mode only (current: beyond)
 *
 * 客户端边界负例（按需取消注释，应当分别报错）：
 *
 * const clientGraph = g.creationStatus({ id: 1082130790 })
 * clientGraph.on('start', () => {})
 * clientGraph.on('start', () => {}) // 一个客户端图只能注册一个 start
 * g.characterSkill().on('start', () => {
 *   list('int', [1n]).push(2n)       // 客户端没有列表插入节点
 *   self.set('score', 1n)            // 客户端没有自定义变量写入节点
 *   print('client')                   // 客户端没有服务器日志节点
 * })
 *
 * ESLint 负例（按需取消注释，应分别触发 full 配置中的规则）：
 *
 * Object.keys([1n, 2n])       // gsts/no-object-static
 * JSON.stringify(1n)          // gsts/no-json
 * Promise.resolve(1n)         // gsts/no-promise
 * console.log('too', 'many')  // gsts/builtin-console-log-arity
 */
