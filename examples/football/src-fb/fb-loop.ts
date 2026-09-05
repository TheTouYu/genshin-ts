// @status: experimental（票18 客户端探针 1082130436）
// 票 18 · fb-loop（20008 客户端实验图 1082130436，4 造物并发版，2026-09-03，地图 1073741908）
//
// 4 造物并发三探针（票 18 设计稿，用户确认）：
//   · 身份区分：queryGuidByEntity(getSelfEntity()) → 4 分支（实体 447/448/449/450 实测 ID）
//   · 每分支：探针 A（独立 cfg 递增——并发写竞态规避）+ 探针 T（瞬移 z 用各自原位置常量防重叠）
//   · 公共段：探针 C（恢复球 HP，与 GUID 无关，图头一次）
//   · ⚠️ 4 份探针链同构手写（setSkillVariable 的 configID 仅字面量、复合传参有字面量风险）——
//     改探针逻辑必须 4 份同步改（18-design.md 设计决策）
// 触发：4 造物 AI 自主循环（447=R1 造物+448/449/450 用户新放，均绑 GSTS-fb-loop-exp）
// 打印纪律：全程零 print。cfg：1207959553~56（447 延续 R1 值域），1207959557 备用。
import { g } from 'genshin-ts/runtime/core'

import { FbSignal } from './signals.js'

const BALL_GUID = 1077936135n
// 实体 ID（18-entity-ids.md 实测：447=3132 f9 帧值铁证；448-450=entities diff）
const E447 = 1082130447n
const E448 = 1082130448n
const E449 = 1082130449n
const E450 = 1082130450n
// 各造物原位置 z 常量（18-design.md：teleport 绝对坐标，z 各异防 4 造物叠点）
const Z447 = -12.7
const Z448 = -11.7
const Z449 = 11.1
const Z450 = 11.6

g.creationSkill({ id: 1082130436, name: '_GSTS_fbLoop' }).on('start', (_evt, f) => {
  // ———— 公共探针 C：恢复球 HP（与身份无关） ————
  f.recoverCreationSHp(entity(BALL_GUID), 0.5, true)

  const guid = f.queryGuidByEntity(f.getSelfEntity())
  // ———— 分支 1：实体 447（R1 延续，cfg=1207959553） ————
  f.doubleBranch(f.equal(guid, E447), () => {
    const q1 = f.querySkillVariableValue(1207959553n)
    const n = f.dataTypeConversion(q1, 'int') + 1n
    f.setSkillVariable(1207959553n, f.dataTypeConversion(n, 'float'))
    const rb = f.dataTypeConversion(f.querySkillVariableValue(1207959553n), 'int')
    f.sendSignalToServerNodeGraph(FbSignal.fb_sv_echo, 'SVA1', rb)
    const xM = f.multiplication(2, f.sineFunction(f.multiplication(f.dataTypeConversion(n, 'float'), 0.3)))
    const ryDeg = f.multiplication(f.dataTypeConversion(n, 'float'), 9)
    f.complexCreationTeleport(f.create3dVector(xM, 0, Z447), f.create3dVector(0, ryDeg, 0))
    const loc = f.getEntityLocation(f.getSelfEntity())
    f.sendSignalToServerNodeGraph(
      FbSignal.fb_sv_echo,
      'SVT1',
      f.dataTypeConversion(f.multiplication(loc.x, 100), 'int')
    )
  }, () => {
    // ———— 分支 2：实体 448（cfg=1207959554） ————
    f.doubleBranch(f.equal(guid, E448), () => {
      const q1 = f.querySkillVariableValue(1207959554n)
      const n = f.dataTypeConversion(q1, 'int') + 1n
      f.setSkillVariable(1207959554n, f.dataTypeConversion(n, 'float'))
      const rb = f.dataTypeConversion(f.querySkillVariableValue(1207959554n), 'int')
      f.sendSignalToServerNodeGraph(FbSignal.fb_sv_echo, 'SVA2', rb)
      const xM = f.multiplication(2, f.sineFunction(f.multiplication(f.dataTypeConversion(n, 'float'), 0.3)))
      const ryDeg = f.multiplication(f.dataTypeConversion(n, 'float'), 9)
      f.complexCreationTeleport(f.create3dVector(xM, 0, Z448), f.create3dVector(0, ryDeg, 0))
      const loc = f.getEntityLocation(f.getSelfEntity())
      f.sendSignalToServerNodeGraph(
        FbSignal.fb_sv_echo,
        'SVT2',
        f.dataTypeConversion(f.multiplication(loc.x, 100), 'int')
      )
    }, () => {
      // ———— 分支 3：实体 449（cfg=1207959555） ————
      f.doubleBranch(f.equal(guid, E449), () => {
        const q1 = f.querySkillVariableValue(1207959555n)
        const n = f.dataTypeConversion(q1, 'int') + 1n
        f.setSkillVariable(1207959555n, f.dataTypeConversion(n, 'float'))
        const rb = f.dataTypeConversion(f.querySkillVariableValue(1207959555n), 'int')
        f.sendSignalToServerNodeGraph(FbSignal.fb_sv_echo, 'SVA3', rb)
        const xM = f.multiplication(2, f.sineFunction(f.multiplication(f.dataTypeConversion(n, 'float'), 0.3)))
        const ryDeg = f.multiplication(f.dataTypeConversion(n, 'float'), 9)
        f.complexCreationTeleport(f.create3dVector(xM, 0, Z449), f.create3dVector(0, ryDeg, 0))
        const loc = f.getEntityLocation(f.getSelfEntity())
        f.sendSignalToServerNodeGraph(
          FbSignal.fb_sv_echo,
          'SVT3',
          f.dataTypeConversion(f.multiplication(loc.x, 100), 'int')
        )
      }, () => {
        // ———— 分支 4：实体 450（显式 equal——else 留空防第 5 造物误绑污染数据，cfg=1207959556） ————
        f.doubleBranch(f.equal(guid, E450), () => {
          const q1 = f.querySkillVariableValue(1207959556n)
          const n = f.dataTypeConversion(q1, 'int') + 1n
          f.setSkillVariable(1207959556n, f.dataTypeConversion(n, 'float'))
          const rb = f.dataTypeConversion(f.querySkillVariableValue(1207959556n), 'int')
          f.sendSignalToServerNodeGraph(FbSignal.fb_sv_echo, 'SVA4', rb)
          const xM = f.multiplication(2, f.sineFunction(f.multiplication(f.dataTypeConversion(n, 'float'), 0.3)))
          const ryDeg = f.multiplication(f.dataTypeConversion(n, 'float'), 9)
          f.complexCreationTeleport(f.create3dVector(xM, 0, Z450), f.create3dVector(0, ryDeg, 0))
          const loc = f.getEntityLocation(f.getSelfEntity())
          f.sendSignalToServerNodeGraph(
            FbSignal.fb_sv_echo,
            'SVT4',
            f.dataTypeConversion(f.multiplication(loc.x, 100), 'int')
          )
        }, () => {
          // 非四实体之一：不跑（防误绑造物污染数据）
        })
      })
    })
  })
})
