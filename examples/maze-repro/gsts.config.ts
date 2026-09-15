import type { GstsConfig } from '../../src/compiler/gsts_config.js'

// T12 复现工程（《空中花园》式迷宫）
//
// ⚠️ 本配置**刻意不写 inject 段**：T12 只做到「编译 → 产出 .gia 候选」为止。
// 注入需要用户明确确认目标 mapId（AGENTS.md 红线：操作地图/mapId/nodeGraphId 前必须确认），
// 确认后再补 inject 段并用 `gsts -c examples/maze-repro/gsts.config.ts` 注入。
const config: GstsConfig = {
  compileRoot: '.',
  entries: ['./src'],
  outDir: './dist'
}

export default config
