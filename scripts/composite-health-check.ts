// @ts-nocheck
/**
 * 编译产物体检（2026-08-14 用户最高优先级方向）：
 * 把 #12-#18 已闭合规则变成自动防线，对编译产物做四类检查：
 *
 * C1 capture 路由完整性（#17）：复合输入 capture → 子复合调用参数 =
 *    compositePins 路由；调用点物理 pin 不落盘。检查：每个 composite call
 *    的 InParam 必须有 conns 或 compositePins 路由或字面量值；compositePins
 *    路由目标节点必须存在。
 * C2 字面量参数值（#18 + 编辑器保存副作用）：get_node_graph_variable 变量名
 *    必须字面量 str；编辑器保存会清空调用点字面量参数（固定参数变 0）。
 *    检查：graph var 节点变量名 pin 有字面量值；调用点参数值非空。
 * C3 flow pin exec 链（#12/#13/#15）：exec 节点 OutFlow connects 目标存在；
 *    compositePins InFlow/OutFlow 路由内部节点存在且物理 flow pin 存在；
 *    f.node 链尾必须显式 f.link（detached tail）。
 * C4 OutParam 风险（#15）：OutParam 惰性求值——「读→写同一变量再输出派生值」
 *    必错；条件动作用 outflow 分支语义。检查：输出 OutParam 连到
 *    set_node_graph_variable 的 impl 模式。
 *
 * 用法：
 *   npx tsx scripts/composite-health-check.ts <file.gia>          # GIA 产物模式
 *   npx tsx scripts/composite-health-check.ts --ir <file.ts>       # IR 构建模式
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const PROTO = new URL(
  '../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto',
  import.meta.url
).pathname

interface CheckResult {
  level: 'PASS' | 'WARN' | 'FAIL'
  check: string
  detail: string
}

const results: CheckResult[] = []

function pass(check: string, detail: string) {
  results.push({ level: 'PASS', check, detail })
}
function warn(check: string, detail: string) {
  results.push({ level: 'WARN', check, detail })
}
function fail(check: string, detail: string) {
  results.push({ level: 'FAIL', check, detail })
}

// ---------------- GIA 产物模式 ----------------

async function checkGiaFile(file: string) {
  const { decode_gia_file } = await import(
    '../src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/decode.js'
  )
  const data = await decode_gia_file(file, PROTO)
  const accs = (data.accessories ?? []) as any[]
  const defs = new Map<number, any>()
  const impls = new Map<number, any>()
  for (const acc of accs) {
    if (acc.which === 12) {
      const inner = acc.compositeDef?.inner?.def
      // def 关联键 = impl graph id（def.id.graphId.id = relatedIds[0]）
      const gid = inner?.id?.graphId?.id ?? acc.id?.id
      defs.set(gid, { name: acc.name, def: inner, gid })
    }
    if (acc.which === 9) {
      // impl 关联键 = acc.id.id（class=5 id=1610710000）
      const gid = acc.id?.id
      impls.set(gid, { graph: acc.graph?.inner?.graph, gid })
    }
  }
  let compositeCount = 0
  for (const [gid, implInfo] of impls) {
    const defInfo = defs.get(gid)
    const name = defInfo?.name ?? 'gid=' + gid
    const g = implInfo.graph
    if (!g) continue
    compositeCount++
    checkImplGraph(name, g, implInfo)
  }
  // 主图检查（host 实例的 composite call 参数完整性）
  const mainNodes = data.graph?.graph?.inner?.graph?.nodes ?? []
  const callNodes = mainNodes.filter((n: any) => n.genericId?.kind === 22001)
  for (const cn of callNodes) {
    const missing: string[] = []
    for (const pin of cn.pins ?? []) {
      if (pin.i1?.kind !== 3) continue
      const hasConn = (pin.connects ?? []).length > 0
      const hasVal = pin.value?.alreadySetVal === true
      if (!hasConn && !hasVal) missing.push('InParam:' + pin.i1.index)
    }
    if (missing.length) {
      fail('C1-host', 'main graph composite call InParam 无连接且无值（capture 路由丢失/编辑器清空）: ' + missing.join(','))
    } else {
      pass('C1-host', 'main graph composite call 参数完整（node=' + cn.nodeIndex + '）')
    }
  }
  return { compositeCount, defs: defs.size, impls: impls.size, mainCalls: callNodes.length }
}

function checkImplGraph(name: string, g: any, implInfo: any) {
  const nodes = g.nodes ?? []
  const nodeById = new Map<number, any>()
  for (const n of nodes) nodeById.set(n.nodeIndex, n)
  const pinsOf = (n: any) => n.pins ?? []

  // ---- C1: compositePins 路由目标存在 + 路由覆盖 call 参数 ----
  // 注意：#17 规则——capture 路由（outer InParam → call InParam）调用点物理 pin 不落盘，
  // 因此 InParam/OutParam 缺物理 pin 是正常行为；只有 flow 路由（InFlow/OutFlow）要求
  // 内部节点存在物理 flow pin（#11 系列缺陷模式）。
  const cps = g.compositePins ?? []
  for (const cp of cps) {
    const innerNode = nodeById.get(cp.innerNodeId)
    if (!innerNode) {
      fail('C1-route', name + ': compositePins 路由指向不存在的内部节点 innerNodeId=' + cp.innerNodeId)
      continue
    }
    if (cp.outerPin?.kind === 1 || cp.outerPin?.kind === 2) {
      const innerPin = pinsOf(innerNode).find(
        (p: any) => p.i1?.kind === cp.innerPin?.kind && p.i1?.index === cp.innerPin?.index
      )
      if (!innerPin) {
        fail('C1-route', name + ': flow 路由 outer kind=' + cp.outerPin?.kind + ':' + cp.outerPin?.index +
          ' 内部节点 idx=' + cp.innerNodeId + ' 缺物理 pin kind=' + cp.innerPin?.kind + ':' + cp.innerPin?.index)
      }
    }
  }
  // call 节点 InParam 完整性
  for (const n of nodes) {
    if (n.genericId?.kind !== 22001) continue
    const routed = new Set<string>()
    for (const cp of cps) {
      if (cp.innerNodeId === n.nodeIndex && cp.innerPin?.kind === 3) {
        routed.add('3:' + cp.innerPin.index)
      }
    }
    for (const pin of pinsOf(n)) {
      if (pin.i1?.kind !== 3) continue
      const key = '3:' + pin.i1.index
      const hasConn = (pin.connects ?? []).length > 0
      const hasVal = pin.value?.alreadySetVal === true
      if (!hasConn && !hasVal && !routed.has(key)) {
        fail('C1-call', name + ': 复合调用节点 idx=' + n.nodeIndex + ' InParam:' + pin.i1.index + ' 无连接/无值/无路由')
      }
    }
  }

  // ---- C2: 图变量节点变量名 pin 字面量（#18 + 编辑器保存副作用） ----
  // 严格识别：get 类 = InParam0 str + OutParam；set 类 = InParam0 str + InParam1（值）。
  // 事件节点（如 whenCustomVariableChanges 的变量名参数）也有 str InParam0 且来自
  // 事件对象 conns——必须有 OutParam/InParam1 特征才视为图变量节点，避免误报。
  for (const n of nodes) {
    const pins = pinsOf(n)
    const in0 = pins.find((p: any) => p.i1?.kind === 3 && p.i1?.index === 0)
    if (!in0) continue
    const isStrPin = in0.value?.itemType?.type_server?.type === 6 || in0.value?.itemType?.type === 6
    if (!isStrPin) continue
    const hasOut = pins.some((p: any) => p.i1?.kind === 4)
    const hasIn1 = pins.some((p: any) => p.i1?.kind === 3 && p.i1?.index === 1)
    if (!hasOut && !hasIn1) continue // 非图变量节点（事件/普通节点）
    const hasLiteral = typeof in0.value?.bString?.val === 'string' && in0.value.bString.val.length > 0
    const hasConn = (in0.connects ?? []).length > 0
    if (hasConn) {
      // 变量名来自 pin（编辑器保存后会清空）→ #18 已知边界
      warn('C2-name', name + ': 图变量类节点 idx=' + n.nodeIndex + ' 变量名来自连接（字面量限制#18，编辑器保存会清空）')
    } else if (!hasLiteral) {
      fail('C2-name', name + ': 图变量类节点 idx=' + n.nodeIndex + ' 变量名 pin 无字面量值（编辑器保存清空）')
    }
  }

  // ---- C3: exec 链完整性 ----
  for (const n of nodes) {
    for (const pin of pinsOf(n)) {
      if (pin.i1?.kind !== 2) continue // OutFlow
      for (const conn of pin.connects ?? []) {
        if (!nodeById.has(conn.id)) {
          fail('C3-exec', name + ': exec 边目标节点不存在 nodeIdx=' + conn.id + '（源 idx=' + n.nodeIndex + '）')
        }
      }
    }
  }
  // compositePins flow 路由内部节点物理 flow pin
  for (const cp of cps) {
    if (cp.outerPin?.kind !== 1 && cp.outerPin?.kind !== 2) continue
    const innerNode = nodeById.get(cp.innerNodeId)
    if (!innerNode) continue
    const hasFlowPin = pinsOf(innerNode).some(
      (p: any) => p.i1?.kind === (cp.outerPin.kind === 1 ? 1 : 2)
    )
    if (!hasFlowPin) {
      fail('C3-flow', name + ': flow 路由 outer kind=' + cp.outerPin.kind + ':' + cp.outerPin.index +
        ' 内部节点 idx=' + cp.innerNodeId + ' 缺物理 flow pin（#11 系列缺陷模式）')
    }
  }
  // ---- C3b: impl 内部 exec 边 → 合成调用节点物理 InFlow（#20 回归自动防线） ----
  // 症状：MB 分支 → 复合调用边存在（connects 指向 1:0）但目标节点无物理 InFlow pin →
  // 引擎无法进入被调复合 impl（2691 日志：trigger MB→dispatch 调用后 dispatch 零帧）。
  // 判定：只检查**被 exec 边（InFlow connects）指向**的合成调用节点（generic 22001）——
  // 上游普通节点 OutFlow connects 的 InFlow 目标。纯数据流调用（数据复合被当数据节点
  // 消费，如 turn_check→axis_compare）无 exec 边进入，不需要 InFlow，不报。
  const execTargetIds = new Set<number>()
  for (const n of nodes) {
    for (const p of n.pins ?? []) {
      if (p.i1?.kind !== 2) continue // OutFlow
      for (const c of p.connects ?? []) execTargetIds.add(c.id)
    }
  }
  for (const n of nodes) {
    if (n.genericId?.kind !== 22001) continue
    if (!execTargetIds.has(n.nodeIndex)) continue // 非 exec 边目标（纯数据调用）
    const hasInFlow = (n.pins ?? []).some((p: any) => p.i1?.kind === 1)
    if (!hasInFlow) {
      fail('C3b-inflow', name + ': 复合调用节点 idx=' + n.nodeIndex + ' 被 exec 边指向但无物理 InFlow pin（#20：缺失 → 被调复合零帧）')
    }
  }

  // detached 链尾：有 InFlow 的 exec 节点无 OutFlow 连接 → 尾节点
  // （#15：f.node 注册 exec 不自动连 tail，链尾必须显式 f.link）
  for (const n of nodes) {
    const pins = pinsOf(n)
    const hasInFlow = pins.some((p: any) => p.i1?.kind === 1)
    if (!hasInFlow) continue
    const outFlows = pins.filter((p: any) => p.i1?.kind === 2)
    const isTail = outFlows.every((p: any) => (p.connects ?? []).length === 0)
    if (isTail && outFlows.length > 0) {
      // 链尾 exec：若该节点无 outflow 路由消费 → 提示
      const consumedByFlowRoute = cps.some(
        (cp: any) => cp.outerPin?.kind === 2 && cp.innerNodeId === n.nodeIndex
      )
      if (!consumedByFlowRoute) {
        warn('C3-tail', name + ': exec 节点 idx=' + n.nodeIndex + ' 是链尾但无 outflow 路由消费（#15 f.node detached tail 模式）')
      }
    }
  }

  // ---- C4: OutParam 惰性求值风险（#15） ----
  // 模式：复合输出 OutParam 指向 get 类节点（读变量），且同一 impl 内存在
  // 对该变量的 set 写入 → 宿主消费时惰性重读数据链，读到写入后值（写后读派生值必错）。
  // 先收集 set 写入的变量名
  const writtenVars = new Set<string>()
  for (const n of nodes) {
    const pins = pinsOf(n)
    const in0 = pins.find((p: any) => p.i1?.kind === 3 && p.i1?.index === 0)
    if (!in0) continue
    const isStrPin = in0.value?.itemType?.type_server?.type === 6 || in0.value?.itemType?.type === 6
    if (!isStrPin) continue
    const hasIn1 = pins.some((p: any) => p.i1?.kind === 3 && p.i1?.index === 1)
    if (!hasIn1) continue // set 类节点有 InParam1（值）；get 类没有
    const vname = in0.value?.bString?.val
    if (typeof vname === 'string' && vname.length > 0) writtenVars.add(vname)
  }
  for (const cp of cps) {
    if (cp.outerPin?.kind !== 4) continue // 输出 OutParam
    const innerNode = nodeById.get(cp.innerNodeId)
    if (!innerNode) continue
    const pins = pinsOf(innerNode)
    const in0 = pins.find((p: any) => p.i1?.kind === 3 && p.i1?.index === 0)
    if (!in0) continue
    const isStrPin = in0.value?.itemType?.type_server?.type === 6 || in0.value?.itemType?.type === 6
    if (!isStrPin) continue
    const hasOut = pins.some((p: any) => p.i1?.kind === 4)
    if (!hasOut) continue // get 类节点有 OutParam
    const vname = in0.value?.bString?.val
    if (typeof vname === 'string' && writtenVars.has(vname)) {
      fail('C4-outparam', name + ': 输出 OutParam 读变量 "' + vname + '" 且同 impl 有 set 写入（#15 惰性求值：写后读派生值必错）')
    }
  }
}

// ---------------- IR 构建模式 ----------------

async function checkIrMode(entry: string) {
  const { buildServerGraphRegistriesIRDocuments, g } = await import('../dist/src/runtime/core.js')
  const { setRuntimeOptions } = await import('../dist/src/runtime/runtime_config.js')
  setRuntimeOptions({ optimize: { precompileExpression: false, removeUnusedNodes: false } })
  // 直接执行入口文件以注册 server（相对路径按项目根解析）
  const absEntry = entry.startsWith('/') ? entry : new URL('../' + entry, import.meta.url).pathname
  await import(absEntry)
  const docs = buildServerGraphRegistriesIRDocuments()
  let composites = 0
  for (const doc of docs) {
    for (const def of doc.compositeDefs ?? []) {
      composites++
      // C1: capture 参数标记
      for (const node of def.implNodes ?? []) {
        if (node.type !== '__composite_call__') continue
        for (const arg of node.args ?? []) {
          if (arg && arg.capture === true) {
            pass('C1-ir', def.name + ': 子复合调用 capture 参数带标记（node=' + node.id + '）')
          } else if (arg && arg.type === 'conn') {
            // 普通数据边
          } else if (arg === null || arg === undefined || (arg && arg.value === null && !arg.capture)) {
            fail('C1-ir', def.name + ': 子复合调用参数无值且无 capture 标记（node=' + node.id + '）——序列化丢 capture 缺陷模式')
          }
        }
      }
      // C2: getNodeGraphVariable 字面量名（IR 层 type 检查）
      for (const node of def.implNodes ?? []) {
        if (node.type !== 'get_node_graph_variable') continue
        const nameArg = (node.args ?? [])[0]
        if (!nameArg || nameArg.type !== 'str') {
          fail('C2-ir', def.name + ': get_node_graph_variable 变量名非字面量 str（#18 已知边界）node=' + node.id)
        }
      }
      // C3: implEdges 目标存在
      const nodeIds = new Set((def.implNodes ?? []).map((n: any) => n.id))
      for (const [srcId, conns] of Object.entries(def.implEdges ?? {})) {
        if (!nodeIds.has(Number(srcId))) {
          fail('C3-ir', def.name + ': implEdges 源节点不存在 id=' + srcId)
        }
        for (const c of conns as any[]) {
          if (!nodeIds.has(c.targetId)) {
            fail('C3-ir', def.name + ': implEdges 目标节点不存在 id=' + c.targetId + '（#12 缺陷模式）')
          }
        }
      }
      // C4: outflow 分支语义（条件动作用 outflow 而非数据输出）
      const outNames = new Set((def.outputs ?? []).map((o: any) => o.name))
      const flowNames = new Set((def.outflows ?? []).map((o: any) => o.name))
      for (const node of def.implNodes ?? []) {
        if (node.type === 'multiple_branches' && outNames.size > 0 && flowNames.size === 0) {
          warn('C4-ir', def.name + ': 条件分支（multiple_branches）但无 outflow 声明——#15 建议 outflow 分支语义')
        }
      }
    }
  }
  return { docs: docs.length, composites }
}

// ---------------- main ----------------

const args = process.argv.slice(2)
const giaArg = args.find((a) => !a.startsWith('--'))
const irIdx = args.indexOf('--ir')
const irArg = irIdx >= 0 ? args[irIdx + 1] : undefined

if (irArg) {
  const summary = await checkIrMode(irArg)
  console.log('IR mode: docs=' + summary.docs + ' composites=' + summary.composites)
} else if (giaArg) {
  const summary = await checkGiaFile(giaArg)
  console.log('GIA mode: defs=' + summary.defs + ' impls=' + summary.impls + ' mainCalls=' + summary.mainCalls)
} else {
  console.error('Usage: npx tsx scripts/composite-health-check.ts <file.gia> | --ir <entry.ts>')
  process.exit(2)
}

const fails = results.filter((r) => r.level === 'FAIL')
const warns = results.filter((r) => r.level === 'WARN')
const passes = results.filter((r) => r.level === 'PASS')
console.log('')
console.log('=== 体检结果: FAIL=' + fails.length + ' WARN=' + warns.length + ' PASS=' + passes.length + ' ===')
for (const r of results) {
  console.log(r.level.padEnd(5) + ' [' + r.check + '] ' + r.detail)
}
console.log('')
if (fails.length > 0) {
  console.log('RESULT: FAIL（编译产物存在缺陷模式）')
  process.exitCode = 1
} else if (warns.length > 0) {
  console.log('RESULT: WARN（有风险提示，需人工确认）')
  process.exitCode = 0
} else {
  console.log('RESULT: PASS')
  process.exitCode = 0
}
