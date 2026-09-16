import type { GstsConfig } from '../../src/compiler/gsts_config.js'

// T12 复现工程（《空中花园》式迷宫）
//
// 目标地图：`1073741921`「T12迷宫复现」——2026-09-16 用户确认「gsts maps:create 建一张新图开工」
//   创建：`node ./bin/gsts.mjs maps:create --name "T12迷宫复现" --graphs t12-maze`
//   骨架：`node ./bin/gsts.mjs maps:init --map-id 1073741921 --write`（36 个 root 从模板替换，自动备份）
//   placeholder 图 `1073741825`（name=t12-maze）——注入后被本工程 .gia 替换，图名变 `_GSTS_maze-collect`
//
// 为什么新建而非复用验证图：`verify-injection` 技能约定「不每次新建地图，复用专用验证地图」，
//   但那张图（`1073741916`「GSTS核验-变量C2S」）是给**最小规则核验**用的——
//   塞 150 个实体进去会毁掉它的用途。本工程是完整玩法复现，量级不同，故单独建图。
const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./src'],
  outDir: './dist',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741921,
    nodeGraphId: 1073741825
  }
}

export default config
