# 票 24 · 换机重建：Arch+wine 独立游戏路径 + 空图存档重建足球全部资产

> doc-type: A · status: draft（用户三项裁决已录，待开工）· updated: 2026-09-30
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

- **A 工具链适配**：gil_paths 子目录式 fallback + Temp 同步核对（O-2026-09-30-01）；
  GSTS_LOCALLOW_DIR 落到 shell 配置或项目 .env 约定；用 1073741825 空图实测 maps 定位。
- **B 地图决策（需用户确认）**：足球重建落点——沿用 1073741825（现为近空、含 lua 目录）
  还是 maps create 新建 1073741908 同号重建；确认后锁定 SHA 基线。
- **C 资产重建**（按 01→02→03→04 票顺序复刻，ID 尽量沿用旧号便于源码零改动）：
  信号注册 → 球实体变量 31+ → 挂载四服务端图 → 技能配置+客户端图注入 → 丘丘人+球引用
  → 假人资产（gsts.fb-dummy.config.mjs）→ 单位状态 1077936132 参数三件套（用户编辑器侧）。
- **D 链路复测**：先 E0 空跑（球 RESET 落体）再按 22 票 A/B 对比、23 票 P1.5 演出全链。

## 3. 验收

- A：gsts 对子目录式存档定位+Temp 同步实测 PASS（1073741825）。
- C：decode 断言门禁全绿（复刻 03/04 票口径：42/42+38/38 级别）。
- D：进图后按 23 票 §7 用户目视预期句复测；负载口径对照 §12（空闲 sink~600 边界）。
