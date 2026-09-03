// rbRenderSkill.ts —— 客户端渲染参数单元（20008 造物技能图 1082130443，票 06，2026-09-05）
//
// 职责（spec-06 阶段①，用户裁定：面/中/整转一次全搬）：把服务端 visual/turn 图的 turnblock
// 数学（槽位→块、局部轴查表+符号、轨道速度分解 C1/S1/C2/S2）搬来客户端；服务端只留
// 「添加运动器 + 按包起定时器」。orbit2 段的延时编排仍服务端（阶段②），本单元输出两段
// 速度（vel1/vel2 同一次分解得出），服务端 orbit2 定时器机械消费 vel2。
//
// 链路（复用票 03/04 rbx_ 通道形态，新前缀 rbv_）：
//   服务端 flowDoMove 视觉分支把任务写到宿主 1077936201（rbv_move/rbv_orient）+ 玩家
//   （rbv_epoch），本图由造物 AI 15Hz 自主施放触发，每拍：
//     空转（epoch==ack）直接返回 → 任务拍：读宿主 solver_cp/ep/ct（物理排列 P，flowAfterTurn
//     发布，负折叠面转期间 P 不变=实体真实排列）+ rbv_move/orient → 槽位→全局格点（烘焙
//     rbv_slotsF/M/W）→ P 直取块号（不读实体、不含实体寻址）→ 逐槽算 spin 轴/两段速度 →
//     每槽一条 rbv_echo 回传（tag='s', e=epoch, slot, piece, axis, vel1, vel2，6 参 ≤10）
//   服务端 visual 图收齐 N 槽 → rbv_go(e) 通知 turn 图按 curMove 类型起既有定时器 → 设备机械执行。
//   撕裂/陈旧自愈：epoch 二读不符或 ack 未回 → 本拍不发，下拍自动重试同 epoch（服务端零重发）。
//
// 客户端 DSL 约束沿用票 03 六条 + 本票实证：_3dVectorZoom 客户端参数序=(标量, 向量)；
// getCorrespondingValueFromList 客户端参数序=(iD, list)；表数据全部走宿主注册变量烘焙值；
// 常量 kVel（面 10/中 6.6667/整 2.0）为从服务端 flowDoMove 搬迁的数学常量（dur/av/seg 仍服务端）。
import { g } from 'genshin-ts/runtime/core'
import { RubikSignal } from './signals.js'

// 宿主注册资产（1077936201，gen-rbv-vars.mjs 输出，写回轮注册）：
//   rbv_move:int / rbv_orient:int_list(26)            ← 每任务由 flowDoMove 发布
//   solver_cp/solver_ep/solver_ct:int_list            ← flowAfterTurn 每回合发布（P 状态）
//   rbv_slotsF:int_list(54=6面×9) / rbv_slotsM(3×8) / rbv_slotsW(3×26)  ← 槽位→全局格点
//   rbv_off:vec3_list(26) / rbv_axes:vec3_list(13)    ← 格点相对中心偏移 / 轨道轴
//   rbv_ax0/ax1/ax2:vec3_list(96/96/96)               ← localAxis 288 项长表分块
g.creationSkill({ id: 1082130443, name: '_GSTS_rbRenderSkill' }).on('start', (_evt: any, f: any) => {
  // —— E2 观测计数器（沿用票 03 形态）——
  const tick = f.localVariable('int')
  tick.set(tick.value + 1n)

  // —— 寄存器门（玩家实体 [0]）——
  const owner = f.getCorrespondingValueFromList(0n, f.getListOfPlayerEntitiesOnTheField())
  const ack = f.getCustomVariable(owner, 'rbv_ack').asType('int')
  const e1 = f.getCustomVariable(owner, 'rbv_epoch').asType('int')
  f.doubleBranch(f.logicalNotOperation(f.equal(e1, ack)), () => {
    // —— 宿主引用 + 任务/状态读取 ——
    const host = f.getCustomVariable(owner, 'rb_host').asType('entity')
    const mv = f.getCustomVariable(host, 'rbv_move').asType('int')
    const orientL = f.getCustomVariable(host, 'rbv_orient').asType('int_list')
    const cpL = f.getCustomVariable(host, 'solver_cp').asType('int_list')
    const epL = f.getCustomVariable(host, 'solver_ep').asType('int_list')
    const ctL = f.getCustomVariable(host, 'solver_ct').asType('int_list')
    const slotsFL = f.getCustomVariable(host, 'rbv_slotsF').asType('int_list')
    const slotsML = f.getCustomVariable(host, 'rbv_slotsM').asType('int_list')
    const slotsWL = f.getCustomVariable(host, 'rbv_slotsW').asType('int_list')
    const offL = f.getCustomVariable(host, 'rbv_off').asType('vec3_list')
    const axesL = f.getCustomVariable(host, 'rbv_axes').asType('vec3_list')
    const ax0L = f.getCustomVariable(host, 'rbv_ax0').asType('vec3_list')
    const ax1L = f.getCustomVariable(host, 'rbv_ax1').asType('vec3_list')
    const ax2L = f.getCustomVariable(host, 'rbv_ax2').asType('vec3_list')

    // —— 符号与基准：dir=1-2*(mv<0)；m=|mv|（用 mv*dir 得正，避开未实证的绝对值节点） ——
    const negI = f.dataTypeConversion(f.lessThan(mv, 0n), 'int')
    const dirI = f.subtraction(1n, f.multiplication(negI, 2n))
    const dirF = f.dataTypeConversion(dirI, 'float')
    const mInt = f.multiplication(mv, dirI)
    const e2 = f.getCustomVariable(owner, 'rbv_epoch').asType('int')

    // —— 撕裂门：二读 epoch 必须一致 ——
    f.doubleBranch(f.equal(e2, e1), () => {
      // 逐槽发射器：spot=全局格点（0..25）；P 直取块号；localAxis 分块查 + dir 符号；两段轨道速度
      const emit = (k: any, spot: any, kvF: any) => {
        const pv = f.localVariable('int')
        // 块号 = 格点上当前块（solver_* 即 pos→piece；无实体寻址）
        f.doubleBranch(f.lessThan(spot, 8n), () => {
          pv.set(f.getCorrespondingValueFromList(spot, cpL))
        }, () => {
          f.doubleBranch(f.lessThan(spot, 20n), () => {
            pv.set(f.addition(8n, f.getCorrespondingValueFromList(f.subtraction(spot, 8n), epL)))
          }, () => {
            pv.set(f.addition(20n, f.getCorrespondingValueFromList(f.subtraction(spot, 20n), ctL)))
          })
        })
        const oAt = f.getCorrespondingValueFromList(pv.value, orientL)
        // 自旋轴：localAxis[(m-1)*24 + 转动前朝向] × dir（长表 300 按 100 分块×3，图内无 modulo→余数式）
        const laIdx = f.addition(f.multiplication(f.subtraction(mInt, 1n), 24n), oAt)
        const ch = f.division(laIdx, 100n)
        const rem = f.subtraction(laIdx, f.multiplication(ch, 100n))
        const spinAx = f.localVariable('vec3')
        f.doubleBranch(f.equal(ch, 0n), () => {
          spinAx.set(f.getCorrespondingValueFromList(rem, ax0L))
        }, () => {
          f.doubleBranch(f.equal(ch, 1n), () => {
            spinAx.set(f.getCorrespondingValueFromList(rem, ax1L))
          }, () => {
            spinAx.set(f.getCorrespondingValueFromList(rem, ax2L))
          })
        })
        // 轨道速度分解（motionOrbitPrep/Step 同式，C1/S1=0.7071068、C2=0、S2=1）
        const v0 = f.getCorrespondingValueFromList(spot, offL)
        const tAxis = f._3dVectorZoom(dirF, f.getCorrespondingValueFromList(mInt, axesL))
        const vp = f._3dVectorZoom(f._3dVectorDotProduct(tAxis, v0), tAxis)
        const vPerp = f._3dVectorSubtraction(v0, vp)
        const axv = f._3dVectorCrossProduct(tAxis, vPerp)
        const p1 = f._3dVectorAddition(vp, f._3dVectorAddition(f._3dVectorZoom(0.7071068, vPerp), f._3dVectorZoom(0.7071068, axv)))
        const vel1 = f._3dVectorZoom(kvF, f._3dVectorSubtraction(p1, v0))
        const p2 = f._3dVectorAddition(vp, f._3dVectorZoom(1, axv))
        const vel2 = f._3dVectorZoom(kvF, f._3dVectorSubtraction(p2, p1))
        // 每槽一条回传（≤10 参：tag/e/slot/piece + 3×vec3）
        f.sendSignalToServerNodeGraph(
          RubikSignal.rbv_echo, 's', e1, k, pv.value,
          f._3dVectorZoom(dirF, spinAx.value), vel1, vel2
        )
      }
      // 类型分派（嵌套 doubleBranch；无 multipleBranches）：面 1..6 / 中 7..9 / 整 10..12
      const isFace = f.logicalAndOperation(
        f.greaterThan(mInt, 0n), f.logicalNotOperation(f.greaterThan(mInt, 6n))
      )
      f.doubleBranch(isFace, () => {
        // 面：9 槽（slot0=面心格点，其后 8 行视觉顺序）；kVel=10（flowDoMove 面转常量搬迁）
        f.finiteLoop(0n, 8n, (k: any) => {
          const spot = f.getCorrespondingValueFromList(
            f.addition(f.multiplication(f.subtraction(mInt, 1n), 9n), k), slotsFL)
          emit(k, spot, 10)
        })
      }, () => {
        const isMid = f.logicalAndOperation(
          f.greaterThan(mInt, 6n), f.logicalNotOperation(f.greaterThan(mInt, 9n))
        )
        f.doubleBranch(isMid, () => {
          // 中层：8 槽；kVel=6.6667
          f.finiteLoop(0n, 7n, (k: any) => {
            const spot = f.getCorrespondingValueFromList(
              f.addition(f.multiplication(f.subtraction(mInt, 7n), 8n), k), slotsML)
            emit(k, spot, 6.6667)
          })
        }, () => {
          // 整转：26 槽；kVel=2.0（单拍全量，客户端记录帧上限待 E1 复测；超限拆拍属后续轮）
          f.finiteLoop(0n, 25n, (k: any) => {
            const spot = f.getCorrespondingValueFromList(
              f.addition(f.multiplication(f.subtraction(mInt, 10n), 26n), k), slotsWL)
            emit(k, spot, 2)
          })
        })
      })
    }, () => {})
  }, () => {})
})

export default g
