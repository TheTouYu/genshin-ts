# GIA 编码调试方法论：以 dataTypeConversion 修复为例

> **编写日期**：2026-07-05
> **耗时**：~6 小时，3 轮修复，跨越 5 个文件，修改 9 个 value 类
> **参考文件**：`user_edit/类型转化-full.gia`（游戏编辑器产出）
> **相关文档**：`docs/architecture/composite/gia-encoding.md`

---

## 1. 核心理念：参考文件驱动修复

GIA 编码的核心约束：**游戏只看 GIA 字节，不在乎 IR 中间表示**。

我们生成的 `.gia` 文件和游戏编辑器产出的 `.gia` 文件在同一个游戏里渲染。解码后的每一个字段都必须一致，否则游戏可能拒绝整个节点或静默忽略错误。

### 修复流程

```
decode(参考文件) → 逐字段分析 → 对比我们的产出 → 定位差异
  → 假设根因 → 改代码 → 重新生成 → 对比 → 验证
```

### 工具链

```bash
# 解码参考文件
npx tsx -e '
  import { decode_gia_file } from "..."
  const gen = decode_gia_file("参考.gia", protoPath)
  console.log(JSON.stringify(gen, null, 2))
'

# 快速检查 DTC 节点的 concreteId 和 indexOfConcrete
npx tsx -e '
  for (const a of gen.accessories ?? []) {
    if (a.which === 9) for (const n of a.graph.inner.graph.nodes) {
      if (n.genericId?.nodeId === 180) {
        console.log(`n${n.nodeIndex}: cid=${n.concreteId?.nodeId}`)
      }
    }
  }
'
```

---

## 2. GIA 编码中的三类 ID 系统

这是最容易被忽略的知识点。**每个 GIA 节点有三种不同的 ID，各自独立作用**：

| ID 系统 | GIA 字段 | 含义 | data_type_conversion 示例 |
|---------|---------|------|--------------------------|
| **类型族 ID** | `genericId.nodeId` | 节点属于哪个类型族 | 始终 `180`（`Data_Type_Conversion__Generic`） |
| **具体变种 ID** | `concreteId.nodeId` | 该节点的具体变种 | `182` = int→str, `186` = bool→str, `188` = float→str |
| **具体类型索引** | `pin.value.bConcreteValue.indexOfConcrete` | 该 pin 的具体类型在 concrete map 中的位置 | InParam: `0`=int, `3`=bool, `4`=float；OutParam: 固定 `2` |

这三者的分布在修复时必须同时在心智中追踪：

| 代码段 | 影响的 ID | 所在文件 |
|--------|----------|---------|
| `buildImplGraphNodes` 中的 `genericId` 构造 | genericId | `composite.ts` |
| `resolveImplNodeId()` 返回值 | concreteId | `composite.ts` |
| `buildImplNodePins()` / `buildConnPin()` / `wrapConcreteValue()` 中的 `indexOfConcrete` | indexOfConcrete | `composite.ts` |

**任何不匹配都会导致游戏拒绝该节点**。

---

## 3. Concrete Map：Pin 类型的真实来源

> **文件**：`node_data/concrete_map.ts`

许多节点的 pin 类型**不是**直接由 `VarType` 确定，而是通过 `indexOfConcrete` 从 `CONCRETE_MAP` 的某个类型序列中索引。

### 数据结构

```typescript
CONCRETE_MAP = {
  maps: [
    M0:  [3, 6, 1, 2, 5, 12, 4, ...],   // maps[0]
    M1:  [3, 5, 4, 6, 2, 1, 7, ...],     // maps[1]
    ...
    M16: [3, 1, 2, 4, 5, 12, 17],        // maps[16] — DTC InParam
    M17: [4, 5, 6, 3],                    // maps[17] — DTC OutParam
  ],
  pins: {
    '180:3:0': 16,  // nid=180, pinKind=3(InParam), pinIndex=0 → maps[16]
    '180:4:0': 17,  // nid=180, pinKind=4(OutParam), pinIndex=0 → maps[17]
  }
}
```

### 如何确定 pin 的 type

1. 从 `CONCRETE_MAP.pins` 中找到 `"${nid}:${pinKind}:${pinIndex}"` 对应的 map index
2. 从 `CONCRETE_MAP.maps[mapIndex]` 获取类型序列
3. 用 `indexOfConcrete` 索引该序列 → 得到 VarType 值

### DTC 示例

**InParam**（map index 16 = M16 = `[3, 1, 2, 4, 5, 12, 17]`）：

| indexOfConcrete | M16[index] | VarType | 对应 DTC 变种 |
|:--------------:|:---------:|:-------:|:------------:|
| 0 | 3 | Integer(3) | int→str |
| 1 | 1 | Entity(1) | entity→str |
| 2 | 2 | GUID(2) | guid→str |
| 3 | 4 | Boolean(4) | bool→str |
| 4 | 5 | Float(5) | float→str |
| 5 | 12 | Vector(12) | vec→str |
| 6 | 17 | Faction(17) | faction→str |

**OutParam**（map index 17 = M17 = `[4, 5, 6, 3]`）：
- 所有 DTC→str 的 OutParam 固定 `indexOfConcrete=2` → M17[2] = 6 = String

> **为什么 bool→str 的 InParam 不是 indexOfConcrete=0？**
> 因为 concrete map 的序列顺序由 vendor 定义，不是由我们决定的。`indexOfConcrete=3` 在 M16 中对应 Boolean(4)，这就是 bool→str 的正确值。

---

## 4. 管线两阶段的类型信息传递

复合节点的 GIA 编码跨越两个独立阶段。类型信息在阶段边界上的传递是最脆弱的环节。

### 阶段 A：Capture → IR JSON

**文件**：`composite_registry.ts`

```
每个 arg → 检查 meta?.kind === 'pin'?
  ├── 是 → 编码为 conn arg（保留 node_id / index / type）
  └── 否 → 调用 a.toIRLiteral()（可能丢失类型！）
```

### 阶段 B：IR JSON → GIA Protobuf

**文件**：`composite.ts`

```
resolveImplNodeId(nodeType, args):
  检查 args[0]
  ├── type === 'conn' → 从 value.type 读取输入类型
  ├── 其他 literal type → 从 arg.type 读取输入类型
  └── null / undefined → 无法推断 → 退化为 generic
```

### 传递链

```
value 对象的 toIRLiteral()
  → arg.type / arg.value.type      ← 类型信息在这里编码
    → resolveImplNodeId() 读取它   ← 在这里解码
      → nodeId (具体变种 nid)
```

**当初的错误**：最初只改了阶段 B（`buildImplNodePins` 加 conn 处理、`resolveImplNodeId` 加 conn 路径），没意识到阶段 A 中无值 typed value 的 `toIRLiteral()` 产出 `null`——类型信息在 A→B 的边界上彻底丢失。

**正确修复**：阶段 A 的 `toIRLiteral()` 必须保留类型（即使是 `{type: "int", value: null}` → 阶段 B 才能正确解析）。

---

## 5. 边缘情况检查清单

| # | 情况 | 症状 | 根因 | 修复 |
|---|------|------|------|------|
| 1 | `entity.toIRLiteral()` 总是返回有效值 | entity→str 正常，其他类型失败 | entity 的 toIRLiteral 不检查 `value === undefined`（类 Bug 也是类 Feature） | 统一修改所有 toIRLiteral 返回类型保留的 literal |
| 2 | 所有 DTC 节点 nid=180 | 类型转换在游戏中不工作 | `resolveImplNodeId` 对 conn arg 跳过查找 | 增加 conn arg 路径 |
| 3 | DTC 节点 InParam type=0 | 输入类型错误 | `buildPlaceholderPin` 无分支匹配 `data_type_conversion_*` | 用 `buildConnPin` 或 `getDtcInParamInfo` |
| 4 | genericId=concreteId 相同 | 游戏显示为"未知节点" | 参考要求 dual-ID | 分离 genericId(180) 和 concreteId(<变种>) |
| 5 | `indexOfConcrete=0` 全部相同 | 只有 int→str 能工作 | `wrapConcreteValue` 写死 0 | 从 DTC_IN_PARAM_VARTYPE_SEQUENCE 查 |
| 6 | faction 在复合内不可用 | 抛 `err_dataTypeConversionFactionMustBeWired` | 函数要求连线值 | 暂不支持（函数层限制） |

---

## 6. 修复后验证流程

```bash
# 1. 构建
npm run build

# 2. 复刻参考对比（最直接）
npx tsx tests/composite/replicate-full-dtc.ts

# 3. 10 种参数类型综合测试
npx tsx tests/composite/test-all-types-composites.ts

# 4. 快速解码检查 DTC 节点的 concreteId
npx tsx -e '
  import { decode_gia_file } from "..."
  const gen = decode_gia_file("output.gia", protoPath)
  for (const a of gen.accessories ?? []) {
    if (a.which === 9) for (const n of a.graph.inner.graph.nodes) {
      if (n.genericId?.nodeId === 180) {
        const inp = n.pins?.find(p => p.i1?.kind === 3)
        console.log(`cid=${n.concreteId?.nodeId} inType=${inp?.type} idx=${inp?.value?.bConcreteValue?.indexOfConcrete}`)
      }
    }
  }
'

# 5. 复制到游戏测试
cp output/*.gia /Beyond_Local_Export/

# 6. 回归测试
npm run quicktest
```

---

## 7. 关键文件索引

| 文件 | 职责 | 涉及数据 |
|------|------|---------|
| `src/runtime/value.ts` | 值类型的 `toIRLiteral()` | 类型信息的 Phase A 编码 |
| `src/runtime/composite_registry.ts` | 捕获 → IR JSON | args 的 conn/literal 编码 |
| `src/compiler/ir_to_gia_transform/composite.ts` | IR JSON → GIA accessories | genericId/concreteId/indexOfConcrete |
| `node_data/concrete_map.ts` | Concrete map 定义 | M16/M17 类型序列 |
| `node_data/node_id.ts` | Vendor 节点 ID 定义 | DTC 变种的 nid 映射 |
