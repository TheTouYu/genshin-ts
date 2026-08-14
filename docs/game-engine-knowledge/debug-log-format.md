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
| f3 | varint | 序号（部分记录有；f22 记录中 8/10 有） | 待闭合规律 |
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
- **f8 级别**：2=创建类、3=运行类、4=特殊图（2602 轮询图）
- **f7.f2 编码变体**：图 ID 可为 bytes（2602）或 varint（2604/2608）
- **float 编码 f15 = {f1 wire5 fixed32}**：4 字节 ≥0x80 时不能当 varint 解析（-90.0 等负值）；外层是 length-delimited
- **get/set 节点面板参数名**：变量名字、变量值、（set 有）是否触发事件=否（IN 空）
- 事件节点（When Entity Is Created id=71）输出参数名："实体"（类型1=2）、"guid"（类型2=实体ID）
- 两级帧 ID：图变量 get/set = {N.03 主, N.04 子}（04 先于 03）；print/str/运算/事件/分支 = 单级
- 变量初始值不出现在 f21（只记录执行帧；while 计数器首次写回后才出现值）
- 节点定义查询流程（复用）：`grep -n "节点英文名" src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.ts`（见 gil-node-graph-editing 技能"节点 ID / 名称查询速查"）
- **复合内 exec 链断链判据（2026-08-14 #12 实证）**：复合调用复合内某普通 exec 节点（如运动器 84）整段零帧、但上游复合调用节点（store/velocity 等）有帧 → 合成→普通 exec 边断链。三态对照：复合内全部执行但链尾普通节点零帧 = IR 边丢失（implEdges 源 "undefined"）或目标缺物理 InFlow pin；修复后链尾节点出现帧（m1 head=3205 4 帧）+ 宿主链恢复（head=34+）+ 定时器写入（__gsts_timeout_N_index）。
- **复合 head 前缀 = 调用栈**：head=320702 读作「宿主节点 0x32=50（turn_block 调用）→ impl 节点 7（velocity）→ velocity impl 节点 2」；复合内各 impl 节点按其序号占 head 次高位（3202 doubleBranch / 3203 spin_block / 3204 store / 3205 运动器 / 3206 turn_check / 3207 velocity）。

## 待解问题

- get/set 帧中"类型4=1（0801）"输入的含义（get 第 3 输入 / set 第 4 输入；疑似同步/有效标志，面板不显示）
- while 护栏循环收尾序列（2608 帧 1710，IN0=LocalVar+IN1=1）的引擎原因
- f3 出现的规律（f22 记录中 8/10 有）
- 记录级字段非单调规律（f2/f3 等）
- f7.f1=1 的含义
- 变量初始值定义位置（推测在 GIL 图数据中，不在日志）
