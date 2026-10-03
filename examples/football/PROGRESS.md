# 进度记录 — 真实足球

> doc-type: H（轮次归档索引）· status: active-as-index · updated: 2026-09-30
> 当前状态入口：`.scratch/football-v2/BOARD.md`（唯一推进看板）
> 本文件不再保存长轮次正文；已完成轮次归档见下。

## 当前状态（2026-09-30）

- 交接轮（本轮）：换机 WSL2→Arch（wine 独立游戏路径，anime-game-launcher prefix），旧存档不可达，
  足球地图 1073741908 在新存档不存在 → 用户裁决**从空节点图重建**，立票 24（issues/24-env-rebuild-wine.md）。
- 工具链缺口登记：新版存档子目录式布局 `Save_Level/<mapId>/<mapId>.gil` 与 gil_paths 平铺假设不兼容
  （open-items O-2026-09-30-01）。
- 代码基线：票 23 v2 哑执行器在飞改动已入库（fe2d5d3，build/quicktest 曾绿、游戏内未验证）；
  dist-fb 产物停在 09-07 早于 v2 源码，重建前须重编译。
- codebase-memory 技能退役提交 2f8c39a（用户裁决②）。
- 下一步：票 24 A（gil_paths 子目录 fallback）→ B（地图落点确认）→ C（资产按 01→04 票序重建）。

## 历史归档

已完成轮次（2026-08-30 ~ 2026-09-04）已移入：
- `../../.scratch/football-v2/archives/progress/PROGRESS-2026-08-30-to-2026-09-04.md`

## 新轮次记录约定

- 新轮次请在本文件按原格式继续追加；累计过大后再次按“已完成轮次移入归档”处理。
- 本文件只保留“当前状态摘要 + 最近少量轮次”，完整历史以归档文件为准。
