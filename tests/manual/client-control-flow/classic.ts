/**
 * 经典模式客户端/服务器控制流人工验收图。
 *
 * 生成：
 *   node ./bin/gsts.mjs tests/manual/client-control-flow/classic.ts --noinject
 *
 * 注入前请在地图中创建信号 `gsts_client_flow_log`，参数依次为：
 *   mode: str, check: str, actual: str, expected: str
 *
 * 导入本文件生成的五个图：
 *   1073741826  GstsClientFlowReportClassic       服务器图（经典）
 *   1082130433  GstsClientFlowStatusClassic       造物状态（经典）
 *   1082130434  GstsClientFlowDecisionClassic     造物状态决策（经典）
 *   1082130435  GstsClientControlFlowClassic      造物技能（经典）
 *   1082130436  GstsClientDataTernaryClassic      int filter（经典）
 *
 * 逻辑与 beyond.ts 一致，用于确认经典节点池下的同一套 lowering 和运行语义。
 * 服务器日志格式以及 int filter 三元探针说明也与 beyond.ts 相同。
 */

import { RayFilterType, TacticSpeed } from 'genshin-ts/definitions/client_enums'
import { EntityType, TargetType } from 'genshin-ts/definitions/enum'
import { defineSignal, g } from 'genshin-ts/runtime/core'

const MODE = 'classic'
const SERVER_REPORT_ID = 1073741826
const CLIENT_STATUS_ID = 1082130433
const CLIENT_STATUS_DECISION_ID = 1082130434
const CLIENT_CONTROL_FLOW_ID = 1082130435
const CLIENT_DATA_TERNARY_ID = 1082130436

const ClientFlowLogSignal = defineSignal('gsts_client_flow_log', [
  ['mode', 'str'],
  ['check', 'str'],
  ['actual', 'str'],
  ['expected', 'str']
])

function gstsCreationSkillReport(check: string, actual: string, expected: string) {
  gsts.fCreationSkill.sendSignalToServerNodeGraph(
    ClientFlowLogSignal,
    MODE,
    check,
    actual,
    expected
  )
}

function gstsCreationSkillSequentialLoopGate(values: bigint[]) {
  let sum = 0n
  for (const value of values) {
    if (value === 2n) continue
    sum += value
  }
  for (const value of values) {
    if (value === 4n) break
    sum += value
  }
  return sum
}

g.server({
  id: SERVER_REPORT_ID,
  name: 'GstsClientFlowReportClassic',
  mode: MODE,
  variables: {
    reportCount: 0n
  }
}).onSignal(ClientFlowLogSignal, (evt, f) => {
  if (evt.params.mode === MODE) {
    const reportCount = f.get('reportCount') + 1n
    f.set('reportCount', reportCount)

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
    f.printString(str(reportCount))
  }
})

g.creationSkill({
  id: CLIENT_CONTROL_FLOW_ID,
  name: 'GstsClientControlFlowClassic',
  mode: MODE
}).on('start', (_evt, f) => {
  const values = list('int', [1n, 2n, 3n, 4n, 5n])
  const copiedValues = f.copyList(values)
  const emptyValues: bigint[] = []
  const indexedFirst = values[0]
  const indexedFourth = values[idx(3n)]
  const selfEntity = f.getSelfEntity()
  const selfIsCreation = f.getEntitySType(selfEntity) === EntityType.Creation

  const rayResult = f.getRayDetectionResult(
    selfEntity,
    [0, 0, 0],
    [0, 0, 1],
    20,
    TargetType.None,
    [EntityType.Stage, EntityType.Creation],
    [RayFilterType.Hurtbox, RayFilterType.Scene]
  )
  if (f.equal(rayResult.onHitLocation, [0, 0, 0])) {
    gstsCreationSkillReport('ray-enum-arrays', 'no-hit', '<observe>')
  } else {
    gstsCreationSkillReport('ray-enum-arrays', 'hit', '<observe>')
  }

  let oddSum = 0n
  for (const value of copiedValues) {
    if (value % 2n === 0n) continue
    oddSum += value
    if (oddSum > 7n) break
  }

  let forEachSum = 0n
  values.forEach((value) => {
    forEachSum += value
  })

  const reduced = values.reduce((sum, value) => sum + value, 0n)
  const hasThree = values.includes(3n)
  const hasFourViaSimpleSome = values.some((value) => value === 4n)
  const firstThreeIndex = values.indexOf(3n)
  const hasEven = values.some((value) => value % 2n === 0n)
  const allPositive = values.every((value) => value > 0n)
  const foundFour = values.find((value) => value === 4n)
  const foundFourIndex = values.findIndex((value) => value === 4n)

  let integerRemainder = 17n
  integerRemainder %= 5n
  let mutableFloatRemainder = 14.5
  mutableFloatRemainder %= 4
  const floatRemainder = 5.5 % 2
  const negativeIntegerRemainder = -17n % 5n
  const negativeFloatRemainder = -5.5 % 2

  let compoundValue = indexedFirst + indexedFourth
  compoundValue += 1n
  compoundValue *= 2n
  const arithmeticResult = (compoundValue - 3n) / 3n
  const comparisonResult =
    arithmeticResult !== 4n &&
    arithmeticResult >= 3n &&
    arithmeticResult <= 3n &&
    !(arithmeticResult < 3n) &&
    arithmeticResult === 3n

  switch (integerRemainder) {
    case 0n:
      gstsCreationSkillReport('switch-multi-case', '0', '2')
      break
    case 1n:
      gstsCreationSkillReport('switch-multi-case', '1', '2')
      break
    case 2n:
      gstsCreationSkillReport('switch-multi-case', '2', '2')
      break
    default:
      gstsCreationSkillReport('switch-multi-case', 'default', '2')
  }

  gstsCreationSkillReport('indexed-first', str(indexedFirst), '1')
  gstsCreationSkillReport('indexed-fourth', str(indexedFourth), '4')
  gstsCreationSkillReport('odd-sum-continue-break', str(oddSum), '9')
  gstsCreationSkillReport('for-each-sum', str(forEachSum), '15')
  gstsCreationSkillReport('reduce-sum', str(reduced), '15')
  gstsCreationSkillReport('includes', str(int(hasThree)), '1')
  gstsCreationSkillReport('simple-some', str(int(hasFourViaSimpleSome)), '1')
  gstsCreationSkillReport('index-of', str(firstThreeIndex), '2')
  gstsCreationSkillReport('complex-some-modulo', str(int(hasEven)), '1')
  gstsCreationSkillReport('every', str(int(allPositive)), '1')
  gstsCreationSkillReport('find', str(foundFour!), '4')
  gstsCreationSkillReport('find-index', str(foundFourIndex), '3')
  gstsCreationSkillReport('integer-modulo', str(integerRemainder), '2')
  gstsCreationSkillReport(
    'float-modulo-range',
    str(int(mutableFloatRemainder > 2.49 && mutableFloatRemainder < 2.51)),
    '1'
  )
  gstsCreationSkillReport(
    'float-expression-modulo-range',
    str(int(floatRemainder > 1.49 && floatRemainder < 1.51)),
    '1'
  )
  gstsCreationSkillReport('negative-integer-modulo', str(negativeIntegerRemainder), '-2')
  gstsCreationSkillReport(
    'negative-float-modulo-range',
    str(int(negativeFloatRemainder > -1.51 && negativeFloatRemainder < -1.49)),
    '1'
  )
  gstsCreationSkillReport('compound-arithmetic', str(arithmeticResult), '3')
  gstsCreationSkillReport('comparison-and-not', str(int(comparisonResult)), '1')

  let emptyIterations = 0n
  for (const _value of emptyValues) {
    emptyIterations += 1n
    gstsCreationSkillReport('empty-list-body', 'executed', 'must-not-execute')
  }
  gstsCreationSkillReport('empty-list-iterations', str(emptyIterations), '0')

  let loopWithoutReturnSum = 0n
  for (const value of values) {
    loopWithoutReturnSum += value
  }
  gstsCreationSkillReport('loop-without-return', str(loopWithoutReturnSum), '15')

  let classicForSum = 0n
  for (let index = 0n; index < 6n; index += 1n) {
    if (index === 1n) continue
    if (index === 5n) break
    classicForSum += index
  }

  let whileIndex = 0n
  let whileSum = 0n
  while (whileIndex < 4n) {
    whileIndex += 1n
    if (whileIndex === 2n) continue
    whileSum += whileIndex
  }

  let doWhileIndex = 0n
  let doWhileSum = 0n
  do {
    doWhileIndex += 1n
    if (doWhileIndex === 2n) continue
    doWhileSum += doWhileIndex
  } while (doWhileIndex < 3n)

  gstsCreationSkillReport('classic-for-sum', str(classicForSum), '9')
  gstsCreationSkillReport('while-sum', str(whileSum), '8')
  gstsCreationSkillReport('do-while-sum', str(doWhileSum), '4')
  gstsCreationSkillReport('enum-equality', str(int(selfIsCreation)), '1')

  const sequentialLoopGate = gstsCreationSkillSequentialLoopGate(values)
  gstsCreationSkillReport('sequential-loop-return-gate', str(sequentialLoopGate), '19')

  for (const outer of values) {
    for (const inner of values) {
      if (outer === 2n && inner === 3n) {
        gstsCreationSkillReport('nested-loop-handler-return', 'entered', 'entered')
        return
      }
    }
  }

  gstsCreationSkillReport('nested-loop-handler-return', 'fell-through', 'entered')
})

/**
 * 与上面的造物技能组成经典模式可动怪物：
 *
 * - start1 是攻击状态，释放造物技能序号 1。
 * - start2 是索敌/追击状态，移动到当前目标实体。
 *
 * 注意：下面每个入口中的两条语句虽然按顺序书写，后一条实际连接到前一行为节点的
 * 【失败执行】引脚；只有前一行为失败时，才会执行终止兜底节点。
 */
const clientFlowStatus = g.creationStatus({
  id: CLIENT_STATUS_ID,
  name: 'GstsClientFlowStatusClassic',
  mode: MODE
})

clientFlowStatus.on('start1', (_evt, f) => {
  f.executeSkill(true, 1n)
  f.continueExecutingPreviousFrameBehavior()
})

clientFlowStatus.on('start2', (_evt, f) => {
  f.tacticMoveToTheTargetEntity(
    true,
    f.getTargetEntity(),
    1,
    TacticSpeed.Run,
    360,
    'control-flow-pursuit',
    false
  )
  f.continueExecutingPreviousFrameBehavior()
})

/**
 * 交战中且距离目标小于 1.5 时切换到 start1（攻击），否则切换到 start2（追击）。
 * 【自主逻辑参数序号】1/2 分别对应状态图的 start1/start2。
 *
 * 在编辑器的造物配置中，把技能序号 1 绑定到 CLIENT_CONTROL_FLOW_ID，并让自主逻辑
 * 使用本决策图和 CLIENT_STATUS_ID。
 */
g.creationStatusDecision({
  id: CLIENT_STATUS_DECISION_ID,
  name: 'GstsClientFlowDecisionClassic',
  mode: MODE
}).on('start1', (_evt, f) => {
  if (f.checkWhetherSelfIsInBattle()) {
    if (f.checkTheHorizontalDistanceFromSelfToTarget() < 1.5) {
      f.switchToSelfExecutionStatus(true, configId(CLIENT_STATUS_ID), 1n)
    } else {
      f.switchToSelfExecutionStatus(true, configId(CLIENT_STATUS_ID), 2n)
    }
  }
})

g.intFilter({
  id: CLIENT_DATA_TERNARY_ID,
  name: 'GstsClientDataTernaryClassic',
  mode: MODE,
  evaluationInterval: 0.3
}).on('start', (_evt, f) => {
  const condition = f.equal(1n, 1n)
  return condition ? 101n : f.division(1n, 0n)
})
