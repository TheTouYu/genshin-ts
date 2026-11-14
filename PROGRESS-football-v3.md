# PROGRESS — 足球 v3 卡顿攻坚

> 更新：2026-11-14 21:3x ｜ 线：football ｜ 地图：1073741827「真实足球v3」

## Goal
消除**卡顿**。验收：用户连踢 3 次（键 3/2 各 3 次、每次重置球位）全程无卡顿观感。

## 结论先行：根因已定位（不是信号断流，是客户端重复执行）

**3466 日志（本轮，服务端渲染图未开日志，不影响结论——客户端与 Lua 全在）**
- 内核图 1082130436：**325 拍 / 44 秒**，tick 差值分布 `{1: 324}` ⇒ **零丢拍**，每秒 7-8 拍稳定。
- 但每拍执行帧数：**平均 6656 帧/秒**（p50 880 帧/拍 × 7.5 拍/秒），峰值 8072 帧/秒。
- 总帧数 1009 > 唯一节点数 592 ⇒ **417 帧是重复执行**（同一节点在一拍内被跑多次）。

**重复执行的机制（这是根因）**：节点图的**数据节点没有缓存**——一个数据节点的输出被 N 个下游消费，
就执行 N 次。实测扇出热点：

| 节点 | 类型 | 每拍被拉取次数 |
|---|---|---|
| node 96 `queryEntityByGuid(1082130445)` | 查实体 | **14 次** |
| node 9 `queryEntityByGuid(...)` | 查实体 | **14 次** |
| node 190 / 188 `getLocalVariable` | 局部变量 | 40 / 38 次 |
| node 157 `getCustomVariable` | 自定义变量 | 10 次 |

全图 expensive 类型每拍被引用总次数 **187**：`get_custom_variable` **57**、`create3d_vector` **48**、
`query_skill_variable_value` **44**、`query_entity_by_guid` **27**。
⇒ 每拍真正"不同的计算"只有 ~200 项，却被执行了 ~880 次。

## Done（有命令与读数的）
1. 3466 图分布：内核 325 条 / kitListen 12 条 / 渲染 0 条（渲染图日志未开，非停跑）。
2. 内核 tick：324/324 连续，无丢拍。每秒 7-8 拍。
3. 逐秒负载表：44 秒中仅 374-379 秒段帧数变化（1009→706），其余稳定 676-1009。
4. 重复执行定位：总帧 1009 vs 唯一节点 592 = 417 次重复；热点表见上。
5. 挂载核验：kitRender 正确挂在球实例 1077936163；球变量齐全（fb_dur 0.2 / fb_e 0.55 / fb_roll 0.12 / fb_magnus 0.08）。
6. 球实体：def 1077936161 / res 10005018 / **aux 120 图元** / scale 0.07。
7. 预算：内核 1191 直接节点 / 公式 2436（实测 2210 可载；本轮内核 325 条记录证明它在跑）。

## Next（按收益排序，第 1 项就是下一个动作）
1. **用户复测 FREEZE-TEST（已注入，等待数据）**：重载地图进 1073741827，动作序列
   远踢(>5m)→近踢连按→高球→弹地→纯滚动 各 3-5 次，完整退出试玩让日志落盘。
   新日志裁决三件：①冻结是否消失（消失→定点器追赶分支定谳）②fb_ts 首帧值域
   （~1.77e9=秒级只能当整秒锚 / ~1.77e12=毫秒级可测到达抖动）③fb_t_srv 相邻拍差值
   （期望 ≈0.135s；冻结拍差值均匀→设备失灵定谳，有空洞→传输抖动定谳）。
2. **消除重复执行（主修，收益最大，待复测后做）**：把扇出高的数据节点**物化到局部变量**——
   `queryEntityByGuid` 结果每拍只查 1 次写 `lv_carrier`，`getCustomVariable` 合并成一次读取块，
   所有下游改读局部变量。按热点表：node 9/96（28 次→2 次）、node 157（10→1）、
   node 190/188/189/187/186/185（153 次→6 次）。预期每拍帧数 880 → ~400（−55%）。
3. **球图元 120 → 减半**（视觉几无差异，渲染成本直降）。
4. 若仍有卡顿：开 FPS 显示分辨「整画面 vs 只有球」。
5. 每轮改完：`assets:node-graphs nodes --graph 1082130436` 查预算——**注意公式校准域
   [1610,1933]（内核 M=1195 在域外，预测 2446 只是强警讯非判死，先查真机日志执行记录）**；
   官方 3000 硬限仍在。内核节点数应冻结增长（距 8-31 拒载实证点 2465 仅 ~19 点公式口径）。

## Key facts
- 环境：`export GSTS_LOCALLOW_DIR=/home/h/.local/share/anime-game-launcher/prefix/drive_c/users/h/AppData/LocalLow`
- 地图：`…/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741827/1073741827.gil` + `…/110170759/Temp/1073741827.gil`
- 编译：`cd examples/football && node ../../dist/src/cli/gsts.js --config gsts.kit3.config.ts --noinject`
- 注入：`gsts.kit3-loop-inject.config.ts`（内核）/ `gsts.kit3-server-inject.config.ts`（render+listen）
- 解析脚本：`.scratch/football-phys-audit/extract-kernel-v3.py`、`extract-render.py`、`replay4-droptick.mjs`、`touch-dribble-sim.mjs`
- 底层库：`.agents/skills/debug-log-investigator/scripts/gia_log.py`（`frames_of` 返回 `(head,ins,outs,load)`，head 是 **varint 的 hex**）
- **坑**：日志图详情按图开关，某图 0 条记录 ≠ 没跑。
- **坑**：`assets:custom-variables` 写 float 要 `22.0`，写 `22` 报类型不匹配。
- **判据（新）**：`总帧 / 唯一节点` 比值 = 重复执行倍数；>1.5 就值得物化。

## Open questions
- 客户端 FPS 实测值（用于验证主修效果与分辨 B1/B2）。
- ~~公式 2436 是否仍被客户端接受~~ → **已闭合（2026-11-14 深夜）**：公式=魔方族线性拟合
  （校准域 M∈[1610,1933]，内核 M=1195 域外，2446 是外推值）；3470 日志证明在跑。
  CLI 已加校准域警告（commit d203e43b）。真界限未定，域外预测只当强警讯。
- 新增待真机裁决：fb_ts（queryTimestampUtc0）秒/毫秒；fb_clk 读数精度；冻结归因
  （定点器移除后是否消失）。判据见 Next.1。
- 7 条 DUPLICATE-EXEC-INPUT 已闭合（commit 3942b28e）：全部是 lint 互斥证明太弱的
  **误报**（顺序 if 链两臂汇聚），非真双执行；branchAncestors 改 BFS 可达+多入边 UNION。

## FREEZE-TEST 注入轮（2026-11-14 深夜，commit 9e4f1784，地图终态 8490b0ee）
- kit-render：**定点器追赶分支移除**（chase>5 全走插值，VEL_CAP=30 兜底；重置回程变慢≈翻倍是预期代价）
  + 图变量 fb_ts（UTC 时间戳每拍留帧）+ fb_t_srv（fb_clk 全局计时器读数，末尾防御序，首拍自启动）。
- kit-loop：hasBall 双门恒真（任意位置任意次按键生效，kickNow 去重保留=一次按键一脚）。
- 资产：`assets:global-timers` CLI 新建 fb_clk 计时器（root12）+ 挂球实体 1077936163（root5）。
- 球实体=**1077936163**（prefab 1077936161）；1077936135 是 D319 标定柱旧号，勿混用。
- 恢复方法：git revert 9e4f1784（FREEZE-TEST 注释标了各处）。
