import type { GstsConfig } from '../../src/compiler/gsts_config.js'

const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./src'],
  outDir: './dist',
  // 2026-08-31 B1 实测回归：shared vendor Graph 后端的列表字面量编码（bArray 内层
  // alreadySetVal=false）注入后 cases 丢失（多分支全断，日志 3013 IN1:List= 空）。
  // 显式回退 legacy 后端直至 vendor 后端字面量 wire 修复。
  options: {
    stage3: {
      vendorImplGraphBeta: true
    }
  },
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741914,
    nodeGraphId: 1073741830
  }
}

export default config