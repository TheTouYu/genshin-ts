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
import { float, int, str } from 'genshin-ts/runtime/value'
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

// 自旋块复合（2026-08-14 封装型）：世界层轴转换到块局部系 + 添加自旋运动器——
// 把"自旋这件事"的范围封装清晰（含嵌套调用 gsts_rotate_vec）
// 自旋块复合（2026-08-14 v2：exec 复合，含动作）：世界层轴 → 块局部系（罗德里格斯×3）+ 添加自旋运动器。
// exec 复合经 registerExecNode + outflow 连接（生产探索：官方复合无限制，生产经此路径支持动作）
const gstsSpinBlock = g.defineComposite('gsts_spin_block', {
  inputs: { e: { type: 'entity' }, axis: { type: 'vec3' } },
  outputs: {},
  outflows: ['done'],
  build: ({ e, axis }, f) => {
    const rot = f.getEntityLocationAndRotation(e).rotate
    const cy = f.cosineFunction(f.multiplication(rot.y, DEG2RAD))
    const sy = f.sineFunction(f.multiplication(rot.y, DEG2RAD))
    const v1 = f.callComposite(gstsRotateVec, { v: axis, u: f.create3dVector(0, 1, 0), c: cy, s: f.multiplication(sy, -1) }).out
    const cx = f.cosineFunction(f.multiplication(rot.x, DEG2RAD))
    const sx = f.sineFunction(f.multiplication(rot.x, DEG2RAD))
    const v2 = f.callComposite(gstsRotateVec, { v: v1, u: f.create3dVector(1, 0, 0), c: cx, s: f.multiplication(sx, -1) }).out
    const cz = f.cosineFunction(f.multiplication(rot.z, DEG2RAD))
    const sz = f.sineFunction(f.multiplication(rot.z, DEG2RAD))
    const localAxis = f.callComposite(gstsRotateVec, { v: v2, u: f.create3dVector(0, 0, 1), c: cz, s: f.multiplication(sz, -1) }).out
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

// 轨道速度计算+存储复合（2026-08-14 v4：#4 修复后字典动作入复合）——
// 5 段速度预计算 + setOrAdd 写字典全在复合内（生产发现 #4 已修复，官方 wire 同构验证）；
// setOrAdd 是 exec 动作节点 → 复合 exec 化：registerExecNode 链 + outflow('done')；
// 输出精简为 vel1（宿主 orbit1 运动器直接取用），vel2..5 仅入字典供定时器查询；
// 定时器（orbit2-5）留宿主（复合内 setTimeout 不可用——生产发现 #3）
const gstsOrbitCalc = g.defineComposite('gsts_orbit_calc', {
  inputs: { e: { type: 'entity' }, axis: { type: 'vec3' }, center: { type: 'vec3' }, i: { type: 'int' } },
  outputs: { vel1: { type: 'vec3' } },
  outflows: ['done'],
  build: ({ e, axis, center, i }, f) => {
    const loc = f.getEntityLocationAndRotation(e).location
    const v0 = f._3dVectorSubtraction(loc, center)
    const vp = f._3dVectorZoom(axis, f._3dVectorDotProduct(axis, v0))
    const vPerp = f._3dVectorSubtraction(v0, vp)
    const axv = f._3dVectorCrossProduct(axis, vPerp)
    const p1 = f.callComposite(gstsOrbitPoint, { vp, vPerp, axv, c: C1, s: S1 }).p
    const vel1 = f._3dVectorZoom(f._3dVectorSubtraction(p1, v0), K_VEL)
    const p2 = f.callComposite(gstsOrbitPoint, { vp, vPerp, axv, c: C2, s: S2 }).p
    const vel2 = f._3dVectorZoom(f._3dVectorSubtraction(p2, p1), K_VEL)
    const p3 = f.callComposite(gstsOrbitPoint, { vp, vPerp, axv, c: C3, s: S3 }).p
    const vel3 = f._3dVectorZoom(f._3dVectorSubtraction(p3, p2), K_VEL)
    const p4 = f.callComposite(gstsOrbitPoint, { vp, vPerp, axv, c: C4, s: S4 }).p
    const vel4 = f._3dVectorZoom(f._3dVectorSubtraction(p4, p3), K_VEL)
    const p5 = f.callComposite(gstsOrbitPoint, { vp, vPerp, axv, c: C5, s: S5 }).p
    const vel5 = f._3dVectorZoom(f._3dVectorSubtraction(p5, p4), K_VEL)
    // 5 个 setOrAdd 动作链（exec）：registerExecNode + connect 链尾 → outflow('done')
    const d1 = f.registerExecNode('set_or_add_key_value_pairs_to_dictionary', [
      f.getNodeGraphVariable('vels1').asDict('int', 'vec3'),
      i,
      vel1
    ])
    const d2 = f.registerExecNode('set_or_add_key_value_pairs_to_dictionary', [
      f.getNodeGraphVariable('vels2').asDict('int', 'vec3'),
      i,
      vel2
    ])
    const d3 = f.registerExecNode('set_or_add_key_value_pairs_to_dictionary', [
      f.getNodeGraphVariable('vels3').asDict('int', 'vec3'),
      i,
      vel3
    ])
    const d4 = f.registerExecNode('set_or_add_key_value_pairs_to_dictionary', [
      f.getNodeGraphVariable('vels4').asDict('int', 'vec3'),
      i,
      vel4
    ])
    const d5 = f.registerExecNode('set_or_add_key_value_pairs_to_dictionary', [
      f.getNodeGraphVariable('vels5').asDict('int', 'vec3'),
      i,
      vel5
    ])
    f.connect(d1, 0, d2, 0)
    f.connect(d2, 0, d3, 0)
    f.connect(d3, 0, d4, 0)
    f.connect(d4, 0, d5, 0)
    f.outflow('done', d5, 0)
    return { vel1 }
  }
})

// 层成员筛选复合：按当前坐标判断块是否在目标层（2026-08-14 复合化，8 块共用）
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
    const hit = f.logicalOrOperation(
      f.logicalOrOperation(
        f.logicalOrOperation(
          f.logicalAndOperation(isR, f.greaterThan(x, 3)),
          f.logicalAndOperation(isL, f.lessThan(x, 3))
        ),
        f.logicalAndOperation(isU, f.greaterThan(y, 3))
      ),
      f.logicalOrOperation(
        f.logicalOrOperation(
          f.logicalAndOperation(isD, f.lessThan(y, 3)),
          f.logicalAndOperation(isF, f.greaterThan(z, 3))
        ),
        f.logicalAndOperation(isB, f.lessThan(z, 3))
      )
    )
    return { hit }
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
    // 图只挂控制器：本事件在控制器创建时触发（日志已验证 rec1），角块创建与变量
    // 读写都在控制器实例内完成（图变量按挂载实体实例隔离，跨实例读取为空——2026-08-13 日志结论）
      // 角块 i 位置 = (3,3,3) + 0.4825·(dx,dy,dz)，rotate=(0,0,0)，owner=关卡实体
      const c0 = f.createPrefab(
        1077936129,
        f.create3dVector(2.5, 2.5, 2.5),
        f.create3dVector(0, 0, 0),
        stage,
        false,
        0,
        [] as IntValue[]
      )
      f.setNodeGraphVariable('b0', c0, false)
      const c1 = f.createPrefab(
        1077936130,
        f.create3dVector(3.5, 2.5, 2.5),
        f.create3dVector(0, 0, 0),
        stage,
        false,
        0,
        [] as IntValue[]
      )
      f.setNodeGraphVariable('b1', c1, false)
      const c2 = f.createPrefab(
        1077936131,
        f.create3dVector(2.5, 2.5, 3.5),
        f.create3dVector(0, 0, 0),
        stage,
        false,
        0,
        [] as IntValue[]
      )
      f.setNodeGraphVariable('b2', c2, false)
      const c3 = f.createPrefab(
        1077936132,
        f.create3dVector(3.5, 2.5, 3.5),
        f.create3dVector(0, 0, 0),
        stage,
        false,
        0,
        [] as IntValue[]
      )
      f.setNodeGraphVariable('b3', c3, false)
      const c4 = f.createPrefab(
        1077936133,
        f.create3dVector(2.5, 3.5, 2.5),
        f.create3dVector(0, 0, 0),
        stage,
        false,
        0,
        [] as IntValue[]
      )
      f.setNodeGraphVariable('b4', c4, false)
      const c5 = f.createPrefab(
        1077936134,
        f.create3dVector(3.5, 3.5, 2.5),
        f.create3dVector(0, 0, 0),
        stage,
        false,
        0,
        [] as IntValue[]
      )
      f.setNodeGraphVariable('b5', c5, false)
      const c6 = f.createPrefab(
        1077936135,
        f.create3dVector(2.5, 3.5, 3.5),
        f.create3dVector(0, 0, 0),
        stage,
        false,
        0,
        [] as IntValue[]
      )
      f.setNodeGraphVariable('b6', c6, false)
      const c7 = f.createPrefab(
        1077936136,
        f.create3dVector(3.5, 3.5, 3.5),
        f.create3dVector(0, 0, 0),
        stage,
        false,
        0,
        [] as IntValue[]
      )
      f.setNodeGraphVariable('b7', c7, false)
      // v5.4：块列表（循环按坐标筛选层成员，替代静态 layers）
      f.setNodeGraphVariable('blocks', [c0, c1, c2, c3, c4, c5, c6, c7], false)
  })
  .on('whenTabIsSelected', (evt, f) => {
    if (f.equal(f.getNodeGraphVariable('lock').asType('bool'), false)) {
      f.setNodeGraphVariable('lock', true, false)
      // v5.4：层轴查表 + 8 块循环按当前坐标筛选层成员
      // （魔方转动后层成员变化，静态 layers 失效——00-26-27 日志 U 层误转底层块实证；
      //   循环体只物化一次，节点数可控）
      const axis = f.queryDictionaryValueByKey(
        f.getNodeGraphVariable('axes').asDict('int', 'vec3'),
        evt.tabId
      )
      const isR = f.equal(evt.tabId, 1)
      const isL = f.equal(evt.tabId, 2)
      const isU = f.equal(evt.tabId, 3)
      const isD = f.equal(evt.tabId, 4)
      const isF = f.equal(evt.tabId, 5)
      const isB = f.equal(evt.tabId, 6)
      const center = f.create3dVector(3, 3, 3)
      for (let i = 0n; i < 8n; i++) {
        const e = f.getCorrespondingValueFromList(
          f.getNodeGraphVariable('blocks').asType('entity_list'),
          i
        )
        const loc = f.getEntityLocationAndRotation(e).location
        const inLayer = f.callComposite(gstsInLayer, {
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
        f.doubleBranch(inLayer, () => {
          // exec 复合（自旋动作）+ 计算存储复合（速度+字典，#4 已修复）+ 宿主动作（orbit1）
          f.callComposite(gstsSpinBlock, { e, axis })
          // v4：速度计算 + 字典存储全在复合内（#4 修复验证），orbit1 用返回的 vel1
          const calc = f.callComposite(gstsOrbitCalc, { e, axis, center, i })
          f.addUniformBasicLinearMotionDevice(e, 'orbit1', 0.2, calc.vel1)
          gstsServerOrbitTimers(f, i)
        }, () => {})
      }
      // 解锁改为相对时序：orbit5 实际触发后 +250ms 解锁（见 gstsServerOrbitBlock 的 orbit5 回调），
      // 消除绝对 1000ms 解锁与 tick 不稳导致的末段中断（生产发现 #2 的底层修复）
    }
  })

// orbit2-5 定时器（2026-08-14：速度预计算已封装到 gsts_orbit_calc 复合；
// 复合内 setTimeout 不可用——生产发现 #3，定时器留在宿主）
function gstsServerOrbitTimers(
  f: ServerExecutionFlowFunctions,
  i: bigint
) {
  setTimeout((_e, tf) => {
    // v5：运动器动作入复合（gsts_orbit_segment），字典查询留宿主（变量名按段不同）
    tf.callComposite(gstsOrbitSegment, {
      i,
      name: new str('orbit2'),
      vel: tf.queryDictionaryValueByKey(tf.getNodeGraphVariable('vels2').asDict('int', 'vec3'), i)
    })
  }, 200)
  setTimeout((_e, tf) => {
    tf.callComposite(gstsOrbitSegment, {
      i,
      name: new str('orbit3'),
      vel: tf.queryDictionaryValueByKey(tf.getNodeGraphVariable('vels3').asDict('int', 'vec3'), i)
    })
  }, 400)
  setTimeout((_e, tf) => {
    tf.callComposite(gstsOrbitSegment, {
      i,
      name: new str('orbit4'),
      vel: tf.queryDictionaryValueByKey(tf.getNodeGraphVariable('vels4').asDict('int', 'vec3'), i)
    })
  }, 600)
  setTimeout((_e, tf) => {
    tf.callComposite(gstsOrbitSegment, {
      i,
      name: new str('orbit5'),
      vel: tf.queryDictionaryValueByKey(tf.getNodeGraphVariable('vels5').asDict('int', 'vec3'), i)
    })
    // 生产发现 #2 底层修复：相对时序解锁——orbit5 实际触发后 +250ms（0.2s 时长 + 50ms 余量）
    // 解锁，不受绝对 1000ms 与 tick 不稳影响；4 块各触发一次，幂等。
    setTimeout((_e2, tf2) => {
      tf2.setNodeGraphVariable('lock', false, false)
    }, 250)
  }, 800)
}

export default graph
