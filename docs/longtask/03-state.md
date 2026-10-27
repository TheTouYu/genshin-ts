# 共享现状：机器、常驻服务、门禁（L1 · 每轮收尾必改）

> 状态：当前实现（**读数以本文件为准；改动后立刻更新，过期读数比没有更危险**）
> 来源：只读实测（进程/窗口/门禁/工具自报），每条注明测量时间
> 最近校验：2026-10-24 11:5x（多线改造：本文件只放**共享面** + 标了线 id 的分节；分线断点见 `LINES.md`）
> 读法：先看 §一 找"我这条线的读数在哪" → 只读本文件里属于你那条线的分节，别改别线的

---

## 一、分线读数的归属（本文件不声明"唯一在跑的线"，见 [`LINES.md`](LINES.md) §二）

| 线 id | 断点与现状读数在哪 | 本文件里属于它的分节 |
|---|---|---|
| `football` | [`dossiers/football-v3.md`](dossiers/football-v3.md) §三/§五 | §三 标 `[football]` 的行 |
| `sim-2d` | [`dossiers/simulator-2d.md`](dossiers/simulator-2d.md) §三/§五 | §三 标 `[sim-2d]` 的行 |
| `gui-agi` | [`dossiers/gui-agi.md`](dossiers/gui-agi.md) + `.scratch/gui-stack/STATE.md` | §二 全部、§三 标 `[gui-agi]` 的行、§五 |

> 规矩：本文件新增分线读数**必须带线 id**；收尾只改自己那条线的分节（`LINES.md` §四）。

## 二、性能读数（`[gui-agi]` 线；2026-10-22 测得，该线不推进时不更新）

| 指标 | 空闲 / 游戏退出 | 原神在跑 | 备注 |
|---|---|---|---|
| 判态 `ys-state` | **123–129ms** | **330–340ms** | 125ms 达标只在空闲成立（`0a866a02`） |
| daemon RPC | ~88ms | ~180ms | 裸 daemon 127–132ms（旧读数） |
| 抓帧 | — | — | `ys-capture` 0.5s；daemon 2ms |
| 对象检测 | — | — | 27.6ms；D2 micro 0.272 |
| 结构层 | — | — | 9.9ms；parent F1 编辑器 0.78 / 游戏 0.91 |
| 全帧 OCR 真推理 | **529ms**（p50，n=12） | **929ms**（p50，n=12） | 分段 load 75.5 / det 138 / cls 118.6 / rec 188（`0856fb0e`） |
| OCR 同帧缓存命中 | **0.5–1.1ms** | — | 只对"同一帧重复看"成立 |
| OCR 冷启动 | 引擎预热 6048ms；首次 rpc 22147ms | — | 一次性代价，靠常驻规避 |
| `ys-lookd` 显存 | 旧进程 2588 MiB / 新进程 1492–1836 MiB | — | det 全帧输入 694 MiB 是主导项 |

## 三、门禁与回归（按线分组；动手那条线只跑自己这几行）

| 线 | 套件 | 读数 | 时间 |
|---|---|---|---|
| `[gui-agi]` | `./tools/failure-ledger check --fast` | 62.1s，gates=28，gate_fail=0，PASS | 2026-10-22 21:5x |
| `[gui-agi]` | `./tools/failure-ledger check`（全量） | 空闲 550s / 游戏在跑 700s | 改动后未复跑 |
| `[gui-agi]` | `worldsvc-selftest` | **123/123**，24.5s（注入用例 1.66s） | 2026-10-22 |
| `[gui-agi]` | `./tools/ys-gates` | 六门槛 PASS | 2026-10-17 起 |
| `[sim-2d]` | `node qxqy/runner.mjs`（在 `workspace/tetris`，v2 主战工程） | **22/22 PASS，268.2s**（波2 完成：T5 hard ρ=0.30 + T8 进阶操作；波3 T0 独占窗口进行中） | 2026-10-27 17:2x |
| `[sim-2d]` | `node qxqy/runner.mjs`（在 `workspace/hmlt-qixia`，等用户导入） | 17/17 PASS（上一活跃工程，冻结态） | 2026-10-24 11:4x |
| `[football]` | `npm run test:creations` | 6 断言，契据=与编辑器逐字节相等 | 2026-10-24 00:1x |
| `[global]` | `npm run build` / `npm run quicktest` | 未在本轮复跑（本轮只改文档） | 2026-10-24 |

## 四、机器与常驻服务（只读实测，2026-10-24 11:5x）

```
原神           在跑：bwrap 包装 pid 2903042 → 子进程 2903045 命令行含 YuanShen.exe
               ⚠ 别用 pgrep -f YuanShen.exe 直判：会先命中 bwrap 包装进程（D238 同型坑）
               bwrap 内 tmpfs 与外部文件系统隔离 ⇒ 外部按 /proc 看不到游戏日志落点，日志走 /home/h/.ys
dsh-embed / dsh-decision   inactive（原神在跑 → game-mode 正常暂停，非故障）
dsh-game-mode.timer        active (waiting)
dsh-sentinel.service       failed（10-23 00:00 status=1；手动 `--dry` rc=0 无输出 → 失败点未定位，见 05-open O-2026-10-23-5）
模拟器 web 127.0.0.1:4173   LISTEN，pid 621774（属于 `sim-2d` 线；工作区 /home/h/qxqy-workspace 是 counter-demo，不是本游戏）
GPU                        1897 / 6144 MiB
git                        HEAD 33ea9db6（sim-2d tetris v2 拆分落盘；此后队友提交持续推进，接手前先 git log 核对）
工作树                     `.scratch/gui-perf/selftest/*` 一批 M（与本轮无关，别误提交）
```

## 五、未修缺陷（会立刻撞上的；全属 `[gui-agi]` 线，除标注外）

1. `free_text` 字段名与语义不符（实为"无归属文字"）。
2. 文字按 y 行硬合并 → **跨栏混串**（一行 bbox 宽 2336px）。
3. `--format png` fail-closed：不命中预编码就 `FORMAT_NOT_READY`。
4. `[global]` `.scratch/three-games/BOARD.md` 状态表停在 10-17 04:00（回三游戏伞目标前必须刷新）。
5. `[sim-2d]` 真机导入目录现为 4 个文件（`hmlt-qixia-整合包.gia` 93,202 B + 2 个 baseline + `tetris-整合包.gia`）——导入时**别选错**。

## 六、最近提交（滚动保留；跨线都记，标线 id）

| commit | 线 | 内容 |
|---|---|---|
| `33ea9db6` | sim-2d | tetris v2：8 点反馈任务拆分文档（T0-T9+四波次+协作纪律），组建三队友团队 |
| `1f43f0e1` | sim-2d | 复盘：模拟器 demo→真机落地（8 错谱系/3 根因）+ gil-guard 检查器与门禁 + 两条技能新节 |
| `2bb8dbf1` | sim-2d | 档案：模拟器升 2.2.1，补「spawn 隔离故游戏侧无需更新」与 4173 重启 |
| `6743bc1f` | football | 档案补主线锚：手感基线=地图「足球_2」；造物子档加「上级目标与层级」 |
| `bb8ac6be` | football | 新增造物/技能链子档案并收尾（三件套同步） |
| `487b4d28` | football | 纠错：import 不给造物自动挂装饰物——机制是同号跨段克隆 aux |
