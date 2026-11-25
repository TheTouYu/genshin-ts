# football 目录规则（探索本目录时自动注入）

> doc-type: R · status: active · updated: 2026-11-25
> **v3 现役地图（2026-10-12 起）：1073741827「真实足球v3」**（票 25 A 批已落场地；旧图
> 1825「真实足球」=票 24 照抄终版退役备件；复测前先确认进对图——2026-08-31 曾因进错图白测一轮）。
> **当前主线（2026-10-12）**：票 25 v3 从零重构（减法路线，交接文档=`REBUILD-HANDOFF.md`，
> 看板=`.scratch/football-v2/BOARD.md`）；**现役源码 = `src-fb3/`**（`src-fb/` 是 v2 遗留，末次提交 2026-10-03，只读；
> 物理引擎契约见 `design/PHYSICS-ENGINE-V3.md`）。
> 旧 v5 四图（825/826/828/829）与 `ARCHITECTURE-V5.md` 已退役为历史，**只读勿动**；
> v4 隔离区 `src/*.v4.ts` 保留纪律参照。
> 进度入口：BOARD（本线唯一看板）→ `PROGRESS.md`（历史轮次）；设计权威：`R2-DESIGN.md`。
> **并行线定位（2026-10-24 起）**：本目录 = 线 `football`（线表/谁在推：`docs/longtask/LINES.md` §二；
> 本线现状与断点：`docs/longtask/dossiers/football-v3.md`）。另有 `sim-2d`、`gui-agi` 两条线并行，别混进度。

## 〇、运行环境（2026-11-25 起 **Win11 原生**；Linux/wine 降为历史，见本节末）

- **Win11（现行）**：游戏 `E:\ys\Genshin Impact Game\YuanShen.exe`（编辑器 `BeyondEditor.exe` 自动连接）；
  存档根 `C:\Users\Administrator\AppData\LocalLow\miHoYo\原神\BeyondLocal\110170759\`——**游戏装在 E 盘、
  存档在用户 LocalLow，两者分开定位**；仓库仍在原 Linux 家目录 `H:\@home\h\genshin-ts`。
- **CLI 走包装**：`node examples/football/gsts-win.mjs <子命令…>`（自动补 `GSTS_LOCALLOW_DIR` 与
  `ESBUILD_BINARY_PATH`——`node_modules` 是 Linux 装的，只有 linux-x64 esbuild；首次先 `node scripts/setup-win-esbuild.mjs`）。裸跑 `bin/gsts.mjs` 须先自己设这两个变量。
- **Python 件一律** `node scripts/py.mjs <脚本.py> [参数]`（自动找 python3 / python / py / DSH 运行时，可用 `GSTS_PYTHON` 指定；子进程固定 UTF-8）——
  `gil-guard.py` / `gil-header-check.py` / `doc_health.py` / `failure-ledger` 都这样跑，别再去找 `python3`。
- **提交**：钩子经 `scripts/py.mjs` 找 Python，提交时**无需任何设置**；新机器 / 新克隆先 `bash scripts/install-git-hooks.sh`（Win11 用 PortableGit 的 bash）。
  **不要 `--no-verify`**。
- 存档双地址：`…\Beyond_Local_Save_Level\<id>\<id>.gil`（同级带 `external_lua_file\`）+ `…\Temp\<id>.gil`
  ——任何写回后必查双址 SHA 一致（`maps:resync` 同步 Temp 并注册 `.gip`；terrain set-range 不自动同步 Temp）。
- 迁移流程、逐文件对账与试玩取证入口：`DEPLOY-WIN11-20261125.md`；通用规则＝2D 游戏技能 `references/12-deploy.md` §6。
- **历史（Arch+wine，2026-10-12～11-20）**：每条 shell 先
  `export GSTS_LOCALLOW_DIR=/home/h/.local/share/anime-game-launcher/prefix/drive_c/users/h/AppData/LocalLow`
  （不 export 则 gsts 报 `LOCALAPPDATA not found`）；该 prefix 存档原样留在 `H:\@home\h\.local\share\anime-game-launcher\prefix\…`，只读参照。
- donor 3231 只读行为基线（`.scratch/_archive/football-v2/evidence/ab-22/`），禁止写入；
  资产完备性判据=票 24 §C 分类表。**GIL 顶层是容器分块表（非裸 protobuf），仓库无 root
  枚举工具——手写 varint walker 必败，勿再自建**。

## 一、不变量清单（改代码/重写前逐条对照，2026-09-01 协作复盘固化）

每条都是踩过坑付过用户复测代价的存活纪律，来源 commit 可考古：

1. **多消费点先物化快照**：表达式被 >1 处消费或横跨 set 写回时，先写 tmp* 图变量再读
   （坑：`e463c1c`/`73b0ca6`/`43a5fe1`/`4ec9343` 四修；v5 重写曾丢失→`3fb7098` 重学、
   9/1 铁球双位置复发）。黑板值在双 loop 下"读的时候"就可能已被 drain 更新。
2. **跨图状态只走实体自定义变量**：图变量每图独立，跨图读 state 必读实体变量
   （坑：826 写 FLY、825 读自己图内残留→Stop Timer 冻结球，2026-09-01 修复）。
3. **复合含 exec 节点必须声明 outflows**：否则注入器按 def 接口裁边，.gia 有边 .gil 丢边
   （坑：`e348612`，"足球完全不动"一整轮）。
4. **min/max 公式核对称性**：min(a,b)=(a+b−|a−b|)/2，max(a,b)=(a+b+|a−b|)/2——v5 抄反成
   max 后每拍把速度吹到 24，潜伏 7 轮复测（`b2370a5`）。
5. **跨消费者队列覆盖式写，禁止 +=**：双 loop 相位交错下 += 线性累积爆炸（`6e870ac`）。
6. **单图 gameNodeCount ≤2000**（用户 2026-08-31 强制）：写图前算预算，超限按职责拆图；
   双实例化大复合（如 ballApplyImmediate 内嵌 936 节点子树）是主要肥胖源（`34f5388`）。
7. **高频 loop 必须有停止条件**（静止零定时器是 v5 设计基线）；日志分批查，不全开
   （0.12s×3 图全量日志曾洪泛被踢，用户 2026-08-31 提出降载与分批协议）。
8. **分支体内 registerExecNode 后不要再手动 connect**（双入边双执行，`GSTS-DUPLICATE-EXEC-INPUT` lint 已立）。

## 二、重写/重构前置（不可跳过）

动架构、换模型、迁移层职责之前：
1. 读上方不变量清单 + 对照 v4 孤儿文件（`*.v4.ts`）里的等价纪律；
2. **列出"本次将退役的已修复纪律"逐条给用户裁决**——禁止用注释静默退役
   （v5 重写时曾在 dribble-v5.ts 用注释单方面宣布"tmpDribbleVel 全部退役"，16 小时后重学，代价 2 轮复测；历史证据见 `git log -S tmpDribbleVel`）；
3. 手感/行为类改动：优先**增量对齐**而非全量重写（六天七代重写、纪律资产每代清零的教训，
   见 `docs/collab-retro-2026-09/football-deep-dive-R1.md`）。

## 三、验收参照

手感基线 = 游戏内地图**足球_2**（用户 2026-08-30 裁定："远远不及足球_2"即不通过）。
带球核心目标：玩家带球跑动球贴地跟随，速度≈玩家×1.2，脱手/踢出/弹地行为符合真实足球直觉。
**白模配色铁律（2026-10-12 用户纠偏固化，历史第三次同类）**：图元配色禁纯白/近白/纯饱和色
——锚定 donor 已过审带色偏中灰：结构 0xb8c0c8/0xa8beb4、场线 0xD0D0D0；点缀降饱和
（藏青 0x3a5f8a、砖红 0xa84838）；大面积亮灰（≥0xE0 亮度）一律刺眼无质感。

## 四、修复报告模板（三栏门禁 + 行为预期句式）

报告"修复完成/已注入"必须三栏（根 AGENTS.md 2026-09-01）：①已验证什么（注证据层级）
②尚未验证什么 ③需用户确认什么——**第三栏必须含行为预期句式**：
"修复后：玩家做 X 操作，球应 <具体行为>；若仍 <具体失败现象> 即未修复。"
（2026-09-01 实证：五层结构✅报告缺这句，用户自查 y 轴数据推翻。）

## 五、复测协议（降低用户复测成本）

- 多个相互独立的修复可合并一轮复测，报告里分别给预期与信号标记；
- 用户复测前先确认：进对地图（v3=**1073741827「真实足球v3」**）+ 注入后已重载地图（注入与游戏会话不得时间重叠）；
- "待复测"注入若用户当晚未测，下轮会话先回收状态再叠加新注入，避免堆积失配。

## 六、安全边界

注入 1073741827（v3 现役图）前按根 AGENTS.md 确认制 + 一次性授权边界执行；写回走
`genshin-ts-asset-operations` 安全流程（SHA 锁定→候选回读→写回→回读→Temp 同步）。
headless sim（`sim/`）只覆盖物理数学层，**不覆盖**跨图时序/注入裁边/预算/设备语义——
sim PASS 不得表述为游戏可用。

## 进度与推进（唯一入口在看板，勿在此堆内容）

- **推进看板**：`.scratch/football-v2/BOARD.md`——当前前沿/票据清单（一票一文件在
  `.scratch/football-v2/issues/`）/已完成划掉区/**资产 ID 速查**。新会话先读看板再干活；
  收轮=勾票+PROGRESS 记「下一步」+精确 commit。本节只留引用，进度细节一律进看板/PROGRESS。
- **轮次历史**：`PROGRESS.md`；**R2 设计权威**：`R2-DESIGN.md`；**v6 总纲**：`REBUILD-V2-PLAN.md`。
- **方法论（先读再用）**：`client-nodegraph-development` 技能（〇章=路线选型+编译前置铁律；
  runbook+模板包在 references/creation-path/）。
