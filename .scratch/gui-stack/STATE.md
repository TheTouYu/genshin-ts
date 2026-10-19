# GUI AGI · 当前工作状态（STATE）

> **用途**：压缩/换会话后的第一份交接。比 BOARD 细、比复盘新。
> **纪律**：任何一条工作线有实质变化就更新本文件**再**压缩上下文（数字、路径、判据、未决项一个都不能丢）。
> 最近更新：2026-10-19 18:0x

## 零、最新读数（2026-10-19 17:0x–18:0x，优先于下面所有小节）

### 真值终态 `truth-merged/`（commit `7108af06`）
- **73 帧**，`quality_grade` **A39 / B31 / C3**，`family` **game_ui 53 / editor 12 / world_hud 8**
- **独立界面 ≈ 58 个，不是 73**（trainer 新判据「同界面重复帧」实测）：
  m01–m08 框 100% 互相重合 = **1 个界面**；w01–w08 100% 重合 = **1 个界面**；
  f07↔f08 0.967、f09↔c18 0.957 两对同界面。⇒ **按帧随机切分必泄漏**，必须按界面组切。
- **kind × family 全表**（判类别样本量时先看这张，别再重算）：
  | family | avatar | button | card | chip | **glyph_icon** | icon | panel | row | tile | unknown | 合计 |
  |---|---|---|---|---|---|---|---|---|---|---|---|
  | editor | 0 | 244 | 0 | 164 | 0 | 53 | 79 | 328 | 36 | 3 | 907 |
  | game_ui | 39 | 245 | 86 | 33 | **0** | 144 | 135 | 419 | 362 | 54 | 1517 |
  | world_hud | 0 | 16 | 0 | 0 | **248** | 0 | 16 | 40 | 0 | 0 | 320 |
- **`glyph_icon` 只存在于 world_hud**（且 world_hud = 1 个界面 × 8 张连拍）⇒ 整族留出就训不出这个类。
  **裁决（本文件作者）**：走「game_ui/editor 按族留出 + world_hud 内部按帧切」，
  但结论只能写「31 个已知 glyph 模板可学」，**不得**写成「glyph_icon 可用」。
  248 帧级实例 = **31 个不同 glyph**（两两归一化相关最大仅 0.70，确是 31 个图案）。

### 评测口径与检测器
- 评测台 `.scratch/gui-detect/eval.sh {old,old-both,d2val,merged,all}` → `eval-out/<tag>/report.{md,json}`；
  口径 `CALIBER-v2.md`（micro mAP 退役，分 kind + 分族 + 真值覆盖率 + 单帧/多帧双报）。
- 口径自证：`eval.sh d2val` 与 D2-improve 历史差 ≤0.6pp ⇒ 可与历史并列。
- v2 是**用精确率换召回**（旧 57 帧：v1 P .443/R .578/F1 .502，v2 P .350/R .582/F1 .437）。
- **avatar 归零的真因不是训练，是 `gui_det.postprocess` 的类无关 NMS**：v2 在头像位置同时吐
  icon(.91)/button(.84)/tile(.78)/avatar(.64) 四个 IoU=1.0 的框，低分 avatar 被压掉；这也解释了 ~49% 错类率。
- `tools/ys-editor/gui_det.py` 已加 `NMS_SCOPED_KINDS = ("avatar",)`（只在同类内比 NMS），
  **但 A/B 被帧集变化污染（73 vs 62 帧），尚未定论**——已派 trainer 在固定快照上重做。

### L6 负面闸门（commit `0dfdf684` + `faadffcb`）
- `ys-screen` 新字段 `uncertainty[]`：`possible_miss`(≤0.80) / `possible_false_positive`(≥0.85，仅 HUD 类) /
  `ambiguous_kind`(0.5)，两段分数刻意不重叠。验收：world/w01 的 4 个背景假阳性全标出（0.983/0.971/0.923/0.897），
  18 个真命中最高 0.00 ⇒ 4/4；menu/m01 的 FP = 0。
- 接进 `look()` 时踩到**三处字段白名单丢弃点**：`ys_lookd._world_containers` 键白名单 / `schema.new_world()` 无该参数 /
  `_TOP_ALLOWED`。**跨层加字段必须逐层查重建点**。
- `worldsvc drill` 子命令：对 score 最高 N 个区域裁局部图（带局部/全局双坐标）。
- `act` 失败自解释：`_changed_region()` + `_overlap_ratio()`，错误升级为「期待 [x,y,w,h]，实际变化集中在 [a,b,c,d]，IoU=0.0x」。
- drill 第一个真实用例就抓到 uncertainty 自己的误标（w01 top3 里两个是滚动指示器）。

### 焦点看门狗（用户可感知事故，已修，commit `f99f72d2`）
- 症状：无论做什么都被强制切回原神桌面。根因链：内层 `prev==target` → `idx(prev)>idx(game)` 恒不成立 →
  `RESTORE_FAILED` 且 `lease_kept:true` → 守护每 0.5s **无限重试**（restore=activate+raise）。
- 修复：限次 3 + 指数退避 + `abandoned` + 失败路径只首试 raise + 连续 5 次自停。
  自测 `first_calls=3 no_more=1 abandoned=1 fuse=1`；打扰次数 prev==game **0 次**、最坏 ≤3（原事故 19s 6 次）。
- 用户选 A 后已 `enable --now`（systemd，active）。

### 服务层两个真 bug 已修（2026-10-19 17:2x–18:0x，commit `e1dabeae` / `6e6955bf`）
1. **`look` 的 state 曾经是错的**：同帧 `cmd=state`=GAME_WORLD 而 `cmd=world`=PLAYTEST(0.5)，
   因为 UID 本体判据只写在 `_state` 内联块里，`_world_state` 直接返回 `YS.decide()`。
   → 抽 `_uid_present()` / `_apply_world_uid()` 两处共用；连测 3 次全一致 GAME_WORLD。
2. **三维世界里 `containers=0`**（flat+rect 是菜单 UI 规则，圆形小地图/头像/技能键都不命中），
   而 D2 同帧给 29–33 框；这些框此前只喂 D3、不对外暴露 ⇒ `look()` 返回 `objects=[]`。
   → daemon 输出 `structure.detections`；`schema.object_from_detection()` 转换（**bbox 已是 xywh**，
   clickable 恒 unknown，confidence=模型分数）；worldsvc 在容器为空时才顶替。
   **验证**：`look --live --backend daemon-world` → objects=33（row15/button9/panel3/icon3/chip1/card1/tile1）；
   `gui-service selftest` **90/90 PASS**。
- **仍未达标**：单次 `look` 1.1–3.3s（冷启 11.8s）。`_WORLD_CACHE` 键含整帧 sha，**活体画面每帧都在渲染
  ⇒ 几乎不命中**（与判态那次同一个坑：像素 sha 对活体画面无效，应改时间缓存）。缓存命中 1.5ms。
- **未闭合**：`free_text` 无 bbox（daemon 侧已字符串化）⇒ 世界里 `act(text)` 解析不到，`FREE_TEXT_UNOWNED`。
- **菜单路径已端到端验证（离线帧，零焦点占用）**：
  `look --frame .scratch/gui-collect/menu/frames/m01.png --backend daemon-world` →
  `state=GAME_PAIMON`、**objects=19（18 tile + 1 全高 unknown）且全部有 text 归属**
  （`tile 好友 [590,478,174,156]`、`tile 角色`、`tile 祈愿`、`tile 队伍配置`…）；
  `act --text 好友 --expect '{"type":"pixel_delta",...}'` → **dry_run rc=0，点击点 `[677,556]`**
  （= tile 中心，解析正确）。⇒ **菜单类任务的可寻址链路是通的**；世界 HUD 只有坐标、没有文字寻址。

### 双检测器按 state 分派（2026-10-19 18:0x，commit `2d6674c0`）
- **世界里 0 → 56 个对象**（glyph_icon 37 / button 8 / row 5 / panel 3 / chip 2 / card 1），state=GAME_WORLD；
  菜单 m01 零变化（19 objects，**19/19 有文字归属**），`act --text 好友` → `[677,556]`。
- `ys_lookd._detector_for(state)`：GAME_WORLD → `tools/ys-editor/models/gui-det-world-v1.pt`（=v4，sha256 已核）；
  其余 → `gui-det-v2.pt`。**`DEFAULT_MODEL` 未动，回退=一行**。
- `_WORLD_DROP_KINDS=("icon",)`：世界 HUD 的 icon 真值=0，模型把无底 glyph 误开火成 icon；丢弃后 P .386→.511，R 不变。
- `schema.KINDS` 新增 `glyph_icon`（否则 37 个框全降级成 unknown）。
- **坑（已复发一次）**：「容器为空才用检测框」在有假阳性时整盘失效——世界里 CV 常吐 1 个假 panel，
  把 57 个检测框全压掉（daemon 直连 57、`look` 返回 1）。改为按 state 判。
- 验证：`gui-det-contract` 两权重 fails=0；`gui-service selftest` **90/90 PASS**。

### 待办（按价值排序）
1. ~~**row 解码 cap12**~~ ✅ 已落地并生效（`f94562c3` + `30a41b97`）：`hcells = min(hcells, 1.2 * h_reg)`，删该行即回退。
   验收：契约 fails=0（v2+world）；新 val 行 R **.061→.273**（33 GT/3 界面，方向性）；旧 val .500→.510；
   **生产入口 `Detector.detect()` 19/24=.79**；线上菜单模型三项一字不变。
   菜单行是另一种病（10px 高 / 长宽比 12.4 / 阈值降到 .10 峰数仍恒 1–2）⇒ 表示层缺口，需重训，本轮不动。
   **实测已重启 lookd 生效**：live world `row` 5 个，高度 **46.5/49.5/65.6/47.5/59.2px**（修复前是 ~1.93× 即 90–130px），
   `objects=59`（glyph_icon 39 / button 8 / panel 5 / row 5 / chip 1 / card 1）。
2. **`act(text)` 在世界里不可用**：`free_text` 在 daemon 侧已字符串化、无 bbox。修法=新增 `text_boxes`（带 bbox）
   + resolver 回退到"文本自身 bbox 中心"，需动 daemon `_KEYS` / `schema.new_world` / `_TOP_ALLOWED` / worldsvc 四处白名单。**本轮未做**。
3. `_WORLD_CACHE` 键含整帧 sha ⇒ 活体画面几乎不命中（与判态那次同一个坑）。
4. menu 行在 640×360 上可能根本不是"行"（trainer 正在量化，可能是口径问题）。

### 正在跑
- `trainer`（阶段 B）：按界面组切分的 dataset builder + glyph_icon 可学性；已给裁决与四条附加约束。
- `perception`：world_hud 3 个「不像 glyph_icon」单元（元素能量/护盾条 325×20、生命值条 305×26、
  生命值数值 195×40）的**口径复核（先给口径再改数据）**；顺带补 16 帧的索引使其可被 audit 覆盖。
- 硬约束：根 `AGENTS.md` = **16377 B**，离 16384 只剩 **7 字节**，新规则只能写子目录或技能。

## 一、运行中的进程（谁在跑）

| 组件 | pid / id | 说明 |
|---|---|---|
| `ys-lookd`（常驻感知服务） | systemd `ys-lookd` | `cmd=world`（state+objects+**structure**）、`cmd=grab`（快抓 0.5s）、`cmd=ocr_objects` |
| `cmdmon daemon` | 1156 | 命令遥测，写 `~/.dsh/cmdlog/commands.jsonl` |
| `coach --watch 60` | 1268936 | 实时教练，写 `~/.dsh/cmdlog/coach-live.md` |
| `ys-annotate-serve` | 923247 | 标注编辑器 http://127.0.0.1:8765 |
| **D2 质量队友**（subagent） | `0dbd7317` | 训练被我杀（内存压力），已通知改用 640×360 / 60–80 epoch |
| 原神本体 | 1123382 | 用户在用，勿杀 |

## 二、六条工作线的状态

### 1) 感知服务（形态 A）——可用
- `look` 输出：`state` / `objects` / **`structure`**（groups/rows/container_of/pitch/kind_fixes/slots）
- 时延：抓帧 **0.5s**（XShm+JPEG，原 ys-snap 4.8s）｜检测 **27.6ms**｜结构 **9.9ms**｜OCR 冷 ~330ms / 热 15–45ms
- 已知短板：OCR 冷态主导总时延；`world` 缓存命中 0.7ms

### 2) D2 检测器——v5 已训完，质量待提
- 权重：`tools/ys-editor/models/gui-det-v1.pt`（接口 `tools/ys-editor/gui_det.py` 的 `Detector.detect(rgb)`）
- 读数（留族验证 7 帧）：**micro 0.272**｜tile 0.711｜panel 0.50｜avatar 1.0｜icon 0.419｜chip 0.325｜button 0.263｜**row 0.084**｜card 0
- 根因（已量化）：row 675 例中 **61% 长宽比 >6**（中心点表示不适合长条）；icon/tile/chip 几何同构；数据 50 图
- 已派队友做：① 行改 1D 条带 ② 粗类 ③ 分辨率 ④ 损失

### 3) D3 结构层——v1 成立
- 代码：`tools/ys-editor/d3_structure.py`（从 .scratch 提升）；评测 `d3_eval.py`
- 读数：parent F1 编辑器 **0.78** / 游戏 **0.91** / v9-fixed **0.90**；group F1 游戏 **0.88**、编辑器 0.58；逐组 pitch **8/10 ≤5%**（中位 3.3%）
- **关键更正**：「全帧一个 pitch」是伪命题，真值是**每组一个常数**（组内 std ≤1px，组间 166–416）
- **关键更正**：容器归属优先级（detected panel > 组并集 > 行）才是 parent R 的真因，不是"缺行层级"
- 边界：整屏底板必丢（≥75%）；toolbar button 与 icon 几何同构；整块面板漏检时槽位无从推断
- 端到端实测（服务输出 vs 真值，6 帧）：整框 IoU F1 **0.065**；按 y 带匹配 F1 **0.519** ⇒ 行"纵向大致对、横向差得远"

### 4) 标注语料——A 级为主
- 数据集：`50 图 / 1956 实例`（`build_dataset.py`；C 级 5 帧已剔）
- 结构真值：`truth-v8-game`（4 帧 parent 91.4%）、`truth-v8-editor`（4 帧 93–97.7%）、`truth-v9-fixed`（6 帧）
- 技能：`.agents/skills/gui-annotation/SKILL.md`（切块法 + R1–R10 + 质量闭环 + 覆盖守卫）

### 5) 动作原语——P0 完成，②未做
- `tools/ys-editor/ys-scroll`：语义滚动 + 位移验证（一次"滚动+验证" **11.7s → 约 3s**，抓帧换 daemon 后）
- `tools/ys-editor/ys-list`：结构化列表（以"时间标签"为锚点切条目，输出 name/label/bbox）
- **批量注入**：已有 `ys-act <脚本.sh> [out.png] [win]`（bash）——一次抬升+槽位里跑脚本做完所有动作再抓图。
  实测固定开销：**ys-act 7.5s**（其中 ys-kwin-raise + import 抓图占大头）、单次 slot 2.1s。
  ⇒ 动作 ≥4 个才值得批；否则用 ys-scroll（带 daemon 快抓 0.5s）更划算。

### 6) 教练层——上线
- `tools/coach`：7 条情境规则（裸 sleep / 手工注入 / 慢抓帧 / 判据卡住 / 失败重复 / 内存 / 慢调用归 cmdmon）
- 实测 2h 窗口命中今晚三件：裸 sleep 121 处 5021s、ys-snap 抓帧 130 次、连续 21 次查状态

## 三、那个真实任务（反馈轮基准）

**任务**：进入游戏 → 找到第一个最近 30 天没上线的好友
**结果**：`匿叶龙`（31 天前最后登录），证据帧 `.scratch/gui-corpus/evidence-friend-30d.jpg`
**耗时**：**约 24 分钟**（04:26:33 → 04:49:31）；其中 GUI 工具约 4–5 分钟，其余是推理/等待/重试
**五大瓶颈**（真实数据）：① 无滚动原语（手工 xdotool）② 抓帧 4.8s ③ 状态机 AMBIGUOUS 卡 5 分钟 ④ 名字↔标签手工配对 ⑤ 窗口选择踩坑

## 三.5 测试队友复跑结果（2026-10-19 05:1x）

- **同一个任务、同一套工具、另一个代理：410 秒（6.8 分钟）**，答案是 `匿叶龙`（与我一致）
- 步数：抓帧 13 / 滚动 12 / ys-list 13 / 点击 0
- **耗时构成**：ys-list 读屏 13×~10s≈**130s(32%)**｜**排序口径判错**（以为是全局按时间，实际先按冒险等阶降序、同组内按最后登录降序）重探 90–120s(25%)｜滚动 12×~3s｜抓帧 13×0.5s
- **它发现并已修的两个工具 bug**：①`ys-list` 名字取错（把 Lv.60 当名字）→ 加正则排除，现正确返回 T—bug/朵朵/匿叶龙；②`ys-scroll moved_px` 相关窗只有 ±200px，大步翻页读数无意义 → 放宽到 ±900
- **ys-list 提速（2026-10-19 10:4x）**：改走常驻 `ys-lookd cmd=ocr_objects`（**0.04–0.32s**），不再 spawn ys-screen（4–10s）⇒ 单次读屏 **6.8–10.7s → 0.11s**；daemon bbox 是 **xywh**（ys-screen CLI 是 xyxy，已分别处理）
- **滚动标定完成（2026-10-19 10:5x）**：**拖动 200px = 1 行**（200/400px → 1/2 行，线性，慢速拖动 60 步×0.25s 保持不加速）；**滚轮非线性**（10 格→3 行、20 格→3 行、40 格→6 行）⇒ 一律用 `--by rows=N`（拖动换算，标定文件 `~/.dsh/ys-scroll-calib.json`，脚本 `.scratch/gui-perf/calib_scroll.py`）
- **仍未修**：`--clicks` 与行数非线性（已被拖动方案取代，保留仅为兼容）（20 格≈3 行、40 格≈6 行、332 格跳到别的区段）⇒ `--by items=N` 不可信，需要实测标定



## 三.6 性能轮（2026-10-19 12:2x–12:5x，已落 PERF-LEDGER）

- **判态 CLI 1051ms → 398ms（2.6×）**：世界判定搬进 daemon（UID 小条 + 常驻 OCR），修正缓存策略（像素 sha 对活体画面无效 → 时间缓存 5s）
- 检测 69.8→48.6ms；world 797→603ms；list 112→102ms；**动作 29.2ms 达标**
- **修掉真 bug**：提瓦特世界被判成 PLAYTEST/UNKNOWN（fast ROI 裁到 x≤1400，判世界要的 UID 在 x≈2257）
- 踩坑记录：daemon 内调 `native_readings` 会重入自身 RPC ⇒ 死锁（已回退，改用 `_ocr_array` + patched `YS._ocr_boxes`）
- 仍未达标：判态 398ms（目标 200）、检测 48.6ms（目标 10）

## 七、当前待办（按优先级）

1. ~~失败的机械防线~~ **已清零：36/36 全部有机械防线（2026-10-19 13:5x）**。最后三条「归因」类这样收的：
   - F-2-08（单位域错配）→ `ys-state --selftest-units`（gate=unitselftest）：把内联护栏抽成 `_u8()`，6 条断言。**自检当场抓到真 bug**：非 uint8 整数走 `astype` 会静默回绕（300→44），改成夹紧。
   - F-20261019-34（信任子代理自述）→ `tools/subagent-verdict --check`（gate=subagent-verdict）：四读数齐全 + 计数自洽。
   - F-1-10（零实测下结论）→ `tools/subagent-verdict --trace <jsonl>`（gate=model-trace）：数评审 trace 的 measurement，=0 判 ZERO-MEASUREMENT。
2. ~~`failure-ledger check --fast` 卡住~~ **已修（2026-10-19 13:1x）：400s → 9s**。
   根因两层：① `main()` 用 `vars(parse_args())` 得到 **dict**，而我写的 `getattr(a,'fast')` 对 dict 永远 False（开关点了等于没点）；
   ② fast 模式只过滤 gate、**照跑 inject 用例**（造故障脚本才是耗时大头）⇒ 现在 fast=只验 gate 可跑，inject 留全量。
   顺带给 G-LEDGER-DEDUP 加容差（偶发 1–2 次是写入竞态；病态=同一条 ≥3 次）。
3. 检测器 48.6ms → ≤10ms（需换更轻模型或只在变化区推理）
4. ~~判态 398ms → ≤200ms~~ **已达成：123–129ms（2026-10-19 14:2x，commit 0a866a02）**。
   分项实测（daemon `parts` 字段）：抓帧 116ms→27ms（ImageMagick 子进程换成进程内 XShmGetImage 9ms）、
   UID 小条 82ms→0ms（同一整帧裁条）、像素取点 13–34ms→~5ms（免 24MB GPU→CPU 回传）、锚点 35ms/GPU 6ms 不变。
   回归 24/24 双通道全绿；门槛1 PASS。**还有 35ms 锚点可砍**（pad 200→24 实测精度不变），但当前已达标，暂不动判据。


## 三.7 游戏运行时的真实口径（2026-10-19 15:4x，重要修正）

判态 `--fast` 的两套读数必须分开报：

| 场景 | CLI 端到端 | daemon 内 | 分项 |
|---|---|---|---|
| 游戏未运行（空闲） | **123–129ms** | ~88ms | 锚点 35ms |
| **游戏运行中（GPU 被占）** | **330–340ms** | ~180ms | **锚点 125–130ms**（GPU 争用，涨 3.6×） |

⇒ 「125ms 达标」只在空闲态成立。实测反馈轮期间游戏是开着的，**按 330ms 说**。
可继续砍的地方仍是锚点：`pad 200→24` 在 24 帧上精度不变，NCC 面积降 ~12×，预计能把 125ms 压回 30–40ms。
**但改判据要在测试轮之后单独做**（回归 24/24 + 门槛1 必须重跑）。

## 四、目标与验收

- **用户目标**：同类任务 **1 分钟内**（普通水平）；AGI 水平应**远低于 1 分钟**
- **估算路径**：P0 滚动+列表 → 3–4 分钟；P1 增量感知+二分策略 → 1 分钟；P2 记忆（UI 地图/路径）→ 10–15 秒
- **测试队友**：优化完成后建一个队友跑同一任务，用 `ys-time-audit` + `round-report` 计时对比（**尚未建**）

## 五、未决事项

1. 批量注入（②）做不做、怎么做（ys-scroll --then / 独立 ys-act）；
2. D2 队友重跑（内存受限，需 640×360 轻量配置）；
3. 端到端"行级可用"还差得远（F1 0.065 整框 / 0.519 y 带）——是继续 D3 还是先修 D2；
4. 主线闸门：三个游戏 game① 试过 24 轮栽在"验收标准=循环不崩"，回主线第一件事是重写验收。

## 八、进行中：dsh-guard 执行前守卫（2026-10-19 14:0x 派出）

**任务板 task-7 → 队友 `guard-dev` 独立执行**（Lead 只验收）。设计裁决与已核实事实如下，压缩后靠本节恢复：

### 已核实的 seam（源码，勿再猜）
```ts
ctx.on('tools/pre-execute', async (exec, next) => PreToolDecision, { prepend: true })
PreToolDecision = {kind:'allow'} | {kind:'deny', reason, info?} | {kind:'cancel'} | {kind:'ask', reason, displayReason?}
// reason 是给模型看的 ⇒ 「拦截 + 正确引导」一次完成
// exec 可读：name / arguments(已解析JSON, bash={command}) / agent / callId
ctx.on('tools/post-execute', ...) => PostToolDecision // accept/换投影/additionalContexts/把纠正反馈变 error
```
- 参考实现：`.../dsh-experimental-auto-review/lib/index.js:461`（`inject:['approval','llm','permissionPresets','sessions','tools','workingDirectory']`）
- 现有插件层次：memo-river / dsh-coach = `agent/pre-step` 尾注入（只能提醒不能拦）；skill-rec = 0.8B 服务 `127.0.0.1:8122`（**此刻未运行**，spec p99 400ms）

### 成本（本机实测）
- L0 规则层：6 条正则 × 20 万命令 = 207ms ⇒ **1.03µs/次**；参数抽取 1.08µs
- L2 0.8B 模型：**400ms/次** ⇒ v1 不接；模型只做**离线规则生成器**（归因"失败但没被规则命中"的样本）

### 四条设计裁决
1. v1 = L0 规则 + L1 上下文判据，不接模型
2. 默认 deny + **逃生舱**：reason 带正确替代命令 + `--guard-force`；同规则被 force 放行 2 次 ⇒ 降级 ask
3. 插件异常 **fail-open**（放行 + telemetry），护栏不得卡死会话
4. 匹配**命令结构**非裸字符串（`grep "sleep 30"` 必须放行）——今天夹具触发守卫的教训

### 预设
能力表是数据文件 `~/dsh-plugins/dsh-preset-composer/lib/capabilities.json`，加一行 `exec-guard`（hostBundles=["@dsh-external/dsh-guard"]），再 `preset_compose` 组合 `river-acp-guard` = 现有能力 + exec-guard。

### 交付判据
注入用例（正例 deny/负例 allow）＋延迟 p50/p99<100µs＋**新端口（3081+，绝不碰 3080）用户级取证**；完成后通知用户重启生产服务（**重启由用户执行**）。
