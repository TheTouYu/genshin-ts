import type { GstsConfig, GstsStaticAssembly, GstsStaticAssemblyItem } from '../src/index.js'

const item: GstsStaticAssemblyItem = {
  resourceId: 10009001,
  position: [0, 0, 0],
  rotation: [0, 0, 45],
  scale: [1, 2, 1]
}

const assembly: GstsStaticAssembly = {
  name: '公开类型回归',
  prefabId: 1,
  templatePrefabId: 2,
  templateInstanceId: 5,
  templateName: '模板',
  position: [0, 0, 0],
  items: [item],
  definitionAuxiliaryIds: [3],
  instanceAuxiliaryIds: [4]
}

const config = {
  compileRoot: '.',
  entries: [],
  outDir: './dist',
  assets: { staticAssemblies: [assembly] }
} satisfies GstsConfig

if (config.assets.staticAssemblies[0] !== assembly) {
  throw new Error('static assembly config type regression')
}
