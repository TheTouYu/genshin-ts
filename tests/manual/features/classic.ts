/**
 * GSTS 经典模式综合功能回归案例。
 *
 * 在仓库根目录运行：
 *   npm run build
 *   node ./bin/gsts.mjs tests/manual/features/classic.ts --noinject
 *   node tests/manual/features/classic.simulate.mjs
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
 *   1082130449  FeatureBoolFilterClassicZh           bool filter
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
// 与造物属性面板中配置的自主逻辑序号保持一致。
const NEAR_TARGET_AUTONOMOUS_LOGIC_ID = 1n
const FAR_TARGET_AUTONOMOUS_LOGIC_ID = 2n

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
 * start1/start2 分别对应【按顺序唯一执行】的 1/2 号引脚，并按引脚顺序执行。
 * 这里拆成两个入口只是为了组织代码，不表示两个可切换状态；将两段语句全部放进
 * 单一 start1 中按顺序串联也能得到相同效果。
 *
 * 实际控制行为时，可以把不同条件连接到 executeSkill、tacticMoveToTheTargetEntity
 * 等节点的【是否执行】参数；也可以把攻击、索敌等行为拆成不同状态图，再由状态决策图
 * 传入不同的状态节点图配置 ID。
 *
 * 行为节点后的下一条顺序语句实际连接到【失败执行】；这里的
 * continueExecutingPreviousFrameBehavior 只在前一行为失败时作为最后兜底执行。
 * 本测试特意使用它覆盖“使用时必须位于分支末尾”的约束；它不是每个分支都必须添加的节点。
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
 * 经典模式状态决策图根据目标距离切换造物属性面板中配置的自主逻辑 1/2。
 * 【自主逻辑参数序号】仅对应面板中的自主逻辑配置（如入战感知、脱战或领地设置），
 * 请按实际地图面板配置调整这两个常量。
 * 如果要切换攻击、索敌等状态图，应让两个分支传入不同的状态节点图配置 ID。
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
      f.switchToSelfExecutionStatus(
        true,
        configId(CREATION_STATUS_GRAPH_ID),
        NEAR_TARGET_AUTONOMOUS_LOGIC_ID
      )
    } else {
      f.switchToSelfExecutionStatus(
        true,
        configId(CREATION_STATUS_GRAPH_ID),
        FAR_TARGET_AUTONOMOUS_LOGIC_ID
      )
    }
  }
})

g.boolFilter({
  id: 1082130449,
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
