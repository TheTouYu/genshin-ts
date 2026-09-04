# 语义资源表地图（Semantic Resource Inventory）

> 状态：已验证（容器解析与文件层盘点；主游戏 blk 内部未解析）
> 来源：2026-09-04 只读盘点（本地目录 + StreamingAssets 版本索引）
> 最近校验：2026-09-04
> 适用范围：BeyondAssistEditor 编辑器本地语义资源 + 主游戏 `YuanShen_Data/StreamingAssets` 有界清单

## 一句话结论

- 编辑器 `Resource/Json/` 下**全部 4098 个 `.mihoyobin` 文件**均通过「XOR 0xE5 → protobuf 顶层解析」，容器格式统一可解；
  但其中**未发现状态效果 ID（1720001/2110001/2010001）的 varint 命中**，也未发现效果名目录。
- 编辑器 Json 树比原看板多出 **`Beyond/Official/` 一族（3280 个文件）**，属此前资产速查遗漏。
- 主游戏 StreamingAssets 中，文件层可见的 Beyond/UGC 只有**音频 `AudioAssets/BeyondUGC/*.pck`** 与**视频 `VideoAssets/StandaloneWindows64/Cs_Beyond_Backstory_*.usm`**；
  真正的 UGC 配置/TextMap 大概率在 **`AssetBundles/blocks/*.blk` 哈希块内部**，需要索引/解包才能继续定位。
- 候选语义池（按票 01 优先级）：主游戏 blk 内部表 > `BeyondEditor.dll`/编辑器 `assets.bin` 加密内层。

## 编辑器 Json 树全量枚举

根：`<游戏安装>/BeyondAssets/BeyondAssistEditor/Resource/Json/`
总文件数：**4098 个 `.mihoyobin`**；无其他扩展名。

| 表族 | 路径 | 文件数 | 总字节 | 容器解析状态 | 疑似覆盖域 | 是否“ID→配置”目录表 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TextMap | `TextMap/<lang>/<hash>.mihoyobin` | 15 | 9,975,416 | ✅ 可解（既有 extractor） | 节点/pin/枚举/UI 文案（hash→文本） | 否（hash→多语文案） | 实际 15 语言：CHS/CHT/DE/EN/ES/FR/ID/IT/JP/KR/PT/RU/TH/TR/VI（原看板“18 语言”需更正） |
| Node | `Beyond/Node/<hash>.mihoyobin` | 799 | 1,215,105 | ✅ 可解（既有 extractor） | 节点定义（genericId/pin/名 hash） | 是（节点 genericId→定义） | 每节点一个文件 |
| BeyondGlobal | `Beyond/BeyondGlobal/<hash>.mihoyobin` | 1 | 56,029 | ✅ 可解（既有 extractor） | 枚举容器（102 枚举） | 是（枚举 ID→容器） | 单文件 |
| OfficialPrefab | `Beyond/Official/OfficialPrefab/<hash>.mihoyobin` | 2,484 | 801,753 | 🔶 容器可解，schema 未登记 | 官方预制体/资产模板 | 是（疑似 hash→prefab 定义） | 样本未见文案，含实体/组件树 |
| OfficialCompoundNode | `Beyond/Official/Blueprint/OfficialCompoundNode/<hash>.mihoyobin` | 656 | 86,326 | 🔶 容器可解，schema 未登记 | 官方复合节点蓝图/图定义 | 是（疑似 graph/blueprint 定义） | 样本含内部图/节点 ID，无文案 |
| Struct | `Beyond/Official/Struct/<hash>.mihoyobin` | 140 | 2,253 | 🔶 容器可解，schema 未登记 | 结构体/类型布局 | 是（疑似 struct 定义） | 文件很小（样例 16B） |
| ShortCutKey | `Config/JsonConfig/ShortCutKey/<hash>.mihoyobin` | 1 | 4,578 | ✅ 可解（嵌套字符串已读） | 快捷键/UI 键位配置 | 否 | 单文件内嵌多语言键名 |
| SynonymsLibrary | `Config/JsonConfig/SynonymsLibrary/{CHS,EN}/<hash>.mihoyobin` | 2 | 50,501 | ✅ 可解（嵌套字符串已读） | 编辑器搜索同义词库 | 否 | CHS/EN 各一文件 |

补充证据：
- 全量 4098/4098 个文件通过 XOR 0xE5 后 protobuf 顶层解析（临时校验脚本，只读）。
- 对效果 ID 1720001/2110001/2010001 以 varint 编码扫描全部 Json 文件：**0 命中**。
  1000001 在 BeyondGlobal/2 个 OfficialPrefab 中出现，与效果目录无关。
- `Resource/BeyondAssets/assets.bin`（230MB）与 `beyondeditorassets.bin`（6KB）均为 ZIP，内含**加密** `*.bin`，解析状态 🔒。
- 编辑器本地化目录（zh-Hans/de/fr/...）是 .NET satellite resource DLL，不属于语义资源表。

## 主游戏 StreamingAssets 有界清单

根：`<游戏安装>/YuanShen_Data/StreamingAssets/`（约 128GB，仅做有界文件层盘点，不解析大块内容）

| 项 | 实测 | 备注 |
| --- | --- | --- |
| 顶层目录 | AssetBundles / AudioAssets / Chroma / MiHoYoSDKRes / Persistent / SharpZipLib / VideoAssets / hdiff / kcp / xlua / xxhash | 主数据集中在 AssetBundles |
| `AssetBundles/blocks/` | 16 个编号目录（00–15），共 **1925 个 `.blk`** | 文件名均为数字哈希，无 Beyond/UGC 字面名 |
| 文件层 Beyond/UGC 命中 | `AudioAssets/BeyondUGC/`：24 个 pck（BeydBanks0-7/BeydMusic0-7/BeydStreamed0-7） | 音频资源，非语义表 |
| 文件层 Beyond/UGC 命中 | `VideoAssets/StandaloneWindows64/Cs_Beyond_Backstory_{Boy,Girl}.usm` | 过场视频 |
| 索引/版本文件 | `res_versions_streaming`（2487 行）、`data_versions_streaming`（533 行）、`silence_versions_streaming`（4 行）、`svc_catalog`（1721 行） | `res_versions` 中 BeyondUGC 仅 pck，无 TextMap/Excel/BinOutput 逻辑名；`data_versions` 无 beyond/ugc 命中 |
| 小 `.blk` | 根 `20527480.blk`、`VideoAssets/26236578.blk` | 是 `Blb` 元数据容器（内含 channelconfig/videoversions 文本），非 UGC 语义表 |

## 候选语义池

按“最可能装状态效果/技能/其他模块配置名”排序：

1. **主游戏 `AssetBundles/blocks/*.blk`（1925 个哈希块）** — ❌ 未挖
   - 理由：主游戏 Excel/TextMap/配置表通常打包在这些 Unity AssetBundle 块内；文件层看不到逻辑名，需要社区工具（如 paimooon-YSRes / Ayaya_Miliastra_Editor）或内部索引把逻辑路径映射到块。
   - 这是票 01 候选 C 的核心目标。
2. **`BeyondEditor.dll`（17.5MB）** — ❌ 未挖
   - 理由：可能内嵌/加载效果目录；票 01 候选 A。
3. **编辑器 `Resource/BeyondAssets/assets.bin` / `beyondeditorassets.bin` 加密内层** — 🔒 加密
   - 理由：ZIP 内层加密；若拿到密码/钥匙可能含编辑器剩余语义资源；票 01 候选 A/C 的旁路。
4. **`Resource/Json/Config/JsonConfig/SynonymsLibrary`** — ✅ 可解，但**不是效果名目录**
   - 仅搜索同义词（如“状态/效果/实体状态”），不映射 1720001 等效果 ID。

## 对既有文档的修正/增量

- `semantic-resource-pipeline.md` 的“当前已知表族盘点”缺 `Beyond/Official/` 三族，需回填。
- `BOARD.md` 资产速查缺 `Beyond/Official/`，TextMap 语言数需由“18”更正为“15”。
- 已确认：编辑器 Json 树全量 `.mihoyobin` 都是 XOR+protobuf 容器；效果 ID 不在其中。
