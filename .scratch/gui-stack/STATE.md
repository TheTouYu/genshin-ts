# GUI AGI · 当前工作状态（STATE）

> **用途**：压缩/换会话后的第一份交接。比 BOARD 细、比复盘新。
> **纪律**：任何一条工作线有实质变化就更新本文件**再**压缩上下文（数字、路径、判据、未决项一个都不能丢）。
> 最近更新：2026-10-19 05:1x

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
- **仍未修**：`--clicks` 与行数非线性（20 格≈3 行、40 格≈6 行、332 格跳到别的区段）⇒ `--by items=N` 不可信，需要实测标定

## 四、目标与验收

- **用户目标**：同类任务 **1 分钟内**（普通水平）；AGI 水平应**远低于 1 分钟**
- **估算路径**：P0 滚动+列表 → 3–4 分钟；P1 增量感知+二分策略 → 1 分钟；P2 记忆（UI 地图/路径）→ 10–15 秒
- **测试队友**：优化完成后建一个队友跑同一任务，用 `ys-time-audit` + `round-report` 计时对比（**尚未建**）

## 五、未决事项

1. 批量注入（②）做不做、怎么做（ys-scroll --then / 独立 ys-act）；
2. D2 队友重跑（内存受限，需 640×360 轻量配置）；
3. 端到端"行级可用"还差得远（F1 0.065 整框 / 0.519 y 带）——是继续 D3 还是先修 D2；
4. 主线闸门：三个游戏 game① 试过 24 轮栽在"验收标准=循环不崩"，回主线第一件事是重写验收。
