import { g } from 'genshin-ts/runtime/core'

import { C2sCvSignal } from './signals.js'

// C2S 变量通道核验·20002 角色技能客户端图（2026-08-30，新地图 1073741916）
//
// 链路：服务端图 verify-c2s-cv 的 cv_cast 定时器施放技能实例（配置 1098907660，
// 6 模板瞬发绑定本图）→ 本图「节点图开始」执行：
//   读玩家实体自定义变量 d2c_counter（服务端 cv_write 定时器每 4s 写入递增序列）
//   → sendSignalToServerNodeGraph 回传 → 服务端图 onSignal 打印。
//
// 期望日志签名（服务器 f22）：cv → M（M ∈ 最近服务端写入值，> 0 即变量跨端可见）
g.characterSkill({ id: 1082130433, name: 'verify-c2s-cv-client' }).on('start', (_evt, f) => {
  // 类实现是带参版（getPlayerEntityToWhichTheCharacterBelongs(characterEntity)）；
  // interface 的无参 self 绑定版未落到运行时类（本分支踩坑实证，2026-08-30）。
  const character = f.getCurrentCharacter()
  const owner = f.getPlayerEntityToWhichTheCharacterBelongs(character)
  const cv = f.getCustomVariable(owner, 'd2c_counter')
  f.sendSignalToServerNodeGraph(C2sCvSignal.d2cv, 'cv', cv.asType('int'))
  // 手段 4b（2026-08-30 第 2 轮）：通知服务器节点图——三参均需字面量
  // （assertClientLiteralValue 编译期断言，不能传动态值）；服务端 whenSkillNodeIsCalled 接收。
  // 预期日志：每 10s 施放后服务端 f22 出现 nt1→c2s-nt / nt2→p2-fixed / nt3→p3-fixed。
  f.notifyServerNodeGraph('c2s-nt', 'p2-fixed', 'p3-fixed')
})
