import type { GstsConfig } from '../../src/compiler/gsts_config.js'

// 2026-09-05 单次释放大循环校准：UI 触发服务端图定点注入配置
// 锚定 **1073741837**（fb20d-ui 图位），勿用于其他 .gia。
// 用法：
//   node ./bin/gsts.mjs -c examples/football/gsts.fb20d-ui-inject.config.ts \
//        examples/football/dist-fb/src-fb/fb20d-ui.gia
// ⚠️ 挂载目标（2026-09-05 真实 .gil 回读）：1073741837 挂在 **玩家模板 def 1086324737 + 玩家实体 1086324737..745**；
//   不是角色侧 1090519041（该 def 当前 graphs=(none)）。UI 事件只有挂玩家模板/玩家实体才能收到。
// 当前状态：def + entity 均已挂载；若重注入后挂载丢失，按下面命令补：
//   node ./bin/gsts.mjs assets:mounts attach 1086324737 --graph 1073741837 --def --gil <map> --write
//   node ./bin/gsts.mjs assets:mounts attach 1086324737 --graph 1073741837 --entity --gil <map> --write
const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./src-fb'],
  outDir: './dist-fb',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741908,
    nodeGraphId: 1073741837
  }
}

export default config
