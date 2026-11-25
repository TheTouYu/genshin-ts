# 共享现状：机器、常驻服务、门禁（L1 · 每轮收尾必改）

> 状态：当前实现（**读数以本文件为准；改动后立刻更新，过期读数比没有更危险**）
> 来源：只读实测（进程/窗口/门禁/工具自报），每条注明测量时间
> 最近校验：2026-11-26 00:1x（§四 补 git 分支/ssh/冒号文件三条读数、§六 补 11-25 关键提交；2026-11-25：平台已换 Win11 原生，§三 加 `[football]` 迁移读数并订正一行过期读数；`[gui-agi]` / `[sim-2d]` 行未动）
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
| `[sim-2d]` | `node qxqy/runner.mjs`（在 `workspace/tetris`，v4 主战工程） | **51/51 PASS，73.0s**（v4.0 设备适配：背景 cover 满幅 / 移动端 7 键实例按钮 / 多人引导浮层 / 帮助关闭胶囊 / 手柄探针与焦点导航。**改 lua 必须先 build 再 runner**，否则读的是存档里的旧副本=假绿） | 2026-10-29 09:3x |
| `[sim-2d]` | `node qxqy/audit-controls.mjs`（在 `workspace/tetris`） | **69 控件 / 0 死**（5 画布 × menu/play/help/settle/note；判据=每个控件点下去必须出现它自己的日志锚） | 2026-10-29 09:3x |
| `[sim-2d]` | `node qxqy/runner.mjs`（在 `workspace/hmlt-qixia`，等用户导入） | 17/17 PASS（上一活跃工程，冻结态） | 2026-10-24 11:4x |
| `[football]` | `npm run test:creations` | 6 断言，契据=与编辑器逐字节相等 | 2026-10-24 00:1x |
| `[football]` | 地图 1073741827 结构自检（`assets:ui list` / `assets:scripts mounts` / `sha256sum`） | 11 个 client-textbox 位置尺寸一致；mounts=1；Save_Level==Temp sha `7893105f…`；Lua 静态审计 PASS | 2026-10-29 14:2x |
| `[football]` | 物理引擎 v3 离线验收（`node .scratch/football-phys-audit/sim-v3.mjs`，exit 0） | 弹跳峰高误差 <3%（解析 0.688/0.172/0.043）；滑行 7.84 m/s²；纯滚动 8m/s 9.93s 停；带球稳态 0.98m/4.97m/s；门柱 z=3.3 擦柱不进、z=2.9 进；18m/s 无隧穿 | 2026-10-31 18:0x |
| `[football]` | 引擎 v3 结构层（`gsts --config gsts.kit3.config.ts --noinject`，exit 0） | kit-loop **979** 节点（原 645）/ test 1123 / render 66（原 118）/ listen 73（原 228）；`GSTS-DUPLICATE-EXEC-INPUT` 全是「多来源同出口」启发式（同来源双写 = 0）；Lua 单测 29 PASS / 0 FAIL | 2026-10-31 18:0x |
| `[football]` | 行为层（真机试玩日志） | ~~9 份近期日志 `[fb-in]` 命中 0~~（**已过期**：那是读错字段——Lua print 落 f23；2026-10-30 起行为层读数齐备，见 dossier 10-30 节） | 2026-10-29 14:2x，2026-11-25 订正 |
| `[football]` | 地图 1073741827 迁入 Win11（技能脚本 `deploy-map-dir.ps1` + `maps:resync`；记录 `examples/football/DEPLOY-WIN11-20261125.md`） | 3 文件 SHA 与 Linux 源相等；Save_Level==Temp `4bbdfef4…` 874,585 B；`.gip` 153→194 B（链接 11＋条目 30，其余字节不变）；`gil-header-check` 0 问题；`gil-guard.py --temp` PASS；CLI 回读（脚本 1 / 挂载 1 / UI 81 行 / 图 12·定义 15·实体 27）与源全等 | 2026-11-25 21:11 |
| `[football]` | 行为层（Win11） | **玩法行为零证据**——引擎 21:26 已加载并回写该图（结构层间接证据：与源仅 42 B 差异、读数全等；`.gip` 条目经引擎重写仍在），但没有该图的试玩日志 | 2026-11-25 21:34 |
| `[global]` | `npm run build` / `npm run quicktest` | 未在本轮复跑（本轮只改文档） | 2026-10-24 |

## 四、机器与常驻服务

**`[global]` 2026-11-25 21:2x 平台切换：Linux（Arch+wine）→ Win11 原生**（用户原话见 `04-timeline.md` 11-25 行）。当前机器只读实测：

```text
主机           WIN-P2NOTOGSUFS（用户 Administrator）；仓库仍在原 Linux 家目录 H:\@home\h\genshin-ts（属主 SID S-1-22-1-1000）
git            2.56.1.windows.1（PortableGit，E:\tools\PortableGit）——首次使用须 git config --global --add safe.directory H:/@home/h/genshin-ts
git（续）       当前分支 master（2026-11-26 起，与 origin/master 同步 @ e60037d1；旧分支 feat/composite-and-project-knowledge 同提交、保留）；
               .git/config 有 core.sshCommand=ssh -F /dev/null ⇒ 推送须先 $env:GIT_SSH_COMMAND='ssh' 覆盖（否则 publickey 被拒）；
               仓库含冒号文件名 workspace/ganyu/tests/17-4:3-…json ⇒ switch/checkout/merge/read-tree 在本机报 invalid path（提交/推送不受影响）
node / npm     v24.9.0 / 11.6.0；dist/src/cli/gsts.js 构建于 2026-11-17 23:12
原神           在跑：E:\ys\Genshin Impact Game\YuanShen.exe（7.2.0）；BeyondEditor.exe ×2 已自动连接（uid 110170759）
存档根         C:\Users\Administrator\AppData\LocalLow\miHoYo\原神\BeyondLocal\110170759\（地图 1073741825 / 1073741834 方块大战 / 1073741827 真实足球v3）
Python         PATH 无 python / python3 / py；仓库 Python 件一律 node scripts/py.mjs <脚本>（自动解析到 DSH 运行时 3.12.14；2026-11-25 固化）
esbuild        node_modules/@esbuild 只有 linux-x64（esbuild 0.25.12）；win32 同版本已装到 node_modules/.cache/gsts/esbuild-win32-x64-0.25.12/（node scripts/setup-win-esbuild.mjs，幂等；sha256 cae1bbc8…）
提交钩子       .git/hooks/pre-commit 经 scripts/py.mjs 找 Python（2026-11-25 固化）；提交时无需任何设置；core.filemode=false（install 脚本在 Windows 上自动设）
未迁移         dsh-embed / dsh-decision / dsh-game-mode / dsh-sentinel / ys-lookd / cmdmon（~/.dsh/cmdlog/last-coach.md 不存在）；模拟器 web 4173 未监听（[sim-2d]）
```

历史读数：**Linux 主机（2026-10-24 11:5x）——已不是当前机器，仅供回到 Linux 时对照**：

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
6. `[global]` Win11 环境适配（用户 2026-11-25 裁决「需要固化」）——**已固化**：Python 件统一入口 `node scripts/py.mjs`、钩子经它找 Python（提交零设置）、`node scripts/setup-win-esbuild.mjs`、`install-git-hooks.sh` 在 Windows 关 `core.filemode` 噪音；门禁 `hook-python-resolve`。**仍留的缺口**：`failure-ledger check` 的 gate 编排在 Win11 不可运行（gate 多为 bash/ys-* 件）；根注入文件已瘦身并同步 Win11 口径（`AGENTS.md` 余 1,438 B / `CLAUDE.md` 余 1,065 B，用户逐项选定范围）；复盘 `docs/maintenance/retrospective-2026-11-25-win11-migration-toolchain.md`。
7. `[global]` esbuild：win32 同版本二进制已持久化到 `node_modules/.cache/gsts/`（一条命令可重装：`node scripts/setup-win-esbuild.mjs`，先复用副本、否则从 npm registry 下载并校验 sha512）；换 esbuild 版本（改 `package.json` 后重装依赖）后要重跑一次，`gsts-win.mjs` 按版本号找目录。
8. `[global]` `cmdmon` 耗时监控未安装：根 AGENTS.md「耗时监控」要求的开工/收轮读数（`~/.dsh/cmdlog/last-coach.md`）在 Win11 上取不到；Linux 侧 GUI/试玩工具链（`tools/ys-editor/`、`ys-lookd`）未迁移。
9. `[global]` 路由表引用的 **6 个全局技能在本机不存在**（`bilibili-learn` / `isolated-model-evaluator` / `oneshot-prompt-builder` / `pkc-project-operator` / `qxqy-simulator` / `task-command-center`；`~/.agents/skills` 目录不存在）⇒ `node scripts/py.mjs scripts/skills-health.py` 报 6 死引用；PKC 录入与「派独立模型」在 Win11 走不了。处置待用户裁决（迁移全局技能 / 标 Linux-only）；删除或改链接属破坏性操作。

## 六、最近提交（滚动保留；跨线都记，标线 id）

| commit | 线 | 内容 |
|---|---|---|
| `e60037d1` | football | 交接文档（真实足球迁入 Win11 + 仓库 Win11 开箱就绪） |
| `78d2da98` | global | 根注入文件瘦身 + Win11 口径同步（用户逐项选定），三条规则下沉到技能 |
| `96e11909` | global | Win11 开箱就绪件：`scripts/py.mjs` 统一找 Python、提交钩子改走它、`setup-win-esbuild.mjs` |
| `929bec4d` | football | 真实足球v3 迁入 Win11 存档（1073741827）+ CLI 包装 `gsts-win.mjs` |
| `33ea9db6` | sim-2d | tetris v2：8 点反馈任务拆分文档（T0-T9+四波次+协作纪律），组建三队友团队 |
| `1f43f0e1` | sim-2d | 复盘：模拟器 demo→真机落地（8 错谱系/3 根因）+ gil-guard 检查器与门禁 + 两条技能新节 |
| `2bb8dbf1` | sim-2d | 档案：模拟器升 2.2.1，补「spawn 隔离故游戏侧无需更新」与 4173 重启 |
| `6743bc1f` | football | 档案补主线锚：手感基线=地图「足球_2」；造物子档加「上级目标与层级」 |
| `bb8ac6be` | football | 新增造物/技能链子档案并收尾（三件套同步） |
| `487b4d28` | football | 纠错：import 不给造物自动挂装饰物——机制是同号跨段克隆 aux |
