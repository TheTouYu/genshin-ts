import type { GstsConfig } from '../../src/compiler/gsts_config.js'

// 只注入力输入套件图 _GSTS_forceKit（服务端 20000 / 1073741835）——单图窄注入。
// 键位 7/8/9/31-39/41-45（设计=design/FORCE-KIT-DESIGN.md §2）：镜像 fb_kx/ky/kz/ks/fb_kstep
// 维护 + 键 7 连线单位向量施力写 fb_fx/fy/fz + fb_f_seq 脉冲（内核 kitLoop 既有 3 拍窗口）。
//   cd examples/football && node ../../dist/src/cli/gsts.js --config ./gsts.kit3-forcekit-inject.config.ts
const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./src-fb3/zz-force-kit.ts'],
  outDir: './dist-fb3',
  inject: {
    gameRegion: 'China',
    playerId: 110170759,
    mapId: 1073741827,
    nodeGraphId: 1073741835,
    extractSignals: false,
    extractResources: false
  }
}

export default config
