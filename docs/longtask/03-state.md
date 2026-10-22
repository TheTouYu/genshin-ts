# 现状：读数、在跑、断点（L1 · 每轮收尾必改）

> 状态：当前实现（**读数以本文件为准；改动后立刻更新，过期读数比没有更危险**）
> 来源：只读实测（进程/窗口/门禁/工具自报），每条注明测量时间
> 最近校验：2026-10-23 00:2x
> 读法：接手先读本文件 → 需要细节再看 `dossiers/`

---

## 〇、本次实验期（2026-10-22 19:0x–19:3x）的特殊状态

**原神已由用户关闭**；两个 AI 服务（`dsh-embed` + `dsh-decision`，合计 **3127 MiB 显存**）**被 Lead 暂停**用于 OCR 专项实验：
```
systemctl --user stop dsh-game-mode.timer     # 必须停，否则 30s 后被 auto 拉回（缺陷见 O-2026-10-22-16）
systemctl --user stop dsh-embed.service dsh-decision.service
# 恢复：start 两个服务 → rm ~/.cache/dsh-game-mode.state → start dsh-game-mode.timer
```
暂停后显存 **5289 → 2162 MiB**（free ≈3.98GB）。实验结束必须恢复并核对 8122/8099 端口。

## 一、当前阶段与断点

| 项 | 值 | 时间 |
|---|---|---|
| 当前任务 | GUI 模块 **C**：真机验证"哪些能力真好用" | 2026-10-22 |
| 断点 | 等用户给 C 的第一个能力点；OCR 两个专项在收尾 | 2026-10-22 19:2x |
| 主线（三个游戏） | 暂停；0/3 交付；看板停在 2026-10-17 04:00（已加现状横幅） | 2026-10-22 |
| git HEAD | `265fabdc` | 2026-10-22 19:2x |

## 二、性能读数（分场景报，别混报）

| 指标 | 空闲 / 游戏退出 | 原神在跑 | 备注 |
|---|---|---|---|
| 判态 `ys-state` | **123–129ms** | **330–340ms** | 125ms 达标只在空闲成立（`0a866a02`） |
| daemon RPC | ~88ms | ~180ms | 裸 daemon 127–132ms（旧读数） |
| 抓帧 | — | — | `ys-capture` 0.5s；daemon 2ms |
| 对象检测 | — | — | 27.6ms；D2 micro 0.272 |
| 结构层 | — | — | 9.9ms；parent F1 编辑器 0.78 / 游戏 0.91 |
| **全帧 OCR 真推理** | **529ms**（p50，n=12） | **929ms**（p50，n=12） | 分段 load 75.5 / det 138 / cls 118.6 / rec 188；**没有单一元凶**（`0856fb0e`） |
| OCR 同帧缓存命中 | **0.5–1.1ms** | — | **只对"同一帧重复看"成立**；换屏必 miss，实时路径仍是 465–529ms |
| OCR 换帧（8 张不同帧） | 465ms（p50）/ 719（p95） | — | 实时路径真实成本 |
| OCR 冷启动 | 引擎预热 **6048ms**；首次 rpc 22147ms | — | 一次性代价，靠常驻规避 |
| `ys-lookd` 显存 | 旧进程（跑 4.5h）**2588 MiB** / 新进程预热完 **1492–1836 MiB** | — | det 全帧输入 694 MiB 是主导项；单会话硬顶见 O-2026-10-22-18 |

## 三、门禁与回归

| 套件 | 读数 | 说明 |
|---|---|---|
| `./tools/failure-ledger check --fast` | **62.1s**，gates=28，**gate_fail=0**，verdict=**PASS** | 2026-10-22 21:5x（新增 win-attrib；修 perception-contract 与 advice） |
| `./tools/failure-ledger check`（全量） | 空闲 **550s** / 游戏在跑 **700s**，gates=40–41，unproven=0，fake_inject=0 | 改动后未复跑 |
| `worldsvc-selftest` | **123/123**，31.1s→**24.5s** | 注入用例 23.7s→**1.66s** |
| `ocr-channel.selftest` | **5/5 PASS**（含 A5 引擎透传） | `0856fb0e` |
| `./tools/ys-gates` | 六门槛 PASS | 2026-10-17 起 |
| `tools/ys-guards` | **rc=0**（G-FOCUS/G-WHITELIST/G-OBJECT 全 PASS） | 2026-10-23 00:2x |

## 四、机器与常驻服务（只读实测，19:2x）

```
YuanShen.exe        已退出（用户 18:5x 关闭）
dsh-embed / dsh-decision   已暂停（实验用）；dsh-game-mode.timer 已停
ys-screen-grant     NO_GRANT
ys_lookd            pid 2594670（19:03 载入；等 ocr-vram 重启装新参数）
ys_capture serve    pid 2593993 --fps 10 --ring 4 --pre bmp
GPU                 2162/6144 MiB 已用；clocks.sm 锁在 855/2100 MHz（41%）
```

## 五、未修缺陷（会立刻撞上的）

1. `free_text` 字段名与语义不符（实为"无归属文字"）。
2. 文字按 y 行硬合并 → **跨栏混串**（一行 bbox 宽 2336px，左中右三栏挤进同一对象）。
3. `--format png` fail-closed：不命中预编码就 `FORMAT_NOT_READY`；`--encode-if-needed` 也不稳（ring 4@10fps 只有 400ms 历史）。
4. `.scratch/three-games/BOARD.md` 状态表停在 10-17 04:00（回主线前必须刷新）。

## 六、最近三笔提交（滚动保留）

| commit | 内容 |
|---|---|
| `2e3c04bc` | 4 个 GUI 自测接进门禁（gates=35） |
| `32f56195` | ys-peek 不再吞抬窗槽的退出码（guards 实测点名） |
| `c13fe509` | handback-target 门禁：交还目标必须有记录优先 |
| `6ccfc337`/`46f8ca41`/`bb061df5` | 窗口 id 收口 ys_win.py + no-dead-window-id 真门禁 |
| `4b64c332`/`0c39447e`/`2b0b27e7` | env-single-source 转严格（无豁免）+ 29 个绕过者迁移 |
| `9842a6e2` | ys-text（行框→段落重建）+ ys-peek 零打扰 + screen schema v2 |
