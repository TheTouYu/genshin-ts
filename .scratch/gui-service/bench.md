# GUI 世界状态服务：三动词延迟实测（bench）

> 状态：**当前实现**读数｜实测日期：2026-10-18T19:39:41｜仓库：`/home/h/genshin-ts`
> 复现：`python3 .scratch/gui-service/bench.py`（原始读数 `evidence/bench.json`；
> 同进程仪器尖刺 `python3 .scratch/gui-service/inproc_probe.py` → `evidence/inproc.json`）
> 帧：`/home/h/genshin-ts/.scratch/gui-corpus/f06.png`（3.4MB / 2560×1440）；alt：`/home/h/genshin-ts/.scratch/gui-corpus/f05.png`
> 硬约束：本会话不注入、不动游戏窗口；所有 live 路径未验证（窗口不在栈顶，`ys-atop` = NONE）

## 1. 三条路径并列

| 路径 | 场景 | 墙钟（ms，min/median/max） | 说明 |
|---|---|---|---|
| A. subprocess（现状实现） | 新进程首次 look（冷启动，3 次） | 1265.5 / 1285.3 / 1299.1 | worldsvc → ys-state CLI + ys-screen CLI；解释器 + 两次子进程；**跨次波动大**（daemon OCR 冷热/负载） |
| A'. subprocess | 同进程二次 look（禁缓存） | 1203.7 / 1215.2 / 1226.8 | **不热**：state 的本体 OCR 每次 ~700ms（daemon OCR 无缓存） |
| B. 裸 daemon RPC | `state`（PNG 帧） | 132.5 / 142.4 / 144.5 | 只判既有 8 态；GAME_* 返回 UNKNOWN ⇒ 不能替代 CLI 判态 |
| B. 裸 daemon RPC | `ocr`（同帧两次） | 669.1 / 683.4 / 697.6 | 无缓存：每次 ~700ms |
| C. in-process（原始） | state | 809.6 / 820.0 / 830.5 | importlib 加载 ys-state，同一判据代码 |
| C. in-process（原始） | objects（containers） | 150.9 / 192.4 / 233.9 | 每次 `load_small` 重新解码 PNG（~140ms） |
| C. in-process（复用补丁） | 同帧 look（首调，含一次解码） | 290.8 / 290.8 / 290.8 | 帧缓冲复用 + OCR 内容寻址缓存（state 仍走 daemon 判据） |
| C. in-process（复用补丁） | 同帧 look（稳态，2 次） | 147.3 / 151.4 / 155.6 | 稳态只付 daemon 判据（132–195ms 有波动）+ 容器缓存 |
| C. in-process（复用补丁） | 换帧 look（f05.png） | 382.2 / 382.2 / 382.2 | 新帧必须解码一次 + 容器层重算 |
| 缓存命中 | 进程内（同 frame_sha） | 0.9 / 1.1 / 1.2 | 纯内存返回 + 重新校验 schema |
| 缓存命中 | 新进程（含解释器启动） | 72.6 / 72.9 / 73.2 | 进程启动占大头 |

## 2. 分解（谁在花钱）

| 环节 | 实测 | 出处 |
|---|---|---|
| PNG 解码（2560×1440，PIL） | 106–187ms | `inproc_probe` decode_frame |
| `frame_id` sha256（3.4MB） | 2.4–3.1ms | `inproc_probe` |
| 状态判定（daemon，GPU 锚点） | **138–140ms**（judge_ms 138–140） | 裸 daemon `state` |
| 本体态 OCR（daemon，无缓存） | **685–729ms/次** | 裸 daemon `ocr` |
| 对象层 `load_small`（半分辨率解码） | 140–192ms | in-process / CLI |
| 容器层计算（同帧缓存命中） | 0–1ms | ys-screen timing |
| schema 校验（22 对象） | 1.3ms | worldsvc timing |
| 子进程摊销（python 启动+导入） | ~15 + ~110ms（numpy） | `python3 -c pass` / import numpy |

**结论：决定成本的是「本体 OCR 700ms」「daemon 判据 132–195ms」「PNG 解码 106–187ms」，不是我们的编排层。**
子进程形态下 `ys-state` 每次都要重跑本体 OCR（daemon 侧无 OCR 缓存）⇒ look ≈ 1.2–1.7s；
把它换成内容寻址 OCR 缓存（in-process 补丁）后，同帧稳态 look ≈ 160–200ms
（daemon 判据 132–195ms 有波动 + 容器缓存 6ms）。

## 3. 门禁判定（AGI-BAR §一）

| 门禁 | 目标 | 实测 | 判定 |
|---|---|---|---|
| 单次默认路径 look | ≤50ms | 新帧 1265.5–1299.1ms（cli 子进程）/ **世界仪器 GPU 新帧 1080–4089ms（OCR 主导，见 §7）** / 147.6ms（in-process 补丁，静默最优） | **未达成**（最好 147.6ms 也 >50ms；世界仪器的 judge 已降到 61–80ms，差距转到 OCR/容器层） |
| 缓存命中 | ≤5ms | 0.9–1.2ms（进程内） | **达成** |
| 对象检测单帧 | ≤10ms | 容器层同帧缓存 0–1ms / 新帧 140ms+ | **部分**：缓存命中达成，新帧未达成（需学习型检测，票 24） |
| 分块 OCR | < 1/3 全帧 OCR | 未实现切片（v0 `text_source=fullframe`） | 未验证 |
| 返回单块切片 | ≤5ms | 未实现（`slices=[]`） | 未验证 |

**方差说明**：本机是共享环境（队友代理 + 常驻 daemon 同时在跑），冷启动与 in-process 数字跨次波动
（冷启动 1.35–3.2s；in-process 补丁 141–585ms）。可行性判断用「静默 5 次」的最优/中位，日常体验用冷启动中位。

**≤50ms 不可达的证据链**（不靠推断）：
1. 纯缓存命中 1.1ms —— 已 ≤5ms；
2. 任何**新帧**都必须付一次 PNG 解码（106–187ms，物理地板）或等价的原始像素传输
   （daemon 抓帧 ~105ms，引用 ys-state 文件头实测注释；本轮未单独测 live 抓帧）；
3. 状态判据在 GPU 常驻服务里 **61–80ms（世界仪器，热；见 §7）**——旧 `state` RPC 推的 132–166ms 偏保守；
   但新帧的 OCR 634–3521ms、容器层 163–342ms 才是当前大头；
4. 若去掉本体 OCR，GAME_* 态只能判成 UNKNOWN（daemon 8 态）—— 这不是优化，是丢功能。
⇒ 要进 ≤50ms，必须换感知架构：GPU 帧流（不落 PNG）+ 学习型检测（票 24）+ 判据下沉到 GPU/常驻进程。
   这是「扩常驻服务 / 改共享工具」范畴，Lead 明确由他去找用户谈。

## 4. 三动词开销（缓存命中后，含子进程调用次数）

| 调用 | 墙钟 | 子进程调用 | 状态 |
|---|---|---|---|
| `look`（同帧，缓存命中） | 1.2ms | 0 | — |
| `act({"text": "祈愿"})`（dry-run，同帧） | 1.6ms | 0 | dry_run |
| `wait_until({"state_in": ["GAME_PAIMON"]})` | 1.5ms | 0 | reached |
| `act`（新帧，dry-run，禁缓存服务） | 1239.2ms | 2 | dry_run |

⇒ **编排层自己几乎不花钱**：缓存命中后 act/wait 都是 **0 次子进程、~1ms**；成本全在「新帧的第一次 look」。

## 5. act 的注入与等待路径（本会话未执行）

- `act(inject=True)` 需要：`post` 判据（缺 → 拒绝，`ACT_POST_REQUIRED`）+ `allow_inject=True` + 窗口在栈顶 + `ys-gui-slot` 硬通道；
- 本会话硬约束「不动游戏窗口、不注入」⇒ 注入路径**代码就位、未执行**（如实标 N/A，不算验证过）；
- `act(intent=...)` 委托 `ys-do`（有 pre/post 契约与 append-only 账本），但 `ys-do` 连 dry-run 也 `acquire_focus`（抬窗）
  ⇒ 本会话一律拒绝，回执 `precondition_fail / FOCUS_REQUIRED`。


## 7. 常驻世界状态仪器（`cmd="world"`）：host GPU 实测（2026-10-18 20:1x，Lead 主会话；daemon 已重启）

| 场景 | load | ocr | judge | objects | internal |
|---|---|---|---|---|---|
| 冷（重启后第一发，f06） | 158ms | 27ms（cache） | 343ms（首启预热） | 54ms | **582ms**（RPC 10045ms 是 daemon 首启，不计入预算） |
| 新帧 f07（daemon 热） | 164ms | **3521ms** | 61ms | 342ms | **4089ms** |
| 新帧 f08（daemon 热） | 202ms | **634ms** | 80ms | 163ms | **1080ms** |
| 同帧（服务层帧缓存关、daemon 结果缓存命中） | — | — | — | — | **1.1ms**（RPC 5–10ms） |

**结论（GPU 实测，修正旧推导）**：
- **判据（judge）在 GPU 上只要 61–80ms**（热；首启 343ms 是 CUDA/plan 预热）——之前按 `state` RPC 推的 132–166ms 偏保守；
- **现在的瓶颈是 OCR（634–3521ms 冷）与容器层（163–342ms）**，不是判据 ⇒ 落在 **票 25（分块并行 OCR + 切片缓存）**；
- 对象层在同帧与 `ys-screen --containers` 一致（22 容器），GAME_PAIMON 判对；
- 同帧重复请求 1.1ms（结果缓存）/ RPC 5–10ms。

## 6. 复现

```bash
python3 .scratch/gui-service/bench.py                # 本表
python3 .scratch/gui-service/inproc_probe.py         # 同进程尖刺（daemon 地板 / 解码地板 / 复用补丁）
python3 .scratch/gui-service/selftest.py             # 契约自测（离线，0 注入）
python3 .scratch/gui-service/worldsvc.py look --frame <帧> --backend daemon-world --summary  # 需新版 ys-lookd
```
