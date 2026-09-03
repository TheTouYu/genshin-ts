// chan-loop.ts —— 客户端 20008 原生写通道图模板（N 实例并发版，从票 18 fb-loop 提炼去足球化）
//
// 用法：抄到 entries 目录，替换三处真值（CFG_BASE / E1..E4 / 信号名），编译命令见 README。
// 每实例每拍：A 探针（独立 cfg 递增→信号回传）+ T 探针（瞬移写 transform→自读→信号回传）+ C 探针（恢复目标 HP）。
// 约束已内置：cfg 字面量（一实例一链）/GUID 显式 equal+else 空/float 数字字面量。
//
// ⚠️ 三处真值：
//   1. CFG_BASE+0..3：技能变量配置 ID（编辑器【技能变量管理】创建 N 个连续 ID；占位禁止注入）
//   2. E1..E4 + Z1..Z4：造物实体 GUID（放置后实测）+ 各自原位置 z（teleport 绝对坐标防叠点）
//   3. FbSignal.chan_echo：你的信号名（先 register：tag:str + e:int）
import { g } from 'genshin-ts/runtime/core'

import { FbSignal } from './signals.js'

const CFG_BASE = 1207959553n // TODO 真值：第一个 cfg ID（后续 = +0n/+1n/+2n/+3n）
const TARGET_ENTITY = 1077936135n // TODO 真值：HP 探针写目标（任意实体；服务端事件图挂它）
const E1 = 1082130447n // TODO 真值：实例 1 实体 GUID（日志 f9 帧值铁证 / entities diff）
const E2 = 1082130448n // TODO 真值
const E3 = 1082130449n // TODO 真值
const E4 = 1082130450n // TODO 真值
const Z1 = -12.7 // TODO 真值：实例 1 原位置 z
const Z2 = -11.7
const Z3 = 11.1
const Z4 = 11.6

g.creationSkill({ id: 1082130436, name: '_GSTS_chanLoop' }).on('start', (_evt, f) => {
  // 公共探针 C：恢复目标 HP（服务端 whenHpIsRecovered 事件读回；满血钳制需扣血循环维持）
  f.recoverCreationSHp(entity(TARGET_ENTITY), 0.5, true)

  const guid = f.queryGuidByEntity(f.getSelfEntity())
  // 实例 1
  f.doubleBranch(f.equal(guid, E1), () => {
    const q1 = f.querySkillVariableValue(CFG_BASE)
    const n = f.dataTypeConversion(q1, 'int') + 1n
    f.setSkillVariable(CFG_BASE, f.dataTypeConversion(n, 'float'))
    const rb = f.dataTypeConversion(f.querySkillVariableValue(CFG_BASE), 'int')
    f.sendSignalToServerNodeGraph(FbSignal.chan_echo, 'SVA1', rb)
    const xM = f.multiplication(2, f.sineFunction(f.multiplication(f.dataTypeConversion(n, 'float'), 0.3)))
    const ryDeg = f.multiplication(f.dataTypeConversion(n, 'float'), 9)
    f.complexCreationTeleport(f.create3dVector(xM, 0, Z1), f.create3dVector(0, ryDeg, 0))
    const loc = f.getEntityLocation(f.getSelfEntity())
    f.sendSignalToServerNodeGraph(
      FbSignal.chan_echo,
      'SVT1',
      f.dataTypeConversion(f.multiplication(loc.x, 100), 'int')
    )
  }, () => {
    // 实例 2
    f.doubleBranch(f.equal(guid, E2), () => {
      const q1 = f.querySkillVariableValue(CFG_BASE + 1n)
      const n = f.dataTypeConversion(q1, 'int') + 1n
      f.setSkillVariable(CFG_BASE + 1n, f.dataTypeConversion(n, 'float'))
      const rb = f.dataTypeConversion(f.querySkillVariableValue(CFG_BASE + 1n), 'int')
      f.sendSignalToServerNodeGraph(FbSignal.chan_echo, 'SVA2', rb)
      const xM = f.multiplication(2, f.sineFunction(f.multiplication(f.dataTypeConversion(n, 'float'), 0.3)))
      const ryDeg = f.multiplication(f.dataTypeConversion(n, 'float'), 9)
      f.complexCreationTeleport(f.create3dVector(xM, 0, Z2), f.create3dVector(0, ryDeg, 0))
      const loc = f.getEntityLocation(f.getSelfEntity())
      f.sendSignalToServerNodeGraph(
        FbSignal.chan_echo,
        'SVT2',
        f.dataTypeConversion(f.multiplication(loc.x, 100), 'int')
      )
    }, () => {
      // 实例 3
      f.doubleBranch(f.equal(guid, E3), () => {
        const q1 = f.querySkillVariableValue(CFG_BASE + 2n)
        const n = f.dataTypeConversion(q1, 'int') + 1n
        f.setSkillVariable(CFG_BASE + 2n, f.dataTypeConversion(n, 'float'))
        const rb = f.dataTypeConversion(f.querySkillVariableValue(CFG_BASE + 2n), 'int')
        f.sendSignalToServerNodeGraph(FbSignal.chan_echo, 'SVA3', rb)
        const xM = f.multiplication(2, f.sineFunction(f.multiplication(f.dataTypeConversion(n, 'float'), 0.3)))
        const ryDeg = f.multiplication(f.dataTypeConversion(n, 'float'), 9)
        f.complexCreationTeleport(f.create3dVector(xM, 0, Z3), f.create3dVector(0, ryDeg, 0))
        const loc = f.getEntityLocation(f.getSelfEntity())
        f.sendSignalToServerNodeGraph(
          FbSignal.chan_echo,
          'SVT3',
          f.dataTypeConversion(f.multiplication(loc.x, 100), 'int')
        )
      }, () => {
        // 实例 4（显式 equal+空 else——兜底会让陌生实例污染数据）
        f.doubleBranch(f.equal(guid, E4), () => {
          const q1 = f.querySkillVariableValue(CFG_BASE + 3n)
          const n = f.dataTypeConversion(q1, 'int') + 1n
          f.setSkillVariable(CFG_BASE + 3n, f.dataTypeConversion(n, 'float'))
          const rb = f.dataTypeConversion(f.querySkillVariableValue(CFG_BASE + 3n), 'int')
          f.sendSignalToServerNodeGraph(FbSignal.chan_echo, 'SVA4', rb)
          const xM = f.multiplication(2, f.sineFunction(f.multiplication(f.dataTypeConversion(n, 'float'), 0.3)))
          const ryDeg = f.multiplication(f.dataTypeConversion(n, 'float'), 9)
          f.complexCreationTeleport(f.create3dVector(xM, 0, Z4), f.create3dVector(0, ryDeg, 0))
          const loc = f.getEntityLocation(f.getSelfEntity())
          f.sendSignalToServerNodeGraph(
            FbSignal.chan_echo,
            'SVT4',
            f.dataTypeConversion(f.multiplication(loc.x, 100), 'int')
          )
        }, () => {})
      })
    })
  })
})
