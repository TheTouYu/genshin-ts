# gsts.config.ts

常见字段：
- `compileRoot`
- `entries`
- `outDir`
- `inject`
- `assets`
- `options.optimize`

默认优化项全部开启。

## 静态元件拼装

`assets.staticAssemblies` 可基于目标地图中已有的模板闭包和已确认的官方基础模型资源，生成新的静态拼装自定义元件：

```ts
import type { GstsConfig } from 'genshin-ts'

const config = {
  compileRoot: '.',
  entries: ['./src'],
  outDir: './dist',
  assets: {
    staticAssemblies: [
      {
        name: '示例拼装',
        prefabId: NEW_PREFAB_ID,
        templatePrefabId: TEMPLATE_PREFAB_ID,
        templateName: '已确认模板名',
        position: [0, 0, 0],
        items: [
          { resourceId: CONFIRMED_RESOURCE_ID, position: [-1, 0, 0], scale: [2, 0.5, 0.5] },
          { resourceId: CONFIRMED_RESOURCE_ID, position: [1, 0, 0], rotation: [0, 0, 45] }
        ],
        definitionAuxiliaryIds: [UNUSED_DEFINITION_ID_1, UNUSED_DEFINITION_ID_2],
        instanceAuxiliaryIds: [UNUSED_INSTANCE_ID_1, UNUSED_INSTANCE_ID_2]
      }
    ]
  }
} satisfies GstsConfig

export default config
```

元件自身 Transform 是场景坐标，item Transform 是相对元件原点的局部坐标。`scale: [1, 1, 1]` 表示资源原始尺寸，不保证所有资源在游戏中都是 1×1×1。当前颜色/材质未知字段继承模板子项，不提供任意颜色配置。

示例占位符必须替换为从目标地图确认的模板、资源和未占用 ID；不要复制示例值直接写真实地图。该工具修改 `.gil` 资产结构，不是 GIA NodeGraph 注入。
