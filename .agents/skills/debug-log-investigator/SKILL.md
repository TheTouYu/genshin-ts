---
name: debug-log-investigator
description: 查询/分析原神 Beyond_Debug_Log 调试日志（.gia）的专用技能。当用户要求"查日志/看日志/解析日志/分析 .gia 日志"、需要还原节点图执行过程（节点执行顺序、输入输出参数、变量读取赋值、控制流分支、循环迭代、负载）、或需要新增受控实验节点图来破译游戏引擎规则（改图→编译→注入→用户运行→落盘→解析）时，必须使用本技能。它给出从日志文件到逐节点执行记录的完整查询流程、已闭合的编码规则速查（VarType/ENUM_VALUE/节点ID/两级帧/负载）、可复用解析脚本，以及每次使用后沉淀新发现的成长机制（新类型码/新节点模式/新脚本/知识文档同步）。任何涉及 Beyond_Debug_Log 文件、节点执行追踪、实验日志比对的任务都先用本技能，哪怕用户没明说"日志"。
---

# 调试日志查询与破译（debug-log-investigator）

## 定位

目标：从游戏落盘的 `Beyond_Debug_Log/*.gia` 调试日志中，**完整还原节点图执行过程**——
普通打印、节点执行顺序、每个节点的输入/输出参数和值、变量读取/赋值/变化、if/循环等控制流、以及每节点"计算的负载"。
同时支持**受控实验驱动**：改实验节点图 → 编译注入 → 用户运行 → 退出落盘 → 相邻日志比对，逐步闭合未知编码规则。

权威知识文档：`docs/game-engine-knowledge/debug-log-format.md`（本技能的全部规则明细，改动必须同步）
证据快照：`~/genshin-ts-evidence/debug-log/format-investigation/raw/`
实验地图：LogFormatLab（1073741881），节点图 1073741825，实体 1077936181，实验源码 `lab/loglab.ts`

## 一句话流程

```
定位最新 .gia → 提取文本日志（验证打印）→ 帧表解码（执行过程）→ 类型码/操作码/节点定义对照 → 与用户面板逐节点核对 → 更新知识文档
```

## 工具链

| 工具 | 作用 |
|---|---|
| `scripts/gia_log.py <日志.gia> text` | 提取 f22 文本日志（按记录序，验证打印顺序） |
| `scripts/gia_log.py <日志.gia> records` | 记录概览（进程号/会话/实体/**图名**/f21 大小）；`--gil <地图.gil>` 标注图名、`--graph <id>` 过滤 |
| `scripts/gia_log.py <日志.gia> frames` | **f21 帧表**：head/负载/IN/OUT 参数（已按 VarType+ENUM_VALUE 解码，**节点名标注完整嵌套复合链**，如 `复合:A > 复合:B > 节点X`）；`--gil`/`--rec <n>`/`--graph <id>`/`--contains <文本>` 过滤（2026-08-19 升级：wire 列表值直接解码；2026-08-20 升级：head 递归解析全链，不再只显示 2 层） |
| `scripts/gia_log.py <日志.gia> perf` | **性能聚合视图（2026-08-20 新增）**：每记录 帧数/总负载/均负载 + 节点链 TOP（**真实执行性能 = 单次负载 × 次数**，按总负载降序，热点一目了然）；`--compare <日志2.gia>` 输出两次会话逐记录帧数/负载对比（优化前后量化） |
| `scripts/gia_log.py <日志.gia> dump` | 逐帧原始结构 dump（无压缩，精确核对用） |
| `scripts/gia_log.py latest` | 输出日志目录下最新 .gia 路径 |
| `scripts/dump_gil_index.ts <地图.gil>` | 生成图名/节点名索引 JSON（gia_log.py `--gil` 复用；tsx 运行，输出到 /tmp 缓存）。**仅支持 .gil 地图**；编译产物 .gia 验证用项目根 `tools/decode-gia.ts` |

日志目录：`/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Debug_Log/`

> **脚本位置**：本技能脚本在 `<技能目录>/scripts/` 下（绝对路径 `/home/h/genshin-ts/.agents/skills/debug-log-investigator/scripts/`），**不在** `/home/h/genshin-ts/scripts/`（旧位置）。运行前先 `ls` 确认，或用 `scripts/gia_log.py` 相对本文件目录解析（2026-08-12 复盘：子代理曾 find 3 轮才定位）。

## 已闭合编码规则速查（详情见 debug-log-format.md）

### 容器与记录
- 文件前 8 字节 = 两个 big-endian 长度（`文件大小-4`、`文件大小-8`），之后是连续 protobuf 记录
- **日志在内存累积，退出游戏才落盘**；文件名时间 = 会话开始时间
- 记录字段：f1=进程号 f2=会话ID f4=时间 f5=UID f6=用户名 f7={f1=1,f2=节点图ID} f8=级别(2/3) f9=实体ID f10={f2=组件定义ID} f21=执行帧 f22=文本日志

### 参数类型码 = VarType（**值字段号 = 类型码 + 10**）
| 码 | 类型 | 值字段 | 编码 |
|---|---|---|---|
| 1 | Entity | f11 | varint（2=实体索引） |
| 2 | GUID | f12 | varint（实体 ID） |
| 3 | Integer | f13 | varint（循环 i） |
| 4 | Boolean | f14 | `0801`=true（面板"是"），空=false |
| 5 | Float | f15 | **wire5 fixed32**（float 直接 4 字节） |
| 6 | String | f16 | `{f1='文本'}` |
| 12 | Vector | f22 | 3×float |
| 14 | EnumItem | f24 | varint（ENUM_VALUE） |
| 16 | LocalVariable | f26 | varint（18=循环体/19=当前循环值） |
| 8 | — | f18 | varint |
| 11 | — | f21 | 待解 |
| 18 | VariableSnapshot | f28 | varint |
| 21 | — | f31 | 待解 |

- **Vector 值**解码为 `(x, y, z)`（缺省分量补 0）
- **EnumItem 常用值**：`1100`=完全跟随 `1101`=跟随位置 `1102`=跟随旋转；`1200`=相对 `1201`=世界（668 跟随设备的坐标系/跟随类型）

- 参数序号从 0 开始，**序号 0 的 f1 字段省略不编码**
- 整数变量在帧内编码为 float（类型5）；循环迭代变量是 Integer（类型3）
- 变量初始值**不在**日志里（只记录执行帧）

### 操作码（ENUM_VALUE）
| 值 | 含义 | 值 | 含义 |
|---|---|---|---|
| 100-104 | == < <= > >= | 300-308 | + - * / % ^ max min log |
| 200-203 | AND OR XOR NOT | 802/806/808 | IntToStr / BoolToStr / FltToStr |

### 节点 ID ↔ 日志特征（node_pin_records.ts）
| 节点 | ID | 日志特征 |
|---|---|---|
| When Entity Is Created | 71 | 单帧；OUT0=Entity=2、OUT1=GUID=实体ID |
| Print String | 1 | 单帧；IN0=String |
| Double Branch（if） | 2 | 单帧；IN0=Boolean（true=真分支） |
| Finite Loop | 5 | 0d 系列多帧（见下） |
| Get Node Graph Variable | 337 | 两级帧 `{N.04子,N.03主}`；IN0=Entity上下文 IN1=变量名 |
| Set Node Graph Variable | 323 | 两级帧；IN0=Entity IN1=变量名 IN2=值 IN3=Boolean=1 IN4=Boolean=''（是否触发事件=否） |
| Addition | 200 | 单帧；IN0+IN1+IN2=EnumItem 300 → OUT |
| Data Type Conversion | 180 | 单帧；IN0=值+IN1=EnumItem 806/808 → OUT=String |

### 两级帧与负载
- 帧 ID = `{主帧号,子记录号}` 字节对；get/set = `{N.04子}` 先 + `{N.03主}` 后；print/str/add/事件/分支 = 单级
- **帧主帧号 = 图内节点序号**（对 GIL 图索引逐号对应）；**复合内帧（两字节 head）= impl 图节点序号**（`复合:名称 > 节点名` 自动标注）
- **f6 = "计算的负载"**：get/set 面板负载 = 04+03 两帧 f6 之和；循环面板负载 = 0d 全部帧 f6 之和（不含循环体内节点帧）

### finite_loop 帧模式（for i=0;i<3 → 起始0 终点2，比较 <=）
```
每轮: 0d03(进循环体) → [0d12/0d11 仅首轮] → 0d04(读当前值) → 0d05(值传递) → 0d09(NOT) → 0d08(i<=终点) → 0d0a(AND) → 0d0d(判断true继续/false跳出) → 循环体节点(0e print等)
迭代: 0d04(读值) → 0d07(i+1, 300) → 0d0c(写回当前值) → 0d04(再读)
跳出: 比较 false → 走循环完成分支（如 0f print done）
```

### 2026-08-13/14 魔方 P4 新增实证（节点级）

- **循环内执行**：finite_loop 循环体帧 head 复用（每轮相同 head），可配合 --rec 按轮核对 8 块迭代。
- **Query Dictionary Value by Key（1158）**：IN0=字典 raw（Get Node Graph Variable 输出 27 型），IN1=key，OUT0=值。**字典未填充时 OUT0 显示 `13=0.0`（空/默认值）**——排障时先看 OUT0 类型码 13。
- **Get Corresponding Value From List（128）**：**下标 0-based**——IN1=1 取第 2 个元素；越界返回空实体（Entity= 空）。1..N 遍历习惯会导致最后一块空（P4 实证）。
- **罗德里格斯链（旋转轴转换）**：3 段 zoom/subtraction/cross 组合；核对关键中间值（v·c、u×v·s、u·(u·v)）。
- **rotation 输出（Get Entity Location and Rotation 的 OUT1）**：欧拉角（YXZ 内旋）；**组合旋转后可用矩阵反推验证轴语义**（2026-08-13 实证：匀速旋转 axis 为局部轴，M_new = M·R_local）。
- **复合 head 前缀 = 调用栈（2026-08-14 #12 实证）**：head=320702 读作「宿主节点 0x32(50)=turn_block 调用 → impl 节点 7=velocity 复合 → velocity impl 节点 2」。turn_block 内 impl 序号：3202 doubleBranch / 3203 spin_block / 3204 store / 3205 运动器(84) / 3206 turn_check / 3207 velocity。用 grep -o "head=32[0-9a-f][0-9a-f]" | sort | uniq -c 即可得到复合内各节点执行计数——**链尾普通 exec 节点计数为 0 即断链信号**。
- **复合内 exec 链断链诊断（2026-08-14 #12 闭环）**
- **capture 路由缺失诊断（2026-08-14 #17 闭环）**：现象 = 编辑器复合参数显示 NaN/0（如 orbit_point 的
  c/s）+ 游戏加载失败（节点参数类型错误）。根因 = 复合输入（capture）传给子复合调用参数时，
  capture 占位值 toIRLiteral 返回 null → 序列化丢 capture 标记 → 参数丢失。
  检查链：① IR 子复合调用参数是否带 capture: true（而非 null 占位）② GIA compositePins 是否有
  outer InParam → 子复合调用 InParam 路由 ③ 调用点（子复合）capture 参数物理 pin 不落盘（编辑器规则）。
  修复后判据：日志 turn_check getList IN1 有值（0/1）、velocity 链数值正确。
  方法论教训：规则未闭合前不要在生产代码里猜语义——先让用户在编辑器做最小差分（10 秒）学真实 wire。
：现象 = 复合内全部节点有帧但链尾普通节点（如运动器）零帧 → done outflow 不触发 → 宿主链零帧 → 锁/后续逻辑不响应。根因两段：① core.ts connect 对 composite call 返回对象（仅 __markerNodeId 无 id）用 sourceRef.id → IR implEdges 源 "undefined" → materialize 静默丢边；② 即使 IR 边正确，普通 exec 节点缺物理 InFlow pin。修复后日志判据：链尾节点出现帧（m1 head=3205 4 帧）+ 宿主链恢复（head=34/36/3a/3f 等）+ 定时器写入 __gsts_timeout_N_index。

### 2026-08-14 复合定时器链新增实证（#19/#20 闭环）

- **事件回调中 capture 惰性重求值（#19）**：现象 = 定时器触发帧存在（When Timer → 分发帧）
  但后续动作零帧。根因 = 复合输入 capture 在**事件回调（延迟执行路径）**中不是调用时快照，
  引擎沿数据链追回宿主数据源（2690 rec7：注册时 i=1→DTC OUT="1"，触发时重求值=0→"0"，
  Equal(timerName,"0") 失败）。检查链：① 回调里是否用了 capture 派生值做匹配
  ② 帧序列是否出现"主图 Finite Loop 帧混入事件回调"（追源证据）
  ③ 事件载荷字段（timerName/timerSequenceId/eventSourceEntity）是否可用。
  修复判据：回调改用事件载荷 + 字面量（case 内 i 字面量），触发后动作帧出现。
- **impl 内部 exec 边 → 复合调用零内部帧（#20）**：现象 = 事件触发 → MB 匹配 → 复合调用帧
  出现，但被调复合 impl 零帧。根因 = 复合调用节点缺物理 InFlow pin（buildCompositeCallPins
  只生成显式声明的 flow pin；impl 内部 exec 边目标的 InFlow 不在 boundaryPins 收集范围）。
  检查链：① read 复合 impl 图（gil-node-graph-reading）核对 MB 分支 → 子复合调用边是否
  存在 ② 被调复合接口 inflows 是否非空（**混合复合被误判为纯事件复合 → inflows=[] →
  注入器裁剪调用点引脚 → 分支边丢失，#20c**）。
  修复判据：读图自检执行流条数 = MB 分支数 + 后续链数（dispatch 应为 5 条），
  被调复合 inflows 非空。

### 玩法逻辑调试流程（从用户反馈到逐帧定位，2026-08-13/14 实证）

0. **无日志排查阶梯（2026-08-16 灯阵案例迭代，用户原话规则）**：没有日志只有两种情况——
   ① **游戏/地图没启动**：日志目录无新 `.gia` 文件 → 请用户确认进入了目标地图；
   ② **游戏启动了但无/空日志**：大概率**启动图未挂载**——目标地图的节点图没有挂载到任何
   实体（挂载是执行前提，graph-mounting.md），或挂载了但**图是空占位**（无节点逻辑，如
   灯阵玩法图 P5 编写前——空图无帧，日志自然为空，属预期而非 bug）。
   **③ 加载期拒载错误根本不落日志（2026-08-16 灯阵第 4 次信号错误实证）**：游戏"参数错误"
   级别极高、进不去地图时，Beyond_Debug_Log 不会产生新文件（执行日志在游戏运行后才有）。
   用户报告"进不去游戏"且日志目录无新文件时，优先走差分流程（我们版本/自动保存版/用户
   修复版逐字段对比），不要继续等日志。
   排查顺序：确认进图 → `gsts assets:mounts list --gil <地图>` 核对图有挂载实体 →
   `assets:node-graphs read` 核对图有实际节点。先按此阶梯定位，不要直接怀疑编译/注入。
1. **等日志落盘**：游戏退出时才写日志（内存累积）——先请用户退出游戏，再找最新文件。
2. **records 概览**：识别"一次操作"的记录组（如 tab 事件大记录 + 定时器回调 + 解锁）；同一操作重复出现的组结构相同。
3. **frames 逐帧解码**：--gil 带节点名；过滤关键节点（事件/位置读取/查询/运动器/减法）。
4. **常见帧模式对照**：

| 现象（帧） | 结论 | 下一步 |
|---|---|---|
| Query Dictionary OUT0 = 13=0.0 | 字典未填充/键不存在 | 检查写入节点是否执行（whenEntityIsCreated 填充） |
| 运动器 IN0:Entity= 空 | 空实体（列表越界/字典空值） | 检查 0-based 下标/字典值 |
| 全 0 int_list 变量读出来只有 2/3 个元素（如 `cornerOrient=[0,0]`、`edgeOrient=[0,0,0]`，但 GIL 声明 8/12） | 引擎对“全 0 int_list”只物化出很短长度；且写 0 到越界下标不扩容 | 先写非 0 哨兵逐下标撑满，再写真实 0 值（`logicReset` 两阶段复位） |
| Get Entity Location OUT0 偏离网格 | 位置漂移（公式/预计算问题） | 核对速度计算中间值 |
| rotation 组合后异常 | 轴语义（局部轴） | 矩阵反推验证（YXZ 内旋 R=Ry·Rx·Rz） |
| 黑面/贴纸错误但块位置正确 | 朝向索引/局部轴表约定错误：`rotate` 输出是 **(x,y,z)**，矩阵 `R=Ry(y)·Rx(x)·Rz(z)` | 先对比 26 块实际位置与 cornerPos/edgePos（位置一致则排除位置）；再提取 `GetEntityLocationAndRotation` 实际欧拉，与生成器预测欧拉逐块差分（2026-08-21 魔方黑面实证） |
| 循环帧 head 复用 | 循环内执行 | 按轮核对各迭代值 |
| 复合内上游全执行、链尾普通节点零帧（如 head=3205 运动器 0 帧） | synthetic→ordinary exec 边断链（IR 边源 "undefined" / 目标缺 InFlow pin） | ① check IR implEdges 无 "undefined" 源 ② read 复合 impl 图核对链尾节点有 InFlow pin + 上游 OutFlow connects |
| 链尾节点出现帧 + 宿主链恢复 + 定时器写入（__gsts_timeout_N_index） | 断链修复生效 | 对照修复前后帧分布（head=32xx uniq -c）确认仅链尾列从 0 变非 0 |
| 同一 exec 节点（如 Start Timer）在一条 record 内出现 2 次相同 head | 该节点有两条 InFlow 入边（常因 `f.callComposite` 后 `f.registerExecNode` auto-chain + 显式 connect 重复） | 读真实 GIL `flow` 列表核对入边数；把链尾 `registerExecNode` 改 `f.node` + 显式 `f.connect`，只留一条入边 |
| 整体转 orbit2 事件明显晚于预期（如 >0.8s 才出现） | 链式定时器把后续 chunk 的延迟当绝对时间累加（orbit2 后续段仍用 0.51..0.57 相对启动） | orbit2 不要链式；改用单一定时器全量列表，或后续段用 0.01..0.07 相对小延迟 |
| 游戏报"列表长度超过100"/"index out of bounds"（加载期或运行时） | 图变量初始列表字面量 > 100 元素（引擎限制）；或长列表复合（如 `long_list_get_vec3`）内部 `getCorrespondingValueFromList` 下标 ≥ 列表长度 | 检查 `game.json` 中所有变量初始值列表长度；读真实 GIL 图变量声明确认；长列表必须拆成 ≤100 分块 + 用 `long_list_get_*` 复合读取 |
| queue dict 出现非法值（如 -4/18446744073709551612 或 16） | `finiteLoop` 内 `doubleBranch`（wrap 检查）的回调中 `set_or_add` 写字典不可靠：wrap 分支 `setM` 不执行 / 非 wrap 分支 `setQ` 缺位 → 后轮 raw 越界变负 → `logicApplyFace(-4)` 崩溃。**根因：`registerExecNode` 在 `finiteLoop` 内 `doubleBranch` 回调中的状态写不可靠**（与 PROGRESS.md:42 同类问题） | 修复：每项独立 `getRandomInteger(1n,9n)` 直写 `queue[i]`，删 lastMove/wrap/doubleBranch/setLast；`flowDoMove` 顶部加 moveId∈[1,12] 合法性守卫 |

5. **数值对比**：实际读取值 vs 期望（网格坐标/理论速度）——差异即根因方向。
6. **修复 → 注入 → 用户重测 → 新日志复验**：每轮一个可归因变量，日志确认修复生效。

## 查询流程（逐层）

1. **定位文件**：`gia_log.py latest` 或按用户告知的文件名；先 `capture-evidence.py` 存证据快照+sha256
2. **文本日志**：`text` 子命令 → 验证打印顺序与预期逻辑一致（这是"红绿灯"，先确认逻辑执行了）
3. **记录概览**：`records` → 找 f21 记录（新会话在最后）
4. **帧表解码**：`frames --gil <地图.gil> --rec <n>` → 得到逐节点执行序列（head/负载/IN/OUT + 节点名/图名）
5. **原始核对**：`dump` → 对可疑帧看原始结构（值解析异常时）
6. **语义对照**：
   - 类型码 → 上面 VarType 表
   - 操作码 → ENUM_VALUE 表
   - 帧模式 → 节点 ID 表（节点定义查询流程见 gil-node-graph-editing 技能"节点 ID / 名称查询速查"）
7. **用户面板核对**：请用户从游戏面板提供节点名/参数名/负载，逐项对照（参数名如"实体"、"guid"、"变量名字"、"是否触发事件"）
8. **沉淀**：新发现 → 更新 `debug-log-format.md` + 本技能速查 + manifest（`~/genshin-ts-evidence/debug-log/format-investigation/notes/manifest.md`）

## 性能分析 playbook（2026-08-20 魔方性能优化实证，复用标准命令）

目标：量化"每次操作/每 tick 的真实执行性能 = **单次负载 × 执行次数**"，并定位**被踢关键指标 = 每秒负载**。
**首选 `perf` 子命令**（一步到位）：

1. **会话全景 + 每秒负载（首选，2026-08-21 升级）**：
   ```bash
   gia_log.py <日志.gia> perf --gil <地图.gil> --compare <优化前.gia> 2>/dev/null
   ```
   输出：
   - **每秒负载表**：按记录字段 f3（会话内已过秒数）分组，帧数/总负载/均负载按降序 TOP + 时间序峰值；
     **这是"1秒内平均负载过高被踢"的直接指标**。
   - `--sec <n>`：查看指定秒的节点链明细，定位该秒内是哪些节点把负载推高（如整体转 orbit2 8 次×35 负载）。
   - 每记录：秒 / 帧数 / 总负载 / 均负载（找大记录与重复模式：~380=点击、~963=面转、~2605=整体转）。
   - 节点链 TOP（次数 × 总负载，**一眼看出真实热点**）。
   - `--compare`：逐记录 + 逐秒 Δ 帧/Δ 负载。
2. **单记录帧明细（需要具体值/时序时）**：`frames --gil <地图> --rec <n>`——帧已标注**完整嵌套节点链**
   （`复合:A > 复合:B > 节点X`），配合 `--contains <节点名>` 定点过滤；load= 字段看单帧负载。
3. **一次完整操作帧预算**：perf 每记录帧数求和（如 28 点击 + 963 面转 + 477 视觉 + 7×174 块事件 ≈ 2800）；
   优化前后同操作对比（perf --compare 直接给 Δ）即量化收益。
4. **`--compare` 按 rec 对齐，只适用于相同操作序列**；两轮操作组合不同（如一轮整体转、一轮打乱+面转）时，
   自动 Δ 会误导——按操作类型手工抽同类记录（face/whole/afterTurn）再比（2026-08-20 魔方优化轮实证）。
5. **滚动窗口定位被踢（2026-08-21 3×3 魔方实证）**：1 秒峰值更高不一定被踢（旧日志 9,439 未踢），
   要看 **3s/5s/10s 连续负载窗口**——新日志 10 秒窗口 34,180 > 旧日志 28,938 才是被踢分水岭。
   分析时用 `perf` 每秒负载表手工累加滚动窗口，或写一次性 python 对 f3 秒桶做滑动和。

**典型热点形态**（优化目标模板）：
①复杂链输出被 ≥2 处消费 → **物化到变量**（set 后 get 读回）只付读变量负载（魔方 vel1 实证：块事件 -14 帧/事件）；
②事件回调里对每个候选实体做位置读取+层判断 → 改逻辑层表数据直接确定命中（turn_lookup 改造）；
③简单节点（GetVar load=2）被多处消费 → 共享引用只减节点**不减负载**（exec 链实测无效，纯数据复合有效）；
④跨图共享状态在**每个定时器事件**里重复 `syncShared`（GetCustomVariable+SetNodeGraphVariable 链每 tick 跑）
  → 面转 16 次/整体转 52 次重复同步，单次转动负载 ~5000-10000；改成**每次操作首个事件同步一次**
  （`base==0 && seq==0`），后续事件直接用图变量（2026-08-21 3×3 魔方实证）。

## 受控实验流程（破译新规则）

1. 修改 `lab/loglab.ts`（唯一变量：新增逻辑段）
2. `node bin/gsts.mjs lab/loglab.ts --noinject` → `npx tsx /tmp/inject_loglab.ts` → `node bin/gsts.mjs maps:resync --map-id 1073741881`
3. 请用户：重新加载 LogFormatLab → 运行 → 退出游戏 → 告知
4. `gia_log.py latest` + 上述查询流程解析
5. 只改一个变量；失败/异常先解释再继续；真实地图写回保持用户确认

## 成长机制（每次使用后必做）

使用完一轮后，把**新的、可复用的**发现沉淀到：
1. `docs/game-engine-knowledge/debug-log-format.md`：新类型码/操作码/节点模式/帧规律/实验记录（区分已验证与待解）
2. 本技能速查表：高频命中的规则（低于知识文档的细节门槛）
3. `scripts/gia_log.py`：新值编码类型/新解码逻辑（保持单一脚本，能跑旧文件回归）
4. manifest：实验编号、文件 sha256、结论摘要
5. 验证：对旧实验文件（2604/2605/2606/2607）重跑脚本确认不回归

### 规则反馈检查
- 每轮结束检查：本轮发现是否与现有规则冲突？冲突时以真实日志+用户面板为准，更新适用范围最小的文件
- 局部/一次性经验不写文档，写 manifest 即可

## 待解问题（破译方向）

- get/set 帧中 Boolean=1（0801）输入的含义（疑似同步/有效标志，面板不显示）
- 循环 0d05（300 但输出=输入）与 0d09（NOT 但 2 输入）的精确语义
- f3 规律、f8 级别完整枚举、f7.f1 含义、帧 ID 分配规律（2602 的 47.x 跳号）
- 变量初始值定义位置（推测在 GIL 图数据中）
