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

// 罗德里格斯：v 绕单位轴 u 旋转 θ（c=cosθ, s=sinθ）
// v' = u·(u·v) + (v − u·(u·v))·c + (u×v)·s
function gstsRotateVec(
  f: ServerExecutionFlowFunctions,
  v: ReturnType<typeof f.create3dVector>,
  u: ReturnType<typeof f.create3dVector>,
  c: number,
  s: number
): ReturnType<typeof f.create3dVector> {
  const vp = f._3dVectorZoom(u, f._3dVectorDotProduct(u, v))
  return f._3dVectorAddition(
    f._3dVectorAddition(vp, f._3dVectorZoom(f._3dVectorSubtraction(v, vp), c)),
    f._3dVectorZoom(f._3dVectorCrossProduct(u, v), s)
  )
}

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
        const inLayer = f.logicalOrOperation(
          f.logicalOrOperation(
            f.logicalOrOperation(
              f.logicalAndOperation(isR, f.greaterThan(loc.x, 3)),
              f.logicalAndOperation(isL, f.lessThan(loc.x, 3))
            ),
            f.logicalAndOperation(isU, f.greaterThan(loc.y, 3))
          ),
          f.logicalOrOperation(
            f.logicalOrOperation(
              f.logicalAndOperation(isD, f.lessThan(loc.y, 3)),
              f.logicalAndOperation(isF, f.greaterThan(loc.z, 3))
            ),
            f.logicalAndOperation(isB, f.lessThan(loc.z, 3))
          )
        )
        f.doubleBranch(inLayer, () => {
          // v5.5：自旋轴 = 世界层轴转换到块局部系（引擎 axis 为"相对朝向"，绕局部轴右乘；
          // localAxis = Rz(−rz)·Rx(−rx)·Ry(−ry)·worldAxis，日志 00-37-42 矩阵实证）
          const rot = f.getEntityLocationAndRotation(e).rotate
          const cy = f.cosineFunction(f.multiplication(rot.y, DEG2RAD))
          const sy = f.sineFunction(f.multiplication(rot.y, DEG2RAD))
          const v1 = gstsRotateVec(f, axis, f.create3dVector(0, 1, 0), cy, f.multiplication(sy, -1))
          const cx = f.cosineFunction(f.multiplication(rot.x, DEG2RAD))
          const sx = f.sineFunction(f.multiplication(rot.x, DEG2RAD))
          const v2 = gstsRotateVec(f, v1, f.create3dVector(1, 0, 0), cx, f.multiplication(sx, -1))
          const cz = f.cosineFunction(f.multiplication(rot.z, DEG2RAD))
          const sz = f.sineFunction(f.multiplication(rot.z, DEG2RAD))
          const localAxis = gstsRotateVec(f, v2, f.create3dVector(0, 0, 1), cz, f.multiplication(sz, -1))
          f.addUniformBasicRotationBasedMotionDevice(e, 'spin', 1, 90, localAxis)
          gstsServerOrbitBlock(f, e, axis, center, i)
        }, () => {})
      }
      // 1s 后解锁（转动总时长 = 5 段 × 0.2s = 1s，与自旋同步）
      setTimeout((_e, tf) => {
        tf.setNodeGraphVariable('lock', false, false)
      }, 1000)
    }
  })

// 单块 5 段公转（v5.4 循环内 1 份物化）：速度按块索引存 5 个字典（vels1..vels5），
// 定时器回调按块索引查字典 + blocks 列表取实体，不再读取运行时位置
function gstsServerOrbitBlock(
  f: ServerExecutionFlowFunctions,
  e: ReturnType<typeof f.getEntityLocationAndRotation>,
  axis: ReturnType<typeof f.create3dVector>,
  center: ReturnType<typeof f.create3dVector>,
  i: bigint
) {
  const loc = f.getEntityLocationAndRotation(e).location
  const v0 = f._3dVectorSubtraction(loc, center)
  // v5.3 修正：旋转只作用于垂直分量，平行分量必须保持
  // （此前 p_k = v0·Ck + axv·Sk 压缩平行分量 → 每轮漂移 0.5，日志 00-20-15 逐帧实证）
  const vp = f._3dVectorZoom(axis, f._3dVectorDotProduct(axis, v0))
  const vPerp = f._3dVectorSubtraction(v0, vp)
  const axv = f._3dVectorCrossProduct(axis, vPerp)
  // p_k = vp + vPerp·Ck + axv·Sk（k = 1..5，18° 步进到 90°）；vel_k = (p_k − p_{k−1})·K_VEL
  const p1 = f._3dVectorAddition(vp, f._3dVectorAddition(f._3dVectorZoom(vPerp, C1), f._3dVectorZoom(axv, S1)))
  const vel1 = f._3dVectorZoom(f._3dVectorSubtraction(p1, v0), K_VEL)
  const p2 = f._3dVectorAddition(vp, f._3dVectorAddition(f._3dVectorZoom(vPerp, C2), f._3dVectorZoom(axv, S2)))
  const vel2 = f._3dVectorZoom(f._3dVectorSubtraction(p2, p1), K_VEL)
  const p3 = f._3dVectorAddition(vp, f._3dVectorAddition(f._3dVectorZoom(vPerp, C3), f._3dVectorZoom(axv, S3)))
  const vel3 = f._3dVectorZoom(f._3dVectorSubtraction(p3, p2), K_VEL)
  const p4 = f._3dVectorAddition(vp, f._3dVectorAddition(f._3dVectorZoom(vPerp, C4), f._3dVectorZoom(axv, S4)))
  const vel4 = f._3dVectorZoom(f._3dVectorSubtraction(p4, p3), K_VEL)
  const p5 = f._3dVectorAddition(vp, f._3dVectorAddition(f._3dVectorZoom(vPerp, C5), f._3dVectorZoom(axv, S5)))
  const vel5 = f._3dVectorZoom(f._3dVectorSubtraction(p5, p4), K_VEL)
  f.setOrAddKeyValuePairsToDictionary(f.getNodeGraphVariable('vels1').asDict('int', 'vec3'), i, vel1)
  f.setOrAddKeyValuePairsToDictionary(f.getNodeGraphVariable('vels2').asDict('int', 'vec3'), i, vel2)
  f.setOrAddKeyValuePairsToDictionary(f.getNodeGraphVariable('vels3').asDict('int', 'vec3'), i, vel3)
  f.setOrAddKeyValuePairsToDictionary(f.getNodeGraphVariable('vels4').asDict('int', 'vec3'), i, vel4)
  f.setOrAddKeyValuePairsToDictionary(f.getNodeGraphVariable('vels5').asDict('int', 'vec3'), i, vel5)
  f.addUniformBasicLinearMotionDevice(e, 'orbit1', 0.2, vel1)
  setTimeout((_e, tf) => {
    tf.addUniformBasicLinearMotionDevice(
      tf.getCorrespondingValueFromList(tf.getNodeGraphVariable('blocks').asType('entity_list'), i),
      'orbit2',
      0.2,
      tf.queryDictionaryValueByKey(tf.getNodeGraphVariable('vels2').asDict('int', 'vec3'), i)
    )
  }, 200)
  setTimeout((_e, tf) => {
    tf.addUniformBasicLinearMotionDevice(
      tf.getCorrespondingValueFromList(tf.getNodeGraphVariable('blocks').asType('entity_list'), i),
      'orbit3',
      0.2,
      tf.queryDictionaryValueByKey(tf.getNodeGraphVariable('vels3').asDict('int', 'vec3'), i)
    )
  }, 400)
  setTimeout((_e, tf) => {
    tf.addUniformBasicLinearMotionDevice(
      tf.getCorrespondingValueFromList(tf.getNodeGraphVariable('blocks').asType('entity_list'), i),
      'orbit4',
      0.2,
      tf.queryDictionaryValueByKey(tf.getNodeGraphVariable('vels4').asDict('int', 'vec3'), i)
    )
  }, 600)
  setTimeout((_e, tf) => {
    tf.addUniformBasicLinearMotionDevice(
      tf.getCorrespondingValueFromList(tf.getNodeGraphVariable('blocks').asType('entity_list'), i),
      'orbit5',
      0.2,
      tf.queryDictionaryValueByKey(tf.getNodeGraphVariable('vels5').asDict('int', 'vec3'), i)
    )
  }, 800)
}

export default graph
