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
        templatePrefabId: TEMPLATE_DEFINITION_ID,
        templateInstanceId: TEMPLATE_INSTANCE_ID,
        templateName: '已确认模板名',
        position: [0, 0, 0],
        color: { enabled: true, rgb: 0xff0000, opacity: 100, overlay: 'overwrite' },
        items: [
          {
            resourceId: CONFIRMED_RESOURCE_ID,
            position: [-1, 0, 0],
            scale: [2, 0.5, 0.5],
            color: { enabled: true, rgb: 0x00ffff, opacity: 66, overlay: 'multiply' }
          },
          {
            resourceId: CONFIRMED_RESOURCE_ID,
            position: [1, 0, 0],
            rotation: [0, 0, 45],
            color: { enabled: false }
          }
        ],
        definitionAuxiliaryIds: [UNUSED_DEFINITION_ID_1, UNUSED_DEFINITION_ID_2],
        instanceAuxiliaryIds: [UNUSED_INSTANCE_ID_1, UNUSED_INSTANCE_ID_2]
      }
    ]
  }
} satisfies GstsConfig

export default config
```

元件自身 Transform 是场景坐标，item Transform 是相对元件原点的局部坐标。`scale: [1, 1, 1]` 表示资源原始尺寸，不保证所有资源在游戏中都是 1×1×1。模板定义 ID 和实例 ID 不保证相同，必须分别确认。颜色 `rgb` 使用 `0xRRGGBB`，`opacity` 为 0–100，叠加方式为 `overwrite` 或 `multiply`；`enabled: false` 关闭自定义颜色。未声明 `color` 时继承模板快照，材质等其它未知字段保持不变。

示例占位符必须替换为从目标地图确认的模板、资源和未占用 ID；不要复制示例值直接写真实地图。该工具修改 `.gil` 资产结构，不是 GIA NodeGraph 注入。颜色编码已有真实 GIL wire、自动回归和受限游戏验证：球体、圆锥、圆柱、线框长方体、线框圆柱在本次配置中的 33/50/66/100% 透明度、覆盖/正片叠底及关闭颜色均通过；其它资源、模板、地图和材质仍须单独验证。
