import type { GstsConfig } from './src/compiler/gsts_config.js'

// 造物技能路径探针（C 线 Round 0，2026-08-31，地图 1073741915「变量」）。
// 信号 zaowu_probe(tag:str,val:str) 已注册于 1915（1610612744/745/746），
// 编译期 inject.mapId 指向 1915 以解析信号注册表；批量注入按 .gia 内 ID 路由
// （1082130436/437/438 + 1073741830）。
const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./verify/zaowu-client'],
  outDir: './dist-zaowu',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741915,
    nodeGraphId: 1073741830
  }
}

export default config
