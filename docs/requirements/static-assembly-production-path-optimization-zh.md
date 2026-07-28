# 静态拼装生产路径优化需求：从分面模型结构到游戏验证

> 文档类型：真实生产复盘后的优化需求
> 来源项目：《星序方枢》2×2 分面着色角块资产
> 日期：2026-07-29
> 状态：部分完成
> 目标读者：Genshin-TS CLI、GIL 资产工具、项目模板与文档维护者
>
> 2026-07-29 检查点：P0 配置路由、只读 inspect、确定性 plan，以及原 P2 中的 maps JSON 和包导出
> 回归已经按
> [`static-assembly-high-priority-implementation-plan-zh.md`](static-assembly-high-priority-implementation-plan-zh.md)
> 完成。P1 的 plan-gated write、独立 verify、source-hash 写入门禁、receipt/rollback，以及其余 P2
> 生成器和可视化仍未实现，不能因只读计划完成而视为已获得写回授权。

## 1. 文档边界

本需求不重新定义已经实现的静态拼装能力。当前实现、颜色编码、严格 JSON 结构文件、生产验证范围和安全边界分别以以下文件为准：

- [`src/cli/assets_static_assemblies.ts`](../../src/cli/assets_static_assemblies.ts)
- [`src/cli/gil_static_assemblies.ts`](../../src/cli/gil_static_assemblies.ts)
- [`src/cli/static_assembly_structure.ts`](../../src/cli/static_assembly_structure.ts)
- [`docs/docs/zh/doc/cli/config.md`](../docs/zh/doc/cli/config.md)
- [`docs/architecture/gil-static-model-assets.md`](../architecture/gil-static-model-assets.md) §19.2
- [`knowledge/validation-evidence/static-assembly-production-evidence.md`](../../knowledge/validation-evidence/static-assembly-production-evidence.md)

此前“能力公开化、颜色契约和结构文件”的需求背景见《星序方枢》项目中的 `docs/REQUIREMENTS_GSTS_STATIC_ASSEMBLY_DISCOVERABILITY_ZH.md`；对应 P0/P1 主体已由当前 Genshin-TS 实现完成。本文只记录下一轮真实端到端使用中仍然出现的阻碍。

本次路径的证据层级为：

1. 结构生成与严格加载器自动检查通过；
2. 离线候选生成和独立闭包回扫通过；
3. 用户确认具体目标、哈希、ID、影响和回滚后执行真实写回；
4. 自动备份、写后哈希和闭包回读通过；
5. 用户在游戏内反馈效果良好。

这次结果证明该路径在本次地图、模板、长方体资源、8 个三装饰物角块和本次颜色/Transform 配置中成功，不推广为任意地图、模板、资源、材质、数量或布局兼容。

## 2. 本次真实路径

```text
参数化生成 8 份严格 JSON 角块结构
→ Genshin-TS 严格结构加载
→ 定位最新地图
→ 只读扫描模板定义/实例、已有名称、场景 Transform 和占用 ID
→ 生成地图相关临时配置
→ 输出离线候选
→ 独立回扫主定义/实例及两侧辅助闭包
→ 展示目标、源/候选哈希、ID、影响字段和备份策略
→ 用户明确确认
→ 源哈希门禁
→ --write 自动备份并写回
→ 写后哈希与候选一致性检查
→ 写后独立闭包回读
→ 用户编辑器/游戏验证
```

路径本身成功，但多个步骤依赖项目侧一次性脚本和对内部 wire 结构的了解。优化目标不是减少安全门，而是把这些门变成正式、可发现、可复用、失败关闭的产品能力。

## 3. 优先级总览

| 优先级 | 工作包                         | 主要收益                                 |
| ------ | ------------------------------ | ---------------------------------------- |
| P0     | 修复子命令 `--config` 参数冲突 | 恢复公开 CLI 对独立资产配置文件的可用性  |
| P0     | 增加静态拼装只读 inspect/plan  | 消除手写 raw-wire 扫描与 ID/模板猜测风险 |
| P1     | 不可变计划与源哈希写入门禁     | 保证“审阅的候选”就是“实际写入的候选”     |
| P1     | 内置候选/写后闭包验证          | 将一次性独立回扫变成正式证据输出         |
| P1     | 正式回滚入口与回滚收据         | 缩短失败恢复路径，避免手工覆盖错误文件   |
| P2     | 结构脚手架与生成器接口         | 降低多变体、分面着色资产的重复工作       |
| P2     | `maps`/inspect 机器可读输出    | 让项目工具和 Agent 安全消费地图元数据    |
| P2     | 包导出与诊断脚本兼容回归       | 避免已发布子路径被解析成 `.js.js`        |
| P2     | 场景摆放摘要与可视化辅助       | 降低候选正确但进游戏找不到/重叠的风险    |

## 4. P0：必须优先解决

### P0-1：修复 `gsts assets:static-assemblies --config` 的双重消费

#### 现场表现

使用公开入口并传入独立资产配置：

```bash
gsts assets:static-assemblies --config /tmp/asset.config.mjs --gil source.gil --output candidate.gil
```

命令在进入资产子命令前被外层配置加载器拦截，报错：

```text
[error] config must provide compileRoot, entries, outDir
```

临时配置实际包含这些字段。直接调用发布包内部 `assets_static_assemblies.js` 后，同一配置和参数可以成功生成候选。这说明根因在公开 CLI 的全局 `--config` 与子命令 `--config` 参数所有权/转发，而不是配置内容或 GIL 结构。

#### 需求

- Commander 根命令与 `assets:static-assemblies` 不得同时含义不同地消费同一个 `--config`。
- 公开入口必须完整转发独立资产配置路径给 `runAssetsStaticAssemblies`。
- 统一配置加载器，避免根层先按编译配置校验、子命令再自行导入。
- 错误信息必须显示最终解析的配置绝对路径和缺失字段，而不是泛化为配置无效。

#### 验收

- `.ts` 与 `.mjs` 独立配置均能通过公开 `gsts assets:static-assemblies --config ...` 使用。
- 不需要调用 `dist/src/cli/*.js` 内部路径。
- 添加 CLI 集成回归，真实经过根命令参数解析，而不是只调用 `runAssetsStaticAssemblies()`。
- `--config` 在 help 中只有一个明确语义，或拆分为不冲突的 `--asset-config`。

### P0-2：提供受支持的只读 `inspect` 与确定性 `plan`

#### 现场表现

为了构造安全配置，本次必须自行解析 wire 数据以获取：

- 模板定义 ID、模板实例 ID和准确名称；
- 当前主定义、主实例、定义侧辅助和实例侧辅助 ID；
- 已有实例的定义引用；
- 已有对象的场景位置，用于避免重叠；
- 拟用 ID 是否空闲。

当前创建器会在应用时拒绝冲突，但没有面向用户的只读发现/规划接口。用户因此被迫在“手填未知 ID”与“写一次性内部解析器”之间选择。

#### 需求

建议提供两个明确阶段：

```bash
gsts assets:static-assemblies inspect --map-id <id> --format json
gsts assets:static-assemblies plan --config <file> --map-id <id> --output <plan.json>
```

`inspect` 至少输出：

- 地图标识、来源路径的脱敏显示、大小和 SHA-256；
- 自定义元件定义：ID、名称、装饰物数量；
- 场景实例：实例 ID、定义 ID、名称、Transform；
- 四类相关 ID 集合或压缩范围；
- 可作为模板的候选及“不保证兼容”的边界提示。

`plan` 至少输出：

- 解析后的每个 assembly；
- 模板定义/实例匹配结果；
- 新主 ID 和两侧辅助 ID 冲突结果；
- 每个结构文件的 SHA-256、item 数和资源列表；
- 场景 Transform；
- 源地图哈希；
- 预计触及的顶层字段；
- 计划内容哈希。

#### ID 建议边界

工具可以输出“当前扫描范围内的空闲候选”，但不得静默自动决定并写入。建议值必须：

- 标为 proposal；
- 绑定源地图哈希；
- 在 plan 和 write 两阶段重复做冲突检查；
- 允许用户显式接受或覆盖；
- 不宣称是编辑器全局 ID 分配协议。

#### 验收

- 用户无需读取内部 wire schema 即可完成模板和 ID 规划。
- JSON 输出稳定、有公开 schema，并可供项目生成器/Agent 使用。
- inspect/plan 均不修改源文件。
- 同一源哈希和配置产生确定性计划哈希。

## 5. P1：安全生产闭环

### P1-1：不可变计划、候选与写回绑定

#### 现场表现

本次采用人工流程保证一致性：先输出候选并审阅哈希，确认后在 shell 中自行检查源 SHA-256，再重新运行 `--write`，最后确认写后目标与先前候选哈希一致。

当前 CLI 的 `--output` 和 `--write` 是两次独立重算，没有产品级对象把“已审阅计划/候选”与“被写入内容”绑定。

#### 需求

- `plan` 生成不可变计划文件和内容哈希。
- 增加 `--expect-source-sha256`，源文件变化时在备份前失败关闭。
- 写入接受 `--plan <file> --plan-hash <hash>`，并重新验证配置、结构文件和源哈希。
- 可选增加 `--expect-candidate-sha256`，保证重新生成结果与审阅候选一致。
- 任一漂移都要求重新 plan 和确认，不允许警告后继续。

#### 验收

- 修改源地图、结构 JSON、配置或 ID 任一项都会使旧计划失效。
- 写回日志明确输出 `planHash`、`sourceSha256`、`candidateSha256` 和最终 `targetSha256`。
- 安全门可自动回归，不依赖 shell 包装。

### P1-2：内置候选与写后闭包验证

#### 现场表现

CLI 当前输出摘要和哈希，但本次仍需要独立脚本确认：

- 新定义和实例各恰好一条；
- 名称正确；
- 两侧所有辅助 ID 存在；
- 多 assembly 串行应用后完整闭包仍成立；
- 写后真实文件与候选一致。

#### 需求

增加公开验证命令或 `--verify`：

```bash
gsts assets:static-assemblies verify --gil candidate.gil --plan plan.json --format json
```

验证范围至少包括：

- 主定义/实例唯一性与引用；
- packed ID 列表；
- 定义/实例辅助资源、owner/backlink 和名称；
- Transform 与颜色快照；
- `field 6` 登记闭包；
- 计划外顶层字段变化检测；
- 多 assembly 的 ID 不重叠；
- 写后文件与候选/计划哈希一致。

验证输出必须继续说明：结构通过不等于编辑器加载或游戏行为通过。

### P1-3：正式回滚命令和收据

#### 现场表现

CLI 会创建正确备份，但恢复仍需要用户手工找到文件并覆盖真实地图。路径、目标和哈希如果选错，可能造成二次损害。

#### 需求

```bash
gsts assets:static-assemblies rollback --receipt <receipt.json>
```

写回时生成收据，记录：

- 脱敏目标标识；
- 写前/写后哈希；
- 备份路径和备份哈希；
- plan hash；
- 时间；
- 工具版本。

回滚必须展示计划、检查当前目标仍等于该次写后哈希、再次要求显式确认并在恢复前备份当前状态。不得提供无门禁的“覆盖最新备份”。

## 6. P2：效率与可维护性

### P2-1：结构脚手架和多变体生成接口

本次 8 个角块共享几何参数，只改变三面组合和颜色。项目侧生成器可以完成，但公开工具缺少推荐模式。

建议：

- 提供 `schemas/static-assembly.schema.json` 的 `$schema` 最短相对路径示例；
- 提供结构 generator 示例，强调生成结果应提交、生成器应有 `--check`；
- 支持结构级 metadata 或 sidecar manifest 保存逻辑名称/生成来源，但不得写入未知 GIL 字段；
- 文档增加“主体 + 多个独立着色装饰物”的分面模型示例；
- JSON 中颜色仍是十进制时，在 preview 同时以 `0xRRGGBB` 输出，改善审阅性。

### P2-2：`gsts maps` 与 inspect 的机器可读输出

增加：

```bash
gsts maps --format json --include-hash
```

输出 mapId、修改时间、大小、SHA-256 和稳定的目标定位信息。默认文本输出可保留 `[recent]`，但 Agent/项目工具不应解析人类表格。不得把玩家目录等私人路径默认写入持久日志。

“最新地图”只能作为只读排序结果，不能自动等同于写回授权；真实写回仍需用户确认具体 mapId 和哈希。

### P2-3：修复发布包子路径的 `.js.js` 解析回归

本项目旧 GIL 诊断脚本通过发布包子路径导入带 `.js` 后缀的模块时，当前解析得到类似：

```text
genshin-ts/dist/src/injector/binary.js.js
genshin-ts/dist/src/cli/gil_extract_utils.js.js
```

导致 `ERR_MODULE_NOT_FOUND`。静态拼装主 CLI 不受影响，但诊断路径失效，迫使使用者绕到兄弟源码仓库内部路径。

需求：

- 明确包 exports 子路径约定是“调用方带 `.js`”还是“不带扩展名”；
- 保证模板附带工具与公开约定一致；
- 添加从真实安装包运行模板 `tools/` 的消费回归；
- 错误不得悄悄回退到本地源码仓库。

### P2-4：场景摆放摘要与可视化辅助

preview/plan 应输出每个 assembly 的场景 AABB 或至少 position/scale 摘要，并可选检测与现有实例中心的近距离重叠。该检测只是启发式提示，不能替代编辑器观察。

可进一步输出简单的 OBJ/glTF/HTML 灰盒预览，但必须与 GIL 候选证据分开：离线可视化只验证几何意图，不证明编辑器坐标、材质、光照或运行时行为。

## 7. 建议实施顺序

### 第一批：P0 可用性

1. 复现并修复根 CLI/子命令 `--config` 冲突；
2. 为公开 CLI 增加端到端参数解析回归；
3. 实现只读 inspect JSON；
4. 实现绑定源哈希的 plan JSON 和计划哈希。

### 第二批：P1 安全闭环

1. `--expect-source-sha256`；
2. plan-hash 驱动写入；
3. 内置 verify；
4. 写回收据和受保护 rollback。

### 第三批：P2 开发体验

1. maps JSON；
2. 包子路径消费回归；
3. 多变体生成示例；
4. AABB/离线预览辅助。

## 8. 回归矩阵

| 场景                           | 预期                                   |
| ------------------------------ | -------------------------------------- |
| 根 CLI + 子命令独立 `--config` | 正确加载指定文件                       |
| `.ts` / `.mjs` 配置            | 均可用                                 |
| 源哈希漂移                     | 写前失败，零修改、零备份或明确无效收据 |
| 结构文件漂移                   | 旧 plan hash 失效                      |
| 主 ID 冲突                     | plan 与 write 均拒绝                   |
| 任一侧辅助 ID 冲突             | plan 与 write 均拒绝                   |
| 8 个 assembly 连续创建         | 候选闭包完整且 ID 不重叠               |
| `--output`                     | 源文件不变                             |
| `--write`                      | 先备份，目标等于候选，产生收据         |
| verify 候选                    | 输出结构证据和边界提示                 |
| rollback 时目标已漂移          | 失败关闭，要求重新审阅                 |
| npm pack 后模板诊断工具        | 无 `.js.js` 解析错误                   |
| maps JSON                      | 无需解析人类文本，默认不泄露私人路径   |

## 9. 非目标

本轮不要求：

- 推断任意 GIL schema；
- 自动证明任意模板/资源兼容；
- 自动选择真实地图并写入；
- 取消用户确认或备份；
- 把静态拼装与 GIA NodeGraph 注入合并；
- 宣称任意材质、符号纹样或运行时运动器已验证；
- 自动 update/delete 已有自定义元件。

## 10. 完成定义

本需求完成后，新项目应能仅通过公开 CLI 和文档完成：

```text
inspect → plan → output → verify → 人工确认 → hash-gated write → reread → 游戏验证
```

使用者不需要导入 `dist/src/cli/*.js`、读取兄弟源码仓库、手写 raw-wire 扫描器或用 shell 自行拼装关键哈希门禁。所有自动证据仍与编辑器加载和游戏验证分层报告。
