# Session 交接：列表类型复合参数支持（r16 实测迭代）

> **目标轮次：** r16
> **当前基线：** commit `13adfc6`
> **参考文件：** `/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/user_edit/全类型测试.gia`
>   - ⚠️ 原参考文件 `类型转化-full-v2.gia` 被本 session 误覆盖，已丢失
>   - 当前黄金标准是用户手动从游戏编辑器修复后导出的 `全类型测试.gia`
> **生成文件：** `tests/composite/output/类型转化-full-v2.gia`
> **复刻测试：** `tests/composite/replicate-full-dtc-v2.ts`

---

## 1. 已提交的代码改动

### 1.1 架构改动：composite 自声明图变量

`defineComposite` 新增 `variables` 选项，让复合声明它依赖的图变量：

```typescript
const comp = g.defineComposite('列表操作', {
  inputs: { ... },
  variables: { '字符串列表': list('str', ['asd']) },
  build(..., f) {
    f.listIterationLoop(f.get('字符串列表'), (item) => ...)
  }
})
```

涉及文件：

| 文件 | 改动 |
|------|------|
| `composite_registry.ts` | `define()` 接受 `variables`，parse 后存入 `CompositeDefinition.variables` |
| `composite_registry.ts` | `toCompositeDefIR` 输出 `implVariables` 而非 `undefined` |
| `core.ts` | capture 和 `runCompositeCall` 时注册变量到 registry |
| `index.ts` | `irToGia` 合并 composite 声明的变量到主图 `graphValues` |

### 1.2 9 个列表编码修复

| # | 函数 | 文件 | 改动 |
|:-:|------|------|------|
| 1 | `createTypedValue` | `core.ts` | `_list` → `new list(baseType)` |
| 2 | `RUNTIME_TO_GIA_TYPE` | `composite_registry.ts` | `instanceof list` 动态分支 |
| 3 | `typeClassFromValueType` | `composite.ts` | `_list` 剥离后缀递归 |
| 4 | `typeIdFromValueType` | `composite.ts` | `_list` 剥离后缀递归 |
| 5 | `argVarBaseClass` | `composite.ts` | `_list` 剥离后缀递归 |
| 6 | `argVarType` | `composite.ts` | `_list` → 容器类型映射 |
| 7 | `compositeTypeToBaseTag` | `index.ts` | `_list` 剥离后缀递归 |
| 8 | `list.toIRLiteral()` | `value.ts` | 返回 `{ type, value: null }` |
| 9 | `list()` factory | `server_globals.ts` | 空数组 → `listLiteral` |

### 1.3 Impl 图 Pin 编码修补

| 修复 | 文件 | 说明 |
|------|------|------|
| Assembly List count pin | `composite.ts` | 在 args 前插入 count(InParam[0]) |
| assembly_list compositePin 偏移 | `composite_registry.ts` | count pin 占 index 0，arg pin 索引 +1 |
| OutFlow pin 顺序 | `composite.ts` | 移到 InParam/OutParam **前面**（参考文件顺序） |
| `isDataProducerNode` 扩展 | `composite.ts` | 添加 `assembly_list`, `list_iteration_loop`, `get_node_graph_variable` |
| list_iteration_loop OutParam 类型 | `composite.ts` | 从 arg[0] conn type 推导元素类型 |
| get_node_graph_variable OutParam 类型 | `composite.ts` | 从 `implVariables` 按变量名查找 |
| conn pin 类型 | `composite.ts` | 非 DTC conn arg 用 `connType` 覆盖 `buildPlaceholderPin` 的 type=0 |
| composite OutFlow 自动检测 | `core.ts` | **完全移除**——只有显式 `leaf()` 才产生 outflow |
| sink 复合 OutFlow compositePin | `composite_registry.ts` | 无 outflow 标记时不生成隐式 OutFlow 映射 |

### 1.4 vendor 修复

| 修复 | 文件 | 说明 |
|------|------|------|
| `item_type()` 字段名错误 | `gia_gen/basic.ts` | 返回 `{ type_server: { type, kind: 0 } }` 而非 `{ itemType: { type } }`——proto 的 oneof 字段名是 `type_server`，不是 `itemType` |

### 1.5 测试

- v1 基线测试 `replicate-full-dtc.ts` 通过
- v2 复刻测试 `replicate-full-dtc-v2.ts` 通过（`@ts-nocheck`）
- 使用 `f.fork()` 实现 Event 并行分支拓扑（用户指点的 API）

---

## 2. 当前对齐状态 vs 参考文件 `全类型测试.gia`

### 2.1 100% 确认已对齐 ✅

这些已通过 decode → 逐 pin 字段对比验证：

| 检查项 | 验证方式 |
|--------|---------|
| 节点数量（7 nodes） | decode + count |
| 执行流拓扑（嵌套分支：LIST→Br1 Print, Br2 LIST→Print） | trace-exec-flow --expand |
| 主图并行分支（Event→两个复合） | trace-exec-flow |
| 复合 `outflows: 0`, `inflows: 1` | decode CompositeDef |
| CompositeDef 类型编码（class=2/type1=3） | decode CompositeDef.inputs |
| LIST(n2) pin 顺序 + 类型：OutFlow×2, InParam=IntList(8), OutParam=Integer(3) | decode + 逐 pin 对比 |
| LIST(n4) pin 顺序 + 类型：OutFlow, InParam=StrList(11), OutParam=String(6) | decode + 逐 pin 对比 |
| GetNodeGraphVariable: InParam=String(6), OutParam=StrList(11) | decode + 逐 pin 对比 |
| Assembly List: count=Int(2), 2 elements=Int(3), OutParam=Int(3) | decode + 逐 pin 对比 |
| DTC: InParam=Integer(3), OutParam=String(6) | decode + 逐 pin 对比 |
| PrintString: InParam=String(6) | decode + 逐 pin 对比 |
| GraphValues: name=字符串列表, type=11, itemType.type_server.type=11/6 | decode 完整 dump |
| DataTypeConversion concreteId | trace-dataflow |
| 主图 graphValues `type_server` 字段 | decode JSON dump |
| conn pin 不从 buildPlaceholderPin 继承 type=0 | decode LIST InParam type |

### 2.2 未对齐的已知差异

| 差异项 | 生成 | 参考 | 确信度 | 影响评估 |
|--------|:----:|:----:|:------:|---------|
| Assembly List pin 总数 | 4 | 102 | 低 | 游戏编辑器默认分配 100 元素槽。我们只传 2 元素，所以 4 pins。不确定是否影响运行 |
| GetNodeGraphVariable `term` 标签 | 有 | 无 | 中 | trace 工具加的标记，不是 GIA 字段 |
| CompositeDef pinIndex | 100/101 | 53/54 | 无关 | 不同的 PIN_INDEX_BASE 常量，不影响功能 |
| Entity class | 1(IdBase) | 0(Unknown) | 低 | r14 已知差异，不影响游戏运行 |

---

## 3. 本轮排查复盘（重要）

### 3.1 100% 确认正确的发现 ✅

| 发现 | 证据 |
|------|------|
| 三层编码规则（CompositeDef / Impl pin / 主图用不同规则） | 参考文件分析文档已验证 |
| `isDataProducerNode` 不含列表节点导致缺少 OutParam | 修复后 pin 数量匹配 |
| `get_node_graph_variable` OutParam 应从变量声明获取类型 | 修复后 type=11(StrList) 匹配参考 |
| `item_type` vendor 函数 proto 字段名错误 | 修复后 graphValues `type_server.type` 正确 |
| 游戏引擎按 pin 数组**位置序**解析（不是按 kind/index） | pin 顺序从 InParam→OutFlow 改为 OutFlow→InParam 后完全匹配参考 |
| conn 非 DTC 节点应用 connType 覆盖 type=0 | LIST InParam 从 0 变为正确值 |
| `buildImplNodePins` 没有为 outEdges 生成 OutFlow pin | 修复后控制流引脚出现 |
| `f.fork()` 能创建并行分支（用户指点的 API） | 主图拓扑匹配参考 |
| composite OutFlow 不应自动检测 | 移除后复合 `outflows: 0` 匹配 |
| `addOutFlowCompositePins` 不应为 sink 复合添加隐式 OutFlow | 移除后 compositePins 数量减少 |

### 3.2 100% 确认错误的做法 ❌

| 错误 | 后果 | 根本原因 |
|------|------|---------|
| **逐轮局部比对**——每次只看部分字段就改、测试 | 浪费 5+ 轮测试周期 | 应该一次性完整 JSON diff |
| **没有 dump 完整 JSON 中间产物**——只用 trace 工具的聚合输出 | trace 工具只显示部分字段（如不显示 class、itemType 嵌套结构） | 低估了 encode/decode 的复杂度 |
| **过早游戏验证**——还有已知差异就去游戏测 | 每次都有多个 diff，无法定位根因 | 应该等 JSON diff = 0 再去游戏 |
| **修复不完整**——修 OutParam 不修 InParam，修 type 不修 pin 顺序 | "修一半"导致下一个 diff 掩盖根因 | 没做全量 diff 不知道自己漏了什么 |
| **cp 后不确认 md5**——WSL 文件系统 cp 返回成功但文件没更新 | 浪费一轮测试在旧文件上 | 应该 cp 后立即 md5sum 确认 |
| **修改 `@ts-nocheck` 文件时破坏文件结构**——误删 imports/constants | 编译失败多次，浪费时间 | 应该用 git show 查看原始内容后再编辑 |

### 3.3 仍有不确定的事项 ❓

| 事项 | 不确定原因 | 建议验证方法 |
|------|-----------|-------------|
| **游戏仍显示 GUID list 的原因** | 逐 pin 对比已全部对齐，但游戏依然异常 | ① 完整 JSON diff（含 main graph 所有字段）；② 检查是否有 session 缓存；③ 试 Assembly List 改为 102 pins |
| **Assembly List 是否需要 102 pins** | 参考有 102，我们的 4 也可能够 | 改成 102 看看是否修复 |
| **vendor 编码还有没有其他 `item_type` 风格的 bug** | `item_type` 的字段名错误是偶发性的，不排除其他类似 bug | 逐字段对比所有 VarBase 结构 |
| **`type2` 字段是否必须** | CompositeDef inputs 有 `type2`，我们的编码可能没设 | decode 对比参考的 type2 |
| **`f.fork` 的正确语义** | 我们用了但没验证 fork 的具体 GIA 结构 | decode 对比 fork 节点 |
| **主图 graphValues 的 entries 是否正确** | 仅看了 type_server，没看 bArray.entries 的完整结构 | 完整 dump entries |
| **游戏是否缓存 GIA 文件** | 每次覆盖文件但游戏可能读缓存 | 尝试清除缓存或重启 |

### 3.4 推荐的正确验证流程

```
1. 生成 GIA → decode_gia_file() → 完整 JSON dump
2. 参考 GIA → decode_gia_file() → 完整 JSON dump
3. 写递归 diff 脚本，排除已知差异（id/name/nodeIndex）
4. 一次找出所有字段差异，分类：
   - 必须修复的（类型、顺序、缺失字段）
   - 已知合理的（pinIndex 基础值、ID 分配）
   - 不确定的（需要讨论）
5. 批量修复"必须修复"项
6. 重新生成，重复 1-4 直到 0 差异
7. 确认 main graph 和 accessories 全部对齐
8. 最后才去游戏验证
```

---

## 4. 本轮关键事件时间线

1. **初始状态**：v2 复刻测试已有，4 vs 7 节点，大量差异
2. **Part A**：composite variables 架构重构（defineComposite + capture + GIA 合并）
3. **Part B**：9 个列表编码修复
4. **Part C**：pin 编码修补 → Assembly List count pin、isDataProducerNode
5. **❌ 误删 OutFlow 生成代码** → 恢复
6. **❌ 误删 return 语句** → 恢复
7. **❌ 误删函数闭合大括号** → 恢复
8. **用户测试 #1**：Assembly List 元素太多（100 个）、OutFlow 缺失
9. **修复**：Assembly List 改为 2 元素、sink 复合 OutFlow 移除
10. **❌ 覆盖参考文件**：cp 到 user_edit/ 覆盖了原参考文件
11. **用户测试 #2**：第二个 LIST OutParam 为 GUID
12. **修复**：list_iteration_loop OutParam 从 conn type 推导
13. **❌ 误删 OutFlow 生成代码（第二次）** → 恢复
14. **❌ 误删函数闭合大括号** → 恢复
15. **❌ 误删 pin 创建代码** → 恢复
16. **用户测试 #3**：GUID 未修复，且控制流引脚断开
17. **发现 WSL cp 未生效**：游戏目录还是旧文件
18. **用户测试 #4**：还是 GUID——定位到 `get_node_graph_variable` OutParam
19. **修复**：get_node_graph_variable OutParam 从 implVariables 查找 + item_type vendor fix
20. **用户测试 #5**：GUID 依然。用户手动在游戏编辑器修复后导出 `全类型测试.gia`
21. **完整对比**：发现 pin **顺序**不同、LIST InParam type=0
22. **修复**：pin 顺序（OutFlow 提前）+ connType 覆盖 InParam 类型
23. **⚠️ 当前状态**：逐 pin 字段完全对齐，但游戏仍显示 GUID——原因未知

---

## 5. 未解决问题

### 5.1 核心问题：游戏仍显示 GUID list

当前生成文件与参考文件的 impl 图逐 pin 对比**已全部对齐**，但游戏仍异常。可能的未检查项：

1. **主图层差异**——当前对比只覆盖了 composite 的 impl 图，没有完整对比 main graph 的：
   - main graph 的 node pin 字段（compositePinIndex、type 等）
   - main graph 的 `graphValues` 完整结构（entries 的 itemType 等）
   - `relatedIds` 字段
2. **CompositeDef 层差异**——当前只比了 inputs 的 class/type1，没比：
   - `type2` 字段
   - `xxx` 字段
   - `type.kind` 字段
3. **Assembly List 102 pins**——虽然功能上不需要，但游戏可能检查 pin 数量
4. **vendor 编码的其他 bug**——类似 `item_type` 的字段名错误可能有更多
5. **游戏缓存**——可能需要重启游戏或清理缓存

### 5.2 建议的下一步

**优先级 P0**：
- 写完整 JSON diff 脚本，递归比较两个 decode 后的 GIA 对象的所有字段
- 排除已知差异（id/name/nodeIndex），输出完整差异列表

**优先级 P1**：
- 检查 CompositeDef 的 `type2`、`xxx`、`type.kind` 字段
- 检查 main graph 的 node pins 字段
- 检查 main graph 的 `graphValues` 完整结构
- 尝试 Assembly List 改为 102 pins

**优先级 P2**：
- 检查 `f.fork` 在 GIA 层的编码是否正确
- 检查 DTC composite 的 impl 图是否也与参考一致

---

## 6. 关键文件索引

### 运行时/DSL

| 文件 | 职责 | 关键函数 |
|------|------|---------|
| `src/runtime/value.ts` | 值类型 + `toIRLiteral()` | `list`, `listLiteral`, `list.toIRLiteral()` |
| `src/runtime/core.ts` | 复合定义/捕获 | `createTypedValue()`, `defineComposite()`, `runCompositeCall()` |
| `src/runtime/composite_registry.ts` | 捕获 → IR JSON | `toCompositeDefIR()`, `RUNTIME_TO_GIA_TYPE`, `addOutFlowCompositePins()` |
| `src/runtime/server_globals.ts` | DSL 工厂函数 | `list()`, `assemblyList()` |
| `src/runtime/ir_builder.ts` | IR 构建器 | `buildArgument()`, `buildConnectionArgument()` |
| `src/runtime/IR.d.ts` | IR 类型定义 | `ListableValueTypeMap`, `CommonLiteralValueListTypeMap` |

### 编译器/GIA 编码

| 文件 | 职责 | 关键函数 |
|------|------|---------|
| `src/compiler/ir_to_gia_transform/composite.ts` | IR JSON → GIA | `typeClassFromValueType()`, `typeIdFromValueType()`, `argVarBaseClass()`, `argVarType()`, `buildImplNodePins()`, `buildConnPin()`, `buildPlaceholderPin()`, `buildLiteralPin()`, `getDtcInParamInfo()`, `isDataProducerNode()` |
| `src/compiler/ir_to_gia_transform/index.ts` | 主图编码 | `irToGia()`, `compositeTypeToBaseTag()`, `applyGraphVariables()`, `buildListValue()` |
| `src/compiler/ir_to_gia_transform/composite.ts` | 复合编码 | `buildCompositeAccessories()`, `buildImplGraphNodes()` |

### 第三方/节点数据

| 文件 | 职责 |
|------|------|
| `src/thirdparty/.../protobuf/gia.proto.ts` | GIA protobuf 类型（VarType, VarBase_Class 等）|
| `src/thirdparty/.../gia_gen/basic.ts` | GIA 编码辅助函数：`item_type()`, `all_value_var()`, `encode_node_graph_var()` |
| `src/thirdparty/.../gia_gen/graph.ts` | GIA 图构建：`add_graph_var()` |

### 测试

| 文件 | 内容 |
|------|------|
| `tests/composite/replicate-full-dtc.ts` | v1 复刻测试（基线，6 种 DTC 通过）|
| `tests/composite/replicate-full-dtc-v2.ts` | v2 复刻测试（列表操作复合）|
| `tests/composite/trace-dataflow.ts` | 数据流追溯工具 |
| `tests/composite/trace-exec-flow.ts` | 执行流追溯工具 |

---

## 7. 参考文件

| 文档 | 内容 |
|------|------|
| `docs/composite-ir/handover/r15-list-param-and-list-ops.md` | 原始 r15 交接（部分过时，留作参考）|
| `docs/composite-ir/handover/r16-list-param-and-list-ops-reality.md` | **本文档** |
| `docs/composite-ir/gaps/list-param-reference-analysis.md` | v2 参考文件详细分析（仍然有效）|
| `docs/composite-ir/gaps/list-param-in-composite-call.md` | 列表类型参数 gap |

### GIA 文件路径

```
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/
├── 类型转化-full-v2.gia              ← 生成文件（当前，4405 字节）
└── user_edit/
    ├── 类型转化-full.gia              ← v1 参考（DTC 全覆盖，6 种类型）
    ├── 全类型测试.gia                 ← 用户手动修复后导出的黄金标准参考
    └── (原 类型转化-full-v2.gia 已被本 session 误覆盖丢失)
```

> ⚠️ **重要提醒**：`全类型测试.gia` 是唯一可靠的参考文件。不要覆盖它。
