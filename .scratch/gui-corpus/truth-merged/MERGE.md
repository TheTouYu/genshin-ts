# MERGE — truth-merged 合并记录（自动生成）

规则：帧身份=文件名；版本序=目录名（truth=1 / truth-vN=N / truth-vN-fix=N+0.5）；并列取 mtime 新者。

| 项 | 值 |
|---|---|
| 输入版本目录 | 12 个 |
| 候选 JSON（去重前） | 82 |
| **合并后帧数** | **57** |
| **合并后单元数** | **2080** |

## 来源分布（胜出版本）

- `truth`：15 帧
- `truth-v3`：11 帧
- `truth-v8-game`：6 帧
- `truth-v9-fixed`：6 帧
- `truth-v8-editor`：6 帧
- `truth-v2`：5 帧
- `truth-v4`：4 帧
- `truth-v5`：2 帧
- `truth-v7`：1 帧
- `truth-v8-fix`：1 帧

## 被覆盖版本（每帧）

- `c42_195441` ← 采用 `truth-v3`(37 units)；覆盖：truth-v2(31)
- `r003_snap_2026-10-19_00-17-26` ← 采用 `truth-v8-game`(51 units)；覆盖：truth-v6(44), truth-v7(42)
- `r004_snap_2026-10-19_00-20-33` ← 采用 `truth-v9-fixed`(43 units)；覆盖：truth-v9-pred(97)
- `r006_snap_2026-10-19_00-22-19` ← 采用 `truth-v8-game`(35 units)；覆盖：truth-v5(35)
- `r007_snap_2026-10-19_00-22-25` ← 采用 `truth-v9-fixed`(30 units)；覆盖：truth-v9-pred(49)
- `r009_snap_2026-10-19_00-23-32` ← 采用 `truth-v9-fixed`(33 units)；覆盖：truth-v9-pred(34)
- `r013_snap_2026-10-19_00-23-53` ← 采用 `truth-v8-game`(33 units)；覆盖：truth-v6(27)
- `r019_snap_2026-10-19_00-24-44` ← 采用 `truth-v8-game`(72 units)；覆盖：truth-v5(47), truth-v7(50), truth-v8-fix(50)
- `r021_snap_2026-10-19_00-24-58` ← 采用 `truth-v8-game`(46 units)；覆盖：truth-v5(32), truth-v7(34), truth-v8-fix(35)
- `r022_snap_2026-10-19_00-25-06` ← 采用 `truth-v8-game`(45 units)；覆盖：truth-v6(39)
- `r023_snap_2026-10-19_00-25-15` ← 采用 `truth-v9-fixed`(20 units)；覆盖：truth-v9-pred(10)
- `r024_snap_2026-10-19_00-25-30` ← 采用 `truth-v9-fixed`(40 units)；覆盖：truth-v9-pred(29)
- `r026_snap_2026-10-19_00-27-05` ← 采用 `truth-v8-editor`(44 units)；覆盖：truth-v6(33)
- `r028_snap_2026-10-19_00-27-49` ← 采用 `truth-v9-fixed`(117 units)；覆盖：truth-v9-pred(116)
- `r032_snap_2026-10-19_00-30-42` ← 采用 `truth-v8-editor`(129 units)；覆盖：truth-v5(69)
- `r034_snap_2026-10-19_00-31-33` ← 采用 `truth-v8-editor`(128 units)；覆盖：truth-v5(99)
- `r040_snap_2026-10-19_00-36-18` ← 采用 `truth-v8-editor`(97 units)；覆盖：truth-v5(70)
- `r044_snap_2026-10-19_00-37-57` ← 采用 `truth-v8-editor`(75 units)；覆盖：truth-v6(27)
- `r045_snap_2026-10-19_00-38-06` ← 采用 `truth-v8-editor`(88 units)；覆盖：truth-v5(31)
- `r047_snap_2026-10-19_00-39-53` ← 采用 `truth-v8-fix`(57 units)；覆盖：truth-v5(20)
