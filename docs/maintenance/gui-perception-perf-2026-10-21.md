# GUI 感知层性能优化：读 / 判 / 动到毫秒级（2026-10-21）

> **状态**：当前实现。**口径**：全部为**离线后台帧**（`.scratch/gui-corpus/f00..f13.png`）读数，
> **不是可见交互**；本轮未动用户屏幕、未做真注入（无用户在场，未申请 `ys-screen-grant`）。
> **目标（AGI-BAR §一/§十，未放宽）**：单次动作 ≤50ms、默认路径 ≤50ms、缓存命中 ≤5ms、对象检测 ≤10ms；
> 冷启动不计入，但必须靠常驻服务规避。
> **仪器**：`.scratch/gui-service/bench_perf.py`（分组件，≥5 次，p50/p95，换盐造冷帧）+
> `.scratch/gui-service/bench_check.py`（按 `perf-thresholds.json` 判回归）。

---

## 0. 结论（先给数字，p50，n=6）

| 场景 | 优化前 | **优化后** | 目标 | 判定 |
|---|---|---|---|---|
| **默认路径稳态**（同页再读，world 全量） | 157.2ms | **37.6ms** | ≤50ms | ✅ **4.2×** |
| world `--fast` 稳态（只跳检测+结构） | — | **36.2ms** | ≤50ms | ✅ |
| **帧级缓存命中** | 2.2ms | **2.0ms** | ≤5ms | ✅ |
| **判态**（帧已缓冲，judge） | 101.8ms\* | **34.9ms** | ≤50ms | ✅ |
| **act dry-run**（已 warm 帧：解析+校验） | — | **2.1ms** | ≤50ms | ✅ |
| expect `state_in`（同帧热） | 677–1670ms（子进程） | **0.7ms** | — | ✅ |
| 世界 look（新帧，冷） | 802.9ms | **643.9ms** | 冷启动不计入 | ⚠️ OCR 主导 |
| 按对象 OCR 冷（server） | 414.7ms | **407.3ms** | — | 持平（det + rec） |
| 整帧 OCR 冷（server） | 628ms | 787ms\* | — | 持平（\*GPU 争用） |
| 对象检测单帧 | 45.6ms | **32–35ms** | ≤10ms | ❌ 3× 欠账（已知） |
| 帧加载（PNG→GPU float） | 120.5ms | **100.7ms** | — | 1.2–1.8× 快 |
| 客户端 JSON 解析（23.5KB） | 0.29ms | **0.31ms** | — | 持平 |

\* **判态前后差异不是代码改动**：judge 段未改，前后差来自同机 GPU 争用（原神本体 1.7–2.1GB +
另一模型进程常驻）。当前稳定读数 ~34ms；`world_full_cold` 的前后差也含同一因素，见 §3 归因。

**一句话**：**稳态读数与动作解析已经毫秒级（37.6ms / 2.1ms），缓存命中 2ms；冷帧仍由 OCR 主导（~400ms），
对象检测仍超 ≤10ms 目标 3×。** 没有为了数字砍掉证据链（见 §2.3 的反例）。

---

## 1. 为什么之前是百毫秒～秒级（分组件归因）

`cmd=world` 的内部依赖链是**串行**的，且每帧都重付固定成本：

```
帧加载(PNG 解码+CPU float 归一化) → OCR(det+rec) → 判态(32 锚点 NCC + 像素探针)
→ 容器层(CV flat+rect) → D2 检测器 → D3 结构层
```

优化前实测拆解（f06，daemon 热，cache:false）：**wall 802.9ms** =
load 165.2 + ocr 337.3 + state 89.9 + objects 157.5 + detector 45.6 + structure 46.9。
其中三笔是"画面没变也照付"的：容器 157ms、检测+结构 92ms、判态 ~35–90ms。

---

## 2. 做了什么（每项都有前后数字）

### 2.1 帧加载：CPU 造两份 44MB float32 → GPU 归一化

旧代码 `arr.astype(np.float32)/255`（44MB）+ `permute().contiguous()`（再 44MB）后才 `.cuda()`；
新代码 `torch.from_numpy(arr).permute(...).contiguous().cuda().float().div_(255)`，CPU 只搬 11MB。
同时 PNG 解码不再对 RGB 图做 `.convert("RGB")` 整帧复制。
**读数**：独立 load 测试 120.5 → **100.7ms**；`world` 冷路径 load 165.2 → **91.9ms**（含争用方差）。

### 2.2 页级增量复用：容器/检测/结构不再每帧重算（**稳态 157→37.6ms 的主因**）

`_world` 新增门控（三条同时成立才复用）：
① 状态名相同；② **OCR 文本盒签名完全相同**（文字 + 整数化 bbox）；③ 页灰度平均绝对差 <1.0 且距上次 <1.2s。
命中时容器、D2 检测、D3 结构直接复用，回执带
`timing.objects_reuse="prev-page" / structure_reuse="prev-page" / page_diff`；**判态永远用当前帧现算**。
**读数**：同页第二次 world 157.2 → **37.6ms**（p95 184.5→39.7）；`--fast` 稳态 **36.2ms**。
复用失效时（换页/文字变化/超 1.2s）自动回落到现算，宁可慢不给旧框。

### 2.3 没有采纳的"快速路径"：省 OCR 会让状态静默降级（反例）

同一帧 f06（派蒙菜单）：`ocr=false` 时 `world` 判 **UNKNOWN**；带 OCR 文本盒才判 **GAME_PAIMON**。
因为 `ys-state` 的本体态后备需要文本框（`decide_with_native`）。⇒ **`look --fast` 只跳检测+结构（省 40–90ms），
OCR/判态/容器照常**；毫秒级靠复用而不是砍证据。这条已写进 `worldsvc capabilities` 与
`.agents/skills/gui-world-state/SKILL.md`（门禁 `skill-coverage` 校验）。

### 2.4 OCR：测了降尺度，召回不达标 ⇒ 不采纳（数据在此）

以 det_max=2000 为基线，6 帧逐框 IoU≥0.5 对齐：

| det 输入长边 | det p50 | 字符召回 mean/min | 漏框 | 结论 |
|---|---|---|---|---|
| 2000（现状） | 156ms | 100% | — | 保留 |
| 1600 | 139ms（−17ms） | **93.97% / 92.04%** | 15/172（`min:/max:/FPS` 小字） | ❌ 召回降 |
| 1280 | 106ms | 83.13% / 78.05% | 39/172 | ❌ 召回降 |

用户口径要求"保持识别召回不降"⇒ **不降 det 尺度**。OCR 的冷成本（~400ms server）仍是冷帧最大头；
现有收益来自对象切片内容寻址缓存 + 1.2s 文本 TTL（同屏文本层 1.5ms）。

### 2.5 动作路径：慢的不是感知，是子进程与重复 OCR

逐段实测（离线 fixture `evidence/expect-fixtures/{before,after_grid}.png`）：

| 段 | 优化前 | 优化后 | 做法 |
|---|---|---|---|
| `state_in` expect | 677–1670ms/次（`ys-state` 子进程） | **冷 ~1.8s / 同帧热 0.7ms** | 常驻 `cmd=world`（`ocr=true`、objects/structure=false、`apply_uid=true` 保 UID 补判），子进程只作失败回退 |
| 证据 `detail.png` | 1.5s（无 OCR）/ 2–30s（带 OCR） | **~30ms** | 进程内 PIL 裁切；文本证据由 `expect_result.observed` 给出（不再重复 OCR） |
| 失败时 `detail-actual.png` | 同上（带 OCR） | **~30ms** | 同上 |
| `ys-watch` 的 OCR | 每次 `ys_ocr.py` 子进程（引擎 1–3s） | **daemon OCR（~0.7–1.5s 全域裁区 / 区域更快）** | `YS_WATCH_OCR_DAEMON=1`（instruments 默认），失败自动回退 |
| 轮询 | 固定 300ms 间隔、立刻拍第一帧 | 20ms 起指数退避（封顶 `--poll-ms`）+ 预算前瞻 | 剩余 < 上轮 expect×1.1 即停，记 `EXPECT_BUDGET_STOP` |
| 回执 | 无分段 | `result.timings{resolve_ms,inject_ms,expect_total_ms,last_expect_ms}` + `polls` | 失败可归因 |

**act dry-run（已 warm 帧）= 2.1ms**（解析 2.1ms + 校验），已达 ≤50ms。
**仍未解决**：`ys-watch` 子进程启动 ~0.5s + 文本 OCR（`expect_pixel` 582ms、文本 expect ~1s）；
真注入（`inject_click` 走 `ys-gui-slot`）**未实测**（无用户在场，不动屏幕）。

### 2.6 顺手修掉一个真 bug：daemon `cmd=ocr` 的 RGB/BGR 口径

daemon 把 RGB 数组直喂 OCR 引擎（`ys_ocr.py` 走文件路径时是 BGR），实测把「官方社区」读成「一官方社区」。
改成 BGR 后，`ys-watch` 的 daemon 通道与本地通道在 fixture 上 **events 22/22、slots 完全一致**。
这是"常驻 OCR 可替代子进程"的前提，也是本轮唯一影响识别结果的改动（方向是修正，不是降级）。

---

## 3. 未达标项与原因（不粉饰）

1. **冷帧 world 全量 643.9ms**（p95 1540ms）：OCR 315.7 + 容器 158.5 + load 91.9 + 判态 34.6 + 检测 32.2 + 结构 33.4。
   冷启动按 AGI-BAR 不计入，但"换一个界面"仍会付一次；OCR 是物理大头，降尺度会掉召回（§2.4）。
2. **对象检测 32–35ms vs ≤10ms（3×）**：已知欠账（PERF-LEDGER #5）。本轮未改模型/输入尺度；
   CUDA 冷启动时首调可达 563ms（重启后第一次 `_DETS` 懒加载），稳态 32ms。
3. **expect 子进程仍 ~0.6–1.4s**：`ys-watch` 的进程启动（numpy/PIL 导入）未常驻化；文本 expect 还有 OCR。
   下一步：把 `ys-watch` 的 API 进程内化，或给 daemon 加 `cmd=text_diff`。
4. **真注入路径未测**：`inject_click`（`ys-gui-slot`）在真机上可能 0.5–2s；焦点租约内点击（历史 32ms）本轮未复验。
5. **活体抓帧未接入常驻环**：`ys-capture latest` 只读 40ms，但 `_world_frame` 的 live 默认仍是
   ImageMagick/ys-capture 子进程 + 解码；in-process XShm 因窗口 id/归属不可测，本轮未改（避免未验证的性能路径）。
6. **selftest 88/90**：两条失败与本轮改动无关（`daemon-world/对象数与 cli 一致`：48 检测 vs 22 容器，
   是 2026-10-19「选更全的源」规则的既有断言冲突；`act/free_text 命中但无坐标 → 拒绝` 走 cli 后端/ys-screen，
   本轮未改该路径）。如实披露，未修改断言让它变绿。

---

## 4. 回归读数（四元组：命令 / 工作目录 / 退出码 / 关键行）

工作目录统一 `/home/h/genshin-ts`。

| 命令 | 退出码 | 关键行 |
|---|---|---|
| `tools/failure-ledger check --fast` | 0 | `LEDGER-RESULT … verdict=PASS`（见 §4.1） |
| `./tools/ys-gates --only 2` | 0 | `汇总: PASS 1 / FAIL 0 / BLOCKED 0`；8 套件全绿（lookd-wedge 27.6s / screen-digest 25.6s / resolve-click 20.2s …） |
| `tools/ys-editor/ys-state --regress --channel both` | 0 | `通道 full 24/24 = 100.0%` / `通道 fast 24/24 = 100.0%` |
| `python3 .scratch/gui-service/bench_check.py --from-json evidence/perf-after.json` | 0 | `PERF-SUMMARY fails=0 warns=0` |
| `bash .scratch/gui-service/bench-check.selftest.sh` | 0 | `BENCH-CHECK-RESULT pos=1 neg=1 verdict=PASS` |
| `python3 .scratch/gui-service/selftest.py` | 1 | `88/90 PASS, 2 FAIL`（两条既有失败，见 §3.6） |

### 4.1 账本

新增账目 **F-20261021-59**（class=判据，status=prevented），gate=`perf-bench`
（`python3 .scratch/gui-service/bench_check.py --runs 3`，slow 档），inject
`bash .scratch/gui-service/bench-check.selftest.sh`（正例 + 把 cache_hit 回归线改为 0 必须报红）。
阈值文件 `.scratch/gui-service/perf-thresholds.json`：bars 只 WARN（AGI-BAR 目标），regression 才 FAIL
（steady ≤120ms、cache hit ≤10ms、state ≤90ms、world cold ≤1100ms、OCR objects cold ≤900ms、act dry ≤130ms）。

---

## 5. 复现

```bash
# 1) 分组件基准（换盐=造新内容，避免磁盘缓存污染冷项）
python3 .scratch/gui-service/bench_perf.py --tag after --salt 9
# 2) 判定回归线
python3 .scratch/gui-service/bench_check.py --from-json .scratch/gui-service/evidence/perf-after.json
# 3) OCR 降尺度召回实验（复算 §2.4）
python3 .scratch/gui-service/det_scale_probe.py --frames 6
# 4) 动作路径离线链路
python3 .scratch/gui-service/selftest.py
```

回执：`evidence/perf-before.json` / `evidence/perf-after.json` / `evidence/det-scale.json` /
`bench-perf.md`（人读表）。

---

## 6. 下一步（按收益排序）

1. **OCR 冷路径**：det 不降尺度的前提下换更快的 det（量化/FP16/更小模型）并用 `det_scale_probe` 同口径验召回；
   或对"新页"只做一次 det、rec 只算变化切片（切片缓存已在）。
2. **expect 常驻化**：把 `ys-watch` 的比较逻辑与 OCR 全部走 daemon（当前子进程 0.5s + OCR 1–3s 是 act 剩余大头）。
3. **检测器 ≤10ms**：预处理改 cv2/GPU 或模型量化；验收用 `bench_perf` 的 `detector_ms` + 真值集。
4. **活体路径**：把 `_world_frame` live 直接接 `ys-capture` 环（in-process XShm），在**用户在场**时验证归属与可见交互层。
5. **真注入复验**：焦点租约内点击是否仍是 32ms 级；act 端到端在可见交互层重测。

---

**层级声明**：本报告所有数字来自**后台离线帧**（read-only），证明"看得见/算得快"，不证明"动得了"。
真注入与可见交互层验证需用户在场，本轮未做。
