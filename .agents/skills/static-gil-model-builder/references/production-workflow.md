# 正式 CLI 生产工作流

从项目根运行命令。所有示例中的 ID、路径和 SHA 都是占位符，必须从当前目标读取，不能照抄历史值。

## 目录

0. CLI 速查（子命令与颜色格式）
1. 锁定地图与源哈希
2. 联合只读盘点
3. 资产配置与对象分流
4. 确定性计划
5. 生成不覆盖候选
6. 最小回读
7. 当前实现限制
8. 写回前展示并确认
9. 固定候选原子写回
10. 写后最小回读
11. 用户视觉核验

## 0. CLI 速查

`assets:static-assemblies` 子命令（`plan` / `inspect` / `export` / 默认 preview）：

```bash
node ./bin/gsts.mjs assets:static-assemblies plan \
  --asset-config <config.mjs> --map-id <mapId> --output <dir>/plan.json --format json
node ./bin/gsts.mjs assets:static-assemblies inspect --map-id <mapId> --format json
node ./bin/gsts.mjs assets:static-assemblies export --map-id <mapId> --format json
node ./bin/gsts.mjs assets:static-assemblies \
  --asset-config <config.mjs> --map-id <mapId> --output <dir>/candidate.gil
node ./bin/gsts.mjs assets:static-assemblies \
  --asset-config <config.mjs> --map-id <mapId> --write   # 直接写回（有 hash gate）
```

- `plan` 只算 ID 冲突/结构，不生成候选；`inspect` 读闭包身份；`export` 回读两层 Transform/颜色；preview 生成候选（`--output` 拒绝覆盖，`--write` 直接写回）。
- 颜色格式（item 或 assembly 级 `color` 字段）：`{ enabled: true, rgb: <0xRRGGBB 十进制>, opacity: <0-100>, overlay: 'overwrite' | 'multiply' }`。纯黑 `0xFF000000`/纯白 `0xFFFFFF` 在足球等模型中已验证刺眼，使用 v2 已验收色（见 football-success-path.md）。
- `assets:entities export/import/patch`：`export` 回读 root 5 实体；`import` 从已有 definition 建实体；`patch` 改既有实体。候选一律 `--output` 新文件，写回用 `apply-candidate --expect-source-hash`。
- 新地图 `maps:create` 骨架已预置空 root 4/8/27 段（2026-08-09 起），开箱支持 static-assemblies；旧骨架地图缺段会报 `unsupported GIL layout`。

## 1. 锁定地图与源哈希

```bash
node ./bin/gsts.mjs maps --format json --include-hash
```

按用户给出的地图名/ID选择唯一目标，记录：

```text
mapId / name / player / region
actual GIL path
size / mtime / SHA-256
```

多个同名目标、路径冲突或目标哈希变化时停止询问，不按“最近”自动选择。

## 2. 联合只读盘点

静态元件、实例和 aux：

```bash
node ./bin/gsts.mjs assets:static-assemblies inspect \
  --map-id <mapId> --format json
```

场景实体：

```bash
node ./bin/gsts.mjs assets:entities export \
  --map-id <mapId> --format json
```

ID 计划要联合两份结果：static inspect 的 `occupiedIds` 重点覆盖 root 4/8/27，但不能据此忽略 root 5 实体。复杂写回还要让正式 plan/候选闭包再次拒绝冲突。

简单保守策略：

- 新 prefab ID 避开当前 definition、instance 和 entity；
- 新 root 5 entity ID 取当前三类对象最大已用 ID 之后的空位；
- aux 从 inspect 给出的空闲区间选择，两侧数量都等于 items 数；
- 不跨地图复用“看起来空闲”的历史 ID。

## 3. 资产配置

小模型可内联：

```js
export default {
  assets: {
    staticAssemblies: [
      {
        name: '模型名',
        prefabId: NEW_PREFAB_ID,
        templatePrefabId: 10005018,
        templateInstanceId: 10005018,
        templateName: '空模型',
        position: [WORLD_X, WORLD_Y, WORLD_Z],
        definitionAuxiliaryIds: [DEF_AUX_1, DEF_AUX_2],
        instanceAuxiliaryIds: [INST_AUX_1, INST_AUX_2],
        items: [
          {
            resourceId: 10009001,
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1]
          },
          {
            resourceId: 10009004,
            position: [2, 0, 0],
            rotation: [0, 30, 0],
            scale: [1, 1, 1]
          }
        ]
      }
    ]
  }
}
```

复杂模型把几何放入 `structureFile`：

```js
{
  name: '复杂模型',
  prefabId: NEW_PREFAB_ID,
  templatePrefabId: 10005018,
  templateInstanceId: 10005018,
  templateName: '空模型',
  position: [0, 1, 0],
  definitionAuxiliaryIds: [...],
  instanceAuxiliaryIds: [...],
  structureFile: './complex-model.structure.json'
}
```

结构文件只保存 `schemaVersion: 1`、可移植 items/组件/颜色；地图绑定信息留在配置。输出和证据文件使用新目录，CLI 的 `--output` 会拒绝覆盖，失败后不要删除旧候选再冒充同一轮。

### 3A. 用户明确要求 root 5 场景实体

先判断是哪一种：

- **更新既有实体**：用 `assets:entities patch`；若目标是复杂 prefab 的三侧装饰物，转到下方“3B”，不要只 patch scene entity；
- **从目标已有 definition 新建实体**：用 `assets:entities import`；
- **全新复杂模型，definition/aux 都不存在**：默认回到 `assets:static-assemblies`。当前 import 不是完整静态闭包迁移器。

既有实体 patch 候选：

```bash
node ./bin/gsts.mjs assets:entities patch <entityId> \
  --map-id <mapId> \
  --position <x,y,z> \
  --expect-source-hash <sourceSha256> \
  --output <evidence>/entity-patch.candidate.gil
```

需要改 aux 时加 `--aux <existingAuxId>`；需要挂接时用 `--attach-aux <existingAuxId>`。这些命令只操作目标已经存在的 aux，不创建复杂装饰物闭包。

从已有 definition 新建实体的输入：

```json
{
  "schemaVersion": 1,
  "entities": [
    {
      "name": "场景模型",
      "id": 123,
      "definitionId": 456,
      "position": [0, 1, 0],
      "rotation": [0, 0, 0],
      "scale": [1, 1, 1]
    }
  ]
}
```

生成候选：

```bash
node ./bin/gsts.mjs assets:entities import \
  --map-id <mapId> \
  --entities <entities.json> \
  --expect-source-hash <sourceSha256> \
  --output <evidence>/entity-import.candidate.gil \
  --format json
```

`sourceDefinitionId` 可选择不同的转换来源；`--definitions-gil <donor.gil>` 只把 donor definition 补进**转换时的只读模板集合**，不会把 donor 的 root 4 definition 或 root 27 aux 闭包写进目标。目标缺少复杂模型闭包时不要靠它跨地图搬运。

实体候选至少回读：

```bash
node ./bin/gsts.mjs assets:entities export \
  --gil <entity-import.candidate.gil> --format json
```

确认 entity ID/名称/definition 引用、Transform、颜色、组件和 `auxIds`；再检查 root 6 的 type `200` 登记。固定候选最终仍使用后文同一个 `apply-candidate` 哈希安全门。

### 3B. 既有复杂 prefab/entity 的局部 patch

这是“调已有模型”的独立路径，不要用新的 `staticAssemblies` 配置伪装成更新：

1. 锁定源 GIL SHA，并保存 `assets:static-assemblies inspect` 的目标 closure 与 `assets:entities export` 的实体快照；
2. 从 definition packed IDs、prefab instance packed IDs 和 scene entity `auxIds` 各自读取真实记录；按 `resourceId`、owner/backlink 和实际挂接关系筛选目标，不按历史连续 ID 猜测；
3. 只替换目标字段。例如只调面片尺寸时保留 position、rotation、Y 厚度、颜色和未知字段；不要重新生成整条 aux 记录；
4. 若同一装饰物同时存在于 definition-side、prefab-instance-side、scene-entity-side，三侧同步 patch；只改一侧会让元件定义、实例和已放置实体视觉不一致；
5. 写入不覆盖的新 candidate，记录 `changedAuxRecords` 和每侧数量；对 candidate 做 closure、export、Transform/color/raw-diff 回读；
6. 取得本轮写回确认后，仍使用 `assets:entities apply-candidate --expect-source-hash`，不要绕过 hash gate 直接覆盖地图。

正式 CLI 的 `assets:entities patch --aux <existingAuxId>` 只对目标 entity 已存在的 aux 提供单条入口；它不会自动发现并同步 prefab 的两侧 aux。需要三侧一致时，使用同一套记录级 patch 逻辑生成独立候选，并把三侧回读写进验证脚本。

足球 v2 的真实样本：12 个五棱柱在三组 aux 列表中各 12 条，共同步 36 条记录；三角片 120 条保持不变。证据和哈希索引见 [足球成功路径](football-success-path.md)。

## 4. 确定性计划

```bash
node ./bin/gsts.mjs assets:static-assemblies plan \
  --asset-config <config.mjs> \
  --map-id <mapId> \
  --output <evidence>/plan.json \
  --format json
```

继续条件：

```text
status = ready
errors = []
conflicts = []
source.sha256 = 锁定源 SHA
itemCount = 预期
资源与两层 Transform = 预期
```

`closureStatus=official-resource` 表示正式官方骨架路径可生成，不表示该资源组合已经过目标地图游戏验证。

## 5. 生成不覆盖候选

```bash
node ./bin/gsts.mjs assets:static-assemblies \
  --asset-config <config.mjs> \
  --map-id <mapId> \
  --output <evidence>/candidate.gil \
  --format json
```

记录输出：源 SHA、候选 SHA、prefab ID、触及 roots 和 `writePerformed=false`。

候选应放在持久证据目录，例如：

```text
$GTS_EVIDENCE_HOME/static-assembly/<model>/<iteration>/
```

不要把会被后续结论引用的候选只放 `/tmp`。

## 6. 最小回读

身份和闭包：

```bash
node ./bin/gsts.mjs assets:static-assemblies inspect \
  --gil <candidate.gil> --format json
```

资源与 Transform round-trip：

```bash
node ./bin/gsts.mjs assets:static-assemblies export \
  --gil <candidate.gil> --format json
```

重点断言：

- 新 definition/instance 各唯一一条；
- definition/instance packed aux 列表数量正确；
- definition-side/instance-side aux ID 一一对应；
- item 资源、顺序、位置、旋转、缩放回读一致；
- 场景位置从 `export` 回读一致。

需要确认未触及区域时才运行 root diff：

```bash
python .agents/skills/editor-incremental-gia-investigator/scripts/compare-gil-root-wire.py \
  <source.gil> <candidate.gil> \
  --max-records <enough-for-expected-delta> \
  --output <evidence>/root-wire-diff.json
```

新建自定义元件通常只改变 root `4/6/8/27`。出现 root 之外的未知变化时停止解释。

不要用 `inspect-gil-prefab-material.py` 验证新增 prefab；它要求 before 已存在目标 definition/instance，失败是工具范围不匹配，不是候选证明。

## 7. 当前实现限制

### 官方模板逐 item 颜色能力

官方 resID 模板路径历史上曾生成 aux 却遗漏 `item.color`；当前工作树可能已有同步 definition/instance 两侧颜色的修复，但未提交改动不能直接当跨会话 Authority。每次需要颜色时走最小能力检查：

1. 在一个 item 配置非默认颜色；
2. 运行对应 focused regression；
3. 用候选 `export` 确认颜色不是 `enabled:false`；
4. 必要时定点确认 definition-side 与 instance-side 快照一致。

任一步不成立，就让本轮校准保持默认色并明确告知用户。不要只 patch instance-side aux，definition/instance 颜色快照会分裂。只有用户要求修复工具时，才按源码 red/green 流程修统一官方分支。

这是当前实现能力门，不是游戏引擎恒定规则；修复提交并完成候选/游戏验证后再提升证据状态。

### inspect 与 Transform

`inspect` 的职责是身份、packed ID 和闭包发现；对复杂或官方骨架场景 Transform，以 `export` round-trip 为准。两者冲突时报告工具 gap，不猜哪一个 UI 值正确。

### compatibility unknown

`compatibility=unknown` 是证据标签。只要候选闭包完整且目标就是做最小游戏校准，可以进入写回安全门；不能把它写成“兼容性已通过”。

## 8. 写回前展示并确认

模板：

```text
目标：mapId / 名称 / player / region / GIL path
当前源：size / SHA-256
候选：path / size / SHA-256
新对象：prefabId / entityId / aux ID ranges
Transform：场景层 + 局部样本摘要
修改：root 4/6/8/27（或实际集合）
命令：完整 hash-gated 命令
备份：目标同级 .gsts/backups/<map>.gil.<timestamp>.bak
回滚：经确认后用该备份恢复
```

用户必须针对展示的候选明确确认。此前“可以做模型”不替代看到候选哈希后的写回确认。

## 9. 固定候选原子写回

```bash
node ./bin/gsts.mjs assets:entities apply-candidate \
  --map-id <mapId> \
  --candidate <candidate.gil> \
  --expect-source-hash <source-sha256>
```

该入口会：

- 读取并核对源 SHA；
- 写前再次确认源未漂移；
- 创建同级自动备份；
- 以同目录临时文件 + rename 原子替换；
- 输出源/候选 SHA 和实际备份路径。

任何 SHA mismatch 都停止，重新盘点，不用旧候选硬写。

## 10. 写后最小回读

```bash
sha256sum <target.gil> <backup.gil> <candidate.gil>
node ./bin/gsts.mjs assets:static-assemblies inspect \
  --map-id <mapId> --format json
```

通过条件：

- target SHA = candidate SHA；
- backup SHA = 写前 source SHA；
- 新 prefab closure = complete；
- 没有残留临时文件或 CLI 错误。

随后立即通知用户重新加载地图。编辑器旧内存不会感知磁盘写回，直接保存会把旧状态覆盖回来。

## 11. 用户视觉核验

向用户提供布局词汇表：

```text
模型在哪个世界位置
哪一行/列是什么资源
哪个样本是零旋转 / Y 旋转 / X 侧翻
正确结果与明显错误分别是什么
```

收到截图后：

1. 只读图片尺寸和 SHA；
2. 对照候选，不重新扫描地图；
3. 区分定性视觉与数值回读；
4. 用 `capture-evidence.py` 保存不覆盖副本；
5. 更新最小 Authority。

截图或游戏失败时先判断：

- 整个 prefab 不可见：闭包/登记/目标地图兼容；
- 资源形状不对：resID/目标资源；
- 全部面统一转错：资源零旋转局部基；
- 只有个别面错：目标面基、顶点顺序或几何数据；
- 模型整体错位：场景 Transform 与 item 局部 Transform 混用；
- 用户保存后消失：旧编辑器内存覆盖写回。

先修统一根因，再生成一个新候选；不覆盖旧证据。
