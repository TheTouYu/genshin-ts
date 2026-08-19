# 节点图 wire 规则速查（已闭合，真实快照来源）

> 供 `gil-node-graph-editing` 操作时按需查阅。详细实验证据见
> `docs/game-engine-knowledge/`（control-flow.md / data-flow.md / node-graphs.md /
> composite-nodes.md）与 `~/genshin-ts-evidence/node-graph-logic/`。

## 字段号速查（wire）

```
NodeGraph {1:id, 2:name, 3:nodes, 4:compositePins}
GraphNode {1:nodeIndex, 2:genericId, 3:concreteId, 4:pins, 5:x, 6:y}
NodePin   {1:i1, 2:i2, 3:value, 4:type, 5:connects, 7:compositePinIndex}
Index     {1:kind(1=InFlow 2=OutFlow 3=InParam 4=OutParam), 2:index}
NodeConnection {1:id, 2:connect, 3:connect2}   # connect/connect2 双写
VarBase   {1:class, 2:alreadySetVal, 4:itemType, 101:bId, 102:bInt, 104:bFloat,
           105:bString, 106:bEnum, 107:bVector}
```

## 控制流（control-flow.md 闭合）

- 默认源 OutFlow[0]：`i1/i2.index` 省略；非默认 OutFlow[n]：`i1/i2.index=n` 显式
- 默认目标 InFlow[0]：`connect/connect2.index` 省略；非默认：显式目标 ShellIndex
- 控制流连线只落源侧（目标节点不实例化 InFlow pin）
- 新 OutFlow pin：`{i1/i2={OutFlow,shell}, connects}`，插在 OutFlow 组 ShellIndex 升序位置
  （整体在参数 pin 之前）
- 断线（flow-rm）= 从源 OutFlow 的 connects 列表删除 f1=target 匹配的整条记录；
  **断后无余线 → 整条 field4 pin 记录移除**；有余线 → pin 逐字节保留
- 目标节点无论默认还是非默认 InFlow 都不落盘 InFlow pin

## 数据流（data-flow.md 闭合）

- 数据连线 connects 挂在**目标侧 InParam pin**：`connects=[{1:源nodeIndex, 2:{1:4(OutParam),2:源shell}, 3:{1:4,2:源shell}}]`
- 替换线 = 改 connects.id（不新增 pin/connects）；目标已有 value 保留（Variant 实例）
- 新建 InParam pin 时按 ShellIndex 升序插入；type 由目标定义输入类型决定
- 值/连线二选一：设值（param）会清空 connects
- 列表参数值（cases）：`ConcreteBase` 内 `ArrayBase(class=10002)` + `bArray(109)` 元素列表，
  `type` = 列表 VarType（8=IntegerList / 11=StringList）

## Variant 节点（node-graphs.md 闭合）

- concreteId = 选中变体 KernelID（未配置变体不落盘）；MultiBranch: Int→3 / Str→4
- 手动选型与连线自动实例化同构：concreteId 缺失 → KernelID + 所有 R<T> 数据 pin 实例化
  （i1/i2.index 默认省略/非默认显式、type 跟随、无 connects）
- 实例化 pin 的 value=ConcreteBase(class=10000, alreadySetVal=true) +
  bConcreteValue.indexOfConcrete=TypeSelectorIndex（0 省略）
- 已连线 Variant 改类型：类型不匹配的线自动断开且目标 InParam pin 整个移除
- 批量注入写 concreteId 对 Variant 是冗余（编辑器保存会移除）

## MultiBranch（SysCall 3）实操（2026-08-09 tab-input-multibranch 闭合；Q2 补 Str 变体）

节点（Int 变体）落盘：
- 节点引用 f2/f3 = `{1:10001, 2:20000, 3:22000, 5:3}`（generic=concrete=3）
- InParam[0]：key（type=3 Int，ConcreteBase，connects 挂目标侧 ← 事件 Int 输出）
- InParam[1]：cases（type=8 IntegerList，ConcreteBase）
- 未连线 case 不实例化 OutFlow pin；Case1=OutFlow[1]（index=1 显式）→ 目标默认 InFlow
- 默认分支（若连线）= OutFlow[0]（index 省略）

Str 变体（cid=4，reflectMap 位置 1；2026-08-09 Q2 真实快照 log.add n35 闭合）：
- key/cases 的 ConcreteBase indexOfConcrete=1；key pin 无 f4 type 字段
- cases = ConcreteBase + ArrayBase{class=10002, alreadySetVal, itemType{1:1,100:{1:11}},
  bArray{entries=[StringBase{class=5, alreadySetVal, itemType{1:1,100:{1:6}}, bString}×N]}}
- CLI `cases` op 支持字符串（`node <idx> cases rotate,a,b`；条目模板 bString 改 val）

cases 条目结构（bInt 的 val 在字段 1！）：
```
条目 = {1:2, 2:1, 4:{1:1, 6:{2:3}}, 102:{1:val}}
102 = IntBaseValue { int32 val = 1 }（gia.proto）
例：[1,2,3,4,5] 的末条 102 段 = b2 06 02 08 05（field102 len2 {1:5}）
```

## 图变量注册（2026-08-09 tab-input gvar-registered 闭合）

- NodeGraph 追加 f6（graphValues，repeated）；注册时 exposed/structId 默认省略
- GraphVariable（Str 模板）：`{2:name, 3:6, 4:VarBase, 7:6, 8:6}`；f7=keyType f8=valueType 均=type
- VarBase：f1=class(5=StringBase)、f4=itemType `{1:1, 100:{1:6}}`、f105=bString 空（空也落盘）
- 其他类型（Int 等）未验证 → fail closed；工具 op `graph-var-add <name> <type>`（仅 6）
- 「使用」（获取/设置节点）已闭合（见下节）
- **跨图复制变量（2026-08-09 turn-ctl 实战验证）**：从源图原样复制 NodeGraph f6 记录字节（
  11 个 Ety/Bol 变量直接搬移成功，含 VarBase 内层值）；新建变量用模板同构推导：
  Flt = `VarBase{class=4, alreadySetVal=1, itemType{1:1,100:{1:5}}, bFloat(104){1:值}}`，
  Set Flt wrapConcreteValue indexOfConcrete=1（Get Flt=4）

## 图变量使用（Set/Get Node Graph Variable，2026-08-09 闭合；Q1 全变体验证 1073741835）

**indexOfConcrete = 节点族 reflectMap 中的位置**（不是全局类型码；来源 node_pin_records.ts
reflectMap，真实快照验证 20+ 实例）。变体 f3（concreteId）与 indexOfConcrete：

| 类型 | Set (323) | Get (337) |
|---|---|---|
| Int | 323 / 0 | 339 / 2 |
| Flt | 324 / 1 | 341 / 4 |
| Bol | 325 / 2 | 340 / 3 |
| Str | 326 / 3 | 342 / 5 |
| Gid | 327 / 4 | 338 / 1 |
| Ety | 328 / 5 | 337 / 0 |
| L<Flt> | 332 / 9 | 346 / 9 |
| L<Str> | 333 / 10 | 347 / 10 |
| Vec | 334 / 11 | 348 / 11 |
| L<Ety> | 335 / 12 | 349 / 12 |
| Pfb | 535 / 15 | 539 / 15 |
| L<Cfg> | 536 / 16 | 540 / 16 |
| D<Int,L<Str>> | 2913 / 20 | 3054 / 20 |

（Gid/Cfg/Fct 等其余变体可按同一规则推导，暂无真实快照；L<*>/D<> 有快照。）

- Set (323) pin：pin[0] 变量名 StringBase+bString type=6；pin[1] 值 R<T>（见下）；
  pin[2] Bol(exposed) 默认 false 省略；编辑器实例会落盘 InParam[2]（EnumBase 空 bEnum）
- Get (337)：pin[0] 变量名；OutParam R<T> 带 ConcreteBase 实例化值（连接时自动实例化）
- **R<T> 固定值（2026-08-09 Q3 闭合；游戏不识别裸 VarBase，必须 ConcreteBase 包装）**：
  `VarBase{class=10000, alreadySetVal=1, bConcreteValue{indexOfConcrete(0 省略), 具体VarBase}}`
  具体 VarBase 如 StringBase{class=5, alreadySetVal, itemType{1:1,100:{1:6}}, bString, f4=6}
  （尾随 f4=VarType 码；EnumBase 无 alreadySetVal）。真实快照：run.main n43（Equal Str）、
  平滑反弹面y n31/n34（Set Bol）、n50（Set Flt）、param-turn n32（Equal Str）。
  CLI：`node <idx> param <shell> Str:xx` 对 R<T> pin 自动包装（reflectConcreteIndex）
- 旧错误记录："Get 变体 339=Str" 不对——339=Int（Str=342）

## 节点增删（node-add-case1/2 + node-del-case1 + tab-input 复制闭合）

- node-add：nodeIndex = 最小空闲空洞；记录按 nodeIndex 升序插入；无 pin 落盘
  （有默认参数的节点新增也不落盘默认 pin）
- 有同 genericId donor 时克隆 f2/f3（含 concreteId/kind）；无 donor 按 SysCall Fixed
  模板构造（genericId=concreteId, kind=22000）
- Variant donor（genericId≠concreteId）与 Variant 新增未闭合 → fail closed
  （2026-08-09 Q2 跨图复制 Variant 节点用一次性脚本：提取 donor raw → 改 f1/pos/引脚字节
  → 注入目标图；未做成正式 op）
- **node-copy（编辑器复制粘贴语义，2026-08-09 tab-input case2-6 闭合）**：
  完整克隆源记录全部字段（f2/f3 + 所有 pin 含固定值/cpi/ClientExec + f6wire2 `08061001`
  + f9=1），仅重分配 nodeIndex（最小空闲）+ 新 pos（f5/f6 wire5）
- node-del：从 nodes 数组移除该记录；nodeIndex 变回空洞可复用；root4 def 记录不删

## R<T> 固定值编码（2026-08-09 param-turn Q3 闭合；游戏不识别裸 VarBase）

- R<T> 泛型 pin 的固定值必须 ConcreteBase 包装（编辑器原生快照：run.main n43 Equal Str、
  平滑反弹面y n31/n34 Set Bol、n50 Set Flt、param-turn n32 Equal Str）
- `VarBase{1:10000, 2:1, 110: bConcreteValue{1:indexOfConcrete(0省略), 2:具体VarBase}}`
- indexOfConcrete = 节点族 reflectMap 位置（reflectConcreteIndex）；CLI param op 对
  R<T> pin 自动包装（`node <idx> param <shell> Str:xx`），非 R<T> pin 保持裸 VarBase
- 具体 VarBase 与 buildVarValue 同构；Set Str 固定值（idx=3）无直接真实快照（同构推导，
  已写回 n70 待游戏核验）

## 复合（composite-nodes.md 闭合）

- 复合实例节点 kind=22001（普通 SysCall=22000）；实例 pin 带 field7=compositePinIndex
- 复合定义 impl 图与实例记录分离；改名/参数改名走 def 记录
- add/del/swap-input 会重编号实例节点（chooseRebuildIndex/chooseMovedIndex 规则；
  跨轮墓碑无会话史可能低于编辑器）

## 复合分类（2026-08-19 编辑器差分闭合）

- **分类注册表 = `field10.field3` 独立子节**（p1=3），与复合 def（p1=2）分开；每条记录一个分类。
- 记录结构：`{ f1(分类id varint), f2(树) }`；树层级 `{ f1(名), f2(子分类), f3(成员引用) }`。
- 成员引用 = `f3{ f1(17){ NodeGraph.Id{class 10001,type 20000,kind 22001, f5=复合defid} } }`（21 字节）。
- **默认分类"复合节点"隐式**（无记录）；自定义分类 = 一条记录 + 成员列表；层级可嵌套。
- 编辑器新建空分类会落记录（空成员）；拖复合进分类 = 记录成员加 21B 引用；拖出 = 删引用。
- CLI：
  - 读/定位：`gsts assets:node-graphs read --gil map.gil [--category 名] [--composite <id>] [--json]`
    （列表含 `[分类]`，--json 复合带 `category` 字段）
  - 写：`gsts assets:node-graphs patch --gil map.gil composite <def-id> category <名称|clear> --write`
    （名称可含路径 `复合节点/xxx` 或简写 `xxx`；`clear`=移回默认）
  - 证据：set +21B / clear -21B 往返 hash = 编辑器原始（ffbf525e 实测），逐字节一致。
  - 原语：`src/cli/static_assembly/graph_edit.ts` 的 `listCompositeCategories` /
    `compositeCategoryName` / `setCompositeCategory` / `clearCompositeCategory`。

## 复合内 setter 的 capture value 引脚（2026-08-19 编辑器差分 + 源码级 GIA 验证闭合）

- **规则**：复合内用「复合输入 capture」直接设变量时，value 引脚必须是 **ConcreteBase 包裹**
  （`class:10000` + `alreadySetVal:true` + `bConcreteValue`）。若留
  `{class:2, alreadySetVal:false, bInt:{val:0}}` 占位 → 编辑器/游戏按「值未设置」处理，
  类型判定失败（curMove 事故实证）。
- **indexOfConcrete 一律由 vendor concrete map 决定**（`get_index_of_concrete(genericId, pin, varType)`，
  勿写死——cap/cv 的 int→0 只是恰好；三节点族全类型实测：
  cv(22, pin2) int→0/float→4/bool→6/str→1/vec3→5/entity→2；gv(323, pin1) int→0/float→1/bool→2/str→3/vec3→11/entity→5；
  lv(19, pin1) int→1/float→5/bool→0/str→2/vec3→6/entity→3）。
- **内层 value 按值类型生成对应 VarBase**（int→IntBase / float→FloatBase / bool→EnumBase /
  str→StringBase / vec3→VectorBase / 引用→IdBase；编辑器样本 bInt/bVector 为**空 payload**，
  编译器显式 0 字段语义等价、游戏接受——2026-08-19 int/float/bool/vec3 全类型游戏核验通过）。
- 覆盖：**set_node_graph_variable**（value 引脚 index 1）、**set_custom_variable**（value 引脚 index 2）、
  **set_local_variable**（value 引脚 index 1，第三形态 2026-08-19 lv_set_repro 差分闭合）。
- **set_local_variable 额外要求**：配对 **Get Local Variable(18) 引用节点**——set 的 handle 引脚
  （type 16 LocalVariable）连线到 getter 的 handle 输出（E<1016> 身份线）。
- 编译器修复：`src/compiler/ir_to_gia_transform/composite.ts` `materializeImplOrdinaryGraphWithVendor`
  边界引脚合并处（`setterCapture` 统一分支，三节点共用 vendor ioc + 按类型内层）。
- 回归：`tests/composite/test-set-capture-concrete-wire.ts`（3 setter × int/float/bool/vec3 全断言）。
- **DSL 用法坑（2026-08-19 差分核实）**：`new vec3(1,2,3)` 三参数**静默丢分量**（value=1）——
  构造函数只收数组参数，必须 `new vec3([1,2,3])` 或裸数组；曾因此误判为 vendor 编码 bug。

## 运算节点变体（2026-08-09 turn-ctl 实战证据）

- Subtraction（减法运算）：id 202，reflectMap `[[202,'S<T:Int>'],[203,'S<T:Flt>']]`——Flt 变体
  concreteId=203、indexOfConcrete=1；`0 - x` 即数值取反（无独立取负节点）
- 3D Vector Zoom（三维向量缩放）：id 12，入参 (Vec, Flt)，`基准轴 × direction` 生成目标角度
  （U 面基准 (0,1,0)×90=(0,90,0)）；「乘法运算」为泛型不支持 vec×float
- 来源：src/thirdparty/.../node_data/node_pin_records.ts（reflectMap）+ miliastra 知识库

## DoubleBranch 分支语义（2026-08-09 param-turn 原图证据闭合）

- Double Branch (2)：InParam Bol **true → OutFlow[0]、false → OutFlow[1]**
- 证据：param-turn n36（OR=false 即 face==U 且不忙 → 旋转链在 OutFlow[1]）
- 复制 DoubleBranch 后改分支时，先按此语义确认方向，否则逻辑会反
