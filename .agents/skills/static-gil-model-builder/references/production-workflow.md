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

### 0A. 环境速查（省去路径探索，勿读源码找路径）

- 游戏目录由 gsts CLI 自动解析：China 区为 `AppData/LocalLow/miHoYo/原神/BeyondLocal/<player>/Beyond_Local_Save_Level/`（`player` 唯一时自动选，多账号才需配置）。不要读 `src/cli/gil_paths.ts` 源码、不要 `find /mnt`、不要找 gsts.config 确认——`maps`/`inspect`/`export` 直接可用。
- 地图列表/ID：`node ./bin/gsts.mjs maps --format json --include-hash`；写回前源 SHA 以 `sha256sum <实际路径>` 为准。**管道解析 JSON 时禁止 `2>&1`**（warning 走 stderr，合并会污染 JSON 流）；要丢弃 warning 用 `2>/dev/null`。
- 证据目录固定 `~/genshin-ts-evidence/static-assembly/`，按 `<模型>-v<n>` 建子目录；历史脚本只作模板线索，优先用下方标准模板。
- 足球几何生成器：`src/cli/static_assembly/football_geometry.ts` 的 `truncatedIcosahedron()`/`prismPanels()`/`basisToEuler()`，调用模板见 football-success-path.md「标准生产模板」，无需读源码；其它几何同样只写 item 列表，不手调欧拉角。

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
- **输出契约（2026-08-09 四轮评测实测 + preview 已修复）**：`--format json` 在 `plan`/`inspect`/`export` 和 preview 主路径均生效；preview 的 json 输出为 `gsts.static-assembly.preview` 对象（顶层 `mode`/`source`/`sourceSha256`/`assemblies[{name,prefabId}]`/`updates`/`categories`/`touchedTopLevelFields`/`candidateSha256`/`write`/`writePerformed`），json 模式下人类可读日志走 stderr、stdout 纯 JSON。text 模式（默认）输出 `key=value`。另外 bash 管道退出码取最后一个命令（`| head`/`| tail` 会吞掉 gsts 的退出码），判断命令成败用 `set -o pipefail` 或先跑命令再看 `$?`。
- 颜色格式（item 或 assembly 级 `color` 字段）：`{ enabled: true, rgb: <0xRRGGBB 十进制>, opacity: <0-100>, overlay: 'overwrite' | 'multiply' }`。纯黑 `0xFF000000`/纯白 `0xFFFFFF` 在足球等模型中已验证刺眼，使用 v2 已验收色（见 football-success-path.md）。
- `assets:entities export/import/patch`：`export` 回读 root 5 实体；`import` 从已有 definition 建实体；`patch` 改既有实体。候选一律 `--output` 新文件，写回用 `apply-candidate --expect-source-hash`。
- `assets:entities import` 完整用法（2026-08-09 第 4 轮评测实测）：实体 JSON 仅 `schemaVersion: 1` + `entities[]`，每项 `{ name, id, definitionId, position, rotation, scale }`（`id` 为场景实体 ID，`definitionId` 为刚写回的元件 definition ID）；命令 `assets:entities import --map-id <id> --entities <entity.json> --output <candidate.gil>` 生成候选，`apply-candidate` 写回后输出 `temp=` 即 Temp 已同步。**命令签名以本节/§3A/§9 为准，不要再 `--help` 或 grep 源码确认参数（2026-08-09 评测曾因 grep 源码浪费 26 个调用）**。
- 新地图 `maps:create` 骨架已预置空 root 4/8/27 段（2026-08-09 起），开箱支持 static-assemblies；旧骨架地图缺段会报 `unsupported GIL layout`。
- **编辑器活动目录 = `BeyondLocal/<player>/Temp/`（2026-08-09 实测）**：编辑器地图列表只读 `Temp/Beyond_Local_Save_Player.gip`，打开/保存 .gil 双写 Temp 与 `Beyond_Local_Save_Level/`；CLI 以 Save_Level 为准，但 `maps:create`/`rename`/写回已自动同步 Temp（`temp-sync=` 日志）并双写 gip。仅写 Save_Level 而不同步 Temp 时，编辑器列表看不到新地图（第一轮可见、第二轮不可见的根因）。
- 编辑器新建地图的 ID = Temp gip 最大 ID + 1，可能覆盖目录中未注册的同 ID .gil；因此 CLI 操作（创建/写回/注册）应在游戏关闭时进行——游戏运行中编辑器会用内存版 gip 覆盖磁盘注册。
- **看不到地图时**：完全退出游戏 → `gsts maps:resync --map-id <mapId>`（复制 .gil 到 Temp + 双写 gip 注册）→ 重开游戏。resync 输出 `temp=` 路径即同步成功；无 `temp=` 表示 Temp 目录不存在。

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

**structureFile 的 item 字段白名单（2026-08-09 评测实测）**：每项只支持 `resourceId` / `position` / `rotation` / `scale` / `color`（及组件字段）；自定义字段（如 `name`）会被 plan 拒绝。

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

**实体 import“问题→答案”速查（2026-08-09 四轮评测实测，别再去读源码）**：

| 问题 | 答案 |
|---|---|
| import 后实体回读是否携带 aux/装饰物引用？ | 是：`assets:entities export` 回读可见 auxIds（wire 层携带） |
| 游戏/编辑器渲染是否一定显示装饰物？ | 已修复并游戏核验（2026-08-10，见 §7）：import 自动复制 definition 的 instance-side aux 并双向挂接，实体装饰物完整显示且随实体缩放 |
| 报告能写什么结论？ | 可写“回读携带 aux + root diff 仅计划字段 + 游戏核验通过（1073741878 元件/实体双路径）” |
| 实体 Transform 在哪确认？ | `assets:entities export`（场景层），不要从 definition 的 transform 推断 |
| 实体换到 items 数不同的 def？ | import 只改 def 引用、**保留旧 aux**；先 detach 全部旧 aux 再 import（见 §7） |
| 新 prefab 只在候选、未写回，怎么生成实体候选？ | `--gil <prefab候选.gil>` 作为源 import；`--definitions-gil` 只补 root 4，缺 root 27 克隆记录 → 不完整候选（见上） |

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

**prefab 只在离线候选、尚未写回时，用 `--gil <prefab-candidate.gil>` 作为 import 源（2026-08-11 V5 实测）**：

```bash
node ./bin/gsts.mjs assets:entities import \
  --gil <prefab-candidate.gil> \
  --entities <entities.json> \
  --output <evidence>/entity-import.candidate.gil
```

源 GIL 同时提供 root 4 definition 和 root 27 instance-side aux donor，import 自动把 instance-side aux 克隆一套挂到实体（f502/f12 改为实体 ID），实体候选自带克隆记录——等价"先写回 prefab 再 import"两段流程的离线版（等角螺线 V4/V5 即用此法，克隆 aux 数 = 新 prefab items 数）。

**反例（勿再踩）**：`--map-id` + `--definitions-gil <candidate.gil>` 只补 root 4 definition，**不补 root 27**——import 能成功、实体 `auxIds` 也会写入（来自 definition 的 aux 槽），但实体候选里**没有 root-27 克隆记录**，是不完整候选。识别方法：候选 `inspect` 中 aux ID 出现次数为 1（仅实体 ID 列表；完整候选为 2 = ID 列表 + root27 记录），或 root diff 无 root 27 新增。V5 首版产物已存档 `entity-candidate-v5-incomplete.gil` 作对照。

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

**输出结构示例（2026-08-09 评测实测，字段名以此为准）**：

- `inspect --format json`：顶层含 `definitions[]`（每项 `id`/`packedIds`/`transform`）、`instances[]`、`auxiliaryIds` 等；候选 inspect 会包含地图全部既有闭包，**按新 prefabId 过滤**再数数量。
- `export --format json`：`assemblies[]`（每项 `items[]`，含 `resourceId`/`position`/`rotation`/`scale`/`color`）。
- `plan --format json`：顶层 `status`/`errors`/`conflicts`/`assemblies`/`planHash`；**没有 `itemCount` 字段**（不要 `d['itemCount']`）。
- `preview`（无子命令）：`--format json` 输出 `gsts.static-assembly.preview` 对象（见 §0A 输出契约）；text 模式输出 `key=value` 文本。

**标准回读断言脚本模板（复制即用，纯标准库）**：

```python
# python3 readback.py <export.json>；比较 item 用 float32 容差 1e-4，禁 numpy
import json, sys, math
items = json.load(open(sys.argv[1]))['assemblies'][0]['items']
def close(a, b, tol=1e-4): return all(abs(x - y) <= tol for x, y in zip(a, b))
# 逐面片断言示例：inner - surface >= 0.005
# 注意：heredoc 里写 python 时用绝对路径或 os.path.expanduser，不要在代码里写 $VAR（单引号 EOF 不展开）


需要确认未触及区域时才运行 root diff：

```bash
python .agents/skills/editor-incremental-gia-investigator/scripts/compare-gil-root-wire.py \
  <source.gil> <candidate.gil> \
  --max-records <enough-for-expected-delta> \
  --output <evidence>/root-wire-diff.json
```

新建自定义元件通常只改变 root `4/6/8/27`（prefab 步：root 4 +1 def / 6 ±1 登记 / 8 +1 inst / 27 +2×items aux；entity 步：root 5 +1 / 6 ±1 / 27 +items 克隆）。出现 root 之外的未知变化时停止解释。

diff 输出很啰嗦，用本 skill 附带的摘要脚本代替手写解析（V4/V5 实测，曾各花 7+/4+ 次解析调用）：

```bash
python3 .agents/skills/static-gil-model-builder/references/root-diff-summary.py <root-wire-diff.json> [--detail]
```

只核对 root 级别 added/removed 计数与 rootPresenceStable；**不要逐字节解释 root 6 内部记录**（±1 是登记组记录重写，V4 曾为此考古 16 个调用）。

不要用 `inspect-gil-prefab-material.py` 验证新增 prefab；它要求 before 已存在目标 definition/instance，失败是工具范围不匹配，不是候选证明。

## 7. 当前实现限制

### 已修复：实体 import 后装饰物丢失（2026-08-10 修复，游戏核验通过）

`assets:entities import` 从已有 definition 生成场景实体时，**带装饰物的元件在场景实体上装饰物丢失**：元件库里的原件（prefab）正常，但实体引用进场景后只剩主体无装饰物。四张评测图全部命中（2026-08-09 用户核验确认）。

**根因（2026-08-10 闭合）**：import 只写 root 5 实体记录 + root 6 登记，从不复制装饰物。真实样本（1073741862 足球）显示 definition 与实体**各有一套** instance-side aux（root27.f2，f502 owner=宿主）：definition 有 132 条、实体有 132 条，除 f1/f502/f12 外逐字节一致；而 definition 记录本身不带 f5{t=40} 挂接槽（挂接只存在于 root27），因此 import 生成的实体既无 f501 列表也无 27.2 aux 记录。

**修复**：`applyEntities` 生成实体时自动复制 definition 的 instance-side aux（root27.f2 中 f502=definitionId 的记录）并重挂：新 aux ID（root27 最大 ID+1 起）、f502/f12{f1} 改为实体 ID、实体 f5{t=40}.f50.f501 写新 aux ID 列表；更新既有实体时保留旧挂接槽（覆盖 definition 自带空 t=40 槽），重复 import 幂等。

**证据分层（2026-08-10 全部通过）**：
- 单测（`tests/gil_entities.ts`）：新建挂接/双向引用/更新幂等/无 aux 不挂——通过；
- 候选验证（1073741862 /tmp 副本）：root diff 仅 root 5（+1 实体）/root 6（+1 组条目）/root 27（+132 aux），其余 root 逐字节不变；132 条 clone 与 donor 除 f1/f502/f12 外逐字段一致——通过；
- **游戏核验（1073741878「装饰物元件测试」，2026-08-10 用户确认）**：新建元件（4 个装饰物：红主体/绿半透明五棱柱 Y90°/蓝三棱柱 Y-45°/黄薄片）+ import 实体整体 scale 2 倍——用户核验通过，实体装饰物完整显示、随实体缩放。元件与实体两条路径均验证。

### 已有地图增量添加新 prefab（2026-08-10 球门+足球地图实测）

`assets:static-assemblies` 不能更新已存在的 prefab 闭包：同 `prefabId` 会冲突，反复恢复骨架重建效率低且丢失用户编辑器改动。向已有地图**增量添加**新资产时：

1. 用**新 prefabId + 新 aux 区间**（def/inst 各一组、数量 = 新 items 数），不触碰既有闭包的 ID；
2. config 只含新 assembly；`plan` 基于当前地图（含既有闭包），`status=ready` 即表示无 ID 冲突；
3. 候选 = 完整地图 + 新闭包：回读确认**既有 def/inst 完整保留**、新 def/inst 各唯一一条；
4. 场景实体用 `assets:entities import`（def 引用新 prefabId）追加，既有实体不动；
5. 若用户已打开过编辑器保存，源 SHA 会变化——写回前以 `plan`/`sha256sum` 最新值为准，勿用旧 SHA 硬写。

### 实体换 def（换版本）时实体侧 aux 必须重建（2026-08-10 实测）

实体从旧 def 切换到 items 数不同的新 def（如足球 132 → 224）时，**`import` 更新既有实体只改 def 引用、保留旧挂接槽**（`carryAuxSlot` 设计：`if (!existing || readEntityAuxIds(existing).length === 0)` 才自动克隆新 def 的 instance-side aux）。后果：实体 `auxIds` 数量仍是旧 def 的 items 数，游戏显示旧装饰物残留/不完整。

**修复路径（一次性 tsx 脚本，勿循环 264 次 CLI）**：

1. 读当前地图 bytes；
2. 对目标实体 `exportEntities` 取 `auxIds`，逐个 `detachAux(bytes, entityId, auxId)`（`src/cli/static_assembly/patch.ts` 导出）；
3. 再调 `applyEntities({ bytes, definitions: wireRecords(parseWireMessage(bytes.slice(20,-4)), 4, 1), entities })`（此时实体无挂接 → 自动克隆新 def 的 instance-side aux、重挂 f502=f12=实体 ID）；
4. 写候选 → `assets:entities apply-candidate --expect-source-hash` 写回；
5. 回读断言：实体 `auxIds` 数量 = 新 def items 数，且 ID 落在 root27 新分配区间。

### 复用已验收资产：从真实地图导出闭包重建（2026-08-10 版本追溯教训）

structure 文件名（`prism-shell-v2`/`upgrade4`）不代表验收级；用户说“版本不对”时不要按 evidence 文件名猜，直接读用户核验过的真实地图：

```bash
node ./bin/gsts.mjs assets:static-assemblies export --map-id <核验过的mapId> --format json
```

取目标 assembly 的 `items[]`（含 resourceId/position/rotation/scale/color 全字段）写成 `structure.json`，即可在新地图重建同款闭包。这是“复用已验收资产”的可靠路径：几何、颜色、缩放逐字节来自真实闭包，不经过二次推导。

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
