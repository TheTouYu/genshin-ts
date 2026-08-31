import type { GstsConfig } from './src/compiler/gsts_config.js'

// 计算通道 v2（同步机制核验 Round 1，地图 1073741915「变量」）。
// 前置：信号 zt_echo(tag:str,e:int,h:int) 已注册于 1915；变量 zt1..zt100/zt_sum/zt_epoch/
// zt_ack 已预注册于玩家实体；ztPA/ztPB 空图占位已建（ID 以 CLI 实际分配为准回填）。
// 编译期 inject.mapId 指向 1915 解析信号注册表；批量注入按 .gia 内 ID 路由。
const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./verify/zt-lane'],
  outDir: './dist-zt',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741915,
    nodeGraphId: 1073741830
  }
}

export default config
