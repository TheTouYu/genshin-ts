// rubik-game 魔方残局挑战——占位主图（2026-09-08 票02）
// 用途：建立编译管线闭环（空图编译通过=票02 验收）。G3 玩法逻辑落地时本图承载对局状态机或重写。
// 设计权威：.scratch/rubik-game/RG-DESIGN.md
import { g } from 'genshin-ts/runtime/core'
import { int } from 'genshin-ts/runtime/value'

const graph = g.server({
  id: 1073741825,
  variables: {
    // 对局核心变量（票05 绑定 HUD；此处先占位声明命名空间）
    moves: int(0),
    par: int(0)
  }
})

export default graph
