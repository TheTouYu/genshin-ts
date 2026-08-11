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
| `scripts/gia_log.py <日志.gia> frames` | **f21 帧表**：head/负载/IN/OUT 参数（已按 VarType+ENUM_VALUE 解码，**标注节点名与图名**）；`--gil`/`--rec <n>`/`--graph <id>` 过滤 |
| `scripts/gia_log.py <日志.gia> dump` | 逐帧原始结构 dump（无压缩，精确核对用） |
| `scripts/gia_log.py latest` | 输出日志目录下最新 .gia 路径 |
| `scripts/dump_gil_index.ts <地图.gil>` | 生成图名/节点名索引 JSON（gia_log.py `--gil` 复用；tsx 运行，输出到 /tmp 缓存） |

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
| 200-203 | AND OR XOR NOT | 806/808 | BoolToStr / FltToStr |

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
