# Session 交接：嵌套复合节点（完整版）

> **目标轮次：** r13
> **前置依赖：** [r12-nested-composite-pipeline.md](./r12-nested-composite-pipeline.md)
> **参考文件：** `user_edit/嵌套.gia`（游戏编辑器产出）
> **当前状态：** 基础嵌套管线已打通，三层复合可生成并经过工具验证

---

## 1. 已实现功能

### 1.1 嵌套复合管线

```
复合A.build() → f.callComposite(B, { inputs })  →  B 的 impl 嵌入 A 的 impl
                    ↓
          B 的 CompositeDef + implGraph → accessories
```

- 三层嵌套（加法 → 乘法 → 嵌套运算）捕获 ✅
- 嵌套复合的 GIA 编码 ✅
- 复合定义（`which=12`）+ impl 图（`which=9`）成对生成 ✅
- 主图 `callComposite` 节点编码 ✅

### 1.2 impl 图中 composite_call 节点

| 特性 | 状态 | 参考 |
|------|------|------|
| `kind=22001 (SysGraph)` | ✅ | 替代普通节点的 `22000 (SysCall)` |
| `nodeId = 被调复合的 def.id` | ✅ | 用于定位 CompositeDef |
| 内部数据连线（call 间） | ✅ | `connects` 数组引用上游节点 OutParam |
| 引脚 `compositePinIndex` | ✅ | 匹配被调复合的 `pinIndex` |
| 空引脚（由 compositePins 路由） | ✅ | 不创建物理 pin |

### 1.3 跨复合数据流

- `compositeDataEdges` 正确记录调用间数据依赖 ✅
- GIA 编码后数据连接正确 ✅
- `trace-dataflow` 可穿透复合边界（`⤷` 标记） ✅

### 1.4 工具验证

| 工具 | 用途 | 状态 |
|------|------|------|
| `trace-exec-flow.ts` | 执行流可视化 | ✅ |
| `trace-dataflow.ts` | 数据流追溯 | ✅ 穿透复合边界 |
| `decode-gia.ts` | 解码为 JSON | ✅ |
| `analyze-nested-composites.ts` | 嵌套分析 | ✅ |
| `test-composite-all.ts` | 回归测试 78/80 | ✅（2 @pending_ref） |

---

## 2. 已发现并修复的问题

| # | 问题 | 文件 | 修复 |
|---|------|------|------|
| 1 | Phase B 只扫描主图 `__composite_call__`，不递归 | `core.ts` | 添加 BFS 递归展开 calledIds |
| 2 | InParam compositePins 跳过 `__composite_call__` 节点 | `composite_registry.ts` | 移除此跳过条件 |
| 3 | compositePins 的 `innerPinIndex` 偏移 1（compositeId） | `composite_registry.ts` | 对 `__composite_call__` 减去 1 |
| 4 | impl 图 `__composite_call__` 节点编码不全 | `composite.ts` | 改为 `SysGraph` kind + 子复合 ID + 连线 |
| 5 | impl GraphUnit 缺少 `relatedIds` | `composite.ts` | 扫描 implNodes 填充子复合引用 |
| 6 | 主图缺少 `data_type_conversion` → 复合输出断连 | 测试代码 | 用 `f.dataTypeConversion()` 替代字符串拼接 |
| 7 | `bBool` 应为 `bEnum`（protobuf 字段名错误） | `composite.ts` | `buildLiteralPin` + `makeVarBaseValue` 改为 `bEnum` |
| 8 | `makeVarBaseValue` 缺少 `EnumBase`/`IdBase` 处理 | `composite.ts` | 添加对应分支 |

---

## 3. 当前已知差异（不修复的）

| 项 | 参考值 | 我们的值 | 原因 |
|----|--------|---------|------|
| `graphId.id` | = def.id | = def.id + 10000 | 内部一致即可 |
| `pinIndex` | 28,35,37,36 | 100,101,102,200 | 自动生成 |
| 主图 composite_call OutParam | 无（compositePins 路由） | 有（物理 pin） | 游戏可能忽略多余 pin |
| 节点索引 | 1,5,6 | 2,3,4 | capture 节点过滤后偏移 |
| 复合 ID | 16106127xx | 1610700xxx | 不同分配器 |

---

## 4. 核心架构

### 4.1 数据流

```
defineComposite(name, { inputs, outputs, build })
  → CompositeHandle (registry 注册)
  → Phase A: buildServerGraphRegistriesIRDocuments()
    → 对每个未捕获的复合
      → createTypedValue(inputs)  // 输入占位符
      → def.build(inputs, fns)    // 执行 build → 捕获内部节点
      → f.callComposite(sub, ...) // 触发 runCompositeCall → 标记 __composite_call__
    → 存储 captured { execNodes, dataNodes, edges, outputValues }
  → toCompositeDefIR()
    → compositePins 计算
    → implNodes / implEdges / compositePins
  → Phase B: 递归展开 calledIds → 附加 compositeDefs + compositeDataEdges
  → irToGia()
    → 主图节点编码
    → buildCompositeAccessories() → CompositeDef + impl NodeGraph
```

### 4.2 关键文件

| 文件 | 职责 | 关键函数 |
|------|------|---------|
| `src/runtime/core.ts` | 捕获管线 IL | `buildServerGraphRegistriesIRDocuments()`, `runCompositeCall()` |
| `src/runtime/composite_registry.ts` | 复合注册 + IR 生成 | `toCompositeDefIR()`, `addOutFlowCompositePins()` |
| `src/compiler/ir_to_gia_transform/composite.ts` | CompositeDef + impl 编码 | `buildCompositeAccessories()`, `buildImplGraphNodes()`, `buildImplNodePins()`, `computeImplLayout()` |
| `src/compiler/ir_to_gia_transform/index.ts` | 主图编码 | `irToGia()` — `__composite_call__` 主图节点处理 |
| `src/compiler/ir_to_gia_transform/mappings.ts` | 节点 ID 映射 | `SPECIAL_NODE_IDS`, `NODE_ID_LOWER` |
| `src/compiler/ir_to_gia_transform/layout.ts` | 主图布局 | 数据连接修正 |

---

## 5. VarBase 值字段完整映射

protobuf 中 `VarBase.oneof baseValues` 的字段名：

| VarBase Class | 枚举值 | 字段名 | proto 行号 | makeVarBaseValue | buildLiteralPin |
|--------------|--------|--------|-----------|-----------------|-----------------|
| `IdBase` | 1 | `bId` | 101 | ✅ 已覆盖 | ✅ |
| `IntBase` | 2 | `bInt` | 102 | ✅ | ✅ |
| `FloatBase` | 4 | `bFloat` | 104 | ✅ | ✅ |
| `StringBase` | 5 | `bString` | 105 | ✅ | ✅ |
| `EnumBase` | 6 | **`bEnum`** | **106** | ✅ **注意不是 bBool!** | ✅ |
| `VectorBase` | 7 | `bVector` | 107 | ✅ | ✅ |
| `StructBase` | 10001 | `bStruct` | 108 | ❌ 未覆盖 | ❌ |
| `ArrayBase` | 10002 | `bArray` | 109 | ❌ 未覆盖 | ❌ |
| `MapBase` | 10003 | (暂无) | - | ❌ 未覆盖 | ❌ |

> **注意**：`FloatBase=4` 而不是 3，VarBase.Class 枚举值不连续。

---

## 6. 测试指南

### 6.1 现有测试

```bash
# 完整回归（78/80）
npm run quicktest
npx tsx tests/composite/test-composite-all.ts

# 嵌套复合专项测试
npx tsx tests/composite/nested-layout-test.ts    # 3 层纯数据 + 数据复合调用
npx tsx tests/composite/nested-exact-test.ts     # 精确复刻参考 嵌套.gia
npx tsx tests/composite/nested-compare-test.ts   # 与 嵌套.gia 结构对比

# 工具链验证
npx tsx tests/composite/trace-exec-flow.ts output/nested_exact.gia
npx tsx tests/composite/trace-dataflow.ts output/nested_exact.gia --list-nodes
npx tsx tests/composite/trace-dataflow.ts output/nested_exact.gia <n> --all-params --composite=<name>
npx tsx tests/composite/analyze-nested-composites.ts output/nested_exact.gia
```

### 6.2 测试流程

```
1. defineComposite() 定义复合
2. g.server().on('event', handler) 主图
3. buildServerGraphRegistriesIRDocuments() → IR
4. irToGia() → .gia
5. decode_gia_file() → JSON
6. trace-exec-flow / trace-dataflow 验证
7. 复制到游戏目录 Beyond_Local_Export/ 游戏编辑器测试
```

---

## 7. 下一步工作（按优先级）

### P0：更多数据类型

- [ ] StructBase(10001) — `bStruct` 字段支持
- [ ] ArrayBase(10002) — `bArray` 字段支持  
- [ ] MapBase(10003) — 字典类型的 composite 输入/输出
- [ ] `*_list` 类型的复合输入参数

### P1：更深嵌套

- [ ] 4 层以上嵌套测试
- [ ] 多层复合调用数据链路追踪
- [ ] 循环引用检测

### P2：更多节点组合

- [ ] exec 复合内嵌套纯数据复合
- [ ] 纯数据复合内嵌套 exec 复合（混合类型）
- [ ] 信号复合嵌套
- [ ] 多个子复合调用间的复杂数据流（扇入/扇出）

### P3：稳定性

- [ ] 移除 `@pending_ref` 标记，补充 GIA 参考文件对比
- [ ] 大批量复合（100+）压力测试
- [ ] 内存泄漏检查（registry 清理）
- [ ] 异常复合定义错误处理

### P4：工具链

- [ ] `trace-dataflow` 支持穿透 expand 后的复合内部节点
- [ ] GIA 差异可视化工具

---

## 8. 常见陷阱

1. **`bEnum` vs `bBool`**：protobuf 字段名是 `bEnum`（`gia.proto:106`），写 `bBool` 会被静默忽略
2. **`makeVarBaseValue` 类型覆盖**：新增类型必须在此函数添加对应字段，否则默认值丢失
3. **`relatedIds`**：impl GraphUnit 的 `relatedIds` 必须包含所有被调子复合的 ID，否则游戏显示空壳
4. **测试 vs 编译器代码**：先确认问题出在哪一层。主图连接问题通常在测试代码（缺 `dataTypeConversion`）
5. **工具验证**：`trace-exec-flow` + `trace-dataflow` 的输出应与参考完全一致（包括分支名、引脚数）
6. **protobuf 字段枚举值不连续**：`FloatBase=4`，不是 3；`EnumBase=6`，不是 3

---

## 9. 文档索引

| 文档 | 内容 | 位置 |
|------|------|------|
| GIA 编码完整参考 | CompositeDef/impl 结构、VarBase 映射 | `docs/architecture/composite/gia-encoding.md` |
| 嵌套复合指南 | Pin 编码规则、compositePins | `docs/architecture/composite/composite-nested-composite-guide.md` |
| 管线流程 | Phase A/B 流程 | `docs/architecture/composite/pipeline-flow.md` |
| IR 表示 | 中间表示格式 | `docs/architecture/composite/ir-representation.md` |
| 捕获机制 | 复合捕获时序 | `docs/architecture/composite/capture-mechanism.md` |
| 验证基础 | 复合节点结构验证 | `docs/composite-ir/03-validation-basics.md` |
| GIA 编码验证 | 嵌套复合节点验证 | `docs/composite-ir/05-gia-encoding.md` |
