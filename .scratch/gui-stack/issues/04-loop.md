# 票 04 — ys-loop 编排层 + M4 产物监控

> 状态：✅ **已完成 2026-10-17** ｜ Blocked by：03 ｜ 设计依据：[`../DESIGN.md`](../DESIGN.md) §三 L3 + §四 M4

## What to build（用户视角端到端）

一条命令跑完一整轮「离开图 → CLI 构建 → 进入图 → 试玩 → 注入 → 退出 → 取日志 → 判定」，
并产出四件：`report.md`（人读）/ `ledger.jsonl`（机读）/ `evidence/`（图）/ **`uncertainties.md`**（下一轮输入）。

**M4 是本票的灵魂**：产物判据**完全不经过屏幕**——磁盘 SHA、`Beyond_Debug_Log/*.gia` 是否新增、
**原始字节**里有无预期标记。GUI 层所有推断都要能被它证伪。

## 验收项

- [x] `ys-loop` 跑通一轮，四件产物齐全
- [x] **M4 判据**：新 `.gia` 文件出现 且 `mtime` 前进 且 `strings -n 2` 能搜到预期标记
- [x] **零新日志时必须报"退出没走完"而不是"图没执行"**（今天混淆过的两个结论）
- [x] 中途任一步 `FAIL` → 全轮中止 + 现场落盘（截图 + 账本 + `ys-wins` + 进程快照）
- [x] 单步超时看门狗（默认 90s）→ 停止而非继续点
- [x] `uncertainties.md` 自动列出：`fresh:false` 次数 / 未验后置态的动作 / 单判据态

## 实跑记录（2026-10-17 09:16~09:23）

```
✓ focus                  OK active=原神 | top=原神
✓ goto_my_map            第 2 次探测即到位
✓ map_leave              sha=a6d2a28217279d44
✓ map_enter              第 1 次探测即到位
✓ playtest_start         ✓ 完成
✓ input                  按 F
✓ playtest_stop          ✓ 完成
✓ artifact_new_log       2026-10-17_09-21-54_3308_110170759.gia
✓ artifact_marker        原始字节里 有 YJ-BOOT
✓ 一轮全绿
```
产出 `/home/h/ys-round/20261017-091622/`：report.md + ledger.jsonl + uncertainties.md + evidence/

## 收轮三件套

- [x] 勾票 + 看板移入划掉区 + 前沿指向下一票
- [x] 看板 §⑤ 递归判据表更新一行
- [x] 精确 git commit
