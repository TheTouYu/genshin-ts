# 变量与作用域

> 知识树：已验证结论已录入 `knowledge/game-engine-knowledge/variable-scopes-encoding.md`（2026-08-08，bnd_7320a9bd）

> 状态：部分已验证
> 来源：用户对变量作用域的说明 + 真实 GIL 不可变相邻快照
> 最近校验：2026-08-02
> 适用范围：变量的归属、共享范围、获取和设置方式；当前地图/版本中关卡变量的受限文件编码

变量按可见范围分为实体级变量、节点图级变量和局部变量。三者即使使用相同名称，也不能视为同一个存储位置。

## 作用域总览

```text
实体级变量     一个实体及其可访问接口
节点图级变量   一个指定节点图
局部变量       当前画布中的一条数据连接关系
```

## 实体级变量

每个实体都可以拥有自己的实体级变量。

用户可以新建元件，在元件上配置组件和变量。由该元件创建出的实体会继承这些属性，但每个实体运行时拥有自己的变量状态。

游戏提供实体变量的获取和设置接口。其他节点图只要能引用目标实体，就可以通过这些接口读取或修改该实体的变量。

> ⚠️ **静态资源实体不支持变量/组件/高级功能**（2026-08-20 用户实证）：资源分静态/动态两类，动态可转静态；
> 静态资源只支持基础 缩放/位置/旋转，因此**不要对静态资源实体写变量**（会导致编辑器存档损坏）。
> CLI 侧用 `assets:resources list` 区分元件资源与摆放实体，`assets:prefabs create --static` 创建静态元件。

```text
元件定义变量
→ 根据元件创建实体 A、实体 B
→ A、B 继承变量定义
→ A、B 分别保存自己的运行时值
```

“继承变量定义”和“多个实体共享同一个值”不是同一件事。实体实例之间是否存在共享、复制或初始值重置规则，需要后续单独验证。

## 节点图级变量

节点图级变量只属于一个指定节点图。

- 同一节点图中的节点可以获取或修改它。
- 不同节点图之间不共享该变量。
- 即使变量名称相同，也属于不同节点图的独立状态。

节点图多次挂载或产生多个运行实例时，变量是否按图定义、挂载对象或运行实例隔离，仍需通过真实关卡验证。

## 局部变量

局部变量的范围最小。它在节点图画布中创建，只能通过数据连线传递给控制流节点或数据流节点进行消费或设置。

局部变量不能像实体变量或节点图变量一样，从其他位置按名称获取。复制一个相关节点，也不会自动获得原局部变量；只有真实连接到该局部值的数据路径才能使用它。

```text
创建局部值
→ 通过连线传递
→ 下游节点消费或设置
```

### 局部变量的 GIL 编码（真实 GIL 解析，2026-08-07）

真实图 `_GSTS_param-turn`（265 节点，star-cube-nexus 备份）中确认：**局部变量在 wire 中无名，只有类型码与连线引用**。

- `Get Local Variable`（vendor id 18）：inputs `[R<T>]`（类型选择），outputs `[E<1016>, R<T>]`；`E<1016>` 输出是局部值身份的起点（即编辑器里的“创建局部值”）。
- `Set Local Variable`（vendor id 19）：inputs `[E<1016>, R<T>]`；`E<1016>` 输入沿数据连线接收局部值身份（通常直接来自某 `Get Local Variable.E<1016>` 输出），`R<T>` 是要写入的值。
- `E<1016>` 是 **Local Variable 类型码**（vendor `enum_id.ts`：`LocalVariable: 1016`），不是索引或名字；局部变量没有名字字段，身份只能靠 `E<1016>` 连线引用链追溯（例：`n=35 Set Local Variable ← n=34 Get Local Variable.E<1016>`）。
- 因此“局部变量按名映射”不可行——名称在任何位置都不存在；工具（explain-gil-node-graph）对局部变量节点显示其 `E<1016>` 输入的连线来源作为身份摘要。

验证层级：真实 GIL 解析（备份图）+ vendor 节点 pin 记录；未做编辑器单变化实验，未写回。

## 局部变量与复合节点

复合节点多次调用时，每个调用实例的外部连线可能不同。因此，即使复合节点内部使用的是同一个局部参数位置，不同调用收到的实际值也可能不同。

```text
复合调用 A ──连入值 10──→ 复合内部局部参数
复合调用 B ──连入值 20──→ 复合内部局部参数
```

这里共享的是复合节点的内部定义，不是调用时的数据值。每次调用的数据由各自连接决定。

复合节点结构见[复合节点](composite-nodes.md)，数据传递规则见[数据流与连接](data-flow.md)。

## 选择变量类型

- 需要跟随某个实体保存，并允许其他图通过实体访问：使用实体级变量。
- 只服务一个节点图内部逻辑：使用节点图级变量。
- 只在当前计算或连接链上传递：使用局部变量。

最终选择还要考虑多人模式、对象生命周期和节点图挂载方式，见[节点图挂载与生命周期](graph-mounting.md)。

## 当前关卡变量的受限 GIL 观察

`CONFIRMED_BOUNDED`：在当前锁定地图和编辑器版本中，连续创建两个默认 bool 关卡变量和
一个默认 integer 关卡变量时，编辑器在同一个既有 root `5.1` record 内追加同构变量 entry。
当前样本中：

- entry 的显式 UTF-8 名称可单独修改并精确恢复；
- bool 与 discriminator `4` 关联，integer 与 `3` 关联；这不是正式 enum；
- integer `0 ↔ 123456`、bool `false ↔ true` 的默认值修改均能精确恢复目标 entry；
- 上述结论不推广到实体变量、节点图变量、其他类型或游戏运行时作用域。

完整 raw-wire 路径、presence 边界、Validator 和未知范围见
[GIL 整体结构与语义树](gil-structure-semantics.md)。9 轮相邻实验由证据提交
`d7bd151f9b8e914ca4ad3a1873021983e08c4f0f` 锁定；未执行 round-trip、真实写回、编辑器
导入或游戏行为验证。

## 变量类型通用编码规则（2026-08-18 多样本 CONFIRMED）

> 来源：`~/.genshin-ts-evidence/toolchain-gaps/1073741894/`（UI 能力测试地图 1073741894，
> `after-dict*.gil` 多样本，2026-08-18 用户编辑器逐步创建 + CLI 逐项解码）。
> 状态：`CONFIRMED`（多样本互相印证）；但只限该锁定地图/编辑器版本，且**未做游戏内运行时
> 行为验证**（“编辑器/游戏验证未执行”，自动解码与 round-trip 已做）。

全类型变量 entry 编码在关卡实体（root5.1[entity].7.11）与元件定义（root4.1.8.11）中
**同构**——只有承载容器字段不同（实体 f7、元件 f8），entry 结构一致：

| 字段 | wire | 语义 |
| --- | --- | --- |
| `entry.2` | length-delimited | 显式 UTF-8 名称 |
| `entry.3` | varint | 类型码（见下表） |
| `entry.4` | length-delimited | 默认值消息 `{f1=类型码, f2=类型包裹, f<type+10>=值}` |
| `entry.5` | varint | `1`（固定） |
| `entry.6` | length-delimited | 类型包裹 `{f1=类型码, f2=空}` |

**统一规律：默认值字段 = 类型码 + 10。**

| 类型码 | 类型 | 默认值字段 | 编码 |
| --- | --- | --- | --- |
| 3 | int | f13 | `{f1: varint}`（0 为空 field） |
| 4 | bool | f14 | `{f1: varint 0/1}`（false 为空 field） |
| 5 | float | f15 | `{f1: fixed32}` |
| 6 | str | f16 | `{f1: UTF-8}` |
| 12 | vec3 | f22 | `{1: {f1,f2,f3: fixed32}}`——**分量消息包在 field1 里，零分量省略（稀疏），全零 = {1:空}**（2026-08-29 v7 差分修正：旧记录"平铺 {f1,f2,f3}"是错误外推；编辑器样本 新增变量6=[3,0,0] 只写 {1:{1:3.0}}） |
| 1/2/17/20/21 | entity/guid/faction/config_id/prefab_id | f13 | varint，与 int 同构 |
| 7..24（列表） | guid_list/int_list/bool_list/float_list/str_list/entity_list/vec3_list/config_id_list/prefab_id_list/faction_list | f<type+10> | 原始标量列表（guid/int/bool/float/entity/faction/config_id/prefab_id）用 packed `{field1(length-delimited), 值=元素原始字节拼接}`：int/bool/guid/faction/config_id/prefab_id→varint 拼接、float→fixed32 拼接、entity→完整 `{field1(varint)}` 拼接；str_list 重复 `field1(len){...}`；**vec3_list 重复 `field1(len){向量消息}`，向量消息 {f1,f2,f3: fixed32} 稀疏**（2026-08-29 v7 差分：元素 (0,0,0)=`{1:空}`、(7,0,0)=`{1:{1:7.0}}`） |
| 27 | dict | f37 | parallel f501/f502 + f503/f504（新建无 Map25 层，见下） |

**dict(27) f37（新建，推荐）**：`f37` = parallel `f501` keys + `f502` values + `f503`
（key 类型码）+ `f504`（value 类型码）。`f501` key 项 = `{f1:keyType, f2:{f1:keyType,
f2:{}}, f16|f13:key 值}`（str key 用 f16、int key 用 f13）；`f502` value 项 =
`{f1:valueType, f2:{f1:valueType, f2:{}}, f<valueType+10>:值}`。
**Map25 实体映射层仅出现在编辑器多对历史样本（新增变量1 等），非新建必需**；新版 CLI 新建
dict 不写 Map25。

**dict marker 枚举（entry f4.f2 类型包裹的 f2 字段）**：marker 按 `(keyType, valueType)`
枚举，不是 value 的线性函数。实测 8 对如下；标量 valueBase = 类型码、列表 valueBase 取
第三方 concrete_map M3 下标（未逐项实样验证的组合为拟合外推）：

| keyType | valueType | marker |
|---|---|---|
| str(6) | str(6) | 66 |
| str(6) | str_list(11) | 76 |
| str(6) | float(5) | 65 |
| str(6) | float_list(10) | 75 |
| str(6) | bool_list(9) | 74 |
| str(6) | vec3_list(15) | 78 |
| int(3) | int(3) | 43 |
| int(3) | vec3_list(15) | 58 |

dict 值支持 `str`/`int`/`float`/`str_list`/`int_list`/`bool_list`/`float_list`/`vec3_list`
（与 `UiDictPair` 一致）。

**实体变量泛化（CLI）**：`assets:level-variables --entity <id>` 与
`assets:custom-variables --entity <id>` 可对任意场景实体（root5.1[entity].7.11）读写
全 21 种类型变量（含 dict）；`assets:custom-variables --vars` 支持 `name:type=value`
显式类型与 `name=value` 类型推断。新场景实体由 `assets:entities import` 创建时会继承
元件定义（root4）的变量容器（定义 f8 → 实体 f7），因此可“创建实体 → 写入变量”分步串联。

> 注意：标量/列表/dict 的字节级格式已对照真实样本逐项核对；其中
> str 列表元素为单层 `field1(len){字符串}`（非 `{f1:字符串}` 双层包裹）、str dict 值
> 需要解包 `f16.f1`，原始标量列表使用 packed `{field1(len), 值=元素原始字节拼接}`
> （entity 元素为完整 `{field1(varint)}`），这些是 2026-08-19 真实样本修正的编码细节；
> dict marker 与 int key 编码也已按 2026-08-19 真实样本修正。
> 2026-08-19 用户游戏核验通过：基于 packed 修复后元件新建的实体完整继承 `PF_list=[1,2]`
> 与统一 str_list 的 `PF_dict`。尚未覆盖：负整数、空名/重名规则、
> 游戏内获取/设置/变量变化事件，以及多实例运行时隔离。
>
> ⚠️ **运行时全 0 int_list 长度陷阱（2026-08-20 日志 2765/2766 实证）**：GIL 图变量里
> `cornerOrient` 声明 8 个 0、`edgeOrient` 声明 12 个 0，但游戏运行时首次读取只物化出
> `[0,0]` / `[0,0,0]`；高下标 `Get Corresponding Value From List` 会“列表索引越界”。
> 这不是 GIL 编码问题（地图字节和 parse 都是满长），而是引擎对“全 0 int_list”初始值的
> 运行时物化行为。更隐蔽的是：**向越界下标 `set_list_value` 写 0 不会扩展长度**（日志 2766：
> `logicReset` 写 0 后 cornerOrient 仍 `[0,0]`、edgeOrient 仍 `[0,0,0]`），只有写非 0 值才会
> 扩展（且中间槽可能是垃圾）。对策：先写非 0 哨兵逐下标把列表撑到满长，再写真实 0 值
> （`logicReset` 两阶段复位）；不要依赖全 0 字面量长度或“写 0 自动扩容”。

## 图变量（NodeGraph GraphVariable）列表声明 wire（2026-08-29 最小差分）

> 状态：已验证（真实编辑器相邻快照 + 生产管线字节级对齐；**游戏内核验待用户**）
> 来源：真实 GIL 差分（map 1073741915「变量」图 1073741825，v0 空图 → v1 用户编辑器加
> 变量 `int50` = int 列表长度 50 默认全 0；快照 `~/genshin-ts-evidence/variable-system/raw/`，
> after sha256 `b7ca3d9f…`）+ 生产管线重放比对
> 最近校验：2026-08-29

节点图变量的容器与关卡/实体变量（root4/root5 的 21 类型 entry）**不是同一编码**：它写在
NodeGraph 消息的 `f6 graphValues` 里。编辑器样本（int_list 50×0）结构：

```text
GraphVariable{ f2:name, f3:type=8, f4:VarBase, f7:keyType=6, f8:valueType=6 }
  // f5(exposed=false)、f6(structId=0) 为默认值 → 编辑器省略不写
VarBase{ f1=10002(ArrayBase), f2=1(alreadySetVal),
         f4=itemType{1:1, 100:{1:8}}（100 子消息只有类型，无 kind 字段）,
         f109=50 个元素记录 }
元素记录 = 独立 VarBase{ f1=2(IntBase), f4=itemType{1:1,100:{1:3}}, f102=空 payload }
  // 零值元素 payload 为空消息（默认值省略）；元素无 alreadySetVal
```

**非默认值元素**（v4 样本：用户把下标 49 改为 1234，v4 sha `48b79d7f…`）：该元素保留
`alreadySetVal=1`（f2=1），payload 为显式值 `f102={1:1234}`；其余 49 个零值元素仍为空
payload、无 f2。即：

```text
零值/默认值元素：{class, itemType, 空 payload}               （无 f2）
非默认值元素：   {class, f2=1(alreadySetVal), itemType, 显式 payload}
```

关键规律：**列表长度 = f109 下的元素记录条数**；全 0 列表也必须逐元素写出（每个元素一条
独立记录，即使值是默认 0、payload 为空）。这与运行时“全 0 int_list 短物化”陷阱直接相关：
生产编码若把 0 值元素写成显式 `val=0` + `alreadySetVal=1` + `itemType.kind=0`（旧我方输出），
与编辑器字节不一致；2026-08-29 起 `ir_to_gia_transform` 已归一化为编辑器形态（零值元素去
alreadySetVal/kind、零值 payload 清空、非默认值元素保留 alreadySetVal+显式 payload、
GraphVariable 去 exposed/structId 默认值），修复后 .gia → 注入回读的 GraphVariable 记录与
编辑器 v1（50×0）**1668 hex**、v4（末位 1234）**1678 hex** 均逐字节一致。
回归：`tests/graph_variable_int_list_editor_wire_test.ts`（int_list 双样本 hex + 标量四形态结构断言）。

**标量图变量**（2026-08-29 由元素规则推广，Str 模板 2026-08-09 编辑器验证）：顶层标量与
列表元素是同一 VarBase 形态——零值/空值 = {class, itemType, 空 payload}（无 kind/alreadySetVal）；
非默认值 = {class, alreadySetVal=1, itemType, 显式 payload}。当前生产编码对 int/float/str 标量
已归一化（bool/vec3 未实样，fail closed）。

适用边界：图变量 int_list（v1/v4）、标量（str/int/float/bool/vec3 默认值，v6）、5 种空列表
（str/int/float/bool/vec3_list，v6）已字节级对齐；**非默认值的其它类型元素**（float_list/
bool_list/str_list/vec3_list 非零元素、dict 图变量）、exposed=1 覆写变量未实样。原“短物化
机制”问题是否随编码对齐消失，仍需游戏内实机验证。

## 自定义变量 vs 节点图变量：结构异同（2026-08-29 两容器差分后确认）

| 维度 | 自定义变量（root4/root5 组件槽 f8/f7 内 `…11` 容器） | 节点图变量（NodeGraph 消息 f6 `graphValues`） |
| --- | --- | --- |
| entry 骨架 | `{f2名, f3类型码, f4默认值, f5=1, f6类型包裹}` | `{f2名, f3类型码, f4=VarBase, f7=keyType, f8=valueType}`（无 f5/f6 语义） |
| 值编码 | f4 = `{1:code, 2:{1:code,2:{}}双层, f<code+10>:值}` | f4 = VarBase `{class, itemType{1:1,100:{类型}}, bArray/bInt/bString…}` |
| 列表编码 | 原始标量列表 packed；str/vec3 列表重复 `field1(len){…}` | f109 下每元素一条独立 VarBase（元素=标量 VarBase 形态） |
| 默认字段省略 | exposed/structId 无此概念；f5=1 恒写 | exposed=false/structId=0 省略；元素 kind=0/alreadySetVal 按值省略 |
| 类型码 | 统一 VarType（int=3、str=6、str_list=11…） | 同一 VarType 枚举 |
| 生命周期/作用域 | 跟实体，全局可读写 | 跟图，图内私有（可暴露覆写） |
| 我方闭合度 | 21 类型全闭合（含 dict marker） | int_list（v1/v4）+ int/float/str 标量 + Str 模板；其余待样本 |

**普通实体 vs 关卡实体（v8 差分，2026-08-29）**：root5.1[entity] 记录骨架同构（f1=id/f2=name/
f7 组件槽/f8=defId），**变量容器完全同构** = `f7.{f11}` 自定义变量组件，entry 编码逐字节一致；
差异只在实体本身：关卡实体 defId=10003004（固定、禁手动 import）、组件槽少；普通实体 defId=资源
定义（如空模型 10005018）、组件槽多（含变换组件 f11 内位置/缩放 vec3，缩放 0.1=0x3dcccccd）。

**玩家/角色实体（v9 差分，2026-08-29）**：玩家实体 f8=def=1000000（默认模版，多人每玩家一个，
本样本 1086324743/44/45 各自持有一份同名变量「这是玩家变量」——per-player 隔离的资产侧实证）；
角色实体 f8=def=1000001（1090519041「默认模版(角色编辑)」）。两者的变量容器同样是 `f7.{f11}`、
entry 编码与关卡/普通实体逐字节同构；角色实体组件槽更多（8 个 f7）。**空字符串默认值规则**：
编辑器 str 默认值 `''` 时 f16 = 空消息（`8201 00`），不是 `{1:len0}`——与 int 0 / bool false
同属"默认值 → f<type+10> 空消息"规则（我方两写入器 2026-08-29 已按此修复，含更新路径）。

**共同编码哲学**：列表长度 = 元素记录条数；默认值元素空 payload；默认字段省略（kind=0、
alreadySetVal、exposed/structId）。编辑器首存会把显式默认字段规范化掉（v3 实证）。

## 局部变量（Get/Set Local Variable，2026-08-29 v10 差分闭合）

> 状态：已验证（编辑器样本 var-v10-local-var-usage.gil sha 85dd6313… + 管线字节级比对）；
> client 侧差异待样本。

局部变量不是"定义"而是 **API 节点 + E<1016> 身份连线**（无变量名 pin）：
- **Get Local Variable(18) = 创建**：InParam[0] R<T> 携带类型+默认值（Bol false→bEnum 空）；
  OutParam[0] **E<1016>** 身份输出；OutParam[1] R<T> 读值。
- **Set Local Variable(19) = 更新**：InParam[0] E<1016> ← Get.OutParam[0]（wire kind 4 index 0，
  同一身份的多个 Set/消费节点即"多个节点消费一个变量"）；InParam[1] R<T> = 新值。
- Get/Set 类型必须一致（样本 Bol）。
- **R<T> pin 值** = ConcreteBase{1:10000, 2:1, 110:bConcreteValue{2: 内层}}；内层 VarBase
  **一律无 alreadySetVal**（非默认值也只写显式 payload，如 bEnum{1:1}）、零值空 payload、
  itemType.kind 省略（与图变量同族）。
- **concreteId 按类型变体**（v11/v13/v14 样本）：Get bool=18、int=20、str=2656、entity=2657、
  guid=2658、float=2659、vec3=2660、int_list=2661、**str_list=2662**；Set bool=19、int=21、
  str=2674、entity=2675、guid=2676、float=2677、vec3=2678、int_list=2679、**str_list=2680**；
  **bConcreteValue.indexOfConcrete server 表**：bool=0（省略）、int=1、str=2、entity=3、
  guid=4、float=5、vec3=6、int_list=7、**str_list=8（实证）**（9..20 按 client 表尾部同序推断：
  entity_list=9、guid_list=10、float_list=11、vec3_list=12、bool_list=13、config_id=14、
  prefab_id=15、config_id_list=16、prefab_id_list=17、faction=18、faction_list=19、dict=20，
  待样本；**与 client 侧 LOCAL_VAR_IOC_BY_IR 标量段顺序不同**——server/client 差异实证）。
- **拼装列表（Assembly List, generic 169）**：cid 按元素类型变体（int=169、str=170）；
  count pin = 普通 VarBase（非 ConcreteBase 包裹）；元素 pin = ConcreteBase{ioc: 元素类型序
  （int=0 省略、str=1），value: 标量 VarBase}——**元素规则与图变量元素相同**：非默认值保留
  alreadySetVal + 显式 payload（int 23/489 实证），默认值空 payload 无 f2；OutParam = 列表
  ioc（int_list=7/str_list=8）+ 空 ArrayBase 字面量锚。
- 默认值内层形态：int/str/guid/float = class+itemType+空 payload；vec3 = class 7+bVector{val:{}}；
  **entity = 无 class 字段（class 0 省略）+ 无 payload**；内层一律无 alreadySetVal、kind 省略。
- 我方编译器模式：`initLocalVariable(type, init)` 编译为 get(empty)+set(init)（动态 init 防重复
  求值，definitions/nodes.ts 注释）；常量 init 编辑器直接放 Get —— 预算敏感时可优化（F10 候选）。
- 回归：`tests/local_variable_editor_wire_test.ts`（pin value hex 常量 + 身份连线 + 类型一致 +
  v11 六类型 cid/ioc 断言）。

## 变量类型体系的共性与差异（三容器 + 信号，2026-08-29 汇总）

### 统一类型码体系（所有容器共享同一 VarType 数字）

`3=Int 4=Bool 5=Float 6=Str 1=Entity 2=GUID 12=Vec 27=Dict`；列表 = 具体类型码
（int_list=8、bool_list=9、float_list=10、str_list=11、vec3_list=15…）；`E<1016>` = 局部变量身份。

### 类型表达对照表

| 维度 | 自定义变量 entry | 图变量 GraphVariable | 局部变量 Get/Set R<T> pin | 信号 ParameterFlow |
| --- | --- | --- | --- | --- |
| 类型码位置 | f3 + f4{1:code, 2:envelope} | f3 + VarBase.itemType{1:1,100:{type}} | pin.type + 内层 itemType{1:1,100:{type}} | type1/type2（独立字段） |
| 值容器 | f4 的 f<类型码+10> | VarBase payload（bInt/bString/bArray…） | bConcreteValue.value 内层 payload | 不带值 |
| 列表编码 | 原始标量 packed / str、vec3 重复 field1 | f109 逐元素独立 VarBase 记录 | 待样本 | class=ArrayBase(10002) + type1=type2=**StringList(11)**，元素类型在物理 pin |
| entity 形态 | f13 varint（与 int 同构） | 未实样 | 内层**无 class 字段**（0 省略）+ 无 payload | class=Unknown(0) + type1=Entity(1) |
| indexOfConcrete | 无 | 无 | **server/client 两表**（见局部变量节） | 无（在物理 pin） |
| 身份 | 名字 f2 | 名字 f2 | **E<1016> 连线** | 名字/定义 |

### 共性（三容器实证）

1. 同一 VarType 数字体系 + `itemType{1:1, 100:{type}}`（图变量/局部变量/节点字面量 pin 值一致）；
2. **默认字段省略哲学**：零值/空串/false → 空 payload；`kind=0` 省略；非默认值才显式写值；
3. **concreteId 变体机制**：局部变量 Get/Set（18/19 + 类型 cid）、图变量 Set/Get、其他变体节点同机制；
4. entity 在局部变量与信号中都走「class 0/省略」特例（图变量待样本）。

### 差异（各自独立的规则）

1. **身份**：自定义/图变量 = 名字；局部变量 = E<1016> 连线（无名字）；
2. **alreadySetVal**：图变量元素非默认值保留 f2；局部变量内层**从不写**；自定义变量 entry 无此字段；
3. **载荷字段号**：自定义 = f<类型码+10>；图变量/局部变量 = 按 class 的 bX 字段（bInt/bId/bString…）；
4. **indexOfConcrete 仅局部变量**，且 server（bool=0,int=1,str=2,ety=3,gid=4,flt=5,vec=6）与
   client（int=0,str=1,ety=2,gid=3,flt=4,vec=5,bool=6，列表 7..13，配置/元件/阵营/dict 14..20）顺序不同；
5. **信号 ParameterFlow 最特殊**：任意 *_list 统一标记 StringList(11)+ArrayBase，元素类型不进
   ParameterFlow（与其它容器把元素类型写进 itemType 不同）。

## 待逐步还原

- 三类变量支持的参数类型。
- 节点图级变量的声明与初始值编码（int_list 已闭合，见上；其余类型待样本）。
- 变量变化事件的节点结构（when_custom_variable_changes 事件节点已有定义）。
- 局部变量 client 图差异（P1 待样本）。
- 实体由元件创建时变量如何继承和初始化。
- 节点图多实例运行时变量如何隔离。
- 局部变量在普通图和复合节点边界上的连接编码。
- 多人模式下实体变量和节点图变量的同步、归属和去重规则。
