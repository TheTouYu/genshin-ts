/**
 * GSTS 超限模式综合功能回归案例。
 *
 * 在仓库根目录运行：
 *   npm run build
 *   node ./bin/gsts.mjs tests/manual/features/beyond.ts --noinject
 *
 * 注入前请创建两个信号：
 *   feature_probe(amount: int, message: str, enabled: bool, targets: entity_list)
 *   gsts_feature_log(mode: str, check: str, actual: str, expected: str)
 *
 * 图 ID 接续 client-control-flow 示例使用的默认 ID 区间：
 *   1073741827  FeatureAllInOneBeyond               服务器图
 *   1073741828  FeatureZhHoverBeyond                服务器中文别名图
 *   1082130435  FeatureCharacterSkillBeyond         角色技能
 *   1082130436  FeatureCharacterControlSkillBeyond  角色操控技能
 *   1082130437  FeatureCreationSkillBeyond          造物技能
 *   1082130438  FeatureCreationStatusBeyond         造物状态
 *   1082130439  FeatureCreationStatusDecisionBeyond 造物状态决策
 *   1082130440  FeatureBoolFilterBeyond              bool filter
 *   1082130441  FeatureIntFilterBeyond               int filter
 */

import { TacticSpeed } from 'genshin-ts/definitions/client_enums'
import { CharacterPrefab, CharacterPrefabZh } from 'genshin-ts/definitions/prefabs'
import { defineSignal, g } from 'genshin-ts/runtime/core'

const FeatureSignal = defineSignal('feature_probe', [
  ['amount', 'int'],
  ['message', 'str'],
  ['enabled', 'bool'],
  ['targets', 'entity_list']
])

const FeatureLogSignal = defineSignal('gsts_feature_log', [
  ['mode', 'str'],
  ['check', 'str'],
  ['actual', 'str'],
  ['expected', 'str']
])

const MODE = 'beyond'
const CREATION_SKILL_GRAPH_ID = 1082130437
const CREATION_STATUS_GRAPH_ID = 1082130438
const CREATION_STATUS_DECISION_GRAPH_ID = 1082130439

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
  id: 1073741827,
  name: 'FeatureAllInOneBeyond',
  prefix: true,
  type: 'entity',
  mode: MODE,
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
  .onSignal(FeatureLogSignal, (evt, f) => {
    if (evt.params.mode === MODE) {
      if (evt.params.expected === '<observe>') {
        f.printString('OBSERVE')
      } else if (evt.params.actual === evt.params.expected) {
        f.printString('PASS')
      } else {
        f.printString('FAIL')
      }
      f.printString(evt.params.check)
      f.printString(evt.params.actual)
      f.printString(evt.params.expected)
    }
  })

// 中文事件名和中文 f 别名。
g.server({
  id: 1073741828,
  name: 'FeatureZhHoverBeyond',
  mode: MODE,
  lang: 'zh'
}).on('实体创建时', (evt, f) => {
  f.打印字符串(str(evt.eventSourceGuid))
})

// 七类客户端图同样覆盖配置、语言/模式、直接运算、流程控制、全局别名和 gsts.fXxx。
g.characterSkill({
  id: 1082130435,
  name: 'FeatureCharacterSkillBeyond',
  prefix: true,
  mode: MODE,
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
      gsts.fCharacterSkill.sendSignalToServerNodeGraph(
        FeatureLogSignal,
        MODE,
        'character-skill-math-max',
        str(Math.max(1, 2)),
        '2'
      )
      break
  }

  gsts.fCharacterSkill.sendSignalToServerNodeGraph(
    FeatureLogSignal,
    MODE,
    'character-skill-arithmetic',
    str(directFirstValue + rawValue),
    '25'
  )
  gsts.fCharacterSkill.sendSignalToServerNodeGraph(
    FeatureLogSignal,
    MODE,
    'character-skill-wrapper-number',
    str(numberValue),
    '2'
  )
  gsts.fCharacterSkill.sendSignalToServerNodeGraph(
    FeatureLogSignal,
    MODE,
    'character-skill-wrapper-string-native',
    stringValue,
    '2'
  )
  gsts.fCharacterSkill.sendSignalToServerNodeGraph(
    FeatureLogSignal,
    MODE,
    'character-skill-wrapper-bool',
    str(int(booleanValue)),
    '1'
  )
  gsts.fCharacterSkill.sendSignalToServerNodeGraph(
    FeatureLogSignal,
    MODE,
    'character-skill-wrapper-string',
    convertedString,
    '<observe>'
  )
  gsts.fCharacterSkill.sendSignalToServerNodeGraph(
    FeatureLogSignal,
    MODE,
    'character-skill-dictionary-size',
    str(lookupKeyCount + lookupValueCount + lookupSize),
    '3'
  )
  gsts.fCharacterSkill.sendSignalToServerNodeGraph(
    FeatureLogSignal,
    MODE,
    'character-skill-dictionary-has',
    str(int(lookupExists)),
    '1'
  )
  gsts.fCharacterSkill.sendSignalToServerNodeGraph(
    FeatureLogSignal,
    MODE,
    'character-skill-rounding',
    str(floorToInt + ceilToInt),
    '0'
  )
  gsts.fCharacterSkill.sendSignalToServerNodeGraph(
    FeatureLogSignal,
    MODE,
    'character-skill-trigonometric',
    str(trigonometric),
    '<observe>'
  )
  gsts.fCharacterSkill.sendSignalToServerNodeGraph(
    FeatureLogSignal,
    MODE,
    'character-skill-scene-int-values',
    str(customScore + lookupValue + prefabScore + factionScore),
    '<observe>'
  )
  gsts.fCharacterSkill.sendSignalToServerNodeGraph(
    FeatureLogSignal,
    MODE,
    'character-skill-scene-faction',
    str(targetFaction),
    '<observe>'
  )
  gsts.fCharacterSkill.sendSignalToServerNodeGraph(
    FeatureLogSignal,
    MODE,
    'character-skill-scene-vector-values',
    str(
      Vector3.Magnitude(Vector3.Add(targetPosition, vectorValue)) +
        Vector3.Magnitude(entityValue.pos) +
        Vector3.Magnitude(target)
    ),
    '<observe>'
  )
  send(FeatureSignal, directValue, 'client', true, [targetEntity])
})

// lang: 'zh' 开启客户端 f 的中文节点别名；start 是客户端固定入口事件名。
g.characterControlSkill({
  id: 1082130436,
  name: 'FeatureCharacterControlSkillBeyondZh',
  mode: MODE,
  lang: 'zh'
}).on('start', (_evt, f) => {
  const motor = f.获取当前跟随操控运动器()
  const helperValue = gstsClientCharacterControlSkillIncrement(gstsCharacterControlSkillDouble(1n))
  f.添加速度(motor, float(helperValue), Vector3.up, 0.5)
  gsts.fCharacterControlSkill.setControlMotorToUngroundedState(motor, 0.2)
  gsts.fCharacterControlSkill.sendSignalToServerNodeGraph(
    FeatureLogSignal,
    MODE,
    'character-control-helper',
    str(helperValue),
    '3'
  )
})

// 造物技能超限模式：辅助函数、中文别名、实体移动和技能变量。
g.creationSkill({
  id: CREATION_SKILL_GRAPH_ID,
  name: 'FeatureCreationSkillBeyondZh',
  mode: MODE,
  lang: 'zh'
}).on('start', (_evt, f) => {
  const helperValue = gstsClientCreationSkillIncrement(gstsCreationSkillDouble(1n))
  f.复杂造物瞬移(Vector3.Add(Vector3.up, Vector3.forward), Vector3.zero)
  gsts.fCreationSkill.setSkillVariable(configId(1n), float(helperValue))
  gsts.fCreationSkill.sendSignalToServerNodeGraph(
    FeatureLogSignal,
    MODE,
    'creation-skill-helper',
    str(helperValue),
    '3'
  )
})

/**
 * 可动怪物的状态图：
 *
 * - start1：攻击状态，释放造物技能序号 1。
 * - start2：索敌/追击状态，移动到当前目标实体。
 *
 * 下面每组代码虽然按顺序书写，但第二条只连接到第一条行为节点的【失败执行】引脚；
 * 因此前一行为成功或持续执行时，不会执行“继续执行前一帧行为”。
 */
const creationStatusBeyond = g.creationStatus({
  id: CREATION_STATUS_GRAPH_ID,
  name: 'FeatureCreationStatusBeyond',
  mode: MODE
})

creationStatusBeyond.on('start1', (_evt, f) => {
  f.executeSkill(true, 1n)
  f.continueExecutingPreviousFrameBehavior()
})

creationStatusBeyond.on('start2', (_evt, f) => {
  f.tacticMoveToTheTargetEntity(
    true,
    f.getTargetEntity(),
    1,
    TacticSpeed.Run,
    360,
    'feature-pursuit',
    false
  )
  f.continueExecutingPreviousFrameBehavior()
})

/**
 * 可动怪物的状态决策图：
 *
 * 交战中且距离目标小于 1.5 时切换到状态图 start1（攻击），否则切换到
 * start2（追击）。【自主逻辑参数序号】1/2 正好对应 start1/start2。
 *
 * 在编辑器的造物配置中，将技能序号 1 绑定到 CREATION_SKILL_GRAPH_ID，
 * 并让自主逻辑引用本决策图与 CREATION_STATUS_GRAPH_ID。
 */
g.creationStatusDecision({
  id: CREATION_STATUS_DECISION_GRAPH_ID,
  name: 'FeatureCreationStatusDecisionBeyond',
  mode: MODE
}).on('start1', (_evt, f) => {
  if (f.checkWhetherSelfIsInBattle()) {
    if (f.checkTheHorizontalDistanceFromSelfToTarget() < 1.5) {
      f.switchToSelfExecutionStatus(true, configId(CREATION_STATUS_GRAPH_ID), 1n)
    } else {
      f.switchToSelfExecutionStatus(true, configId(CREATION_STATUS_GRAPH_ID), 2n)
    }
  }
})

g.boolFilter({
  id: 1082130440,
  name: 'FeatureBoolFilterBeyondZh',
  mode: MODE,
  lang: 'zh'
}).on('start', (_evt, f) => {
  const roll = f.获取随机数(1n, 10n)
  const ready = gsts.fBoolFilter.greaterThan(roll + 1n, 2n)
  return gstsClientBoolFilterNot(gstsBoolFilterNot(ready))
})

g.intFilter({
  id: 1082130441,
  name: 'FeatureIntFilterBeyond',
  mode: MODE,
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
 * clientGraph.on('start1', () => {})
 * clientGraph.on('start1', () => {}) // 同一编号只能注册一次
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
