// 票 14 · fb-loop（20008 客户端实验图 1082130436，2026-09-03，地图 1073741908）
//
// 原生写通道三探针（设计稿 v4，用户确认）：
//   · 探针 T（主推·瞬移通道）：complexCreationTeleport 写造物自身 transform（6 float/拍）
//     ——客户端 getEntityLocation 自读（路线一存储+零延迟验证）+ 服务端轮询读（路线二）
//   · 探针 A（对照·技能变量）：set→立即 query（跨施放保持+零延迟）→信号回传
//   · 探针 C（对照·生命值）：recoverCreationSHp 写球 HP（路线二·结算型，客户端读不到）
// 触发：新造物 AI 自主循环（用户放置+绑 GSTS-fb-loop-exp 1191182338，决策层不动执行技能 1）
//   近距 ~15-16 拍/s；20008 约束：无客户端时钟、局部变量不跨施放（跨拍状态=技能变量/实体位置）
// 打印纪律：本图全程零 print（数据走按图详情日志——fb-loop 详情开启，其余图不开）
//
// CFG_X 已回填真实配置 ID（2026-09-03 注入前，1207959553=用户创建 5 个中的第 1 个）。
import { g } from 'genshin-ts/runtime/core'

import { FbSignal } from './signals.js'

const CFG_X = 1207959553n // 技能变量配置 ID（用户 2026-09-03 创建，1207959553~57 共 5 个，其余 4 个登记备用）
const BALL_GUID = 1077936135n // 球实体（物件可 GUID 字面量）

g.creationSkill({ id: 1082130436, name: '_GSTS_fbLoop' }).on('start', (_evt, f) => {
  // ———— 探针 A：技能变量自写自读 ————
  const q1 = f.querySkillVariableValue(CFG_X) // float
  const n = f.dataTypeConversion(q1, 'int') + 1n // bigint 直算（fb-server 先例）
  f.setSkillVariable(CFG_X, f.dataTypeConversion(n, 'float'))
  const rb = f.dataTypeConversion(f.querySkillVariableValue(CFG_X), 'int') // 立即读回=零延迟验证点
  f.sendSignalToServerNodeGraph(FbSignal.fb_sv_echo, 'SVA', rb)

  // ———— 探针 T：瞬移通道（主推） ————
  // 位置 x=2·sin(0.3n)：天然有界 [-2,2]m 往返（creation_skill 无 moduloOperation，
  // 锯齿改 sin 编码——n 保持单调递增，SVA 判据不受影响）；旋转 y=9n 度（服务端可反解计数）
  const xM = f.multiplication(2, f.sineFunction(f.multiplication(f.dataTypeConversion(n, 'float'), 0.3)))
  const ryDeg = f.multiplication(f.dataTypeConversion(n, 'float'), 9)
  f.complexCreationTeleport(f.create3dVector(xM, 0, 0), f.create3dVector(0, ryDeg, 0))
  const loc = f.getEntityLocation(f.getSelfEntity()) // 客户端自读（同拍一致性）
  f.sendSignalToServerNodeGraph(
    FbSignal.fb_sv_echo,
    'SVT',
    f.dataTypeConversion(f.multiplication(loc.x, float(100)), 'int')
  ) // 自读值×100 回传（与服务端 fb_tp_seen_x 对照=复制延迟直读）

  // ———— 探针 C：造物恢复生命值（写球，服务端事件/轮询读） ————
  f.recoverCreationSHp(entity(BALL_GUID), 0.5, true) // bool 仅字面量
})
