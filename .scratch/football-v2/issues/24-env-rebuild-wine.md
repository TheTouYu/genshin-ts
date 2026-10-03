# 票 24 · 换机重建：Arch+wine 独立游戏路径 + 空图存档重建足球全部资产

> doc-type: A · status: in-progress（A、B 完成；前沿=C 资产重建）· updated: 2026-10-03
> 用户裁决原话（2026-09-30）：
>   ①「我们直接从空节点图建立存档。我们使用独立的游戏路径，使用wine运行的，你可以查看当前进程」
>   ② codebase-memory 技能退役（已完成提交 2f8c39a）
>   ③ 先更新看板/票据登记（本票+BOARD 即该裁决落地）
> 前置票：22（A/B 对比，定案未执行）、23（演出 v2，源码在飞未注入）——两票动作全部
> 依赖真实地图资产，随本票重建后在新存档上恢复执行。

## 0. 环境事实（2026-09-30 探测，进程+存档实据）

- 机器：WSL2 → Arch Linux。`/mnt/c` 不存在、无 LOCALAPPDATA → gsts 报
  `[error] LOCALAPPDATA not found; set GSTS_LOCALLOW_DIR`（src/cli/gil_paths.ts:75）。
- 游戏载体：anime-game-launcher（runner spritz-wine-tkg-staging-wow64-11.14-1，
  prefix=/home/h/.local/share/anime-game-launcher/prefix；游戏目录 /home/h/.ys → bwrap 沙箱 /tmp/sandbox/game）。
- 存档根（GSTS_LOCALLOW_DIR）：
  `/home/h/.local/share/anime-game-launcher/prefix/drive_c/users/h/AppData/LocalLow`
  （China 区拼 miHoYo/原神/BeyondLocal，与 gil_paths.ts:84 口径一致）。玩家 110170759 不变。
- 存档现状：仅一张近空地图 `Beyond_Local_Save_Level/1073741825/1073741825.gil`
  （21889B，09-27/28 建，含 external_lua_file/ 目录）+ Temp 同名副本。
  **足球地图 1073741908 在新存档不存在**——旧机全部资产（信号/变量/实体/挂载/技能配置/
  造物/假人/四服务端图+客户端图）不可迁，须从空图重建。
- 🔴 工具链缺口：新版存档为**子目录式** `Save_Level/<mapId>/<mapId>.gil`，而
  gil_paths.ts:176 只认平铺 → 已登记 open-items O-2026-09-30-01，本票 A 步先修。

## 1. 本地仅存的足球资产事实（重建参照，非可注入状态）

- 源码：examples/football/src-fb/**（HEAD fe2d5d3 起含票 23 v2 哑执行器在飞改动，build 曾绿）
- 编译产物：examples/football/dist-fb/**.gia 停在 09-07（早于 09-16 v2 源码）→ 重建前必须重编译
- 地图备份：.gsts/backups/1073741908.*（最晚 09-02，早于最后注入 09-07 POST 358563b2，
  仅作资产 ID/结构参照，勿直接回写）
- 票据/预计算工具：.scratch/football-v2/issues/01-23；shotcalc 在 .scratch/_archive/football-v2/evidence/ab-22/
- BOARD 资产速查即重建清单（31 球变量/11 镜像/22 参数/信号 771-776+783-785/技能配置
  2337·2339·1098907653·1098907654/丘丘人 def 1082130433+5 实体/假人 prefab 1077936131/四服务端图+1830..1837）

## 2. 执行阶段

- **A 工具链适配 ✅（2026-10-03 提交 8e00f8a）**：gil_paths 新增 gilPathInSaveLevel
  （双布局解析，子目录式优先）+ saveLevelDirOf（gil 路径反推 Save_Level 根）；
  resolveGilTarget/syncGilToTemp/listMaps（含去重防 createMap 撞 ID）/renameMap/resyncMap/
  gsts·image-editor 解析点/assets_* 备份与 Temp·gip 同步基准全部改双布局。
  验证：build 绿 + tests/cli_maps_layout.ts（新回归）+ cli_maps_json.ts PASS + 真存档只读
  实测（maps 列表见「未分类页签_存档」，resolveGilTarget 指向嵌套路径，saveLevelDirOf 正确）。
  关闭 O-2026-09-30-01。附带修复：node_modules/.bin 18 个坏符号链接（换机遗留，
  0 字节文件需先删再 npm install 重建）；tests/cli_maps_ops.ts 依赖旧机
  ~/genshin-ts-evidence 夹具，Arch 无法运行（环境性遗留，非本次改动引入）。
  GSTS_LOCALLOW_DIR 尚未固化到 shell 配置（当前会话内 export；B 确认后随重建脚本落 .env 约定）。
- **B 地图落点 ✅（2026-10-03 用户裁决：沿用+改名）**：1073741825 经
  `maps:rename` 改名「真实足球」（原「未分类页签_存档」）。**SHA 基线锁定**：
  `5ab667e8d076a516695b0adf0495af8dfe2ace19922572ba3ac73f11ba884442`（21879B，嵌套路径）。
  本次同时完成新布局下首次真实写回端到端验证：备份落 `Save_Level/.gsts/backups/`✓、
  Temp 平铺同步✓、gip 双注册表名更新（xxd 核对 UTF-8「真实足球」+页签链接 1600/map id 完好）✓。
  改名前备份：`1073741825.gil.2026-10-03T08-13-28-069Z.rename.bak`。游戏未运行时写回；
  注入配置 mapId 1073741908→1073741825 待 C 段随注入链统一改。
- **C 资产重建（当前前沿，按 01→02→03→04 票顺序复刻，ID 尽量沿用旧号便于源码零改动）**：
  信号注册 → 球实体变量 31+ → 挂载四服务端图 → 技能配置+客户端图注入 → 丘丘人+球引用
  → 假人资产（gsts.fb-dummy.config.mjs）→ 单位状态 1077936132 参数三件套（用户编辑器侧）。
- **D 链路复测**：先 E0 空跑（球 RESET 落体）再按 22 票 A/B 对比、23 票 P1.5 演出全链。

## 3. 验收

- A：gsts 对子目录式存档定位+Temp 同步实测 PASS（1073741825）。
- C：decode 断言门禁全绿（复刻 03/04 票口径：42/42+38/38 级别）。
- D：进图后按 23 票 §7 用户目视预期句复测；负载口径对照 §12（空闲 sink~600 边界）。
