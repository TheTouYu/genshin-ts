# 票01 交接：静态数据/IL2CPP/.NET/type1017 溯源（2026-09-04 压缩前）

> 本文件用于会话压缩后快速恢复票 01 上下文。先读 BOARD/issue/PROGRESS，再回这里补精确细节。
> 状态：票 01 OPEN；本轮收口“官方状态内部效果不在 IPC”，下一轮主攻游戏静态源。

## 当前目标（用户原话/意图）
- “完整找出这些功能（官方状态/自定义状态）和它们包含的效果、文本的位置和结构。”
- 票 01 验收：`effectID → TextMapHash → zh/en`，至少 1720001/2110001/2010001/2120001/2130001/590001；
  用户进一步补充：官方状态 10100002..10100017，每个状态包含一个或多个效果，如“造物不可见/定时触发技能”。
- 下一轮方向：**游戏静态源**（Blb/行表/运行时 metadata）。

## 上一轮完成
- 确认 CN7.0.0 MiHoYoBinData 原始内容**不需要 XOR 0x95**；旧 `/tmp/mhybins_255/*.bin` 是 `--xor 0x95` 产物。
- IL2CPP 静态还原被 `MHY\0` 加密 metadata 挡住；社区 MetadataConverter 不兼容 7.0.0。
- BeyondEditor .NET 反编译+Windows 反射追到 RoleStatus 加载三元组。
- IPC type1017 重审：是“可用状态 ID 列表 + 当前自定义状态详情”，不是“只含 effectID 列表”。
- 完整抓包第二轮（地图切换+多操作）证明：官方状态 10100003..10100017 内部效果不在 type1017/IPC。

## 关键精确细节

### ID / 映射锚点
- 官方状态 ID 列表（type1017 available）：
  `10100002..10100017`
  `10100101..10100116`
  自定义/大 ID：`1077936129, 1077936130, 1098907650, 1119879169, 1228931073`
- 用户提供官方名（已入 `resources/role_status_names.json`）：
  - 10100002 = 加速 / Accelerate
  - 10100003 = 火元素附着 / Pyro Elemental Application
  - 10100017 = 水泡禁锢 / Bubbly Prison
- TextMapCHS/EN hash：
  - 加速：1810922115 / 3485169531
  - 火元素附着：3178288891 / 1551895299
  - 水泡禁锢：2381365875 / 823911139
- 已知效果样本（`resources/status_effect_names.json`）：
  - 2010001 造物不可见 / Creation Invisible：1842178763 / 1272094579
  - 2110001 定时触发技能 / Trigger Skill on Timer：3678006995
  - 1720001 移动速度调整率（动态）：1475323595 / 2039318347
  - 2120001 调整动画速度：1739984627
  - 2130001 调整冷却时间：571354851
  - 590001 禁用跳跃：3885732523 / 196650779
- IPC 内抓到的“状态→效果”唯一官方锚点：
  `10100002 → effectIds [20001]`
- 自定义状态锚点：
  - 1077936130 “新建状态” effectIds [20001,100001,120001,540001]
  - 1077936131 “新建状态_1/新建标签(1)(2)” effectIds [2010001,2060001,2140001,2170001,2160001,400001,410001,420001]

### 路径 / 文件
- 看板：`.scratch/beyond-semantic-resources/BOARD.md`
- 票记录：`.scratch/beyond-semantic-resources/issues/01-locate-effect-catalog.md`
- Blb/静态证据：`.scratch/beyond-semantic-resources/evidence/2026-09-04-ticket01/blb3/PROGRESS.md`
- IPC 证据：`.scratch/beyond-semantic-resources/evidence/2026-09-04-ticket01/ipc/PROGRESS-IPC.md`
- IPC JSON：
  - `.scratch/beyond-semantic-resources/evidence/2026-09-04-ticket01/ipc/type1017_status_catalog.json`
  - `.scratch/beyond-semantic-resources/evidence/2026-09-04-ticket01/ipc/type1017_status_catalog_round2.json`
- 解析脚本：`.scratch/beyond-semantic-resources/evidence/2026-09-04-ticket01/ipc/parse_type1017_catalog.py`
- 角色状态名样本：`resources/role_status_names.json`
- 效果名样本：`resources/status_effect_names.json`
- 复盘：`docs/game-engine-knowledge/retrospective-2026-09-04-ticket01-static-data-round.md`
- Authority：`docs/game-engine-knowledge/beyond-editor-semantics.md`
- 技能：`.agents/skills/beyond-semantic-resource-reverse/SKILL.md`

### 游戏/编辑器路径
- 游戏根：`/mnt/e/ys/Genshin Impact Game/`
- Blb 块：`YuanShen_Data/Persistent/AssetBundles/blocks/00/`
  - 25539185（Excel）
  - 24230448（BinOutput）
  - 31049740（TypeMap）
- CAB 临时：`/tmp/blb3_test_255/out/CAB-36d5...`、`/tmp/blb3_test_242/out/CAB-53126...`
- 编辑器 Json：`/mnt/e/ys/Genshin Impact Game/BeyondAssets/BeyondAssistEditor/Resource/Json/`
- BeyondEditor.dll：`/mnt/e/ys/Genshin Impact Game/BeyondAssets/BeyondAssistEditor/BeyondEditor.dll`
- metadata：`/mnt/e/ys/Genshin Impact Game/YuanShen_Data/Managed/Metadata/global-metadata.dat`
- 主程序：`/mnt/e/ys/Genshin Impact Game/YuanShen.exe`

### 可用命令（精确）
- Blb/MiHoYoBinData 提取（无 XOR）：
  ```bash
  python3 .scratch/beyond-semantic-resources/evidence/2026-09-04-ticket01/scripts/blb3/extract_mihoyo_bin.py <CAB> <out> --xor 0
  ```
- type1017 分片解析：
  ```bash
  python3 .scratch/beyond-semantic-resources/evidence/2026-09-04-ticket01/ipc/parse_type1017_catalog.py \
    .scratch/beyond-semantic-resources/evidence/2026-09-04-ticket01/ipc/catalog_decoded_type1017_pos*.bin \
    --output <out.json>
  ```
- IPC HAblp 解码（近似，首个帧）：
  ```bash
  python3 .scratch/beyond-semantic-resources/evidence/2026-09-04-ticket01/ipc/decode_ipc.py <flow.bin> <prefix>
  ```
- RawCap 启动（Windows 管理员）：
  ```powershell
  Start-Process -Verb RunAs -FilePath "C:\temp\RawCap.exe" -ArgumentList "-s 600 127.0.0.1 C:\temp\ipc_full_round2.pcap"
  ```
- RawCap 停止：
  ```powershell
  Start-Process -Verb RunAs -Wait -FilePath "C:\Windows\System32\taskkill.exe" -ArgumentList "/F /PID <pid>"
  ```
- 从 pcap 提取 TCP 流（/tmp/extract_flow_generic.py，未入库，可按需重建）：
  ```bash
  python3 /tmp/extract_flow_generic.py <pcap> <portA> <portB> <out_a2b> <out_b2a>
  ```
- .NET delegate 反射（Windows 控制台项目 C:\temp\DelegateInspector）：加载 BeyondEditor.dll → RuntimeHelpers.RunClassConstructor → Delegate.Method。

## 已排除/不要重做
- 不要全盘重搜游戏目录；只用已知路径。
- 不要再用 XOR 0x95 解 CN7.0.0 MiHoYoBinData。
- 不要再用旧 MetadataConverter 解 7.0.0 MHY metadata（必失败）。
- 不要在 type1017 里继续找官方 10100003..10100017 内部效果（已证不在）。
- `assets.bin` 密码 G16F153D，内层只是 UI 图标，不是映射表。

## 下一步（具体）
1. 以“10100002 → 20001”为锚，在 242/255 Blb 原始对象里反查状态→效果表结构。
2. 若可行，运行时 dump 解密 `global-metadata.dat` 后走 Il2CppDumper。
3. 或用编辑器“复制官方状态为自定义/查看官方状态详情”再抓一次 IPC（用户若提供路径）。

## 待确认/开放
- 官方 10100002..10100017 完整中文名（用户尚未给全）。
- 10100101..10100116 的语义（未知，可能另一族官方状态）。
- 官方状态内部效果在游戏侧静态文件/内存中的确切位置。
