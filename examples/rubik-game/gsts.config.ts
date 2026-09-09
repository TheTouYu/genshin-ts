import type { GstsConfig } from '../../src/compiler/gsts_config.js'

// rubik-game 魔方残局挑战（donor=examples/rubik-3x3，用户裁决①新地图新目录不污染主线）
// inject 平时不配（编译报 target gil not found 风险），注入期临时加 mapId/nodeGraphId。
const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./src'],
  outDir: './dist'
}

export default config
