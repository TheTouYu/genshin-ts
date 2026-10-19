# dataset-v2 切分（MANIFEST sha=fc28d0eab6f03a07）

- 输入 `.scratch/gui-corpus/truth-merged`｜等级 ['A', 'B']｜跳过 {'unknown': 57, 'grade_C': 3, 'no_image': 4}
- 界面组 40 个（同组整组同侧；`w-last` 例外=同界面帧级切分）
- **train** 54 帧 / 2039 单元：{'avatar': 22, 'button': 408, 'card': 86, 'chip': 160, 'glyph_icon': 186, 'icon': 140, 'panel': 177, 'row': 629, 'tile': 231}
- **val** 12 帧 / 408 单元：{'avatar': 8, 'button': 36, 'glyph_icon': 62, 'icon': 48, 'panel': 28, 'row': 66, 'tile': 160}
- v2 训练集见过的帧：train 46/54，**val 0/12**（val 必须=0 才是公平对照）

## 留出理由

- val `c37_195331`（game_ui）← group:c37*
- val `c40_195339`（game_ui）← group:c40*
- val `m01`（game_ui）← group:m*
- val `m02`（game_ui）← group:m*
- val `m03`（game_ui）← group:m*
- val `m04`（game_ui）← group:m*
- val `m05`（game_ui）← group:m*
- val `m06`（game_ui）← group:m*
- val `m07`（game_ui）← group:m*
- val `m08`（game_ui）← group:m*
- val `w07`（world_hud）← group:w-last(同界面帧级切分)
- val `w08`（world_hud）← group:w-last(同界面帧级切分)

## 公平性：val 里 v2 未见过的帧 12/12

## 训练集各族
- editor: 9 帧
- game_ui: 39 帧
- world_hud: 6 帧

## 同界面组（≥2 帧）
- ['m01', 'm02', 'm03', 'm04', 'm05', 'm06', 'm07', 'm08']
- ['w01', 'w02', 'w03', 'w04', 'w05', 'w06', 'w07', 'w08']
- ['c18_195129', 'f09', 'f10', 'f12', 'r007_snap_2026-10-19_00-22-25']
- ['c12_195108', 'f06', 'r003_snap_2026-10-19_00-17-26', 'r004_snap_2026-10-19_00-20-33']
- ['f01', 'f02', 'f03']
- ['c36_195316', 'f13']
- ['f07', 'f08']
- ['r044_snap_2026-10-19_00-37-57', 'r045_snap_2026-10-19_00-38-06']
