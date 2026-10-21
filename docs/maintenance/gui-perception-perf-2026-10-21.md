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

> CLI 口径补充（终验）：`worldsvc.py look --frame f06 --backend daemon-world` **冷 1648ms / 同帧热 111ms**；
> 同帧热里 ~35ms 是解释器+`instruments/worldsvc` 导入（AGI-BAR 的"冷启动不计入"）。
> **进程内服务**同帧热 look 实测 **5.5–18.7ms**（full）/ **3.9–4.6ms**（--fast，第二次起）。

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

---

# 反馈轮（真机反馈 → 分层优化，2026-10-21 16:2x–17:0x）

> **口径**：本节「前」= W1-retry2 真机前台帧 + 真实注入；「后」= **离线可复现读数** + 代码路径。
> 真注入验证需用户批准 1×60s 轮次（见 §6），本轮未再占屏。用户令：先停真机、进入反馈轮。

## 0. 有效占用比（用户要求的核心设计判据）

W1-retry2 占用 **42.1s**，其中注入+验证约 **8.1s**（click 4.99 + 4 次滚动注入 3.15 + 5 次 look 4.3 中的读帧/OCR 部分）
⇒ **有效占用比 ≈19%**。目标：扫描循环 ≥60%。

会话模式算术（离线可复算）：每屏 = scroll 注入 1.05s + settle 0.15s + look 0.8s = **2.0s**，
其中 inject+verify = 1.85s（92.5%）；会话 setup 只付一次（~2s/60s）⇒ 全局 **≈89%**。
判据命令：`python3 .scratch/gui-service/step_sim.py` / `ys-scroll --plan`（见各层）。

## 1. 六层表（层 / 前 / 后 / 改法 / 判据与命令）

| 层 | 前（真机） | 后（离线读数/代码） | 改法 | 判据 / 命令 |
|---|---|---|---|---|
| **L1 进程/占用** | 每动作自建 slot：scroll **4.96–5.58s/次**、ESC 6.65s、click 4.99s；有效占用比 19% | 新增 `ys-session`：一次 setup，动作直注入；`ys-scroll --plan` 会话命中 `in_slot=true`；离线 setup 组件 kwin-state 143.5ms + resolve 83.1ms + grant 54.6ms + coach 87.9ms | `tools/ys-editor/ys-session` begin/end/status；`ys-scroll`/`ys-pointer-click`/`ys-esc` 读 `~/.ys/session.json` 后置 `YS_SLOT_ACTIVE=1`；回执带 `session_id` 与 `timing{inject,settle,verify,total}` | 会话 dry-run：`YS_SESSION_PATH=/tmp/s.json ys-session begin --seconds 60 --dry-run` → status active=false；假会话 `ys-scroll --plan` → `in_slot=true`；`ys-esc --plan` → session=1 |
| **L2 输入注入** | ESC 6.65s 里固定 `sleep 2` = **2.12s**；scroll 固定 settle 0.6s；coach 87.9ms | `ys-esc` 固定等待 **2.12s → 0.2s**（`YS_ESC_SETTLE_MS`），key down/up 合并；`ys-scroll --settle-ms 150 --no-hint` | 去固定 sleep，调用方用状态轮询；`ys-scroll` 暴露 `--settle-ms/--no-hint` | `ys-esc --plan` → `settle_ms=200`；`ys-scroll --plan` → `settle_ms=150`（命令见下） |
| **L3 判读/抓帧** | 首 look **3.15s**；扫描期 look 0.77–0.95s；daemon 首次 world detector **699.5ms**、state 970.2ms、load 290.4ms | live 默认 `ys-capture`：**45.7ms p50**（36.2–45.7 热，219 冷）；daemon 预热后首次 world **375.3ms**（detector **37.1ms**、state **95.4ms**、load 178.4ms）；预热后同帧 warm world **97.1ms**（load 0.1/state 35.8/objects 1.2/detector 44.6/structure 53.0） | `_capture_frame_soft` 默认 ys-capture，失败回退并标 `timing.frame_source`；daemon 新增感知预热线程（ys-screen + D2 双模型真跑 dummy detect）＋状态全量 32 锚点预热 | `journalctl --user -u ys-lookd \| grep 感知预热` → `感知预热完成（…）`；离线首调命令见下；`frame_source` 字段在 look.timing |
| **L4 缓存/扫描读** | 扫描期 0.77–0.95s/屏，页级复用失效（整页变了） | **条带协议离线判据未通过**：3 组合成滚动（dy=400/800/1200）行召回 **63.6% / 90.9% / 75.0%**，行序 all false；条带 OCR **1021/703/938ms** vs 全帧 **655/774/733ms**（没有更快） | 不采用条带 OCR 替换全帧；保留静态页复用（37.6ms 稳态） | `python3 .scratch/gui-service/strip_probe.py` → `STRIP-PROBE pass=False`；回执 `evidence/strip-probe.json` |
| **L5 步长/标定** | clicks5≈4 行、clicks40≈6 行（非线性）；上次 0.58 行/次 | 用 W1 重叠行名反推：**35 clicks→6.14 行（5.70 clicks/row）**、**30 clicks→4.11 行（7.31 clicks/row）**；中位 **6.5 clicks/row** ⇒ 目标 5 行 = **33–34 clicks**；7 行视口留 2 行重叠 ⇒ 不跳行 | `ys-scroll --rows N`（calib 最小二乘反查，clamp 5–80）；扫描驱动用上一屏实际位移闭环修正 | `ys-scroll --rows 5 --plan` → `clicks=34`；`python3 .scratch/gui-service/step_sim.py` → `no_skip=True`、`recommended_clicks=33` |
| **L6 决策/批量** | 每屏 look 一次；未做批量 | 离线判据：视口 7 行、目标步长 5 行（2 行重叠）→ **不能盲批两屏**（2×5=10 >7，会跳 3 行）；批量必须「滚动同时抓帧」或先做 5 行闭环 | 单屏 5 行闭环先行；批量留待真机滚动+抓帧同窗验证 | `step_sim.py` 的 `viewport_rows=7 / overlap_rows=2 / no_skip=True`；批两屏判据=步长和>视口则拒绝 |

## 2. 关键结论（不粉饰）

1. **真机 loop 的固定开销已被拆出来**：slot setup（kwin-state+resolve+grant+raise+settle+coach）是 4–5s 的主因，不是滚轮/OCR。
2. **会话对象把「重复 setup」变成一次性**；离线可证状态机与动作集成，但**真注入仍需 1×60s 验证**（会话内直注入、ys-esc 去 sleep、live 帧来源）。
3. **条带 OCR 当前不达标**（行召回/行序/耗时三项都没过）⇒ 不上线；要判定它是否可行，必须用**真实连续滚动帧 + moved_px** 重跑，而不是合成帧。
4. **检测器预热是真收益**（首次 699.5→37.1ms），但会拉长 daemon 启动 ~2.3–5.3s；因为后台线程，不阻塞 listening。
5. **判读仍是大头**：warm look 97ms（离线帧）里 state 35.8 + detector 44.6 + structure 53.0；真机 live 还会加抓帧 ~46ms。下一步若还要压，先压 detector（44.6ms）与 structure（53ms），不是 OCR（扫描页 OCR 仍 ~500ms）。

## 3. 复现命令（离线，不占屏）

```bash
# 会话对象（dry-run，不 grant/不抬窗）
YS_SESSION_PATH=/tmp/ys-s.json tools/ys-editor/ys-session begin --seconds 60 --dry-run
YS_SESSION_PATH=/tmp/ys-s.json tools/ys-editor/ys-scroll --at 1,1 --rows 5 --plan
YS_SESSION_PATH=/tmp/ys-s.json tools/ys-editor/ys-esc --plan

# 步长闭环模拟（W1 真机 5 屏）
python3 .scratch/gui-service/step_sim.py

# 条带 OCR 离线判据（当前 pass=False）
python3 .scratch/gui-service/strip_probe.py

# daemon 预热首调（重启后等「感知预热完成」再跑）
python3 - <<'PY'
import sys,os,time,json; sys.path.insert(0,'.scratch/gui-service'); import instruments as I
F=os.path.abspath('.scratch/gui-corpus/f06.png'); P=os.path.abspath('.scratch/gui-profiles/qianxing.json')
t=time.time(); r=I.daemon_rpc({"cmd":"world","frame":F,"profile":P,"ocr":False,"objects":True,"structure":True,"cache":False},timeout=120)
print(round((time.time()-t)*1000,1), json.dumps(r.get("timing"),ensure_ascii=False))
PY
```

## 4. 真机轮次申请（待 Lead 向用户申请，不自行占屏）

- **1×60s**：`ys-session begin` → 会话内 `ys-esc`（去 sleep）+ `ys-scroll --rows 5` + `look` 循环 → 扫好友列表到第一个 ≥30 天（或到 55s 硬停）。
- 失败判据：①任一动作 rc≠0 立即停手 revoke 并贴原始输出；②`frame_source` 出现 `import-fallback` 记降级；③扫描 5 行步长出现行名断档（跳行）即判 L5 失败。
- 成功判据：找到第一个 `N天前` N≥30 的行并留 crop；有效占用比 ≥60%；单次滚动 ≤2s。

---

# 真机最终轮（反馈验证，2026-10-21 16:5x）

> 用户授权：「允许它自己切桌面」（仅本轮）。55s 硬停；每轮结束已 `ys-session end`。

## 四数字（能拿到的）
| 指标 | 目标 | 实测 | 判定 |
|---|---|---|---|
| **有效占用比** | ≥60% | **71.2%**（inject 5449.7ms + verify 2806.3ms / 11.6s） | ✅ |
| **单次滚动** | ≤2s | **1463ms p50**（34 clicks；inject 1286–1555ms + settle 150ms） | ✅ |
| **单屏循环（滚+读）** | ≤3s | **2290ms p50** | ✅ |
| **60s 内扫了几屏/几行** | — | **4 屏 / 16 行（14 unique）** 后误判 STALL；未到 ≥30 天边界 | ❌ 未完成 |

导航（同一 session 链路，另一轮）：世界→派蒙 **5349ms**、派蒙→好友 **3164ms**；点击「好友」坐标按 xywh 中心命中。

## 失败点（按执行证据）
1. **仪器冲突（已修）**：`ys-capture status` 的 `strict.verdict=OTHER_DESKTOP`、`current_desktop=2`、`window.desktop=[3]`，而同一刻 `ys-lease kwin-state` 给 `desktop=3 active=yuanshen.exe`。`look` 原始回执行：
   `{"status":"error","error":{"code":"ATTRIBUTION_OTHER_DESKTOP","detail":"常驻服务报错：live 取帧归属校验未通过：OTHER_DESKTOP"}}`
   ⇒ daemon 抓帧的 **fast(EWMH) 门**与 KWin strict 打架。修法：`_capture_frame_via_ys_capture` 改 `latest --allow-background`（只关 fast 门），返回后以 **KWin strict** 裁决；strict≠OK 仍 fail-closed。修后 `look/s0` 成功（779ms，`frame_source=ys-capture`）。
2. **状态标签误判（已加证据旁路）**：好友面板滚动中 `state` 被判成 `GAME_WORLD`，但对象里仍有 `好友／我的好友` + 行文本；驱动加 `is_friends()`（header/行证据）后继续扫。
3. **STALL 误判（已修）**：行名取成了长签名（`谁怜憔悴更凋零…`），两屏相同即判停；改为「短 token（≤8 字、无标点）优先」。修后未再验证（本轮已用完）。
4. **交还目标异常**：`session_end12` 的 restore 目标是 `素材快收[Tk]`（idx 10），不是 firefox；靠随后 `revoke` 才回到 firefox。最终 `active=firefox`、`desktop=2`，但 `firefox.idx(8) > game.idx(8)` **不成立**（相等）⇒ 三件判据未全满足。已修：`ys-session begin` 的 `prev_active` **优先 firefox**；`end` 增 `handback_ok` 三件校验，不满足返回非零。

## 回答两个问题
1. **`latest --allow-background` + KWin strict 是否应成为 daemon 抓帧的唯一路径**：**是**。fast/EWMH 只作提示/低延迟读数，**裁决只用 KWin strict**；strict≠OK 时仍 fail-closed。已按此改。
2. **strict 也判 OTHER_DESKTOP 时正确行为**：`look` 应返回 `ATTRIBUTION_OTHER_DESKTOP` + `state{window_desktop,current_desktop}` + `next_action{ys-follow-win}`（与 resolve-window 同款），而不是只回一个 code。当前只回 code；建议下一轮补详情（本条记为 open）。

## 原始片段（可复算）
```
[scan] cap.status=... "strict": {"verdict":"OTHER_DESKTOP","current_desktop":2,"window":{"desktop":[3],"class":"yuanshen.exe"}}
[scan] kwin/state ... desktop=3 active=yuanshen.exe
[scan] look/nav_paimon0 rc=8 out={"status":"error","error":{"code":"ATTRIBUTION_OTHER_DESKTOP",...}}
[scan] SCAN-RESULT {..., "n_screens":4,"n_rows":16,"n_unique_rows":14,"effective_ratio":0.7117,
  "scroll_p50_ms":1463.2,"loop_p50_ms":2290.5,"stalled":true}
```

## 真机最终轮 2（用户手动切桌面后，2026-10-21 16:59）

**结果**：`ys-session` 一轮 31.5s（总 38.3s），**10 屏 / 48 行（40 unique）**，全部仍是「今日内」，
**未命中 ≥30 天**（36s deadline 到点停，不是 STALL）。`handback_ok=true`。

| 指标 | 目标 | 实测 |
|---|---|---|
| 有效占用比 | ≥60% | **64.6%**（inject 13140.5 + verify 7206.8 / 31.5s） |
| 单次滚动（34 clicks） | ≤2s | **1439.9ms p50** |
| 单屏循环（滚+读） | ≤3s | **2112.3ms p50** |
| 屏/行 | — | **10 屏 / 48 行（40 unique）**，无 ≥30 天 |
| 导航 | — | 世界→派蒙 **3169ms**、派蒙→好友 **3560ms** |
| 交还三件 | — | `active=firefox` idx8 > game idx7；`desktop=2 = prev_desktop`；`revoke=ok` |

**为什么没到边界（读数，不是猜）**：10 屏对象文本里每天都是 `今日内`（`free_text` 同样只有「今日内」），
说明该好友列表「今日内」档很长；48 行还没进入「1天前」。按 5 行/屏、2.1s/屏，需要更多轮次而非修代码。
**已有修复**：STALL 误判（短 token）、capture fast/strict 冲突、`prev_active` 优先 firefox、handback 三件校验。

---

# advice[]：模块主动指出「笨办法」（当前实现，2026-10-21）

> **口径**：离线回放（`session_run13` 的 10 屏 JSON），不是真机/可见交互。真机大跳探针待批。

## 唯一实现
`tools/ys-editor/ys_advice.py`（`ListTracker.observe`）；daemon `_world_advice()`、离线回放
`tests/advice.selftest.py`、`ys-scan` 全部 import 它，**没有第二份阈值**。

## 识别与估算
- 有序列表：≥3 个 `kind=row`（高度 ±20%）+ 标题 `\d+/\d+` + 可排序属性（`N天前/小时前/分钟前`；
  `今日内`=0，`在线`=-1）。
- `list_sig = sha1(state | header | count)`；**不用首行**（滚动每步都变），标题缺失才退回首行+高度。
- 线性扫：同一 sig 连续 ≥3 次 look，`0 < 本次新增行 ≤ 视口` 且其中 ≥2 次 top 行变化，
  且 `count >> 已见`；**每次新增行数中位 = `net_rows_per_step`**（不用视口行数）。
- estimate：`screens=ceil((count-seen)/net)`、`linear_seconds=round(screens*loop_p50/1000,1)`、
  `probes=ceil(log2(max(2,screens)))`；`loop_p50` = look 间隔中位（含客户端滚动）。
- 降级：无 count ⇒ 不给 `linear_screens_remaining`；无 loop_p50 ⇒ 不给 `*_seconds`；
  单调度不成立 ⇒ `SUGGEST_JUMP_ONLY`（不给二分估算）。
- `attribute`/`order`：原样属性名 + 实测单调方向（`asc/desc`，不确定 `null`）。

## 离线回放断言（可重算）
```bash
python3 tools/ys-editor/tests/advice.selftest.py
# ADVICE-RESULT screens=10 first=s02 code=SCANNING_LINEARLY estimate_ok=1 neg=1 verdict=PASS
```
输入：`session_run13.out`（10 屏 scroll/look 实测）+ `screen/s00..s09.json`。
断言：第 3 次 observe（s02）出 `SCANNING_LINEARLY`；`linear_seconds` 用实测 gap p50 重算一致；
`net_rows_per_step=4` 与实测 48 行/10 屏=4.8 的误差 16.7% ≤20%；负例（无 row）不出建议。

## 门禁 / 账本（已接主链）
- `tools/ys-gates --only 2` 套件表新增 `advice`：实跑 `ADVICE-RESULT ... PASS`（92ms）。
- `tools/failure-ledger.gates.tsv` 新增 gate `advice`；账本 **F-20261021-63**（判据/prevented）；
  `tests/ledger-inject.sh advice-neg`：把列表检测关掉 → 自测必须红（实测 `INJECT-PASS`）。
- `failure-ledger check --fast`：`gates=21 gate_fail=0 unproven=0 verdict=PASS`。

## `ys-scan` 大跳可行性（未测，不冒充结论）
- 已有实测：`ys-scroll --rows 5`（34 clicks）在 run13 的净推进 **≈4.8 行/步**（48 行/10 屏）。
- **一次 `--rows N` 最大稳定跳多少行、会不会丢事件：没有离线数据**（需要真机）。
- `tools/ys-editor/ys-scan --jump-plan` 列探针：rows=8/16/24/32，每个 before/after 各一次 look，
  记录实际行位移与是否出现行名断档；失败判据 `moved_confirmed=false` 或行名 gap。
- 真机需求：**1×60s**（4 个探针 + 各一次 look），等用户批准；不自行占屏。

## 大跳探针（真机 1×60s，2026-10-21 17:2x）

| 请求(行) | clicks | moved_px | 实际(行, est) | moved_confirmed | LOST |
|---|---|---|---|---|---|
| 8 | 61 | 866 | **5.22** | true | false |
| 16 | 80 | 756 | **4.50** | true | false |
| 24 | 80 | 751 | **4.52** | true | false |
| 32 | 80 | 756 | **6.64**（pitch 113.8 噪声） | true | false |
| 48 | 80 | 769 | **4.27** | true | false |

- **结论①**：`--rows N` 的 clicks 上限是 **80**（代码 clamp 5–80）⇒ 请求 16/24/32/48 全部被压成 80 clicks，实际只走 **4.3–6.6 行**。**能稳定拿到的实际跳幅 ≈5 行（8 请求→61 clicks→5.22 行）**；再大不生效，二分应把单步限制在 ≤5 行。
- **结论②**：一次「跳+读」实测 **≈5.4s**（范围 5.2–6.6s，含 `--verify` 两次抓帧；纯注入滚动本身 ~1.4s）。二分 5–6 次探针 ≈ **27–32s**。
- **LOST**：5 次都 `moved_confirmed=true`、无空屏、首行变化；但本轮**没测复位**（`reset_ok=null`，预算优先 5 个请求），所以 LOST 判据未覆盖「复位不回首行」。
- **交还**：`active=firefox` idx8 > game idx7；`desktop=2 == prev_desktop=2`；`revoke=ok`；`handback_ok=true`；总墙钟 **43.6s**。
