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

根 `-c/--config` 是项目配置，只负责语言、区服、玩家和地图定位等上下文；静态拼装命令通过 `--asset-config` 加载含 `assets.staticAssemblies` 或 `assets.staticPrefabUpdates` 的独立资产配置。资产配置只要求默认导出对象，并至少提供一个非空操作数组，不要求编译 `entries` 非空；普通编译仍使用严格配置校验。旧子命令 `--config` 暂作 deprecated alias，不能与不同路径的 `--asset-config` 同时使用。

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
        components: [{ type: 'followMotion', preset: 'fullFollow' }],
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

`components` 当前只支持 `{ type: 'followMotion', preset: 'fullFollow' }`：为元件定义和场景实例同步添加“跟随运动器—完全跟随”组件快照，即同时跟随目标的位置和朝向；跟随目标可在运行时通过节点图指定。省略 `components` 时不新增组件，完整继承模板现有组件。该预设来自真实 GIL 中三个同构元件的 raw-wire 对照、自动回归，以及“星枢3x3块”系列 26 个元件的受限写回和用户编辑器/游戏验证；其它跟随类型、追踪方式和细粒度参数尚不支持，不能从内部数值猜测配置。

若要原地修改已经存在的元件，而不是创建新元件，可使用 `assets.staticPrefabUpdates`：

```ts
assets: {
  staticPrefabUpdates: [
    {
      prefabId: EXISTING_PREFAB_DEFINITION_ID,
      instanceId: EXISTING_SCENE_INSTANCE_ID,
      expectedName: '当前确认名称',
      components: [{ type: 'followMotion', preset: 'fullFollow' }]
    },
    {
      prefabId: EXISTING_PREFAB_DEFINITION_ID,
      instanceId: EXISTING_SCENE_INSTANCE_ID,
      expectedName: '当前确认名称',
      scale: [0.01, 0.01, 0.01]
    }
  ]
}
```

该操作要求 ID、名称和实例到定义的引用全部匹配，否则失败关闭。`components` 同步更新定义与指定实例，已有跟随运动器槽时替换而不叠加；`position` 只更新指定场景实例的位置，保持旋转、缩放和元件定义不变；`scale` 只更新指定场景实例的缩放，保持位置、旋转和元件定义不变。它不会创建元件或辅助 ID。CLI 仍默认 preview，`--output` 生成离线候选，`--write` 自动备份后写回。当前原地更新能力已有自动回归和离线真实地图候选验证；具体写回与游戏表现必须另行确认，不能由自动测试替代。

复杂模型可以把主颜色和 `items` 移到严格 JSON 结构文件中，地图相关的名称、模板、ID 和场景 Transform 仍保留在配置里：

```ts
{
  name: '文件拼装',
  prefabId: NEW_PREFAB_ID,
  templatePrefabId: TEMPLATE_DEFINITION_ID,
  templateInstanceId: TEMPLATE_INSTANCE_ID,
  templateName: '已确认模板名',
  position: [0, 0, 0],
  structureFile: './assemblies/model.json',
  definitionAuxiliaryIds: [UNUSED_DEFINITION_ID_1],
  instanceAuxiliaryIds: [UNUSED_INSTANCE_ID_1]
}
```

```json
{
  "$schema": "../node_modules/genshin-ts/schemas/static-assembly.schema.json",
  "schemaVersion": 1,
  "color": { "enabled": true, "rgb": 16711680, "opacity": 100, "overlay": "overwrite" },
  "components": [{ "type": "followMotion", "preset": "fullFollow" }],
  "items": [{ "resourceId": 10009001, "position": [0, 0, 0] }]
}
```

`structureFile` 相对 `gsts.config.ts` 所在目录解析，并与配置中的 `items`、`color`、`components` 互斥。解析器拒绝未知版本、未知字段、重复/未知组件、空 items、非法颜色和非有限 Transform。当前功能只读取声明式 JSON，不会从 `.gil` 自动提取结构。

示例占位符必须替换为从目标地图确认的模板、资源和未占用 ID；不要复制示例值直接写真实地图。该工具修改 `.gil` 资产结构，不是 GIA NodeGraph 注入。结构文件加载和发布包消费已有自动回归，但尚无结构文件路径的新增游戏验证。颜色编码已有真实 GIL wire、自动回归和受限游戏验证：球体、圆锥、圆柱、线框长方体、线框圆柱在本次配置中的 33/50/66/100% 透明度、覆盖/正片叠底及关闭颜色均通过；其它资源、模板、地图和材质仍须单独验证。
