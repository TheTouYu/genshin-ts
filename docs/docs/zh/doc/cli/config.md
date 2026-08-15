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

`components` 当前支持两个保守快照：`{ type: 'followMotion', preset: 'fullFollow' }` 同步添加“跟随运动器—完全跟随”，即同时跟随目标位置和朝向；`{ type: 'basicMotion', preset: 'default' }` 同步添加基础运动器默认快照（2026-08-13 修正：类型码为 **4**，9B 槽 `080410017203c81f01`；旧实现误用模板自带 type 18 槽，游戏内运动器不生效）。省略 `components` 时不新增组件，完整继承模板现有组件。跟随运动器已有真实 GIL、自动回归、受限写回和用户游戏验证；基础运动器类型码经 2026-08-13 用户两次手动添加差分 + 控制器游戏对照确认，修复后待游戏核验。两者都不开放内部数值对应的未验证细粒度参数。

元件分类支持更新已有页签，也支持创建新页签。创建时设置 `create: true`；省略 `id` 时，工具会读取 `root` 下现有分类的最大 ID 并加 1。名称写入分类节点 `field 1`，分类 ID 写入 `field 3`。例如：

```ts
assets: {
  staticPrefabCategories: [
    { name: '学习', prefabIds: [COLOR_REFERENCE_ID, BASIC_MOTION_REFERENCE_ID] },
    { name: '魔方', prefabIds: [CUBE_PART_ID_1, CUBE_PART_ID_2] },
    { name: '基础元件', prefabIds: [SPHERE_ID, CUBOID_ID] },
    { name: '运动器', create: true, prefabIds: [BASIC_MOTION_ID] }
  ]
}
```

更新模式要求分类名已存在；创建模式要求分类名不存在，可显式指定 `id`，否则按当前 root 最大分类 ID 加 1。元件 ID 必须是当前地图中的定义 ID，同一 ID 不能出现在多个自定义分类。写入自定义分类后，已归类的 `kind=100` 定义成员会从默认“未分类页签”移除；其它系统/场景索引保留。工具不按名称猜测，也不伪造只有系统资源引用或场景实例、却没有自定义定义记录的 ID。分类创建与互斥迁移已有自动回归、真实地图写回与回存复扫，并经用户游戏验证。

若要原地修改已经存在的元件，而不是创建新元件，可使用 `assets.staticPrefabUpdates`：

```ts
assets: {
  staticPrefabUpdates: [
    {
      prefabId: EXISTING_PREFAB_DEFINITION_ID,
      instanceId: EXISTING_SCENE_INSTANCE_ID,
      expectedName: '当前确认名称',
      components: [{ type: 'basicMotion', preset: 'default' }]
    },
    {
      prefabId: EXISTING_PREFAB_DEFINITION_ID,
      instanceId: EXISTING_SCENE_INSTANCE_ID,
      expectedName: '当前确认名称',
      scale: [0.01, 0.01, 0.01]
    },
    {
      prefabId: EXISTING_PREFAB_DEFINITION_ID,
      instanceId: EXISTING_SCENE_INSTANCE_ID,
      expectedName: '当前确认名称',
      removeComponents: [12, 13]
    }
  ]
}
```

该操作要求 ID、名称和实例到定义的引用全部匹配，否则失败关闭。`components` 同步更新定义与指定实例，已有相同类型组件槽时替换而不叠加；`removeComponents` 同步从定义与实例中移除指定类型码的组件槽（如 `4`=基础运动器、`12`=命中检测、`13`=物件镜头），只做移除不做其他编码，记录中不存在的类型码静默跳过，实际移除清单输出到结果；`position` 只更新指定场景实例的位置，保持旋转、缩放和元件定义不变；`scale` 只更新指定场景实例的缩放，保持位置、旋转和元件定义不变。`removeComponents` 与 `components` 不得针对同一类型码（禁止对同一类型既增又删）。它不会创建元件或辅助 ID。CLI 仍默认 preview，`--output` 生成离线候选，`--write` 自动备份后写回。当前原地更新能力已有自动回归和离线真实地图候选验证；具体写回与游戏表现必须另行确认，不能由自动测试替代。

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
