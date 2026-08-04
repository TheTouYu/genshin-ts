# 参数类型

> 状态：部分确认
> 来源：用户对游戏编辑器和关卡结构的说明 + 真实 GIL 相邻快照 + 第三方 GIA proto（千星沙箱代码包）
> 最近校验：2026-08-04
> 适用范围：节点输入、输出和连接使用的类型体系；变量类型码与关卡/元件变量共用同一枚举

参数类型决定节点能够接收什么值、能够输出什么值，以及两个数据引脚能否连接。

## 通用类型码（VarType 枚举）

变量类型码是**全局通用体系**：关卡变量 discriminator、元件自定义变量类型码、信号参数 InParam
type 共用同一枚举，与第三方 GIA proto `VarType` 逐值一致（已三方核对：GIA proto 枚举、
信号探索 InParam type、GIL wire 类型码）：

| VarType | 类型 | 确认来源 |
|---:|---|---|
| 1 | entity | 信号 InParam + proto |
| 2 | guid | 信号 InParam + proto |
| 3 | int | 信号 InParam + 关卡变量 discriminator + proto |
| 4 | bool | 信号 InParam + 关卡变量 discriminator + proto |
| 5 | float | 信号 InParam + proto |
| 6 | str | 信号 InParam + 元件变量(新增变量1/3) + proto |
| 7 | guid_list | proto |
| 8 | int_list | proto |
| 9 | bool_list | proto |
| 10 | float_list | proto |
| 11 | str_list | proto |
| 12 | vec3 | 信号 InParam + proto |
| 13 | entity_list | proto |
| 14 | enum_item | proto |
| 15 | vec3_list | **元件变量(新增变量2) + proto** |
| 16 | local_variable | proto |
| 17 | faction | proto |
| 20 | config_id | 信号 InParam + proto |
| 21 | prefab_id | 信号 InParam + proto |
| 22 | config_list | proto |
| 23 | prefab_list | proto |
| 24 | faction_list | proto |
| 25 | struct | proto |
| 26 | struct_list | proto |
| 27 | dict | proto |
| 28 | variable_snapshot | proto |

证据：GIA proto `VarType` 枚举（src/thirdparty/.../protobuf/gia.proto.ts）；元件自定义变量
类型码 6/15（component-investigation exp2，2026-08-04 相邻快照）；信号 InParam type
（node-graph-logic/signals）。未覆盖：全部类型在 GIL 各作用域（关卡/元件/节点图变量）的
逐个 wire 样本。

## 基础类型

当前编辑器的信号注册 UI 支持 9 种普通参数类型及对应的 9 种列表类型。真实发送节点增量已确认普通类型的 VarType 与固定值发送编码：

| 类型 | VarType | 固定值发送编码 |
|---|---:|---|
| `entity` | 1 | 本轮未直接填写；数据连接待验证 |
| `guid` | 2 | `IdBase / bId` |
| `int` | 3 | `IntBase / bInt` |
| `bool` | 4 | `EnumBase / bEnum` |
| `float` | 5 | `FloatBase / bFloat` |
| `str` | 6 | `StringBase / bString` |
| `vec3` | 12 | `VectorBase / bVector` |
| `config_id` | 20 | `IdBase / bId` |
| `prefab_id` | 21 | `IdBase / bId` |

表中的 8 种固定值结构已由相邻真实 GIL 快照确认；`entity` 的全局类型身份已知，但本轮发送数据链尚未验证。发送节点、参数 pin、证据与适用边界见[信号](signals.md)。

元件自定义变量条目编码见[组件](components.md)（typeID=1 自定义变量组件，f3=类型码、f4=默认值、f6=类型引用）。

## 复合类型

### 列表

列表可以包含上述基础类型中的一种。列表既可能直接表达为空或固定内容，也可能由专门的数据流节点拼装后输出。信号 UI 的 9 种列表类型已经从真实注册定义确认，但完整发送矩阵仍待逐项重放，不能由普通参数规则直接推广。

### 其他复合类型

游戏中还有少量更复杂的参数形式，例如：

- 结构体；
- 字典；
- 其他待确认的容器或组合类型。

## 类型在节点图中的作用

```text
参数类型
├── 约束控制流节点的参数输入
├── 约束数据流节点的输入和输出
├── 决定直接填写值的表示方式
└── 决定数据输出能否连接到目标输入
```

参数如何取得和连接见[数据流与连接](data-flow.md)。

## 每种类型需要记录的规则

- 编辑器中的名称和可填写形式。
- 关卡文件中的类型身份。
- 未填写、默认值和已填写值的区别。
- 直接值的编码。
- 作为节点输入、输出时的编码。
- 对应列表的编码和拼装方式。
- 可以连接的节点与引脚。
- 已验证的真实样本和适用范围。
