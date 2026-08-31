import type { GstsConfig } from '../../src/compiler/gsts_config.js'

const config: GstsConfig = {
  compileRoot: '.',
  // v5 三层架构（2026-09）：logic（1073741825 逻辑层）/ render（1073741829 渲染层）/
  // dribble-v5（1073741828 带球决策）。*.v4.ts 为退役旧图（排除编译，保留回滚）。
  entries: ['./src', '!./src/**/*.v4.ts'],
  outDir: './dist',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741908,
    nodeGraphId: 1073741825,
    // 弹球图 1073741827 是用户在编辑器手建的非空图（名字非 _GSTS*），
    // 注入 GIA 覆盖其内容需跳过非空保护（用户已授权弹球逻辑写入该图）
    skipSafeCheck: true
  }
}

export default config
