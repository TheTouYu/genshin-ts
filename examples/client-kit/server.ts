// @status: 新抽离·编译已验证（selfcheck.ts 覆盖 composite/门的部分）
// client-kit/server.ts —— 客户端计算的**服务端半边**：投递邮箱 / 看门狗 / 接收门 / 镜像写
//
// 来源：examples/football/src-fb/fb-shared.ts（fbMailPost / fbMirrorApply 复合）+
// fb-sink.ts（isP 门 + 快照门 + 写镜像）+ 票 01/02 执行备注（写序与 first-wins 仲裁）。
// 抽离动作：把"服务端只做投递与落库、零计算"这件事做成 4 个可复用件。
//
// 分工铁律（用户口径：客户端算、服务端收到就写变量）：
//   服务端**不做物理/几何计算**，只做：①把任务写进邮箱 ②收结果写镜像 ③看门狗重提交。
//   任何"服务端也算一遍"的实现都会造成双真相域（v4 幽灵球事故的同源）。

import { g } from 'genshin-ts/runtime/core'
import { bool, str } from 'genshin-ts/runtime/value'

import { TAG_COMMIT } from './protocol.js'
import type { MailNames } from './protocol.js'

// ———— ① 邮箱投递（服务端唯一写者） ————
// 写序 = 可见序：先载荷 t1..t8 → 再 sum → **最后** epoch（最后一步才是"提交"）
// tValues 长度必须 = names.t.length；原生 number/bigint 或 IR int 值均可
export const mailPost = (f: any, owner: any, n: MailNames, epoch: any, tValues: any[]): void => {
  if (tValues.length !== n.t.length) {
    throw new Error(`mailPost: 载荷 ${tValues.length} 项 ≠ 槽位 ${n.t.length} 个`)
  }
  for (let i = 0; i < tValues.length; i++) {
    f.setCustomVariable(owner, n.t[i], tValues[i], false)
  }
  let sum: any = tValues[0]
  for (let i = 1; i < tValues.length; i++) sum = f.addition(sum, tValues[i])
  f.setCustomVariable(owner, n.sum, sum, false)
  f.setCustomVariable(owner, n.epoch, epoch, false)
}

// 看门狗重提交：**只 bump epoch**（载荷不动）——客户端读到同一载荷的新 epoch 会重算。
// 用途：结果超时未回（载体被距离节流/被切状态）时把在途任务再喊一次；幂等（重复回声无害）
export const mailRepublish = (f: any, owner: any, n: MailNames, epochNext: any): void => {
  f.setCustomVariable(owner, n.epoch, epochNext, false)
}

// ———— ② 邮箱状态读（服务端侧对账用；判断是否在途） ————
export const mailPending = (f: any, owner: any, n: MailNames): any => {
  const ack = f.getCustomVariable(owner, n.ack).asType('int')
  const epoch = f.getCustomVariable(owner, n.epoch).asType('int')
  return f.logicalNotOperation(f.equal(epoch, ack))
}

// ———— ③ 镜像写复合（客户端结果落地；字段可配） ————
// fields 顺序 = 写入顺序；tickField 为"新鲜度键"（服务端快照门用它做 first-wins）
// 用法：`const fbMirrorApply = makeMirrorApply({ id: 1610700041, name: 'kit_mirror_apply',
//   tickField: 'kit_tick', stateField: 'kit_state', floatFields: ['kit_px','kit_py','kit_pz'] })`
// 复合 def ID 必须在地图内唯一；default 段会覆盖同 ID 旧 def（足球 04 票踩过 v5 家族 def 覆盖）
export const makeMirrorApply = (opts: {
  id: number
  name: string
  tickField: string
  stateField: string
  floatFields: string[]
}): any => {
  const inputs: any = {
    target: { type: 'entity' },
    tick: { type: 'int' },
    state: { type: 'int' }
  }
  for (const field of opts.floatFields) inputs[field] = { type: 'float' }
  return g.defineComposite(opts.name, {
    id: opts.id,
    inputs,
    outputs: {},
    outflows: ['done'],
    build: (io: any, f: any) => {
      // 复合体内的 exec 链必须显式 connect（handler 分支才自动串联；不 chain = 只执行第一个节点）
      const nodes: any[] = []
      nodes.push(
        f.registerExecNode('set_custom_variable', [
          io.target,
          new str(opts.tickField),
          io.tick,
          new bool(false)
        ])
      )
      for (const field of opts.floatFields) {
        nodes.push(
          f.registerExecNode('set_custom_variable', [
            io.target,
            new str(field),
            io[field],
            new bool(false)
          ])
        )
      }
      nodes.push(
        f.registerExecNode('set_custom_variable', [
          io.target,
          new str(opts.stateField),
          io.state,
          new bool(false)
        ])
      )
      for (let i = 1; i < nodes.length; i++) f.connect(nodes[i - 1], 0, nodes[i], 0)
      f.outflow('done', nodes[nodes.length - 1], 0)
      return {}
    }
  })
}

// ———— ④ 接收门（tag 门 + 快照门） ————
// 职责：只接受 tag='P' 且 tick 比镜像新的拍；其余零处理（多造物=同代重复回传是常态）
// onFresh 拿到已拆分的 vec3 分量与状态，供调用点写镜像
export const serverReceive = (
  f: any,
  evt: any,
  self: any,
  tickField: string,
  onFresh: (p: {
    tick: any
    px: any
    py: any
    pz: any
    vx: any
    vy: any
    vz: any
    sx: any
    sy: any
    sz: any
    st: any
  }) => void
): void => {
  const isP = f.equal(evt.params.tag, TAG_COMMIT)
  f.doubleBranch(
    isP,
    () => {
      const cur = f.getCustomVariable(self, tickField).asType('int')
      const fresh = f.greaterThan(evt.params.tick, cur)
      f.doubleBranch(
        fresh,
        () => {
          const pos = f.split3dVector(evt.params.pos)
          const vel = f.split3dVector(evt.params.vel)
          const spin = f.split3dVector(evt.params.spin)
          onFresh({
            tick: evt.params.tick,
            px: pos.xComponent,
            py: pos.yComponent,
            pz: pos.zComponent,
            vx: vel.xComponent,
            vy: vel.yComponent,
            vz: vel.zComponent,
            sx: spin.xComponent,
            sy: spin.yComponent,
            sz: spin.zComponent,
            st: evt.params.state
          })
        },
        () => {}
      )
    },
    () => {}
  )
}
