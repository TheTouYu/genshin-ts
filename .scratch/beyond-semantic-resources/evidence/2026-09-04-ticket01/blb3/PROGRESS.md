# Blb3 解包 / 序列化解析进度（暂停点快照）

> 时间：2026-09-04 会话中断前快照。目标：票 01 effectID → TextMapHash → 中英文名。
> 本文件只记当前可复现路径与下一步；长文梳理见会话正文。

## 已确认的物理文件与路径

- 当前游戏实际文件在 Linux 可读：`/mnt/e/ys/Genshin Impact Game/YuanShen_Data/Persistent/AssetBundles/blocks/`
- 关键块：
  - `00/25539185.blk`（25,125,177 B，`Blb\x03`）→ 首层解出 1 个 `CAB-36d5b592c9a82c093e5f435fb1dba561`（68,214,688 B）
  - `00/24230448.blk`（123,044,160 B，`Blb\x03`）→ 尚未运行/解析（BinOutput 块，raw 扫到 1720001/2110001）

## 已完成

1. `scripts/blb3/blb3_extract.py`（移植 AnimeStudio Blb3File）成功解 `25539185.blk`
   - 输出：`/tmp/blb3_test_255/out/CAB-36d5b592c9a82c093e5f435fb1dba561`
2. 该 CAB 不是 UnityFS Bundle，而是 Unity SerializedFile：
   - header：metadataSize=0xA235(41525), fileSize=0x0410DFA0, version=17, dataOffset=0xA250(41552), endian=0（小端元数据）
   - typeCount=3：classID 142 / 1210 / **1208(MiHoYoBinData)**
   - objectCount=2071，其中 **MiHoYoBinData object 2069 个**
   - 元数据已正确解析到 object info；object data 从 dataOffset 开始
3. MiHoYoBinData 对象格式：`u32 length + length bytes`；原始字节需 `^0x95`（沿用社区 `--xor_key 0x95`）才可能是可读 JSON/二进制
   - 抽查首对象：length=1594，XOR 0x95 后仍不像纯 JSON，可能本身是二进制 `.bin`（ExcelBinOutput 配置）

## 下一步（计划）

1. 把“序列化元数据解析 + MiHoYoBinData 提取 + XOR 0x95”写成正式脚本 `scripts/blb3/extract_mihoyo_bin.py`
2. 对 `25539185` 的 2069 个对象全部落盘，搜索：
   - effectID：1720001 / 2110001 / 2010001
   - TextMapHash：1475323595 / 2039318347 / 1842178763 / 1272094579 / 3678006995
3. 若 25539185 未命中，再解 `24230448.blk`（BinOutput）并重复
4. 命中后建立 `effectID → TextMapHash → zh/en` 映射；TextMap 已备好：
   - CHS/EN 已入仓库数据目录 `data/animegamedata-cn7.0.0/`

## 相关发现（TextMap 侧）

- TextMapCHS/EN 来自 `DimbreathBot/AnimeGameData` CN 7.0.0 commit `26df1df`
- 已确认中英文：
  - 2010001 候选：造物不可见 / Creation Invisible（hash 1842178763、1272094579）
  - 2110001 候选：定时触发技能 / Trigger Skill on Timer（hash 3678006995）
  - 1720001 候选：移动速度调整率（动态）/ Movement SPD Adjustment Rate (Dynamic)
    - 候选 hash：1475323595、2039318347（两个重复文案）
- 注意：用户原话是“移动速率调整率（动态）”，TextMap 中是“移动速度调整率（动态）”，需在编辑器/游戏核验确认是否同义/是否另一条未命中文案
- ManualTextMapConfigData 中不含上述三个 hash → 不是编辑器手工符号表，而是游戏运行时直接引用的 TextMap

## 临时产物（可清理/可迁移）

- `/tmp/blb3_test_255/out/CAB-...`（66 MB 序列化文件，可重生成）
- `/tmp/remote_candidates/`、`/tmp/remote_beyond_bin/`（AnimeGameData 抓取的候选 JSON，均已源自有据可查）
