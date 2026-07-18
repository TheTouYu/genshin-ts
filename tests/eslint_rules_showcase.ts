import { g } from 'genshin-ts/runtime/core'

/**
 * GSTS ESLint 单文件演示：水晶核心守卫战。
 *
 * 使用方式：
 * 1. 直接在编辑器中打开本文件。
 * 2. `✅ 正例`不应触发该节标注的 gsts 规则。
 * 3. `❌ 反例`是故意保留的活代码，应在下一行看到对应规则的波浪线。
 * 4. 顺序严格对应 `src/eslint/index.ts` 中 `configs.recommended.rules` 的 46 条规则。
 *
 * 本文件只用于观察 ESLint，故意不能通过 lint。运行开关保持 false，常规 GSTS
 * 编译/测试即使加载本模块，也不会注册或执行这些带反例的节点图。
 */
const RUN_ESLINT_SHOWCASE = false

function gstsServerRules01To05() {
  const coreQueue = list('int', [10n, 20n, 30n])

  // 01. gsts/no-undefined-array-return
  // ✅ 正例：节点图没有 undefined，显式断言弹出的末项一定存在。
  const _safeLastCore = coreQueue.pop()!
  // ❌ 反例：pop()/shift()/find()/at() 的返回值可能含 undefined。
  const _unsafeLastCore = coreQueue.pop()

  // 02. gsts/no-object-static
  // ✅ 正例：节点图键值数据用 dict() 表达。
  const _waveState = dict([{ k: 'wave', v: 1n }])
  // ❌ 反例：编译器不处理节点图作用域中的 Object.*。
  const _unsupportedKeys = Object.keys({ wave: 1n })

  // 03. gsts/no-plain-object
  // ✅ 正例：空字典也显式给出键和值类型。
  const _typedEmptyState = dict('str', 'int', 0)
  // ❌ 反例：裸空对象不会生成节点图字典语义。
  const _plainEmptyState = {}

  // 04. gsts/require-boolean-condition
  const coreThreat = 3n
  // ✅ 正例：! 的操作数是布尔值。
  const _coreIsSafe = !(coreThreat > 0n)
  // ❌ 反例：bigint 不能直接作为节点图布尔操作数。
  const _invalidThreatNegation = !coreThreat

  // 05. gsts/no-timer-in-loop
  // ✅ 正例：只创建一个定时器。
  setTimeout(() => {
    gsts.f.printString('single reinforcement timer')
  }, 500)
  // ❌ 反例：循环的每一轮都会创建一个节点图定时器。
  for (let reinforcement = 0n; reinforcement < 2n; reinforcement++) {
    setTimeout(() => {
      gsts.f.printString('duplicated reinforcement timer')
    }, 500)
  }
}

// 06. gsts/no-graph-function-recursion
// ✅ 正例：服务器和客户端辅助函数都可以进行非递归调用。
function gstsServerClampThreat(value: bigint) {
  return value > 10n ? 10n : value
}

// ❌ 反例：客户端辅助函数同样禁止直接或间接递归。
function gstsCreationSkillRecursiveWave(value: bigint): bigint {
  return gstsCreationSkillRecursiveWave(value)
}

function gstsServerRules07To11() {
  // 07. gsts/no-promise
  // ✅ 正例：延迟节点图逻辑使用定时器。
  setTimeout(() => {
    gsts.f.printString('reward settled')
  }, 800)
  // ❌ 反例：节点图编译器不支持 Promise。
  const _unsupportedRewardPromise = Promise.resolve(100n)

  // 08. gsts/no-json
  // ✅ 正例：需要键值数据时使用节点图字典。
  const _rewardPacket = dict([{ k: 'score', v: 100n }])
  // ❌ 反例：节点图编译器不支持 JSON API。
  const _unsupportedRewardJson = JSON.stringify({ score: 100n })

  // 09. gsts/no-string-ops
  // ✅ 正例：数值转显示文本使用 str()。
  const _scoreText = str(100n)
  // ❌ 反例：节点图不支持字符串拼接。
  const _unsupportedWaveLabel = 'wave-' + str(2n)

  // 10. gsts/no-while-true
  // ✅ 正例：循环有明确的数据退出条件。
  let remainingCores = 2n
  while (remainingCores > 0n) {
    remainingCores -= 1n
  }
  // ❌ 反例：while (true) 只能被展开为有限循环，意图不明确。
  while (true) {
    break
  }

  // 11. gsts/prefer-bigint
  // ✅ 正例：整数取模两端都使用 bigint。
  const _validLane = 5n % 2n
  // ❌ 反例：number 会被视为 float，不能参与整数位运算/取模。
  const _invalidLane = 5 % 2
}

// 12. gsts/graph-function-top-level
// ✅ 正例：上面的服务器和客户端辅助函数都在模块顶层声明。
function _createNestedGraphFunctionProbe() {
  // ❌ 反例：客户端辅助函数也不能嵌套声明。
  const gstsCreationSkillNestedDamage = () => 1n
  return gstsCreationSkillNestedDamage
}

const _nestedGraphFunctionProbe = _createNestedGraphFunctionProbe()

// 13. gsts/graph-function-parameters
// ✅ 正例：服务器辅助函数参数是唯一的普通标识符。
function gstsServerValidParams(value: bigint) {
  return value
}

// ❌ 反例：客户端辅助函数参数同样不支持默认值。
function gstsCreationSkillInvalidParams(value = 1n) {
  return value
}

// 14. gsts/graph-function-return
// ✅ 正例：服务器辅助函数只有末尾存在一个带值 return。
function gstsServerValidReturn(ready: boolean) {
  const result = ready ? 1n : 0n
  return result
}

// ❌ 反例：客户端辅助函数的分支内部同样不能提前 return。
function gstsCreationSkillInvalidReturn(ready: boolean) {
  if (ready) return 1n
  return 0n
}

// 15. gsts/graph-function-call-scope
function gstsServerValidCallScope() {
  // ✅ 正例：服务器辅助函数在服务器作用域中调用。
  const score = gstsServerValidParams(1n)
  gsts.f.printString(str(score))
}

function gstsCreationSkillSharedScore(value: bigint) {
  return value
}

// ✅ 正例：客户端辅助函数可以在相同图族中调用。
function gstsCreationSkillValidCallScope() {
  return gstsCreationSkillSharedScore(1n)
}

// ❌ 反例：角色技能辅助函数不能调用造物技能图族的辅助函数。
function gstsCharacterSkillInvalidCallScope() {
  return gstsCreationSkillSharedScore(1n)
}

const _clientHelperRuleProbes = [
  gstsCreationSkillRecursiveWave,
  gstsCreationSkillInvalidParams,
  gstsCreationSkillInvalidReturn,
  gstsCreationSkillValidCallScope,
  gstsCharacterSkillInvalidCallScope
]

if (RUN_ESLINT_SHOWCASE) {
  // 16. gsts/no-gsts-f-outside-server
  // ✅ 正例见 gstsServerValidCallScope() 中的 gsts.f。
  // ⚪ 配置验证：这本应是反例，但根配置明确将该规则设为 off，因此此行不应有该规则波浪线。
  gsts.f.printString('rule is intentionally disabled in eslint.config.mjs')

  // 17. gsts/prefer-const-outside-server
  // ✅ 正例：节点图外不再赋值的变量使用 const。
  const _fixedDifficulty = 1n
  // ❌ 反例：节点图外从未重新赋值的 let 应改为 const。
  let _unchangedDifficulty = 1n
}

function gstsServerRules18To21() {
  const gateOpen = gsts.f.equal(1n, 1n)

  // 18. gsts/no-unsupported-statement
  // ✅ 正例：节点图支持普通 if 分支。
  if (gateOpen) {
    gsts.f.printString('gate opened')
  }
  // ❌ 反例：try/catch 不属于受支持的节点图语句。
  try {
    gsts.f.printString('attempt core repair')
  } catch {
    gsts.f.printString('repair failed')
  }

  // 19. gsts/no-inner-declarations
  // ✅ 正例：可复用函数应像 gstsServerClampThreat 一样放在顶层。
  // ❌ 反例：节点图回调/函数内部不能声明函数或类。
  class LocalBonusResolver {
    readonly value = 1n
  }
  const _localBonus = new LocalBonusResolver().value

  // 20. gsts/switch-restrictions
  // ✅ 正例：控制值为 int，case 为同类字面量，且没有 fallthrough。
  const phase = 1n
  switch (phase) {
    case 1n:
      gsts.f.printString('defend')
      break
    default:
      gsts.f.printString('settle')
      break
  }
  // ❌ 反例：switch 控制表达式只能是 int 或 str，不能是 bool。
  switch (gateOpen) {
    case true:
      gsts.f.printString('unsupported boolean switch')
      break
    default:
      break
  }

  // 21. gsts/for-structure
  // ✅ 正例：循环变量递增 1，测试为 loop < upperBound。
  for (let wave = 0n; wave < 2n; wave++) {
    gsts.f.printString(str(wave))
  }
  // ❌ 反例：节点图有限循环不支持每轮递增 2。
  for (let skippedWave = 0n; skippedWave < 4n; skippedWave += 2n) {
    gsts.f.printString(str(skippedWave))
  }
}

// 22. gsts/gsts-function-prefix
// ✅ 正例：服务器函数使用 gstsServer 前缀；客户端前缀示例见后面的七类客户端图。
// ❌ 反例：以 gsts 开头，却不属于任何已知图类型前缀。
function gstsMysteryDamage(value: bigint) {
  return value
}

const _unknownPrefixProbe = gstsMysteryDamage

function gstsServerRules23To39(maybeThreat: bigint | null) {
  // 23. gsts/no-nullish-coalesce
  // ✅ 正例：用显式条件表达缺省值。
  const _explicitThreat = maybeThreat === null ? 0n : maybeThreat
  // ❌ 反例：节点图不支持 ??。
  const _coalescedThreat = maybeThreat ?? 0n

  // 24. gsts/assignment-restrictions
  let threat = maybeThreat === null ? 0n : maybeThreat
  // ✅ 正例：赋值是独立语句，左侧是标识符。
  threat += 1n
  // ❌ 反例：赋值表达式嵌在变量初始化中。
  const _nestedThreatAssignment = (threat += 1n)

  // 25. gsts/require-bigint-index-wrapper
  const laneThreats = list('int', [2n, 4n, 6n])
  const dynamicLane = gsts.f.getRandomInteger(0n, 2n)
  // ✅ 正例：idx() 只帮助 TypeScript 接受 bigint 下标，不改变运行时值。
  const _safeLaneThreat = laneThreats[idx(dynamicLane)]
  // ❌ 反例：bigint 直接作为列表下标；此规则支持编辑器自动修复。
  // @ts-expect-error -- ESLint 反例故意省略 idx()。
  void laneThreats[dynamicLane]

  // 26. gsts/unsupported-binary-operator
  // ✅ 正例：直接比较所需属性。
  const _coreExists = gsts.f.equal(1n, 1n)
  // ❌ 反例：节点图不支持 in/instanceof。
  const _unsupportedMembership = 'core' in { core: true }

  // 27. gsts/ternary-branch-type
  const coreEnabled = gsts.f.equal(1n, 1n)
  // ✅ 正例：两个分支都是 bigint/int。
  const _enabledThreat = coreEnabled ? 1n : 0n
  // ❌ 反例：两个分支分别是 bigint/int 与 number/float。
  const _mixedThreat = coreEnabled ? 1n : 0

  // 28. gsts/no-spread-array-without-type
  const unknownDrops: symbol[] = []
  // ✅ 正例：源列表具有明确的 int 元素类型。
  const _copiedLaneThreats = [...laneThreats]
  // ❌ 反例：展开 symbol[] 时无法确定节点图列表类型。
  const _unknownDropCopy = [...unknownDrops]

  // 29. gsts/list-type-annotation
  // ✅ 正例：list('int', ...) 已携带元素类型。
  const _typedThreatMap = laneThreats.map((value) => value + 1n)
  // ❌ 反例：在 symbol[] 上调用列表方法时无法推断元素类型。
  const _unknownThreatMap = unknownDrops.map((value) => value)

  // 30. gsts/list-method-usage
  // ✅ 正例：slice() 是受支持的方法，参数数量也正确。
  const _firstTwoLanes = laneThreats.slice(0, 2)
  // ❌ 反例：reverse() 没有对应的节点图列表语义。
  const _reversedLanes = laneThreats.reverse()

  // 31. gsts/list-callback-signature
  // ✅ 正例：回调内联，map() 恰好接收一个回调参数。
  const _inlineMappedThreats = laneThreats.map((value) => value * 2n)
  const doubleThreat = (value: bigint) => value * 2n
  // ❌ 反例：列表回调必须直接内联，不能传函数变量。
  const _detachedMappedThreats = laneThreats.map(doubleThreat)

  // 32. gsts/list-callback-return
  // ✅ 正例：filter() 使用单表达式返回。
  const _strongLanes = laneThreats.filter((value) => value > 2n)
  // ❌ 反例：非 forEach 回调块必须且只能包含一个带值 return。
  const _verboseStrongLanes = laneThreats.filter((value) => {
    const keep = value > 2n
    bool(keep)
  })

  // 33. gsts/list-method-type-constraints
  // ✅ 正例：int 列表支持 forEach()。
  laneThreats.forEach((value) => {
    gsts.f.printString(str(value))
  })
  const nearbyEnemies = list('entity', [entity(0)])
  // ✅ 正例：实体等其余列表类型同样支持 forEach()。
  nearbyEnemies.forEach((enemy) => {
    gsts.f.printString(str(enemy))
  })
  // ❌ 反例：find()/pop()/shift() 需要为空列表构造默认返回值，目前仅支持上述五类。
  const _missingEnemy = nearbyEnemies.find((_enemy) => false)!

  // 34. gsts/timer-callback-signature
  // ✅ 正例：定时器回调直接内联。
  setTimeout(() => {
    gsts.f.printString('shield refreshed')
  }, 300)
  const detachedTimer = () => {
    gsts.f.printString('detached timer')
  }
  // ❌ 反例：定时器回调不能通过变量间接传入。
  setTimeout(detachedTimer, 300)

  // 35. gsts/timer-interval-frequency
  // ✅ 正例：1 秒刷新一次 HUD。
  const _safeHudTimer = setInterval(() => {
    gsts.f.printString('hud tick')
  }, 1000)
  // ❌ 反例：50ms 小于等于默认 100ms 阈值，频率过高。
  const _hotHudTimer = setInterval(() => {
    gsts.f.printString('hot hud tick')
  }, 50)

  // 36. gsts/timer-outer-capture
  const outerSeed = gsts.f.getRandomInteger(1n, 9n)
  setTimeout(() => {
    // ✅ 正例：innerSeed 位于内层定时器的直接父级，可捕获一层。
    const innerSeed = outerSeed
    setTimeout(() => {
      gsts.f.printString(str(innerSeed))
      // ❌ 反例：outerSeed 跨过了两层定时器回调。
      gsts.f.printString(str(outerSeed))
    }, 400)
  }, 400)

  // 37. gsts/builtin-math-support
  // ✅ 正例：Math.sqrt() 有节点图实现且参数数量/类型正确。
  const _coreRadius = Math.sqrt(16)
  // ❌ 反例：Math.imul() 不在受支持方法表中。
  const _unsupportedMultiply = Math.imul(2, 3)

  // 38. gsts/builtin-console-log-arity
  // ✅ 正例：console.log() 只传一个参数。
  console.log('core defended')
  // ❌ 反例：节点图日志节点只接受一个参数。
  console.log('wave', 2n)

  // 39. gsts/builtin-wrapper-arity
  // ✅ 正例：所有包装/转换函数都只传一个参数。
  const _convertedThreat = int(2)
  // ❌ 反例：int() 缺少唯一参数。
  // @ts-expect-error -- ESLint 反例故意使用错误参数数量。
  const _missingWrapperArgument = int()
}

if (RUN_ESLINT_SHOWCASE) {
  // 40. gsts/client-filter-return
  // ✅ 正例：bool filter 的所有路径都返回 boolean。
  g.boolFilter({ id: 1082130601, name: 'CoreTargetFilter' }).on('start', (_evt, f) =>
    f.equal(1n, 1n)
  )
  // ❌ 反例：int filter 返回了 boolean。
  // @ts-expect-error -- ESLint 反例故意返回错误的过滤器类型。
  g.intFilter({ id: 1082130602, name: 'CoreThreatFilter' }).on('start', (_evt, _f) => false)

  // 41. gsts/client-graph-scoped-f
  g.characterSkill({ id: 1082130603, name: 'CrystalStrike' }).on('start', (_evt, f) => {
    // ✅ 正例：角色技能图使用自己的 fCharacterSkill 命名空间。
    const _scopedDamage = gsts.fCharacterSkill.absoluteValueOperation(f.addition(1n, 1n))
    // ❌ 反例：角色技能图不能使用 bool filter 的 f 命名空间。
    const _wrongNamespaceDamage = gsts.fBoolFilter.absoluteValueOperation(-1n)
  })

  // 42. gsts/client-literal-arguments
  g.characterControlSkill({ id: 1082130604, name: 'CrystalAim' }).on('start', (_evt, f) => {
    // ✅ 正例：无连接引脚的图名参数直接写成源码字面量。
    f.notifyServerNodeGraph('CrystalDefenseServer', '', '')
    const dynamicGraphName = str(f.addition(1n, 2n))
    // ❌ 反例：运行时连线值不能接到仅接受字面量的图名参数。
    f.notifyServerNodeGraph(dynamicGraphName, '', '')
  })

  // 43. gsts/client-local-variable-support
  g.creationStatusDecision({ id: 1082130605, name: 'GuardianDecision' }).on('start1', (_evt, f) => {
    // ✅ 正例：数值三元表达式可以直接由数据节点表达。
    const _numericState = f.equal(1n, 1n) ? 1n : 0n
    // ❌ 反例：该图没有局部变量节点，字符串三元表达式需要临时变量。
    const stateName = f.equal(2n, 2n) ? 'attack' : 'patrol'
    f.equal(stateName, 'attack')
  })

  // 44. gsts/client-repeated-evaluation
  g.creationStatus({ id: 1082130606, name: 'GuardianAttackStatus' }).on('start1', (_evt, f) => {
    // ✅ 正例：非纯节点结果只读取一次。
    const singleRoll = f.getRandomNumber(1n, 10n)
    f.absoluteValueOperation(singleRoll)
    // ❌ 反例：该图不支持局部变量；ready 的两个读取点会分别重新求值。
    const ready = f.equal(1n, 1n)
    if (ready) f.absoluteValueOperation(-1n)
    if (ready) f.absoluteValueOperation(-2n)
  })

  // 45. gsts/client-scoped-globals
  g.creationSkill({ id: 1082130607, name: 'GuardianPulse' }).on('start', (_evt, _f) => {
    // ✅ 正例：造物技能图支持 Mathf.FloorToInt。
    const _floorDamage = Mathf.FloorToInt(-1.5)
    // ❌ 反例 A：服务器定时器全局函数不能泄漏到客户端图。
    setTimeout(() => {
      bool(1n)
    }, 100)
    // ❌ 反例 B：print 是服务器全局辅助函数，客户端图必须使用自身可用的输出节点。
    print('client graph cannot use print')
    // ❌ 反例 C：console.log 同样只能由服务器图编译为 print。
    console.log('client graph cannot use console.log')
  })

  // 46. gsts/client-syntax-capabilities
  g.creationStatus({ id: 1082130608, name: 'GuardianPatrolStatus' }).on('start1', (_evt, _f) => {
    const patrolPoints = list('int', [1n, 2n])
    // ✅ 正例：简单相等 some() 可降级为“列表是否包含值”节点。
    const _hasCorePoint = patrolPoints.some((value) => value === 2n)
    // ❌ 反例：creation status 缺少列表迭代循环节点，不能使用 forEach()。
    patrolPoints.forEach((value) => {
      bool(value)
    })
  })

  /**
   * 客户端共享规则镜像。
   *
   * 这里按原规则编号再次演示所有会进入客户端 handler 的通用规则。定时器规则
   * 05/34~36 仅属于服务器；辅助函数规则 06/12~15/22 已在顶层用客户端前缀演示；
   * gsts 命名空间与 console 则由客户端专用规则 41/45 给出更准确的错误。
   */
  g.characterSkill({ id: 1082130609, name: 'ClientSharedRuleMirror' }).on('start', (_evt, f) => {
    const clientLaneThreats = list('int', [2n, 4n, 6n])

    // C01. gsts/no-undefined-array-return
    // ✅ 客户端正例：显式断言 find() 一定命中。
    const _clientSafeFind = clientLaneThreats.find((value) => value > 0n)!
    // ❌ 客户端反例：节点图没有 undefined，不能直接保留 find() 的联合返回值。
    const _clientUnsafeFind = clientLaneThreats.find((value) => value > 0n)

    // C02. gsts/no-object-static
    // ✅ 客户端正例：键值数据使用 dict()。
    const _clientWaveState = dict([{ k: 'wave', v: 1n }])
    // ❌ 客户端反例：Object.* 同样不能编译为客户端节点。
    const _clientUnsupportedKeys = Object.keys({ wave: 1n })

    // C03. gsts/no-plain-object
    // ✅ 客户端正例：空字典显式声明键和值类型。
    const _clientTypedEmptyState = dict('str', 'int', 0)
    // ❌ 客户端反例：裸对象没有客户端节点图字典语义。
    const _clientPlainEmptyState = {}

    // C04. gsts/require-boolean-condition
    const clientThreat = 3n
    // ✅ 客户端正例：! 的操作数是 boolean。
    const _clientSafeNegation = !(clientThreat > 0n)
    // ❌ 客户端反例：bigint 不能直接作为布尔条件。
    const _clientInvalidNegation = !clientThreat

    // C07. gsts/no-promise
    // ✅ 客户端正例：同步读取节点结果，不创建 Promise。
    const _clientImmediateReward = f.absoluteValueOperation(100n)
    // ❌ 客户端反例：Promise 不属于客户端节点图语义。
    const _clientUnsupportedPromise = Promise.resolve(100n)

    // C08. gsts/no-json
    // ✅ 客户端正例：结构化数据继续使用 dict()。
    const _clientRewardPacket = dict([{ k: 'score', v: 100n }])
    // ❌ 客户端反例：JSON API 在客户端图中同样不可用。
    const _clientUnsupportedJson = JSON.stringify({ score: 100n })

    // C09. gsts/no-string-ops
    // ✅ 客户端正例：使用 str() 转换显示文本。
    const _clientScoreText = str(100n)
    // ❌ 客户端反例：客户端节点图也不支持字符串拼接。
    const _clientUnsupportedLabel = 'wave-' + str(2n)

    // C10. gsts/no-while-true
    // ✅ 客户端正例：循环有明确的数据退出条件。
    let clientRemainingCores = 2n
    while (clientRemainingCores > 0n) {
      clientRemainingCores -= 1n
    }
    // ❌ 客户端反例：while (true) 仍然会被拒绝。
    while (true) {
      break
    }

    // C11. gsts/prefer-bigint
    // ✅ 客户端正例：整数取模使用 bigint。
    const _clientValidLane = 5n % 2n
    // ❌ 客户端反例：number 会被视为 float。
    const _clientInvalidLane = 5 % 2

    // C17. gsts/prefer-const-outside-server
    // ✅ 客户端正例：不再赋值的局部值使用 const。
    const _clientFixedDifficulty = 1n
    // ❌ 客户端反例：客户端不属于服务器作用域，未重赋值的 let 应改为 const。
    let _clientUnchangedDifficulty = 1n

    // C18. gsts/no-unsupported-statement
    // ✅ 客户端正例：普通 if 分支受支持。
    if (f.equal(1n, 1n)) f.absoluteValueOperation(-1n)
    // ❌ 客户端反例：try/catch 不是客户端节点语句。
    try {
      f.absoluteValueOperation(-2n)
    } catch {
      f.absoluteValueOperation(-3n)
    }

    // C19. gsts/no-inner-declarations
    // ✅ 客户端正例：普通局部值直接声明。
    const _clientInlineBonus = 1n
    // ❌ 客户端反例：handler 内不能声明类或函数。
    class ClientLocalBonusResolver {
      readonly value = 1n
    }
    const _clientLocalBonus = new ClientLocalBonusResolver().value

    // C20. gsts/switch-restrictions
    // ✅ 客户端正例：int 控制值与 int case 类型一致。
    switch (1n) {
      case 1n:
        f.absoluteValueOperation(-4n)
        break
      default:
        break
    }
    // ❌ 客户端反例：bool 不能作为 switch 控制值。
    switch (f.equal(1n, 1n)) {
      case true:
        f.absoluteValueOperation(-5n)
        break
      default:
        break
    }

    // C21. gsts/for-structure
    // ✅ 客户端正例：有限循环每次递增 1。
    for (let clientWave = 0n; clientWave < 2n; clientWave++) {
      f.absoluteValueOperation(clientWave)
    }
    // ❌ 客户端反例：有限循环不支持每次递增 2。
    for (let clientSkippedWave = 0n; clientSkippedWave < 4n; clientSkippedWave += 2n) {
      f.absoluteValueOperation(clientSkippedWave)
    }

    // C23. gsts/no-nullish-coalesce
    let clientMaybeThreat: bigint | null = null
    if (f.equal(1n, 1n)) clientMaybeThreat = 1n
    // ✅ 客户端正例：显式条件表达缺省值。
    const _clientExplicitThreat = clientMaybeThreat === null ? 0n : clientMaybeThreat
    // ❌ 客户端反例：客户端节点图同样不支持 ??。
    const _clientCoalescedThreat = clientMaybeThreat ?? 0n

    // C24. gsts/assignment-restrictions
    let clientAssignedThreat = 1n
    // ✅ 客户端正例：赋值是独立语句。
    clientAssignedThreat += 1n
    // ❌ 客户端反例：赋值表达式不能嵌入初始化。
    const _clientNestedAssignment = (clientAssignedThreat += 1n)

    // C25. gsts/require-bigint-index-wrapper
    const clientDynamicLane = f.addition(0n, 1n)
    // ✅ 客户端正例：bigint 下标使用 idx() 包裹。
    const _clientSafeLane = clientLaneThreats[idx(clientDynamicLane)]
    // ❌ 客户端反例：规则名称保留 server，但默认 nodegraph 作用域也覆盖客户端。
    // @ts-expect-error -- ESLint 反例故意省略 idx()。
    void clientLaneThreats[clientDynamicLane]

    // C26. gsts/unsupported-binary-operator
    // ✅ 客户端正例：直接比较数据值。
    const _clientCoreExists = f.equal(1n, 1n)
    // ❌ 客户端反例：instanceof 没有节点语义。
    const _clientUnsupportedInstance = clientLaneThreats instanceof Array

    // C27. gsts/ternary-branch-type
    const clientCoreEnabled = f.equal(1n, 1n)
    // ✅ 客户端正例：两个分支都是 bigint/int。
    const _clientEnabledThreat = clientCoreEnabled ? 1n : 0n
    // ❌ 客户端反例：分支分别是 bigint/int 与 number/float。
    const _clientMixedThreat = clientCoreEnabled ? 1n : 0

    // C28. gsts/no-spread-array-without-type
    const clientUnknownDrops: symbol[] = []
    // ✅ 客户端正例：源列表具有明确的 int 类型。
    const _clientCopiedThreats = [...clientLaneThreats]
    // ❌ 客户端反例：symbol[] 无法映射为节点图列表类型。
    const _clientUnknownDropCopy = [...clientUnknownDrops]

    // C29. gsts/list-type-annotation
    // ✅ 客户端正例：list('int', ...) 已带有元素类型。
    const _clientHasStrongLane = clientLaneThreats.some((value) => value > 2n)
    // ❌ 客户端反例：symbol[] 的元素类型无法映射到节点图。
    const _clientUnknownThreat = clientUnknownDrops.some((_value) => true)

    // C30. gsts/list-method-usage
    // ✅ 客户端正例：includes() 是受支持的方法。
    const _clientIncludesLane = clientLaneThreats.includes(2n)
    // ❌ 客户端反例：reverse() 没有节点图列表语义。
    const _clientReversedLanes = clientLaneThreats.reverse()

    // C31. gsts/list-callback-signature
    // ✅ 客户端正例：列表回调直接内联。
    const _clientInlineSome = clientLaneThreats.some((value) => value > 2n)
    const clientPositiveThreat = (value: bigint) => value > 0n
    // ❌ 客户端反例：不能通过函数变量间接传入列表回调。
    const _clientDetachedSome = clientLaneThreats.some(clientPositiveThreat)

    // C32. gsts/list-callback-return
    // ✅ 客户端正例：some() 使用单表达式返回。
    const _clientSimpleSome = clientLaneThreats.some((value) => value > 4n)
    // ❌ 客户端反例：块回调缺少唯一的带值 return。
    const _clientVerboseSome = clientLaneThreats.some((value) => {
      const keep = value > 4n
      bool(keep)
    })

    // C33. gsts/list-method-type-constraints
    const clientNearbyEnemies = list('entity', [entity(0)])
    // ✅ 客户端正例：实体列表支持 forEach()。
    clientNearbyEnemies.forEach((enemy) => {
      str(enemy)
    })
    // ❌ 客户端反例：实体 find() 无法为空列表构造默认返回值。
    const _clientMissingEnemy = clientNearbyEnemies.find((_enemy) => false)!

    // C37. gsts/builtin-math-support
    // ✅ 客户端正例：角色技能图支持 Math.abs()。
    const _clientAbsoluteThreat = Math.abs(-4)
    // ❌ 客户端反例：服务器支持的 Math.sqrt() 在该客户端图族没有对应节点。
    const _clientUnsupportedRoot = Math.sqrt(16)

    // C39. gsts/builtin-wrapper-arity
    // ✅ 客户端正例：转换函数只接收一个参数。
    const _clientConvertedThreat = int(2)
    // ❌ 客户端反例：int() 缺少唯一参数。
    // @ts-expect-error -- ESLint 反例故意使用错误参数数量。
    const _clientMissingWrapperArgument = int()
  })

  /**
   * 真实游戏入口与全部服务器节点图类型覆盖。
   *
   * 上面的规则探针都属于同一个“水晶核心守卫战”逻辑；这里把它们接入 entity 图，
   * 并用最小事件逻辑覆盖 status/class/item。七类客户端图已在规则 40~46 中全部出现。
   */
  g.server({
    id: 1073742101,
    name: 'CrystalDefenseServer',
    type: 'entity',
    variables: {
      wave: 0n,
      coreHp: 100n,
      laneThreats: list('int', [0n, 0n, 0n])
    }
  }).on('whenEntityIsCreated', (_evt, f) => {
    const nextWave = f.get('wave') + 1n
    f.set('wave', nextWave)
    f.printString(str(gstsServerClampThreat(nextWave)))

    gstsServerRules01To05()
    gstsServerRules07To11()
    gstsServerValidCallScope()
    gstsServerRules18To21()
    gstsServerRules23To39(null)

    f.printString(str(gstsServerValidParams(1n)))
    f.printString(str(gstsServerValidReturn(true)))
  })

  g.server({
    id: 1073742102,
    name: 'CrystalCoreStatus',
    type: 'status'
  }).on('whenUnitStatusChanges', (_evt, f) => {
    f.printString('core status updated')
  })

  g.server({
    id: 1073742103,
    name: 'CrystalGuardianClass',
    type: 'class',
    mode: 'beyond'
  }).on('whenPlayerClassChanges', (_evt, f) => {
    f.printString('guardian class updated')
  })

  g.server({
    id: 1073742104,
    name: 'CrystalShardItem',
    type: 'item'
  }).on('whenItemIsAddedToInventory', (_evt, f) => {
    f.printString('crystal shard collected')
  })
}
