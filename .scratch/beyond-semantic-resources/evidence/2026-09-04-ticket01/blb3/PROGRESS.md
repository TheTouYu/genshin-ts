# Blb3 解包 / 序列化解析进度（暂停点快照）

> 时间：2026-09-04 会话中断前快照。目标：票 01 effectID → TextMapHash → 中英文名。
> 本文件只记当前可复现路径与下一步；长文梳理见会话正文。

## 已确认的物理文件与路径

- 当前游戏实际文件在 Linux 可读：`/mnt/e/ys/Genshin Impact Game/YuanShen_Data/Persistent/AssetBundles/blocks/`
- 关键块：
  - `00/25539185.blk`（25,125,177 B，`Blb\x03`）→ Excel 块
  - `00/24230448.blk`（123,044,160 B，`Blb\x03`）→ BinOutput 块
  - `00/31049740.blk`（35M，`Blb\x03`）→ AssetIndex / TypeMap 块

## 已完成

1. `scripts/blb3/blb3_extract.py`（移植 AnimeStudio Blb3File）成功解三个块的首层 CAB：
   - 25539185 → `CAB-36d5b592c9a82c093e5f435fb1dba561`（68 MB）
   - 24230448 → `CAB-53126bc4d34ebc277960cf0c743cffbc`（405 MB）
   - 31049740 → `CAB-b7c4cf0ace19593dc42a2c4e19166493`（44 MB）
2. CAB 全部是 Unity SerializedFile（version=17, class 142/1210/1208）。
3. `scripts/blb3/extract_mihoyo_bin.py` 已能解析并提取 MiHoYoBinData：
   - 25539185：2071 对象 / 2069 MiHoYoBinData
   - 24230448：160131 对象 / 160129 MiHoYoBinData
   - 31049740：3 对象 / 1 MiHoYoBinData（类型名表，不是文件路径表）
4. **关键更正：当前数据不需要 XOR 0x95**（0x95 是旧社区版本用 key）。直接按 MiHoYoBinData 原始二进制搜索即可。
5. **2026-09-05 复核修正：`/tmp/mhybins_255/*.bin` 是误用 `--xor 0x95` 导出的文件，不是原始字节。**
   直接读取 SerializedFile 中 MiHoYoBinData 对象时，pathID=1059/1735 的原始字节（无 XOR）即含真实 effectID varint；
   脚本 `extract_mihoyo_bin.py` 已改为默认 `--xor 0`（CN 7.0.0 正确导出方式）。复核命令/结论记录在本次会话与后续脚本。

## 二进制搜索初步结果

- 25539185（Excel）原始对象中：
  - `1720001` varint 命中 pathID=1059（blob 23569 B，offset 1576）
  - `2010001` varint 命中 pathID=1735（blob 67180 B，offset 29023）
  - 未命中 2110001；未命中候选 TextMapHash（le/be/varint 均无）
- 24230448（BinOutput）原始对象中：
  - `1720001` varint 命中 pathID=23077、35403
  - 未命中 2110001 / 2010001 / 候选 TextMapHash
- 说明：3 个效果 ID 可能不在同一张表；TextMapHash 可能在其他块/其他对象/需进一步解码。

## 下一步（计划）

1. 判断 MiHoYoBinData 对象原始二进制是否需要二次解压/解密；
   当前原始数据整体不可读，少量 varint 命中可能是真实 ID 也可能只是巧合。
2. 尝试识别命中 blob 的真实表名（asset index / 社区映射 / 文件头结构）。
3. 定位 2110001：可能藏在 25539185 之外的其它块，或需要正确的二次解码。
4. 命中后建立 `effectID → TextMapHash → zh/en` 映射；TextMap 已备好。

## 相关发现（TextMap 侧）

- TextMapCHS/EN 来自 `DimbreathBot/AnimeGameData` CN 7.0.0 commit `26df1df`
- 已确认中英文：
  - 2010001 候选：造物不可见 / Creation Invisible（hash 1842178763、1272094579）
  - 2110001 候选：定时触发技能 / Trigger Skill on Timer（hash 3678006995）
  - 1720001 候选：移动速度调整率（动态）/ Movement SPD Adjustment Rate (Dynamic)
    - 候选 hash：1475323595、2039318347
- 注意：用户原话是“移动速率调整率（动态）”，TextMap 中是“移动速度调整率（动态）”，需在编辑器/游戏核验确认。

## 临时产物（可清理/可迁移）

- `/tmp/blb3_test_255/out/CAB-...`
- `/tmp/blb3_test_242/out/CAB-...`
- `/tmp/blb3_test_310/out/CAB-...`
- `/tmp/mhybins_255/`（Excel MiHoYoBinData 全量 2069 个，72MB，可重新生成；**注意现存文件是 `--xor 0x95` 产物**，如需原始字节请用 `--xor 0` 重新导出）

## IPC 抓包进展（2026-09-04，同票）

- RawCap 重新录制 BeyondEditor 重连 IPC：见 `../ipc/PROGRESS-IPC.md`
- 已确认 wire：4字节大端长度 + HAblp 信封 + payload 固定 XOR 0xEA + protobuf
- XOR 后数据在 ~1.57MB 处命中 1720001/2110001/2120001/2130001/590001 varint
- 未在已解数据中找到候选 TextMapHash；需继续解析 protobuf schema/抓下拉小消息

## 票01 .NET IL 深挖新增（2026-09-04 续）

- 用 ilspycmd + dnlib + Windows 反射确认：
  - `CustomRoleStatus=1900` / `OfficialRoleStatus=2000` 的加载器实际是 delegate 链；
  - `OfficialRoleStatus` → 参数三元组 `(10003, 50004, 51000)`
  - `CustomRoleStatus` → 参数三元组 `(10003, 50004, 51001)`
- 该三元组被 `IxxdqjiYXvUxMvfd5Mwm` 静态字典登记为：
  - key 2 → [10003, 50004, 51000]（Official）
  - key 3 → [10003, 50004, 51001]（Custom）
- 证据：`OOZNfNKM3d3pQx6knhPM.f2VPU0KMAFsCU60ufwiU` 内 `Pe0K1rjVuV1`/`YyJK1nFwP3T`；
  Windows DelegateInspector 输出见 `work/ticket01-effect-catalog-dotnet/notes/`（本地，未提交）。
- 含义：这是 BeyondEditor 内部“资源分类 ID”，不是文件路径/TextMapHash；
  BeyondEditor 本地仍不含 `effectID→TextMapHash`，映射应在游戏侧（IPC 服务/IL2CPP/静态 Blb）。

## 2026-09-05 续查（静态源）

- 已解块全量 ID 扫描：255/242/353/310 均未见 10100002/10100003/10100017/10100101/10100116
  （varint/u32le/u32be/u64le/十进制字符串均试）。
- 31049740 的 MiHoYoBinData 实为 AssetIndex（type_mapping_count=0x161），非“仅类型名表”。
- 其他 00 块（00793419/04609653/10654466/11505437/15220321/16511091/10207571）为 Oodle 压缩，
  本 Python 解包器不支持；只有 35323818(Lua) 与已解 255/242/310 可读。
- animeblkstuff map_helper.json（6.1）无 RoleStatus/Beyond 资产路径；GI-StaticParser 常数不匹配本 CN7.0.0。
- 下一步候选：编辑器“打开官方状态详情/复制官方状态为自定义”抓 IPC，或解决 Oodle native 解码后扫 00 全块。

## 2026-09-05 Asset Index 31049741 解析（当前进展）

- 31049741.blk 可解，MiHoYoBinData 为**新版 AssetIndex**：type_mapping_count=0、asset_count=238780。
- 块组格式与旧版不同：`block_group` 条目是 `u4 block_id + u2 flags`（6 字节/条），旧版是 7 字节。
- 解析后 536 个 block_infos；asset 记录包含 path hash + sub_asset_id，但 sub_asset_id 是容器分组，**不是对象 pathID**。
- SerializedFile 内 class 1210 含 2069/160129 条“8 位 hex 键 + 两个 u32”的映射表，疑似 AssetBundle container/name-hash 映射，schema 未闭合。
- 结论：AssetIndex 只能定位 block，不能直接回答“255 内 pathID 849 是哪张表”；还需解 class 1210 或换用 AssetStudio 的 asset name 导出。
