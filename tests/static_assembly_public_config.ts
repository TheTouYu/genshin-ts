import type {
  GstsConfig,
  GstsStaticAssembly,
  GstsStaticAssemblyComponent,
  GstsStaticAssemblyItem,
  GstsStaticAssemblyStructure,
  GstsStaticColor,
  GstsStaticPrefabCategory,
  GstsStaticPrefabUpdate
} from '../src/index.js'

const color: GstsStaticColor = {
  enabled: true,
  rgb: 0xff0000,
  opacity: 100,
  overlay: 'overwrite'
}

const item: GstsStaticAssemblyItem = {
  resourceId: 10009001,
  position: [0, 0, 0],
  rotation: [0, 0, 45],
  scale: [1, 2, 1],
  color
}

const component: GstsStaticAssemblyComponent = {
  type: 'followMotion',
  preset: 'fullFollow'
}

const basicMotion: GstsStaticAssemblyComponent = {
  type: 'basicMotion',
  preset: 'default'
}

const structure: GstsStaticAssemblyStructure = {
  schemaVersion: 1,
  color,
  components: [component],
  items: [item]
}

const assembly: GstsStaticAssembly = {
  name: '公开类型回归',
  prefabId: 1,
  templatePrefabId: 2,
  templateInstanceId: 5,
  templateName: '模板',
  position: [0, 0, 0],
  components: [component],
  items: [item],
  definitionAuxiliaryIds: [3],
  instanceAuxiliaryIds: [4]
}

const fileAssembly: GstsStaticAssembly = {
  name: '文件公开类型回归',
  prefabId: 6,
  templatePrefabId: 2,
  templateInstanceId: 5,
  templateName: '模板',
  position: [0, 0, 0],
  structureFile: './assembly.json',
  definitionAuxiliaryIds: [7],
  instanceAuxiliaryIds: [8]
}

const update: GstsStaticPrefabUpdate = {
  prefabId: 2,
  instanceId: 5,
  expectedName: '模板',
  components: [component],
  removeComponents: [12, 13],
  scale: [0.01, 0.01, 0.01]
}

const category: GstsStaticPrefabCategory = {
  name: '学习',
  prefabIds: [2]
}

const createdCategory: GstsStaticPrefabCategory = {
  name: '运动器',
  create: true,
  id: 6,
  prefabIds: [2]
}

const config = {
  compileRoot: '.',
  entries: [],
  outDir: './dist',
  assets: {
    staticAssemblies: [assembly, fileAssembly],
    staticPrefabUpdates: [update],
    staticPrefabCategories: [category, createdCategory]
  }
} satisfies GstsConfig

if (
  structure.items[0] !== item ||
  basicMotion.type !== 'basicMotion' ||
  config.assets.staticAssemblies[0] !== assembly
) {
  throw new Error('static assembly config type regression')
}
