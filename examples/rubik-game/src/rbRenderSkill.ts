// rbRenderSkill.ts —— 客户端渲染参数单元（20008 造物技能图 1082130443，票 06，2026-09-05）
//
// 职责（spec-06 阶段①，用户裁定：面/中/整转一次全搬）：把服务端 visual/turn 图的 turnblock
// 数学（槽位→块、局部轴查表+符号、轨道速度分解 C1/S1/C2/S2）搬来客户端；服务端只留
// 「添加运动器 + 按包起定时器」。orbit2 段的延时编排仍服务端（阶段②），本单元输出两段
// 速度（vel1/vel2 同一次分解得出），服务端 orbit2 定时器机械消费 vel2。
//
// 链路（复用票 03/04 rbx_ 通道形态，新前缀 rbv_）：
//   服务端 flowDoMove 视觉分支把任务写到宿主 1077936201（rbv_move/rbv_orient）+ 玩家
//   （rbv_epoch/rbv_host），本图由造物 AI 15Hz 自主施放触发，每拍：
//     空转（epoch==ack）直接返回 → 任务拍：读宿主 solver_cp/ep/ct（物理排列 P，flowAfterTurn
//     发布，负折叠面转期间 P 不变=实体真实排列）+ rbv_move/orient → 槽位→全局格点（烘焙
//     rbv_slotsF/M/W）→ P 直取块号（不读实体、不含实体寻址）→ 逐槽算 spin 轴 →
//     每槽一条 rbv_echo 回传（tag='s', e=epoch, slot, piece, axis；vel1/vel2 wire 兼容恒零）
//   R2（2026-09-07 用户负载定则：服务端只做最小运动器操作）：发送进度由本图自持
//   （技能变量 553/554 槽：任务 epoch / 已发槽计数——跨施放保持、同拍写读零延迟），
//   服务端零窗口推进/零计数/零缓冲；发完最后窗口本图直接发 rbv_go(e)
//   （turn 图回 ack 停发 + 起 unlock）。
//   撕裂自愈：epoch 二读不符 → 本拍不发，下拍自动重试同 epoch（服务端零重发）。
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
    const host = f.getCustomVariable(owner, 'rbv_host').asType('entity') // rbv 链独立宿主引用（rb_host 仅 rbx 链写）
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
      // 逐槽发射器：spot=全局格点（0..25）；P 直取块号；localAxis 分块查 + dir 符号
      const emit = (k: any, spot: any) => {
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
        // 球跟随（2026-09-07）：轨道速度退役——块由跟随运动器组件自动公转+自转，服务端
        // ballvisual 只给中心球加旋转型基础运动器（piece=块索引=球索引、axis=球局部轴，
        // 局部轴数学与旧自旋轴完全同源：球朝向历史≡块朝向历史）。vel1/vel2 保留信号
        // 7 参 wire 兼容，恒发零向量（服务端不消费）。
        const zv = f.create3dVector(0, 0, 0)
        // 每槽一条回传（≤10 参：tag/e/slot/piece + 3×vec3）
        f.sendSignalToServerNodeGraph(
          RubikSignal.rbv_echo, 's', e1, k, pv.value,
          f._3dVectorZoom(dirF, spinAx.value), zv, zv
        )
      }
      // —— 06-R7 分片发送（3165 实证：全量 18-52 条/拍超引擎投递容量→积压爆量被踢）——
      // 每拍只发 [sent, sent+3)∩[0,n) 三槽。R2：进度计数在客户端技能变量（553=任务 epoch、
      // 554=已发槽数；槽位字节审计全空闲），新任务拍归零；服务端不再维护 rbv_c 窗口。
      const stE = f.dataTypeConversion(f.querySkillVariableValue(1207959553n), 'int')
      f.doubleBranch(f.logicalNotOperation(f.equal(stE, e1)), () => {
        f.setSkillVariable(1207959553n, f.dataTypeConversion(e1, 'float'))
        f.setSkillVariable(1207959554n, f.dataTypeConversion(0n, 'float'))
      }, () => {})
      const cWin = f.dataTypeConversion(f.querySkillVariableValue(1207959554n), 'int')
      // 类型分派（嵌套 doubleBranch；无 multipleBranches）：面 1..6 / 中 7..9 / 整 10..12
      const isFace = f.logicalAndOperation(
        f.greaterThan(mInt, 0n), f.logicalNotOperation(f.greaterThan(mInt, 6n))
      )
      // 窗口三槽发射（k<N 才发；slot 即窗口槽号）
      const window = (n: bigint, tblBase: any, tbl: any) => {
        const k0 = cWin
        f.doubleBranch(f.lessThan(k0, n), () => {
          emit(k0, f.getCorrespondingValueFromList(f.addition(tblBase, k0), tbl))
        }, () => {})
        const k1 = f.addition(cWin, 1n)
        f.doubleBranch(f.lessThan(k1, n), () => {
          emit(k1, f.getCorrespondingValueFromList(f.addition(tblBase, k1), tbl))
        }, () => {})
        const k2 = f.addition(cWin, 2n)
        f.doubleBranch(f.lessThan(k2, n), () => {
          emit(k2, f.getCorrespondingValueFromList(f.addition(tblBase, k2), tbl))
        }, () => {})
      }
      // 本拍任务的槽数 N（面 9/中 8/整 26）：窗口发射与完成判定共用
      const nLv = f.localVariable('int')
      f.doubleBranch(isFace, () => {
        // 面：9 槽（slot0=面心格点，其后 8 行视觉顺序）；3 拍发完≈0.2s≈动画时长
        nLv.set(9n)
        window(9n, f.multiplication(f.subtraction(mInt, 1n), 9n), slotsFL)
      }, () => {
        const isMid = f.logicalAndOperation(
          f.greaterThan(mInt, 6n), f.logicalNotOperation(f.greaterThan(mInt, 9n))
        )
        f.doubleBranch(isMid, () => {
          // 中层：8 槽
          nLv.set(8n)
          window(8n, f.multiplication(f.subtraction(mInt, 7n), 8n), slotsML)
        }, () => {
          // 整转：26 槽（9 拍≈0.6s 发完，整转动画 1.0s 前摇可接受）
          nLv.set(26n)
          window(26n, f.multiplication(f.subtraction(mInt, 10n), 26n), slotsWL)
        })
      })
      // —— R2 完成自报：本拍有活且窗口越过 N → rbv_go（turn 回 ack + 起 unlock）——
      // hadWork 门防重复 go（ack 复制延迟窗口内 cWin 已=N，不再重发）。
      const hadWork = f.lessThan(cWin, nLv.value)
      const fin = f.logicalNotOperation(f.lessThan(f.addition(cWin, 3n), nLv.value))
      f.doubleBranch(f.logicalAndOperation(hadWork, fin), () => {
        f.sendSignalToServerNodeGraph(RubikSignal.rbv_go, e1)
      }, () => {})
      f.setSkillVariable(1207959554n, f.dataTypeConversion(f.addition(cWin, 3n), 'float'))
    }, () => {})
  }, () => {})
})

export default g
