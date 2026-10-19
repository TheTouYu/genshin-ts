# STAGE-B — 重训与评测（CALIBER-v2 口径）

> 2026-10-19 17:4x–18:xx，trainer。真值快照 MANIFEST sha=`fc28d0eab6f03a07`（73 帧 / A61 B9 C3）。
> 产物：`dataset-v2/`（annotations+split+SPLIT.md+truth-used 快照）、`train-v3/`(80ep)、`train-v3b/`(280ep, 越界臂)、`train-v4/`(热启动 120ep)、
> 评测 `eval-out/val-v2-v3/`、`eval-out/val-v2-v4/`、`eval-out/world-glyph-v4/`。

## 一、切分（为什么不是「整族留出」）

| 项 | 读数 |
|---|---|
| train | 54 帧 / 2039 单元（含 `glyph_icon` 186） |
| val | 12 帧 / 408 单元（m01–m08 + c37/c40 + w07/w08；`glyph_icon` 56） |
| **val 里 v2 训练时见过的帧** | **0 / 12** |

- **同界面连拍先聚组、整组同侧**（GT 重合率 ≥0.8 连边）：m01–m08 = 1 个界面、w01–w08 = 1 个界面，随机按帧切必泄漏。
- **「整族留出」在这份数据上不可行**：editor 族 11/11 帧都是 v2 训练见过的；拿它当 val 会让 v2 天然占优，读数不能当泛化。
  故改为**按界面组留出**（每族留一个没见过的界面组），并把 `seen_by_v2` 写进 `dataset-v2/SPLIT.md`。
- **world_hud 例外**：w01–w06 训 / w07–w08 验（同界面帧级切分）。原因是 glyph_icon 只存在于 world_hud，
  整族留出 = 训练集 0 个 glyph 样本 = 该类不可能训出来。Lead 已裁决走这个方案（C），
  且报告标题区必须写「**帧级 GT 224 · 独立样本 28 · 有效独立界面 1**」。

## 二、三个模型（同一个 12 帧 val，strict 1:1 / IoU0.5 / prod 通道）

| 模型 | 训练 | P | R | F1 | legacy R | p50ms |
|---|---|---|---|---|---|---|
| v2（基线） | 旧 50 帧 / 400ep / 7 类 | **.444** | .554 | .493 | .554 | 50.2 |
| v3（从零） | 新 54 帧 / **80ep** / 8 类 | .185 | .458 | .264 | .458 | — |
| v3b（从零续训 280ep） | 新 54 帧 / 280ep（**越界臂，不进主表**） | .329 | .589 | .422 | .589 | 47.6 |
| **v4（热启动 v2）** | 新 54 帧 / **120ep** / 8 类 | .425 | **.693** | **.527** | .693 | 47.1 |

**v4 vs v2**：R **+13.9pp**、F1 **+3.4pp**、P −1.9pp、延迟不变。

分族（关键的取舍在这里）：

| 族 | GT | v2 P/R | v4 P/R |
|---|---|---|---|
| game_ui | 328 | **.500 / .683** | .436 / **.683** |
| world_hud | 76 | .000 / .000 | **.386 / .737** |

分 kind（TP 数，v2 → v4）：panel 24→28、button 8→12、tile 160→160、icon 32→32、row 0→2、**glyph_icon 0→46**、avatar 0→0。

## 三、glyph_icon 专项（C 方案要回答的那个问题）

- 三个数：**帧级 GT 224 · 独立样本 28 · 有效独立界面 1**（8 帧完全一致，两两归一化相关最大 0.70，是 28 个不同图案）。
- 类级（w01–w08 全 8 帧）：v2 `P 0 / R 0`；**v4 `P .380 / R .717 / F1 .497`**（det 269 / tp 178）。
- **逐 glyph（28 行在 `eval-out/world-glyph-v4/report.md` §3.5）**：
  - v2：val 稳定 0 / 从不 28
  - **v4：val 稳定 23 / 从不 5**（同一批在训练帧上 24/28）
- 剩下 5 个「从不」：3 个 ≤36px（26×26、36×36、34×40）、2 个贴右边缘（x=2496，右沿已在 2530）。
  ⇒ **结论：4×4 网格下「已知模板」能学；失败集中在「更小 + 贴边」= 分辨率与边缘裁切问题，不是类别学不出来。**
  按 Lead 裁决：**这一轮不动输入分辨率**。

## 四、判据结算（Lead 定的两条硬线）

| 判据 | 阈值 | v4 实测 | 结论 |
|---|---|---|---|
| game_ui R | ≥ .66 | .683 | ✅ |
| game_ui P | ≥ .48 | .436 | ❌ 差 4.4pp |
| glyph 稳定检出 | ≥ 15/28 | **23/28** | ✅ |

**单项模型判据不通过**（差在精确率）。多出来的 FP 来源已定位：v4 在菜单帧（game_ui）上比 v2 多 66 个框、TP 不变，
主要是 `icon`（det 81→132、TP 不变 32）与 `glyph_icon` 在非 HUD 界面上的误开火。

按 Lead 的规则 ⇒ **不再试第三种训练法，改走「双检测器按 state 分派」**。分派所需的两个权重各自在其场景上：

| 场景 | 权重 | P | R | 与之前比 |
|---|---|---|---|---|
| 菜单 / 编辑器（state≠GAME_WORLD） | `tools/ys-editor/models/gui-det-v2.pt` | .500 | .683 | **不变（同一权重，零退化）** |
| 世界 HUD（state=GAME_WORLD） | `.scratch/gui-detect/train-v4/model.pt` | .386 | .737 | v2 在此场景是 0/0 |

**世界专家还有一个免费的精确率**：它在 world 帧上吐了 **144 个 `icon` 框**，而 world 的 icon 真值是 **0**（这些本该是 glyph_icon）。
如果分派层在 GAME_WORLD 状态把 `icon` 类丢掉（或映射成 glyph_icon），世界专家的 P 从 **.386 → .511**，R 不变。
`NMS_SCOPED_KINDS=("avatar",)` 在 v4 的世界帧上是中性的（avatar 0 检出），不冲突。

## 五、复算命令

```bash
# 数据集与切分（读 MANIFEST 的 family/quality_grade；写快照）
python3 .scratch/gui-detect/build_dataset_v2.py
# 训练（热启动 v2，8 类含 glyph_icon，行条带）
python3 .scratch/gui-detect/d2_train.py --root .scratch/gui-detect/dataset-v2 \
  --kinds panel,button,tile,chip,icon,card,avatar,glyph_icon --row-strip \
  --tag v4 --init tools/ys-editor/models/gui-det-v2.pt --epochs 120 --batch 4 --lr 3e-4
# 留出验证集对照（未退化证据）
python3 .scratch/gui-detect/eval_v2.py --preset merged --grade-filter A,B --channel prod \
  --split-file .scratch/gui-detect/dataset-v2/split.json --eval-split val \
  --models v2=tools/ys-editor/models/gui-det-v2.pt,v4=.scratch/gui-detect/train-v4/model.pt \
  --out .scratch/gui-detect/eval-out/val-v2-v4
# 逐 glyph 表（世界 8 帧，val/train 两侧分开报）
python3 .scratch/gui-detect/eval_v2.py --preset merged --grade-filter A,B --channel prod \
  --frame-list <(printf 'w01\nw02\nw03\nw04\nw05\nw06\nw07\nw08\n') \
  --split-file .scratch/gui-detect/dataset-v2/split.json --glyph-ref w01 \
  --models v2=...,v4=.scratch/gui-detect/train-v4/model.pt --out .scratch/gui-detect/eval-out/world-glyph-v4
```

## 六、这一轮结论可能错在哪（必须一起读）

1. **val 被菜单界面主导**：12 帧里 m01–m08 是同一界面的 8 张连拍，占 328/408 单元（80%）。所以 game_ui 的 P/R 实质是「菜单界面」的读数，不代表所有游戏界面。
2. **v4 与 v2 之间不止一个变量**：训练集（54 vs 50 帧）、类别数（8 vs 7）、初始化（热启动 vs 从零）、epoch（120 vs 400）。**「热启动让 P 回来」不是被单独证实的因果**。
3. **v3b（280ep）越界**：不进主表。若将来要放大 epoch，须单独跑「只放大 epoch」的对照臂。
4. **glyph 的 23/28 是同一界面上的已知模板**，不证明新界面/新 glyph 可检出（这也是 C 方案的边界）。
5. **row 依然没解决**：val 上 v2 R=0、v4 R=0.03（68 个 GT）。`row` 在「没见过的界面」上基本不工作——这跟长宽比无关，是泛化问题；`ROW-STRATIFY.md` 的 aspect 分层实验只该在 row 能检出之后再谈。
