// @status: compile-only（禁止注入；占位 ID 1082130499/1073741899）
// chan-selftest.ts —— 通道原语承载自证图（票 19 小类 1.1，compile-only）
//
// 目的：12 原语条目在真实 DSL 图上下文（客户端 20008 + 服务端 20000）各调用
// 一遍，经主配置编译 0 error = 「跨文件函数库载体可行」的编译门禁证据。
// ⚠️⚠️ 本文件两图 ID 均为占位（客户端 1082130499 / 服务端 1073741899）：
//   **禁止注入**（占位 ID 禁止注入红线）——本图只做编译验证与用法样板，
//   永不进入注入清单。信号引用真实注册表（fb_sv_echo/fb_ball_state）仅供
//   编译期解析，运行语义无关。
// 打印纪律：零 print。
import { g } from 'genshin-ts/runtime/core'

import {
  chanDispatch,
  chanGate,
  chanIncr,
  chanPollStart,
  chanReadF,
  chanReadF32Group,
  chanSelfId,
  chanSendScalar,
  chanSendState6,
  chanWriteF,
  chanWriteF32Group
} from './channels.js'
import { FbSignal } from './signals.js'

// 调用层真值（本图不注入；cfg 段取票 19 假设区间，仅编译期消费）
const CFG_S = 1207959558n // 自持组起点（假设段 558~567）
const CFG_CTR = 1207959563n // 独立计数 cfg（一实例一 cfg 纪律演示）
const CFG_D1 = 1207959565n // 分支 1 写目标
const CFG_D2 = 1207959566n // 分支 2 计数
const E_D1 = 1082130447n // 分发演示 id 1（复用现网实体值，无运行效应）
const E_D2 = 1082130448n // 分发演示 id 2

// ———— 客户端 20008 侧：写 4 + 读回 2（信号路）+ 身份 2 ————
g.creationSkill({ id: 1082130499, name: '_GSTS_chanSelftest' }).on('start', (_evt, f) => {
  // ① 写原语四件
  chanWriteF(f, CFG_S, 1.5)
  const rv = chanReadF(f, CFG_S)
  const n = chanIncr(f, CFG_CTR)
  chanWriteF32Group(f, CFG_S, 3, [rv, 2.5, 3.5])
  const grp = chanReadF32Group(f, CFG_S, 3)

  // ② 读回：标量路 + 六元组 vec3 路（真实注册信号，编译期解析参数形态）
  chanSendScalar(f, FbSignal.fb_sv_echo, 'CS1', n)
  chanSendState6(
    f,
    FbSignal.fb_ball_state,
    'P',
    n,
    f.create3dVector(grp[0], grp[1], grp[2]),
    f.create3dVector(0.1, 0.2, 0.3),
    f.create3dVector(0, 0, 0),
    4n
  )

  // ④ 身份：自 GUID + 双实例分发（idAt/handlerAt 双回调；末分支兜底 else 空）
  const guid = chanSelfId(f)
  chanDispatch(
    f,
    guid,
    2,
    (i) => {
      if (i === 0) return E_D1
      return E_D2
    },
    (i) => {
      if (i === 0) {
        return () => {
          chanWriteF(f, CFG_D1, 7.5)
        }
      }
      return () => {
        chanSendScalar(f, FbSignal.fb_sv_echo, 'CS2', chanIncr(f, CFG_D2))
      }
    }
  )
})

// ———— 服务端 20000 侧：节拍 1（chanGate）+ 读回 2（chanPollStart 消费面） ————
// chanOnHpPulse 约定条目的服务端样板不在本图展开——现网 fb-svlisten.ts
// 即该约定的完整实现，此处只覆盖函数类原语。
g.server({ id: 1073741899, name: '_GSTS_chanSelftestSv' })
  .on('whenEntityIsCreated', (_evt, f) => {
    chanGate(f, 'chan_gate_demo', 1n)
    chanPollStart(f, f.getSelfEntity(), 'chan_poll_demo', 0.09)
  })
  .on('whenTimerIsTriggered', (evt, f) => {
    // 名单制分支：只认本图 timer 名，else 空（与同实体其它图零串扰）
    f.doubleBranch(f.equal(evt.timerName, 'chan_poll_demo'), () => {
      chanGate(f, 'chan_gate_demo', 0n)
    }, () => {})
  })
