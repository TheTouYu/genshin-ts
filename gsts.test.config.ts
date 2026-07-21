import type { GstsConfig } from './src/compiler/gsts_config.js'

const config: GstsConfig = {
  compileRoot: '.',
  entries: [
    './tests',
    '!./tests/manual/**/*.ts',
    // Intentional invalid examples are exercised by ESLint, not batch compilation.
    '!./tests/eslint_rules_showcase.ts'
  ],
  outDir: './dist',
  inject: {
    gameRegion: 'China',
    playerId: 100431567,
    mapId: 1073741851
  },
  options: {
    optimize: {
      precompileExpression: false,
      removeUnusedNodes: false
    }
  }
}

export default config
