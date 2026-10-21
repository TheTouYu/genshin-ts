# GUI 滚动条 / 滑块（thumb）检测与 seek（2026-10-21）

> **状态**：当前实现（规则版，零新增依赖）。**口径**：全部为**离线帧**读数（`.scratch/gui-corpus/**`、
> `.scratch/gui-service/evidence/**`）——本轮未占屏、未注入、未做真机验证（真机核验需 Lead 批准轮次）。
> **仪器**：`tools/ys-scrollbar`（CLI）+ `tools/ys-editor/ys_scrollbar.py`（**判据唯一实现**）+
> `tools/ys-editor/tests/scrollbar.selftest.py`（接 `tools/ys-gates --only 2`）
> **验收读数**：`SCROLLBAR-RESULT pos=17 hit=17 neg=20 fp=0 verdict=PASS`（召回 1.000，假阳 0）
> **账本**：`F-20261021-65`（class=能力缺口，gate=scrollbar，inject=`ledger-inject.sh scrollbar-neg`）

---

## 0. 为什么必须有这个能力（缺口）

GUI 感知层能读界面（`worldsvc look`）、能注入（滚轮/点击/拖动），但**没有"跳到列表某个位置"的能力**：

| 通道 | 实测 | 问题 |
|---|---|---|
| 滚轮 | 一次最多 ~7 行；请求 48 行只落 5.6 行 | 游戏有速率上限，且 clicks→rows 非线性 |
| 内容拖动 | 0.2–0.45 行/秒 | 比滚轮慢 7 倍 |
| 键盘 PageDown/End | 待验 | 不是所有界面都绑 |
| **容器层细长条** | `ws<=20 / h>=300` 候选 **= 0** | 结构层检不出滚动条 |
| **滚动条** | 本文件 | **一次跳到位** |

真机任务的直接后果（D465/D473）：好友列表 173 人、找「第一个 ≥30 天未上线」只能逐屏滚，
整轮 39.1s 里大半是滚动 + 抓帧。

## 1. 机器判据（常数表 = `ys_scrollbar.py` 顶部，**唯一来源**）

四步：**竖边成对 → 带剖面 → 轨道 → 滑块**。

| 常数 | 值 | 依据（实测） |
|---|---|---|
| `SCALE_REF_H` | 1440 | 常数按 1440 高标定；其它高度按 `H/1440` 缩放 |
| `TRACK_W` | (4, 24) px | f10=7 / f11=4 / 好友列表=6 / 邮件=6 / 编辑器树=7 / 编辑器设置=10–12 |
| `TRACK_LEN_MIN` | 300 px | f06 全帧最长假竖边只有 **43px**（▲▼ 提示块），必须挡掉 |
| `EDGE_D` | 4 灰阶 | f10/f11 边缘差 8–12；`realrun boundary.png` 弱到 **5**（阈值 6 会漏） |
| `EDGE_JITTER` | 2 px | 好友列表的滑块是**六边形，比轨道宽 1–2px**，边缘会外移（实测：轨道边 2402/2408，滑块行 2401/2410） |
| `GAP_EDGE` | 48 px | 同一列两条 run 的合并缺口（滑块把边缘挤开） |
| `SIDE_W` | 8 px | 两侧背景取样宽度 |
| `BAND_D_MIN` | 5 灰阶 | 暗槽实测只有 **−5..−24**（好友列表 −5..−12），取 5 是下界 |
| `BAND_D_STD_MAX` | 6.0 | 非滑块段 `d(y)` 的稳定性上界（挡渐变阴影/背景变化） |
| `BAND_V_STD_MAX` | 3.0 | **轨道实心度**：带内逐行亮度 std 的中位数。真轨道 0.0–1.5；滑条行 = 6.6 |
| `THUMB_DEV` | 12 灰阶 | 滑块簇与轨道簇的最小分离 |
| `THUMB_LEN` | (0.04, 0.95) × 轨道 | 滑块长度 / 轨道长度 |
| `GAP_TOL` | 30 px | 轨道内允许的 `|d|<BAND_D_MIN` 缺口 |
| `TRACK_MARGIN` | 8 px | **轨道两端必须离帧边 ≥8px**——贴边=被画面裁切的行背景/滑条行 |
| `MAX_EDGE_COLS` / `MAX_PAIRS` / `MAX_VERIFY` | 24 / 48 / 400 | 只影响耗时，不影响判据 |

**滑块判定**：把 `d(y)=带均值−两侧背景均值` 在轨道段上做 1-D 2 聚类，**|均值| 大的那一簇**即滑块
（亮条/暗条都收），要求单段连续、长度 ∈ `THUMB_LEN`。`position_ratio = (滑块起点−轨道起点)/(轨道长−滑块长)`，
`estimated_pages = 轨道长/滑块长`。

**拿不到就给 `found:false + reason`，不猜。** reason 枚举：
`bad_image / no_long_edge / no_band / no_track / track_at_frame_edge / band_not_solid /
band_unstable / no_thumb_run / thumb_full_length / ambiguous_multi_thumb / ambiguous_equal_clusters`。

**方向**：缺省 `auto` = 先竖后横（横向列表的滚动条不试就会判成"没有"，假阴比假阳更隐蔽——seek 会静默不动）。

## 2. 三条实测签名（正样本家族）

| 帧 | 双竖边 | 带宽 | 轨道 | 滑块 | 带内对比 | ratio |
|---|---|---|---|---|---|---|
| `.scratch/gui-corpus/f10.png`（编辑器设置·图像） | 2424 / 2431 | 7 | y 164–1372 | y 176–848 | 槽 −18 / 滑块 +66 | 0.022 |
| `f11.png`（同页滚到底） | 2422 / 2433 | 11 | y 164–1362 | y 687–1357 | 槽 −7 / 滑块 +55 | 0.978 |
| `evidence/friends-run-20261021-1555/friends0.png`（好友列表） | 2402 / 2408 | **6** | y 144–1268 | y 157–221 | 槽 −10 / 滑块 **+110** | 0.012 |
| `evidence/realrun-20261021/boundary.png`（好友列表中段） | 2402 / 2408 | 6 | 同上 | y 700–765 | 同上 | 0.526 |
| `capture-2026-10-18/195634.png`（编辑器左树） | 268 / 275 | 7 | y 206–1404 | y 381–1305 | — | 0.639 |

## 3. 两条**纠正**（比结论更值钱，别再走回头路）

1. **`f06/f07` 的 ▲▼ 不是滚动条**。派蒙菜单左下那两个小方块是「还有内容」的提示块：
   全帧最长竖直边缘 run 只有 **43px**，而真轨道 670–1200px。`ys_screen:1263 find_scroll_bands()`
   检的是**提示块**（h/w≥1.8、宽 24–90、高 100–260、中段 HSV 饱和覆盖 25–80%），签名与滚动条完全不同
   ——**不许把它改造成滚动条**，两者并存、各管各的。
2. **好友列表的滚动条只有 6px 宽，且滑块比轨道宽**。OCR/容器层完全看不见（`--containers` 候选 0），
   但像素通道能稳定检出（对比 +110 灰阶）。⇒ 「结构层看不见」不等于「视觉不可见」。

## 4. 负例闸门（必须不触发）

| 负例类 | 挡它的闸门 | 实测 |
|---|---|---|
| 分隔线 / 面板边框 | 轨道必须实心（`BAND_V_STD_MAX`）+ 2 聚类分离量 | 边框带内 std 高 |
| **滑条行 / 进度条** | `TRACK_MARGIN`（贴到画面边）+ `BAND_V_STD_MAX`（带内有文字/渐变） | f09 设置页滑条行：贴边 x→2559；实心度 6.6 |
| 列表滚动阴影 | `BAND_D_STD_MAX` | 渐变段 std > 6 |
| 竖排图标栏 | `TRACK_W` 上界 + 实心度 | 宽 ≥40、内部有纹理 |
| ▲▼ 提示块 | `TRACK_LEN_MIN` | 最长 43px |
| **同一 UI 但列表很短**（无滚动条） | 上面全部 | 合成负样本 3 帧全 0 |

## 5. 真值集与验收（可重算）

`python3 .scratch/scrollbar/build_truth.py` → `.scratch/scrollbar/truth/{pos,neg}.json`
→ `python3 tools/ys-editor/tests/scrollbar.selftest.py`

- **正样本 17 帧 / 5 个界面**：好友列表（10 帧）、邮件列表（2）、游戏内基础设置（2）、编辑器设置（2）、编辑器左树（1）。
  bbox 为轨道与滑块的实际像素范围；`verified_by` 区分「亲眼看裁图」与「同族抽样核对」。
- **负样本 20 帧**：12 张游戏内菜单帧（f00–f09/f12/f13，人眼边缘条带拼图逐帧核对无滑块）+ 世界 HUD +
  3 张**同一 UI 去掉滚动条的合成帧**（真机账号 173 个好友，拿不到"好友很少、无滚动条"的真实帧；把滚动条所在
  列用左右邻域均值抹平，内容一模一样、只少滚动条——这正是最难的假阳场景）。
- **读数**：`SCROLLBAR-RESULT pos=17 hit=17 neg=20 fp=0 verdict=PASS`；单帧 84–200ms（1440 高，CPU numpy）。
- **命中口径**：`found=True` 且方向一致 且**轨道中心线对齐**（±(真值半宽+4px)）且滑块中心落在真值轨道内。
  细带（3–12px）上 IoU 会被宽度误差主导（3px vs 10px 恒 <0.3），故不拿 IoU 当命中判据。

## 6. `position_ratio` 真值对照（3 个位置，同一 UI）

好友列表：OCR 读到标题 **「我的好友 173/200」**（`.scratch/gui-grounding/venv-rapidocr` 通道），
每屏 7 行（行距 166px，y 206/372/539/706/872/1038/1206）。把第 N 行放到视口顶部的比例
`r = (N−1)/(173−7)`：

| 帧 | 顶部可见好友（OCR） | 行号 | 公式 r | **实测 r** | 差 |
|---|---|---|---|---|---|
| `friends0.png` | 热九 | 1 | 0.000 | **0.012** | +0.012 |
| `now.png` | 花花 | ~9 | 0.048 | **0.063** | +0.015 |
| `boundary.png` | 匿叶龙（31 天前） | 91 | **0.542** | **0.526** | −0.016 |

⇒ 位置比与可视行号**单调一致**，最大偏差 0.016（≈2.5 行）。反向验证：`ys-scroll --seek-rows 91
--total-rows 173` 算出 r=0.542，与 boundary 实测 0.526 一致。
（`now.png` 的行号是**推断**：`friends0` 末行 CH明=第 8 行，两帧无重名 ⇒ 位移 ≥8 行。）

## 7. ⚠️ 已知偏差：`estimated_pages` 偏小约 1.45×（⇒ `--total-rows` 已设为必需）

好友列表实测 `estimated_pages = 17.31`（轨道 1125 / 滑块 65），但真实是 173 行 / 7 行每屏 ≈ **24.7**。
即滑块比"按比例应有的长度"长约 40%（UI 可能给了最小滑块长度）。
⇒ **`position_ratio` 可直接用；`--seek-rows` 必须给 `--total-rows`**（能从标题 OCR 到，如 `173/200`）。
**2026-10-21 Lead 决策：不给 `--total-rows` 直接报错**（`MISSING_TOTAL_ROWS`，rc=2，附"从标题 x/y OCR"的
next_action），**不静默兜底**——实测兜底会算出 r=0.80 而真值 0.54，等于把列表拖到完全错的位置。
`ys_advice` 同步：建议 seek 时 `how` 里必须带 `--total-rows` 并注明「estimated_pages 不可用于 seek」。

## 8. 接到动作层：`ys-scroll --seek-ratio / --seek-rows`

```bash
# 离线看清"会拖到哪"（不注入；判据与线上同一份实现）
tools/ys-editor/ys-scroll --at 0,0 --plan --seek-ratio 0.5 \
    --frame .scratch/gui-service/evidence/friends-run-20261021-1555/friends0.png
# → from_ratio 0.0123 → target 0.5，drag (2405,189) → (2405,706)

tools/ys-editor/ys-scroll --at 0,0 --plan --seek-rows 91 --total-rows 173 --frame <boundary.png>
# → target_ratio 0.542
```

- 定位 thumb → 算目标位置 → 拖 `ys-drag`（分批，每批 ≤1100px）→ 抓帧复验 `after_ratio`。
- 没有滚动条时**不猜**：`{"ok":false,"error":"NO_SCROLLBAR","reason":"...","state":{...},"next_action":"..."}`，退出码 7。
- 拖完返回 `frame_diff` 与 `after_ratio`——**用读数证明到位**，不是只看返回码。

## 8.5 `ys_advice` 的 seek 能力改成**当帧读数**（Lead 决策，单一源）

`ys_advice.SEEK_MAX_ROWS=8`（滚轮上限）不再是 seek 的唯一依据：
`ys_lookd._world_advice()` 用 `ys_scrollbar.detect_path()` 读当帧（按帧 sha 缓存，一次 ~150ms），
把 `seek_cap={found,orientation,position_ratio,estimated_pages}` 传进 `ys_advice.observe()`。

- `found=true` ⇒ `code=SCANNING_LINELY` 的变体 `seek_mode=scrollbar_seek`，`how` 直接给
  `ys-scroll --seek-rows <目标行> --total-rows <标题总数>`（并带 `seek{orientation,position_ratio,target_row,total_rows}`）；
- `found=false` ⇒ `LINEAR_ONLY_NO_SEEK`（现行行为），`why` 里写明「本帧没有滚动条（当帧读数）」。
- 没传 `seek_cap`（老调用方/自测）⇒ 退回 `SEEK_MAX_ROWS` 旧口径，行为不变（`advice.selftest.py` 仍 PASS）。

## 9. 边界与未做

- **横向滚动条（能力缺口，Lead 已接受"只保证不假阳"）**：判据已支持（`orient='h'`，auto 会试），但**语料里没有已核实的横向正样本**
  （全帧扫到的横向候选全是设置页滑条行，已被 `BAND_V_STD_MAX` + `TRACK_MARGIN` 挡掉）⇒ 横向**未经正样本验收**，
  当前只保证"不假阳"，不保证"能检出"。
- **端到端真机数字（一跳到位 vs 39.1s）**：未做，需 Lead 批准一个真机轮（几轮/验什么/失败判据）。
  离线已能给出计划与复验路径。
- **`ys_advice.SEEK_MAX_ROWS=8`**：滚动条可用后这条建议应改成"可 seek"，由 Lead 改。
- 小模型/训练集：**本版未做**（规则版已达门槛；若横向或其它 UI 家族召回不够再走 `.scratch/gui-detect/` 那条线，
  切分必须按界面组、报「帧级 GT / 独立样本 / 独立界面」三个数）。
