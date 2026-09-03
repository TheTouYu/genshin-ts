// fb-loop-chan.ts —— 三探针等价重构自证·客户端半边（票 19 小类 1.3，compile-only）
//
// 原版=fb-loop.ts（票 18 现网图 1082130436，R5 前零字节红线——本文件不动它）。
// 本文件=同一三探针语义（A 技能变量递增 / T 瞬移+自读回传 / C HP 恢复公共段）
// 用 channels.ts 原语重写：chanIncr+chanSendScalar（A 整链）/ chanSendScalar（T 回传）/
// chanDispatch（4 实例分发）——证明原语库可用且语义不变（复用层不缩水）。
// 语义等价要点（与原版逐句对应）：
//   · 每拍**单次** chanIncr（原版单次 q→n→set；rb 读回≡n——同拍零延迟 776/776 实证），
//     rb 同时供 SVA 回传与 T 的三角函数（原版 n 的两个消费点）
//   · teleport/getEntityLocation/recoverCreationSHp 为调用层引擎节点（无原语覆盖，原样）
// ⚠️ 占位图 ID 1082130500 / 1073741898：**禁止注入**（compile-only 自证）。
// 打印纪律：零 print（与原版一致）。cfg 与实体常量沿用现网真值（编译期消费）。
import { g } from 'genshin-ts/runtime/core'
import { DamagePopUpType } from 'genshin-ts/definitions/enum'

import {
  chanDispatch,
  chanIncr,
  chanPollStart,
  chanSelfId,
  chanSendScalar
} from './channels.js'
import { FbSignal } from './signals.js'

const BALL_GUID = 1077936135n
// 实体 ID（与 fb-loop.ts 同源：18-entity-ids.md 实测）
const E447 = 1082130447n
const E448 = 1082130448n
const E449 = 1082130449n
const E450 = 1082130450n
// 各造物原位置 z 常量（teleport 绝对坐标防叠点）
const Z447 = -12.7
const Z448 = -11.7
const Z449 = 11.1
const Z450 = 11.6
// 每实例独立 cfg（一实例一 cfg——并发写竞态规避；const 直传，禁算术）
const CFG447 = 1207959553n
const CFG448 = 1207959554n
const CFG449 = 1207959555n
const CFG450 = 1207959556n

// 每实例探针链（A：单次递增+读回传 / T：瞬移+自读位置回传）——与原版分支体语义对应
const probe = (f: any, cfg: bigint, tagA: string, tagT: string, z: number) => {
  const rb = chanIncr(f, cfg) // 单次递增；rb=同拍读回 ≡ 原版 n（零延迟实证）
  chanSendScalar(f, FbSignal.fb_sv_echo, tagA, rb)
  const nf = f.dataTypeConversion(rb, 'float') // 原版 n 的 float 形态
  const xM = f.multiplication(2, f.sineFunction(f.multiplication(nf, 0.3)))
  const ryDeg = f.multiplication(nf, 9)
  f.complexCreationTeleport(f.create3dVector(xM, 0, z), f.create3dVector(0, ryDeg, 0))
  const loc = f.getEntityLocation(f.getSelfEntity())
  chanSendScalar(
    f,
    FbSignal.fb_sv_echo,
    tagT,
    f.dataTypeConversion(f.multiplication(loc.x, 100), 'int')
  )
}

g.creationSkill({ id: 1082130500, name: '_GSTS_fbLoopChan' }).on('start', (_evt, f) => {
  // ———— 公共探针 C：恢复球 HP（调用层引擎节点，原样） ————
  f.recoverCreationSHp(entity(BALL_GUID), 0.5, true)

  // ———— 4 实例分发：chanDispatch（idAt 返回原生 const；末分支兜底 else 空） ————
  const guid = chanSelfId(f)
  chanDispatch(
    f,
    guid,
    4,
    (i) => {
      if (i === 0) return E447
      if (i === 1) return E448
      if (i === 2) return E449
      return E450
    },
    (i) => {
      if (i === 0) return () => probe(f, CFG447, 'SVA1', 'SVT1', Z447)
      if (i === 1) return () => probe(f, CFG448, 'SVA2', 'SVT2', Z448)
      if (i === 2) return () => probe(f, CFG449, 'SVA3', 'SVT3', Z449)
      return () => probe(f, CFG450, 'SVA4', 'SVT4', Z450)
    }
  )
})

// ———— 附：服务端读回半边（fb-svlisten 等价原语版，占位 1073741898） ————
// 原版=fb-svlisten.ts（现网 1073741831 零字节红线）。原语化面：chanPollStart
// （startTimer+assemblyList）；图级事件（whenTimerIsTriggered 名单制/onSignal/
// whenHpIsRecovered=chanOnHpPulse 约定）与 getCustomVariable/setCustomVariable
// （无对应原语，调用层语义）原样保留。
g.server({ id: 1073741898, name: '_GSTS_fbSvlistenChan' })
  .on('whenEntityIsCreated', (_evt, f) => {
    const ball = f.getSelfEntity()
    f.recoverHpDirectly(ball, ball, 1, true, 0, 0, f.assemblyList(['fbx'], 'str'))
    chanPollStart(f, ball, 'fb_sv_poll', 0.06)
    chanPollStart(f, ball, 'fb_hp_drain', 2)
  })
  .on('whenTimerIsTriggered', (evt, f) => {
    const ball = f.getSelfEntity()
    f.doubleBranch(f.equal(evt.timerName, 'fb_sv_poll'), () => {
      f.setCustomVariable(ball, 'fb_tp_x1', f.getEntityLocationAndRotation(entity(E447)).location.x, false)
      f.setCustomVariable(ball, 'fb_tp_x2', f.getEntityLocationAndRotation(entity(E448)).location.x, false)
      f.setCustomVariable(ball, 'fb_tp_x3', f.getEntityLocationAndRotation(entity(E449)).location.x, false)
      f.setCustomVariable(ball, 'fb_tp_x4', f.getEntityLocationAndRotation(entity(E450)).location.x, false)
      f.setCustomVariable(ball, 'fb_tp_seen_ry', f.getEntityLocationAndRotation(entity(E447)).rotate.y, false)
      f.setCustomVariable(ball, 'fb_hp_seen', f.getObjectAttribute(ball).currentHp, false)
    }, () => {
      f.doubleBranch(f.equal(evt.timerName, 'fb_hp_drain'), () => {
        const attr = f.getObjectAttribute(ball)
        f.hpLoss(ball, f.multiplication(attr.maxHp, 0.1), false, false, false, DamagePopUpType.NoPopUp)
      }, () => {})
    })
  })
  .on('whenHpIsRecovered', (evt, f) => {
    const ball = f.getSelfEntity()
    const cnt = f.getCustomVariable(ball, 'fb_hp_evt_count').asType('int')
    f.setCustomVariable(ball, 'fb_hp_evt_count', cnt + 1n, false)
    f.setCustomVariable(ball, 'fb_hp_evt_amt', evt.recoveryAmount, false)
  })
  .onSignal(FbSignal.fb_sv_echo, (evt, f) => {
    const ball = f.getSelfEntity()
    const total = f.getCustomVariable(ball, 'fb_sv_count_a').asType('int')
    f.setCustomVariable(ball, 'fb_sv_count_a', total + 1n, false)
    f.doubleBranch(f.equal(evt.params.tag, 'SVA1'), () => {
      const c = f.getCustomVariable(ball, 'fb_sv_c1').asType('int')
      f.setCustomVariable(ball, 'fb_sv_c1', c + 1n, false)
      f.setCustomVariable(ball, 'fb_sv_last_a', evt.params.e, false)
    }, () => {
      f.doubleBranch(f.equal(evt.params.tag, 'SVA2'), () => {
        const c = f.getCustomVariable(ball, 'fb_sv_c2').asType('int')
        f.setCustomVariable(ball, 'fb_sv_c2', c + 1n, false)
      }, () => {
        f.doubleBranch(f.equal(evt.params.tag, 'SVA3'), () => {
          const c = f.getCustomVariable(ball, 'fb_sv_c3').asType('int')
          f.setCustomVariable(ball, 'fb_sv_c3', c + 1n, false)
        }, () => {
          f.doubleBranch(f.equal(evt.params.tag, 'SVA4'), () => {
            const c = f.getCustomVariable(ball, 'fb_sv_c4').asType('int')
            f.setCustomVariable(ball, 'fb_sv_c4', c + 1n, false)
          }, () => {})
        })
      })
    })
  })
