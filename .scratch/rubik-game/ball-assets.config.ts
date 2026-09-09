// rubik-game W3 · 球跟随资产写回配置（2026-09-09，自 .scratch/rubik3x3-client-offload/ball-follow.config.ts 移植）
// 目标：地图 1073741920（ID 段 1077936233..259 已核全空闲）
// ① 27 个中心球（官方球体 10009002 缩放 0.01，摆魔方中心 placeholder，basicMotion type 4）
// ② 26 块组件替换：移除 basicMotion(4)，新增 followMotion(9) 完全跟随（互斥：球 4 / 块 9）
// 运行时球由 flowSpawnBalls createPrefab 于 (3,3,3) 生成，静态实例仅为 def 伴生占位。
import type { GstsConfig } from '../../src/compiler/gsts_config.js'

export const BALL_LABELS = [
  'UFL', 'UF', 'UFR', 'UL', 'U', 'UR', 'UBL', 'UB', 'UBR',
  'FL', 'F', 'FR', 'L', 'R', 'BL', 'B', 'BR',
  'DFL', 'DF', 'DFR', 'DL', 'D', 'DR', 'DBL', 'DB', 'DBR',
  'CORE'
]

const CUBE_CENTER: readonly [number, number, number] = [0, 1.7, 0]
const BALL_SCALE: readonly [number, number, number] = [0.01, 0.01, 0.01]
const BALL_ID_BASE = 1077936233
const BLOCK_ID_BASE = 1077936204

const balls = BALL_LABELS.map((label, i) => ({
  name: `星枢3x3球_v3_${label}`,
  prefabId: BALL_ID_BASE + i,
  templatePrefabId: 10009002,
  templateInstanceId: 10009002,
  templateName: '球体',
  position: CUBE_CENTER,
  scale: BALL_SCALE,
  items: [],
  components: [{ type: 'basicMotion' as const, preset: 'default' as const }],
  definitionAuxiliaryIds: [],
  instanceAuxiliaryIds: []
}))

const updates = BALL_LABELS.slice(0, 26).map((label, i) => ({
  prefabId: BLOCK_ID_BASE + i,
  instanceId: BLOCK_ID_BASE + i,
  expectedName: `星枢3x3块_v2_${label}`,
  removeComponents: [4],
  components: [{ type: 'followMotion' as const, preset: 'fullFollow' as const }]
}))

const config: GstsConfig = {
  assets: {
    staticAssemblies: balls,
    staticPrefabUpdates: updates
  }
}

export default config
