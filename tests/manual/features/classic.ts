/**
 * GSTS 经典模式综合功能回归案例。
 *
 * 在仓库根目录运行：
 *   npm run build
 *   node ./bin/gsts.mjs tests/manual/features/classic.ts --noinject
 *
 * 注入前请创建两个信号：
 *   feature_probe(amount: int, message: str, enabled: bool, targets: entity_list)
 *   gsts_feature_log(mode: str, check: str, actual: str, expected: str)
 *
 * 图 ID 接续超限综合示例使用的默认 ID 区间：
 *   1073741829  FeatureAllInOneClassic               服务器图
 *   1082130444  FeatureCreationSkillClassicZh        造物技能
 *   1082130445  FeatureCreationStatusClassic         造物状态
 *   1082130446  FeatureCreationStatusDecisionClassic 造物状态决策
 *   1082130447  FeatureBoolFilterClassicZh           bool filter
 *   1082130448  FeatureIntFilterClassic              int filter
 *
 * 角色技能和角色操控技能没有经典模式，因此不在本文件中生成。
 */

import { TacticSpeed } from 'genshin-ts/definitions/client_enums'
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

const MODE = 'classic'
const CREATION_SKILL_GRAPH_ID = 1082130444
const CREATION_STATUS_GRAPH_ID = 1082130445
const CREATION_STATUS_DECISION_GRAPH_ID = 1082130446

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

g.server({
  id: 1073741829,
  name: 'FeatureAllInOneClassic',
  mode: MODE
})
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

// 经典专属角色编号、中文别名、客户端辅助函数、信号和实体列表参数。
g.creationSkill({
  id: CREATION_SKILL_GRAPH_ID,
  name: 'FeatureCreationSkillClassicZh',
  mode: MODE,
  lang: 'zh'
}).on('start', (_evt, f) => {
  const classicCharacterId = f.查询经典模式角色编号(self)
  const deterministicHelper = gstsClientCreationSkillIncrement(gstsCreationSkillDouble(1n))
  const helperValue = gstsClientCreationSkillIncrement(gstsCreationSkillDouble(classicCharacterId))

  f.复杂造物瞬移(Vector3.Add(Vector3.up, Vector3.forward), Vector3.zero)
  gsts.fCreationSkill.setSkillVariable(configId(1n), float(helperValue))
  gsts.fCreationSkill.sendSignalToServerNodeGraph(
    FeatureLogSignal,
    MODE,
    'creation-skill-helper',
    str(deterministicHelper),
    '3'
  )
  gsts.fCreationSkill.sendSignalToServerNodeGraph(
    FeatureLogSignal,
    MODE,
    'creation-skill-classic-character-id',
    str(classicCharacterId),
    '<observe>'
  )
  send(FeatureSignal, deterministicHelper, 'classic-client', true, [self])
})

/**
 * 经典模式可动怪物状态图：
 *
 * - start1：攻击状态，释放造物技能序号 1。
 * - start2：索敌/追击状态，移动到当前目标实体。
 *
 * 行为节点后的下一条顺序语句实际连接到【失败执行】；这里的
 * continueExecutingPreviousFrameBehavior 只在前一行为失败时作为最后兜底执行。
 */
const creationStatusClassic = g.creationStatus({
  id: CREATION_STATUS_GRAPH_ID,
  name: 'FeatureCreationStatusClassic',
  mode: MODE
})

creationStatusClassic.on('start1', (_evt, f) => {
  f.executeSkill(true, 1n)
  f.continueExecutingPreviousFrameBehavior()
})

creationStatusClassic.on('start2', (_evt, f) => {
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
 * 经典模式状态决策图：交战中且目标距离小于 1.5 时切换到 start1（攻击），
 * 否则切换到 start2（追击）。自主逻辑参数 1/2 对应状态图 start1/start2。
 *
 * 在编辑器的造物配置中，将技能序号 1 绑定到 CREATION_SKILL_GRAPH_ID，
 * 并让自主逻辑引用本决策图与 CREATION_STATUS_GRAPH_ID。
 */
g.creationStatusDecision({
  id: CREATION_STATUS_DECISION_GRAPH_ID,
  name: 'FeatureCreationStatusDecisionClassic',
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
  id: 1082130447,
  name: 'FeatureBoolFilterClassicZh',
  mode: MODE,
  lang: 'zh',
  evaluationInterval: 0.5
}).on('start', (_evt, f) => {
  const roll = f.获取随机数(1n, 10n)
  const ready = gsts.fBoolFilter.greaterThan(roll + 1n, 2n)
  return gstsClientBoolFilterNot(gstsBoolFilterNot(ready))
})

g.intFilter({
  id: 1082130448,
  name: 'FeatureIntFilterClassic',
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
 * g.characterControlSkill({ mode: 'classic' })
 */
