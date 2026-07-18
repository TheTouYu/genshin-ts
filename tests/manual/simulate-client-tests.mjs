import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const CONTROL_FLOW_CONFIG = {
  beyond: {
    controlFlowId: 1082130437,
    statusId: 1082130438,
    decisionId: 1082130439,
    ternaryId: 1082130441
  },
  classic: {
    controlFlowId: 1082130435,
    statusId: 1082130433,
    decisionId: 1082130434,
    ternaryId: 1082130436
  }
}

const FEATURE_CONFIG = {
  beyond: {
    graphs: [
      [1073741827, 'server'],
      [1073741828, 'server'],
      [1082130435, 'character_skill'],
      [1082130436, 'character_control_skill'],
      [1082130437, 'creation_skill'],
      [1082130438, 'creation_status'],
      [1082130439, 'creation_status_decision'],
      [1082130440, 'bool_filter'],
      [1082130441, 'int_filter']
    ],
    signalGraphIds: [1082130435, 1082130436, 1082130437],
    statusId: 1082130438,
    decisionId: 1082130439,
    boolFilterId: 1082130440,
    intFilterId: 1082130441,
    boolInterval: 0.3,
    intInterval: 0.5
  },
  classic: {
    graphs: [
      [1073741829, 'server'],
      [1082130444, 'creation_skill'],
      [1082130445, 'creation_status'],
      [1082130446, 'creation_status_decision'],
      [1082130449, 'bool_filter'],
      [1082130448, 'int_filter']
    ],
    signalGraphIds: [1082130444],
    statusId: 1082130445,
    decisionId: 1082130446,
    boolFilterId: 1082130449,
    intFilterId: 1082130448,
    boolInterval: 0.5,
    intInterval: 0.5
  }
}

function asText(value) {
  return typeof value === 'bigint' ? String(value) : String(value)
}

function outcome(actual, expected) {
  if (expected === '<observe>') return 'OBSERVE'
  return asText(actual) === expected ? 'PASS' : 'FAIL'
}

function printReports(title, reports, withCounter) {
  console.log(`\n===== ${title} =====`)
  let passCount = 0
  let observeCount = 0
  let failCount = 0
  reports.forEach((report, index) => {
    const number = index + 1
    const result = outcome(report.actual, report.expected)
    if (result === 'PASS') passCount += 1
    else if (result === 'OBSERVE') observeCount += 1
    else failCount += 1

    console.log(`\n--- #${number} ${report.check} ---`)
    console.log(result)
    console.log(report.check)
    console.log(asText(report.actual))
    console.log(report.expected)
    if (withCounter) console.log(number)
    console.log(`说明：${report.detail}`)
  })
  console.log(
    `\n汇总：${reports.length} 项；PASS=${passCount}，OBSERVE=${observeCount}，FAIL=${failCount}`
  )
  assert.equal(failCount, 0, `${title}: local model produced FAIL`)
}

function readGeneratedJson(relativePath, compileCommand) {
  const jsonPath = path.resolve(relativePath)
  if (!fs.existsSync(jsonPath)) {
    console.log('\n===== 生成图结构检查：跳过 =====')
    console.log(`缺少 ${jsonPath}`)
    console.log(`请先运行：${compileCommand}`)
    return undefined
  }
  return JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
}

function sequentialLoopGate(values) {
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

export function simulateControlFlow(mode) {
  const config = CONTROL_FLOW_CONFIG[mode]
  if (!config) throw new Error(`unknown control-flow mode: ${mode}`)

  const values = [1n, 2n, 3n, 4n, 5n]
  const reports = [
    {
      check: 'ray-enum-arrays',
      actual: '<game: hit 或 no-hit>',
      expected: '<observe>',
      detail: '射线结果依赖怪物、场景碰撞和朝向；只确认枚举数组参数可正常执行。'
    }
  ]
  const report = (check, actual, expected, detail) =>
    reports.push({ check, actual, expected, detail })

  const indexedFirst = values[0]
  const indexedFourth = values[3]

  let oddSum = 0n
  for (const value of [...values]) {
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
      report('switch-multi-case', '0', '2', '不应命中 case 0。')
      break
    case 1n:
      report('switch-multi-case', '1', '2', '不应命中 case 1。')
      break
    case 2n:
      report('switch-multi-case', '2', '2', '17 % 5 为 2，应命中第三个 case。')
      break
    default:
      report('switch-multi-case', 'default', '2', '不应命中 default。')
  }

  report('indexed-first', indexedFirst, '1', '普通 values[0] 读取第一个列表元素。')
  report('indexed-fourth', indexedFourth, '4', 'idx(3n) 读取第四个列表元素。')
  report('odd-sum-continue-break', oddSum, '9', '跳过偶数，依次累加 1、3、5；达到 9 后 break。')
  report('for-each-sum', forEachSum, '15', 'forEach 应遍历 1…5 各一次。')
  report('reduce-sum', reduced, '15', 'reduce 初值为 0，累加 1…5。')
  report('includes', Number(hasThree), '1', '列表包含 3。')
  report('simple-some', Number(hasFourViaSimpleSome), '1', '简单 some 找到 4。')
  report('index-of', firstThreeIndex, '2', '3 的零基索引为 2。')
  report('complex-some-modulo', Number(hasEven), '1', '复杂 some 用 % 找到偶数 2。')
  report('every', Number(allPositive), '1', '所有元素都大于 0。')
  report('find', foundFour, '4', 'find 返回第一个等于 4 的值。')
  report('find-index', foundFourIndex, '3', 'findIndex 返回 4 的零基索引 3。')
  report('integer-modulo', integerRemainder, '2', '17n %= 5n 得到 2n。')
  report(
    'float-modulo-range',
    Number(mutableFloatRemainder > 2.49 && mutableFloatRemainder < 2.51),
    '1',
    '14.5 %= 4 应约等于 2.5。'
  )
  report(
    'float-expression-modulo-range',
    Number(floatRemainder > 1.49 && floatRemainder < 1.51),
    '1',
    '5.5 % 2 应约等于 1.5。'
  )
  report(
    'negative-integer-modulo',
    negativeIntegerRemainder,
    '-2',
    'JavaScript BigInt 余数跟随被除数符号；这是游戏中必须重点核对的一项。'
  )
  report(
    'negative-float-modulo-range',
    Number(negativeFloatRemainder > -1.51 && negativeFloatRemainder < -1.49),
    '1',
    '-5.5 % 2 应约等于 -1.5；这是游戏中必须重点核对的一项。'
  )
  report('compound-arithmetic', arithmeticResult, '3', '((1 + 4 + 1) * 2 - 3) / 3 = 3。')
  report(
    'comparison-and-not',
    Number(comparisonResult),
    '1',
    '覆盖 !=、>=、<=、<、==、! 与 && 的组合。'
  )

  let emptyIterations = 0n
  for (const _value of []) {
    emptyIterations += 1n
    report(
      'empty-list-body',
      'executed',
      'must-not-execute',
      '此项如果出现在游戏日志中，说明空列表循环错误执行了一次。'
    )
  }
  report('empty-list-iterations', emptyIterations, '0', '空列表的 listIterationLoop 必须执行零次。')

  let loopWithoutReturnSum = 0n
  for (const value of values) loopWithoutReturnSum += value
  report('loop-without-return', loopWithoutReturnSum, '15', '不含 return 的列表循环正常执行。')

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

  report('classic-for-sum', classicForSum, '9', '累加 0、2、3、4；跳过 1，在 5 处 break。')
  report('while-sum', whileSum, '8', '累加 1、3、4；在 2 处 continue。')
  report('do-while-sum', doWhileSum, '4', '累加 1、3；在 2 处 continue。')
  report(
    'enum-equality',
    1,
    '1',
    '造物技能的 self 应为 Creation；如果游戏返回 0，需要检查实体类型枚举。'
  )
  report(
    'sequential-loop-return-gate',
    sequentialLoopGate(values),
    '19',
    '第一段跳过 2 得 13；第二段在 4 前累加 1+2+3 得 6，总计 19。'
  )

  const nestedResult = (() => {
    for (const outer of values) {
      for (const inner of values) {
        if (outer === 2n && inner === 3n) return 'entered'
      }
    }
    return 'fell-through'
  })()
  report(
    'nested-loop-handler-return',
    nestedResult,
    'entered',
    '嵌套循环中的 return 必须终止整个 handler；游戏日志不应再出现 fell-through。'
  )

  console.log(`\n########## client-control-flow/${mode}.ts 本地模拟 ##########`)
  printReports(`${mode}：gsts_client_flow_log 的服务器五行日志`, reports, true)
  assert.equal(reports.length, 29)
  console.log('\n必须不存在的日志：')
  console.log('- empty-list-body')
  console.log('- nested-loop-handler-return / fell-through')
  console.log('最终累计序号必须停在 29。')

  console.log('\n===== int filter 三元表达式 =====')
  console.log('条件：equal(1, 1) => true')
  console.log('游戏期望返回：101')
  console.log('生成图必须同时包含：true 分支 101；false 分支 division(1, 0)')
  console.log('注意：这验证的是数据图双分支构造，不具备 JavaScript 短路语义。')

  console.log('\n===== 造物状态与决策行为表 =====')
  console.log('未处于战斗：决策图不切换状态。')
  console.log('战斗中且水平距离 < 1.5：切到 start1，执行技能序号 1。')
  console.log('战斗中且水平距离 >= 1.5：切到 start2，向目标移动。')
  console.log('行为节点成功或持续执行：不会执行下一条。')
  console.log('行为节点失败：才沿【失败执行】进入“继续执行前一帧行为”。')

  inspectControlFlowGraphs(mode, config)
}

function inspectControlFlowGraphs(mode, config) {
  const documents = readGeneratedJson(
    `dist/tests/manual/client-control-flow/${mode}.json`,
    `node ./bin/gsts.mjs tests/manual/client-control-flow/${mode}.ts --noinject`
  )
  if (!documents) return

  const controlFlow = documents.find((document) => document.graph.id === config.controlFlowId)
  const status = documents.find((document) => document.graph.id === config.statusId)
  const decision = documents.find((document) => document.graph.id === config.decisionId)
  const ternary = documents.find((document) => document.graph.id === config.ternaryId)
  assert.ok(controlFlow && status && decision && ternary, 'missing generated control-flow graph')

  const finiteLoopCount = controlFlow.nodes.filter((node) => node.type === 'finite_loop').length
  const falseWritesByVariable = new Map()
  for (const node of controlFlow.nodes) {
    if (
      node.type !== 'set_local_variable' ||
      node.args?.[0]?.type !== 'str' ||
      node.args?.[1]?.type !== 'bool' ||
      node.args[1].value !== false
    ) {
      continue
    }
    const name = node.args[0].value
    falseWritesByVariable.set(name, (falseWritesByVariable.get(name) ?? 0) + 1)
  }
  const [returnGateName, returnGateResetCount] = [...falseWritesByVariable].sort(
    (left, right) => right[1] - left[1]
  )[0] ?? ['<missing>', 0]
  const returnGateTrueWrites = controlFlow.nodes.filter(
    (node) =>
      node.type === 'set_local_variable' &&
      node.args?.[0]?.type === 'str' &&
      node.args[0].value === returnGateName &&
      node.args?.[1]?.type === 'bool' &&
      node.args[1].value === true
  ).length

  const ternaryTypes = new Set(ternary.nodes.map((node) => node.type))
  const requiredTernaryTypes = [
    'equal',
    'division',
    'logical_not_operation',
    'data_type_conversion_int',
    'multiplication',
    'addition',
    'node_graph_end_integer'
  ]
  const missingTernaryTypes = requiredTernaryTypes.filter((type) => !ternaryTypes.has(type))
  const statusEntry = status.nodes.find((node) => node.type === 'node_graph_begins')
  const statusEntryIndexes = (statusEntry?.next ?? [])
    .map((next) => (typeof next === 'number' ? 0 : (next.source_index ?? 0)))
    .sort((left, right) => left - right)
  const statusTypes = new Set(status.nodes.map((node) => node.type))
  const decisionSwitchIndexes = decision.nodes
    .filter((node) => node.type === 'switch_to_self_execution_status')
    .map((node) => Number(node.args?.[2]?.value))
    .sort((left, right) => left - right)

  assert.equal(returnGateResetCount, finiteLoopCount)
  assert.ok(returnGateTrueWrites >= 1)
  assert.deepEqual(missingTernaryTypes, [])
  assert.deepEqual(statusEntryIndexes, [0, 1])
  assert.ok(statusTypes.has('execute_skill'))
  assert.ok(statusTypes.has('tactic_move_to_the_target_entity'))
  assert.ok(statusTypes.has('continue_executing_previous_frame_behavior'))
  assert.deepEqual(decisionSwitchIndexes, [1, 2])

  console.log('\n===== 生成 IR 结构检查 =====')
  console.log(`finite_loop 数量：${finiteLoopCount}`)
  console.log(`共享 return gate：${returnGateName}`)
  console.log(`return gate 的 false 重置次数：${returnGateResetCount}`)
  console.log(`嵌套 return 写入 true 次数：${returnGateTrueWrites}`)
  console.log('每个 finite_loop 恰好对应一次 return-gate 重置：PASS')
  console.log('三元表达式 true/false 两侧节点同时存在：PASS')
  console.log(`状态入口 source_index：${statusEntryIndexes.join(', ')}（对应 start1/start2）`)
  console.log(`决策切换参数：${decisionSwitchIndexes.join(', ')}（对应 start1/start2）`)
}

export function simulateFeatures(mode) {
  const config = FEATURE_CONFIG[mode]
  if (!config) throw new Error(`unknown feature mode: ${mode}`)

  console.log(`\n########## features/${mode}.ts 本地模拟 ##########`)
  const reports = mode === 'beyond' ? buildBeyondFeatureReports() : buildClassicFeatureReports()
  printReports(`${mode}：gsts_feature_log 的服务器四行日志`, reports, false)

  const featureProbe =
    mode === 'beyond' ? [18n, 'client', true, 1n] : [3n, 'classic-client', true, 1n]
  console.log('\n===== feature_probe 的服务器四行日志 =====')
  console.log(asText(featureProbe[0]))
  console.log(asText(featureProbe[1]))
  console.log(asText(featureProbe[2]))
  console.log(asText(featureProbe[3]))
  console.log('说明：依次为 amount、message、enabled、targets.length。')

  printFeatureServerModel(mode)
  printFilterTable(config)
  printFeatureStateTable()
  inspectFeatureGraphs(mode, config)
}

function buildBeyondFeatureReports() {
  const increment = (value) => value + 1n
  const double = (value) => value * 2n
  const fromGsts = double(increment(1n))
  const directValue = (fromGsts + 2n) * 3n
  const values = [directValue, 2n, 3n, 4n]
  const firstValue = values[0]
  const secondValue = values[1]
  const convertedInt = BigInt(Number(secondValue))
  const numberValue = Number(convertedInt)
  const stringValue = String(convertedInt)
  const booleanValue = Boolean(convertedInt)
  const lookup = new Map([[1n, firstValue]])
  const prefabLookup = new Map([[30001n, secondValue]])
  const factionLookup = new Map([[1n, firstValue]])
  const floorToInt = Math.floor(-1.25)
  const ceilToInt = Math.ceil(1.25)
  const trigonometric = Math.sin(0.5) + Math.cos(0.5) + Math.tan(0.5)
  const target = [0, 1 / Math.sqrt(2), 1 / Math.sqrt(2)]
  const targetMagnitude = Math.hypot(...target)
  const zeroPositionVectorResult = Math.hypot(1, 2, 3) + targetMagnitude

  return [
    {
      check: 'character-skill-math-max',
      actual: Math.max(1, 2).toFixed(1),
      expected: '2.0',
      detail: 'Math.max 返回 float；游戏将 float 2 显示为字符串 2.0。'
    },
    {
      check: 'character-skill-arithmetic',
      actual: firstValue + 7n,
      expected: '25',
      detail: '辅助函数得到 4，directValue 为 18；18 + raw(7) = 25。'
    },
    {
      check: 'character-skill-wrapper-number',
      actual: numberValue.toFixed(1),
      expected: '2.0',
      detail: 'Number(int(float(2))) 返回 float；游戏字符串为 2.0。'
    },
    {
      check: 'character-skill-wrapper-string-native',
      actual: stringValue,
      expected: '2',
      detail: 'String(2n) 的节点图转换结果。'
    },
    {
      check: 'character-skill-wrapper-bool',
      actual: Number(booleanValue),
      expected: '1',
      detail: 'Boolean(2) 为 true，再转 int 得 1。'
    },
    {
      check: 'character-skill-wrapper-string',
      actual: `${String(booleanValue)}（本地 JS 模型）`,
      expected: '<observe>',
      detail: '动态 bool → str 的游戏格式需观察，通常应显示 true。'
    },
    {
      check: 'character-skill-dictionary-size',
      actual: [...lookup.keys()].length + [...lookup.values()].length + lookup.size,
      expected: '3',
      detail: 'keys.length + values.length + size = 1 + 1 + 1。'
    },
    {
      check: 'character-skill-dictionary-has',
      actual: Number(lookup.has(1n)),
      expected: '1',
      detail: '字典包含键 1。'
    },
    {
      check: 'character-skill-rounding',
      actual: floorToInt + ceilToInt,
      expected: '0',
      detail: 'floor(-1.25) + ceil(1.25) = -2 + 2 = 0。'
    },
    {
      check: 'character-skill-trigonometric',
      actual: trigonometric,
      expected: '<observe>',
      detail: '本地约为 1.903310660；游戏 float 精度可能略有差异。'
    },
    {
      check: 'character-skill-scene-int-values',
      actual: `<feature_score> + ${lookup.get(1n) + prefabLookup.get(30001n) + factionLookup.get(1n)}`,
      expected: '<observe>',
      detail: '后三项固定为 18 + 2 + 18 = 38；feature_score 取决于场景实体。'
    },
    {
      check: 'character-skill-scene-faction',
      actual: '<目标实体当前阵营>',
      expected: '<observe>',
      detail: '目标 GUID 10001 对应实体的阵营依赖地图。'
    },
    {
      check: 'character-skill-scene-vector-values',
      actual: zeroPositionVectorResult.toFixed(2),
      expected: '<observe>',
      detail: '本次实测为 4.74，对应目标实体和 GameObject 查询实体的位置均为零。'
    },
    {
      check: 'character-control-helper',
      actual: increment(double(1n)),
      expected: '3',
      detail: '角色操控辅助函数：double(1) 后 increment，得到 3。'
    },
    {
      check: 'creation-skill-helper',
      actual: increment(double(1n)),
      expected: '3',
      detail: '造物技能辅助函数：double(1) 后 increment，得到 3。'
    }
  ]
}

function buildClassicFeatureReports() {
  const deterministicHelper = 1n * 2n + 1n
  return [
    {
      check: 'creation-skill-helper',
      actual: deterministicHelper,
      expected: '3',
      detail: '经典造物技能辅助函数：double(1) 后 increment，得到 3。'
    },
    {
      check: 'creation-skill-classic-character-id',
      actual: '<经典模式角色编号>',
      expected: '<observe>',
      detail: '由当前造物关联的经典角色决定，只验证经典专属节点能够读取。'
    }
  ]
}

function printFeatureServerModel(mode) {
  console.log('\n===== 服务器图本地模型与场景观察项 =====')
  if (mode === 'classic') {
    console.log('实体创建：读取前台角色，增加 5 点元素能量，再设置为 25。')
    console.log('实体创建日志：打印前台角色的 classicModeId（场景依赖）。')
    console.log('前台角色切换事件：打印 active character changed。')
    return
  }

  const values = [1n, 2n, 3n]
  values.push(4n)
  const filtered = values.filter((value) => value > 1n)
  const mapped = values.map((value) => value + 10n)
  let total = 0n
  for (let index = 0; index < 6; index += 1) {
    if (index % 2 === 0) {
      total += BigInt(index)
      continue
    }
    if (index === 5) break
    total += 10n
  }
  let mutableLiteral = 1n
  for (let remaining = 3n; remaining > 0n; remaining -= 1n) mutableLiteral += 1n
  total += (2n + 3n) * 4n

  console.log('首次实体创建：score 0 → 1，title → created，feature_score → 1。')
  console.log(
    `push 后列表：${values.join(', ')}；filter 长度=${filtered.length}；map 长度=${mapped.length}。`
  )
  console.log(`控制流 total=${total}；mutableLiteral=${mutableLiteral}。`)
  console.log('Math.max(abs(-3.5), sqrt(16)) = 4；RoundToInt = 4。')
  console.log('Normalize(forward + up) 的模长、到 zero 的距离均为 1。')
  console.log('gstsServerDouble(5) 的内部和外部日志都应打印 10。')
  console.log('interval 应打印 1、2、3 后自行清理；500ms timeout 打印 captured timeout value。')
  console.log('GUID、玩家昵称、预设查询数量、随机索引等输出依赖实际地图，逐项观察即可。')
}

function printFilterTable(config) {
  console.log('\n===== bool/int filter：全部随机输入结果 =====')
  console.log(
    `bool evaluationInterval=${config.boolInterval}；int evaluationInterval=${config.intInterval}`
  )
  console.log('roll | bool: !!((roll + 1) > 2) | int: increment(double(roll)) - 1')
  for (let roll = 1n; roll <= 10n; roll += 1n) {
    const boolResult = !!(roll + 1n > 2n)
    const intResult = roll * 2n + 1n - 1n
    console.log(`${roll.toString().padStart(4)} | ${String(boolResult).padEnd(5)} | ${intResult}`)
  }
  console.log('bool：roll=1 时 false；roll=2…10 时 true。')
  console.log('int：依次返回 2、4、6、8、10、12、14、16、18、20。')
}

function printFeatureStateTable() {
  console.log('\n===== 造物状态与决策行为表 =====')
  console.log('未处于战斗：决策图不切换状态。')
  console.log('战斗中且水平距离 < 1.5：自主逻辑参数 1 → start1 → 执行技能序号 1。')
  console.log('战斗中且水平距离 >= 1.5：自主逻辑参数 2 → start2 → 移动到目标。')
  console.log('前一行为成功或持续执行：不会执行下一条顺序语句。')
  console.log('前一行为失败：才沿【失败执行】执行最后的“继续执行前一帧行为”。')
}

function inspectFeatureGraphs(mode, config) {
  const documents = readGeneratedJson(
    `dist/tests/manual/features/${mode}.json`,
    `node ./bin/gsts.mjs tests/manual/features/${mode}.ts --noinject`
  )
  if (!documents) return

  for (const [id, subType] of config.graphs) {
    const document = documents.find((candidate) => candidate.graph.id === id)
    assert.ok(document, `${mode}: missing graph id=${id}`)
    assert.equal(document.graph.mode, mode)
    if (subType !== 'server') assert.equal(document.graph.sub_type, subType)
  }
  for (const id of config.signalGraphIds) {
    const document = documents.find((candidate) => candidate.graph.id === id)
    assert.ok(document.nodes.some((node) => node.type === 'send_signal_to_server_node_graph'))
  }

  const status = documents.find((document) => document.graph.id === config.statusId)
  const decision = documents.find((document) => document.graph.id === config.decisionId)
  const boolFilter = documents.find((document) => document.graph.id === config.boolFilterId)
  const intFilter = documents.find((document) => document.graph.id === config.intFilterId)
  const statusEntry = status.nodes.find((node) => node.type === 'node_graph_begins')
  const statusEntryIndexes = (statusEntry?.next ?? [])
    .map((next) => (typeof next === 'number' ? 0 : (next.source_index ?? 0)))
    .sort((left, right) => left - right)
  const statusTypes = new Set(status.nodes.map((node) => node.type))
  const decisionSwitchIndexes = decision.nodes
    .filter((node) => node.type === 'switch_to_self_execution_status')
    .map((node) => Number(node.args?.[2]?.value))
    .sort((left, right) => left - right)

  assert.deepEqual(statusEntryIndexes, [0, 1])
  assert.ok(statusTypes.has('execute_skill'))
  assert.ok(statusTypes.has('tactic_move_to_the_target_entity'))
  assert.ok(statusTypes.has('continue_executing_previous_frame_behavior'))
  assert.deepEqual(decisionSwitchIndexes, [1, 2])
  assert.ok(boolFilter.nodes.some((node) => node.type === 'node_graph_end_boolean'))
  assert.ok(intFilter.nodes.some((node) => node.type === 'node_graph_end_integer'))
  assert.equal(boolFilter.graph.evaluation_interval ?? 0.3, config.boolInterval)
  assert.equal(intFilter.graph.evaluation_interval ?? 0.3, config.intInterval)

  console.log('\n===== 生成 IR 结构检查 =====')
  console.log(`图数量：${config.graphs.length}`)
  console.log(`客户端信号发送图数量：${config.signalGraphIds.length}`)
  console.log(`状态入口 source_index：${statusEntryIndexes.join(', ')}`)
  console.log(`决策切换参数：${decisionSwitchIndexes.join(', ')}`)
  console.log('攻击、追击、失败兜底节点：PASS')
  console.log('bool/int filter 结束节点：PASS')
  console.log('图 ID、模式、子类型、信号节点：PASS')
}
