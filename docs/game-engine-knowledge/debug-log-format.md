# 调试日志格式（Beyond_Debug_Log）

状态：核心结构已验证，控制流已闭合（2026-08-11 实验 1-4）
来源：真实游戏日志文件相邻快照 + 受控实验地图（LogFormatLab 1073741881）+ 游戏面板逐节点核对（用户辅助）+ 第三方节点定义对照
证据快照：`~/genshin-ts-evidence/debug-log/format-investigation/raw/`
解析器：`/tmp/gia_debug_log_extract.py`（记录/字段遍历）、`/tmp/gia_f21_table.py`（f21 帧表解码，含 VarType 值字段映射）

## 文件与落盘时机

- 目录：`<BeyondLocal>/110170759/Beyond_Debug_Log/`
- 命名：`YYYY-MM-DD_HH-MM-SS_<进程号>_<uid>.gia`（如 `2026-08-11_16-36-18_2604_110170759.gia`）
- 文件名时间 = 会话开始时间；文件里所有记录的时间字符串（f4）都是会话开始时间，不是逐条时间
- **落盘时机：日志在游戏内存累积，退出游戏时才写入磁盘**（用户实测 2026-08-11）。游戏运行期间文件可能完全不增长
- **无日志排查阶梯（2026-08-16 灯阵案例，用户规则）**：①无新 .gia = 游戏/地图未启动；
  ②启动但无/空日志 = 目标图未挂载到实体（挂载是执行前提）或图为空占位（无节点逻辑，
  空图无帧属预期）。先查 mounts list + node-graphs read，不直接怀疑编译/注入。
- 一个文件可能包含多个子会话（f2 会话 ID 的尾号递增，如 `...-134377`、`...-134378`）

## 容器格式

```
4 字节 big-endian：文件总大小 - 4
4 字节 big-endian：文件总大小 - 8
之后：N 条记录，每条 = protobuf message（外层 tag 为 f1 wire2，即记录本身是外层 f1 字段的值）
```

## 记录字段（已确认）

| 字段 | 类型 | 含义 | 证据 |
|---|---|---|---|
| f1 | varint | 进程号（= 文件名数字） | 多文件一致 |
| f2 | str | 会话 ID `47504-<uid>-<unix秒>-<序号>` | |
| f3 | varint | **会话内已过秒数**（部分记录有；同秒多条记录共享同值，如 80,80,80,81,81...；用于每秒负载聚合） | 2026-08-21 3×3 魔方会话：首条 f3=80，末条=104，与 25 秒操作时长吻合 |
| f4 | str | 时间 `YYYY/MM/DD_HH:MM:SS`（会话开始时间） | |
| f5 | varint | 玩家 UID（110170759） | |
| f6 | str | 用户名（"透雨"） | |
| f7 | bytes | `{f1=1, f2=<节点图ID>}`——**当前运行的节点图引用** | 2604: 1073741825=我们的图 |
| f8 | varint | 级别（2=创建类，3=运行类） | 观察归纳 |
| f9 | varint | **当前实体 ID** | 2604: 1077936181=log-entity；旧文件 1077936180=旋转中心 |
| f10 | bytes | `{f2=<组件定义ID>}`（10005018=空模型） | 2604 |
| f21 | bytes | 状态快照：节点执行追踪（见下） | |
| f22 | bytes | 文本日志 `{f1=进程号, f2=<文本>}` | `hello from loglab` |

## f21 节点执行追踪

每次节点执行产生一帧，帧结构：

```
f21 = {
  f1 = 一帧（多条，按执行顺序）:
    f1 bytes(≤2) = 动态帧 ID（varint 编码；每次运行动态分配，同一图两次运行不同：
                  2601 会话=19.x → 2602 会话=47.x → 2604=01/02）
    f2 varint   = （仅部分帧，含义待解）
    f4 bytes    = 输入参数（多条，按 f4.f1 序号 0..n；序号 0 时 f1 字段省略不编码）：
      f1 varint = 参数序号（0 省略）
      f2 bytes  = { f1=类型码(VarType), f2={f1=同类型码, f2=''}, f<类型码+10>=值 }
    f5 bytes    = 输出参数（结构同 f4）
    f6 varint   = 计算的负载（节点工作量计数；get/set 节点 = 两帧负载之和）
}
```

## 客户端节点图日志（2026-08-28 魔方-客户端优化版本会话 2979 实证）

客户端图（type≠20000，如 20010 角色操控技能图）执行也落同一日志文件，但记录与帧编码与服务端不同：

### 客户端记录特征

| 维度 | 服务端记录 | 客户端记录 |
|---|---|---|
| graph | 服务器图 ID | 客户端图 ID（如 1082130436） |
| f8 | 级别 2/3 或图内序号 | **2097154（0x200002）**，恒同值（客户端图标记+级别） |
| f22 文本 | Print String 输出 | **无**——客户端图打印不落服务器日志（官方有独立「客户端节点图日志」功能 mhrnuz9izfne） |
| 帧规模 | 每事件几十帧 | **一次技能实例释放=一条记录**（整体旋转 1438 帧 101KB；面旋转 1295 帧 91KB） |

### 客户端帧结构（f21 内，与服务端帧同字段但语义不同）

```
f21 = {
  f1 = 一帧（多条，从「节点图开始」顺序执行到链尾）:
    f1 varint   = head：图内节点序号（**不是动态帧 ID**！n=114 即 head=0x72；
                  序号 ≥128 用 varint 多字节，如 n=130 = head 8201）
    f4 bytes    = 输入参数（嵌套结构同服务端 {f1=类型码, f2={...}, f<码+10>=值}）
    f5 bytes    = 输出参数（结构同 f4）
    # 无 f6 负载字段——客户端日志不记录计算负载（load 恒 None）
}
```

- head ↔ 节点名：head varint = parse --json 的 nodes[i].index；再用 generic_id 查
  client_node_metadata.ts 映射 displayName（见 gil-node-graph-reading 技能 Step 2.8）
- 客户端多分支帧：IN0=控制表达式，IN1:StringList=case 值（解码器显示首元素）

### 枚举新增（DTC 数字族，客户端/服务器复合 impl 通用）

| 值 | 含义 | 证据 |
|---|---|---|
| 801 | IntToFlt | Integer 90 → Float 90.0；uint64 18446744073709551615 → -1.0（负整数 uint64 显示坑，同服务端） |
| 805 | BoolToInt | 布尔→整数（是否整体旋转） |
| 807 | FltToInt | Float 90.0 → Integer 90；5.96e-08 → 0（四舍五入取整=客户端"三维向量取整"内联实现） |

与字符串族 802=IntToStr / 806=BoolToStr / 808=FltToStr 平行。

### 类型码 20（单位状态配置，客户端/服务器通用）

值 = 嵌套 protobuf `{f8:[状态嵌套], f1:1, f16:状态ID varint}`；状态 1077936131（0x40400003）显示为
`20=[8, 1, 16, 131, 128, 128, 130, 4]`（f16 尾部 5 字节 = 0x40400003 的 varint）。
出现在 Query If Entity Has Unit Status / 添加单位状态 / Remove Unit Status 的配置参数。

### 跨端通信日志铁证（魔方一次完整旋转的执行序列）

1. **玩家点按钮**：When Floating Interaction Page is Triggered（OUT2/OUT3=按钮 ID）→ Create Dictionary
   （按钮 ID → 指令编码表：F/B/L/R/U/D=1073741937~1073741940、x/y/z=1073743064~1073743066）→
   Query Dictionary Value by Key → Set Local Variable → Set Custom Variable "指令"=x（IN4:Boolean=1 触发变量事件）
2. **服务器施放技能实例**：When Custom Variable Changes（OUT2="指令"）→ Equal → Get Custom Variable
   "技能实例ID"=10000001 → Cast Specified Skill Instance（IN0=角色实体、IN1=10000001、IN2=校验 false）
3. **客户端图整链执行**（一条记录）：节点图开始 → 读"指令" → 多分支 fallthrough 解析 → 设置局部变量
   （层数/范围中心/角度/轴/轴向/角速度）→ 向量计算 → 获取单位标签实体列表 26 块 →
   遍历实体列表（每块：层数判定 |分量|≤层数/2 → 添加单位状态 1077936131 + 3 变量旋转取整 + 还原计数）→
   「向服务器节点图发送信号」：IN0=旋转时长、IN1=旋转角度、IN2=是否还原、IN3/IN4=整体向前/向上向量、
   IN5=指令异常（与服务器监听信号 OUT 参数逐位一致）
4. **服务器 26 块各自动画**：监听信号（OUT0=本块实体）→ Query Unit Status（客户端已加状态）→
   遍历 [位置,向前向量,向上向量] 各自 3D Vector Rotation(信号角度)×当前值 → 取整写回 →
   玩家变量"魔方动画"=1 → Add Basic Target-Oriented Rotation-Based Motion Device
   （IN1="旋转"、IN2=时长 0.5、IN3=目标旋转）→ When Basic Motion Device Stops（OUT2="旋转"）→
   Remove Unit Status（1540 同名全清）
5. **指令编码**：整体旋转=x（层数 3、轴 (1,0,0)、+90°）；面旋转=D（层数 1、范围中心 (0,-1,0)、
   轴 (0,-1,0)、轴向 y、-90°）

### 参数类型码 = VarType 枚举（第三方定义 protobuf/gia.proto 确认）

**值字段号 = 类型码 + 10**（如 类型5→f15、类型12→f22、类型16→f26、类型18→f28）

| 类型码 | VarType | 值字段 | 含义 | 值编码 |
|---|---|---|---|---|
| 1 | Entity | f11 | 实体 | varint（如 2=实体索引） |
| 2 | GUID | f12 | 实体引用 | varint（实体 ID） |
| 3 | Integer | f13 | 整数 | varint（循环当前值 i） |
| 4 | Boolean | f14 | 布尔 | `0801`=true（面板显示"是"），空=false |
| 5 | Float | f15 | 浮点 | **wire5 fixed32**（little-endian float 直接编码） |
| 6 | String | f16 | 字符串 | `{f1='文本'}` |
| 12 | Vector | f22 | Vector3 | `{f1=float,f2=float,f3=float}` |
| 14 | EnumItem | f24 | 枚举项/操作码 | varint（ENUM_VALUE，见下） |
| 16 | LocalVariable | f26 | 局部变量引用 | varint（如 18=循环体、19=当前循环值） |
| 18 | VariableSnapshot | f28 | 变量快照 | varint |

（varint 值字段内部是 `{f1=<值>}` 嵌套；float 值字段是 wire5 直接 4 字节）

### 枚举操作码（ENUM_VALUE，第三方定义 enum_id.ts 确认）

| 值 | 含义 | 出现位置 |
|---|---|---|
| 100-104 | 比较：等于/小于/小于等于/大于/大于等于 | 循环条件 0d08 用 102（<=） |
| 200-203 | 逻辑：AND/OR/XOR/NOT | 循环条件组合 0d0a(200 AND)、0d09(203 NOT) |
| 300-308 | 数学：加法/减法/乘法/除法/取模/幂/最大/最小/对数 | addition 帧(300)、循环步进 0d07(300) |
| 802 | IntegerToString | str(int) 转换帧（2026-08-13 魔方 P4 日志闭合：Int→Str 转换 IN1=802） |
| 806 | BooleanToString | str(bool) 转换帧 |
| 808 | FloatingPointToString | str(float) 转换帧 |

### 节点 ID ↔ 日志帧对照（第三方定义 node_pin_records.ts 确认）

| 节点名 | ID | 引脚（定义） | 日志特征 |
|---|---|---|---|
| When Entity Is Created | 71 | 输出：实体(Ety)、guid(Gid) | 单帧；OUT0=类型1=2、OUT1=类型2=实体ID |
| Print String | 1 | 输入：Str | 单帧；IN0=类型6 字符串 |
| Double Branch（if） | 2 | 输入：Bol | 单帧；IN0=类型4 条件（true=走真分支） |
| Finite Loop | 5 | 输入：Int,Int；输出：Int | 0d 系列多帧（见下） |
| Get Node Graph Variable | 337 | 输入：Str | 两级帧 `{N.04 子帧, N.03 主帧}`；IN0=实体上下文(类型1=2)、IN1=变量名 |
| Set Node Graph Variable | 323 | 输入：Str,R\<T\>,Bol | 两级帧；IN0=实体上下文、IN1=变量名、IN2=值、IN3=类型4=1、IN4=类型4=''（是否触发事件=否） |
| Addition | 200/201 | 输入：R\<T\>,R\<T\>；输出：R\<T\> | 单帧；IN0=操作数、IN1=操作数、IN2=类型14=300 |
| Data Type Conversion | 180 | 输入：R\<K\> | 单帧；IN0=值、IN1=类型14=802(int)/806(bool)/808(float)、OUT0=类型6 |
| Add Uniform Basic Linear Motion Device（运动器） | 84 | 输入：Ety,Str,Flt,Vec | 单帧；复合内 head=3205 前缀（#12 实证 2026-08-14：修复前 0 帧/修复后 4 帧） |

### 两级帧 ID 规律

- 帧 ID 是 `{主帧号, 子记录号}` 字节对（如 0303、0304、0d07、0d12）
- get/set 数据节点：`{N.04 子帧}` 先、`{N.03 主帧}` 后（负载分别计入，面板总负载=两者之和）
- 事件/print/str/add/double_branch：单级帧（如 01、02、08、0b）
- 循环节点（0d 主帧）内部子记录号：03/04/05/07/08/09/0a/0c/0d/0f/11/12

### 负载（f6）规则（用户面板逐节点核对确认）

- 每个节点执行帧的 f6 = 该节点"计算的负载"（面板同名）
- **get/set 节点面板负载 = 04 子帧 + 03 主帧两个 f6 之和**（如 get flag=1+7=8、set count=1+5=6）
- 单帧节点（add=3、print、str）负载 = 单帧 f6
- 循环节点面板负载 78 = 0d 系列全部帧 f6 之和（不含循环体内 print 帧）
- f6 与节点类型/参数相关，无单调规律（不是序号）

## finite_loop（0d 系列）完整帧模式（实验 4：for i=0;i<3）

编译结果：`finite_loop(起始=0, 终点=2)`，条件用 **<=（102）**；每轮执行：

```
0d03  进入循环体（OUT 类型16=18=循环体局部变量引用 + 类型4）
0d12  循环初始化续（仅第 1 轮；IN 类型16=18）
0d04  读取当前循环值（OUT 类型16=19=当前值引用 + 类型3=值）
0d11  续（仅第 1 轮；IN 类型16=19）
0d04  再次读取当前值
0d03  再次进入
0d05  加法(300)：IN0=引用 + IN1=当前值 → OUT=当前值（值传递/复制）
0d09  NOT(203)：IN0=引用 + IN1=引用 → OUT=1（条件前检查）
0d08  比较(102)：IN0=当前值 + IN1=终点(2) → OUT=bool（i<=2）
0d0a  AND(200)：IN0=NOT结果 + IN1=比较结果 → OUT=bool
0d0d  循环判断：IN=bool（true→执行循环体；false→跳出）
0e    （循环体内节点，如 print('loop-body')）
—— 下一轮：0d03 → 0d09 → 0d0f → 0d04 → 0d07(i+1) → 0d0c(写回) → 0d04 → 0d03 → 0d05 → 0d09 → 0d08 → 0d0a → 0d0d → 循环体
```

- **0d07** = 迭代步进加法(300)：IN0=当前值 + IN1=1 → OUT=当前值+1
- **0d0c** = 写回：IN0=类型16=19 + IN1=新值（更新当前循环值）
- **0d0f** = 循环继续标记（IN 类型4=1）
- 跳出轮（i=3）：0d08 比较 3<=2=false → 0d0a AND 输出空 → 0d0d 不再进入循环体 → 走循环完成分支（0f 后续节点）
- 循环体内 print 帧 head=0e（load=4/3/3），循环完成 print head=0f

## 实验记录

- 实验 5（2608，子代理解析）：四则运算 + while + 嵌套 if，100 帧（f21 5468B），8 条文本全部命中（start/32/64/16/while-body×2/nested-false/done）
  - 减法=帧5（301，202）、乘法=帧14（302，204）、除法=帧23（303，206），均单帧
  - 嵌套 if：分支帧(1f)→get count→大于比较帧(21, 103, 232)→内层分支帧(22)→else print
  - while：护栏循环（17xx 主帧，界 0..999，<=102）+ 条件检查（<101）+ 手动步进（i+1, 300），双计数器（Integer 护栏 + Float 条件）
- 历史日志解析（子代理，2026-08-11）：2602 全量 1102 帧 / 2601 抽样 5512 帧（足球_1 魔方图）
  - 已验证规则与受控实验完全兼容；新闭合：复合节点子帧模式（09/2f 旋转宏）、实体变量单帧 get/set、创建实体节点（预制件 ID）、信号系统（匹配/发送）、类型码 8/11/21、操作码 1100/1101/1200/1201、f8=4、Vector 零分量省略、帧 ID 编译时分配且图版本内稳定
  - 图版本差异：2602 版多"复原"逻辑，复合节点主帧号 2f≠13（节点序号偏移）

- 实验 1（2604）：whenEntityIsCreated → printString('hello from loglab')，2 帧
  - 帧 01 = 事件节点：输出 {类型1, f11=2} + {类型2, f12=实体ID}
  - 帧 02 = print 节点：输入 {类型6, f16='hello from loglab'}
- 实验 2（2605）：加变量 count=42，打印 str(count)，6 帧（f21 288B）
  - 帧 01 = 事件节点（同实验 1）；帧 02 = printString
  - 帧 0303/0304 = get_local_variable（**两级帧 ID {主,子}**）：输入 {类型1=2}+{类型6 'count'}+{类型4 0801}；输出 {类型5=42.0f}（数字值编码为 float）
  - 帧 04 = str() 转换：输入 {类型5=42.0f}+{类型14=808}；输出 {类型6 '42'}
  - 帧 05 = printString '42'
- 实验 3（2606）：4 变量（count:int=42, ratio:float=3.14, name:str='loglab', flag:bool=true）+ set 赋值 + 多次读取，22 帧（f21 1449B），8 条文本全部命中
  - 值编码：int/float→类型5 f15；bool true→类型4 f14=0801；str→类型6 f16
  - set 节点（0e03/1203）：{类型1=2}+{变量名}+{新值}+{类型4 0801}+{类型4 空}；get 节点（0303 等）：{类型1=2}+{变量名}+{类型4 0801}→输出值
  - str() 转换：数字 f24=808、bool f24=806
- 实验 4（2607）：if 分支 + 算术 + for 循环，69 帧（f21 3817B），7 条文本全部命中
  - 帧序列：01 事件 → 02 print('start') → 0303/0304 get flag → 04 double_branch(true) → 05 print('branch-true') → 0703/0704 get count=42 → 08 addition(42+8=50, 300) → 0903/0904 set count=50 → 0a03/0a04 get count=50 → 0b str→'50' → 0c print → 0d 系列循环×3 轮（含 0e print loop-body×3）→ 0f print('done')
  - 循环终点值 = 2（for i<3 编译为 0..2），比较 i<=2（102）；i=3 时 false 跳出
  - 用户面板核对：N3 get flag 负载 8=1+7 ✓、N6 get count 5=1+4 ✓、N7 add 3 单帧 ✓、N8 set 6=1+5 ✓、N9 get 4=1+3 ✓、N12 循环 78=0d 帧和 ✓、done print 3 ✓

## 已确认规则（更新）

- **f6 = 节点的"计算的负载"**（游戏面板同名词条；get/set = 子帧和；循环 = 帧和；2026-08-11 用户面板逐节点核对）
- **参数类型码 = VarType 枚举**（1=Entity 2=GUID 3=Integer 4=Boolean 5=Float 6=String 12=Vector 14=EnumItem 16=LocalVariable 18=VariableSnapshot；2602 另见 8/11/21，见下）；**值字段号 = 类型码+10**（f11..f28）
- **参数序号从 0 开始，序号 0 的 f1 字段省略不编码**（protobuf 规则）
- **bool true = 类型4 f14={f1=1}（0801），面板显示"是"**；false = 空
- **整数在帧内编码为 float（类型5 f15）**（int 变量、str() 输入）；循环迭代变量是真正的 Integer（类型3 f13 varint）；while 条件计数=Float（类型5）
- **str() 转换 = Data Type Conversion (id=180)**：数字 f24=808、bool f24=806
- **四则运算节点**：Addition=200(300+)、Subtraction=202(301-)、Multiplication=204(302*)、Division=206(303/)，均为单帧（IN0+IN1+操作码→OUT）
- **if = Double Branch (id=2)**：IN0=bool 条件（true=真分支）；嵌套 if = 分支帧→比较帧→分支帧级联；**未执行路径的节点完全不出现**
- **比较节点**：Less Than=230(101)、Less/Equal=231(102)、Greater=232(103)、Greater/Equal=233(104)
- **循环 = Finite Loop (id=5)**：for i<3 → (0, 2) + <= 比较（子帧 03/04/05/07/08/09/0a/0c/0d/0f/11/12）
- **while 循环形态（2608 闭合）**：编译为「护栏有限循环 + 条件检查 + 手动步进」双计数器——护栏循环界 (0,999) 用 <=999(102) 做最大迭代保护（子帧与 0d 系列同构，仅主帧号不同）；while 条件用真实运算符（如 <101）与真实界比较；循环体内手动 i+1(300)
- **帧 ID = 图编译时分配的节点序号**（主帧号+子记录号）；**同一图版本内完全稳定**（多次执行/跨会话一致）；2602 的 47.x = 复合节点主帧号 0x2f=47（图版本差异所致，非运行跳号）
- **复合节点（宏）模式（2602 闭合）**：主帧号+子图节点号（如 09 旋转复合：01=pivot位置、02/04/06/08=设置角块、03/05/07/09=存变量、0a/0f/10/11=向量减、0b-0e=取角位置）；子步骤号固定，执行时按需调用
- **实体变量 get/set = 单帧**（区别于图变量 get/set 两帧 {N.03,N.04}）
- **创建实体节点**：IN0=类型21(f31 预制件ID) IN1=Vector IN2=Vector（+IN3-7 其他）
- **信号系统（2602 闭合）**：匹配节点（IN0=信号名, IN1=StringList）；带参信号发送节点（IN0=Entity, IN1=信号名, IN2+=参数）
- **新类型码（2602 观察）**：8=f18 packed 字节列表（如 01020304050607）、11=f21 字符串列表（UDLRFB 魔方记号）、21=f31 {f1=1, f2=预制件ID}
- **新操作码（2602 观察）**：1100/1101（完全跟随/跟随位置）、1200/1201（相对/世界坐标系）
- **Vector 零分量省略（2602 闭合）**：如 (0, 2.4357, 0) 只编码 f2
- **f8 = 记录相关实体的实体索引（2026-08-28 会话 2980 完整游玩日志实证，推翻"级别"说）**：魔方块-旋转
  每条记录 f8=5..30 ↔ 客户端遍历实体列表 IN1=[5..30] ↔ 帧内监听信号 OUT0:Entity=f8 逐条一致；
  玩家-界面恒 f8=3（实体 1086324738 的索引）；结算合法 f8=1。客户端图记录 f8=2097154(0x200002)=客户端标记。
  旧注"2=创建类、3=运行类、4=特殊图"（2602 轮询图）实为该图相关实体索引 2/3/4，已修正理解。
- **f3 = 会话内已过秒数（2980 完整日志闭合）**：全部记录同一时间轴（8..165 秒），perf 秒桶依据；
  不再视为"f22 记录规律"。
- **f7.f2 编码变体**：图 ID 可为 bytes（2602）或 varint（2604/2608）
- **float 编码 f15 = {f1 wire5 fixed32}**：4 字节 ≥0x80 时不能当 varint 解析（-90.0 等负值）；外层是 length-delimited
- **get/set 节点面板参数名**：变量名字、变量值、（set 有）是否触发事件=否（IN 空）
- 事件节点（When Entity Is Created id=71）输出参数名："实体"（类型1=2）、"guid"（类型2=实体ID）
- 两级帧 ID：图变量 get/set = {N.03 主, N.04 子}（04 先于 03）；print/str/运算/事件/分支 = 单级
- 变量初始值不出现在 f21（只记录执行帧；while 计数器首次写回后才出现值）
- 节点定义查询流程（复用）：`grep -n "节点英文名" src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.ts`（见 gil-node-graph-editing 技能"节点 ID / 名称查询速查"）
- **复合内 exec 链断链判据（2026-08-14 #12 实证）**：复合调用复合内某普通 exec 节点（如运动器 84）整段零帧、但上游复合调用节点（store/velocity 等）有帧 → 合成→普通 exec 边断链。三态对照：复合内全部执行但链尾普通节点零帧 = IR 边丢失（implEdges 源 "undefined"）或目标缺物理 InFlow pin；修复后链尾节点出现帧（m1 head=3205 4 帧）+ 宿主链恢复（head=34+）+ 定时器写入（__gsts_timeout_N_index）。
- **复合 head 前缀 = 调用栈**：head=320702 读作「宿主节点 0x32=50（turn_block 调用）→ impl 节点 7（velocity）→ velocity impl 节点 2」；复合内各 impl 节点按其序号占 head 次高位（3202 doubleBranch / 3203 spin_block / 3204 store / 3205 运动器 / 3206 turn_check / 3207 velocity）。
- **head 递归解析规则（2026-08-20 实证，gia_log.py node_label 已实现）**：head = **调用栈字节序列，每字节一层节点号**——
  首字节=主图节点，后续每字节=上一层复合调用节点的 impl 图节点号；**普通节点（非复合调用）处链结束**，
  尾随字节为记录标记（03=主帧、04=子帧上下文，如 get/set 的 `{N.04子}+{N.03主}` 成对出现）。
  例：`0f0502100403` = tab_dispatch(0f) > do_move(05) > apply_move(02) > read_slot(10=16) > GetVar tblFrom(04) + 主帧标记(03)。
  **疑点**：个别 head 末字节与标记 03/04 在数值上歧义（节点号 3/4 与标记同值），实际以"普通节点停止"规则消解，
  未发现误解析实例；若遇异常以 dump 原始结构核对。
- **负数/大 unsigned 值签名（2026-08-22 魔方打乱实证）**：Integer 参数（varint）出现
  `18446744073709551612`（= 2^64-4）时即 **-4 的 unsigned 64 位回绕**——引擎把负数按
  unsigned 编码，读日志时先做有符号化（≥2^63 减 2^64）。打乱生成器 raw 越界变负后，
  `logicApplyFace(-4)` 即以此形态出现在帧里；队列（dict）里出现这种值 = 生成器状态机
  写错位（finiteLoop 内 doubleBranch 回调 setM 不执行/非 wrap 分支 setQ 缺位），修复见
  debug-log-investigator 技能"queue dict 出现非法值"行。

## 完整游玩日志（2026-08-28 会话 2980 实证：480+ 条记录 / 7 图 / 5 次操作）

会话 2980 是首次完整游玩日志（非两次操作调试日志），新闭合与修正：

- **`ops` 操作时间线（gia_log.py）**：客户端记录（f8=2097154）为界聚类 → 5 次操作
  D@25s / L@31s / x@74s / D@93s / L@111s；第 5 次 L 后出现结算合法（还原通关）。
  面旋转每次 9 块转动（转动块 f8 集合=选中状态 f8 集合=运动的 9 块）、整体旋转 26 块全动。
- **服务端块响应链（一对一完整闭合）**：监听信号(OUT0..OUT8 = 客户端 n115 信号 6 参数+事件源)
  → Query If Entity Has Unit Status（类型码20，OUT0=命中）→ Double Branch → List Iteration Loop
  （Assembly List [位置,向前向量,向上向量] → Get Custom Variable → 3D Vector Rotation → 复合:三维向量取整
  （807/801）→ Set Custom Variable 写回）×3 → 玩家变量 魔方动画=1 → Direction Vector to Rotation
  （向前×向上 → 欧拉）→ 取整 → Add Basic Target-Oriented Rotation-Based Motion Device（IN1="旋转"、
  IN2=时长=信号 Float、IN3=目标旋转）。玩家-界面图也监听该信号（每次操作 1 帧记录）。
- **新节点 ID**：When Unit Status Changes=300、When Global Timer Is Triggered=315、
  When Tab Is Selected=307、Multiple Branches=3、Activate/Disable Tab=306、
  Set Player to Activate Control Motion Device=839、Set Player to Follow Control Motion Device=837、
  List Iteration Loop=509（服务端有限循环，0d 系列帧同构）、Get/Set Local Variable=18/19
  （类型16 LocalVariable varint=图局部变量槽）。
- **选中状态图（1073741852）= 运动中魔方块数计数**：When Unit Status Changes（OUT4:Boolean=1=添加）
  → Equal → Set Local Variable 12=1 → Get Custom Variable 运动中魔方块数 → Addition +1 → Set Custom Variable。
- **类型码 25/26（结构体，局内存档 1_chip_1/2）**：25=列表元素原始字节 `[8,10,18,4,...]`（结构体序列化）、
  26=结构体值；配套复合 拆分结构体(1610612796)/修改结构体(1610612797)。内部字段待解析（O-10-①）。
- **按钮字典精确映射（修正 PKC claim）**：When Floating Interaction Page Is Triggered
  OUT2=页面 ID 1073741848、OUT3=按钮 ID；字典 F=1073741937、B=1073741938、**L=1073741870**、
  R=1073741936、U=1073741939、D=1073741940、x/y/z=1073743064/3065/3066 → Query Dictionary
  OUT0:String=指令码 → Set Local Variable → When Custom Variable Changes → Cast Skill Instance。
- **f10=组件定义 ID**：8=常规（大世界玩法图挂载）、5=结算合法（全局计时器图挂载）；f8/f3 见上。

## 待解问题

- get/set 帧中"类型4=1（0801）"输入的含义（get 第 3 输入 / set 第 4 输入；疑似同步/有效标志，面板不显示）
- while 护栏循环收尾序列（2608 帧 1710，IN0=LocalVar+IN1=1）的引擎原因
- 类型码 25/26（结构体）内部字段结构；结算合法全局计时器周期/判胜链（读图 1073741854）
- 记录级字段非单调规律（f2 等）；f7.f1=1 的含义
- 变量初始值定义位置（推测在 GIL 图数据中，不在日志）
