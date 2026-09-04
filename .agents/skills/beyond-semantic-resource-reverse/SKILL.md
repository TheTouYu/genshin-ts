---
name: beyond-semantic-resource-reverse
description: 定位 Beyond/千星编辑器与主游戏“数字 ID → 语义名/TextMapHash”目录源时使用。适用票 01、effectID→TextMapHash、状态效果名、BeyondEditor 语义资源、MiHoYoBinData、Blb3、global-metadata/IL2CPP、RoleStatus 资源分类三元组等场景；即使只提到“继续票01/效果目录/状态效果映射”也应触发。
license: MIT
compatibility: Requires Bash/Python/dotnet tooling; Windows dotnet SDK optional for .NET reflection.
metadata:
  user-invocable: "false"
---

# Beyond Semantic Resource Reverse

## 为什么有这个技能

票 01 已经反复证明：这个领域的坑不是“找不到文件”，而是“历史产物状态不可信”和“本地编辑器代码只能证明映射不在本地”。
本技能把已确认/已排除结论固化下来，避免新会话重复全盘搜索或重复踩 XOR/metadata 的坑。

## 入口（开工前必读，按顺序）

1. `.scratch/beyond-semantic-resources/BOARD.md` — 看当前前沿与票据状态
2. `.scratch/beyond-semantic-resources/issues/01-locate-effect-catalog.md` — 票记录/轮次
3. `.scratch/beyond-semantic-resources/evidence/2026-09-04-ticket01/blb3/PROGRESS.md` — Blb/MiHoYoBinData/IL2CPP/.NET 证据
4. `docs/game-engine-knowledge/beyond-editor-semantics.md` — Authority 文档
5. `docs/game-engine-knowledge/retrospective-2026-09-04-ticket01-static-data-round.md` — 本轮复盘

## 已确认事实（不要重做/不要推翻）

- 编辑器本地 `.mihoyobin` = XOR 0xE5 + protobuf；但**不含**状态效果名/effectID/TextMapHash。
- CN 7.0.0 的 MiHoYoBinData（SerializedFile class 1208）**不需要 XOR 0x95**。
  早前 `/tmp/mhybins_255/*.bin` 是 `--xor 0x95` 导出，不是原始字节；用 `--xor 0` 重导。
- `25539185.blk`（Excel）原始对象含 effectID varint（如 pathID 1059/1735）；但原始二进制仍不是可直接读的 JSON，疑似行表/二次编码，schema 未闭合。
- 主游戏 `global-metadata.dat` 是 `MHY\0` 加密头；Il2CppDumper 直接报 encrypted。
  社区 MetadataConverter 均为旧版，对 7.0.0 报 `file trimmed or string literal offset/count field invalid`。
- BeyondEditor .NET 反编译 + Windows 反射可解 delegate 链；RoleStatus 加载三元组：
  - OfficialRoleStatus → `(10003, 50004, 51000)`
  - CustomRoleStatus → `(10003, 50004, 51001)`
  这只是编辑器资源分类 ID，不是 TextMapHash。
- IPC type1022 含资源数字 ID + 中文标签目录；type1017 是**状态/效果目录混合消息**（不是“只含 effectID 列表”），
  含官方状态 10100002..10100017、10100101..10100116、自定义大 ID（1077936129 等）与 field3 状态定义 blob。
- **只读 type1017 不会下发官方状态详情**；但把官方状态“复制为自定义状态”后，type1017 会下发实体化后的完整定义。
  已用该方法拿到 `10100002..10100017` 全部 effectIds，结果见 `resources/official_status_effects.json`。
- type1017/IPC 不含 effect 显示名与 TextMapHash；名字仍走 TextMap/静态源。
- `assets.bin` ZIP 密码是 `G16F153D`，内层只是 UI 图标，不是映射表。
- 官方“角色状态/单位状态”预定义 ID 族约为 10100002 起累加（用户 2026-09-04 提供：
  10100002=加速、10100003=火元素附着、…、10100017=水泡禁锢）。
  TextMapCHS/EN 已命中部分名称 hash；Blb 255/242 与编辑器 .mihoyobin 未发现该族目录表。

## 推荐工作流

1. **先核对产物状态**：任何历史 `.bin`/`.dmp`/`.dat` 声称是“原始”时，直接回读源 SerializedFile/文件头确认；别拿旧导出当原始。
2. **先判断价值再抓包/反编译**：若目标是“找名字映射”，先确认该通道是否携带 TextMapHash；IPC 多次证明只带 ID。
3. **社区工具先看版本**：MHY metadata 解密工具多为 2022 年前；运行前先看 README/提交日期/目标版本，不兼容立刻停止。
4. **.NET 混淆 delegate 用 Windows 反射**：dnlib 找字段名 → Windows 小 console `RuntimeHelpers.RunClassConstructor` + `Delegate.Method` 拿真实方法名，比纯 C# 反编译快。
5. **本地代码只能证伪“映射不在这里”**：一旦追到资源分类 ID，应把该 ID 作为游戏侧 IPC/Blb/IL2CPP 的检索锚点。

## 可复用脚本与 runbook（已入库，不依赖 /tmp）

- pcap → type1017 一键解析：
  `.agents/skills/beyond-semantic-resource-reverse/scripts/parse_official_copy_pcap.py`
- HAblp 帧解码：
  `.agents/skills/beyond-semantic-resource-reverse/scripts/decode_ipc.py`
- type1017 分片目录解析：
  `.agents/skills/beyond-semantic-resource-reverse/scripts/parse_type1017_catalog.py`
- HAblp 类型直方图（任意 pcap 通用探针）：
  `.agents/skills/beyond-semantic-resource-reverse/scripts/summarize_hablp_pcap.py`
- type1017 通用资源目录/定义解析（不假设状态 schema）：
  `.agents/skills/beyond-semantic-resource-reverse/scripts/parse_type1017_generic.py`
- type1017 full field11 组件/节点/能力槽解析：
  `.agents/skills/beyond-semantic-resource-reverse/scripts/parse_type1017_full_components.py`
- IPC ↔ GIL 组件类型交叉校验：
  `.agents/skills/beyond-semantic-resource-reverse/scripts/cross_check_component_types.py`
- type1017 逐帧差分（同资产帧间结构 diff）：
  `.agents/skills/beyond-semantic-resource-reverse/scripts/diff_type1017_frames.py`
- type1017 → 官方实体映射资源构建：
  `.agents/skills/beyond-semantic-resource-reverse/scripts/build_official_entity_mapping.py`
- 一键处理管线（直方图+缓存+解析+映射+简报）：
  `.agents/skills/beyond-semantic-resource-reverse/scripts/process_type1017_capture.py`
- RawCap.exe：
  `.agents/skills/beyond-semantic-resource-reverse/tools/RawCap.exe`
- 通用官方资产抓取 runbook（预制体/实体/怪物/技能/蓝图等）：
  `.agents/skills/beyond-semantic-resource-reverse/runbooks/capture-official-assets.md`
- 官方状态专用 runbook（历史，保留）：
  `.agents/skills/beyond-semantic-resource-reverse/runbooks/capture-official-statuses.md`
- 结果资源：
  `resources/official_status_effects.json`

## 当前未闭合方向（供下一轮选）

- 用三元组 `(10003,50004,51000/51001)` 在游戏侧 IPC/静态数据反查。
- 获取解密后的 `global-metadata.dat`（运行时 dump）或同版本已解密文件后走 Il2CppDumper。
- 继续解析 Blb/MiHoYoBinData 行表 schema。
- 用同一“复制为自定义”物化探针扩展到 `10100101..10100116`、职业/技能/预制体等只读官方资产。

## 铁律

- 不重新全盘搜索游戏目录；只用已知路径。
- 不把“推测”写成“已确认”；每个结论留可复现命令/脚本与产物。
- 卡住时先记录证据再向用户要方向。
- 小结论完成即保存 PROGRESS/issue 并提交。
