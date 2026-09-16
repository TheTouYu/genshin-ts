# maze-repro · T12 端到端复现进度

> 复现对象：真实奇域《空中花园》的探索迷宫（源 `BV1Gj1jB1EQf`，作者自述 4 年经验积淀）
> 设计书：`docs/knowledge-graph/reproduction/T12-design.md`（9 条决策全部引图谱条目）
> 图谱上游：`docs/knowledge-graph/MAP.md`

## 为什么复现它

真实存在（有 GUID 可试玩）｜玩家验证过（757 赞评论"整体难度控制得很舒服"）｜
设计知识极密（4 条邪修级做法）｜**不依赖我方做不了的能力**（无局内存档，R8 已规避）。

## 进度

| 段 | 状态 | 产物 |
|---|---|---|
| 设计 | ✅ | `docs/knowledge-graph/reproduction/T12-design.md` |
| 几何 | ✅ | `reproduction/gen-maze.py` → 150 实体；BFS 验证 99 格全连通/出口可达/4 隐藏物可达/92 格有回头路 |
| 节点 | ✅ | `src/maze-collect.ts` → `.gia` id=1073741931，9 节点；IR 核验 9/9 与意图一致 |
| 注入 | ✅ 夹具验证（含**挂载**，2026-09-15 补） | 见下「夹具验证」；注入真实地图仍需用户确认 mapId |
| 游戏内核验 | ⬜ 需用户 | —— |


### ⚠️ 更正：上一轮"四段验证通过"是过度声明（2026-09-15 加载 verify-injection 技能后）

**漏了挂载这一步**。`verify-injection` 技能关键点 2c 明写：

> 节点图注入 .gil 只是"存在于地图"，**必须 attach 到实体才执行**。漏挂载的症状 =
> 游戏日志只有旧图执行、新注入图零帧。

我上一轮只验到"注入成功 + 图内容对"，**没做挂载** ⇒ 按该判据那张图"在但不会跑"。
本轮补做（仍用夹具副本，非破坏）：

| 步骤 | 命令/API | 结果 |
|---|---|---|
| 挂载 | `mountGraphToEntity(bytes, entityId, graphId, true)`（`src/cli/gil_graph_mounts.ts:205`） | 实体 `1077936180` 挂载表 `[1073741826,1073741844,1073741846]` → `[…,1073741825]` |

**挂载目标遵守技能红线**：挂普通实体（「旋转中心」1077936180），**不挂关卡实体**
（1094713345，官方 defId=10003004 —— 技能记载挂它会致游戏报"地图异常"无法启动）。

#### 过程中自己抓到一个「空实验」

第一次挂载我选了实体 `1077936176`（「开始」），断言"目标实体挂载表含图 ✅"——
**但那个实体在挂载前就已经挂着这张图了**（夹具自带）。所以断言通过是因为**状态本来就对**，
不是因为我的调用生效。这正是复盘里「结论建立在没发生的实验上」的活例。

**纠法**：换一个确实没挂过的实体（1077936180），并**先断言前置条件**（该实体原本不含此图），
再做操作——这样"前后态不同 + 字节确实变化"才构成证据。

#### 仍未做（技能要求的注入后检查）

`verify-injection` 第 8b/8c 步要求注入后必跑：复合残留检查
（`check-gil-composite-refs --incoming`，2026-08-30 足球拒载事故后强制）、
信号相关检查、Temp 同步核对。本图**无信号节点也无复合**，故 8c 不适用、
8b 仍需补跑——**已登记为待办，不假装已做**。

## 夹具端到端验证（2026-09-15，**不碰任何真实地图**）

注入真实地图需用户确认 mapId（红线）。但"注入这一段能不能通"可以用仓库既有夹具验证——
用 `tests/fixtures/cube-e1-base.gil`（真 .gil，含 type 20000 图）复制到 `.gsts/tmp/`，
全程 `--output` 非破坏输出。结果：

| 段 | 手段 | 核验（读回数字，不只看有没有报错） |
|---|---|---|
| 注入 | `injectGilFile({gilPath, giaPath, targetId:1073741825, outPath})`（`src/injector/index.ts:521`） | 图 1073741825 改名 `_GSTS_maze-collect`；`node_count=9`；变量 `已收集数`(Integer,0) / `已集齐`(Boolean) 都在 |
| 读图核验 | `gil:parse-node-graph --graph 1073741825 --json` → 读节点 **`api` 字段** | 9/9 对账：`When Tab Is Selected` / `Activate/Disable Tab` / `Activate/Disable Model Display` / `Get·Set Node Graph Variable` / `Addition` / `Greater Than or Equal To` / `Double Branch`；dataflow 7 / flow 5 |
| 几何 | `assets:entities import --gil <copy> --entities maze-entities.json --output <out>` | 实体 16 → **166**（+150）；126 墙 / 20 造景 / 4 隐藏；126 个 def=10009001 |

**输入夹具 sha256 全程未变**（69fe51b254cada0f）——隔离性可核。

### 这段验证额外挖出两条规则（已写入 ATOMIC-RULES）

- **R14**：`assets:entities import` 的输入 `color` 必须是 **`'#RRGGBB'` 字符串**，
  写整数会被拒（`entities[0].color must be '#RRGGBB'`）；而**导出**给的是整数 0xAARRGGBB
  —— 拿导出样本当 import 模板会踩。
- **R15**：`assets:entities` **省略子命令不报错**，会静默产出 6.7KB 残缺文件（实体 0）。
  必须写 `import`。核验要**读回数字**，不能只看命令有没有红字——这正是"没报错但产出错"的典型。

## 两条施工硬规则（踩过才写下来）

1. **编译必须走 `node ./bin/gsts.mjs -c gsts.config.ts`**。
   用 `npx tsx src/cli/gsts.ts` 会因 src/dist 双副本抛
   `gsts.f is only available in server_* ctxType`（`kCtxStack` 是 Symbol，两份 core.ts 各持一个）。
   **空图也会复现**，与图内容无关。
2. **信号节点需要目标地图的注册表**（编译期强制）→ 含信号的图不能"先写后挑地图"。
   本图因此暂不接信号；"集齐后场景惊喜"待 mapId 确认 + `assets:signals register` 后接入。

## 下一步（阻塞在用户）

1. 用户确认目标 mapId（红线：操作地图前必须确认）
2. 补回 `inject` 段 → `node ./bin/gsts.mjs -c examples/maze-repro/gsts.config.ts`
3. 几何 import：`gsts assets:entities --entities docs/knowledge-graph/reproduction/maze-entities.json --map-id <id> --write`
4. `assets:signals register 迷宫_隐藏集齐` → 恢复信号版回馈
5. 用户游戏内核验（隐藏物挂选项卡组件：**2026-09-16 更正**——`components:` 元件路径 ✅ 支持 `tabBar`(17)，场景实体路径确实无 `components` 字段，只能走
   `assets:entities patch --tab-options` 或编辑器手工）

---

## 票 13 执行记录（2026-09-16，完成）

地图 **`1073741921`「T12迷宫复现」**（用户裁「新建地图」）。
创建：`maps:create --name "T12迷宫复现" --graphs t12-maze` + `maps:init`（36 root 骨架，自动备份）。

### 落图结果（全部读回数字，非自述）

| 项 | 读回值 |
|---|---|
| 地图 | 118,228 字节 `sha=0f52a14d1da37b26` |
| 图 | `1073741825 _GSTS_maze-collect` + `1073741826 _GSTS_maze-counter` |
| 实体 | **161** = 126 长方体(墙) + 7 圆柱 + 7 球 + 6 圆锥 + 4 隐藏物元件实例 + 11 模板 |
| 带组件实体 | **4**（正是 4 个隐藏物，`tabBar` 类型码 17） |
| 信号 | `T12隐藏物已拾取` send/monitor/server = 1610612741/42/43，`params=[序号:int]` |
| 挂载 | 4 隐藏物 → 1073741825；墙实体 1077936133 → 1073741826；**0 个未挂载图** |
| 8b 复合残留 | ✓ 0 悬空（两图） |
| 节点预算 | 4 / 11（远低于 2000 红线） |

### ⚠️ 架构修正（本轮最重要的发现，注入前拦住）

`docs/game-engine-knowledge/components.md:111`（2026-08-13 魔方 P4 最小实验闭合）：

> 事件名 **whenTabIsSelected**；节点图**挂载在挂载选项卡组件的实体上**触发

→ 4 个隐藏物各自带 tabBar ⇒ **每个实体上都要挂图** ⇒ 4 个独立实例。

而项目已闭合规则：**节点图变量不跨实例**。原设计把 `已收集数` 放在这张图里 ⇒
**4 个实例各数各的，永远到不了 4，集齐回馈永不触发**。

**修法（已实施）**：拆成两图 ——
- `maze-collect.ts`（id 1073741825，**4 节点 / 0 变量，刻意无状态**）：`whenTabIsSelected` → 关自己选项卡+模型 → `sendSignal(序号=tabId)`
- `maze-counter.ts`（id 1073741826，7 节点 / 2 变量，**只挂 1 份**）：`onSignal` → 累加 → `>= 4` 置 `已集齐`

### 三条硬事实（都踩过才写下来）

1. **`assets:mounts` 不认 `--config`**——它是 commander 全局选项，但仍留在原始 args 切片里，
   解析器撞未知标志就打 usage（`src/cli/gil_graph_mounts.ts:363-370` 只认
   `--graph/--def/--entity/--gil/--map-id/--output/--write/--help`）。
   **正解：`--config` 放在子命令之前** → `gsts --config <c> assets:mounts attach ...`。
2. **`nodeGraphId` 仅对 `gsts <file>` 单文件模式生效**，批量模式忽略它并按 `.gia` 自带 id 找图
   （配错报 `target NodeGraph not found`）。故最终让 **DSL 的图 id 与地图 placeholder 对齐**
   （1073741825/1073741826），批量注入即可一次命中两图。
3. **tabBar 有三层独立副本**：root4 定义 f8 / root8 实例 f7 / **root5 场景实体 f7（游戏实际读取的）**。
   `staticAssemblies` 的 `touchedTopLevelFields=4,6,8,27` **不含 root5** ⇒ 必须再用
   `assets:entities import` 生成 4 个场景实例（实测**组件成功继承**到 root5，见上表「带组件实体=4」）。

### 为什么 4 个隐藏物走元件、146 个几何走场景实体

技能警告「复杂静态模型必须做成单一元件，禁止拆成大量 root5 实体平铺」——该规则针对的是
**要整体操控的模型**（魔方/足球：移动缩放要改全部实体）。迷宫的墙是**关卡环境**：
玩家在其间行走、各自需要碰撞、且无「整体移动」需求，故按关卡布局拆实体是合理取舍。
而隐藏物**必须**走元件——`EntityImport` schema 无 `components` 字段，组件通道在元件侧。

### 下一步

**票 14（游戏内核验）**：请用户进游戏走迷宫、点 4 个隐藏物、看计数。
⚠️ 用户需先**重载地图**（磁盘写回不会被编辑器旧内存自动看到）。

### 下一步 = 票 14（游戏内核验，等用户）

票 13 的**全部结构层工作已完成并读回核实**。剩余唯一动作由用户执行：
重载地图 `1073741921`「T12迷宫复现」→ 走迷宫 → 靠近 4 个金色小球 → 点「拾取」。

**先行已知的两处待观察点**（若出问题，按此顺序怀疑）：

1. **选项卡是否浮现** —— tabBar 的 region 用的是**默认 `box [1,1,1]`**（我没显式配置）。
   技能提醒「**必须显式配 region**，否则游戏可能给默认值且回家时仍不显示」→ **这是第一嫌疑**。
   若游戏里靠近球不浮现选项卡，先补 `regionSize`/`regionCenter` 再重试。
2. **计数不可见** —— `已收集数` / `已集齐` 目前只是**图变量**，游戏内无 UI 显示，
   用户只能靠「球消失」判断。若要可靠核验计数逻辑，需先补屏幕计数控件（票 14 的候选前置）。
