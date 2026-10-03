import type { GstsConfig } from '../../src/compiler/gsts_config.js'

const config: GstsConfig = {
  compileRoot: '.',
  // ⚠️ 历史 v5 三层配置（logic 1073741825/render 1073741829/dribble-v5 1073741828）：
  // 当前主线已迁到 src-fb/ 新链路（用 gsts.fb-client.config.ts 与各 gsts.fb*-inject.config.ts）。
  // *.v4.ts 仍为退役旧图（排除编译，保留回滚）。
  entries: ['./src', '!./src/**/*.v4.ts'],
  outDir: './dist',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741825,
    nodeGraphId: 1073741825,
    // ⚠️ 待核对：skipSafeCheck 注释写“弹球图 1073741827”，但本配置 nodeGraphId=1073741825；
    // 若 1073741825 也需要跳过非空保护，保留此开关；否则应只对目标图启用并更新注释。
    skipSafeCheck: true
  }
}

export default config
