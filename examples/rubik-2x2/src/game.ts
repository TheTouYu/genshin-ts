// P4 第二步：8 角块动态创建 + 6 选项分派（每块自旋 + 5 段直线公转）
//
// 设计（ADR-0003）：
//   - whenEntityIsCreated（挂载在关卡实体 1094713345 上）→ 8 × createPrefab 创建角块
//   - 创建中心 (3,3,3)，角偏移 ±0.4825（与 gen-assets.py CORNERS 顺序一致）
//   - whenTabIsSelected（挂载在控制器 1077936138 上）→ tabId 1..6 = R/L/U/D/F/B 分派
//   - 每步：4 块自旋（90°/s × 1s）+ 5 段直线公转（每段 18°、0.2s，定时器序列 0.2/0.4/0.6/0.8 启动）
//   - 段速度 = 弦向量/0.2 = v·(cos18−1)/0.2 + (axis×v)·sin18/0.2（运行时按当前位置计算）
//   - 转动期间输入锁（图变量 lock），1s 后解锁
//
// 核验点：
//   ① whenEntityIsCreated 是否在关卡实体挂载的图上触发
//   ② 8 角块是否出现在 (3,3,3) 为中心的位置，贴纸朝向正确
//   ③ 各层旋转方向符号（R 从 +X 看顺时针 = WCA；符号待游戏核验）
//   ④ 一实体两运动器（自旋+公转）是否并行生效
//   ⑤ 5 段折线逼近弧的平滑度、输入锁时序
import { g } from 'genshin-ts/runtime/core'
import type { IntValue } from 'genshin-ts/runtime/value'
// ServerExecutionFlowFunctions 定义于 src/definitions/nodes.ts（2026-08-13 修正 import 路径：
// 原 'genshin-ts/runtime/definitions/nodes' 无对应导出，tsc TS2307；管线 tsx 不查类型故此前未暴露）
import type { ServerExecutionFlowFunctions } from 'genshin-ts/definitions/nodes'

// 18° 段常量（cos18°=0.9510565, sin18°=0.309017）：
//   vel = v·(cos−1)/0.2 + (axis×v)·sin/0.2
const K_LINEAR = -0.2447175 // (0.9510565 − 1) / 0.2
const K_CROSS = 1.545085 // 0.309017 / 0.2

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
      b7: entity(0)
    }
  })
  .on('whenEntityIsCreated', (_evt, f) => {
    // 图只挂控制器：本事件在控制器创建时触发（日志已验证 rec1），角块创建与变量
    // 读写都在控制器实例内完成（图变量按挂载实体实例隔离，跨实例读取为空——2026-08-13 日志结论）
      // 角块 i 位置 = (3,3,3) + 0.4825·(dx,dy,dz)，rotate=(0,0,0)，owner=关卡实体
      const c0 = f.createPrefab(
        1077936129,
        f.create3dVector(2.5175, 2.5175, 2.5175),
        f.create3dVector(0, 0, 0),
        stage,
        false,
        0,
        [] as IntValue[]
      )
      f.setNodeGraphVariable('b0', c0, false)
      const c1 = f.createPrefab(
        1077936130,
        f.create3dVector(3.4825, 2.5175, 2.5175),
        f.create3dVector(0, 0, 0),
        stage,
        false,
        0,
        [] as IntValue[]
      )
      f.setNodeGraphVariable('b1', c1, false)
      const c2 = f.createPrefab(
        1077936131,
        f.create3dVector(2.5175, 2.5175, 3.4825),
        f.create3dVector(0, 0, 0),
        stage,
        false,
        0,
        [] as IntValue[]
      )
      f.setNodeGraphVariable('b2', c2, false)
      const c3 = f.createPrefab(
        1077936132,
        f.create3dVector(3.4825, 2.5175, 3.4825),
        f.create3dVector(0, 0, 0),
        stage,
        false,
        0,
        [] as IntValue[]
      )
      f.setNodeGraphVariable('b3', c3, false)
      const c4 = f.createPrefab(
        1077936133,
        f.create3dVector(2.5175, 3.4825, 2.5175),
        f.create3dVector(0, 0, 0),
        stage,
        false,
        0,
        [] as IntValue[]
      )
      f.setNodeGraphVariable('b4', c4, false)
      const c5 = f.createPrefab(
        1077936134,
        f.create3dVector(3.4825, 3.4825, 2.5175),
        f.create3dVector(0, 0, 0),
        stage,
        false,
        0,
        [] as IntValue[]
      )
      f.setNodeGraphVariable('b5', c5, false)
      const c6 = f.createPrefab(
        1077936135,
        f.create3dVector(2.5175, 3.4825, 3.4825),
        f.create3dVector(0, 0, 0),
        stage,
        false,
        0,
        [] as IntValue[]
      )
      f.setNodeGraphVariable('b6', c6, false)
      const c7 = f.createPrefab(
        1077936136,
        f.create3dVector(3.4825, 3.4825, 3.4825),
        f.create3dVector(0, 0, 0),
        stage,
        false,
        0,
        [] as IntValue[]
      )
      f.setNodeGraphVariable('b7', c7, false)
  })
  .on('whenTabIsSelected', (evt, f) => {
    if (f.equal(f.getNodeGraphVariable('lock').asType('bool'), false)) {
      f.setNodeGraphVariable('lock', true, false)
      // tabId 1..6 = R/L/U/D/F/B；层轴与方向（WCA：R 从 +X 看顺时针，符号待游戏核验）
      // R：x+ 层绕 X 负转（b1,b3,b5,b7）
      if (f.equal(evt.tabId, 1)) {
        gstsServerMove(f, -1, 0, 0, 'b1', 'b3', 'b5', 'b7')
      } else if (f.equal(evt.tabId, 2)) {
        // L：x− 层绕 X 正转（b0,b2,b4,b6）
        gstsServerMove(f, 1, 0, 0, 'b0', 'b2', 'b4', 'b6')
      } else if (f.equal(evt.tabId, 3)) {
        // U：y+ 层绕 Y 负转（b4,b5,b6,b7）
        gstsServerMove(f, 0, -1, 0, 'b4', 'b5', 'b6', 'b7')
      } else if (f.equal(evt.tabId, 4)) {
        // D：y− 层绕 Y 正转（b0,b1,b2,b3）
        gstsServerMove(f, 0, 1, 0, 'b0', 'b1', 'b2', 'b3')
      } else if (f.equal(evt.tabId, 5)) {
        // F：z+ 层绕 Z 负转（b2,b3,b6,b7）
        gstsServerMove(f, 0, 0, -1, 'b2', 'b3', 'b6', 'b7')
      } else {
        // B：z− 层绕 Z 正转（b0,b1,b4,b5）
        gstsServerMove(f, 0, 0, 1, 'b0', 'b1', 'b4', 'b5')
      }
      // 1s 后解锁（转动总时长 = 5 段 × 0.2s = 1s，与自旋同步）
      setTimeout((_e, tf) => {
        tf.setNodeGraphVariable('lock', false, false)
      }, 1000)
    }
  })

// 一次层转动：4 块自旋（90°/s × 1s）+ 5 段公转（段 k 于 t=(k−1)·0.2 启动）
function gstsServerMove(
  f: ServerExecutionFlowFunctions,
  ax: number,
  ay: number,
  az: number,
  b0: string,
  b1: string,
  b2: string,
  b3: string
) {
  gstsServerSpin(f, b0, ax, ay, az)
  gstsServerSpin(f, b1, ax, ay, az)
  gstsServerSpin(f, b2, ax, ay, az)
  gstsServerSpin(f, b3, ax, ay, az)
  gstsServerOrbit(f, b0, ax, ay, az, 'orbit1')
  gstsServerOrbit(f, b1, ax, ay, az, 'orbit1')
  gstsServerOrbit(f, b2, ax, ay, az, 'orbit1')
  gstsServerOrbit(f, b3, ax, ay, az, 'orbit1')
  setTimeout((_e, tf) => {
    gstsServerOrbit(tf, b0, ax, ay, az, 'orbit2')
    gstsServerOrbit(tf, b1, ax, ay, az, 'orbit2')
    gstsServerOrbit(tf, b2, ax, ay, az, 'orbit2')
    gstsServerOrbit(tf, b3, ax, ay, az, 'orbit2')
  }, 200)
  setTimeout((_e, tf) => {
    gstsServerOrbit(tf, b0, ax, ay, az, 'orbit3')
    gstsServerOrbit(tf, b1, ax, ay, az, 'orbit3')
    gstsServerOrbit(tf, b2, ax, ay, az, 'orbit3')
    gstsServerOrbit(tf, b3, ax, ay, az, 'orbit3')
  }, 400)
  setTimeout((_e, tf) => {
    gstsServerOrbit(tf, b0, ax, ay, az, 'orbit4')
    gstsServerOrbit(tf, b1, ax, ay, az, 'orbit4')
    gstsServerOrbit(tf, b2, ax, ay, az, 'orbit4')
    gstsServerOrbit(tf, b3, ax, ay, az, 'orbit4')
  }, 600)
  setTimeout((_e, tf) => {
    gstsServerOrbit(tf, b0, ax, ay, az, 'orbit5')
    gstsServerOrbit(tf, b1, ax, ay, az, 'orbit5')
    gstsServerOrbit(tf, b2, ax, ay, az, 'orbit5')
    gstsServerOrbit(tf, b3, ax, ay, az, 'orbit5')
  }, 800)
}

// 自旋：绕层轴 90°/s × 1s（角速度恒 90，方向由轴符号表达）
function gstsServerSpin(
  f: ServerExecutionFlowFunctions,
  b: string,
  ax: number,
  ay: number,
  az: number
) {
  const block = f.getNodeGraphVariable(b).asType('entity')
  f.addUniformBasicRotationBasedMotionDevice(block, 'spin', 1, 90, f.create3dVector(ax, ay, az))
}

// 单段公转：v = 当前位置 − 中心；vel = v·K_LINEAR + (axis×v)·K_CROSS（18° 弦向量/0.2s）
function gstsServerOrbit(
  f: ServerExecutionFlowFunctions,
  b: string,
  ax: number,
  ay: number,
  az: number,
  name: string
) {
  const block = f.getNodeGraphVariable(b).asType('entity')
  const loc = f.getEntityLocationAndRotation(block).location
  const v = f._3dVectorSubtraction(loc, f.create3dVector(3, 3, 3))
  const axv = f._3dVectorCrossProduct(f.create3dVector(ax, ay, az), v)
  const vel = f._3dVectorAddition(
    f._3dVectorZoom(v, K_LINEAR),
    f._3dVectorZoom(axv, K_CROSS)
  )
  f.addUniformBasicLinearMotionDevice(block, name, 0.2, vel)
}

export default graph
