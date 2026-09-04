# type1017 通用结构分析（票04 Round 1，2026-09-05）

> 数据来源：`/mnt/c/beyond-ipc/official_prefab_copy.pcap`
> （用户未按“复制官方预制体”提示操作；本次先按pcap实际内容做结构分析）

## 结论：type1017 不是仅“状态目录”，而是通用资源目录/定义消息

本次 pcap 抓到 29 个 type1017 帧，`availableIds` 合并后共 **2497 个资源 ID**，
定义条目 21 个。这与之前“状态复制”抓包（92 个状态 ID、11 个定义）明显不同，
说明 type1017 在当前上下文中下发的是**资源目录 + 被选中/物化资源的定义**。

已确认的 ID 分段：

| ID 段 | 数量 | 含义证据 |
|---|---|---|
| `1000000` / `1000001` | 2 | 默认模版 / 默认模版(角色编辑) |
| `1000xxxx` | 159 | 待登记（非官方实体） |
| `2000xxxx` | 2221 | 待登记（量大，疑为节点/蓝图/内部配置 ID 族） |
| `3000xxxx` | 93 | 官方实体/怪物：`30005001`=遗迹守卫、`30007001`=打手丘丘人 |
| `>=1077936129` | 22 | 自定义/编辑器资源 ID |

## 已确认的“官方实体 → 自定义资产”映射

- `30007001` → `BeyondMonster_030007001`，`nameTextMapHash=3424731047` → 打手丘丘人
- `30005001` → `BeyondMonster_030005001`，`nameTextMapHash=3332854583` → 遗迹守卫
- 自定义资产：
  - `1082130433` 打手丘丘人 → source `30007001`
  - `1082130434` 遗迹守卫 → source `30005001`
  - `1082130435..1082130443` 打手丘丘人 → source `30007001`
  - `1086324737..1086324745` 默认模版 → source `1000000`
  - `1090519041` 默认模版(角色编辑) → source `1000001`

对照静态表：`.scratch/.../beyond_excel/BeyondOfficialEntityExcelConfigData.json`
（`id=30005001/30007001`，`jsonName=BeyondMonster_*`）。

## type1017 protobuf 结构（已观察到）

```
top repeated field1 = 目录/页/集合
  field1 (msg)        = 页头 {2,3 两个 varint}（语义未定）
  field2 repeated     = 可用资源 ID 列表
                       条目 {2:1, 3:2, 4:assetId}
  field3 repeated     = 定义 blob
                       主体:
                         field1 (msg) = header {2:1, 3:2, 4:assetId}
                         field12(msg) = 摘要
                           直接子项:
                             field1(msg) -> field8 = sourceEntityId
                             field3(msg) -> field2 bytes = 名称
                         field11(msg) = 完整定义（仅部分资产下发）
                           直接子项/条目:
                             entry0: field1=assetId, field2=sourceEntityId,
                                     field6/7/8 repeated = 组件序列化,
                                     field9, field10 = 后续计数/版本
                             entry2: field1=assetId, field2=名称
```

## 完整定义的组件序列化形态（schema 未闭合）

`frame_017`（29KB）包含 `1082130433` 的完整定义：

- field11 entry0 有 `field6` 11 个、`field7` 12 个、`field8` 7 个组件条目；
- 每个组件条目形如 `{field1=componentTypeId, <fieldN>=payload}`；
  例如 `type1 -> field11`（含名称）、`type13 -> field22`、`type38 -> field48` 等；
- componentTypeId 的枚举含义尚未解出，需继续用编辑器反编译/组件类型表对照。

## 为什么现有解析器不适用

- `parse_official_copy_pcap.py` 把 field3 当作“状态定义”，把 field8/sourceEntityId
  当作 `effectIds`，因此对新 pcap 会误命名（输出`availableStatusIds`、`definitions`/`effectIds`）。
- 新增 `parse_type1017_generic.py` 改为安全提取：
  `assetId / names / sourceEntityId / full字段形态`，不再硬套状态 schema。

## 产物

- pcap：`/mnt/c/beyond-ipc/official_prefab_copy.pcap`（本机）
- type1017 原始 payload：`.scratch/.../ipc/prefab1017/frame_*.bin`
- 通用解析结果：`.scratch/.../ipc/type1017_generic_catalog.json`
- 旧状态基线对照：`.scratch/.../ipc/type1017_generic_official_status.json`

## 下一步候选

1. 对照 `BeyondEditor.dll` 反编译/组件类型表，解 field6/7/8 的 componentTypeId 含义。
2. 决定是否用同一 pcap 已有“完整定义”提炼 `sourceEntityId -> 组件/引用/参数` 半自动资源；
   若不够，再做一次**真正的最小操作**：复制官方实体/预制体为自定义 → 选中 → 抓 full field11。
3. 把通用解析器并入 runbook/SKILL，逐步替换状态专用假设。
