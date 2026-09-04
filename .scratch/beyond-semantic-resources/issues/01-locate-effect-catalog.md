# 01 — 定位并解析状态效果语义目录源

**What to build:** 找到「状态效果名目录」的真正来源，并打通 **效果配置 ID（1720001/2110001/2010001）→ TextMap hash → 中英文名** 的机器可读映射。
背景：GIL 只存效果 ID；编辑器本地 `Resource/Json/TextMap/CHS` 已确认为节点/枚举名（7743 条），**不含**状态效果名；
`assets.bin` 内层加密；主游戏数据在 blk。目标 = 不再靠用户口述逐个采集效果名，改为从文件一次性解析。

**候选路线（按成本，开工先做 A）：**
- A. 反编译 `BeyondEditor.dll`（混淆 .NET）→ 找效果目录加载器 / zip 密码 / 内嵌表；
- B. 运行时抓取：打开效果下拉时抓编辑器↔游戏 IPC 或进程内存明文目录；
- C. 主游戏数据：`YuanShen_Data/StreamingAssets/*.blk`（可结合社区工具 paimooon-YSRes / Ayaya_Miliastra_Editor）。

**Blocked by:** None — can start immediately。

**Status:** ⏳ open

**验收 checkbox：**
- [ ] 定位效果名目录来源（A/B/C 任一成功即算；记录证据路径）
- [ ] 建立 `effectID → TextMap hash → 中文名/英文名` 映射，至少覆盖已知三样本：
  1720001=移动速率调整率（动态）、2110001=定时触发技能、2010001=造物不可见
- [ ] 机器可读产物落盘（如 `resources/status_effect_names.json`），与编辑器/游戏显示对照 3/3 通过
- [ ] 回填 `docs/game-engine-knowledge/beyond-editor-semantics.md`（闭合 OPEN 项）
- [ ] 收轮三件套（勾票 + BOARD 前沿/划掉 + 精确 commit）

## 轮次记录（执行中追加）

- （票 00 知识落盘 2026-09-04：.mihoyobin 格式破解 + CHS TextMap 无效果名实证 + assets.bin 加密 + 三候选路线，
  详见 beyond-editor-semantics.md 与会话记录；差分实验快照 v21 保持不变，本票不碰 GIL）
- （票01 侦察轮 2026-09-04：BeyondEditor = .NET/WPF，由 YuanShen 以 `-autoConnect -sourcepid` 拉起；
  效果列表 UI 实际在原神主窗口，BeyondEditor 仅辅助窗口；loopback TCP 54562↔61165 存在，但关/开效果列表时不传名字/ID。
  Procdump/Handle 对 YuanShen 被反作弊挡；编辑器 Json 树 4098 文件无效果 ID 也无 TextMap 哈希；
  社区 AnimeGameData TextMapCHS 命中「造物不可见=1842178763/1272094579」「定时触发技能=3678006995」；
  尚未找到 effectID→hash 映射表，最大嫌疑 `assets.bin` 加密内层/游戏 blk；字符串解密器需 Windows .NET 运行。）
- （票01 A突破 2026-09-04：Windows 运行 BeyondEditor 字符串解密器，解出 `assets.bin` ZIP 密码 `G16F153D`；
  解开后内层仍为 ZIP，6453 个文件全部是 UI 图标 PNG，**不是效果映射表**；`beyondeditorassets.bin` 同为图标。
  另发现当前游戏 `.blk` 使用 `Blb\x03` 新容器（旧版为 `blk\0`），AssetStudio 2.4.1 可解析旧块但无法解析当前块；
  当前 `00/25539185.blk`（Excel 块）原始扫描命中 1720001/2010001，`00/24230448.blk`（BinOutput 块）命中 1720001/2110001，
  证明映射表在 Blb 块内，需当代 Blb 解包工具/逆向 Blb 格式。）
- （票01 2026-09-04 后段：Blb3 解包 + SerializedFile 解析成功；25539185/24230448/31049740 均解出；
  全量 MiHoYoBinData 原始搜索：Excel 命中 1720001/2010001，BinOutput 命中 1720001，未命中候选 TextMapHash；
  当前 7.0.0 不应 XOR 0x95。TextMapCHS/EN 已入仓库 data/animegamedata-cn7.0.0。）
- （票01 效果差分采集 2026-09-04：map 1073741918「差分实验」v22→v27，新增 2120001=调整动画速度、
  2130001=调整冷却时间、590001=禁用跳跃；连同旧样本写入 blb3/effect_samples.json。）
- （票01 隐藏目录深挖 2026-09-04：用 cmd.exe + Windows dotnet SDK 批量解密 BeyondEditor.dll 2826 条字符串，
  无效果名/ID/hash；发现 beyondEffectService/beyondRoleStatusService；类型反射 19 个关键词类型无直接命中。
  输出 DecoderOutput.txt/TypesOutput.txt 已入库。详见 HANDOFF-CONTEXT.md。）
- （票01 IPC 抓包/解包 2026-09-04：RawCap 重录 BeyondEditor 重连 IPC；确认 wire=4字节大端长度+HAblp信封+payload XOR 0xEA+protobuf；
  XOR 后 ~1.57MB 处命中 1720001/2110001/2120001/2130001/590001 varint；未在已解数据中找到候选 TextMapHash。
  证据：`evidence/2026-09-04-ticket01/ipc/PROGRESS-IPC.md`）
- （票01 IPC 阶段收口 2026-09-04：多次抓包（重连/效果目录/地图切换）确认 IPC 不含 TextMapHash；
  type1017 只含 effectID 列表；HAblp+XOR0xEA+protobuf 已解。复盘见
  `docs/game-engine-knowledge/retrospective-2026-09-04-ticket01-ipc-phase.md`；下一步主攻游戏静态 Blb/MiHoYoBinData。）
- （票01 静态数据/IL2CPP/.NET 轮 2026-09-04 续：确认 `/tmp/mhybins_255` 是误 XOR0x95 产物，原始 MiHoYoBinData 无 XOR；
  尝试 IL2CPP 静态还原被 MHY 加密 metadata 挡住；社区 MetadataConverter 不兼容 7.0.0；
  .NET 反编译+Windows 反射追到 OfficialRoleStatus/CustomRoleStatus 加载三元组
  `(10003,50004,51000)` / `(10003,50004,51001)`，但仍不是 TextMapHash。
  结论：BeyondEditor 本地不含 effectID→TextMapHash，映射应在游戏侧。证据：blb3/PROGRESS.md、beyond-editor-semantics.md。）

- （票01 官方角色状态线索 2026-09-04 用户提供：官方“角色状态/单位状态”预定义 ID 族为 10100002 起累加，如
  10100002=加速、10100003=火元素附着、…、10100017=水泡禁锢。
  TextMapCHS/EN 已命中部分名称 hash：加速=1810922115/3485169531、火元素附着=3178288891/1551895299、
  水泡禁锢=2381365875/823911139。Blb 255/242 原始对象与编辑器 .mihoyobin 未命中该 ID 族目录；
  仅一个 OfficialPrefab 含 10100006/07 作为组件配置。目录源仍待定位。）
- （票01 IPC type1017 重审 2026-09-04：用户给出官方状态 ID 族后，在 `catalog_decoded_type1017_*.bin` 发现
  **type1017 实为“状态/效果目录混合消息”**：含 10100002..10100017、10100101..10100116、1077936129/1077936130
  等状态 ID 列表；分片 field3 还带状态定义 blob（如“新建状态”、effect 结构）。
  这修正先前“type1017 只传 effectID 列表”的结论。下一步优先完整解析 type1017 状态目录结构。）
- （票01 完整抓包第二轮 2026-09-04：地图切换+多操作，pcap 2.96MB；type1017 尾部 25 快照。
  只解析到官方状态 10100002→effect[20001] 与两个自定义状态详情（1077936130/1077936131）。
  结论：**官方状态 10100003..10100017 的内部效果列表不在 type1017/IPC 中**；
  type1017 只给可用 ID 列表+当前编辑的自定义状态详情。下一轮主攻静态源。）
- （票01 静态源续查 2026-09-04/05：继续 Blb 静态源。
  1. 在 255/242/353/310 四个已解 CAB 中按 varint/u32/字符串搜索 10100002..10100017/10100101..10100116 → **0 命中**；
     效果 20001 有命中但状态→效果表未现。状态 ID 不在这几个主块的可读明文区。
  2. 其余 00 块多为 Oodle 压缩，Python 解包器无 Oodle native 解码，暂无法全量扫。
  3. 31049740 的 MiHoYoBinData 实为 **AssetIndex**（非仅类型名表）：开头 type_mapping_count=0x161，
     结构符合 parsers/ai.py AssetIndex；可据此做 block_id→asset 映射（需 path hash）。
  4. animeblkstuff map_helper.json（6.1，21% 覆盖）无 RoleStatus/Beyond 路径名；GI-StaticParser
     常数与该 CN7.0.0 构建不匹配（header-dump 报 could not locate embedded MHY header）。
  结论：官方状态 10100002.. 的静态宿主仍未定位；建议下一步用编辑器“打开官方状态详情/复制为自定义”抓 IPC。）
- （票01 官方状态→效果全量捕获 2026-09-05：通过 RawCap 多次“复制官方状态为自定义→保存→选中”最小差分，
  type1017 拿到 10100002..10100017 全部 effectIds：
  02=[20001](早前直接),03=[400001],04=[380001],05=[510001,2110001],06=[450001],
  07=[680001],08=[100001],09=[120001],10=[],11=[400007],12=[400003],13=[400004],
  14=[400006],15=[400005],16=[400002],17=[460001,380001]。
  机器可读：`resources/official_status_effects.json`、`evidence/.../ipc/official_status_copy_captures.json`。
  仍未定位 effectID→TextMapHash 映射；下一主攻含 effectID 的 242/255 MiHoYoBinData 对象。）
- （票01 AssetIndex 探索 2026-09-05：31049741 新版 AssetIndex 已解析；块组格式=6字节/条；
  但 sub_asset_id 不是对象 pathID，class1210 的 8hex→u32 映射表 schema 未闭；静态表名仍未定位。）
