/**
 * 可直接生成并导入编辑器的客户端控制流测试图。
 *
 * 运行 `node ./bin/gsts.mjs examples/client-control-flow/index.ts --noinject` 生成 GIA；
 * 需要按 gsts.config.ts 的目标自动注入时去掉 --noinject。
 *
 * 导入生成的服务器图，并把客户端图绑定为“造物技能（超限）”。执行后：
 * - 服务器日志应打印 `switch:2`、`modulo-negative:pass`、`empty-list:pass`、
 *   `loop-gate:pass`、`loop-forms:pass`、`enum-equality:pass`、`checks:pass`、
 *   `nested-return:entered`；
 * - 射线检测还会打印 `enum-array:no-hit` 或 `enum-array:hit` 其中之一，
 *   用于确认两个枚举数组参数已实际参与节点连线；
 * - 不应打印任何带 `unexpected` 或 `fail` 的消息。
 *
 * 另会生成 `GstsClientDataTernaryProbe` int filter。条件恒为 true，false 分支
 * 故意放置了除零表达式。如果图运行异常，则说明 filter 的数据三元表达式不具备
 * JS 短路语义；filter 的 switch 已明确禁止。
 *
 * `push/map/filter` 等需要客户端不存在的列表修改节点，不能作为正向注入样例；
 * 对应能力错误由 ESLint 和客户端 Transform 负向测试覆盖。
 */

import { RayFilterType } from 'genshin-ts/definitions/client_enums'
import { EntityType, TargetType } from 'genshin-ts/definitions/enum'
import { g } from 'genshin-ts/runtime/core'

const CLIENT_CONTROL_FLOW_TEST_ID = 1082130783
const SERVER_CONTROL_FLOW_REPORT_ID = 1082130784
const CLIENT_DATA_TERNARY_TEST_ID = 1082130785

g.server({
  id: SERVER_CONTROL_FLOW_REPORT_ID,
  name: 'GstsClientControlFlowReport'
}).on('whenSkillNodeIsCalled', (evt, f) => {
  if (list('str', ['gsts-client-flow']).includes(evt.parameter1)) {
    f.printString(evt.parameter2)
  }
})

g.creationSkill({
  id: CLIENT_CONTROL_FLOW_TEST_ID,
  name: 'GstsClientControlFlowTest',
  mode: 'beyond'
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
    f.notifyServerNodeGraph('gsts-client-flow', 'enum-array:no-hit', '')
  } else {
    f.notifyServerNodeGraph('gsts-client-flow', 'enum-array:hit', '')
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
      f.notifyServerNodeGraph('gsts-client-flow', 'switch:0:unexpected', '')
      break
    case 1n:
      f.notifyServerNodeGraph('gsts-client-flow', 'switch:1:unexpected', '')
      break
    case 2n:
      f.notifyServerNodeGraph('gsts-client-flow', 'switch:2', '')
      break
    default:
      f.notifyServerNodeGraph('gsts-client-flow', 'switch:unexpected', '')
  }

  if (negativeIntegerRemainder === -2n && negativeFloatRemainder === -1.5) {
    f.notifyServerNodeGraph('gsts-client-flow', 'modulo-negative:pass', '')
  } else {
    f.notifyServerNodeGraph('gsts-client-flow', 'modulo-negative:fail', '')
  }

  let emptyIterations = 0n
  for (const _value of emptyValues) {
    emptyIterations += 1n
    f.notifyServerNodeGraph('gsts-client-flow', 'empty-list:unexpected', '')
  }
  if (emptyIterations === 0n) {
    f.notifyServerNodeGraph('gsts-client-flow', 'empty-list:pass', '')
  } else {
    f.notifyServerNodeGraph('gsts-client-flow', 'empty-list:fail', '')
  }

  let loopWithoutReturnSum = 0n
  for (const value of values) {
    loopWithoutReturnSum += value
  }
  if (loopWithoutReturnSum === 15n) {
    f.notifyServerNodeGraph('gsts-client-flow', 'loop-gate:pass', '')
  } else {
    f.notifyServerNodeGraph('gsts-client-flow', 'loop-gate:fail', '')
  }

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

  if (classicForSum === 9n && whileSum === 8n && doWhileSum === 4n) {
    f.notifyServerNodeGraph('gsts-client-flow', 'loop-forms:pass', '')
  } else {
    f.notifyServerNodeGraph('gsts-client-flow', 'loop-forms:fail', '')
  }

  if (selfIsCreation) {
    f.notifyServerNodeGraph('gsts-client-flow', 'enum-equality:pass', '')
  } else {
    f.notifyServerNodeGraph('gsts-client-flow', 'enum-equality:fail', '')
  }

  if (
    indexedFirst === 1n &&
    indexedFourth === 4n &&
    oddSum === 9n &&
    forEachSum === 15n &&
    reduced === 15n &&
    hasThree &&
    hasFourViaSimpleSome &&
    firstThreeIndex === 2 &&
    hasEven &&
    allPositive &&
    foundFour === 4n &&
    foundFourIndex === 3 &&
    integerRemainder === 2n &&
    mutableFloatRemainder > 2.49 &&
    mutableFloatRemainder < 2.51 &&
    floatRemainder > 1.49 &&
    floatRemainder < 1.51 &&
    comparisonResult
  ) {
    f.notifyServerNodeGraph('gsts-client-flow', 'checks:pass', '')
  } else {
    f.notifyServerNodeGraph('gsts-client-flow', 'checks:fail', '')
  }

  for (const outer of values) {
    for (const inner of values) {
      if (outer === 2n && inner === 3n) {
        f.notifyServerNodeGraph('gsts-client-flow', 'nested-return:entered', '')
        return
      }
    }
  }

  f.notifyServerNodeGraph('gsts-client-flow', 'nested-return:unexpected', '')
})

g.intFilter({
  id: CLIENT_DATA_TERNARY_TEST_ID,
  name: 'GstsClientDataTernaryProbe',
  evaluationInterval: 0.3
}).on('start', (_evt, f) => {
  const condition = f.equal(1n, 1n)
  return condition ? 101n : f.division(1n, 0n)
})
