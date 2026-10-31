import type { GstsConfig } from '../../src/compiler/gsts_config.js'

// 角色探针两图（客户端 20002 + 服务端 20000）编译配置——**只编译不注入**：
//   cd examples/football && node ../../dist/src/cli/gsts.js --config ./gsts.probe.config.ts --noinject
const config: GstsConfig = {
  compileRoot: '.',
  entries: [
    './src-fb3/zz-probe-char.ts',
    './src-fb3/zz-probe-char-srv.ts',
    './src-fb3/zz-char-init.ts',
    './src-fb3/zz-force-test.ts',
    './src-fb3/zz-char-srv.ts',
    './src-fb3/zz-aim-panel.ts'
  ],
  outDir: './dist-fb3',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741827,
    nodeGraphId: 1082130450,
    extractSignals: false,
    extractResources: false
  }
}

export default config
