// kit-ball.ts —— 已并入 kit-loop（2026-10-25）
//
// 原因：造物技能条目 #1（新建的 kitBall 配置）的公共冷却 flag 无法用 CLI 设成「忽略」（`skill bind`
// 只改了 cd，`ignorePublicCd` 仍 false ⇒ 公共 CD 1s），15Hz 物理会被节流。
// 而 skill #2（config 1191182338 → 1082130436 kitLoop）是用户在编辑器里设好的 cd=0.03 + 忽略公共冷却。
// ⇒ 物理内核改挂在 kit-loop 的每拍路径上（slot 569..576），本图只保留最小骨架占位，不做位移。
import { g } from 'genshin-ts/runtime/core'

g.creationSkill({ id: 1082130439, name: '_GSTS_kitBall' }).on('start', (_evt: any, f: any) => {
  // 占位：不读、不写、不位移（避免与 kit-loop 抢同一造物的 teleport）
  // ⚠️ 这里原先用 1207959577：不在本图技能变量段（1207959553..568）内 ⇒ 运行期越界，
  //    整张图在第一行就崩，日志零记录（2026-10-27 定位）。改成段内 1207959565。
  f.increaseSkillVariableValue(1207959565n, 1.0)
})
