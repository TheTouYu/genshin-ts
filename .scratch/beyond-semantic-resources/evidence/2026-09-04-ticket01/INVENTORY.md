# 票01 资源清点（2026-09-04 阶段快照）

> 本文清点“定位效果语义目录源”至今的资产，供复盘/交接/继续使用。

## 已提交资产（git）

### 文档
- `.scratch/beyond-semantic-resources/BOARD.md` — 看板
- `.scratch/beyond-semantic-resources/issues/01-locate-effect-catalog.md` — 票记录
- `.scratch/beyond-semantic-resources/evidence/2026-09-04-ticket01/HANDOFF-CONTEXT.md` — 交接快照
- `.scratch/beyond-semantic-resources/evidence/2026-09-04-ticket01/blb3/PROGRESS.md` — Blb 解包进度
- `.scratch/beyond-semantic-resources/evidence/2026-09-04-ticket01/ipc/PROGRESS-IPC.md` — IPC 抓包/解包进度
- `docs/game-engine-knowledge/beyond-editor-semantics.md` — Authority 文档
- `docs/game-engine-knowledge/semantic-resource-inventory.md` — 票03 表地图
- `docs/game-engine-knowledge/retrospective-2026-09-04-beyond-semantic-resources-ticket01.md` — 早期复盘
- `resources/status_effect_names.json` — 已确认 6 样本部分映射

### 代码/脚本
- `.scratch/.../decoder/Program.cs` + `BeyondDecoder.csproj` — Windows 字符串解密器
- `.scratch/.../decoder/DecoderArgs.txt` / `DecoderOutput.txt` / `TypesOutput.txt` — 解密结果
- `.scratch/.../scripts/blb3/blb3_extract.py` + `crypto_blb3.py` + `extract_mihoyo_bin.py` — Blb3/SerializedFile/MiHoYoBinData
- `.scratch/.../scripts/*.py` — pcap/Json/搜索脚本
- `.scratch/.../ipc/decode_ipc.py` — HAblp+XOR0xEA+protobuf 解码器

### 技能
- `.agents/skills/context-loss-recovery/SKILL.md` — 防失忆技能（同会话多轮压缩支持）

## 本地未提交资产（已 gitignore 或 untracked）

### IPC 抓包/解码（在 `evidence/.../ipc/`）
- `ipc_re.pcap`（4.7MB）— 首次重连+效果面板
- `ipc_full_catalog.pcap`（1.1MB）— 完整目录重抓
- `ipc_mapswitch.pcap`（2.6MB）— 地图切换
- `flow_*` / `catalog_flow_*` / `mapswitch_flow_*` — TCP payload
- `decoded_type1022.bin`、`catalog_decoded_type1017_*.bin`、`mapswitch_decoded_*.bin` — XOR 后 protobuf

### ProcMon
- `procmon_ys_be.csv`（96MB）
- `procmon_scope_blk_mihoyo.csv`（2.5MB）
- 根目录 `Logfile.PML/CSV`（大型原始导出）

### 大体积社区语料（`data/animegamedata-cn7.0.0/`）
- TextMapCHS/EN、ManualTextMapConfigData、beyond_excel/beyond_candidates JSON（gitignore 大文件，本地保留）

## 当前结论（截至 2026-09-04 IPC 轮）

1. 已确认 IPC wire：4B 大端长度 + HAblp + payload XOR 0xEA + protobuf。
2. IPC 多次抓包均**不携带 effectID → TextMapHash**：
   - 首次连接/type1022 = 资源/图标/路径目录
   - type1017 = 当前对象状态效果/参数；目录抓包只给 effectID 列表
   - 地图切换 = type1022 资源目录
3. 已确认样本映射仍为 `resources/status_effect_names.json`（6 条）。
4. 下一步主攻方向：**游戏静态数据 Blb/MiHoYoBinData**，或先导出 type1017 effectID 全清单做反查。
