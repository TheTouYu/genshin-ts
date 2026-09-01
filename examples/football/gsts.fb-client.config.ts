import type { GstsConfig } from '../../src/compiler/gsts_config.js'

// 足球客户端算力最小通路（E1，2026-09-02，地图 1073741908「真实足球」）。
// 与主配置隔离：entries 只含 src-fb（客户端三图 + 服务端 fb-server），产物 dist-fb。
// 前置（CLI 资产已 --write）：图 1082130433(20008)/1082130434(20009)/1073741830(20000)
// 已建；信号 fb_echo(tag:str,e:int,c:int) 已注册（1610612771/772/773）；变量
// fb_epoch/fb_ack/fb_sum/fb_t1..t8 已预注册于玩家模板实体 1086324737。
// 20007 决策图（1082130435 预期）= 用户编辑器建空图后核对回填，注入走 patch graph-clear。
// 编译期 inject.mapId 指向 1908 解析信号注册表；批量注入按 .gia 内 ID 路由。
const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./src-fb'],
  outDir: './dist-fb',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741908,
    nodeGraphId: 1073741830
  }
}

export default config
