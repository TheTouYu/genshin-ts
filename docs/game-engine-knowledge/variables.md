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
| 12 | vec3 | f22 | `{f1,f2,f3: fixed32}`（可稀疏） |
| 1/2/17/20/21 | entity/guid/faction/config_id/prefab_id | f13 | varint，与 int 同构 |
| 7..24（列表） | guid_list/int_list/bool_list/float_list/str_list/entity_list/vec3_list/config_id_list/prefab_id_list/faction_list | f<type+10> | 原始标量列表（guid/int/bool/float/entity/faction/config_id/prefab_id）用 packed `{field1(length-delimited), 值=元素原始字节拼接}`：int/bool/guid/faction/config_id/prefab_id→varint 拼接、float→fixed32 拼接、entity→完整 `{field1(varint)}` 拼接；str_list/vec3_list 保持重复 `field1(len){...}` |
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

## 待逐步还原

- 三类变量支持的参数类型。
- 节点图级变量的声明与初始值编码（关卡变量与实体级变量的全 21 类型 create/update 已支持，见上）。
- 获取、设置和变量变化事件的节点结构。
- 实体由元件创建时变量如何继承和初始化。
- 节点图多实例运行时变量如何隔离。
- 局部变量在普通图和复合节点边界上的连接编码。
- 多人模式下实体变量和节点图变量的同步、归属和去重规则。
