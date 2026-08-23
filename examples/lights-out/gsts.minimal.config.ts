import type { GstsConfig } from '../../src/compiler/gsts_config.js'

// 最小图 1073741890 专属编译配置（灯阵完整版：三关玩法 + 管理图）
// 注意：每张图 id 不同（1825/1826/1827/1828），注入时按文件逐个注入，
// config.inject.nodeGraphId 会改写为对应 GIA 的图 id（单文件注入语义）
const config: GstsConfig = {
  compileRoot: '.',
  entries: [
    './src/game-level1.ts',
    './src/game-level2.ts',
    './src/game-level3.ts',
    './src/game-level4.ts',
    './src/game-level5.ts',
    './src/game-level6.ts',
    './src/game-manager.ts'
  ],
  outDir: './dist-minimal',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741890,
    nodeGraphId: 1073741825
  }
}

export default config
