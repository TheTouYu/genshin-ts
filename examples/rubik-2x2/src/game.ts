// rubik-2x2 完整游戏关卡基础设施（2026-08-17）
//
// 架构：五层分离（输入/流程/逻辑状态/表现/结算）——见 docs/architecture/rubik-game-level-infrastructure.md
//   - 输入层：tabBar 选项事件（tabId 1-6 = R/L/U/D/F/B 转动；7 = 打乱；8 = 自动复原；9 = 重置）
//   - 流程层：输入锁 + 模式（MANUAL/AUTO 队列播放）+ afterTurn 钩子（胜利检查/队列推进）
//   - 逻辑状态层：cornerPos/cornerOrient = 单一事实源（胜利判定、求解器输入只读它）
//   - 表现层：沿用已验证机制（自旋 + 分段公转，位置+朝向全精确）——逻辑与视觉解耦
//   - 结算层：isSolved → setPlayerSettlementSuccessStatus(Victory)
//
// 受限环境预算：新增逻辑层/流程层/结算层节点估算见架构文档 §7（目标单图 <2000 节点）。
// 2×2 逻辑状态 move 置换表由 tools/gen-2x2-logic-table.mjs 生成（CubeLib 交叉验证通过）——勿手改。
import { g } from 'genshin-ts/runtime/core'
import { SettlementStatus } from 'genshin-ts/definitions/enum'
import type { IntValue } from 'genshin-ts/runtime/value'
import { bool, float, int, listLiteral, str } from 'genshin-ts/runtime/value'
import type { ServerExecutionFlowFunctions } from 'genshin-ts/definitions/nodes'

// 45° 段预计算常量（2026-08-20 动画实验：3 段→2 段，每段 0.15s 总 0.3s，降运动器负载）：
// p_k = v0·Ck + (axis×v0)·Sk；vel_k = (p_k − p_{k−1})·K_VEL
const C1 = 0.7071068 // cos45°
const S1 = 0.7071068 // sin45°
const C2 = 0 // cos90°
const S2 = 1 // sin90°
const K_VEL = 6.6667 // 1/0.15s（orbit 2 段每段 0.15s，总动画 0.3s）
const DEG2RAD = 0.017453292519943295 // π/180
const SCRAMBLE_LEN = 20n // 打乱步数
const CORNER_COUNT = 8n // 角块数

// ================================================================
// 逻辑状态层（2026-08-17 基础设施新增）
// 角位编号 0..7 = UBL UBR UFL UFR DBL DBR DFL DFR
// twist 编码对齐受限求解原型 cube.js：U/D 色贴纸在角位 slots
//   [U/D面, Z面(F/B), X面(R/L)] 的下标 0/1/2；已还原 = 全 0
// 引擎无列表原地修改节点 → 状态用 dict 读写（set_or_add / query_by_key）
// ================================================================

// 读取角位状态（纯数据）：p → { piece, twist }
// 读取角位状态（纯数据）：p → { piece, twist }（列表读，性能远高于字典）
const gstsLogicReadCorner = g.defineComposite('gsts_logic_read_corner', {
  inputs: { p: { type: 'int' } },
  outputs: { piece: { type: 'int' }, twist: { type: 'int' } },
  build: ({ p }, f) => ({
    piece: f.getCorrespondingValueFromList(f.getNodeGraphVariable('cornerPos').asType('int_list'), p),
    twist: f.getCorrespondingValueFromList(f.getNodeGraphVariable('cornerOrient').asType('int_list'), p)
  })
})

// 单槽表读取（纯数据）：(moveId, slot) → { piece, twist }（tblFrom 列表 index = moveId*4+slot）
const gstsLogicReadSlot = g.defineComposite('gsts_logic_read_slot', {
  inputs: { moveId: { type: 'int' }, slot: { type: 'int' } },
  outputs: { piece: { type: 'int' }, twist: { type: 'int' } },
  build: ({ moveId, slot }, f) => {
    const key = f.addition(f.multiplication(moveId, 4n), slot)
    const p = f.getCorrespondingValueFromList(f.getNodeGraphVariable('tblFrom').asType('int_list'), key)
    return f.callComposite(gstsLogicReadCorner, { p })
  }
})

// 状态变更（exec）：按 moveId 应用 4 槽置换——
// 先全部读取 → 物化到 tempP/tempT（set_list_value，piece/twist 各只消费一次 → 消除惰性重求值），
// 再全部写入（避免环内别名覆盖：q_s 可能与 p_{s+1} 相同）；槽位展开 4 次
const gstsLogicApplyMove = g.defineComposite('gsts_logic_apply_move', {
  inputs: { moveId: { type: 'int' } },
  outputs: {},
  outflows: ['done'],
  build: ({ moveId }, f) => {
    // 2026-08-20 负载优化：tempP/tempT 各 get 一次，8 个 set_list_value 共享引用
    // （原每槽重新 getNodeGraphVariable → 8 个 GetVar 节点；参照 gsts_logic_reset 好写法）
    const tempP = f.getNodeGraphVariable('tempP').asType('int_list')
    const tempT = f.getNodeGraphVariable('tempT').asType('int_list')
    // 阶段 1：读取 4 槽 → 暂存
    const r0 = f.callComposite(gstsLogicReadSlot, { moveId, slot: 0n })
    const t0a = f.node('set_list_value', [tempP, new int(0), r0.piece])
    const t0b = f.node('set_list_value', [tempT, new int(0), r0.twist])
    f.link(f.entry(), 0, t0a, 0)
    f.connect(t0a, 0, t0b, 0)
    const r1 = f.callComposite(gstsLogicReadSlot, { moveId, slot: 1n })
    const t1a = f.node('set_list_value', [tempP, new int(1), r1.piece])
    const t1b = f.node('set_list_value', [tempT, new int(1), r1.twist])
    f.connect(t0b, 0, t1a, 0)
    f.connect(t1a, 0, t1b, 0)
    const r2 = f.callComposite(gstsLogicReadSlot, { moveId, slot: 2n })
    const t2a = f.node('set_list_value', [tempP, new int(2), r2.piece])
    const t2b = f.node('set_list_value', [tempT, new int(2), r2.twist])
    f.connect(t1b, 0, t2a, 0)
    f.connect(t2a, 0, t2b, 0)
    const r3 = f.callComposite(gstsLogicReadSlot, { moveId, slot: 3n })
    const t3a = f.node('set_list_value', [tempP, new int(3), r3.piece])
    const t3b = f.node('set_list_value', [tempT, new int(3), r3.twist])
    f.connect(t2b, 0, t3a, 0)
    f.connect(t3a, 0, t3b, 0)
    // 阶段 2：写入 4 槽（q = tblTo[moveId*4+slot]，t' = tblTwist[moveId*12+slot*3+twist]）
    const w0 = f.callComposite(gstsLogicWriteSlot, { moveId, slot: 0n })
    f.connect(t3b, 0, w0, 0)
    const w1 = f.callComposite(gstsLogicWriteSlot, { moveId, slot: 1n })
    f.connect(w0, 0, w1, 0)
    const w2 = f.callComposite(gstsLogicWriteSlot, { moveId, slot: 2n })
    f.connect(w1, 0, w2, 0)
    const w3 = f.callComposite(gstsLogicWriteSlot, { moveId, slot: 3n })
    f.connect(w2, 0, w3, 0)
    f.outflow('done', w3, 0)
    return {}
  }
})

// 单槽写入（exec）：从 tempP/tempT 取第 slot 槽，写 cornerPos[q] / cornerOrient[t']
const gstsLogicWriteSlot = g.defineComposite('gsts_logic_write_slot', {
  inputs: { moveId: { type: 'int' }, slot: { type: 'int' } },
  outputs: {},
  outflows: ['done'],
  build: ({ moveId, slot }, f) => {
    // 2026-08-20 负载优化：变量句柄各 get 一次共享（原 tempQ 被 set 前 + 物化读各 get 一次）
    const tblTo = f.getNodeGraphVariable('tblTo').asType('int_list')
    const tempQ = f.getNodeGraphVariable('tempQ').asType('int_list')
    const tempT = f.getNodeGraphVariable('tempT').asType('int_list')
    const tblTwist = f.getNodeGraphVariable('tblTwist').asType('int_list')
    const tempP = f.getNodeGraphVariable('tempP').asType('int_list')
    const cornerPos = f.getNodeGraphVariable('cornerPos').asType('int_list')
    const cornerOrient = f.getNodeGraphVariable('cornerOrient').asType('int_list')
    // q 被 cornerPos/cornerOrient 两处消费 → 先物化到 tempQ（局部变量，避免重复求值）
    const qv = f.getCorrespondingValueFromList(tblTo,
      f.addition(f.multiplication(moveId, 4n), slot))
    const q1 = f.node('set_list_value', [tempQ, new int(0), qv])
    f.link(f.entry(), 0, q1, 0)
    const q = f.getCorrespondingValueFromList(tempQ, new int(0))
    const tIdx = f.addition(f.addition(f.multiplication(moveId, 12n), f.multiplication(slot, 3n)),
      f.getCorrespondingValueFromList(tempT, slot))
    const tw = f.getCorrespondingValueFromList(tblTwist, tIdx)
    const piece = f.getCorrespondingValueFromList(tempP, slot)
    const s1 = f.node('set_list_value', [cornerPos, q, piece])
    const s2 = f.node('set_list_value', [cornerOrient, q, tw])
    f.connect(q1, 0, s1, 0)
    f.connect(s1, 0, s2, 0)
    f.outflow('done', s2, 0)
    return {}
  }
})

// 胜利判定（纯数据）：AND( pos[i]==i && twist[i]==0 )，8 槽展开（列表读）
const gstsLogicIsSolved = g.defineComposite('gsts_logic_is_solved', {
  inputs: {},
  outputs: { solved: { type: 'bool' } },
  build: (_a, f) => {
    // 2026-08-20 负载优化：cornerPos/cornerOrient 各 get 一次，8 槽 get_list 共享引用
    // （原 pos(i)/tw(i) 每槽重新 getNodeGraphVariable → 16 个 GetVar 节点）
    const cornerPos = f.getNodeGraphVariable('cornerPos').asType('int_list')
    const cornerOrient = f.getNodeGraphVariable('cornerOrient').asType('int_list')
    const pos = (i: bigint) => f.getCorrespondingValueFromList(cornerPos, i)
    const tw = (i: bigint) => f.getCorrespondingValueFromList(cornerOrient, i)
    // targetPos/targetOrient 当前恒为初始态 [0..7]/[0..0]，直接用字面量比较，
    // 省去 2 个 GetVar + 16 个 GetCorresponding（胜利判定每次转动后都会跑）
    const ok0 = f.logicalAndOperation(f.equal(pos(0n), 0n), f.equal(tw(0n), 0n))
    const ok1 = f.logicalAndOperation(f.equal(pos(1n), 1n), f.equal(tw(1n), 0n))
    const ok2 = f.logicalAndOperation(f.equal(pos(2n), 2n), f.equal(tw(2n), 0n))
    const ok3 = f.logicalAndOperation(f.equal(pos(3n), 3n), f.equal(tw(3n), 0n))
    const ok4 = f.logicalAndOperation(f.equal(pos(4n), 4n), f.equal(tw(4n), 0n))
    const ok5 = f.logicalAndOperation(f.equal(pos(5n), 5n), f.equal(tw(5n), 0n))
    const ok6 = f.logicalAndOperation(f.equal(pos(6n), 6n), f.equal(tw(6n), 0n))
    const ok7 = f.logicalAndOperation(f.equal(pos(7n), 7n), f.equal(tw(7n), 0n))
    const a01 = f.logicalAndOperation(ok0, ok1)
    const a23 = f.logicalAndOperation(ok2, ok3)
    const a45 = f.logicalAndOperation(ok4, ok5)
    const a67 = f.logicalAndOperation(ok6, ok7)
    const a0123 = f.logicalAndOperation(a01, a23)
    const a4567 = f.logicalAndOperation(a45, a67)
    return { solved: f.logicalAndOperation(a0123, a4567) }
  }
})

// 逻辑状态复位（exec）：cornerPos[i]=i, cornerOrient[i]=0（8 槽展开，列表写）
const gstsLogicReset = g.defineComposite('gsts_logic_reset', {
  inputs: {},
  outputs: {},
  outflows: ['done'],
  build: (_a, f) => {
    const cornerPos = f.getNodeGraphVariable('cornerPos').asType('int_list')
    const cornerOrient = f.getNodeGraphVariable('cornerOrient').asType('int_list')
    const p0 = f.node('set_list_value', [cornerPos, new int(0), new int(0)])
    const t0 = f.node('set_list_value', [cornerOrient, new int(0), new int(0)])
    const p1 = f.node('set_list_value', [cornerPos, new int(1), new int(1)])
    const t1 = f.node('set_list_value', [cornerOrient, new int(1), new int(0)])
    const p2 = f.node('set_list_value', [cornerPos, new int(2), new int(2)])
    const t2 = f.node('set_list_value', [cornerOrient, new int(2), new int(0)])
    const p3 = f.node('set_list_value', [cornerPos, new int(3), new int(3)])
    const t3 = f.node('set_list_value', [cornerOrient, new int(3), new int(0)])
    const p4 = f.node('set_list_value', [cornerPos, new int(4), new int(4)])
    const t4 = f.node('set_list_value', [cornerOrient, new int(4), new int(0)])
    const p5 = f.node('set_list_value', [cornerPos, new int(5), new int(5)])
    const t5 = f.node('set_list_value', [cornerOrient, new int(5), new int(0)])
    const p6 = f.node('set_list_value', [cornerPos, new int(6), new int(6)])
    const t6 = f.node('set_list_value', [cornerOrient, new int(6), new int(0)])
    const p7 = f.node('set_list_value', [cornerPos, new int(7), new int(7)])
    const t7 = f.node('set_list_value', [cornerOrient, new int(7), new int(0)])
    f.link(f.entry(), 0, p0, 0)
    f.connect(p0, 0, t0, 0)
    f.connect(t0, 0, p1, 0)
    f.connect(p1, 0, t1, 0)
    f.connect(t1, 0, p2, 0)
    f.connect(p2, 0, t2, 0)
    f.connect(t2, 0, p3, 0)
    f.connect(p3, 0, t3, 0)
    f.connect(t3, 0, p4, 0)
    f.connect(p4, 0, t4, 0)
    f.connect(t4, 0, p5, 0)
    f.connect(p5, 0, t5, 0)
    f.connect(t5, 0, p6, 0)
    f.connect(p6, 0, t6, 0)
    f.connect(t6, 0, p7, 0)
    f.connect(p7, 0, t7, 0)
    f.outflow('done', t7, 0)
    return {}
  }
})

// ================================================================

// 结算（exec）：isSolved 且未结算过 → 设置玩家结算成功状态
const gstsCheckWin = g.defineComposite('gsts_check_win', {
  inputs: {},
  outputs: {},
  outflows: ['done'],
  build: (_a, f) => {
    const solved = f.callComposite(gstsLogicIsSolved, {}).solved
    const already = f.equal(f.getNodeGraphVariable('settled').asType('bool'), true)
    const win = f.logicalAndOperation(solved, f.logicalNotOperation(already))
    const br = f.node('double_branch', [win])
    f.link(f.entry(), 0, br, 0)
    f.connectOutFlow(br, 0, () => {
      const setSettled = f.node('set_node_graph_variable', [new str('settled'), new bool(true), new bool(false)])
      f.link(br, 0, setSettled, 0)
      // 玩家实体：控制器不是角色实体，getPlayerEntityToWhichTheCharacterBelongs 返回空
      // （2026-08-17 日志 rec241 实证 "没有找到实体"）→ 直接取场上玩家列表的玩家
      const players = f.getListOfPlayerEntitiesOnTheField()
      const player = f.getCorrespondingValueFromList(players, 0n)
      const winNode = f.node('set_player_settlement_success_status', [player, SettlementStatus.Victory])
      f.link(setSettled, 0, winNode, 0)
      // 完整结算流程（官方概念文档「关卡结算」）：① 设结算状态 ② 触发「结算关卡」让关卡真正结束
      const settleNode = f.node('settle_stage', [])
      f.link(winNode, 0, settleNode, 0)
      f.printString('rubik-solved-win')
    })
    f.connectOutFlow(br, 1, () => {})
    return {}
  }
})

// 单步转动（exec，方案 B 定时器驱动，2026-08-18；2026-08-20 性能优化+动画实验）：
// 复合内 finiteLoop + 调用复合的循环体会重启（引擎限制，日志实证）→ 改用定时器拆分：
//   ① 逻辑状态变更 ② 存 curMove ③ 随机相位差：4 块启动时间 = 起始偏移随机(0.01~0.02)
//      + 间隔随机(0.008~0.015)，总动画 0.3s 内完成，物化到 turnTimes（每次转动弹性幅度不同）
//   ④ 注册单一解锁定时器（1.80s，覆盖 orbit 5 段×0.3s 动画）——'turnblock' 分支分发
const gstsDoMove = g.defineComposite('gsts_do_move', {
  inputs: { moveId: { type: 'int' }, target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ moveId, target }, f) => {
    // ① 面转使用已验证的 0.3s 两段轨道参数；整体转后必须显式恢复，避免状态泄漏。
    f.setNodeGraphVariable('turnLastSlot', new int(3), false)
    f.setNodeGraphVariable('turnDuration', new float(0.3), false)
    f.setNodeGraphVariable('segmentDuration', new float(0.15), false)
    f.setNodeGraphVariable('orbitKVel', new float(K_VEL), false)
    f.setNodeGraphVariable('angularVelocity', new float(300), false)
    f.setNodeGraphVariable('turnCompletionDelay', new float(0.35), false)
    // ② 逻辑状态变更
    f.callComposite(gstsLogicApplyMove, { moveId })
    // ③ curMove 由调用方（宿主 tabId / afterTurn queue 值）设置——
    //    复合输入 capture 直接设图变量有类型问题（2026-08-18 编辑器实证），数据引脚路径已验证
    // ③ 随机相位差（2026-08-20 动画实验）：t0=rand(0.004,0.008)，t1=t0+rand(0.003,0.006)…
    //    随机数被 set_list_value 消费即求值一次（物化到 turnTimes，start_timer 读变量）
    const turnTimes = f.getNodeGraphVariable('faceTurnTimes').asType('float_list')
    const r0 = f.getRandomFloatingPointNumber(0.004, 0.008)
    const r1 = f.getRandomFloatingPointNumber(0.003, 0.006)
    const r2 = f.getRandomFloatingPointNumber(0.003, 0.006)
    const r3 = f.getRandomFloatingPointNumber(0.003, 0.006)
    const t1 = f.addition(r0, r1)
    const t2 = f.addition(t1, r2)
    const t3 = f.addition(t2, r3)
    const s0 = f.node('set_list_value', [turnTimes, new int(0), r0])
    const s1 = f.node('set_list_value', [turnTimes, new int(1), t1])
    const s2 = f.node('set_list_value', [turnTimes, new int(2), t2])
    const s3 = f.node('set_list_value', [turnTimes, new int(3), t3])
    // s0-s3 经 exec tail 自动串联（apply_move done → s0 → … → s3 → start_timer）
    // ④ 块事件定时器（turnTimes 随机时间；timerSequenceId = 槽位 0..3）。
    // 解锁不在这里按绝对时刻注册，而由最后一个实际 turnblock 事件相对注册。
    f.registerExecNode('start_timer', [
      target, new str('turnblock'), new bool(false), turnTimes
    ])
    return {}
  }
})

// 单块转动（exec，2026-08-20 性能优化）：i = 槽位 0..3（do_move 注册的块事件
// timerSequenceId）→ turn_block 查表转动该槽命中块 → 注册轨道段定时器（i = 命中块编号）
const gstsTurnOne = g.defineComposite('gsts_turn_one', {
  inputs: { i: { type: 'int' }, target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ i, target }, f) => {
    const center = f.create3dVector(3, 3, 3)
    const moveId = f.getNodeGraphVariable('curMove').asType('int')
    const turn = f.callComposite(gstsTurnBlock, { i, tabId: moveId, center })
    const sched = f.callComposite(gstsOrbitScheduler, { i: turn.piece, target })
    f.connect(turn, 0, sched, 0)
    // 2026-08-20 修复：必须显式发 done，否则 turnblock 回调里后续的
    // isLast/unlock 定时器永远不会执行（日志实证 lock 卡 true，第二次操作无响应）
    f.outflow('done', sched, 0)
    return {}
  }
})

// 转动完成钩子（exec）：AUTO → 队列推进；MANUAL → 胜利检查
const gstsAfterTurn = g.defineComposite('gsts_after_turn', {
  inputs: { target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ target }, f) => {
    const isAuto = f.equal(f.getNodeGraphVariable('autoMode').asType('bool'), true)
    const brAuto = f.node('double_branch', [isAuto])
    f.link(f.entry(), 0, brAuto, 0)
    f.connectOutFlow(brAuto, 0, () => {
      // —— AUTO：推进队列 ——（先写 qIdx，再安全读回：写后再 get 模式）
      const nextIdx = f.addition(f.getNodeGraphVariable('qIdx').asType('int'), 1n)
      const setIdx = f.node('set_node_graph_variable', [new str('qIdx'), nextIdx, new bool(false)])
      f.link(brAuto, 0, setIdx, 0)
      const afterIdx = f.getNodeGraphVariable('qIdx').asType('int')
      const more = f.lessThan(afterIdx, f.getNodeGraphVariable('qLen').asType('int'))
      const brMore = f.node('double_branch', [more])
      f.link(setIdx, 0, brMore, 0)
      f.connectOutFlow(brMore, 0, () => {
        // 还有下一动：lock=true → do_move(queue[afterIdx])
        const mv = f.queryDictionaryValueByKey(f.getNodeGraphVariable('queue').asDict('int', 'int'), afterIdx)
        const setLock = f.node('set_node_graph_variable', [new str('lock'), new bool(true), new bool(false)])
        f.link(brMore, 0, setLock, 0)
        const setCur = f.node('set_node_graph_variable', [new str('curMove'), mv, new bool(false)])
        f.link(setLock, 0, setCur, 0)
        f.callComposite(gstsDoMove, { moveId: mv, target })
      })
      f.connectOutFlow(brMore, 1, () => {
        // 队列结束：autoMode=false → 胜利检查
        const offAuto = f.node('set_node_graph_variable', [new str('autoMode'), new bool(false), new bool(false)])
        f.link(brMore, 1, offAuto, 0)
        f.callComposite(gstsCheckWin, {})
      })
    })
    f.connectOutFlow(brAuto, 1, () => {
      // —— MANUAL：胜利检查 ——
      f.callComposite(gstsCheckWin, {})
    })
    return {}
  }
})

// 打乱（exec）：随机生成 SCRAMBLE_LEN 步（避免相邻同层）→ 队列播放
const gstsScramble = g.defineComposite('gsts_scramble', {
  inputs: { target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ target }, f) => {
    const setLen = f.node('set_node_graph_variable', [new str('qLen'), new int(SCRAMBLE_LEN), new bool(false)])
    f.link(f.entry(), 0, setLen, 0)
    const setLast = f.node('set_node_graph_variable', [new str('lastMove'), new int(0), new bool(false)])
    f.link(setLen, 0, setLast, 0)
    // cur = last + rand(1..5)，>6 则 −6（保证不等于 last，均匀覆盖其余 5 层）
    f.finiteLoop(0n, SCRAMBLE_LEN, (i, _br) => {
      const last = f.getNodeGraphVariable('lastMove').asType('int')
      const raw = f.addition(last, f.getRandomInteger(1n, 5n))
      const needWrap = f.greaterThan(raw, 6n)
      f.doubleBranch(needWrap, () => {
        const cur = f.subtraction(raw, 6n)
        const setQ = f.node('set_or_add_key_value_pairs_to_dictionary', [f.getNodeGraphVariable('queue').asDict('int', 'int'), i, cur])
        const setM = f.node('set_node_graph_variable', [new str('lastMove'), cur, new bool(false)])
        f.connect(setQ, 0, setM, 0)
      }, () => {
        const setQ = f.node('set_or_add_key_value_pairs_to_dictionary', [f.getNodeGraphVariable('queue').asDict('int', 'int'), i, raw])
        const setM = f.node('set_node_graph_variable', [new str('lastMove'), raw, new bool(false)])
        f.connect(setQ, 0, setM, 0)
      })
    })
    // 启动播放：autoMode=true, qIdx=0, lock=true → do_move(queue[0])
    const setAuto = f.node('set_node_graph_variable', [new str('autoMode'), new bool(true), new bool(false)])
    const setIdx = f.node('set_node_graph_variable', [new str('qIdx'), new int(0), new bool(false)])
    f.connect(setAuto, 0, setIdx, 0)
    const setLock = f.node('set_node_graph_variable', [new str('lock'), new bool(true), new bool(false)])
    f.connect(setIdx, 0, setLock, 0)
    const mv0 = f.queryDictionaryValueByKey(f.getNodeGraphVariable('queue').asDict('int', 'int'), new int(0))
    f.callComposite(gstsDoMove, { moveId: mv0, target })
    return {}
  }
})

// 自动复原（exec，占位）：真实求解器（2×2 轮实装，宏库/微型 PDB）——
// 接入点：产出 queue + qLen → 启动队列播放（与 gstsScramble 相同尾部）
const gstsSolve = g.defineComposite('gsts_solve', {
  inputs: { target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: (_a, f) => {
    f.printString('rubik-solve-placeholder')
    f.callComposite(gstsCheckWin, {})
    return {}
  }
})

// 重置核心（exec）：销毁 8 角块 → 重建 → 逻辑/流程复位 → READY；
// 输出 8 个新块实体，宿主负责写 blocks（复合内 entity_list 数组字面量有编码缺口，v13 已验证路径）
const gstsResetCore = g.defineComposite('gsts_reset_core', {
  inputs: { stage: { type: 'entity' } },
  outputs: { c0: { type: 'entity' }, c1: { type: 'entity' }, c2: { type: 'entity' }, c3: { type: 'entity' }, c4: { type: 'entity' }, c5: { type: 'entity' }, c6: { type: 'entity' }, c7: { type: 'entity' } },
  outflows: ['done'],
  build: ({ stage }, f) => {
    // ① 销毁 8 角块（展开 + 显式链）
    const blocksVar = f.getNodeGraphVariable('blocks').asType('entity_list')
    const d0 = f.node('destroy_entity', [f.getCorrespondingValueFromList(blocksVar, 0n)])
    const d1 = f.node('destroy_entity', [f.getCorrespondingValueFromList(blocksVar, 1n)])
    const d2 = f.node('destroy_entity', [f.getCorrespondingValueFromList(blocksVar, 2n)])
    const d3 = f.node('destroy_entity', [f.getCorrespondingValueFromList(blocksVar, 3n)])
    const d4 = f.node('destroy_entity', [f.getCorrespondingValueFromList(blocksVar, 4n)])
    const d5 = f.node('destroy_entity', [f.getCorrespondingValueFromList(blocksVar, 5n)])
    const d6 = f.node('destroy_entity', [f.getCorrespondingValueFromList(blocksVar, 6n)])
    const d7 = f.node('destroy_entity', [f.getCorrespondingValueFromList(blocksVar, 7n)])
    f.link(f.entry(), 0, d0, 0)
    f.connect(d0, 0, d1, 0)
    f.connect(d1, 0, d2, 0)
    f.connect(d2, 0, d3, 0)
    f.connect(d3, 0, d4, 0)
    f.connect(d4, 0, d5, 0)
    f.connect(d5, 0, d6, 0)
    f.connect(d6, 0, d7, 0)
    // ② 重建（复用 gstsSpawnRubik，内部写 b0..b7）
    const cubes = f.callComposite(gstsSpawnRubik, { stage })
    f.connect(d7, 0, cubes, 0)
    // ③ 逻辑状态复位
    const logic = f.callComposite(gstsLogicReset, {})
    f.connect(cubes, 0, logic, 0)
    // ④ 流程复位（显式链）
    const offAuto = f.node('set_node_graph_variable', [new str('autoMode'), new bool(false), new bool(false)])
    const offSettled = f.node('set_node_graph_variable', [new str('settled'), new bool(false), new bool(false)])
    const zeroLen = f.node('set_node_graph_variable', [new str('qLen'), new int(0), new bool(false)])
    const zeroIdx = f.node('set_node_graph_variable', [new str('qIdx'), new int(0), new bool(false)])
    const zeroLast = f.node('set_node_graph_variable', [new str('lastMove'), new int(0), new bool(false)])
    const offLock = f.node('set_node_graph_variable', [new str('lock'), new bool(false), new bool(false)])
    f.connect(logic, 0, offAuto, 0)
    f.connect(offAuto, 0, offSettled, 0)
    f.connect(offSettled, 0, zeroLen, 0)
    f.connect(zeroLen, 0, zeroIdx, 0)
    f.connect(zeroIdx, 0, zeroLast, 0)
    f.connect(zeroLast, 0, offLock, 0)
    f.outflow('done', offLock, 0)
    return { c0: cubes.c0, c1: cubes.c1, c2: cubes.c2, c3: cubes.c3, c4: cubes.c4, c5: cubes.c5, c6: cubes.c6, c7: cubes.c7 }
  }
})

// 选项分派（exec）：锁着时忽略一切；tabId 1-6 手动转动 / 7 打乱 / 8 复原
// （9 重置由宿主分支处理：需要宿主写 blocks，见 whenTabIsSelected）
const gstsTabDispatch = g.defineComposite('gsts_tab_dispatch', {
  inputs: { tabId: { type: 'int' }, target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ tabId, target }, f) => {
    const isLocked = f.equal(f.getNodeGraphVariable('lock').asType('bool'), true)
    const brLock = f.node('double_branch', [isLocked])
    f.link(f.entry(), 0, brLock, 0)
    f.connectOutFlow(brLock, 0, () => {})
    f.connectOutFlow(brLock, 1, () => {
      // 未锁：1-6 转动 or 功能选项（注：connectOutFlow 索引 0=真分支 1=假分支，2026-08-17 日志实证）
      const isMove = f.logicalAndOperation(
        f.greaterThan(tabId, 0),
        f.logicalNotOperation(f.greaterThan(tabId, 6))
      )
      const brMove = f.node('double_branch', [isMove])
      f.link(brLock, 1, brMove, 0)
      f.connectOutFlow(brMove, 0, () => {
        // 手动转动：锁门（done 只在未锁时触发）+ do_move
        f.callComposite(gstsTabLock, {})
        f.callComposite(gstsDoMove, { moveId: tabId, target })
      })
      f.connectOutFlow(brMove, 1, () => {
        f.multipleBranches(tabId, {
          7: () => f.callComposite(gstsScramble, { target }),
          8: () => f.callComposite(gstsSolve, { target }),
          default: () => {}
        })
      })
    })
    return {}
  }
})

// ================================================================
// 既有复合（2026-08-14 已验证，原样保留）
// ================================================================

// 罗德里格斯复合：v 绕单位轴 u 旋转 θ（c=cosθ, s=sinθ）
const gstsRotateVec = g.defineComposite('gsts_rotate_vec', {
  inputs: { v: { type: 'vec3' }, u: { type: 'vec3' }, c: { type: 'float' }, s: { type: 'float' } },
  outputs: { out: { type: 'vec3' } },
  build: ({ v, u, c, s }, f) => {
    const vp = f._3dVectorZoom(u, f._3dVectorDotProduct(u, v))
    const out = f._3dVectorAddition(
      f._3dVectorAddition(vp, f._3dVectorZoom(f._3dVectorSubtraction(v, vp), c)),
      f._3dVectorZoom(f._3dVectorCrossProduct(u, v), s)
    )
    return { out }
  }
})

// 轨道段位置复合：p_k = vp + vPerp·c + axv·s
const gstsOrbitPoint = g.defineComposite('gsts_orbit_point', {
  inputs: {
    vp: { type: 'vec3' },
    vPerp: { type: 'vec3' },
    axv: { type: 'vec3' },
    c: { type: 'float' },
    s: { type: 'float' }
  },
  outputs: { p: { type: 'vec3' } },
  build: ({ vp, vPerp, axv, c, s }, f) => {
    const p = f._3dVectorAddition(vp, f._3dVectorAddition(f._3dVectorZoom(vPerp, c), f._3dVectorZoom(axv, s)))
    return { p }
  }
})

// 单轴局部旋转复合：v 绕 u 旋转 angle（deg）
const gstsLocalAxisRot = g.defineComposite('gsts_local_axis_rot', {
  inputs: { v: { type: 'vec3' }, angle: { type: 'float' }, u: { type: 'vec3' } },
  outputs: { out: { type: 'vec3' } },
  build: ({ v, angle, u }, f) => {
    const rad = f.multiplication(angle, DEG2RAD)
    const out = f.callComposite(gstsRotateVec, {
      v, u,
      c: f.cosineFunction(rad),
      s: f.multiplication(f.sineFunction(rad), -1)
    }).out
    return { out }
  }
})

// 三轴局部旋转复合：Y→X→Z 依次把世界轴转进块局部系
const gstsSpinAxisTriple = g.defineComposite('gsts_spin_axis_triple', {
  inputs: { v: { type: 'vec3' }, rot: { type: 'vec3' } },
  outputs: { out: { type: 'vec3' } },
  build: ({ v, rot }, f) => {
    const v1 = f.callComposite(gstsLocalAxisRot, { v, angle: rot.y, u: f.create3dVector(0, 1, 0) }).out
    const v2 = f.callComposite(gstsLocalAxisRot, { v: v1, angle: rot.x, u: f.create3dVector(1, 0, 0) }).out
    const out = f.callComposite(gstsLocalAxisRot, { v: v2, angle: rot.z, u: f.create3dVector(0, 0, 1) }).out
    return { out }
  }
})

// 自旋块复合（exec）：世界层轴 → 块局部系（罗德里格斯×3）+ 添加自旋运动器
const gstsSpinBlock = g.defineComposite('gsts_spin_block', {
  inputs: {
    e: { type: 'entity' },
    axis: { type: 'vec3' },
    duration: { type: 'float' },
    angularVelocity: { type: 'float' }
  },
  outputs: {},
  outflows: ['done'],
  build: ({ e, axis, duration, angularVelocity }, f) => {
    const rot = f.getEntityLocationAndRotation(e).rotate
    const localAxis = f.callComposite(gstsSpinAxisTriple, { v: axis, rot }).out
    // 第 4 参是角速度（°/s）。面转 0.3s×300°/s、整体转 0.6s×150°/s 均为 90°。
    const tail = f.registerExecNode('add_uniform_basic_rotation_based_motion_device', [
      e,
      new str('spin'),
      duration,
      angularVelocity,
      localAxis
    ])
    f.outflow('done', tail, 0)
    return {}
  }
})

// 轨道段运动器复合（exec）：查 blocks[i] + 添加 0.2s 线性运动器
const gstsOrbitSegment = g.defineComposite('gsts_orbit_segment', {
  inputs: { i: { type: 'int' }, name: { type: 'str' }, vel: { type: 'vec3' } },
  outputs: {},
  outflows: ['done'],
  build: ({ i, name, vel }, f) => {
    const e = f.getCorrespondingValueFromList(
      f.getNodeGraphVariable('blocks').asType('entity_list'),
      i
    )
    const tail = f.registerExecNode('add_uniform_basic_linear_motion_device', [
      e,
      name,
      f.getNodeGraphVariable('segmentDuration').asType('float'),
      vel
    ])
    f.outflow('done', tail, 0)
    return {}
  }
})

// 轨道起点分解复合（纯数据）：位置差分解 v0/vp/vPerp/axv
const gstsOrbitPrep = g.defineComposite('gsts_orbit_prep', {
  inputs: { e: { type: 'entity' }, axis: { type: 'vec3' }, center: { type: 'vec3' } },
  outputs: { v0: { type: 'vec3' }, vp: { type: 'vec3' }, vPerp: { type: 'vec3' }, axv: { type: 'vec3' } },
  build: ({ e, axis, center }, f) => {
    const loc = f.getEntityLocationAndRotation(e).location
    const v0 = f._3dVectorSubtraction(loc, center)
    const vp = f._3dVectorZoom(axis, f._3dVectorDotProduct(axis, v0))
    const vPerp = f._3dVectorSubtraction(v0, vp)
    const axv = f._3dVectorCrossProduct(axis, vPerp)
    return { v0, vp, vPerp, axv }
  }
})

// 轨道单段复合：p_k 位置 + vel_k 速度
const gstsOrbitStep = g.defineComposite('gsts_orbit_step', {
  inputs: { vp: { type: 'vec3' }, vPerp: { type: 'vec3' }, axv: { type: 'vec3' }, c: { type: 'float' }, s: { type: 'float' }, prev: { type: 'vec3' }, kVel: { type: 'float' } },
  outputs: { p: { type: 'vec3' }, vel: { type: 'vec3' } },
  build: ({ vp, vPerp, axv, c, s, prev, kVel }, f) => {
    const p = f.callComposite(gstsOrbitPoint, { vp, vPerp, axv, c, s }).p
    const vel = f._3dVectorZoom(f._3dVectorSubtraction(p, prev), kVel)
    return { p, vel }
  }
})

const gstsOrbitVelocity = g.defineComposite('gsts_orbit_velocity', {
  inputs: { e: { type: 'entity' }, axis: { type: 'vec3' }, center: { type: 'vec3' }, kVel: { type: 'float' } },
  outputs: { vel1: { type: 'vec3' }, vel2: { type: 'vec3' } },
  build: ({ e, axis, center, kVel }, f) => {
    const prep = f.callComposite(gstsOrbitPrep, { e, axis, center })
    const s1 = f.callComposite(gstsOrbitStep, { vp: prep.vp, vPerp: prep.vPerp, axv: prep.axv, c: C1, s: S1, prev: prep.v0, kVel })
    const s2 = f.callComposite(gstsOrbitStep, { vp: prep.vp, vPerp: prep.vPerp, axv: prep.axv, c: C2, s: S2, prev: s1.p, kVel })
    return { vel1: s1.vel, vel2: s2.vel }
  }
})

const gstsOrbitStore = g.defineComposite('gsts_orbit_store', {
  inputs: { i: { type: 'int' }, vel1: { type: 'vec3' }, vel2: { type: 'vec3' } },
  outputs: {},
  outflows: ['done'],
  build: ({ i, vel1, vel2 }, f) => {
    const d1 = f.registerExecNode('set_list_value', [
      f.getNodeGraphVariable('vels1').asType('vec3_list'), i, vel1
    ])
    const d2 = f.registerExecNode('set_list_value', [
      f.getNodeGraphVariable('vels2').asType('vec3_list'), i, vel2
    ])
    f.connect(d1, 0, d2, 0)
    f.outflow('done', d2, 0)
    return {}
  }
})

// ================================================================
// 废弃占位复合（2026-08-20 生命周期管理示范，勿删）：
// 四个层判断复合已无任何调用（turn_check→turn_lookup 查表改造）。按"改名保留定义"规则
// 统一加 `_deprecated` 后缀标注废弃状态——**不删除定义**：defineComposite 按定义顺序自动分配
// 复合 ID，删除会让后续复合（orbit_scheduler 等）ID 整体前移；注入器 merge 复合定义表只覆盖
// 同 ID、不删除地图残留旧 def → 残留旧 def 引用被覆盖的 ID → 类型错位 → 游戏拒载。
// 改名/改实现 = 安全（ID 不变，注入同 ID 覆盖）；删除 = 需先完成 open-items O5 治本。
// 注：当前编译器会剔除未调用定义，这些废弃复合不进 GIA（空洞），ID 由顺序占位保住。
// ================================================================

// Tab 轴标志复合（废弃占位，保 ID 稳定；原实现见 git HEAD）
const gstsTabAxisFlagsDeprecated = g.defineComposite('gsts_tab_axis_flags_deprecated', {
  inputs: { tabId: { type: 'int' } },
  outputs: { isR: { type: 'bool' }, isL: { type: 'bool' }, isU: { type: 'bool' }, isD: { type: 'bool' }, isF: { type: 'bool' }, isB: { type: 'bool' } },
  build: ({ tabId }, f) => {
    return {
      isR: f.equal(tabId, 1),
      isL: f.equal(tabId, 2),
      isU: f.equal(tabId, 3),
      isD: f.equal(tabId, 4),
      isF: f.equal(tabId, 5),
      isB: f.equal(tabId, 6)
    }
  }
})

// 命中块查表复合（纯数据，2026-08-20 性能优化）：i = 槽位 0..3（do_move 注册的块事件
// timerSequenceId），tempP[i] = 逻辑层 apply_move 已按 tblFrom 表算出的命中块编号——
// 不再读取实体位置做层判断（原 gsts_turn_check 的位置层判断链整体移除，帧数大幅下降）
const gstsTurnLookup = g.defineComposite('gsts_turn_lookup', {
  inputs: { i: { type: 'int' }, tabId: { type: 'int' } },
  outputs: { piece: { type: 'int' }, e: { type: 'entity' }, axis: { type: 'vec3' } },
  build: ({ i, tabId }, f) => {
    const piece = f.getCorrespondingValueFromList(
      f.getNodeGraphVariable('tempP').asType('int_list'),
      i
    )
    const e = f.getCorrespondingValueFromList(
      f.getNodeGraphVariable('blocks').asType('entity_list'),
      piece
    )
    const axis = f.getCorrespondingValueFromList(
      f.getNodeGraphVariable('axes').asType('vec3_list'),
      tabId
    )
    return { piece, e, axis }
  }
})

// 转动一块复合（exec，2026-08-20 性能优化）：块事件必为命中块（查表确定，无分支），
// 直接执行 自旋 + 轨道速度预计算 + 速度存储 + orbit1 运动器（原 doubleBranch 分支删除）
const gstsTurnBlock = g.defineComposite('gsts_turn_block', {
  inputs: { i: { type: 'int' }, tabId: { type: 'int' }, center: { type: 'vec3' } },
  outputs: { piece: { type: 'int' } },
  outflows: ['done'],
  build: ({ i, tabId, center }, f) => {
    const t = f.callComposite(gstsTurnLookup, { i, tabId })
    const v = f.callComposite(gstsOrbitVelocity, {
      e: t.e,
      axis: t.axis,
      center,
      kVel: f.getNodeGraphVariable('orbitKVel').asType('float')
    })
    const spin = f.callComposite(gstsSpinBlock, {
      e: t.e,
      axis: t.axis,
      duration: f.getNodeGraphVariable('turnDuration').asType('float'),
      angularVelocity: f.getNodeGraphVariable('angularVelocity').asType('float')
    })
    const store = f.callComposite(gstsOrbitStore, {
      i: t.piece,
      vel1: v.vel1,
      vel2: v.vel2
    })
    const m1 = f.registerExecNode('add_uniform_basic_linear_motion_device', [
      t.e,
      new str('orbit1'),
      f.getNodeGraphVariable('segmentDuration').asType('float'),
      v.vel1
    ])
    f.connect(spin, 0, store, 0)
    f.connect(store, 0, m1, 0)
    f.outflow('done', m1, 0)
    return { piece: t.piece }
  }
})

// 角块创建复合（exec）：createPrefab 动作入复合，8 块共用
const gstsCreateCorner = g.defineComposite('gsts_create_corner', {
  inputs: {
    pid: { type: 'prefab_id' },
    stage: { type: 'entity' },
    x: { type: 'float' },
    y: { type: 'float' },
    z: { type: 'float' }
  },
  outputs: { e: { type: 'entity' } },
  outflows: ['done'],
  build: ({ pid, stage, x, y, z }, f) => {
    const e = f.createPrefab(
      pid,
      f.create3dVector(x, y, z),
      f.create3dVector(0, 0, 0),
      stage,
      false,
      0,
      new listLiteral('int')
    )
    const meta = (e as unknown as { getMetadata?: () => { record?: { id: number } } }).getMetadata?.()
    if (meta?.record) f.outflow('done', meta.record as never, 0)
    return { e }
  }
})

// 魔方生成复合（exec）：8 × create_corner + b0-b7 变量写入
const gstsSpawnRubik = g.defineComposite('gsts_spawn_rubik', {
  inputs: { stage: { type: 'entity' } },
  outputs: { c0: { type: 'entity' }, c1: { type: 'entity' }, c2: { type: 'entity' }, c3: { type: 'entity' }, c4: { type: 'entity' }, c5: { type: 'entity' }, c6: { type: 'entity' }, c7: { type: 'entity' } },
  outflows: ['done'],
  build: ({ stage }, f) => {
    const c0 = f.callComposite(gstsCreateCorner, { pid: 1077936129n, stage, x: 2.5, y: 2.5, z: 2.5 }).e
    f.setNodeGraphVariable('b0', c0, false)
    const c1 = f.callComposite(gstsCreateCorner, { pid: 1077936130n, stage, x: 3.5, y: 2.5, z: 2.5 }).e
    f.setNodeGraphVariable('b1', c1, false)
    const c2 = f.callComposite(gstsCreateCorner, { pid: 1077936131n, stage, x: 2.5, y: 2.5, z: 3.5 }).e
    f.setNodeGraphVariable('b2', c2, false)
    const c3 = f.callComposite(gstsCreateCorner, { pid: 1077936132n, stage, x: 3.5, y: 2.5, z: 3.5 }).e
    f.setNodeGraphVariable('b3', c3, false)
    const c4 = f.callComposite(gstsCreateCorner, { pid: 1077936133n, stage, x: 2.5, y: 3.5, z: 2.5 }).e
    f.setNodeGraphVariable('b4', c4, false)
    const c5 = f.callComposite(gstsCreateCorner, { pid: 1077936134n, stage, x: 3.5, y: 3.5, z: 2.5 }).e
    f.setNodeGraphVariable('b5', c5, false)
    const c6 = f.callComposite(gstsCreateCorner, { pid: 1077936135n, stage, x: 2.5, y: 3.5, z: 3.5 }).e
    f.setNodeGraphVariable('b6', c6, false)
    const c7Call = f.callComposite(gstsCreateCorner, { pid: 1077936136n, stage, x: 3.5, y: 3.5, z: 3.5 })
    const c7 = c7Call.e
    const setB7 = f.node('set_node_graph_variable', [new str('b7'), c7, new bool(false)])
    f.link(c7Call as never, 0, setB7, 0)
    f.outflow('done', setB7, 0)
    return { c0, c1, c2, c3, c4, c5, c6, c7 }
  }
})

// Tab 锁门复合（exec）：done 只在未锁分支触发（set lock 后）
const gstsTabLock = g.defineComposite('gsts_tab_lock', {
  inputs: {},
  outputs: {},
  outflows: ['done'],
  build: (_i, f) => {
    const isFree = f.equal(f.getNodeGraphVariable('lock').asType('bool'), false)
    const br = f.node('double_branch', [isFree])
    f.link(f.entry(), 0, br, 0)
    f.connectOutFlow(br, 0, () => {
      const setLock = f.node('set_node_graph_variable', [new str('lock'), new bool(true), new bool(false)])
      f.link(br, 0, setLock, 0)
      f.outflow('done', setLock, 0)
    })
    f.connectOutFlow(br, 1, () => {})
    return {}
  }
})

// —— 废弃占位复合（保 ID 稳定，勿删；详见 gstsTabAxisFlagsDeprecated 上注释）——

// 坐标轴比较复合（废弃占位，原实现见 git HEAD）
const gstsAxisCompareDeprecated = g.defineComposite('gsts_axis_compare_deprecated', {
  inputs: { coord: { type: 'float' }, isPos: { type: 'bool' }, isNeg: { type: 'bool' } },
  outputs: { hit: { type: 'bool' } },
  build: ({ coord, isPos, isNeg }, f) => ({
    hit: f.logicalOrOperation(
      f.logicalAndOperation(isPos, f.greaterThan(coord, 3)),
      f.logicalAndOperation(isNeg, f.lessThan(coord, 3))
    )
  })
})

// 块层命中复合（废弃占位，原实现见 git HEAD）
const gstsLayerHitDeprecated = g.defineComposite('gsts_layer_hit_deprecated', {
  inputs: {
    e: { type: 'entity' },
    isR: { type: 'bool' },
    isL: { type: 'bool' },
    isU: { type: 'bool' },
    isD: { type: 'bool' },
    isF: { type: 'bool' },
    isB: { type: 'bool' }
  },
  outputs: { hit: { type: 'bool' } },
  build: ({ e, isR, isL, isU, isD, isF, isB }, f) => {
    const loc = f.getEntityLocationAndRotation(e).location
    const hit = f.callComposite(gstsInLayerDeprecated, {
      x: loc.x,
      y: loc.y,
      z: loc.z,
      isR,
      isL,
      isU,
      isD,
      isF,
      isB
    }).hit
    return { hit }
  }
})

const gstsInLayerDeprecated = g.defineComposite('gsts_in_layer_deprecated', {
  inputs: {
    x: { type: 'float' },
    y: { type: 'float' },
    z: { type: 'float' },
    isR: { type: 'bool' },
    isL: { type: 'bool' },
    isU: { type: 'bool' },
    isD: { type: 'bool' },
    isF: { type: 'bool' },
    isB: { type: 'bool' }
  },
  outputs: { hit: { type: 'bool' } },
  build: ({ x, y, z, isR, isL, isU, isD, isF, isB }, f) => {
    const hit = f.logicalOrOperation(
      f.logicalOrOperation(
        f.callComposite(gstsAxisCompareDeprecated, { coord: x, isPos: isR, isNeg: isL }).hit,
        f.callComposite(gstsAxisCompareDeprecated, { coord: y, isPos: isU, isNeg: isD }).hit
      ),
      f.callComposite(gstsAxisCompareDeprecated, { coord: z, isPos: isF, isNeg: isB }).hit
    )
    return { hit }
  }
})

// 轨道段调度复合（exec）：按 seg 分发 → 查 velsN 字典 → orbit_segment；seg=3 后 +250ms 解锁
const gstsOrbitSegmentDispatch = g.defineComposite('gsts_orbit_segment_dispatch', {
  inputs: { i: { type: 'int' }, seg: { type: 'int' }, target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ i, seg, target }, f) => {
    f.multipleBranches(seg, {
      0: () => {
        const vel = f.getCorrespondingValueFromList(
          f.getNodeGraphVariable('vels2').asType('vec3_list'), i
        )
        f.callComposite(gstsOrbitSegment, { i, name: new str('orbit2'), vel })
        // 解锁改由 do_move 的单一 'unlock' 定时器触发（2026-08-18 方案 B）
      },
      default: () => {}
    })
    return {}
  }
})

// 轨道定时器设置复合（exec）：1 个序列定时器 [0.2, 0.4, 0.6, 0.8]
const gstsOrbitScheduler = g.defineComposite('gsts_orbit_scheduler', {
  inputs: { i: { type: 'int' }, target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ i, target }, f) => {
    const tname = f.dataTypeConversion(i, 'str')
    const t = f.registerExecNode('start_timer', [
      target,
      tname,
      new bool(false),
      f.assemblyList([f.getNodeGraphVariable('segmentDuration').asType('float')], 'float')
    ])
    f.outflow('done', t, 0)
    return {}
  }
})

// 轨道定时器触发复合（事件流）：whenTimerIsTriggered 按 timerName 分发；unlock 时解锁 + afterTurn
const gstsOrbitTrigger = g.defineComposite('gsts_orbit_trigger', {
  inputs: {},
  outputs: {},
  build: (_a, f) => {
    f.on('whenTimerIsTriggered', (evt: any, ef: any) => {
      f.multipleBranches(evt.timerName as never, {
        // 2026-08-19 变量优化：8 分支保留，但每次先设局部变量 curBlock，调用复合时全用该变量作参数源，
        // 复合不再按常量特化 8 份（引擎不支持 str→int，timerName 无法直接转块索引）
        '0': () => { ef.setNodeGraphVariable('curBlock', new int(0), false); ef.callComposite(gstsOrbitSegmentDispatch, { i: ef.getNodeGraphVariable('curBlock').asType('int'), seg: evt.timerSequenceId as never, target: evt.eventSourceEntity }) },
        '1': () => { ef.setNodeGraphVariable('curBlock', new int(1), false); ef.callComposite(gstsOrbitSegmentDispatch, { i: ef.getNodeGraphVariable('curBlock').asType('int'), seg: evt.timerSequenceId as never, target: evt.eventSourceEntity }) },
        '2': () => { ef.setNodeGraphVariable('curBlock', new int(2), false); ef.callComposite(gstsOrbitSegmentDispatch, { i: ef.getNodeGraphVariable('curBlock').asType('int'), seg: evt.timerSequenceId as never, target: evt.eventSourceEntity }) },
        '3': () => { ef.setNodeGraphVariable('curBlock', new int(3), false); ef.callComposite(gstsOrbitSegmentDispatch, { i: ef.getNodeGraphVariable('curBlock').asType('int'), seg: evt.timerSequenceId as never, target: evt.eventSourceEntity }) },
        '4': () => { ef.setNodeGraphVariable('curBlock', new int(4), false); ef.callComposite(gstsOrbitSegmentDispatch, { i: ef.getNodeGraphVariable('curBlock').asType('int'), seg: evt.timerSequenceId as never, target: evt.eventSourceEntity }) },
        '5': () => { ef.setNodeGraphVariable('curBlock', new int(5), false); ef.callComposite(gstsOrbitSegmentDispatch, { i: ef.getNodeGraphVariable('curBlock').asType('int'), seg: evt.timerSequenceId as never, target: evt.eventSourceEntity }) },
        '6': () => { ef.setNodeGraphVariable('curBlock', new int(6), false); ef.callComposite(gstsOrbitSegmentDispatch, { i: ef.getNodeGraphVariable('curBlock').asType('int'), seg: evt.timerSequenceId as never, target: evt.eventSourceEntity }) },
        '7': () => { ef.setNodeGraphVariable('curBlock', new int(7), false); ef.callComposite(gstsOrbitSegmentDispatch, { i: ef.getNodeGraphVariable('curBlock').asType('int'), seg: evt.timerSequenceId as never, target: evt.eventSourceEntity }) },
        'turnblock': () => {
          // 槽位 0..3（面转）或 0..7（整体转）；tempP 始终给出本轮命中块编号。
          const slot = evt.timerSequenceId as never
          ef.callComposite(gstsTurnOne, { i: slot, target: evt.eventSourceEntity })
          const isLast = ef.equal(slot, ef.getNodeGraphVariable('turnLastSlot').asType('int'))
          ef.doubleBranch(isLast, () => {
            // 从最后一个块实际启动时刻计完整轨道时长，负载抖动不会提前解锁。
            ef.registerExecNode('start_timer', [
              evt.eventSourceEntity,
              new str('unlock'),
              new bool(false),
              ef.assemblyList([ef.getNodeGraphVariable('turnCompletionDelay').asType('float')], 'float')
            ])
          }, () => {})
        },
        'unlock': () => {
          // 解锁 + 转动完成钩子（胜利检查 / 队列推进）
          ef.setNodeGraphVariable('lock', false, false)
          ef.callComposite(gstsAfterTurn, { target: evt.eventSourceEntity })
        },
        default: () => {}
      })
    })
    return {}
  }
})

// ================================================================
// 整体旋转扩展（追加定义，保持既有复合 ID 顺序稳定）

const gstsLogicWriteWholeSlot = g.defineComposite('gsts_logic_write_whole_slot', {
  inputs: { transformId: { type: 'int' }, slot: { type: 'int' } },
  outputs: {},
  outflows: ['done'],
  build: ({ transformId, slot }, f) => {
    const wholeTo = f.getNodeGraphVariable('wholeTo').asType('int_list')
    const wholeTwist = f.getNodeGraphVariable('wholeTwist').asType('int_list')
    const tempP = f.getNodeGraphVariable('tempP').asType('int_list')
    const tempT = f.getNodeGraphVariable('tempT').asType('int_list')
    const cornerPos = f.getNodeGraphVariable('cornerPos').asType('int_list')
    const cornerOrient = f.getNodeGraphVariable('cornerOrient').asType('int_list')
    const tempQ = f.getNodeGraphVariable('tempQ').asType('int_list')
    const qv = f.getCorrespondingValueFromList(
      wholeTo,
      f.addition(f.multiplication(transformId, 8n), slot)
    )
    const q1 = f.node('set_list_value', [tempQ, new int(0), qv])
    f.link(f.entry(), 0, q1, 0)
    const q = f.getCorrespondingValueFromList(tempQ, 0n)
    const twistIndex = f.addition(
      f.addition(f.multiplication(transformId, 24n), f.multiplication(slot, 3n)),
      f.getCorrespondingValueFromList(tempT, slot)
    )
    const tw = f.getCorrespondingValueFromList(wholeTwist, twistIndex)
    const piece = f.getCorrespondingValueFromList(tempP, slot)
    const s1 = f.node('set_list_value', [cornerPos, q, piece])
    const s2 = f.node('set_list_value', [cornerOrient, q, tw])
    f.connect(q1, 0, s1, 0)
    f.connect(s1, 0, s2, 0)
    f.outflow('done', s2, 0)
    return {}
  }
})

const gstsLogicApplyWhole = g.defineComposite('gsts_logic_apply_whole', {
  inputs: { transformId: { type: 'int' } },
  outputs: {},
  outflows: ['done'],
  build: ({ transformId }, f) => {
    const tempP = f.getNodeGraphVariable('tempP').asType('int_list')
    const tempT = f.getNodeGraphVariable('tempT').asType('int_list')
    const cornerPos = f.getNodeGraphVariable('cornerPos').asType('int_list')
    const cornerOrient = f.getNodeGraphVariable('cornerOrient').asType('int_list')
    // wholeFrom 恒为 identity（fromPos = 0..7），整体转 8 槽全参与，直接 slot 即源位置
    let previous: any = f.entry()
    for (let slot = 0n; slot < 8n; slot++) {
      const piece = f.getCorrespondingValueFromList(cornerPos, slot)
      const twist = f.getCorrespondingValueFromList(cornerOrient, slot)
      const slotValue = new int(Number(slot))
      const setP = f.node('set_list_value', [tempP, slotValue, piece])
      const setT = f.node('set_list_value', [tempT, slotValue, twist])
      if (slot === 0n) f.link(f.entry(), 0, setP, 0)
      else f.connect(previous, 0, setP, 0)
      f.connect(setP, 0, setT, 0)
      previous = setT
    }
    for (let slot = 0n; slot < 8n; slot++) {
      const write = f.callComposite(gstsLogicWriteWholeSlot, { transformId, slot })
      f.connect(previous, 0, write, 0)
      previous = write
    }
    f.outflow('done', previous, 0)
    return {}
  }
})

const gstsDoWhole = g.defineComposite('gsts_do_whole', {
  inputs: { transformId: { type: 'int' }, target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ transformId, target }, f) => {
    f.setNodeGraphVariable('turnLastSlot', new int(7), false)
    f.setNodeGraphVariable('turnDuration', new float(0.6), false)
    f.setNodeGraphVariable('segmentDuration', new float(0.3), false)
    f.setNodeGraphVariable('orbitKVel', new float(K_VEL / 2), false)
    f.setNodeGraphVariable('angularVelocity', new float(150), false)
    f.setNodeGraphVariable('turnCompletionDelay', new float(0.65), false)
    f.callComposite(gstsLogicApplyWhole, { transformId })
    f.setNodeGraphVariable('curMove', f.addition(transformId, 10n), false)
    const times = f.getNodeGraphVariable('wholeTurnTimes').asType('float_list')
    const t0 = f.node('set_list_value', [times, new int(0), new float(0.03)])
    const t1 = f.node('set_list_value', [times, new int(1), new float(0.05)])
    const t2 = f.node('set_list_value', [times, new int(2), new float(0.07)])
    const t3 = f.node('set_list_value', [times, new int(3), new float(0.09)])
    const t4 = f.node('set_list_value', [times, new int(4), new float(0.11)])
    const t5 = f.node('set_list_value', [times, new int(5), new float(0.13)])
    const t6 = f.node('set_list_value', [times, new int(6), new float(0.15)])
    const t7 = f.node('set_list_value', [times, new int(7), new float(0.17)])
    f.connect(t0, 0, t1, 0)
    f.connect(t1, 0, t2, 0)
    f.connect(t2, 0, t3, 0)
    f.connect(t3, 0, t4, 0)
    f.connect(t4, 0, t5, 0)
    f.connect(t5, 0, t6, 0)
    f.connect(t6, 0, t7, 0)
    f.connect(t7, 0, f.registerExecNode('start_timer', [
      target, new str('turnblock'), new bool(false), times
    ]), 0)
    return {}
  }
})

const graph = g
  .server({
    id: 1073741825,
    variables: {
      // —— 流程层 ——
      lock: false, // 输入锁（转动期间忽略新输入）
      autoMode: false, // 队列播放模式（打乱/自动复原共用）
      settled: false, // 已结算（防重复胜利结算）
      qLen: new int(0), // 队列长度
      qIdx: new int(0), // 当前播放下标
      lastMove: new int(0), // 打乱生成时上一动（避免相邻同层）
      queue: dict([{ k: 0, v: new int(0) }]), // 播放队列（moveId 序列）
      // —— 逻辑状态层（单一事实源，已还原初始态）——
      cornerPos: [0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n], // int_list：位置→块编号
      cornerOrient: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n], // int_list：位置→朝向 0/1/2
      targetPos: [0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n], // 小模板对应的严格目标状态
      targetOrient: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
      tempP: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n], // apply 暂存；整体转使用全部 8 槽
      tempT: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n],
      tempQ: [0n], // int_list：write_slot 暂存 q（避免多消费重复求值）
      faceTurnTimes: [0.03, 0.05, 0.07, 0.09], // 面转：4 块启动时间
      wholeTurnTimes: [0.03, 0.05, 0.07, 0.09, 0.11, 0.13, 0.15, 0.17], // 整体转：8 块错峰启动时间
      turnLastSlot: new int(3), // 当前动作的最后启动槽位；由其相对时刻开启 unlock
      turnDuration: new float(0.3),
      segmentDuration: new float(0.15),
      orbitKVel: new float(K_VEL),
      angularVelocity: new float(300),
      turnCompletionDelay: new float(0.35),
      curMove: new int(0), // 当前动作（块事件触发时读取）
      curBlock: new int(0), // orbit 分支局部变量（复合参数源，避免按常量特化 8 份）
      // —— 2×2 逻辑状态 move 置换表（tools/gen-2x2-logic-table.mjs 生成，CubeLib 验证）——
      // key = moveId*4+slot（from/to）或 moveId*12+slot*3+twist（twistMap）
      tblFrom: [0n, 0n, 0n, 0n, 7n, 3n, 1n, 5n, 6n, 2n, 0n, 4n, 1n, 3n, 2n, 0n, 5n, 7n, 6n, 4n, 2n, 3n, 7n, 6n, 0n, 1n, 5n, 4n], // index = moveId*4+slot
      tblTo: [0n, 0n, 0n, 0n, 3n, 1n, 5n, 7n, 4n, 6n, 2n, 0n, 3n, 2n, 0n, 1n, 4n, 5n, 7n, 6n, 3n, 7n, 6n, 2n, 4n, 0n, 1n, 5n],
      tblTwist: [0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n] // index = moveId*12+slot*3+twist
       ,
       // 整体转 transformId=0/1：from/to = id*8+slot；twist = id*24+slot*3+twist
       wholeFrom: [0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n, 0n, 1n, 2n, 3n, 4n, 5n, 6n, 7n],
       wholeTo: [4n, 5n, 0n, 1n, 6n, 7n, 2n, 3n, 1n, 3n, 0n, 2n, 5n, 7n, 4n, 6n],
       wholeTwist: [1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n, 0n, 2n, 1n],
      // —— 表现层（既有）——
      b0: entity(0),
      b1: entity(0),
      b2: entity(0),
      b3: entity(0),
      b4: entity(0),
      b5: entity(0),
      b6: entity(0),
      b7: entity(0),
      // v5.4：块列表（循环遍历）+ 层轴字典 + 5 个速度字典（key=块索引 0..7）
      blocks: [entity(0), entity(0), entity(0), entity(0), entity(0), entity(0), entity(0), entity(0)],
      axes: [
        vec3([0, 0, 0]), // index 0 占位（tabId 从 1 开始）
        vec3([1, 0, 0]), // 1 R：x+ 层绕 X 正转（2026-08-20 修正：原 -X 与 tblTo 表方向不符，日志 fin-pos 实证错位）
        vec3([-1, 0, 0]), // 2 L：x− 层绕 X 负转（同上修正）
        vec3([0, -1, 0]), // 3 U：y+ 层绕 Y 负转
        vec3([0, 1, 0]), // 4 D：y− 层绕 Y 正转
        vec3([0, 0, 1]), // 5 F：z+ 层绕 Z 正转（同上修正）
        vec3([0, 0, -1]), // 6 B：z− 层绕 Z 负转（同上修正）
        vec3([0, 0, 0]), // 7-9 功能选项占位
        vec3([0, 0, 0]),
        vec3([0, 0, 0]),
        vec3([1, 0, 0]), // 10 整体 X：与 R 的几何方向一致
        vec3([0, -1, 0]) // 11 整体 Y：与 U 的几何方向一致
      ],
      vels1: [vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0])],
      vels2: [vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0]), vec3([0, 0, 0])],

    }
  })
  .on('whenEntityIsCreated', (_evt, f) => {
    // 创建 8 角块 + 写 blocks（v5 已验证路径）；逻辑状态由变量初始值给出（已还原）
    const cubes = f.callComposite(gstsSpawnRubik, { stage })
    f.setNodeGraphVariable('blocks', [cubes.c0, cubes.c1, cubes.c2, cubes.c3, cubes.c4, cubes.c5, cubes.c6, cubes.c7], false)
    // 实例化定时器触发复合（纯事件流）：unlock 事件驱动 afterTurn
    f.callComposite(gstsOrbitTrigger, {})
  })
  .on('whenTabIsSelected', (evt, f) => {
    // 9 重置：宿主分支（需要宿主写 blocks——复合内 entity_list 数组字面量缺口）
    f.doubleBranch(
      f.equal(evt.tabId, 9),
      () => {
        const r = f.callComposite(gstsResetCore, { stage })
        f.setNodeGraphVariable('blocks', [r.c0, r.c1, r.c2, r.c3, r.c4, r.c5, r.c6, r.c7], false)
      },
      () => {
        // 10/11 是整体 X/Y 转；其余 1-8 保持既有分派，9 仍由上层重置分支处理。
        const isWhole = f.greaterThan(evt.tabId, 9)
        f.doubleBranch(
          isWhole,
          () => {
            const locked = f.equal(f.getNodeGraphVariable('lock').asType('bool'), true)
            f.doubleBranch(locked, () => {}, () => {
              f.callComposite(gstsTabLock, {})
              f.callComposite(gstsDoWhole, {
                transformId: f.subtraction(evt.tabId, 10n),
                target: evt.eventSourceEntity
              })
            })
          },
          () => {
            // curMove 由宿主设置（事件载荷数据引脚路径，复合内 capture 设变量有类型问题）
            f.setNodeGraphVariable('curMove', evt.tabId, false)
            f.callComposite(gstsTabDispatch, {
              tabId: evt.tabId,
              target: evt.eventSourceEntity
            })
          }
        )
      }
    )
  })

export default graph
