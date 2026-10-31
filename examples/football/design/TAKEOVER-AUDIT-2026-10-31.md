# 真实足球 v3 · 接手审计（代码地图 + 物理内核）

> doc-type: R · status: done · updated: 2026-10-31 · HEAD `d5b82ffb`
> 方法：只读静态分析 + 存档只读回读 + 离线重放（`.scratch/football-phys-audit/sim.mjs`，exit 0）。
> **未运行**：`npm run build` / 编译 / 注入 / 游戏内验证。凡标「离线」的数字来自离线重放，标「真机」的来自 `PHYSICS-DATA-REPORT.md`（日志 3439）。
> 读者：下一次接手本线的代理；先读本文 §0，再按 §3 选批次。

## 0. 三分钟接手

**现役真源 = `examples/football/src-fb3/`**（`AGENTS.md:7` 说的 `src-fb/` 是 v2 遗留，末次提交 10-03，只读）。

| 图 | ID | 类型 | 源码 | 真机节点数（只读回读） |
| --- | --- | --- | --- | --- |
| kitLoop | 1082130436 | 20008 造物技能（**客户端算**） | `src-fb3/kit-loop.ts` 855 行 | 645 |
| kitLoopTest | 1082130440 | 20008 测试图（生成物） | `src-fb3/kit-loop-test.ts` 939 行 | 789 |
| kitRender | 1073741828 | 20000（挂球实体 1077936135） | `src-fb3/kit-render.ts` 278 行 | 118 |
| kitListen | 1073741826 | 20000（挂载体 1082130445） | `src-fb3/kit-listen.ts` 228 行 | 123 |
| kitStatus / kitDecision | 1082130437 / 1082130438 | 20009 / 20007 | 各 11 行占位 | ≈0 |

数据流：`lua/fb-input.lua`（HUD + 按键）→ 信号 `fb_input(key:int,state:int)` → kitListen 写载体变量 `fb_seq/fb_key/fb_dt/fbvx/fbvz` → kitLoop 每拍读、积分 → 信号 `kit_state(tag,tick,pos,vel,spin,state)` → kitRender 施线性/旋转运动器到真足球；`kitLoopTest` 由 `scripts/gen-kit-loop-test.mjs` 从 kit-loop.ts + `autotest/harness-body.txt` **生成**（勿手改），开关=载体变量 `fb_autotest==1`。

**命令**（每 shell 先 export 环境变量；地图 gil 路径 `…/Beyond_Local_Save_Level/1073741827/1073741827.gil`）：

```bash
export GSTS_LOCALLOW_DIR=/home/h/.local/share/anime-game-launcher/prefix/drive_c/users/h/AppData/LocalLow
npm run build                                                   # 增量 7~8s，冷 66s
cd examples/football
node ../../dist/src/cli/gsts.js --config ./gsts.kit3.config.ts --noinject   # 生产 6 图（含 test 图，噪音）
node scripts/gen-kit-loop-test.mjs                              # 改内核后必跑
node ../../dist/src/cli/gsts.js --config ./gsts.kit3-test.config.ts          # 测试图注入
node scripts/kittest.mjs on|off                                 # 绑/解测试技能配置 + maps:resync
# 只读核对
node ../../dist/src/cli/gsts.js assets:node-graphs nodes --gil <map.gil> --graph 1082130436
node ../../dist/src/cli/gsts.js assets:custom-variables --map-id 1073741827 --entity 1077936135 --list
```

**参数真值不在源码里**：物理参数由球实体 1077936135 的 10 个自定义变量提供（本次只读回读：`fb_g=9.8 fb_e=0.5 fb_mu=0.8 fb_roll=0.06 fb_spin=0.15 fb_air=0.05 fb_magnus=0.03 fb_maxv=18 fb_rest=0.35 fb_dur=0.2`），内核首拍读进技能变量 1207959572..581（地图已扩到 29 槽，`kit-loop.ts:25` 注释「段 553..568」已过时）。源码里 `kit-loop.ts:69-124` 那批常量**多数只声明不引用**（`GRAVITY/RESTITUTION/ROLL_MU/MAX_SPEED/SPIN_K/SPIN_AIR_K/MAGNUS_K/REST_SPEED/GROUND_MU/KICK_LIGHT_SPD/KICK_HEAVY_SPIN`）——改源码常量不生效。

**已知干扰项**：`src-fb3/fb-shared.ts`（267 行）与 `src-fb/fb-shared.ts` md5 相同且在 src-fb3 内零引用（但每次生产编译仍产出 `dist-fb3/src-fb3/fb-shared.gs.ts`）；`dist-fb3` 里还有 4 组无源产物（`kit-ball/kit-probe/zz-raycast-probe/physics-core`）——需要精确产物时用 `npm run build:clean`。

## 1. 屎山清单（可执行项，按危害排序）

| # | 问题 | 证据 | 判据 |
| --- | --- | --- | --- |
| S1 | **物理参数只活在存档里**，仓内无声明、无写入脚本、内核**无兜底** | `kit-loop.ts:163-179` 直读直写；803ec920 的 commit message 声称"读不到用默认值"，f4212ef0 之后代码里已没有 | 重建地图 ⇒ 变量缺失 ⇒ `fb_g=0` 球不落、`fb_maxv=0` 球当拍冻结 |
| S2 | 内核单文件 855 行 / 单回调 725 行，物理+踢法+防守+碰撞+遥测+载体传送混在一起 | `kit-loop.ts:126-855` | 任何改动都要在 40KB 里定位；IR 645/2000 |
| S3 | 死代码与死表达式（零行为可删） | `kit-loop.ts:181 readPhys`、`:459 onGroundAfter`、`:536 notDribble=not(1==2)`、`:479 inZone`；`kit-render.ts:66-80` 早算块、`:96-151` driveDur→everyTicks 链（`everyTicks` 无消费者）、`:32/33/38/40` 四个常量 | 全仓 grep 消费点=0 |
| S4 | 假链路：`tag='T'` 已无生产者，但消费端仍在 | `kit-listen.ts:25-39`、`fb-input.lua:187-252` | `grep "'T'"` 只命中消费端 ⇒ HUD 永不显示测试名 |
| S5 | 生成物入库 + 生产配置编译测试图 | `src-fb3/kit-loop-test.ts`（git 跟踪）；`gsts.kit3.config.ts` entries=`./src-fb3` | 手改 test.ts 会被下次生成覆盖；生产编译产出 `kit-loop-test.gia` |
| S6 | 几何/常数双源 | 门宽 `fb-shared.ts:17`=3.66 vs `kit-loop.ts:109`=3.6；RAD2DEG 两处（`fb-shared.ts:14` / `kit-render.ts:246`）；`sim/src/params.ts:162` gravity 9.81/magnus 0.00356 vs 内核 9.8/0.03 | 改一处不生效 |
| S7 | 文档漂移 | `kit-loop.ts:16-19` 三踢法/上挑 1.2,2.0,7.0 vs 代码 5 键/3.2,4.5,9.0；`:12`「0.985/拍」vs 恒定减速度；`AGENTS.md:7`；`.scratch/football-v2/BOARD.md` 停在 10-27（其后 14 个 commit） | 按文档交接会读错 |
| S8 | 13 个 `gsts.*.config.ts`，现役只有 `gsts.kit3*.config.ts` 三个；kit3 链无 npm 入口 | `examples/football/` 根 | 每条命令手打 |

## 2. 物理内核审计

### 2.1 每拍顺序（`kit-loop.ts`）

读输入 → 初始化 → 方向 → 6 键复位 → 暖机(≤75拍) → ①踢球/防守 → ②触球 → ②b 拦截 → ③重力+马格努斯（仅离地）→ ④空气阻力+积分 → ⑤地面接触（法向冲量+库仑+消滑移+滚动阻力+静止判定）→ ⑧进球 → ⑨门柱 → ⑩边界 → ⑥限速 → 写回+发 `kit_state`。

### 2.2 现存缺陷

**P0-1 时间步长寄生在 Lua 渲染帧上**（`kit-loop.ts:203-217` + `kit-listen.ts:142-182` + `fb-input.lua:299-308`）
`dt = fb_dt × 1.66`，`fb_dt` 是 Lua `OnUpdate(dt)` 单帧时长（每 2 帧发一次、向下取整毫秒），1.66 = 「内核墙钟 66.5ms/拍 ÷ Lua 40ms/帧」的一次性标定。**内核 20008 白名单 136 项里没有任何时间节点**（`client_method_modes.ts:350-487` 已核），所以内核自己拿不到时钟。离线（同 key1，墙钟按 15.04Hz）：Lua 15fps ⇒ 1.66×、25fps ⇒ 1.00×、60fps ⇒ 0.42×；Lua 固定 25fps 而内核拍率 14/20/27Hz ⇒ 0.93/1.33/1.79×。次级：整毫秒截断 −0~−4%；kit-listen 要求 `dt>0.004`，≥240fps 时静默停更；内核仅在 `fb_dt≤0.0024` 才回退 0.1333（=8 倍速）。
**修法**：① 立刻可试——若内核拍率实测稳定，直接用 `dt = 1/15.04 = 0.0665` 定值；② 稳妥——Lua 改发**累计**时钟（`G.t` 毫秒，`fb_input` state 复用），内核存上一拍读数做差分 + 慢平滑（EMA），彻底与帧率/拍率解耦；③ 先用一轮真机同时记录「每拍墙钟」与「Lua 帧时长」判定拍率到底随谁变。

**P0-2 带球在玩家 ≥4 m/s 时完全不触发**（`kit-listen.ts:69-80` 隔 2 拍写位置 × `kit-loop.ts:252-272` 用固定 dt 差分 × `:258-261` 8m/s 判瞬移）
位置每 2 拍才更新 ⇒ 差分在 `2v` 与 `0` 之间交替；`2v>8` 被当瞬移置 0 ⇒ `playerSpd<2` ⇒ 触球条件 `:490` 永不成立。离线 12s 窗口：玩家 2.5/5/6 m/s 触球 3/1/1 次，球平均在身前 6.1/9.8/10.8 m（理想 2.3 m）；慢速时一次触球直接把球速改写成 `2v+0.7`（2.5 m/s ⇒ 球 5.7 m/s）。**这就是「跑起来球不跟脚」的根因**，也是验收句「球贴脚跟随、速度≈玩家×1.2」当前不成立的原因。
**修法**：服务端恢复每拍写（3 次变量写×15/s，成本可忽略），或内核用 `(p−p_prev)/((tick−fb_pos_tick)·dt)` 差分并把瞬移判据改成位置跳变（>2m）而不是速度上限。

**P0-3 门柱是 1.2×1.2m 方盒，且进球判定在前**（`kit-loop.ts:692-710` vs `:712-737`）
进球判据 `|z|<3.6` 覆盖了门柱实体本身（柱心 ±3.6、半径 0.35），柱判据却只在 `|z∓3.6|<0.6` 触发 ⇒ 有效门宽 7.2→6.0m；宽射（z∈3.6..4.2）被强行改写 `bz=±3.39`（拉回门内）。离线 z=3.30、16m/s、200 相位：被"隐形门柱"弹回 107 次 / 进球 93 次 = **53.5% 判错**；隧穿随 dt：0.066s 0%、0.111s 30.5%、0.133s 49%。
**修法**：柱改 4 个圆截面（`dist((x,z),(±52.5,±3.6)) < POST_R+R`）+ 高度判定；进球判定挪到柱之后。

**P1-1 库仑上限漏了 3.5 的换算 ⇒ 地面摩擦只有 μ/3.5**（`kit-loop.ts:609-612` vs `:629-630`）
冲量是 `J=−γ·s/3.5`（Δslip=3.5J，代数正确），但 γ 的上限按 `μ·jn/|s|` 截断 ⇒ 饱和时 |J| 只有库仑上限的 1/3.5。有效 μ=0.8/3.5×0.9=**0.206**；5m/s 滑行首拍减速 2.85 m/s²（库仑应 7.84）。**真机 2.10 m/s² 与离线 2.02 吻合 4%**——`PHYSICS-DATA-REPORT.md:262` 那条"介于两态之间"的 FAIL 就是这个 bug 的指纹。修法：`γ = min(1, 3.5·μ·jn/|s|)`，同时删 `FRICTION_LOSS=0.9`（冲量本身已恒耗能）。

**P1-2 反弹后漏一拍重力 ⇒ 每次弹跳注能**（`:458` 用积分前的 y 判 `onGround`，反弹拍把 y 夹回 0.25 ⇒ 下一拍跳过重力）。3m 落体三次弹跳峰高误差 +3.3% / +29.4% / +78.2%，反弹后首拍 vy 少 27.3%。修法：用"本拍发生接触"的布尔量替代 `onGround`。

**P1-3 落地穿透 0~0.465m 无子步**（7m/s×0.066s≈1.9 个球半径），反弹时刻最多晚 1 拍；18m/s 时单拍 1.195m 与门柱带宽同量级（见 P0-3）。

**P1-4 滚动阻力在滑行态也施加**（`:641-654` 无状态判断），占首拍减速 21%，与库仑叠加成双重阻尼。

**P1-5 六态名存实亡**：`mode=0`（Airborne）只在踢球分支赋值（`:407/419/431`），整段滞空不写 0；`mode=5`（DribbleControlled）全文件无 `mode.set(5n)`，`KEEP_R/inZone`（`:479-482`）是死代码 ⇒ HUD"带球"永不亮。`mode` 只回传、对物理零控制——它是遥测标签不是状态机。真机"state 0 几乎不出现"是这个原因，不是输出链路失真。

**P1-6 静止/停弹断崖**：`|v|₃<0.35` 一拍清零（0.36→0 用 1 拍）；`|vy|<1.0` 直接不弹（第 3 弹 1.039 已贴线）。

**P1-7 分轴系数与文档不符**：`SPIN_AIR_K=0.02`（`:81`）是死常量，`wx/wz` 实际用 `S_P_AIR=fb_air=0.05`；`wy` 0.15/s vs 文档 10.7%/s；空气阻力 5%/s vs 文档 3.69%/s。

**P2 摘要**：参数零兜底（见 S1）；暖机期按键"记账不消费"（`S_LASTSEQ` 只在 `:451` 写 ⇒ 开局 75 拍内按的键在暖机结束补踢一发）；`notDribble` 恒真；弧线球左右旋按 tick 奇偶（等价随机）；球人重合方向退化；限速在积分之后（20m/s 解围先走 1.33m）；边界反弹不判高度；进球无 1.5s 冻结；`CARRIER_Y=-4.21` 与注释矛盾且竖直掉出支撑面无法自愈。

### 2.3 已修 / 不再是缺陷（避免重复排查）

- 垂直空气阻力已加（007e1c86）；自旋分轴已改；自由落体不反弹已修（静止判据改三维速度，a8fae94e）；拦截半径 0.9→0.55。
- `PHYSICS-DATA-REPORT.md` 的 **G9「速度悬崖」是旧位置吸附模型**的产物，当前触球式模型下高速球不再被拽（但慢球仍有一次性 Δv 改写，见 P0-2）。
- 核对通过项：马格努斯方向 `a=K(ω×v)` 正确、滚动约束 `ω=(vz/R,0,−vx/R)` 正确、冲量代数（I=2/5mR²、Δω、Δslip=3.5J）正确、半隐式欧拉正确、滚动阻力与 dt 无关（离线滚停 8.499s vs 解析 8.503s）、无 NaN/除零源、静止球 300 拍零漂移。

### 2.4 最像"不像真实足球"的三点

1. 整场快慢由 HUD 脚本帧率决定（15fps 1.66×，60fps 0.42×，同一脚弹道时长差 4 倍）。
2. 带球：跑起来（≥4m/s）球不跟脚；慢跑时一脚踢到 6~10m 外再追。
3. 地面手感"冰面 + 隐形门柱"：有效摩擦 μ/3.5，门洞被缩成 6.0m。

## 3. 重构/修复路线（建议按此顺序，每批独立可验）

**批次 A（零行为，先做）**：删 S3 死代码/死表达式、删 S4 假链路、修 S7 文档漂移（含本文件 §0 的接管表）、补 `package.json` 的 football 编译/注入入口。验证：`npm run build` + `--noinject` 编译 exit 0，节点数只减不增（当前 645/118/123），不注入。

**批次 B（单一真源）**：把球实体 10 个参数写成一个仓内声明（JSON/TS）+ 一个幂等 CLI 脚本（`assets:custom-variables --entity 1077936135 --vars ...`）；内核读取加兜底 `v>0 ? v : CONST`。验证：变量删除后内核仍按默认值运行（离线可测公式，真机需一轮）。

**批次 C（物理修复，真机验证）**：按 P0-2 → P1-1 → P0-3 → P1-2 的顺序，每条一个 commit + 一次试玩周期；P0-1 先做「一排真机读数判定拍率随谁变」的实验再决定定值还是时钟差分。验收信号用现有 11 槽测试台 + 轨迹 CSV（`/tmp/ball_timeline.csv` 易失，建议落 `.gsts/evidence/`）。

**批次 D（结构）**：抽 `buildPhysics(f, ctx)` 或改用 `g.defineComposite`（DSL 下 TS 无法抽普通函数，`kit-autotest.driver.txt:17-21` 已有草案）——**在批次 C 之后做**，因为仓库自己的教训是「六天七代重写、纪律资产每代清零」。

## 4. 未验证 / 待裁决

- 本次**未跑** build、编译、注入、游戏内验证；P0-1 的「内核拍率是否随帧率变」只能用真机日志判定。
- 需要用户裁决：①是否允许本轮直接改内核并注入（现役图 1082130436/1082130440/1073741828）；②重构范围（只做批次 A，还是 A+B/C）。
- 看板 `.scratch/football-v2/BOARD.md` 停在 10-27，与 10-30/31 的 14 个 commit 脱节；建议下一轮收尾时按「一票一文件」补票。
