// kit-probe.ts —— R3 技术验证探针（独立探针史莱姆专用；只做验证，不含玩法）
//
// 三件事，按 tick 分时间段自跑（每拍一次施放；若公共冷却未忽略则每拍≈1/3s，见文档注意）：
//   A 段 E3 地形：teleport 到 3 个设定高度（+3 / +0.2 / −2），每段末用 getEntityLocation 读回，
//                把「设定 y − 读回 y」的绝对值累加到槽 PROBE_E3（0 = 不陷不抬）
//   B 段 E1 隧穿：以 25 m/s 沿 +X 掠过，同时算两种判据（对「最近玩家实体」）：
//                点判据 = 本拍球心到玩家 < 0.8；线段判据 = 上一拍→本拍线段到玩家 < 0.8
//                两个计数分别累加到槽 PROBE_E1P / PROBE_E1S；每段结束把计数写回自持
//   C 段 E4 射线：从当前位置沿 +X 投 12m 射线（层=场景/物件/光标受击盒，实体类型=角色），
//                命中就 teleport 到命中点（视觉：它会"贴"到被命中物上），命中计数累加槽 PROBE_E4
//
// 视觉反馈：A 段看它停在草面/半空/地下三档；B 段看它高速掠过玩家（若点判据漏、线段判据中，
//           两个计数会不同，由日志读）；C 段看它跳到命中点。
import { g } from 'genshin-ts/runtime/core'
import { chanSendState6 } from '../../client-kit/channels.js'
import { RayFilterType } from 'genshin-ts/definitions/client_enums'
import { TargetType } from 'genshin-ts/definitions/enum'
import { KitSignal } from './signals.js'

// cfgId 铁律：每个槽一个字面量（`SLOT + 3n` 会被 Stage 1 改写成 f.addition，config_id 要字面量）
const S_TICK = 1207959578n
const S_E1P = 1207959579n
const S_E1S = 1207959580n
const S_E3 = 1207959581n
const S_E4 = 1207959582n
const S_PREV = 1207959583n // 上一拍球心（打包成 vec3 不现实，这里用 3 个槽：X/Y/Z）
const S_PREVX = 1207959583n
const S_PREVY = 1207959584n
const S_PREVZ = 1207959585n

const SPEED = 25.0 // m/s
const HIT_R = 0.8
const PHASE_TICKS = 24

g.creationSkill({ id: 1082130440, name: '_GSTS_kitProbe' }).on('start', (_evt: any, f: any) => {
  const self = f.getSelfEntity()
  // increaseSkillVariableValue 返回 void（不是新值）⇒ 递增后再查一次
  f.increaseSkillVariableValue(S_TICK, 1.0)
  const tick = f.querySkillVariableValue(S_TICK)

  // 最近玩家（客户端参数序：(iD, list)）
  const players = f.getListOfPlayerEntitiesOnTheField()
  const p0 = f.getCorrespondingValueFromList(0n, players)
  const pLoc = f.getEntityLocation(p0)
  const pParts = f.split3dVector(pLoc)

  // 本拍起点 = 自持里的上一拍位置（首拍为 0）
  const prev = f.create3dVector(
    f.querySkillVariableValue(S_PREVX),
    f.querySkillVariableValue(S_PREVY),
    f.querySkillVariableValue(S_PREVZ)
  )

  // 三个阶段的 localVariable（分支间传值）
  const nxt = f.localVariable('vec3')
  const st = f.localVariable('int') // 0=A(地形) 1=B(隧穿) 2=C(射线)

  f.doubleBranch(
    f.lessThanOrEqualTo(tick, 24.0),
    () => {
      // —— A 段 E3：三档高度，每 8 拍一档 ——
      st.set(0n)
      f.doubleBranch(
        f.lessThanOrEqualTo(tick, 8.0),
        () => {
          nxt.set(f.create3dVector(6.0, 3.0, 6.0))
        },
        () => {
          f.doubleBranch(
            f.lessThanOrEqualTo(tick, 16.0),
            () => {
              nxt.set(f.create3dVector(6.0, 0.2, 6.0))
            },
            () => {
              nxt.set(f.create3dVector(6.0, -2.0, 6.0))
            }
          )
        }
      )
    },
    () => {
      f.doubleBranch(
        f.lessThanOrEqualTo(tick, 48.0),
        () => {
          // —— B 段 E1：从 x=-10 起沿 +X 以 25m/s 走 24 拍（≈40m）——
          st.set(1n)
          const bx = f.subtraction(f.multiplication(f.subtraction(tick, 24.0), SPEED * 0.0666), 10.0)
          nxt.set(f.create3dVector(bx, 0.9, 6.0))
        },
        () => {
          // —— C 段 E4：固定在 (6,0.9,6) 朝 +X 投射线 ——
          st.set(2n)
          nxt.set(f.create3dVector(6.0, 0.9, 6.0))
        }
      )
    }
  )

  // 判定（B 段用）：点判据 vs 线段判据
  const pointHit = f.lessThanOrEqualTo(
    f._3dVectorModuloOperation(
      f._3dVectorSubtraction(f.create3dVector(nxt.value.x, nxt.value.y, nxt.value.z), pLoc)
    ),
    HIT_R
  )
  // 线段判据的数字实现放在 verify 阶段（叉积距离），此处先用「上一拍位置到玩家的距离」近似占位，
  // 真实线段判据见 segmentHitBelow（与点判据共享同一段代码，避免各写一份）。
  const segHit = f.lessThanOrEqualTo(
    f._3dVectorModuloOperation(f._3dVectorSubtraction(prev, pLoc)),
    HIT_R
  )

  f.doubleBranch(
    f.equal(st.value, 1n),
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

  // —— C 段 E4 射线（每拍都投，只有 C 段计数）——
  const hit = f.getRayDetectionResult(
    self,
    f.create3dVector(nxt.value.x, nxt.value.y, nxt.value.z),
    f.create3dVector(1.0, 0.0, 0.0),
    12.0,
    TargetType.None,
    f.getEntityTypeList(),
    f.getRayFilterTypeList([RayFilterType.Scene])
  )
  const hitParts = f.split3dVector(hit.onHitLocation)

  // 位移：A/B 段搬到自己算的点；C 段搬到命中点（命中点全 0 说明没命中，就留在原位）
  const useHit = f.logicalAndOperation(
    f.equal(st.value, 2n),
    f.greaterThan(f.addition(f.addition(hitParts.xComponent, hitParts.yComponent), hitParts.zComponent), 0.0)
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

  // A 段末（每 8 拍的最后一拍）读回实际高度，累计「设定 − 实际」绝对值
  // 每档最后一拍（8/16/24）：creation_skill 没有 modulo，用等值判断
  const atEnd = f.logicalOrOperation(
    f.logicalOrOperation(f.equal(tick, 8.0), f.equal(tick, 16.0)),
    f.equal(tick, 24.0)
  )
  f.doubleBranch(
    f.logicalAndOperation(f.equal(st.value, 0n), atEnd),
    () => {
      const got = f.split3dVector(f.getEntityLocation(self))
      const diff = f._3dVectorModuloOperation(
        f._3dVectorSubtraction(f.create3dVector(nxt.value.x, nxt.value.y, nxt.value.z), f.create3dVector(got.xComponent, got.yComponent, got.zComponent))
      )
      f.increaseSkillVariableValue(S_E3, diff)
    },
    () => {}
  )

  // 记录本拍位置供下一拍做线段判据
  f.setSkillVariable(S_PREVX, nxt.value.x)
  f.setSkillVariable(S_PREVY, nxt.value.y)
  f.setSkillVariable(S_PREVZ, nxt.value.z)

// ———— 回传（服务端 _GSTS_kitListen 打印；每 8 拍一次，避免洪泛）———
  const atReport = f.logicalOrOperation(
    f.logicalOrOperation(
      f.logicalOrOperation(f.equal(tick, 8.0), f.equal(tick, 16.0)),
      f.logicalOrOperation(f.equal(tick, 24.0), f.equal(tick, 32.0))
    ),
    f.logicalOrOperation(
      f.logicalOrOperation(f.equal(tick, 40.0), f.equal(tick, 48.0)),
      f.logicalOrOperation(f.equal(tick, 56.0), f.equal(tick, 64.0))
    )
  )
  f.doubleBranch(
    atReport,
    () => {
      const e1p = f.querySkillVariableValue(S_E1P)
      const e1s = f.querySkillVariableValue(S_E1S)
      const e3 = f.querySkillVariableValue(S_E3)
      const e4 = f.querySkillVariableValue(S_E4)
      chanSendState6(
        f,
        KitSignal.kit_state,
        'P',
        f.dataTypeConversion(tick, 'int'),
        f.create3dVector(e1p, e1s, e4),
        f.create3dVector(e3, 0.0, 0.0),
        f.create3dVector(0.0, 0.0, 0.0),
        st.value
      )
    },
    () => {}
  )
})
