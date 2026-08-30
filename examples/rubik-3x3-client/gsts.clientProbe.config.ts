import type { GstsConfig } from '../../src/compiler/gsts_config.js'

// clientProbe 单图编译+注入配置（CLI 建图 1082130441 注入验证，2026-08-29）
const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./src/clientProbe.ts'],
  outDir: './dist-clientprobe',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741914,
    nodeGraphId: 1082130441
  }
}

export default config
