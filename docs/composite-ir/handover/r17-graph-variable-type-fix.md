# Session 交接：图变量类型编码修复（r17）

> **目标轮次：** r17
> **当前基线：** commit （手动作业前的最新状态）
> **参考文件：**
>   - `/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/user_edit/全类型测试v2.gia` — 手动修复的黄金标准（含列表操作复合）
>   - `/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/user_edit/节点图变量.gia` — 新参考：纯图变量测试
> **生成文件：**
>   - `tests/composite/output/类型转化-full-v2.gia` — 全类型测试生成
>   - `tests/composite/output/节点图变量.gia` — 图变量测试生成
> **复刻测试：**
>   - `tests/composite/replicate-full-dtc-v2.ts` — 全类型复刻
>   - `tests/composite/replicate-graph-variable.ts` — **新**：图变量复刻

---

## ⚠️ 最重要的规则：多跟用户沟通

**这是最高优先级原则。** 用户明确强调：做任何事之前都要先确认方向，不要自己深入研究。具体来说：

1. **拿到任务先确认理解** — 把你要做的步骤列出来，问用户对不对
2. **每做完一步就问下一步方向** — 不要一次做太多，尤其是涉及到修改代码时
3. **遇到不确定的立马停下来问** — 不要试图自己研究透
4. **分析完数据先汇报再行动** — trace 完、diff 完，先给用户看结果，问下一步

---

## 一、当前的核心问题

### 问题描述

`GetNodeGraphVariable`（获取节点图变量）的 OutParam 类型编码错误。

**具体表现（在 `全类型测试v2.gia` 的列表操作复合中）：**

| 位置 | 参考文件 | 当前生成 | 差异 |
|------|---------|---------|------|
| n=8 (GetNodeGraphVariable) OutParam type | **7 (GUIDList)** | **6 (String)** | 类型不同 |
| value 编码 | `bConcreteValue` 包裹 | 平铺 `bString` | 编码格式不同 |
| n=4 (第二循环) InParam 类型 | 7 (GUIDList) | 6 (String) | 连锁错误 |
| n=5 (Print String) pins | **0** | **1** | 因类型不匹配断开连线 |

### 根因分析

代码位于 `src/compiler/ir_to_gia_transform/composite.ts` 的 `buildImplNodePins` 函数（约 726-767 行）：

```typescript
if (!hasExplicitOutParam && pins.length > 0 && isDataProducerNode(node.type)) {
    let outType = pins[0].type  // ← BUG：取的是 InParam[0] 的类型
    // ...
}
```

`get_node_graph_variable` 的第一个 arg 是变量名字符串（`"字符串列表"`），所以 `pins[0].type` 是 `VarType.String`（6），而 OutParam 应该是变量的真实类型（`str_list` → `VarType.StringList` 11 或 `VarType.GUIDList` 7）。

**缺少的逻辑：** `get_node_graph_variable` 需要从 `implVariables` 中按变量名查找真实类型来设置 OutParam。

---

## 二、可用的工具

### 2.1 执行流追踪

```bash
npm run trace-exec -- <文件.gia>
npm run trace-exec -- <文件.gia> --expand=<复合名或节点索引>
```

**用途：** 查看事件源 → 节点执行链拓扑，展开复合内部结构。

### 2.2 数据流追踪

```bash
npm run trace-dataflow -- <文件.gia> <节点索引> <InParam索引>
npm run trace-dataflow -- <文件.gia> <节点索引> <InParam索引> -c <复合名>
npm run trace-dataflow -- <文件.gia> -l              # 列出节点
npm run trace-dataflow -- <文件.gia> -l -c <复合名>   # 列出复合内部节点
```

**用途：** 追溯某个 InParam 的数据来源（连线回溯），显示数据流链。

### 2.3 JSON 解码和字段级对比

```bash
# 解码 GIA 为 JSON
node -e "const {decode_gia_file} = require('./dist/.../decode.js'); ..."

# 递归 diff（Python 脚本）
python3 /tmp/diff_gia.py <ref.json> <gen.json>
```

递归 diff 脚本位于 `/tmp/diff_gia.py`，自动排除 ID、坐标、pinIndex 等已知装饰性差异。

---

## 三、工作流程（交接手册 3.4 验证流程）

```
1. 先沟通确认方向（最优先！）
2. npm run build（重新编译）
3. 跑测试生成 GIA：npx tsx tests/composite/replicate-graph-variable.ts
4. 解码 GIA 为 JSON
5. 递归 diff 对比参考文件
6. 分类差异：
   - 必须修复（类型、顺序、缺失字段）
   - 已知合理（pinIndex 基础值、ID 分配）
   - 不确定（需要讨论）
7. 问用户方向后再动手修
8. 修完重新生成→重复 4-7 直到 0 差异
9. 最后才去游戏验证
```

---

## 四、关键文件索引

### 源代码

| 文件 | 职责 | 关键函数 |
|------|------|---------|
| `src/runtime/core.ts` | 运行时核心：defineComposite、capture | `defineComposite()`, `buildServerGraphRegistriesIRDocuments()` |
| `src/runtime/composite_registry.ts` | 复合注册：IR 定义 | `toCompositeDefIR()` |
| `src/runtime/value.ts` | 值类型 | `list` class, `listLiteral` class |
| `src/runtime/variables.ts` | 变量定义解析 | `parseVariableDefinitions()` |
| `src/compiler/ir_to_gia_transform/composite.ts` | IR→GIA 复合编码 | `buildImplNodePins()` ← **BUG 所在**, `argVarType()`, `isDataProducerNode()` |
| `src/compiler/ir_to_gia_transform/index.ts` | IR→GIA 主图编码 | `irToGia()`, graphValues 合并, `applyGetNodeGraphVariableNamePin()` |
| `src/definitions/nodes.ts` | 节点定义（DSL） | `get()`, `getNodeGraphVariable()`, `listIterationLoop()` |

### 测试

| 文件 | 内容 |
|------|------|
| `tests/composite/replicate-full-dtc-v2.ts` | 全类型复刻（6 DTC + 列表操作） |
| `tests/composite/replicate-graph-variable.ts` | **新**：图变量复刻（复合内+主图直接使用） |
| `tests/composite/trace-exec-flow.ts` | 执行流追踪工具 |
| `tests/composite/trace-dataflow.ts` | 数据流追踪工具 |
| `tests/variables_definition_test.ts` | 旧版变量定义测试（展示了 `g.server({variables: ...})` 的正确用法） |

### 参考 GIA 文件

```
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/
├── user_edit/
│   ├── 全类型测试.gia                    ← v1 参考（已丢失，被误覆盖）
│   ├── 全类型测试v2.gia                  ← 黄金标准（含列表操作，手动修复）
│   └── 节点图变量.gia                    ← 新参考（纯图变量，手动编写）
├── 类型转化-full-v2.gia                  ← 生成文件（目标）
└── test/
```

### GIA 文件路径（游戏根目录）

生成文件通过 cp 复制到：
```
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/类型转化-full-v2.gia
```

注意：`user_edit/` 是用户手动编写的参考文件目录，游戏读取的是**其上一层目录**的文件（即不带 `user_edit/` 前缀）。

---

## 五、关键发现总结

### 5.1 已确认的结构差异

通过 trace 工具对比，两个参考文件的结构已经分析清楚。以下是 `全类型测试v2.gia` 的列表操作复合内部：

**节点列表：**
| 节点 | 类型 | Ref pins | Gen pins | 差异 |
|------|------|:--------:|:--------:|:----:|
| n=2 | List Iteration Loop | 4 | 4 | pin 顺序不同 |
| n=3 | Print String（第一循环体） | 1 | 1 | ✅ 一致 |
| n=4 | List Iteration Loop（第二循环） | 3 | 3 | pin 类型/顺序不同 |
| n=5 | Print String（第二循环体） | **0** | **1** | ❌ 因类型不匹配断开 |
| n=6 | Assembly List | **102** | **4** | 100 空元素槽 |
| n=7 | DTC | 2 | 2 | ✅ |
| n=8 | GetNodeGraphVariable | 2 | 2 | OutParam **类型不同** |

### 5.2 根因链条

```
GetNodeGraphVariable OutParam 类型错误（取到 String 而非 StringList）
→ 第二循环 ListIterationLoop 的 InParam 类型不匹配
→ 循环体 Print String 的连线断开（pins=0）
```

### 5.3 变量声明方式

从 `tests/variables_definition_test.ts` 学到的正确用法：

**主图层级注册变量：**
```typescript
g.server({
  variables: {
    '字符串列表': new list('str', ['asd']),  // 或用 listLiteral
  }
}).on('whenEntityIsDestroyed', (_e, f) => {
  const v = f.get('字符串列表')  // 能正确解析类型
  f.listIterationLoop(v, (item) => { ... })
})
```

**复合内部注册变量：**
```typescript
g.defineComposite('节点图变量打印', {
  variables: {
    '字符串列表': new list('str', ['asd']),
  },
  build(_, f) {
    f.listIterationLoop(f.get('字符串列表'), (item) => { ... })
  }
})
```

`list` 类从 `genshin-ts/runtime/value` 导入（`import { list } from 'genshin-ts/runtime/value'`），需要 `new` 关键字构造。如果使用全局工厂函数（如旧测试文件中的 `list('str', [])` 不带 `new`），需要先调用 `installServerGlobals()` 安装全局函数。

### 5.4 关于 TypeScript `any` 限制

项目有 `ts-no-any` 规则禁止 `as any`。但在 `@ts-nocheck` 标记的文件中不适用。测试文件可以使用 `@ts-nocheck` + 类型断言绕过。

---

## 六、下一步修复方向

### P0：修 GetNodeGraphVariable 的 OutParam 类型

在 `composite.ts` 的 `buildImplNodePins` 中，为 `get_node_graph_variable` 添加特殊处理：

```typescript
// 在 data_type_conversion 和 list_iteration_loop 的特殊处理之后添加：
if (node.type === 'get_node_graph_variable') {
  const nameArg = (node.args ?? [])[0]
  if (nameArg && nameArg.type === 'str' && typeof nameArg.value === 'string') {
    // 从 compositeDef 的 implVariables 中查找变量类型
    // 需要将 implVariables 传入 buildImplNodePins
    const varName = nameArg.value
    const implVar = implVariables?.find(v => v.name === varName)
    if (implVar) {
      outType = argVarType(implVar.type)
      outClass = argVarBaseClass(implVar.type)
    }
  }
}
```

**需要注意：** `buildImplNodePins` 当前没有 `implVariables` 参数，需要从上层传入。

### P1：修 List Iteration Loop 的 pin 顺序

参考文件中，循环节点的 pin 顺序为：
```
pin[0]: OutFlow (kind=2)
pin[1]: InParam (kind=3)  — 列表来源
pin[2]: OutParam (kind=4) — 当前迭代元素
```

当前生成文件中顺序是 InParam 在前。这可能需要修复 `buildImplNodePins` 中 OutFlow/InParam/OutParam 的生成顺序。

---

## 七、测试复刻说明

### `replicate-graph-variable.ts` 的架构

```
复合"节点图变量打印" → 内部：GetNodeGraphVariable → ListIterationLoop → PrintString
                                 variables: { '字符串列表': list('str', ['asd']) }

主图（whenEntityIsDestroyed）→ fork:
  分支1: callComposite(节点图变量打印)
  分支2: GetNodeGraphVariable("字符串列表") → ListIterationLoop → PrintString
          variables: { '字符串列表': list('str', ['asd']) }
```

主图和复合内部都声明了相同的变量，但变量合并时（`index.ts` 中）会去重。

---

## 八、已知参考文件和生成文件的差异分类

### 必须修复的
- GetNodeGraphVariable OutParam 类型编码
- Assembly List pin 数（参考 102，生成 4）
- pin 顺序（OutFlow 应在 InParam/OutParam 前）
- value 的 bConcreteValue 包裹格式

### 已知合理的（不需修）
- 节点索引/ID 不同
- pinIndex 基值不同
- x/y 坐标不同
- 复合名称后缀 `(N)`（游戏编辑器自动添加）
- filePath 和 gameVersion 不同

### 需要讨论的
- 第二循环体 Print String 是否应该 pins=0（参考如此，但可能是编辑器自动简化的结果）

---

## 九、VarType 枚举参考（关键）

```typescript
VarType = {
  UnknownVar: 0,
  Entity: 1,       GUID: 2,        Integer: 3,
  Boolean: 4,      Float: 5,       String: 6,
  GUIDList: 7,     IntegerList: 8, BooleanList: 9,
  FloatList: 10,   StringList: 11, Vector: 12,
  EntityList: 13,  EnumItem: 14,   VectorList: 15,
  // ...
}
```

`argVarType()` 函数在 `composite.ts` 中做 IR 类型名 → VarType 的映射：
- `'str'` → `VarType.String` (6)
- `'str_list'` → `VarType.StringList` (11)
- `'guid_list'` → `VarType.GUIDList` (7)
