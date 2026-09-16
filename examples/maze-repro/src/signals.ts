// T12 迷宫复现 · 信号单一事实源（目标地图 1073741921「T12迷宫复现」）
//
// 注册记录（本图实测）：
//   `node ./bin/gsts.mjs assets:signals register --map-id 1073741921 \
//      --name T12隐藏物已拾取 --param 序号:int --write`
//   → send=1610612741 / monitor=1610612742 / server=1610612743，template=builtin-layouts
//   ⚠️ **单参 int 信号无需 donor**（技能口径：「省略 donor 用内置参数布局；重复的非 str 类型需要 donor」）
//   ⚠️ **R13：信号是编译期强前置**——注册必须发生在编译之前，否则
//      `build_signal_definition.ts:867` 报 `signal registry is required when encoding signal nodes`
// @gsts:signals
import { defineSignal } from 'genshin-ts/runtime/core'

export const Signal = {
  /** 某个隐藏收集物被拾取（每拾取一个发一次；`序号` = 该实体选项卡的 tabId） */
  T12隐藏物已拾取: defineSignal('T12隐藏物已拾取', [['序号', 'int']])
} as const
