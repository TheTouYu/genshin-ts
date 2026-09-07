// 球跟随负载优化 · 资产写回配置（票：中心驱动/分块跟随）
// 目标：测试图 1073741919（1073741914 副本，原图不动）
// ① 27 个中心球（官方球体 10009002 缩放 0.01，全部摆魔方中心 (0,1.7,0)，basicMotion type 4）
// ② 26 块组件替换：移除 basicMotion(4)，新增 followMotion(9) 完全跟随（互斥规则：球 4 / 块 9）
// 球 ID 1077936233..259（已验证 root4/5/8/27 全空闲）；球 i ↔ 块 i（同名标签），末位 CORE 为核心球
import type { GstsConfig } from '../../src/compiler/gsts_config.js'

// 与 root4 定义顺序一致（1077936204..1229），末位 CORE 无对应块（整体转/备用）
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
  // 官方模板源：templatePrefabId 直接填官方资源 ID（球体），程序化生成 def+inst+root6
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
