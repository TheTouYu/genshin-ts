# 复合节点全场景潜在问题推演

通过横纵扩展分析，推演出当前实现尚未覆盖的 6 类问题。

## 推演方法

- **横向**：从已修复的 bug 模式（bConcreteValue 缺失、OutParam 遗漏、多输入映射、connected null value、占位符类型推断）出发，搜索代码库中同类 silent-fallback 模式
- **纵向**：核心原则——「类型擦除边界上的 fallback 宁可 loudly fail 也不要 silently produce garbage」

## 问题 1: nested composite（嵌套复合）

**场景**：复合 A 的 `build()` 内部调用 `f.callComposite(B, {})`

**现状**：
- `toCompositeDefIR` 将捕获流中的 ALL exec/data nodes 写入 `implNodes`，包括 `__composite_call__` 标记节点
- `composite.ts:buildImplGraphNodes` 没有处理 `__composite_call__` 的逻辑
- `resolveImplNodeId('__composite_call__')` 返回 0 → 生成 nodeId=0 的空壳 GIA 节点
- `compositePins` 计算时虽跳过 `__composite_call__`（line 132），但节点本身仍出现在 impl graph 中

**影响**：嵌套复合的 impl graph 会包含无效的 nodeId=0 节点，游戏可能无法解码

**涉及文件**：
- `src/runtime/composite_registry.ts` line 180-183（implNodes 过滤）
- `src/compiler/ir_to_gia_transform/composite.ts` `buildImplGraphNodes`（需处理 `__composite_call__` 类型 → 创建 SysGraph node）

**参考**：主图中 `__composite_call__` 的处理逻辑在 `index.ts` line ~510，可供 impl graph 内借鉴

---

## 问题 2: 数据节点类型覆盖不全

**现状（Phase 2 改进）**：已新增 `isDataProducerNode()` 函数，覆盖 `concreteWrappedNodeTypes` + `data_type_conversion_*` + `get_*` 查询节点。但以下仍未覆盖：
- `_3d_vector_*` (vec3 类型)
- `bitwise_*`, `logarithm_*`, 三角函数
- `assembly_list`, `assembly_dictionary`

**涉及文件**：`src/compiler/ir_to_gia_transform/composite.ts` — `isDataProducerNode()`, `concreteWrappedNodeTypes`

---

## 问题 3: buildPlaceholderPin 类型推断不完整

**场景**：捕获时占位符因 `value=undefined` 触发 `buildPlaceholderPin`，需要从 nodeType 推断 VarBase class/type

**现状**：
- `buildPlaceholderPin` 对 `concreteWrappedNodeTypes` 中的节点全部推断为 `IntBase`
- 但以下节点类型产出不同类别：
  - **FloatBase**: `absolute_value_operation`, `logarithm_operation`, `_3d_vector_dot_product`, 三角函数 等 15 个
  - **EnumBase (bool)**: `equal`, `greater_than`, `logical_and_operation`, `query_if_*` 等 18 个
  - **VectorBase (vec3)**: `_3d_vector_addition`, `create3d_vector` 等 10 个
  - **StringBase**: `get_player_nickname` 等 3 个
  - **IdBase**: `get_self_entity`, `get_owner_entity` 等 entity/guid 返回节点

**影响**：float-producing 节点被标记为 IntBase → 类型不匹配，game 端可能出错

**涉及文件**：`src/compiler/ir_to_gia_transform/composite.ts` — `buildPlaceholderPin` 函数

**建议**：建立 nodeType → outputType 映射表，或从捕获数据中提取更精确的类型信息

---

## 问题 4: makeVarBaseValue 缺少 EnumBase/VectorBase/IdBase

**场景**：`buildImplNodePins` 中 OutParam pin 构建，以及 `buildPlaceholderPin` 中占位值构建

**现状**：`makeVarBaseValue` 只处理 IntBase/FloatBase/StringBase，缺少：
- EnumBase → `bBool: { val: false }`
- VectorBase → `bVector: { val: {x:0,y:0,z:0} }`  
- IdBase → 仅 class+itemType，无特定字段

**影响**：bool/vec3/entity 类型的输出 pin 缺失对应的值字段

**涉及文件**：`src/compiler/ir_to_gia_transform/composite.ts` — `makeVarBaseValue` 函数

---

## 问题 5: Normal → Composite 数据流

**现状（Phase 2 改进）**：impl 图内部数据连线已修复（toIRLiteral pin metadata → conn 序列化）。主图中普通节点输出 → 复合输入的数据流经 `layout.ts` 的 `toIndex - 1` 修正，**仍待实际测试验证**。

---

## 问题 6: 空复合 / 无输入无输出复合

**场景**：`defineComposite` 定义了一个无 inputs 无 outputs 无 exec 的纯数据复合

**现状**：`toCompositeDefIR` 中 `inputList.length === 0` 且 `outputList.length === 0` 且 `hasExec === false` → inflows/outflows/inputs/outputs 全空，compositePins 为空，implNodes 可能为空

**影响**：不确定，需验证

---

## 优先级建议

| 优先级 | 问题 | 理由 |
|--------|------|------|
| P0 | 问题 2: concreteWrappedNodeTypes 覆盖不全 | 直接影响现有功能，添加一个 vec3 节点就会触发 |
| P0 | 问题 3/4: 类型推断 + makeVarBaseValue 缺失类型 | 同上，float/bool 节点会静默产生错误类型 |
| P1 | 问题 1: nested composite | 核心功能缺失，但当前无嵌套用例 |
| P2 | 问题 5: Normal→Composite 数据流 | layout.ts 已修正，待验证 |
| P3 | 问题 6: 空复合 | 边缘 case |

## 验证方法

对每个场景编写最小测试脚本（参考 `tests/composite/` 下的现有测试），生成 GIA 后用 `tests/composite/gia-diff.ts -c` 与参考文件对比。
