import { g } from 'genshin-ts/runtime/core'

// 手段 4b 接收端·定向假设差分图（2026-08-30 第 2 轮，新地图 1073741916）
//
// 假设：whenSkillNodeIsCalled 是实体定向事件（类比变量变化事件"仅推送给挂载实体"）——
// 主图（挂空模型 1077936129）收不到通知（3009 实证：客户端 notify 帧完整执行但主图事件零帧）；
// 本图挂玩家模板实体 1086324737（运行时每玩家实例执行）验证"挂调用者相关实体才能收到"。
//
// 预期（假设成立）：每 10s 施放后本图触发，f22 出现 nt-p|c2s-nt / nt-q|p2-fixed / nt-r|p3-fixed；
// 主图上的同事件（nt1|/nt2|/nt3| 前缀）保持不触发 = 挂载范围对照。
g.server({ id: 1073741843, name: 'verify-c2s-nt' })
  .on('whenSkillNodeIsCalled', (evt, f) => {
    f.printString('nt-p|')
    f.printString(evt.parameter1)
    f.printString('nt-q|')
    f.printString(evt.parameter2)
    f.printString('nt-r|')
    f.printString(evt.parameter3)
  })
