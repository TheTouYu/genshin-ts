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

