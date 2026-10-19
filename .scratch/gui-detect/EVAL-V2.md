# EVAL-V2 — GUI 检测评测台（CALIBER-v2 口径）

> 状态：阶段 A 完成（2026-10-19 17:2x）。作者：trainer。产物全部落本目录。
> 评测口径唯一来源：`.scratch/gui-corpus/CALIBER-v2.md`。数据治理由 `perception` 负责，本目录只读真值。

## 一键重跑

```bash
cd /home/h/genshin-ts
./.scratch/gui-detect/eval.sh old        # 阶段 A：旧真值（11 版本目录去重）+ 两个多帧组
./.scratch/gui-detect/eval.sh old-both   # 同上 + 训练链路口径（train：无 NMS）
./.scratch/gui-detect/eval.sh d2val      # 只评 d2 留族验证集（7 帧/516 GT，与 D2-improve 表并列）
./.scratch/gui-detect/eval.sh merged     # 阶段 B/C：truth-merged 交付后一键重跑
./.scratch/gui-detect/eval.sh all        # merged + 多帧组
./.scratch/gui-detect/eval.sh --models v3=tools/ys-editor/models/gui-det-v3.pt   # 换权重
```
产物：`eval-out/<tag>/{report.md,report.json}`（`report.md` 人读，`report.json` 机读、可 diff）。

常用开关：`--models a=..,b=..`（并列多模型）、`--channel prod|train|both`、
`--split-file dataset-v2/split.json --eval-split val`（**用同一份切分评**，未退化证据必须这么跑）、
`--grade-filter A,B`（读 MANIFEST 的 `quality_grade`）、`--frame-list <file>`（只评指定 stem）、
`--multi-dir <case>`（多帧组）、`--nms ship|agnostic|perkind`（线上现状 / 强制关掉 scoped / 全类内）、
`--glyph-ref w01`（glyph 专项参考帧）、`--glyph-drop-bars`（剔除宽 >150px 的条/数值）、
`--infer-unknown`（旧 dataset 口径猜类，仅用于历史表对齐）、`--exclude-c-grade`、`--no-audit`、`--no-feats`。

**权威输入**：`--preset merged` 时族/等级/audit 一律读 `truth-merged/MANIFEST.json`
（`family` / `quality_grade` / `audit_uncovered` / `area_max_frac`）；family 缺失或 NONE 的帧**跳过并报数**，不猜。

**报告里除 CALIBER-v2 五条外，还有三个自动读数**（都是踩过坑才加的）：
- `同界面重复帧`（帧级：与同族另一帧 GT 重合率 ≥0.8）——**GT 数 ≠ 独立样本数**，m01–m08 / w01–w08 各是 1 个界面；
- `world HUD / glyph_icon 专项`——三个数（帧级 GT / 独立样本 / 独立界面）+ **逐 glyph 检出率**（val/train 两侧分开）；
- `错类矩阵`（同类 IoU≥0.5 但 kind 不同）——量化同构错类。

## 口径（两个同时报，缺一不可）

| 口径 | 定义 | 用途 |
|---|---|---|
| `strict` | **同类 1:1 贪心匹配**（按 score 降序，IoU≥0.5），P/R/F1 | CALIBER-v2 主口径；P 才有通常含义 |
| `legacy` | `d2.evaluate` 原口径：同 kind 且 IoU≥0.5 即命中，**不一对一** | 与 D2-improve 历史表直接可比 |

> 2026-10-19 起：两个通道的行高规则一致（都用 `min(行距, 1.2×logh)` 封顶，见 `STAGE-B-REPORT.md` §七）。
> 历史 row 数字（D2-improve 的 0.266 等）是封顶前算的，行密集列表上差 ≤1pp，世界 HUD 类不规则行会差很多。

通道：`prod` = `tools/ys-editor/gui_det.Detector.detect`（PIL 缩放→前向→decode→**NMS0.5**→min_side 8），
`train` = `d2.Net` + `d2.decode/decode_rows`（**无 NMS**，与 `d2.evaluate` 逐字一致）。
P/R/F1 一律按 kind 分开；`unknown` 类真值**不计分**但计数进报告。

## 阶段 A 读数（旧数据：15 个 truth 目录去重 → 57 帧 / 2080 单元）

数据面（含真值覆盖）：

| 族 | 帧 | GT 单元 | audit 已跑（有 OCR 探针） | audit≥3 帧 | 备注 |
|---|---|---|---|---|---|
| game_ui | 43 | 1197 | 12/43 | 2 | 含 57 个 `unknown`（不计分） |
| editor | 11 | 883 | 2/11 | 1 | row 320、chip 164（密集树/属性面板） |
| world_hud | 3 | 0 | 2/3 | 0 | 旧数据**没有**世界 HUD 真值（只有两张负样本） |

总表（prod 通道，57 帧 / 2080 单元、2023 计分单元）：

| 模型 | 检出 | TP | FP | FN | P | R | F1 | legacy R | p50ms |
|---|---|---|---|---|---|---|---|---|---|
| v1 | 2636 | 1169 | 1467 | 850 | **0.443** | 0.578 | 0.502 | 0.580 | 39.9 |
| v2 | 3362 | 1177 | 2185 | 842 | **0.350** | 0.582 | 0.437 | 0.584 | 51.1 |

分 kind（strict `P|R|F1`，括号内 `GT/检出`）：

| kind | GT | v1 | v2 |
|---|---|---|---|
| panel | 183 | 0.438\|0.694\|0.537 (290) | 0.356\|0.710\|0.474 (365) |
| **row** | 682 | 0.383\|0.488\|0.429 (869) | 0.342\|0.500\|0.406 (998) |
| button | 457 | 0.374\|0.558\|0.448 (682) | 0.324\|0.532\|0.403 (749) |
| tile | 238 | 0.670\|0.777\|0.720 (276) | 0.520\|0.782\|0.624 (358) |
| chip | 197 | 0.405\|0.381\|0.393 (185) | 0.218\|0.447\|0.293 (403) |
| icon | 149 | 0.527\|0.664\|0.588 (188) | 0.317\|0.705\|0.437 (331) |
| card | 86 | 0.650\|0.930\|0.766 (123) | 0.532\|0.977\|0.689 (158) |
| avatar | 31 | 0.652\|0.484\|0.556 (23) | **0\|0\|0（v2 无 avatar 输出）** |
| glyph_icon | 0 | —（旧真值无此类） | — |

分族：

| 族 | 帧 | GT | v1 | v2 |
|---|---|---|---|---|
| game_ui | 43 | 1140 | 0.531\|0.789\|0.635 | 0.394\|0.718\|0.509 |
| editor | 11 | 883 | 0.295\|0.305\|0.300 | 0.285\|0.405\|0.334 |
| world_hud | 3 | 0 | —（无 GT） | — |

几何切片（`--no-feats` 关掉时的结论，节选）：

- row：长宽比 `>6` 的 442 个 GT，v1 R=0.373 / v2 R=0.493；`2–6` 的 230 个 R=0.709/0.513；
  行高 `≤32px` 的 11 个 R=0/0.09 ⇒ **小高度长条仍是硬骨头**。
- chip/row：`flat/高`（纹理多）R 反而最低（chip v1 0.470 vs flat/低 0.333 —— v2 0.485 vs 0.379），
  说明"平坦皮肤"不是主要障碍，**密集相邻**才是。

单帧 vs 多帧（`.scratch/gui-collect/{menu,world}`，8 帧/组，GT 来自参考帧）：

| 组 | N | GT | v1 单帧→多帧 | v2 单帧→多帧 |
|---|---|---|---|---|
| menu | 8 | 41 | .720/.659 → .750/.659（P×1.04, R×1.00） | .536/.683 → .549/.683（P×1.02, R×1.00） |
| world | 8 | 32 | .000/.000 → .000/.000 | .023/.020 → .000/.000 |

多帧口径只把精确率抬了 2–4%，召回不变；世界 HUD 组两个模型都归零。

## 口径校准（这是本表可信的前提）

`eval.sh d2val`（7 帧留族验证 / 516 计分单元，与历史表同一验证集）：

| 模型/通道 | 本台 legacy R | D2-improve 记录 |
|---|---|---|
| v1 train | 0.260 | 0.272 |
| v1 prod | 0.248 | 0.254 |
| v2 train | 0.328 | 0.326 |
| v2 prod | 0.331 | **0.326** |

差 ≤0.6pp，来源已定位：旧 `dataset/annotations.json` 把 4 个 `unknown` 按几何猜类（我的台默认不计分）
→ GT 516 vs 519。要完全对齐用 `--infer-unknown`。**结论：口徑已对齐，本台的数字可与历史表并列。**

## 阶段 A 得到的三条判断（阶段 B 要用）

1. **v2 的收益是召回，代价是精确率**：全量旧数据上 v2 的 R 只比 v1 高 0.4pp、P 掉 9.3pp（多产 726 框）。
   留族验证集上 v2 R 0.331 vs v1 0.248（+8.3pp）——**旧数据 57 帧里有 50 帧是训练帧，不能用来做结论**。
2. **世界 HUD 族 = 0**：gui-collect `w01` 32 个 GT，v2 同类最高 IoU 仅 0.38（21/32 单元零重叠）。
   模型没见过这类界面；`truth-merged` 现在已含 w01–w08 + `glyph_icon` 248 单元，这是阶段 B 的第一个训练目标。
3. **row 的长宽比问题被证实且被量化**：`>6` 桶 442 个 GT（占 row 65%），当前最好 R 0.493。

## 判据红线（照抄 CALIBER-v2，别各自定义）

- 只报 micro 不算结论；`row` / `glyph_icon` 必须单列（本台 `KEY_KINDS`）。
- 切分按**族留出**，禁随机切（旧数据 57 帧里 50 帧是训练帧，随机切会让同界面帧泄漏）。
- 每个数字旁边要有真值覆盖：本台逐帧给 `units / 计分 / unknown / 区域框面积占比 / audit 未覆盖`。
- 未退化证据 = 同一验证集上把上一版模型并列（`--models v1=..,v2=..`），menu 族 P ≥1.000、tile ≥18/20 是阶段 B 的门槛。
