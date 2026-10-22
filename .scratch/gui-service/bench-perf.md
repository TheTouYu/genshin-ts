# GUI 感知层逐组件基准（check）

- 时间：2026-10-22T15:12:56+0800　runs=5　用时 55.2s　daemon pid=[1945735]　git=eb85d851
- 口径：**离线帧**（np.roll 造冷变体），全部离线分析，**不是可见交互**；不含屏幕授权动作。
- 复现：`python3 .scratch/gui-service/bench_perf.py --tag check`

| 组件 | p50 | p95 | n | 分项（p50） |
|---|---|---|---|---|
| socket 往返（warm） | 53.4 | 59.3 | 7 | IPC 地板 |
| 整帧 OCR（冷） | 667.7 | 760.1 | 5 | server_ms=667.0 n=27.0 |
| 按对象 OCR（冷） | 562.1 | 606.0 | 5 | server 471.3 = det 167.9 + rec 271.6；n_obj 44.0/n_ocr 44.0 |
| 按对象 OCR（同帧热） | 122.9 | 132.0 | 5 |  |
| 帧加载（PNG→GPU float） | 353.7 | 368.8 | 5 | load 96.7 state 59.4 |
| 判态（帧已缓冲） | 55.9 | 62.6 | 5 | judge 54.6 |
| 容器层（冷） | 529.2 | 547.8 | 5 | objects 168.6（load 110.3 state 62.0） |
| 容器层（同帧热） | 61.5 | 68.7 | 5 | objects 1.3 |
| 检测器+结构（冷） | 568.3 | 623.3 | 5 | detector 46.4 structure 48.1（另含容器 166.4） |
| world 全量（冷） | 1113.7 | 1204.2 | 5 | load 98.8 ocr 482.5 state 65.7 obj 179.9 det 47.7 struct 49.9 |
| world 全量（TTL 热） | 72.2 | 83.0 | 5 | ocr 2.0 state 66.0 obj 1.1 det 0.0 |
| world 全量（帧级缓存命中） | 3.8 | 4.5 | 5 |  |
| world 快速路径 --fast（留 OCR、跳检测+结构，冷） | 879.1 | 925.9 | 5 | load 89.5 ocr 381.2 state 59.2 obj 160.6 |
| world 快速路径 --fast（稳态） | 65.7 | 569.0 | 5 | ocr 2.3 state 60.9 obj 1.1 |
| world 无 OCR/无结构（只判态+容器、冷） | 579.9 | 620.4 | 5 | load 111.9 state 64.7 obj 179.5 |
| world 快速路径（TTL 热） | 65.0 | 72.7 | 5 | state 61.0 obj 1.6 |
| world 快速路径（帧级缓存命中） | 2.0 | 3.8 | 5 |  |
| worldsvc look（daemon-world，进程内） | 852.9 | 1075.5 | 3 |  |
| worldsvc look --fast（稳态） | 2.1 | 2.2 | 3 |  |
| act dry-run（已 warm 帧：解析+校验） | 3.5 | 3.6 | 3 | resolve 3.5 |
| expect state_in（同帧热） | 1.0 | 1.2 | 3 | eval 1.0 |
| expect pixel_delta（ys-watch 子进程） | 0.1 | 616.8 | 2 |  |
| ys-capture latest（只读抓帧） | 44.6 | 49.7 | 3 |  |

- 序列化：world 回执 32953.0 B，客户端 json.loads 0.39 ms/次。

## 对照 AGI-BAR 目标

| 目标 | 阈值 | 本次读数（p50） | 判定 |
|---|---|---|---|
| 单次默认路径 | ≤50ms | 见上表对应行 | 见交付报告 §结论 |
| 缓存命中 | ≤5ms | 见上表对应行 | 见交付报告 §结论 |
| 对象检测单帧 | ≤10ms | 见上表对应行 | 见交付报告 §结论 |

> 注：数据为**后台离线帧**读数；live（可见交互）需另测，且动作路径受焦点租约影响。
