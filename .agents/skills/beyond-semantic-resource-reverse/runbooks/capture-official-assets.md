# Runbook：抓取“官方只读资产 → 自定义/编辑器资产定义”（type1017 通用）

> 目标：把官方只读资产（预制体/实体/Gadget/Monster/角色状态/蓝图等）的
> 可用 ID、名称、kindCode、sourceEntityId，以及（触发时）完整 `field11` 定义抓到本地。
> 原理：type1017 是通用资源目录/定义消息；官方资产只读时可能只给 ID/摘要，
> 通过“复制为自定义 / 另存为 / 打开编辑”可让编辑器下发更多实体化定义。
> 本 runbook 依赖全部在技能目录/仓库内，不用 `/tmp`、不用 `/mnt/c/temp`。

## 依赖清单（已入库）

| 依赖 | 路径 |
|---|---|
| HAblp 类型直方图 | `.agents/skills/beyond-semantic-resource-reverse/scripts/summarize_hablp_pcap.py` |
| type1017 通用解析 | `.agents/skills/beyond-semantic-resource-reverse/scripts/parse_type1017_generic.py` |
| 官方实体映射构建 | `.agents/skills/beyond-semantic-resource-reverse/scripts/build_official_entity_mapping.py` |
| 旧 type1017 状态专用解析 | `.agents/skills/beyond-semantic-resource-reverse/scripts/parse_official_copy_pcap.py` |
| RawCap.exe | `.agents/skills/beyond-semantic-resource-reverse/tools/RawCap.exe` |
| 官方实体静态表 | `.scratch/beyond-semantic-resources/data/animegamedata-cn7.0.0/beyond_excel/BeyondOfficialEntityExcelConfigData.json` |
| TextMap CHS | `.scratch/beyond-semantic-resources/data/animegamedata-cn7.0.0/TextMapCHS.json` |

## 0. 准备抓包目录

```bash
mkdir -p /mnt/c/beyond-ipc
cp .agents/skills/beyond-semantic-resource-reverse/tools/RawCap.exe /mnt/c/beyond-ipc/RawCap.exe
```

## 1. 启动抓包（Windows 管理员）

```bash
/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe -NoProfile -Command \
  "Start-Process -Verb RunAs -FilePath 'C:\beyond-ipc\RawCap.exe' -ArgumentList '-s 1200 127.0.0.1 C:\beyond-ipc\multi_type_ipc.pcap'"
```

验证：

```bash
/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe -NoProfile -Command \
  "Get-Process RawCap -ErrorAction SilentlyContinue | Select-Object Id,ProcessName"
ls -l /mnt/c/beyond-ipc/multi_type_ipc.pcap
```

## 2. 用户在编辑器/游戏内操作

按资产类型来：

- **资源管理器官方页签**：选择官方预制体 / Gadget / 怪物 / 几何体等。
  - 若右键有“复制为自定义 / 另存为自定义 / 保存为自定义 / 基于官方创建”，执行并命名 `O<官方ID>`；
  - 仅“选中/点开”也会产生 type1017 摘要定义。
- **蓝图管理器**：RoleStatus / Duty / Stuff / 客户端技能等。
  - 有“另存为”就另存为自定义，并选中新资源。
- **要拿完整内部结构（field11）**：必须在编辑场景中**打开或编辑具体资产**，不要只在列表里选中；
  full field11 目前只在被打开/编辑的资产上观察到。

> 一个 pcap 可以连续做多个资产；命名/操作顺序会影响后续人工映射，最好记录做了什么。

### 高效采样策略（减少无谓操作）

1. **名称/ID/kindCode 不再需要为每个资产抓包**：`BeyondOfficialEntityExcelConfigData` + TextMap 已覆盖；
   type1017 摘要只是补充“编辑器侧 source 引用”。
2. **每类资产只开 1~2 个代表样本拿完整 field11**：
   - Gadget：空模型 / 瀑布
   - Monster：打手丘丘人 / 遗迹守卫
   - Player/模板：默认模版
   - Avatar：默认模版(角色编辑)
   - 蓝图/技能：后续确认入口后再选代表
3. 如果某类已经有完整 field11 样本，后续同类不需要重复抓。

## 3. 停止抓包

```bash
# PID 换成实际 RawCap PID
/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe -NoProfile -Command \
  "Start-Process -Verb RunAs -Wait -FilePath 'C:\Windows\System32\taskkill.exe' -ArgumentList '/F /PID <PID>'"
```

## 4. 一键处理（推荐）

一条命令完成：类型直方图 → 缓存 type1017 payload → 通用解析 → 官方实体映射 → 简报。

```bash
python3 .agents/skills/beyond-semantic-resource-reverse/scripts/process_type1017_capture.py \
  /mnt/c/beyond-ipc/multi_type_ipc.pcap \
  --prefix .scratch/beyond-semantic-resources/evidence/2026-09-04-ticket01/ipc/multi_type \
  --entity-data .scratch/beyond-semantic-resources/data/animegamedata-cn7.0.0/beyond_excel/BeyondOfficialEntityExcelConfigData.json \
  --textmap .scratch/beyond-semantic-resources/data/animegamedata-cn7.0.0/TextMapCHS.json \
  --mapping-output resources/official_entity_ipc_mapping.json \
  --report .scratch/beyond-semantic-resources/evidence/2026-09-04-ticket01/ipc/multi_type.report.md
```

产物：

- `<prefix>.hablp-summary.json` — HAblp 类型直方图
- `<prefix>_1017/` — 缓存后的 type1017 payload（后续解析不再重扫 pcap）
- `<prefix>.generic.json` — `availableIds` / `definitions` / `sourceEntityIndex`
- `resources/official_entity_ipc_mapping.json` — 官方实体映射资源
- `<prefix>.report.md` — 简报

## 5. 逐步命令（仅排查/自定义用）

如果只需要某一步，可分别执行脚本；正常流程用上面的 `process_type1017_capture.py` 即可。

## 已知注意点

- type1017 摘要定义含 `sourceEntityId` 与 `kindCode`（1402=Gadget、1403=Player、1404=Avatar、1405=Monster）。
- 想要完整 `field11` 组件/引用/参数，需要触发“打开/编辑具体资产”，目前只有部分样本抓到过。
- 名字/TextMapHash 仍可另走 TextMap 静态源；type1017 内也带显示名，但需以 TextMap 为准。
