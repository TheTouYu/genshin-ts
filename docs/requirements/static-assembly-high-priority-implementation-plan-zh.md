# 静态拼装高优先级优化实施计划

> 状态：已完成
> 来源：真实生产反馈 + 当前代码实现 + 自动回归
> 最近校验：2026-07-29
> 适用范围：Genshin-TS CLI、静态 `.gil` 拼装只读分析、确定性计划、npm 包与项目模板
>
> 本文六个高优先级工作包已经实现。当前用户行为以中英文 CLI 文档为准，内部结构与证据边界以
> [`../architecture/gil-static-model-assets.md`](../architecture/gil-static-model-assets.md) 和
> [`../project-intelligence/contexts/static-gil-assembly-production.md`](../project-intelligence/contexts/static-gil-assembly-production.md)
> 为准。本文保留为实施与验收记录，不再作为“尚未实现”的规划。

## 0. 完成摘要

| 工作包 | 完成结果                                                                      | 自动验收                                                             |
| ------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| HP-1   | 根项目配置与 `--asset-config` 分离；compile/project/static-assemblies profile | `tests/cli_static_assembly_config_routing.ts`                        |
| HP-2   | 六组带 `.js` 包子路径修复；真实 tarball/starter/模板工具消费                  | `tests/static_assembly_package_consumer.ts`                          |
| HP-3   | 稳定、默认脱敏的 maps JSON 和按需 SHA-256                                     | `tests/cli_maps_json.ts`                                             |
| HP-4   | 共享 wire/index/closure 与确定性合成 fixture                                  | `tests/static_assembly_map_index.ts`                                 |
| HP-5   | 只读 Inspection V1、schema、公开 API 和 CLI                                   | `tests/cli_static_assembly_inspect.ts`                               |
| HP-6   | 确定性 Plan V1、canonical hash、冲突/漂移检查                                 | `tests/static_assembly_plan.ts`、`tests/cli_static_assembly_plan.ts` |

完成边界：focused 回归、构建、tarball 消费和 `git diff --check` 通过；本轮没有读取或写回真实玩家
地图，也没有新增编辑器/游戏验证。`npm test` 已运行，但停在既有
`tests/builtins_math_success_test.ts:42:17` 的 `LocalVariable type mismatch: declared int, assigned float`
诊断；该失败不属于本计划 focused 回归，未通过降低断言处理。由于没有提供明确的外部只读 fixture
参数，本轮未重新运行 `tests/gil_static_assemblies.ts` 的受限真实样本候选哈希对照。

## 1. 计划依据

原始真实生产反馈见
[`static-assembly-production-path-optimization-zh.md`](static-assembly-production-path-optimization-zh.md)。
当前实现和受限生产证据分别以以下文件为准：

- [`../../src/cli/gsts.ts`](../../src/cli/gsts.ts)
- [`../../src/compiler/config_loader.ts`](../../src/compiler/config_loader.ts)
- [`../../src/cli/assets_static_assemblies.ts`](../../src/cli/assets_static_assemblies.ts)
- [`../../src/cli/gil_static_assemblies.ts`](../../src/cli/gil_static_assemblies.ts)
- [`../../tests/gil_static_assemblies.ts`](../../tests/gil_static_assemblies.ts)
- [`../architecture/gil-static-model-assets.md`](../architecture/gil-static-model-assets.md) §19.2
- [`../../knowledge/validation-evidence/static-assembly-production-evidence.md`](../../knowledge/validation-evidence/static-assembly-production-evidence.md)

本计划只覆盖已评为高优先级的六项工作：

1. 修复根 CLI 与静态拼装子命令的配置参数所有权；
2. 修复发布包子路径被解析为 `.js.js`；
3. 为 `gsts maps` 增加稳定、脱敏的 JSON 输出；
4. 建立共享的静态拼装只读地图索引和闭包分析模块；
5. 提供公开 `inspect`；
6. 提供绑定源哈希的确定性 `plan`。

不可变计划驱动写入、正式 `verify`、写回收据、`rollback`、多变体生成器和可视化不在本计划的
实现范围内。本文会为后续安全闭环保留接口，但不得顺带实现真实地图写回或放宽现有备份与确认门。

## 2. 已确认的当前缺口

### 2.1 配置被根入口提前消费

`src/cli/gsts.ts` 的 `main()` 在 Commander 分发子命令前调用 `preparseArgv()` 扫描完整 argv，
因此子命令中的 `--config` 会先被当作编译配置交给 `loadGstsConfig()`。该 loader 要求
`compileRoot`、非空 `entries` 和 `outDir`，而静态拼装包装器又有一套只检查默认导出对象的
私有 loader。公开入口和直接调用内部命令因此具有不同结果。

这不是单纯的 Commander 选项重名问题。修复必须同时解决：

- 根参数扫描的作用域；
- 项目配置与资产配置的不同校验 profile；
- `.ts` 配置加载时 `assets` 不能被子进程序列化逻辑删除；
- 配置错误需要包含绝对路径和精确字段。

### 2.2 包 exports 与模板导入约定冲突

当前 `package.json` 使用 `./injector/* → ./dist/src/injector/*.js` 等通配导出，而模板工具按本仓库
TypeScript 约定导入 `genshin-ts/injector/binary.js`。Node 会将通配符匹配为 `binary.js`，最终尝试
加载 `binary.js.js`。现有 package consumer 测试只执行 CLI help，没有真正运行模板诊断工具。

### 2.3 只读发现能力被封闭在写入实现中

`src/cli/gil_static_assemblies.ts` 已能解析顶层 `field 4/6/8/27`、定位模板、读取 packed ID 和
检查冲突，但这些能力是写入器私有实现。使用者仍需自己扫描模板定义/实例、场景 Transform、辅助
闭包和占用 ID。新增命令前必须先建立共享只读模型，不能在 `inspect`、`plan` 和现有写入器中各复制
一套 raw-wire 递归解析。

## 3. 目标 CLI 契约

### 3.1 参数所有权

实施后采用以下明确语义：

```text
-c, --config <file>        项目配置：语言、区服、玩家和 mapId 等项目上下文
--asset-config <file>      静态拼装声明：assets.staticAssemblies
```

推荐命令：

```bash
# 只读列出地图，项目配置只负责地图定位
node bin/gsts.mjs -c gsts.config.ts maps --format json --include-hash

# 对明确的文件做只读检查，不要求项目配置
node bin/gsts.mjs assets:static-assemblies inspect \
  --gil source.gil --format json

# 通过项目配置定位 mapId
node bin/gsts.mjs -c gsts.config.ts assets:static-assemblies inspect \
  --map-id <id> --format json

# 使用独立资产配置生成确定性计划
node bin/gsts.mjs -c gsts.config.ts assets:static-assemblies plan \
  --asset-config assemblies.config.ts --map-id <id> --output plan.json
```

兼容规则：

- 现有 `gsts assets:static-assemblies [options]` 保留为 preview，不在本批次删除或改成写入；
- 子命令原有 `--config <file>` 暂保留为 `--asset-config` 的 deprecated alias；
- 新文档和 help 只推荐 `--asset-config`；
- 同时提供 `--config` alias 和 `--asset-config` 且路径不一致时失败关闭；
- 全局 `-c/--config` 只从根命令选项位置读取，不再扫描子命令之后的同名选项；
- `inspect --gil` 不得因为当前目录缺少 `gsts.config.ts` 而失败；
- `--map-id` 仍只负责目标定位，不等于写回授权。

### 3.2 输出协议

所有新增机器输出统一遵守：

- `--format text|json`，默认 `text`；
- JSON 模式的 stdout 只输出一个 JSON 文档，诊断写入 stderr；
- JSON 顶层包含 `schemaVersion` 和 `kind`；
- 进程退出码：成功为 `0`，输入/结构/冲突错误为非 `0`；
- 默认不输出玩家目录、Windows 用户名或真实绝对路径；
- 文本输出可以本地化，JSON key 和枚举值保持稳定英文；
- 数值 ID 在 JSON 中使用 number，但必须通过 non-negative safe integer 校验；
- SHA-256 使用 64 位小写十六进制字符串。

## 4. 目标模块设计

新增共享目录：

```text
src/cli/static_assembly/
├── wire.ts             # 受限 protobuf-like 解析/编码原语
├── map_index.ts        # 从 GIL bytes 建立只读索引
├── closure.ts          # 模板与两侧辅助闭包分析
├── inspection.ts       # 公开 inspect 结果模型
├── plan.ts             # 计划解析、冲突检查、规范化与哈希
└── json.ts             # canonical JSON 和稳定输出辅助
```

首批外部 seam 控制为两个纯操作：

```ts
inspectStaticAssemblyMap(input): StaticAssemblyMapInspection
createStaticAssemblyPlan(input): StaticAssemblyPlan
```

实现约束：

1. 核心函数接受 bytes/解析后的配置并返回结果，不直接打印、不选择真实地图、不写文件；
2. CLI adapter 负责路径解析、文件读取、stdout/stderr 和 `--output`；
3. `map_index.ts` 一次解析后提供定义、实例、辅助记录和占用 ID，避免重复全图扫描；
4. `closure.ts` 可以复用低层 wire reader，但不能调用写入后才存在的数据；
5. 现有 `applyStaticAssembly()` 在本计划内只迁移到共享 wire/index 原语，不改变生产编码结果；
6. 未知字段保持 opaque，不新增未知 GIL 字段语义；
7. 后续 `verify` 应从候选 bytes 独立回读，不得只相信写入器返回的中间对象。

建议公开类型放在 `src/compiler/gsts_config.ts` 或新的公共类型模块，并从包根入口导出：

- `StaticAssemblyMapInspectionV1`
- `StaticAssemblyPlanV1`
- `StaticAssemblyPlanStatus`

这些类型描述 JSON 契约，不暴露 `WireField` 或 field-number 实现细节。

## 5. 工作包 HP-1：配置路由和 loader profile

### 5.1 修改范围

主要文件：

- `src/cli/gsts.ts`
- `src/compiler/config_loader.ts`
- `src/compiler/gsts_config.ts`
- `src/cli/assets_static_assemblies.ts`
- `src/i18n/locales/en-US/main.json`
- `src/i18n/locales/zh-CN/main.json`

新增测试建议：

- `tests/cli_static_assembly_config_routing.ts`
- `tests/fixtures/static-assembly/config-valid.mjs`
- `tests/fixtures/static-assembly/config-valid.ts`
- `tests/fixtures/static-assembly/config-invalid.mjs`

### 5.2 实施步骤

1. 先写公开根入口红灯回归，使用子进程执行 `node bin/gsts.mjs`，不得直接调用
   `runAssetsStaticAssemblies()`。
2. 将 `preparseArgv()` 改为只读取 Commander 根选项作用域，至少在遇到已知子命令后停止；长期以
   Commander 已解析的根 options 为准，预解析只保留初始化语言所需的最小能力。
3. 将配置加载拆成共享“加载模块”和 profile 校验：

   ```ts
   loadGstsConfig(path, { profile: 'compile' })
   loadGstsConfig(path, { profile: 'project' })
   loadGstsConfig(path, { profile: 'static-assemblies' })
   ```

4. `.ts/.mts/.cts` 继续通过 tsx 隔离加载，但序列化必须按 profile 保留所需字段；不得继续用
   `key === 'assets' ? undefined` 作为静态拼装配置加载路径。
5. `static-assemblies` profile 只要求默认导出对象和非空 `assets.staticAssemblies`；不得要求
   编译 `entries` 非空。
6. `project` profile 允许 maps/inspect 只消费 `inject`、`lang` 等字段；编译命令继续使用严格
   `compile` profile，避免放宽普通构建契约。
7. 删除 `assets_static_assemblies.ts` 的私有动态 import loader，统一走共享 loader。
8. 增加 `--asset-config`，实现旧 `--config` alias 的冲突检查和迁移诊断。
9. 错误统一输出：绝对配置路径、profile、精确缺失/非法字段；不再把空 `entries` 表述为三个字段
   都缺失。

### 5.3 红绿回归矩阵

| 场景                                     | 预期                                        |
| ---------------------------------------- | ------------------------------------------- |
| 根入口 + `.mjs` 资产配置 + `entries: []` | 进入静态拼装逻辑，不被 compile profile 拦截 |
| 根入口 + `.ts` 资产配置                  | 保留并读取 `assets.staticAssemblies`        |
| `inspect --gil` 且无项目配置             | 成功进入只读文件检查                        |
| `--map-id` 且无可解析项目环境            | 给出地图定位诊断，不误报资产配置错误        |
| 同时给出冲突的 alias 和 `--asset-config` | 写文件前失败关闭                            |
| 普通 `gsts` build 配置 `entries: []`     | 继续被 compile profile 拒绝                 |
| 配置字段错误                             | 包含绝对路径、profile 和字段路径            |

### 5.4 完成门

```bash
npx tsx tests/cli_static_assembly_config_routing.ts
npm run build
node bin/gsts.mjs assets:static-assemblies --help
```

HP-1 完成后只证明公开 CLI 路由和配置读取正确，不证明任何 GIL 候选、写回或游戏行为。

## 6. 工作包 HP-2：包 exports 与真实安装消费回归

### 6.1 修改范围

主要文件：

- `package.json`
- `tests/static_assembly_package_consumer.ts`
- 必要时修正 `create-genshin-ts/templates/start/tools/*.ts`

### 6.2 实施步骤

1. 先在 package consumer 中增加红灯：npm pack、创建临时 starter、安装 tarball 后，实际加载带
   `.js` 的公开子路径。
2. 明确公开约定：TypeScript/ESM 调用方按仓库规则使用 `.js` 后缀。
3. 为已有公开通配目录增加带 `.js` 的精确 exports pattern，使
   `genshin-ts/injector/binary.js` 映射到单个 `binary.js`；同时评估是否保留无扩展子路径兼容。
4. 至少审计 `compiler`、`injector`、`cli`、`runtime`、`thirdparty` 和 `definitions` 六组 pattern，
   不只修一个示例。
5. package consumer 实际运行或最小导入模板中使用的模块：
   - `genshin-ts/cli/gil_extract_utils.js`
   - `genshin-ts/injector/binary.js`
   - `genshin-ts/injector/types.js`
   - `genshin-ts/injector/proto.js`
6. 使用无私人数据的最小输入执行至少一个模板 `tools/` 命令；如果工具需要有效 GIL，则使用 HP-4
   的确定性 fixture，不回退到兄弟源码仓库。
7. 断言错误栈和模块 URL 中不存在 `.js.js`，解析结果位于临时安装的 `node_modules/genshin-ts`。

### 6.3 完成门

```bash
npx tsx tests/static_assembly_package_consumer.ts
npm run build
```

回归必须从真实 tarball 安装执行；仅检查 `package.json` 字符串或仓库内相对导入不算完成。

## 7. 工作包 HP-3：`gsts maps` 稳定 JSON

### 7.1 修改范围

主要文件：

- `src/cli/gsts.ts`，并优先将 maps 实现拆到 `src/cli/maps.ts`
- `src/cli/gil_paths.ts`
- `src/compiler/gsts_config.ts`（如需公开结果类型）
- i18n 文件
- `tests/cli_maps_json.ts`

### 7.2 JSON 契约

建议顶层形状：

```json
{
  "schemaVersion": 1,
  "kind": "gsts.maps",
  "maps": [
    {
      "mapId": 1073741849,
      "modifiedAt": "2026-07-29T00:00:00.000Z",
      "modifiedAtMs": 1785283200000,
      "size": 50400,
      "recent": true,
      "sha256": "optional when --include-hash is set",
      "locator": { "kind": "mapId", "mapId": 1073741849 }
    }
  ]
}
```

约束：

- 按 `modifiedAtMs` 降序，再按 `mapId` 稳定排序；
- `recent` 只表示当前实现的 30 分钟窗口，不表示选中或授权；
- 默认 JSON 不包含 `saveLevelDir`、玩家 ID 或绝对路径；
- `--include-path` 不在本计划公开，内部诊断如需路径写 stderr；
- 仅指定 `--include-hash` 时读取文件内容计算 SHA-256；
- mapId 文件名不是 non-negative safe integer 时跳过并给出 stderr warning，不能在 JSON 中混入字符串 ID；
- 文本模式保持当前兼容输出。

### 7.3 测试策略

不要访问真实玩家目录。将目录枚举和当前时间作为依赖传入 maps 模块，使用临时目录覆盖：

- 稳定排序；
- recent 边界；
- 大小与 SHA-256；
- 非法文件名；
- 无路径泄漏；
- JSON stdout 可被单次 `JSON.parse()`；
- 未指定 `--include-hash` 时不读取文件内容，可通过注入 reader/spy 验证。

### 7.4 完成门

```bash
npx tsx tests/cli_maps_json.ts
npm run build
```

不对真实 `gsts maps` 结果进行快照，也不自动选择最新地图。

## 8. 工作包 HP-4：共享 wire reader、地图索引与闭包分析

### 8.1 修改范围

新增：

- `src/cli/static_assembly/wire.ts`
- `src/cli/static_assembly/map_index.ts`
- `src/cli/static_assembly/closure.ts`
- `tests/static_assembly_map_index.ts`
- `tests/fixtures/static-assembly/build_fixture.ts`

调整：

- `src/cli/gil_static_assemblies.ts`
- `tests/gil_static_assemblies.ts`

### 8.2 索引模型

`map_index.ts` 一次读取后至少形成：

- GIL header 元数据和 payload 顶层字段摘要；
- 自定义元件主定义记录：ID、可解码名称、packed 辅助 ID；
- 场景主实例记录：实例 ID、定义引用、可解码名称、Transform；
- 定义侧辅助记录：ID、owner、资源、名称、Transform；
- 实例侧辅助记录：ID、owner、definition backlink、资源、名称、Transform；
- `field 6` owner 登记摘要；
- 四类占用 ID 的排序集合和压缩范围；
- 无法解释或闭包不完整的诊断，不因此猜测未知字段语义。

闭包状态使用稳定枚举，例如：

```text
complete
missing-definition
missing-instance
missing-definition-auxiliary
missing-instance-auxiliary
missing-owner-registry
ambiguous-name
unsupported-layout
```

一个模板只有在当前已知闭包检查全部通过时才标记 `closureStatus=complete`。输出仍必须包含
`compatibility=unknown`，不能把结构完整推广为任意资源或游戏兼容。

### 8.3 fixture 策略

自动测试不得依赖真实玩家地图或 `user_edit/`。新增确定性 fixture builder，生成最小但完整的：

- GIL header/tail；
- 一个模板定义和一个定义不同 ID 的模板实例；
- 两侧辅助记录；
- packed ID；
- `field 6` 登记；
- 场景和局部 Transform；
- 未知字段 sentinel，用于验证只读路径不丢失或误解释。

该 fixture 只证明当前 parser/index 契约，不是“真实编辑器输出”证据。现有需要外部真实地图参数的
`tests/gil_static_assemblies.ts` 保留为可选受限回归；如未来提交脱敏真实 fixture，必须另行确认
来源、隐私、许可和适用范围。

### 8.4 迁移顺序

1. 用现有 `gil_static_assemblies.ts` 行为写 characterization tests；
2. 提取 `WireField`、parse/emit、message、record ID、packed ID、printable 等低层原语；
3. 建立只读 index 和 closure analyzer；
4. 让 `applyStaticAssembly()` 复用共享 reader/index，但保持输入输出和候选 bytes 不变；
5. 对同一 fixture 比较迁移前后的候选 SHA-256；
6. 删除生产路径中重复 parser；测试可以保留独立最小回读器，以避免写入和验证完全同源。

### 8.5 完成门

```bash
npx tsx tests/static_assembly_map_index.ts
# 有明确、只读的外部 fixture 参数时才运行：
npx tsx tests/gil_static_assemblies.ts <map.gil> <prefabId> <definitionStart> <instanceStart>
npm run build
```

如果迁移使现有受限真实 fixture 候选哈希变化，停止并分析；不得通过更新期望哈希掩盖编码差异。

## 9. 工作包 HP-5：公开 `inspect`

### 9.1 修改范围

新增或调整：

- `src/cli/static_assembly/inspection.ts`
- `src/cli/assets_static_assemblies.ts`
- `src/cli/gsts.ts`
- `schemas/static-assembly-inspection.schema.json`
- `package.json` 的 schema export/files 检查
- `tests/cli_static_assembly_inspect.ts`

### 9.2 Inspection V1

至少输出：

```json
{
  "schemaVersion": 1,
  "kind": "gsts.static-assembly.inspection",
  "source": {
    "locator": { "kind": "gilFile", "displayName": "source.gil" },
    "size": 50400,
    "sha256": "..."
  },
  "definitions": [],
  "instances": [],
  "occupiedIds": {
    "prefabs": [],
    "instances": [],
    "definitionAuxiliaries": [],
    "instanceAuxiliaries": [],
    "ranges": {}
  },
  "templateCandidates": [],
  "warnings": [],
  "evidenceBoundary": {
    "structuralInspection": true,
    "templateCompatibility": "not-proven",
    "editorOrGameValidation": "not-performed"
  }
}
```

每个模板候选至少包含：

- `definitionId`、`instanceId`、名称；
- item 数量；
- 两侧辅助 ID；
- 场景 Transform；
- `closureStatus` 和诊断；
- `compatibility: unknown`。

ID 建议只输出当前扫描范围内的空闲区间，例如 `freeRuns`，不得自动选择并写入。每个建议都绑定
`source.sha256`，并标记 `proposalOnly=true` 和“不代表编辑器全局分配协议”。

### 9.3 行为约束

- `inspect` 始终只读；
- `--output` 只可新建 JSON，不覆盖已有文件；
- `--format json` 与 `--output` 的内容按同一 serializer 生成；
- 显式 `--gil` 时 locator 默认只含 basename，不持久化绝对路径；
- 模板名称无法唯一解码时输出诊断，不用首次字符串命中猜名称；
- 顶层布局不受支持时失败关闭，并显示已识别/缺失的 section；
- 结构通过不等于模板兼容或游戏可加载。

### 9.4 完成门

```bash
npx tsx tests/cli_static_assembly_inspect.ts
node bin/gsts.mjs assets:static-assemblies inspect \
  --gil <temporary-fixture.gil> --format json
npm run build
```

验收测试必须断言源文件哈希和 mtime 未改变，且没有创建备份目录。

## 10. 工作包 HP-6：确定性 `plan`

### 10.1 修改范围

新增或调整：

- `src/cli/static_assembly/plan.ts`
- `src/cli/static_assembly/json.ts`
- `src/cli/assets_static_assemblies.ts`
- `src/cli/static_assembly_structure.ts`
- `src/compiler/gsts_config.ts`
- `schemas/static-assembly-plan.schema.json`
- `package.json`
- `tests/static_assembly_plan.ts`
- `tests/cli_static_assembly_plan.ts`

### 10.2 Plan V1 内容

计划文件至少包含：

- `schemaVersion=1`、`kind=gsts.static-assembly.plan`；
- `status=ready|blocked`；
- 源 locator、大小和 SHA-256；
- 资产配置的脱敏 locator；
- 每个解析后的 assembly；
- 模板定义/实例精确匹配结果和 closure status；
- 新主 ID、两侧辅助 ID及各自冲突；
- 结构文件逻辑 locator、SHA-256、item 数和资源列表；
- 主体、场景和每个 item 的 Transform；
- 颜色十进制值和格式化的 `0xRRGGBB` 审阅值；
- 预计触及顶层字段 `4,6,8,27`；
- 明确声明 `field 9` 只按当前实现保持不主动修改；
- warnings、errors 和证据边界；
- `planHashAlgorithm` 和 `planHash`。

`blocked` 计划用于机器读取冲突和诊断，但不能在后续被 write 接受。只有没有错误、所有模板闭包完整、
所有显式 ID 当前空闲时才得到 `status=ready`。

### 10.3 确定性哈希

定义独立的 `hashPayload`，避免把环境噪声写入语义哈希：

包含：

- schemaVersion；
- source SHA-256 和 size；
- 规范化 assemblies；
- 模板匹配结果；
- 所有结构文件内容 SHA-256；
- ID 冲突结论；
- touched fields；
- status、warnings 和 errors 的稳定 code/field，不包含本地化 message。

排除：

- `planHash` 自身；
- 生成时间；
- 绝对路径、用户名、临时目录；
- 本地化文本；
- 非确定性遍历顺序。

canonical JSON 规则：对象 key 按 Unicode code point 排序，数组保持语义顺序，禁止 `undefined`、
`NaN` 和 Infinity，UTF-8 编码后计算 SHA-256。实现必须有固定向量测试；不能直接依赖普通
`JSON.stringify()` 的偶然构造顺序。

### 10.4 结构和配置漂移绑定

计划阶段记录：

- 资产配置文件内容 SHA-256；
- 每个结构 JSON 的内容 SHA-256；
- 解析后的规范化 assembly；
- 源 GIL SHA-256。

由于 `.ts` 配置可包含执行逻辑，仅配置文件哈希不足以描述语义；因此计划同时绑定文件哈希和规范化
结果。未来 plan 驱动 write 必须重新加载配置并同时比较两者。本计划只生成计划，不实现 write 接受
旧计划。

### 10.5 回归矩阵

| 变化                           | 预期                                          |
| ------------------------------ | --------------------------------------------- |
| 同一源 bytes、配置和结构       | plan bytes 与 planHash 完全一致               |
| 改变源 bytes                   | source hash 和 planHash 改变                  |
| 改变结构 JSON                  | structure hash 和 planHash 改变               |
| 改变解析后的 ID/Transform/颜色 | planHash 改变                                 |
| 只改变绝对目录位置             | hashPayload 和 planHash 不变                  |
| 多 assembly 配置顺序改变       | 视为语义顺序变化，planHash 改变               |
| 主 ID 冲突                     | `status=blocked`，退出非 0，不产生 ready plan |
| 任一侧辅助 ID 重叠             | `status=blocked`，列出全部冲突                |
| 模板定义/实例名称或引用不匹配  | `status=blocked`                              |
| `--output` 已存在              | 失败且不覆盖                                  |
| 仅执行 plan                    | 源 GIL 哈希、mtime 不变，无备份               |

### 10.6 完成门

```bash
npx tsx tests/static_assembly_plan.ts
npx tsx tests/cli_static_assembly_plan.ts
npm run build
```

HP-6 完成只证明计划可重现、冲突可发现和源文件只读；不证明候选已生成、地图已写回或游戏行为正确。

## 11. 集成顺序与合并门

工作包依赖：

```text
HP-1 配置路由 ───────────────┐
                              ├─→ HP-5 inspect ─→ HP-6 plan
HP-3 maps JSON ───────────────┤
                              │
HP-4 map index / closure ─────┘

HP-2 package exports 可与 HP-1/HP-3 并行，
但最终 package consumer 应覆盖 HP-5/HP-6 新 schema 和 CLI help。
```

建议合并批次：

### 批次 A：快速确定性缺陷

- HP-1 配置路由；
- HP-2 exports 与安装消费；
- HP-3 maps JSON。

批次 A 不接触静态拼装编码结果，也不读写真实地图。

### 批次 B：只读深模块

- HP-4 wire/index/closure；
- characterization test；
- 现有写入器复用共享原语但保持候选 bytes。

批次 B 如不能证明候选编码未漂移，不进入下一批。

### 批次 C：公开发现与计划

- HP-5 inspect；
- HP-6 plan；
- schemas、包导出、用户文档和模板文档同步。

每个批次独立运行 focused tests、`npm run build` 和 `git diff --check`，不要等到全部完成后一次排错。

## 12. 总体验收矩阵

| 能力                    | 验收                                                 |
| ----------------------- | ---------------------------------------------------- |
| 配置所有权              | 根配置与资产配置语义唯一，旧 alias 有明确迁移行为    |
| `.ts` / `.mjs` 资产配置 | 均通过公开 `bin/gsts.mjs` 加载                       |
| 编译配置严格性          | 普通编译不因新增 profile 被放宽                      |
| 发布包子路径            | 安装 tarball 后带 `.js` 导入无 `.js.js`              |
| 模板工具                | 从真实安装包运行，不访问兄弟源码仓库                 |
| maps JSON               | 稳定排序、按需 hash、默认不泄露路径                  |
| inspect                 | 输出模板、实例、Transform、闭包、占用 ID 和边界提示  |
| inspect 只读            | 源 hash/mtime 不变，无备份、无输出覆盖               |
| plan                    | 同输入得到相同 plan bytes 和 planHash                |
| 漂移                    | 源、结构、配置语义或 ID 变化使 planHash 改变         |
| 冲突                    | 主 ID、任一侧辅助 ID 或模板闭包问题生成 blocked 结果 |
| 多 assembly             | 顺序稳定、跨 assembly ID 重叠一次性完整报告          |
| 隐私                    | JSON/schema/测试快照无玩家目录和私人路径             |
| 证据边界                | 自动结构检查不表述为编辑器或游戏验证                 |

## 13. 全量验证命令

各工作包 focused 回归通过后运行：

```bash
npm run build
npx tsx tests/cli_static_assembly_config_routing.ts
npx tsx tests/static_assembly_package_consumer.ts
npx tsx tests/cli_maps_json.ts
npx tsx tests/static_assembly_map_index.ts
npx tsx tests/cli_static_assembly_inspect.ts
npx tsx tests/static_assembly_plan.ts
npx tsx tests/cli_static_assembly_plan.ts
git diff --check
```

是否运行 `npm test` 由实际影响面决定：如果配置 loader 或 `gsts.ts` 改动影响普通编译、dev 或注入命令，
完成前必须运行；若因环境或时间未运行，完成报告必须明确标为“未运行”。任何测试不得依赖真实玩家
目录、真实 mapId 或未经确认的游戏文件。

## 14. 文档和发布同步

功能实现后按实际完成范围更新，不提前宣传：

- `docs/docs/zh/doc/cli/commands.md` 及英文对应文档；
- `docs/docs/zh/doc/cli/config.md` 及英文对应文档；
- `docs/architecture/gil-static-model-assets.md` 的当前实现段；
- `create-genshin-ts/templates/start/README_ZH.md` 和英文 README；
- 模板 `AGENTS.md` / `CLAUDE.md` 中的安全工作流；
- `docs/documentation-map.md`，仅在公开推荐入口发生变化时更新；
- `docs/project-intelligence/contexts/static-gil-assembly-production.md`，仅记录已完成检查点；
- package exports 和 schema files 列表。

文档必须分别说明：

- 当前代码实现；
- 自动回归覆盖；
- 历史真实地图生产证据；
- 本批次未执行真实写回和游戏验证；
- inspect/plan 只读，不构成地图授权；
- closure complete 不等于模板兼容已证明。

## 15. 停止条件与风险控制

遇到以下任一情况立即停止当前工作包，不继续扩大实现：

1. 重构共享 wire reader 导致现有候选 bytes 或 SHA-256 非预期变化；
2. inspect 无法唯一识别模板名称、定义引用或两侧辅助闭包；
3. plan 为了稳定哈希需要忽略会影响候选语义的字段；
4. `.ts` 配置 profile 无法在不破坏 bigint/customVariables 的情况下安全序列化；
5. package consumer 只能通过导入仓库源码而不能通过 tarball；
6. 测试需要访问真实玩家地图或覆盖现有 GIL；
7. 发现当前 source/test 与既有生产证据冲突。

停止后应提交最小复现、影响范围和备选设计；不得以 warning 后继续、更新 golden 或关闭断言来通过。

## 16. 完成定义

本计划完成时，新项目应能够仅通过公开安装包完成：

```text
maps JSON → inspect JSON → 编写/确认资产配置 → plan JSON + planHash
```

并满足：

- 不导入 `dist/src/cli/*.js`；
- 不读取兄弟源码仓库；
- 不手写 raw-wire 模板/ID 扫描器；
- 不解析人类表格获取地图元数据；
- 不靠 shell 自行拼装结构/config/source 计划哈希；
- 全流程只读，不创建真实地图备份、不覆盖 `.gil`；
- 所有输出继续明确区分自动结构证据和编辑器/游戏验证。

下一阶段才能在该稳定 plan seam 上实施：

```text
plan-gated output → independent verify → explicit confirmation
→ source-hash-gated write → receipt → protected rollback
```

该下一阶段仍须单独设计、回归和用户确认，不能因本计划完成而自动获得真实地图操作授权。
