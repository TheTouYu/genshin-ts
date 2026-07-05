# Session 交接：列表类型复合参数支持（r15 规划）

> **目标轮次：** r15
> **前置依赖：** [r14-all-types-and-dtc-fix.md](./r14-all-types-and-dtc-fix.md)
> **参考文件：** `user_edit/类型转化-full-v2.gia`（游戏编辑器产出，v1 + 列表操作复合）
> **新同事必读：** `docs/architecture/debugging-gia-encoding-methodology.md`，`docs/architecture/composite/gia-encoding.md`
> **当前状态：** 基线代码（commit `85176ab`）所有测试通过；v2 复刻测试已写但存在差异待解决

---

## 1. 本阶段目标

在 r14 完成的 DTC 全覆盖基础上，在复合节点中增加**列表操作**的支持能力。具体来说：

- **复合 impl 图内**能正常使用 `f.assemblyList()`、`f.listIterationLoop()`、`f.dataTypeConversion()` 等列表相关 DSL 函数
- 复合的 inputs/outputs 能声明 `int_list`、`entity_list` 等列表类型参数
- 主图调用复合时能传入列表值：`f.callComposite(comp, { listParam: list('int', []) })`
- 生成的 GIA 编码与游戏编辑器产出精确匹配

---

## 2. 参考文件分析：类型转化-full-v2.gia

### 2.1 文件结构

参考文件位于游戏导出目录：
```
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/user_edit/类型转化-full-v2.gia
```

v2 在 v1（仅 DTC 复合）基础上新增了一个"列表操作"复合：

```
accessories[4]:
  [0] CompositeDef "列表操作"       ← 新增
  [1] Impl graph "列表操作"          (7 节点)
  [2] CompositeDef "创建复合节点(5)"  ← v1 DTC 复合（无变化）
  [3] Impl graph "创建复合节点(5)"    (15 节点)

主图（3 节点）:
  n=1  When Entity Is Created  (kind=22000, nid=71)
  n=7  复合:列表操作            (kind=22001, nid=1610612740)  ← 2 pins
  n=10 复合:创建复合节点(5)      (kind=22001, nid=1610612739)  ← 7 pins
```

### 2.2 "创建复合节点(5)" CompositeDef（v1 继承，无变化）

7 个输入，0 个输出：

| 输入名 | class | type1 | VarBase_Class | VarType |
|--------|:-----:|:-----:|---------------|---------|
| 输入 | 2 | 3 | IntBase | Integer |
| 输入 | 4 | 5 | FloatBase | Float |
| 输入 | 6 | 4 | EnumBase | Boolean |
| 输入 | **0** | 1 | **Unknown** | Entity |
| 输入 | 1 | 2 | IdBase | GUID |
| 输入 | 7 | 12 | VectorBase | Vector |
| 输入 | 1 | 17 | IdBase | Faction |

> ⚠️ 注意：参考文件中 entity 的 class=0（Unknown），但我们代码产生 class=1（IdBase）。r14 记录为已知差异，未影响游戏运行。

### 2.3 "列表操作" CompositeDef（新增）

**关键发现**：**输入是标量 `int`，不是 `int_list`！** 主图传的是 `12` 和 `23` 两个整数字面量。

```json
{
  "name": "列表操作",
  "inflows": [ { "pinIndex": 55 } ],
  "outflows": [],
  "inputs": [
    { "name": "0", "class": 2, "type1": 3, "pinIndex": 53 },   // int
    { "name": "1", "class": 2, "type1": 3, "pinIndex": 54 }    // int
  ],
  "outputs": [],
  "xxx": 6,
  "type": { "kind": 1000 }
}
```

"列表操作"这个名称指的是复合**内部**做列表操作（Assembly List、List Iteration Loop），而不是输入输出类型是列表。

### 2.4 "列表操作" Impl 图（7 节点）

| 索引 | 名称 | nid | pins | 作用 |
|:----:|------|:---:|:----:|------|
| n=1 | Print String | 1 | 1 | 打印 DTC 转换结果 |
| n=2 | Assembly List | 169 | 102 | 组装 100 元素 int 列表（2 个来自输入 + 98 个零）|
| n=3 | List Iteration Loop | 509 | 4 | 遍历组装后的列表 |
| n=4 | Get Node Graph Variable | 337 | 2 | 读取图变量 "字符串列表" |
| n=5 | List Iteration Loop | 509 | 3 | 遍历图变量列表 |
| n=6 | Data Type Conversion | 180 | 2 | int→str 转换 |
| n=7 | Print String | 1 | 1 | 打印第二个 loop 的结果 |

**执行流**：
```
Event (When Entity Is Created)
  ├─ InFlow → 创建复合节点(5)  (DTC)
  │   └─ Double Branch → 7× PrintString
  └─ InFlow → 列表操作
      └─ List Iteration Loop (n=3)
         ├─ Br1 → DTC (n=6) → Print String (n=1)
         └─ Br2 → List Iteration Loop (n=5) ← Get Node Graph Variable (n=4)
            └─ Br1 → Print String (n=7)
```

**数据流**：
```
流 1:
  Parent Input[0] (int=12) ──┐
                              ├─→ Assembly List (n=2)
  Parent Input[1] (int=23) ──┘    ├ count=2
                                   ├ elem[0]=12
                                   ├ elem[1]=23
                                   └ elem[2..99]=0 (×98)
                                   ↓
                             List Iteration Loop (n=3)
                               └→ per element: DTC int→str → Print String

流 2:
  Get Node Graph Variable (n=4, var="字符串列表")
    ↓
  List Iteration Loop (n=5)
    └→ per element: Print String
```

### 2.5 主图 SysGraph 调用侧 pin

列表操作复合的调用节点（n=7）有 2 个 InParam pin：
- pin[0]: type=3 (Integer), `bInt.val=12`, compositePinIndex=53
- pin[1]: type=3 (Integer), `bInt.val=23`, compositePinIndex=54

SysGraph pins 没有显式 type header（`type.t=undefined`），类型完全通过 `compositePinIndex` 隐式引用 CompositeDef。

---

## 3. 层次编码规则（从参考文件推导）

这是本阶段最重要的发现。GIA 中 `_list` 类型的编码在**三个层次**使用不同的规则：

### 3.1 CompositeDef input/output 层 → 用元素类型

| IR type | `typeClassFromValueType` 应返回 | `typeIdFromValueType` 应返回 |
|---------|:-------------------------------:|:---------------------------:|
| `int_list` | `IntBase(2)` | `Integer(3)` |
| `entity_list` | `IdBase(1)` | `Entity(1)` |
| `bool_list` | `EnumBase(6)` | `Boolean(4)` |
| `str_list` | `StringBase(5)` | `String(6)` |

**当前代码**（`composite.ts:958-998`）：
- `typeClassFromValueType` 对 `_list` 返回 `ArrayBase(10002)` ❌
- `typeIdFromValueType` 对 `int_list` 返回 `IntegerList(8)` ❌

**修复方案**：剥离 `_list` 后缀，递归调用自身。

### 3.2 Impl 图 node pin 层 → 用容器类型（列表输入引脚用）

| IR type | `argVarType` 应返回 |
|---------|:------------------:|
| `int_list` 作为列表输入 | `IntegerList(8)` |
| `int_list` 作为元素输入 | `Integer(3)` |

**当前代码**（`composite.ts:525-558`）：两者都返回 0 ❌。

### 3.3 主图 SysGraph InParam 层 → 用元素类型 base tag

| IR type | `compositeTypeToBaseTag` 应返回 |
|---------|:------------------------------:|
| `int_list` | `'Int'` |
| `entity_list` | `'Ety'` |

**当前代码**（`index.ts:170-184`）：返回 null ❌。

---

## 4. 已做工作

### 4.1 源码改动尝试（均已被 git checkout 还原）

在理解参考文件前，我基于错误假设做了 9 处修改。这些改动本身可能仍有价值，但在确认正确的参考文件结构之前不宜贸然应用。

| # | 文件 | 改动内容 | 是否需要？ |
|:-:|------|---------|:---------:|
| 1 | `core.ts:1376` | `createTypedValue` `_list` → `new list(baseType)` | 需要，但测试场景不同 |
| 2 | `composite_registry.ts:241` | `RUNTIME_TO_GIA_TYPE` `instanceof list` | 需要 |
| 3 | `value.ts:636` | `list.toIRLiteral()` → typed literal | 需要 |
| 4 | `server_globals.ts:536` | `list()` factory 空数组 → `listLiteral` | 需要 |
| 5 | `composite.ts:972` | `typeClassFromValueType` `_list` → 元素 class | 需要 |
| 6 | `composite.ts:993` | `typeIdFromValueType` `_list` → 元素 typeId | 需要 |
| 7 | `composite.ts:539` | `argVarBaseClass` 增加 `_list` 分支 | 需要 |
| 8 | `composite.ts:563` | `argVarType` 增加 `_list` → 元素 type | 需要 |
| 9 | `index.ts:183` | `compositeTypeToBaseTag` 增加 `_list` | 需要 |

**结论**：这 9 个改动仍然是正确的方向。但由于当时对参考文件的理解是错误的（以为复合输入是 `int_list` 类型，实际上是标量 `int`），仓促应用了改动。正确的路径是：

1. **先**确认参考文件结构的完整理解（本交接文档）
2. **然后**再应用这 9 个改动
3. **最后**编写复刻测试验证

### 4.2 测试文件编写

已编写复刻 v2 测试（但仍有差距）：

**文件**：`tests/composite/replicate-full-dtc-v2.ts`

```typescript
// 两个复合：
// 1. "创建复合节点(5)" — 6 种 DTC 类型（int/float/bool/entity/guid/vec3→str）
// 2. "列表操作" — 2 个 int 输入 → assemblyList → listIterationLoop → DTC → printString
```

生成 GIA 路径：`tests/composite/output/类型转化-full-v2.gia`

### 4.3 文档

- `docs/composite-ir/gaps/list-param-reference-analysis.md` — 参考文件详细分析（含 9 个修复点的文档）
- `docs/composite-ir/gaps/list-param-in-composite-call.md` — 原有 gap 文档（已存在）

---

## 5. 当前发现的差异（生成 vs 参考）

### 5.1 列表复合 impl 图对比

| 维度 | 生成 | 参考 | 状态 |
|------|------|------|:----:|
| 节点数 | 4 | 7 | ❌ |
| Assembly List pins | 100 | 102 | ❌ |
| List Iteration Loop pins | 2 | 4 | ❌ |
| DTC concreteId | 182 (int→str) | 182 | ✅ |
| 包含 GetNodeGraphVariable | 无 | 有 | ❌ |
| 包含第二个 ListIterationLoop | 无 | 有 | ❌ |

### 5.2 主图对比

| 维度 | 生成 | 参考 | 状态 |
|------|------|------|:----:|
| accessories 数 | 4 | 4 | ✅ |
| 复合名 | 创建复合节点(5) | 创建复合节点(5) | ✅ |
| 复合名 | 列表操作 | 列表操作 | ✅ |
| CompositeDef 类型编码 | class=2/type1=3 (int) | class=2/type1=3 (int) | ✅ |
| 执行流拓扑 | 串行 chain | 并行分支 | ❌ |

### 5.3 具体问题

#### 问题 A：`getNodeGraphVariable` 的类型错误

在 LIST composite 的 `build()` 中调用：
```typescript
const strList = f.getNodeGraphVariable('字符串列表')  // 返回 generic
f.listIterationLoop(strList, (item) => { ... })       // ❌ 类型不匹配
```

`listIterationLoop` 的重载不接受 `generic` 作为列表参数。需要：
- 先注册图变量类型，让 `getNodeGraphVariable` 返回正确的类型
- 或者在 `g.server()` 的 `variables` 选项中预声明变量

#### 问题 B：Assembly List 元素数量

参考有 102 个 pin（1 count + 101 elements？还是 2 + 99？）。我们的代码传了 100 个元素（2 个输入 + 98 个零），但 Assembly List 节点在 GIA 中将每个 arg 映射为一个 pin。需要精确确认参考的文件用了多少个元素。

#### 问题 C：节点顺序

节点的索引/顺序由 capture 系统的 ID 分配决定，与游戏编辑器不同。目前不清楚这是否需要匹配。

#### 问题 D：执行流拓扑

参考用 Event 节点的分支并行触发两个复合，我们的测试是串行链式触发。这是测试写法问题，不是编码问题。

---

## 6. 下一步工作

### 6.1 修复源码（9 个改动）

按优先级：

| Pri | 改动 | 文件 | 说明 |
|:---:|------|------|------|
| P0 | `createTypedValue` `_list` → `new list(baseType)` | `core.ts:1376` | 复合捕获阶段列表输入占位 |
| P0 | `RUNTIME_TO_GIA_TYPE` `instanceof list` | `composite_registry.ts:241` | impl 节点 args 类型编码 |
| P1 | `typeClassFromValueType` `_list` → 元素 class | `composite.ts:972` | CompositeDef 类型编码 |
| P1 | `typeIdFromValueType` `_list` → 元素 typeId | `composite.ts:990` | CompositeDef 类型编码 |
| P1 | `argVarBaseClass` 增加 `_list` 分支 | `composite.ts:538` | Impl 图 pin class |
| P1 | `argVarType` 增加 `_list` + 容器映射 | `composite.ts:557` | Impl 图 pin type |
| P1 | `compositeTypeToBaseTag` 增加 `_list` | `index.ts:182` | 主图 InParam pin |
| P1 | `list.toIRLiteral()` → typed literal | `value.ts:636` | IR 字面量 |
| P1 | `list()` factory 空数组 → `listLiteral` | `server_globals.ts:536` | IR 生成 |

### 6.2 完善复刻测试

- [ ] 解决 `getNodeGraphVariable` 的类型问题（预声明变量 or 修改重载）
- [ ] 确认 Assembly List 的元素数量与参考一致
- [ ] 验证是否需要匹配节点顺序

### 6.3 验证计划（三阶段）

**第一阶段**：trace 工具对比

```bash
npx tsx tests/composite/trace-exec-flow.ts <生成的gia> --json --depth=3
npx tsx tests/composite/trace-dataflow.ts <生成的gia> --list-nodes -c "列表操作"
```

对比参考与生成的：
- CompositeDef type class/type1
- DTC concreteId 和 indexOfConcrete
- Impl 图节点类型和数量
- 执行流拓扑

**第二阶段**：IR JSON 1:1 检查

通过 `buildServerGraphRegistriesIRDocuments` 产出的 `doc` 对象（IR JSON），与参考 GIA 反向推导的 IR JSON 结构逐字段对比。

**第三阶段**：游戏内验证

将生成的 GIA 复制到 `Beyond_Local_Export/user_edit/`，在游戏中加载验证。

---

## 7. 使用工具与方法速查

### 7.1 分析工具

```bash
# GIA 解码
node -e "const {decode_gia_file}=require('./dist/.../decode.js'); ..."

# 执行流追溯
npx tsx tests/composite/trace-exec-flow.ts <文件.gia>
npx tsx tests/composite/trace-exec-flow.ts <文件.gia> --expand=<复合名>
npx tsx tests/composite/trace-exec-flow.ts <文件.gia> --json --depth=3

# 数据流追溯
npx tsx tests/composite/trace-dataflow.ts <文件.gia> --list-nodes
npx tsx tests/composite/trace-dataflow.ts <文件.gia> --list-nodes -c <复合名>
npx tsx tests/composite/trace-dataflow.ts <文件.gia> <节点索引> -c <复合名> --all-params --max-depth 10
npx tsx tests/composite/trace-dataflow.ts <文件.gia> <节点索引> -c <复合名> --json

# impl 图结构
npx tsx tests/composite/_dump_impl_graphs.ts <文件.gia>
```

### 7.2 验证命令

```bash
npm run build                       # 编译
npx tsx tests/composite/replicate-full-dtc.ts    # v1 复刻（基线回归）
npx tsx tests/composite/replicate-full-dtc-v2.ts # v2 复刻（本阶段）
npx tsx tests/composite/test-all-types-composites.ts  # 全覆盖类型
npm run quicktest                   # 回归
```

### 7.3 参考文件路径

```
# 游戏编辑器产出（Windows 路径映射到 WSL）
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/user_edit/

# 关键文件
类型转化-full.gia    ← v1: DTC 全覆盖（6 种类型）
类型转化-full-v2.gia  ← v2: DTC + 列表操作复合
```

---

## 8. 关键文件索引

### 8.1 运行时/DSL

| 文件 | 职责 | 关键函数 |
|------|------|---------|
| `src/runtime/value.ts` | 值类型 + `toIRLiteral()` | `list`, `listLiteral`, `list.toIRLiteral()` |
| `src/runtime/core.ts` | 复合定义/捕获 | `createTypedValue()`, `defineComposite()` |
| `src/runtime/composite_registry.ts` | 捕获 → IR JSON | `toCompositeDefIR()`, `RUNTIME_TO_GIA_TYPE` |
| `src/runtime/server_globals.ts` | DSL 工厂函数 | `list()`, `assemblyList()` |
| `src/runtime/ir_builder.ts` | IR 构建器 | `buildArgument()`, `buildConnectionArgument()` |
| `src/runtime/IR.d.ts` | IR 类型定义 | `ListableValueTypeMap`, `CommonLiteralValueListTypeMap` |

### 8.2 编译器/GIA 编码

| 文件 | 职责 | 关键函数 |
|------|------|---------|
| `src/compiler/ir_to_gia_transform/composite.ts` | IR JSON → GIA | `typeClassFromValueType()`, `typeIdFromValueType()`, `argVarBaseClass()`, `argVarType()`, `buildImplNodePins()`, `buildConnPin()`, `getDtcInParamInfo()` |
| `src/compiler/ir_to_gia_transform/index.ts` | 主图编码 | `irToGia()`, `compositeTypeToBaseTag()`, `expandListLiterals()` |
| `src/compiler/ir_to_gia_transform/preprocess.ts` | 列表字面量展开 | `expandListLiterals()` |

### 8.3 第三方/节点数据

| 文件 | 职责 |
|------|------|
| `src/thirdparty/.../protobuf/gia.proto.ts` | GIA protobuf 类型（VarType, VarBase_Class 等）|
| `src/thirdparty/.../node_data/node_id.ts` | 节点 ID 映射（Assembly_List__Int=169 等）|
| `src/thirdparty/.../node_data/concrete_map.ts` | ConcreteId 映射 |
| `src/thirdparty/.../node_data/node_pin_records.ts` | 节点引脚记录 |
| `src/thirdparty/.../gia_gen/nodes.ts` | GIA 节点类型转换 |

### 8.4 定义

| 文件 | 职责 |
|------|------|
| `src/definitions/nodes.ts` | F 方法定义（`dataTypeConversion()`, `assemblyList()`, `listIterationLoop()` 等）|
| `src/definitions/zh_aliases.ts` | 中文别名映射 |

### 8.5 测试

| 文件 | 内容 |
|------|------|
| `tests/composite/replicate-full-dtc.ts` | v1 复刻测试（基线，6 种 DTC 通过）|
| `tests/composite/replicate-full-dtc-v2.ts` | v2 复刻测试（本阶段编写，有差异）|
| `tests/composite/test-all-types-composites.ts` | 全覆盖参数类型测试（列表复合注释调用）|
| `tests/composite/trace-dataflow.ts` | 数据流追溯工具 |
| `tests/composite/trace-exec-flow.ts` | 执行流追溯工具 |

---

## 9. 关键待决策项

1. **`getNodeGraphVariable` + `listIterationLoop` 兼容问题** — 是否需要在 `nodes.ts` 中增加接受 `generic` 的重载？还是在 `g.server()` 中预声明变量？
2. **节点顺序是否需要匹配？** — 如果不需要，可节省大量工作
3. **entity 的 class 差异（0 vs 1）** — r14 遗留，是否需要修复？
4. **主图执行流拓扑** — 参考用 Event 节点分支并行触发，我们的测试用串行 chain。测试结构是否需要匹配参考文件的拓扑？
5. **Assembly List 精确元素数量** — 参考 102 pins vs 我们的 100 pins，需要确定精确值

---

## 10. Git 基线

当前工作基于 commit `85176ab`（r14 handover）。源码无未提交改动。

```bash
85176ab docs: r14 handover — all types coverage and DTC fix complete
```

所有 9 个源码改动已在分支上尝试过但被 `git checkout -- src/` 还原。下次接手可以直接应用这些改动（参照第 6.1 节的列表）。

---

## 11. 参考文档

| 文档 | 内容 |
|------|------|
| `docs/composite-ir/handover/r14-all-types-and-dtc-fix.md` | r14 交接（DTC 全覆盖）|
| `docs/composite-ir/gaps/list-param-in-composite-call.md` | 列表类型参数 gap |
| `docs/composite-ir/gaps/list-param-reference-analysis.md` | v2 参考文件详细分析 |
| `docs/architecture/debugging-gia-encoding-methodology.md` | 调试方法论 + 3 类 ID 系统 + concrete map |
| `docs/architecture/composite/gia-encoding.md` | GIA 编码完整参考 |
| `docs/composite-ir/01-ir-types.md` | IR 类型定义 |
| `docs/architecture/definition-system.md` | §3 数据类型总览 |
| `docs/architecture/composite/composite-connection-boundary-matrix.md` | 复合连接边界矩阵 |
