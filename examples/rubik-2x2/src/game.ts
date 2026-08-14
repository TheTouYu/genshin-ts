// P4 第二步：8 角块动态创建 + 6 选项分派（每块自旋 + 5 段直线公转）
//
// 设计（ADR-0003，v5 修正）：
//   - whenEntityIsCreated（挂载在控制器 1077936138 上）→ 8 × createPrefab 创建角块
//   - 创建中心 (3,3,3)，角偏移 ±0.5（与 gen-assets.py CORNERS 一致；v5 修正 ±0.4825 → ±0.5，
//     0.965 尺寸块中心距 1.0 留缝 0.035，与装配体摆放一致）
//   - whenTabIsSelected → tabId 1..6 = R/L/U/D/F/B 分派
//   - 每步：4 块自旋（90°/s × 1s）+ 5 段直线公转（每段 18°、0.2s，定时器 0.2/0.4/0.6/0.8 启动）
//   - v5 公转改为**一次性预计算**：段速度基于转动起始位置 v0 递推
//     p_k = v0·cos(k·18°) + (axis×v0)·sin(k·18°)，vel_k = (p_k − p_{k−1})·5
//     定时器回调 capture 速度向量直接加运动器，**不再读取运行时位置**
//     （v4 缺陷：逐段读实时位置 + 平行分量未去除 → 每轮漂移 0.032，8 轮累积 0.256 块重叠；
//     2026-08-13 日志 23-32-10 会话逐帧实证）
//   - 转动期间输入锁（图变量 lock），1s 后解锁
//
// 核验点：
//   ① whenEntityIsCreated 是否在控制器挂载的图上触发
//   ② 8 角块是否出现在 (3,3,3) 为中心的位置（±0.5 留缝），贴纸朝向正确
//   ③ 各层旋转方向符号（R 从 +X 看顺时针 = WCA；符号待游戏核验）
//   ④ 一实体两运动器（自旋+公转）是否并行生效
//   ⑤ 连续多轮转动后角块是否仍对齐网格（无累积漂移）
import { g } from 'genshin-ts/runtime/core'
import type { IntValue } from 'genshin-ts/runtime/value'
import { bool, float, int, listLiteral, str } from 'genshin-ts/runtime/value'
// ServerExecutionFlowFunctions 定义于 src/definitions/nodes.ts（2026-08-13 修正 import 路径：
// 原 'genshin-ts/runtime/definitions/nodes' 无对应导出，tsc TS2307；管线 tsx 不查类型故此前未暴露）
import type { ServerExecutionFlowFunctions } from 'genshin-ts/definitions/nodes'

// 18° 段预计算常量（v5）：p_k = v0·Ck + (axis×v0)·Sk；vel_k = (p_k − p_{k−1})·K_VEL
const C1 = 0.9510565 // cos18°
const S1 = 0.309017 // sin18°
const C2 = 0.809017 // cos36°
const S2 = 0.587785 // sin36°
const C3 = 0.587785 // cos54°
const S3 = 0.809017 // sin54°
const C4 = 0.309017 // cos72°
const S4 = 0.9510565 // sin72°
const C5 = 0 // cos90°
const S5 = 1 // sin90°
const K_VEL = 5 // 1/0.2s
const DEG2RAD = 0.017453292519943295 // π/180

// 罗德里格斯复合：v 绕单位轴 u 旋转 θ（c=cosθ, s=sinθ）
// v' = u·(u·v) + (v − u·(u·v))·c + (u×v)·s
// （2026-08-14 复合化：内部连线封装，宿主图只留调用）
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

// 轨道段位置复合：p_k = vp + vPerp·c + axv·s（2026-08-14 复合化，5 段共用）
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

// 单轴局部旋转复合（2026-08-14 #16 递归拆分）：v 绕 u 旋转 angle（deg）——内部 6 节点
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

// 三轴局部旋转复合（2026-08-14 #16 递归拆分）：Y→X→Z 依次把世界轴转进块局部系——内部 7 节点
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

// 自旋块复合（2026-08-14 封装型）：世界层轴转换到块局部系 + 添加自旋运动器——
// 把"自旋这件事"的范围封装清晰（含嵌套调用 gsts_rotate_vec）
// 自旋块复合（2026-08-14 v2：exec 复合，含动作）：世界层轴 → 块局部系（罗德里格斯×3）+ 添加自旋运动器。
// exec 复合经 registerExecNode + outflow 连接（生产探索：官方复合无限制，生产经此路径支持动作）
const gstsSpinBlock = g.defineComposite('gsts_spin_block', {
  inputs: { e: { type: 'entity' }, axis: { type: 'vec3' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e, axis }, f) => {
    // #16 递归拆分：三轴局部旋转 → gsts_spin_axis_triple（原 26 节点 → 本复合 4 节点）
    const rot = f.getEntityLocationAndRotation(e).rotate
    const localAxis = f.callComposite(gstsSpinAxisTriple, { v: axis, rot }).out
    const tail = f.registerExecNode('add_uniform_basic_rotation_based_motion_device', [
      e,
      new str('spin'),
      new float(1),
      new float(90),
      localAxis
    ])
    f.outflow('done', tail, 0)
    return {}
  }
})

// 轨道速度计算复合（2026-08-14 封装型）：5 段速度预计算 + 字典存储——
// 定时器回调只查字典取用（复合内 setTimeout 不可用——生产发现 #3）
// 轨道块复合（2026-08-14 v2：exec 复合，含动作）：5 段速度预计算 + 字典存储 + orbit1。
// 定时器（orbit2-5）留宿主（复合内 setTimeout 不可用——生产发现 #3）
// 轨道段运动器复合（2026-08-14 v5：定时器运动器动作入复合）——
// 输入 {i, name, vel}：内部查 blocks[i] + 添加 0.2s 线性运动器（exec 复合，registerExecNode+outflow）
// 验证 #4 修复的 entity_list 场景（复合内 getNodeGraphVariable('blocks')）——定时器回调留宿主（#3）
const gstsOrbitSegment = g.defineComposite('gsts_orbit_segment', {
  inputs: { i: { type: 'int' }, name: { type: 'str' }, vel: { type: 'vec3' } },
  outputs: {},
  outflows: ['done'],
  build: ({ i, name, vel }, f) => {
    // #13 复合内事件（2026-08-14 生产支持）：监听实体自定义变量变化 → 打印变量名（验证链）
    f.on('whenCustomVariableChanges', (evt, ef) => {
      ef.registerExecNode('print_string', [evt.variableName as never])
    })
    const e = f.getCorrespondingValueFromList(
      f.getNodeGraphVariable('blocks').asType('entity_list'),
      i
    )
    const tail = f.registerExecNode('add_uniform_basic_linear_motion_device', [
      e,
      name,
      new float(0.2),
      vel
    ])
    f.outflow('done', tail, 0)
    return {}
  }
})

// 轨道速度计算复合（2026-08-14 v8 语义拆分：纯数据——5 段速度预计算，无副作用）
// 轨道起点分解复合（2026-08-14 #16 递归拆分）：位置差分解 v0/vp/vPerp/axv——内部 6 节点
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

// 轨道单段复合（2026-08-14 #16 递归拆分）：p_k 位置 + vel_k 速度——内部 3 节点
const gstsOrbitStep = g.defineComposite('gsts_orbit_step', {
  inputs: { vp: { type: 'vec3' }, vPerp: { type: 'vec3' }, axv: { type: 'vec3' }, c: { type: 'float' }, s: { type: 'float' }, prev: { type: 'vec3' } },
  outputs: { p: { type: 'vec3' }, vel: { type: 'vec3' } },
  build: ({ vp, vPerp, axv, c, s, prev }, f) => {
    const p = f.callComposite(gstsOrbitPoint, { vp, vPerp, axv, c, s }).p
    const vel = f._3dVectorZoom(f._3dVectorSubtraction(p, prev), K_VEL)
    return { p, vel }
  }
})

const gstsOrbitVelocity = g.defineComposite('gsts_orbit_velocity', {
  inputs: { e: { type: 'entity' }, axis: { type: 'vec3' }, center: { type: 'vec3' } },
  outputs: { vel1: { type: 'vec3' }, vel2: { type: 'vec3' }, vel3: { type: 'vec3' }, vel4: { type: 'vec3' }, vel5: { type: 'vec3' } },
  build: ({ e, axis, center }, f) => {
    // #16 递归拆分：起点分解 + 5 段位置/速度（原 21 节点 → 本复合 6 节点）
    const prep = f.callComposite(gstsOrbitPrep, { e, axis, center })
    const s1 = f.callComposite(gstsOrbitStep, { vp: prep.vp, vPerp: prep.vPerp, axv: prep.axv, c: C1, s: S1, prev: prep.v0 })
    const s2 = f.callComposite(gstsOrbitStep, { vp: prep.vp, vPerp: prep.vPerp, axv: prep.axv, c: C2, s: S2, prev: s1.p })
    const s3 = f.callComposite(gstsOrbitStep, { vp: prep.vp, vPerp: prep.vPerp, axv: prep.axv, c: C3, s: S3, prev: s2.p })
    const s4 = f.callComposite(gstsOrbitStep, { vp: prep.vp, vPerp: prep.vPerp, axv: prep.axv, c: C4, s: S4, prev: s3.p })
    const s5 = f.callComposite(gstsOrbitStep, { vp: prep.vp, vPerp: prep.vPerp, axv: prep.axv, c: C5, s: S5, prev: s4.p })
    return { vel1: s1.vel, vel2: s2.vel, vel3: s3.vel, vel4: s4.vel, vel5: s5.vel }
  }
})
const gstsOrbitStore = g.defineComposite('gsts_orbit_store', {
  inputs: { i: { type: 'int' }, vel1: { type: 'vec3' }, vel2: { type: 'vec3' }, vel3: { type: 'vec3' }, vel4: { type: 'vec3' }, vel5: { type: 'vec3' } },
  outputs: {},
  outflows: ['done'],
  build: ({ i, vel1, vel2, vel3, vel4, vel5 }, f) => {
    // 展开型复合：5 段写入，每段区域 2 节点（get 句柄 + set_or_add）——保持字面量变量名
    // （getNodeGraphVariable 需字面量推断 dict 类型；str pin 无法静态查表——#18 拆分尝试失败登记）
    const d1 = f.registerExecNode('set_or_add_key_value_pairs_to_dictionary', [
      f.getNodeGraphVariable('vels1').asDict('int', 'vec3'), i, vel1
    ])
    const d2 = f.registerExecNode('set_or_add_key_value_pairs_to_dictionary', [
      f.getNodeGraphVariable('vels2').asDict('int', 'vec3'), i, vel2
    ])
    const d3 = f.registerExecNode('set_or_add_key_value_pairs_to_dictionary', [
      f.getNodeGraphVariable('vels3').asDict('int', 'vec3'), i, vel3
    ])
    const d4 = f.registerExecNode('set_or_add_key_value_pairs_to_dictionary', [
      f.getNodeGraphVariable('vels4').asDict('int', 'vec3'), i, vel4
    ])
    const d5 = f.registerExecNode('set_or_add_key_value_pairs_to_dictionary', [
      f.getNodeGraphVariable('vels5').asDict('int', 'vec3'), i, vel5
    ])
    f.connect(d1, 0, d2, 0)
    f.connect(d2, 0, d3, 0)
    f.connect(d3, 0, d4, 0)
    f.connect(d4, 0, d5, 0)
    f.outflow('done', d5, 0)
    return {}
  }
})

const gstsTabAxisFlags = g.defineComposite('gsts_tab_axis_flags', {
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

const gstsTurnCheck = g.defineComposite('gsts_turn_check', {
  inputs: { i: { type: 'int' }, tabId: { type: 'int' } },
  outputs: { e: { type: 'entity' }, axis: { type: 'vec3' }, hit: { type: 'bool' } },
  build: ({ i, tabId }, f) => {
    // #18 递归拆分：位置读取+层判断 → gsts_layer_hit（原 10 节点 → 本复合 4 节点）
    const e = f.getCorrespondingValueFromList(
      f.getNodeGraphVariable('blocks').asType('entity_list'),
      i
    )
    const axis = f.queryDictionaryValueByKey(
      f.getNodeGraphVariable('axes').asDict('int', 'vec3'),
      tabId
    )
    const flags = f.callComposite(gstsTabAxisFlags, { tabId })
    const hit = f.callComposite(gstsLayerHit, {
      e,
      isR: flags.isR,
      isL: flags.isL,
      isU: flags.isU,
      isD: flags.isD,
      isF: flags.isF,
      isB: flags.isB
    }).hit
    return { e, axis, hit }
  }
})

// 转动一块复合（2026-08-14 v8：封装型「转动一块」完整封装）——
// 输入 {i, tabId, center}：内部 turn_check 数据准备 + doubleBranch（命中 → spinBlock + orbitCalc 嵌套
// exec 复合调用）；输出 {hit} 供宿主定时器分支（setTimeout 留宿主 #3）
const gstsTurnBlock = g.defineComposite('gsts_turn_block', {
  inputs: { i: { type: 'int' }, tabId: { type: 'int' }, center: { type: 'vec3' } },
  outputs: { hit: { type: 'bool' } },
  outflows: ['done'],
  build: ({ i, tabId, center }, f) => {
    const turn = f.callComposite(gstsTurnCheck, { i, tabId })
    f.doubleBranch(turn.hit, () => {
      f.callComposite(gstsSpinBlock, { e: turn.e, axis: turn.axis })
      // v8 语义拆分：速度计算（纯数据）→ 字典存储（exec）→ orbit1 运动器
      const v = f.callComposite(gstsOrbitVelocity, { e: turn.e, axis: turn.axis, center })
      const store = f.callComposite(gstsOrbitStore, {
        i,
        vel1: v.vel1,
        vel2: v.vel2,
        vel3: v.vel3,
        vel4: v.vel4,
        vel5: v.vel5
      })
      const m1 = f.registerExecNode('add_uniform_basic_linear_motion_device', [
        turn.e,
        new str('orbit1'),
        new float(0.2),
        v.vel1
      ])
      f.connect(store, 0, m1, 0)
      f.outflow('done', m1, 0)
    }, () => {})
    return { hit: turn.hit }
  }
})

// 角块创建复合（2026-08-14 v6：createPrefab 动作入复合，8 块共用）——
// 输入 {pid, stage, x, y, z}：内部 createPrefab（位置向量组装/旋转零/默认参数）+ 输出实体；
// prefabId 只能字面量（DSL 约束：createPrefab 的 prefabId 参数不支持数据节点），宿主传实例
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
    // createPrefab 是 exec 节点：绑定复合出口（createPrefab 返回实体，record 从 metadata 取）
    const meta = (e as unknown as { getMetadata?: () => { record?: { id: number } } }).getMetadata?.()
    if (meta?.record) f.outflow('done', meta.record as never, 0)
    return { e }
  }
})


// 魔方生成复合（2026-08-14 大规模复合化 #14：实体创建全链 70+ 节点 → 1 调用）——
// 输入 {stage}：内部 8 × create_corner + b0-b7 变量写入；输出 8 实体（宿主组 blocks 数组——
// 复合内 entity_list 数组字面量有 matchTypes/vendor 编码缺口，blocks 数组留在宿主 v13 已验证路径）
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
    // f.node detached：必须显式 link c7 create_corner → setB7（否则链尾断，blocks 永不设置——
    // 2685 日志 rec0 在 c7 后截断实证）
    const setB7 = f.node('set_node_graph_variable', [new str('b7'), c7, new bool(false)])
    f.link(c7Call as never, 0, setB7, 0)
    f.outflow('done', setB7, 0)
    return { c0, c1, c2, c3, c4, c5, c6, c7 }
  }
})

// Tab 锁门复合（2026-08-14 大规模复合化 #14）：lock 检查 + set lock——
// done outflow 只在「未锁」分支触发（set lock 后）；宿主在调用后无条件续链，
// 锁着时 done 不触发 → 宿主循环不执行。
// 不用数据输出判断：OutParam 引用的数据节点在宿主消费时会二次求值（引擎惰性语义），
// 「读 lock→写 lock→输出派生值」会读到写入后的值（2685 日志 rec1 实证：unlocked 二次求值=false）
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
// 层成员筛选复合：按当前坐标判断块是否在目标层（2026-08-14 复合化，8 块共用）
// 坐标轴比较复合（2026-08-14 #18 递归拆分）：单轴层判断——内部 5 节点
const gstsAxisCompare = g.defineComposite('gsts_axis_compare', {
  inputs: { coord: { type: 'float' }, isPos: { type: 'bool' }, isNeg: { type: 'bool' } },
  outputs: { hit: { type: 'bool' } },
  build: ({ coord, isPos, isNeg }, f) => ({
    hit: f.logicalOrOperation(
      f.logicalAndOperation(isPos, f.greaterThan(coord, 3)),
      f.logicalAndOperation(isNeg, f.lessThan(coord, 3))
    )
  })
})

// 块层命中复合（2026-08-14 #18 递归拆分）：位置读取 + 坐标分解 + 层判断——内部 5 节点
const gstsLayerHit = g.defineComposite('gsts_layer_hit', {
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
    const hit = f.callComposite(gstsInLayer, {
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

const gstsInLayer = g.defineComposite('gsts_in_layer', {
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
    // #18 递归拆分：坐标比较 → gsts_axis_compare（原 17 节点 → 本复合 6 节点）
    const hit = f.logicalOrOperation(
      f.logicalOrOperation(
        f.callComposite(gstsAxisCompare, { coord: x, isPos: isR, isNeg: isL }).hit,
        f.callComposite(gstsAxisCompare, { coord: y, isPos: isU, isNeg: isD }).hit
      ),
      f.callComposite(gstsAxisCompare, { coord: z, isPos: isF, isNeg: isB }).hit
    )
    return { hit }
  }
})

// 轨道段调度复合（2026-08-14 v19：4 段相似长链打包）——
// 输入 {i, seg, target}：按 seg（timerSequenceId 0-3）分发 → 查对应 velsN 字典 →
// gsts_orbit_segment；seg=3（orbit5 段）触发后 +250ms 解锁定时器（相对时序 #2 语义）。
const gstsOrbitSegmentDispatch = g.defineComposite('gsts_orbit_segment_dispatch', {
  inputs: { i: { type: 'int' }, seg: { type: 'int' }, target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ i, seg, target }, f) => {
    f.multipleBranches(seg, {
      0: () => {
        const vel = f.queryDictionaryValueByKey(
          f.getNodeGraphVariable('vels2').asDict('int', 'vec3'), i
        )
        f.callComposite(gstsOrbitSegment, { i, name: new str('orbit2'), vel })
      },
      1: () => {
        const vel = f.queryDictionaryValueByKey(
          f.getNodeGraphVariable('vels3').asDict('int', 'vec3'), i
        )
        f.callComposite(gstsOrbitSegment, { i, name: new str('orbit3'), vel })
      },
      2: () => {
        const vel = f.queryDictionaryValueByKey(
          f.getNodeGraphVariable('vels4').asDict('int', 'vec3'), i
        )
        f.callComposite(gstsOrbitSegment, { i, name: new str('orbit4'), vel })
      },
      3: () => {
        const vel = f.queryDictionaryValueByKey(
          f.getNodeGraphVariable('vels5').asDict('int', 'vec3'), i
        )
        f.callComposite(gstsOrbitSegment, { i, name: new str('orbit5'), vel })
        // +250ms 解锁（相对时序 #2 语义：orbit5 实际触发后）
        f.registerExecNode('start_timer', [
          target, new str('unlock'), new bool(false),
          f.assemblyList([new float(0.25)], 'float')
        ])
      },
      default: () => {}
    })
    return {}
  }
})

// 轨道定时器调度复合（2026-08-14 v19：图内定时器替代 setTimeout 捕获机制）——
// 输入 {i, target}：内部 1 个 start_timer 序列 [0.2, 0.4, 0.6, 0.8]（替代宿主 4 个
// setTimeout + 编译器 __gsts_timeout_N_index/cap_i 捕获字典 100 节点）；
// whenTimerIsTriggered 按 timerName（dataTypeConversion(i→str) 块唯一名）路由 →
// gsts_orbit_segment_dispatch（段分发）；unlock 定时器独立回调解锁 lock。
const gstsOrbitScheduler = g.defineComposite('gsts_orbit_scheduler', {
  inputs: { i: { type: 'int' }, target: { type: 'entity' } },
  outputs: {},
  outflows: ['done'],
  build: ({ i, target }, f) => {
    // 块唯一定时器名（'0'..'7'）：多块并发注册互不冲突
    const tname = f.dataTypeConversion(i, 'str')
    // 1 个序列定时器：4 个时间点 = 4 段轨道
    const t = f.registerExecNode('start_timer', [
      target,
      tname,
      new bool(false),
      f.assemblyList([new float(0.2), new float(0.4), new float(0.6), new float(0.8)], 'float')
    ])
    // 回调：按 timerName 路由到本块 → 段分发复合（seg = timerSequenceId）
    f.on('whenTimerIsTriggered', (evt: any, ef: any) => {
      const nameMatch = f.equal(evt.timerName, tname)
      f.doubleBranch(nameMatch, () => {
        ef.callComposite(gstsOrbitSegmentDispatch, { i, seg: evt.timerSequenceId as never, target })
      }, () => {})
    })
    // 解锁回调：lock 变量置 false
    f.on('whenTimerIsTriggered', (evt: any, ef: any) => {
      const nameMatch = f.equal(evt.timerName, new str('unlock'))
      f.doubleBranch(nameMatch, () => {
        ef.setNodeGraphVariable('lock', false, false)
      }, () => {})
    })
    f.outflow('done', t, 0)
    return {}
  }
})

const graph = g
  .server({
    id: 1073741825,
    variables: {
      lock: false, // 输入锁（转动期间忽略新输入）
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
      axes: dict([
        { k: 1, v: vec3([-1, 0, 0]) }, // R：x+ 层绕 X 负转
        { k: 2, v: vec3([1, 0, 0]) }, // L：x− 层绕 X 正转
        { k: 3, v: vec3([0, -1, 0]) }, // U：y+ 层绕 Y 负转
        { k: 4, v: vec3([0, 1, 0]) }, // D：y− 层绕 Y 正转
        { k: 5, v: vec3([0, 0, -1]) }, // F：z+ 层绕 Z 负转
        { k: 6, v: vec3([0, 0, 1]) } // B：z− 层绕 Z 正转
      ]),
      vels1: dict([{ k: 0, v: vec3([0, 0, 0]) }]),
      vels2: dict([{ k: 0, v: vec3([0, 0, 0]) }]),
      vels3: dict([{ k: 0, v: vec3([0, 0, 0]) }]),
      vels4: dict([{ k: 0, v: vec3([0, 0, 0]) }]),
      vels5: dict([{ k: 0, v: vec3([0, 0, 0]) }])
    }
  })
  .on('whenEntityIsCreated', (_evt, f) => {
    // #14 大规模复合化：实体创建全链（8×create_corner + b0-b7）打包为 gsts_spawn_rubik；
    // blocks 数组在宿主组（复合内 entity_list 数组字面量缺口，v13 已验证路径）
    const cubes = f.callComposite(gstsSpawnRubik, { stage })
    f.setNodeGraphVariable('blocks', [cubes.c0, cubes.c1, cubes.c2, cubes.c3, cubes.c4, cubes.c5, cubes.c6, cubes.c7], false)
  })
  .on('whenTabIsSelected', (evt, f) => {
    // #13 复合内事件验证链：每次 Tab 设置自定义变量（触发事件=是）→
    // orbit_segment 复合内 whenCustomVariableChanges 事件触发 → print 变量名
    f.setCustomVariable(evt.eventSourceEntity, new str('tab_count'), evt.tabId, true)
    // #14 大规模复合化：lock 门打包为 gsts_tab_lock——done 只在未锁分支触发，
    // 锁着时宿主续链不执行；循环+定时器留宿主（复合内 setTimeout 不可用——生产发现 #3）
    f.callComposite(gstsTabLock, {})
    const center = f.create3dVector(3, 3, 3)
    for (let i = 0n; i < 8n; i++) {
      // v8：转动一块完整封装（数据准备+层判断+自旋+轨道）；定时器留宿主（#3）
      const hit = f.callComposite(gstsTurnBlock, { i, tabId: evt.tabId, center }).hit
      f.doubleBranch(hit, () => {
        // v19：整块轨道定时器打包为 gsts_orbit_scheduler（图内定时器替代 setTimeout）
        f.callComposite(gstsOrbitScheduler, { i, target: evt.eventSourceEntity })
      }, () => {})
    }
    // 解锁改为相对时序：orbit5 实际触发后 +250ms 解锁（见 gstsServerOrbitBlock 的 orbit5 回调），
    // 消除绝对 1000ms 解锁与 tick 不稳导致的末段中断（生产发现 #2 的底层修复）
  })



export default graph
