// rbCrossSkill.ts —— 客户端十字求解计算单元（20008 造物技能图 1082130435，票 03，2026-09-04）
//
// 架构（用户 2026-09-04 定调：服务端=设备/渲染/事件；客户端=求解+运动参数）：
//   服务端 solverPlan 把「算下一宏」任务写到玩家实体寄存器 rbx_*（fb E1 模式），
//   本图由造物 AI 15Hz 自主施放触发，每拍：
//     空转（epoch==ack）只读 2 寄存器 → 任务拍（epoch≠ack 且 t1=1 十字）：
//       player → rb_host 引用 → 宿主 1077936201 读 solver_ep/eo + 表变量 rbt_*
//       → 加权和复核（撕裂→'xr'）→ 十字 mask → 未完成：策略查表选宏，
//         回传 c0/c1/c2 表码（e=k*100+code+10）+ 'xd'（e=epoch）；完成：'xd'（e=epoch+32768）
//   服务端收到码后用现行 solverAppendCode 展开（负 moveId 折叠语义原样保留）。
//
// 客户端 DSL 实证约束（票 03 编译期踩坑闭合，2026-09-04）：
//   · 客户端图无 variables（registry 空表）→ 表数据走宿主实体自定义变量 rbt_*（注册时烘焙值）
//   · 不 import runtime/value；禁可变外层捕获（累加用 f.localVariable）
//   · getCorrespondingValueFromList 客户端参数序 (iD, list)；循环变量 s 是运行时值，
//     禁 BigInt(s)/裸数组索引[s]，s 上的算术显式 f.addition(s, n)
//   · 无 moduloOperation（用 a-(a/b)*b）；比较用 greaterThanOrEqualTo 全名
//   · 复合 defineComposite 未实证 → 全部内联展开
import { g } from 'genshin-ts/runtime/core'
import { RubikSignal } from './signals.js'

// 表变量（宿主 1077936201 注册资产，值=cfopTables CF_X_* 定稿值，票 04 注册写入）：
// rbt_xp0..3 策略分块 / rbt_xlen 宏长 / rbt_xc0..2 宏表码——名字在调用点内联（模块级标识符会被泛型捕获）

g.creationSkill({ id: 1082130435, name: '_GSTS_rbCrossSkill' }).on('start', (_evt: any, f: any) => {
  // —— E2 观测计数器（每拍复位恒 1，五C 定论保留）——
  const tick = f.localVariable('int')
  tick.set(tick.value + 1n)

  // —— 寄存器门（玩家实体 [0]，fb E1 主链）——
  const owner = f.getCorrespondingValueFromList(0n, f.getListOfPlayerEntitiesOnTheField())
  const ack = f.getCustomVariable(owner, 'rbx_ack').asType('int')
  const e1 = f.getCustomVariable(owner, 'rbx_epoch').asType('int')
  f.doubleBranch(f.logicalNotOperation(f.equal(e1, ack)), () => {
    const t1 = f.getCustomVariable(owner, 'rbx_t1').asType('int')
    f.doubleBranch(f.equal(t1, 1n), () => {
      // —— 状态宿主引用 + 状态读取（fb E5 链：player → rb_host → host vars）——
      const host = f.getCustomVariable(owner, 'rb_host').asType('entity')
      const ep = f.getCustomVariable(host, 'solver_ep').asType('int_list')
      const eo = f.getCustomVariable(host, 'solver_eo').asType('int_list')

      // —— 加权和（与 solverPlan rbLanePost 同式）撕裂/陈旧检测 ——
      const sum = f.getCustomVariable(owner, 'rbx_sum').asType('int')
      const h = f.localVariable('int')
      h.set(f.addition(
        f.multiplication(f.getCorrespondingValueFromList(0n, ep), 1n),
        f.multiplication(f.getCorrespondingValueFromList(0n, eo), 7n)
      ))
      f.finiteLoop(1, 11, (s: any) => {
        h.set(f.addition(h.value, f.addition(
          f.multiplication(f.getCorrespondingValueFromList(s, ep), f.addition(s, 1n)),
          f.multiplication(f.getCorrespondingValueFromList(s, eo), f.addition(s, 7n))
        )))
      })
      const e2 = f.getCustomVariable(owner, 'rbx_epoch').asType('int')
      f.doubleBranch(f.equal(e2, e1), () => {
        f.doubleBranch(f.equal(h.value, sum), () => {
          // —— 十字 mask（solverCrossMask 内联）——
          const edgeState = (home: any) => {
            const sm = f.localVariable('int')
            sm.set(f.multiplication(
              f.dataTypeConversion(f.equal(f.getCorrespondingValueFromList(0n, ep), home), 'int'),
              f.getCorrespondingValueFromList(0n, eo)
            ))
            f.finiteLoop(1, 11, (s: any) => {
              sm.set(f.addition(sm.value, f.multiplication(
                f.dataTypeConversion(f.equal(f.getCorrespondingValueFromList(s, ep), home), 'int'),
                f.addition(f.multiplication(s, 2n), f.getCorrespondingValueFromList(s, eo))
              )))
            })
            return sm.value
          }
          const bit = (home: any, w: number) => f.multiplication(
            f.dataTypeConversion(f.equal(edgeState(home), f.multiplication(home, 2n)), 'int'),
            BigInt(w)
          )
          const mask = f.addition(bit(4n, 1), f.addition(bit(5n, 2), f.addition(bit(6n, 4), bit(7n, 8))))

          f.doubleBranch(f.equal(mask, 15n), () => {
            f.sendSignalToServerNodeGraph(RubikSignal.rbx_echo, 'xd', f.addition(e1, 32768n))
          }, () => {
            // —— 首个未解决槽（%2 用 a-(a/2)*2 等价式内联）——
            const halfM = f.division(mask, 2n)
            const b0 = f.equal(f.subtraction(mask, f.multiplication(halfM, 2n)), 0n)
            const q1 = f.division(halfM, 2n)
            const b1 = f.equal(f.subtraction(halfM, f.multiplication(q1, 2n)), 0n)
            const quarM = f.division(mask, 4n)
            const q2 = f.division(quarM, 2n)
            const b2 = f.equal(f.subtraction(quarM, f.multiplication(q2, 2n)), 0n)
            const s1 = f.dataTypeConversion(f.logicalAndOperation(f.logicalNotOperation(b0), b1), 'int')
            const s2 = f.dataTypeConversion(f.logicalAndOperation(f.logicalAndOperation(f.logicalNotOperation(b0), f.logicalNotOperation(b1)), b2), 'int')
            const s3 = f.dataTypeConversion(f.logicalAndOperation(f.logicalAndOperation(f.logicalNotOperation(b0), f.logicalNotOperation(b1)), f.logicalNotOperation(b2)), 'int')
            const t = f.addition(f.multiplication(s1, 1n), f.addition(f.multiplication(s2, 2n), f.multiplication(s3, 3n)))
            // multipleBranches 在 creation_skill 不可用 → 嵌套 doubleBranch 选择
            const home = f.localVariable('int')
            f.doubleBranch(f.equal(t, 0n), () => { home.set(4n) }, () => {
              f.doubleBranch(f.equal(t, 1n), () => { home.set(5n) }, () => {
                f.doubleBranch(f.equal(t, 2n), () => { home.set(6n) }, () => { home.set(7n) })
              })
            })
            const idx = f.addition(f.multiplication(mask, 24n), edgeState(home.value))
            // —— 策略查表（longListGetInt4 内联：4 分块各 ≤96，块内偏移查表 + 块选择 MB）——
            const chunk = f.division(idx, 96n)
            const off = f.subtraction(idx, f.multiplication(chunk, 96n))
            const p0 = f.getCorrespondingValueFromList(off, f.getCustomVariable(host, 'rbt_xp0').asType('int_list'))
            const p1 = f.getCorrespondingValueFromList(off, f.getCustomVariable(host, 'rbt_xp1').asType('int_list'))
            const p2 = f.getCorrespondingValueFromList(off, f.getCustomVariable(host, 'rbt_xp2').asType('int_list'))
            const p3 = f.getCorrespondingValueFromList(off, f.getCustomVariable(host, 'rbt_xp3').asType('int_list'))
            const picked = f.localVariable('int')
            // 策略表注册值偏置 +1（CLI 默认值禁负数，2026-09-04 实证），此处统一 -1 还原
            f.doubleBranch(f.equal(chunk, 0n), () => { picked.set(f.subtraction(p0, 1n)) }, () => {
              f.doubleBranch(f.equal(chunk, 1n), () => { picked.set(f.subtraction(p1, 1n)) }, () => {
                f.doubleBranch(f.equal(chunk, 2n), () => { picked.set(f.subtraction(p2, 1n)) }, () => { picked.set(f.subtraction(p3, 1n)) })
              })
            })
            // —— 宏参数（LEN + 三段表码）——
            const mLen = f.getCorrespondingValueFromList(picked.value, f.getCustomVariable(host, 'rbt_xlen').asType('int_list'))
            const c0 = f.getCorrespondingValueFromList(picked.value, f.getCustomVariable(host, 'rbt_xc0').asType('int_list'))
            const c1 = f.getCorrespondingValueFromList(picked.value, f.getCustomVariable(host, 'rbt_xc1').asType('int_list'))
            const c2 = f.getCorrespondingValueFromList(picked.value, f.getCustomVariable(host, 'rbt_xc2').asType('int_list'))
            // e = k*100 + code + 10（code 0..17；服务端 -10 解码）
            f.sendSignalToServerNodeGraph(RubikSignal.rbx_echo, 'c0', f.addition(c0, 10n))
            f.doubleBranch(f.greaterThan(mLen, 1n), () => {
              f.sendSignalToServerNodeGraph(RubikSignal.rbx_echo, 'c1', f.addition(c1, 110n))
            }, () => {})
            f.doubleBranch(f.greaterThan(mLen, 2n), () => {
              f.sendSignalToServerNodeGraph(RubikSignal.rbx_echo, 'c2', f.addition(c2, 210n))
            }, () => {})
            f.sendSignalToServerNodeGraph(RubikSignal.rbx_echo, 'xd', e1)
          })
        }, () => {
          f.sendSignalToServerNodeGraph(RubikSignal.rbx_echo, 'xr', e1)
        })
      }, () => {
        f.sendSignalToServerNodeGraph(RubikSignal.rbx_echo, 'xr', e1)
      })
    }, () => {})
  }, () => {})
})

export default g
