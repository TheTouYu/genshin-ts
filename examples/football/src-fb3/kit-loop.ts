// @status: 探针期（2026-10-25；探针验完恢复跟随/物理）
// fb3/kit-loop.ts —— 20008 造物技能图（1082130436）：本拍 = 拍号 + R3 探针（E3/E1/E4）+ 回传
//
// 为什么探针塞进这张图：独立探针图（1082130440，123 节点，技能条目 #1 配置 1191182340）
// 在真机上一拍都没执行（日志 records 里 0 条），而本图稳定 7~15/s —— 先用能跑的这条链拿读数。
//
// 探针（每拍一次施放，按 tick 分段）：
//   E3 地形   tick 1..24   ：停 (6,+3,6) → (6,+0.2,6) → (6,−2,6)，每 8 拍末读回实际位置，
//                            把 |设定 − 实际| 累加进 S_E3（0 = 不陷不抬）
//   E1 隧穿   tick 25..48  ：从 x=−10 沿 +X 以 25 m/s 掠过（y=0.9 腰高），
//                            同时算「点判据」与「线段判据」对最近玩家的命中，分别计数 S_E1P / S_E1S
//   E4 射线   tick ≥49     ：停 (6,0.9,6) 沿 +X 投 12m 射线（层=场景），命中则贴到命中点，计数 S_E4
//   回传：每 8 拍发 kit_state：pos=(E1P,E1S,E4) spin=(E3,0,0) state=阶段(0/1/2)
//
// 真值：图 1082130436 / 技能配置 1191182338（cd 0.03 + 忽略公共冷却，用户调的）/ 造物 1082130442
// 铁律：客户端参数序 (iD, list)；编译必须用 dist CLI。
import { g } from 'genshin-ts/runtime/core'

import { chanIncr, chanSendState6 } from '../../client-kit/channels.js'
import { RayFilterType } from 'genshin-ts/definitions/client_enums'
import { TargetType } from 'genshin-ts/definitions/enum'
import { KitSignal } from './signals.js'

const SLOT_TICK = 1207959557n
// 探针自持槽（cfgId 必须字面量：`SLOT + 3n` 会被 Stage 1 改写成 f.addition，config_id 要字面量）
const S_E1P = 1207959553n
const S_E1S = 1207959554n
const S_E3 = 1207959555n
const S_E4 = 1207959556n
const S_PREVX = 1207959559n
const S_PREVY = 1207959560n
const S_PREVZ = 1207959564n

const SPEED = 25.0
const STEP = 25.0 * 0.0666
const HIDDEN_Y = -3.0 // 每拍前进距离（float 常量，避免 int*float 泛型不匹配）
const HIT_R = 0.8

g.creationSkill({ id: 1082130436, name: '_GSTS_kitLoop' }).on('start', (_evt: any, f: any) => {
  const self = f.getSelfEntity()
  const tick = chanIncr(f, SLOT_TICK)

  // 最近玩家（客户端参数序 (iD, list)）
  // ⚠️ 玩家列表元素是**玩家控制器实体**，它的 getEntityLocation 恒为 0（D318 实锤）。
  //    要拿真实坐标必须再取「该玩家当前激活的角色实体」。
  const players = f.getListOfPlayerEntitiesOnTheField()
  const p0 = f.getCorrespondingValueFromList(0n, players)
  // ⚠️ getActiveCharacterOfSpecifiedPlayer / getPlayerSCharacterList 在 beyond 模式都 CLIENT_NODE_UNAVAILABLE
  //    ⇒ 客户端只能用玩家实体本身（实测其位置非 0，跟随曾经工作过）
  const pLoc = f.getEntityLocation(p0)
  const pP = f.split3dVector(pLoc)
  // 玩家的"躯干高度"：以玩家脚下 +0.9m 作为判定中心
  const pBody = f.create3dVector(pP.xComponent, f.addition(pP.yComponent, 0.9), pP.zComponent)
  const prev = f.create3dVector(
    f.querySkillVariableValue(S_PREVX),
    f.querySkillVariableValue(S_PREVY),
    f.querySkillVariableValue(S_PREVZ)
  )

  const nxt = f.localVariable('vec3')
  const phase = f.localVariable('int')

  // 开局暖机（用户 2026-10-27）：游戏还在建图/建实体，此时 teleport 与判定都无意义。
  // 用 tick 近似时间：15/s 时 75 拍 ≈ 5s；掉到 7.5/s 时 ≈ 10s（"至少 5 秒"，宁可长一点）。
  f.doubleBranch(
    f.lessThanOrEqualTo(tick, 75n),
    () => {},
    () => {
  f.doubleBranch(
    f.lessThanOrEqualTo(tick, 83n),
    () => {
      // —— E3 地形：只测一档（空中 +3），另两档 +0.2 / −2 在 8~16 / 16~24 拍 ——
      phase.set(0n)
      nxt.set(f.create3dVector(6.0, 3.0, 6.0))
    },
    () => {
      f.doubleBranch(
        f.lessThanOrEqualTo(tick, 91n),
        () => {
          phase.set(0n)
          nxt.set(f.create3dVector(6.0, 0.2, 6.0))
        },
        () => {
          f.doubleBranch(
            f.lessThanOrEqualTo(tick, 99n),
            () => {
              phase.set(0n)
              nxt.set(f.create3dVector(6.0, -2.0, 6.0))
            },
            () => {
              f.doubleBranch(
                f.lessThanOrEqualTo(tick, 123n),
                () => {
                  // —— E1 隧穿：以**玩家实际位置**为中心，从 pz−10 沿 +X 掠过（y=玩家+0.9）——
                  phase.set(1n)
                  const k = f.dataTypeConversion(f.subtraction(tick, 24n), 'float')
                  const bx = f.subtraction(f.addition(f.multiplication(k, STEP), pP.xComponent), 10.0)
                  nxt.set(f.create3dVector(bx, f.addition(pP.yComponent, 0.9), pP.zComponent))
                },
                () => {
                  f.doubleBranch(
                    f.lessThanOrEqualTo(tick, 155n),
                    () => {
                      // —— E4 射线：朝玩家方向投 20m（层=场景）；命中则贴到命中点 ——
                      phase.set(2n)
                      nxt.set(f.create3dVector(pP.xComponent, f.addition(pP.yComponent, 1.2), f.addition(pP.zComponent, 6.0)))
                    },
                    () => {
                      // —— 探针结束：恢复"地下跟随"（用户 2026-10-25：必须贴着玩家，否则距离节流掉频率）——
                      phase.set(3n)
                      nxt.set(f.create3dVector(pP.xComponent, HIDDEN_Y, pP.zComponent))
                    }
                  )
                }
              )
            }
          )
        }
      )
    }
  )

  // 两种判据（E1 段累计）：
  //   点判据 = 本拍球心到玩家躯干 < HIT_R
  //   线段判据 = 上一拍→本拍线段到玩家躯干的最短距离 < HIT_R（15Hz 25m/s 每拍 1.67m ⇒ 点判据必漏）
  const pointHit = f.lessThanOrEqualTo(
    f._3dVectorModuloOperation(f._3dVectorSubtraction(nxt.value, pBody)),
    HIT_R
  )
  const ab = f._3dVectorSubtraction(nxt.value, prev)
  const apv = f._3dVectorSubtraction(pBody, prev)
  const abLen = f._3dVectorModuloOperation(ab)
  const abLenSafe = f.greaterThan(abLen, 0.001)
  const distLine = f.division(
    f._3dVectorModuloOperation(f._3dVectorCrossProduct(ab, apv)),
    abLen
  )
  const segHit = f.logicalAndOperation(
    abLenSafe,
    f.lessThanOrEqualTo(distLine, HIT_R)
  )
  f.doubleBranch(
    f.equal(phase.value, 1n),
    () => {
      f.doubleBranch(
        pointHit,
        () => {
          f.increaseSkillVariableValue(S_E1P, 1.0)
        },
        () => {}
      )
      f.doubleBranch(
        segHit,
        () => {
          f.increaseSkillVariableValue(S_E1S, 1.0)
        },
        () => {}
      )
    },
    () => {}
  )

  // E4 射线
  const toPlayer = f._3dVectorNormalization(f._3dVectorSubtraction(pBody, nxt.value))
  const hit = f.getRayDetectionResult(
    self,
    nxt.value,
    toPlayer,
    20.0,
    TargetType.None,
    f.getEntityTypeList(),
    f.getRayFilterTypeList([RayFilterType.Scene])
  )
  const hp = f.split3dVector(hit.onHitLocation)
  const useHit = f.logicalAndOperation(
    f.equal(phase.value, 2n),
    f.greaterThan(f.addition(f.addition(hp.xComponent, hp.yComponent), hp.zComponent), 0.0)
  )
  f.doubleBranch(
    useHit,
    () => {
      f.complexCreationTeleport(hit.onHitLocation, f.create3dVector(0.0, 0.0, 0.0))
      f.increaseSkillVariableValue(S_E4, 1.0)
    },
    () => {
      f.complexCreationTeleport(nxt.value, f.create3dVector(0.0, 0.0, 0.0))
    }
  )

  // E3 每档末读回高度差
  const atEnd = f.logicalOrOperation(
    f.logicalOrOperation(f.equal(tick, 83n), f.equal(tick, 91n)),
    f.equal(tick, 99n)
  )
  f.doubleBranch(
    f.logicalAndOperation(f.equal(phase.value, 0n), atEnd),
    () => {
      const got = f.split3dVector(f.getEntityLocation(self))
      const diff = f._3dVectorModuloOperation(
        f._3dVectorSubtraction(nxt.value, f.create3dVector(got.xComponent, got.yComponent, got.zComponent))
      )
      f.increaseSkillVariableValue(S_E3, diff)
    },
    () => {}
  )

  // 记本拍位置（下一拍做线段判据）
  const parts = f.split3dVector(nxt.value)
  f.setSkillVariable(S_PREVX, parts.xComponent)
  f.setSkillVariable(S_PREVY, parts.yComponent)
  f.setSkillVariable(S_PREVZ, parts.zComponent)

    }
  )

  // 每 8 拍回传
  const atReport = f.logicalOrOperation(
    f.logicalOrOperation(
      f.logicalOrOperation(f.equal(tick, 83n), f.equal(tick, 91n)),
      f.logicalOrOperation(f.equal(tick, 99n), f.equal(tick, 107n))
    ),
    f.logicalOrOperation(
      f.logicalOrOperation(f.equal(tick, 115n), f.equal(tick, 123n)),
      f.logicalOrOperation(f.equal(tick, 131n), f.equal(tick, 139n))
    )
  )
  f.doubleBranch(
    atReport,
    () => {
      chanSendState6(
        f,
        KitSignal.kit_state,
        'P',
        tick,
        f.create3dVector(
          f.querySkillVariableValue(S_E1P),
          f.querySkillVariableValue(S_E1S),
          f.querySkillVariableValue(S_E4)
        ),
        f.create3dVector(pP.xComponent, pP.zComponent, f.querySkillVariableValue(S_E3)),
        f.create3dVector(0.0, 0.0, 0.0),
        phase.value
      )
    },
    () => {}
  )
})
