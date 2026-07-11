# 当前架构审计

> 状态：当前实现 / 部分待验证
> 来源：当前代码实现 + `物理运动.gia` 对照
> 最近校验：2026-07-11
> 适用范围：当前工作树 Stage 3；行号会变化，以函数名为准

## 1. 当前调用链

### Root graph

```text
irToGia()
├─ expandListLiterals / timer optimization
├─ buildExecutionGraph / layoutPositions
├─ buildConnTypeIndex / buildVarsByName
├─ resolveGiaNodeId
├─ new vendor Node(concreteId)
├─ applyGetNodeGraphVariableNamePin
├─ applySpecialArgs | applyGenericArgs
├─ filterUnkPins
├─ Graph.flow / Graph.connect
├─ Graph.encode
└─ buildCompositeAccessories
```

入口：`src/compiler/ir_to_gia_transform/index.ts`。

### Composite impl

```text
buildCompositeAccessories()
├─ capture filtering / nodeIndexMap / edge rewrite
├─ buildImplGraphNodes
│  ├─ buildImplConnTypeIndex
│  ├─ resolveImplNodeId
│  ├─ resolveTypedImplNodeId 特例
│  ├─ buildImplNodePins
│  │  ├─ 少量节点临时 vendor Graph+Node
│  │  └─ 其余节点手写 literal/conn/output/flow pins
│  ├─ 手写 data connects
│  └─ 手写 flow connects
├─ computeImplLayout
└─ buildCompositePinsIndex / GraphUnit wrappers
```

入口：`src/compiler/ir_to_gia_transform/composite.ts`。

## 2. Vendor 已经提供的能力

Vendor `gia_gen/graph.ts` 中：

- `Node` 从 concrete ID 反查 generic record；
- `Node.setConcrete()` 使用 `reflectMap` 展开具体 inputs/outputs；
- `Pin.setType()` 通过 concrete map 计算 `indexOfConcrete`；
- `Pin.encode()` 根据 reflective 状态生成 concrete wrapper；
- `Node.encode()` 写 generic/concrete identity 和 pins；
- `Graph.connect()` / `Graph.flow()` 建立普通边；
- `Graph.encode()` 物化 NodeGraph。

因此 impl 手写以下内容是在重复 vendor 的 schema engine：

- `argVarBaseClass()` / `argVarType()`；
- `concreteInputIndex()` / `concreteOutputIndex()`；
- `needsConcreteWrapping()`；
- `buildConnPin()` / 普通 `buildLiteralPin()`；
- `wrapConcreteValueForNodeInput()`；
- 手写 ordinary `connects`。

## 3. 已出现的重复与漂移

| 决策 | root | impl | 风险 |
|---|---|---|---|
| typed node ID | `resolveGiaNodeId` | `resolveImplNodeId` + 特例 | setter 等 variant 漏选 |
| type suffix | `suffixFromValueType` | `valueTypeSuffix` + getter 内联副本 | 新类型只改一处 |
| output type index | vendor concrete map | 手写 `concreteOutputIndex` | concrete map 顺序错误 |
| literal value | `Pin.setVal` | `buildLiteralPin` | wrapper/metadata 漂移 |
| connected target pin | vendor Node schema | `buildConnPin` 推断 | literal 与 conn 不同 schema |
| hidden pin | root special/remap | 部分缺失/特例 | 参数错位 |
| graph edges | vendor `Graph` | 手写 `connects` | kind/index/remap 漂移 |
| variable type | `varsByName` + args | `implVariables` 只在部分 getter 使用 | getter/setter 不对称 |

## 4. `额外压力` 暴露的完整故障链

```text
runtime value: float(0)
  ↓ 类型仍存在
CompositeDefIR impl arg: type=float
  ↓
resolveImplNodeId(set_node_graph_variable)
  ↓ 未检查 args[1] typed variant
nodeId=323 generic
  ↓
buildLiteralPin(float, 0)
  ↓ 节点不在 needsConcreteWrapping 集合
裸 bFloat
  ↓
生成 GIA：generic setter + R<T> literal
```

真实结构要求 concrete Float variant `324` 及 reflective input。这个链说明：

1. DSL/runtime 表达可以正确，但 Stage 3 scope-specific lowering 仍可丢失 concrete 语义；
2. 节点 identity 与 pin wrapper 是耦合决策，不能分别靠特例猜；
3. getter 已使用 `implVariables` 生成 concrete output，setter 却未使用同一变量声明，形成读写不对称。

## 5. 当前 impl 中的“半复用”状态

`buildImplNodePins()` 已对以下节点临时创建 vendor `Graph+Node`：

- get/set local variable；
- get custom variable；
- get node graph variable。

这是有效的探索，但当前形态有三个问题：

- 复用按节点名散落在大函数中；
- typed ID 的选择仍在 vendor 之前由 impl 特例完成；
- 编码后再把 protobuf-like pins 拆出并手工挂连接，vendor graph 只使用了一半。

这证明“vendor 可用于 impl ordinary node”，但不证明“临时 Graph 整图可无条件嵌入”。后者必须实验。

## 6. 类型信息的多个来源

当前可见来源包括：

- literal `arg.type`；
- connection payload 的 `value.type`；
- root `ConnTypeIndex`；
- impl `buildImplConnTypeIndex()`；
- root/impl variables；
- composite input/output declarations；
- `implOutParamMap`；
- vendor node signatures。

问题不是完全没有类型，而是缺乏统一仲裁：

- 冲突时有些路径报错，有些路径静默选参数；
- 缺失时有些 fallback 到 generic，有些 fallback 到 int/0；
- 编码期间仍在做类型推断，无法建立 lowering 前置条件。

## 7. Root 也不是现成的共享核心

`irToGia()` 内部闭包同时承担：

- value 设置；
- hidden/null-hole patch；
- signal/list/dict 等特殊节点；
- composite call synthetic pins；
- layout；
- graph 连接；
- encoded protobuf 后处理。

因此不能把 `irToGia()` 或 `applySpecialArgs()` 直接从 impl 调用。需要先抽出：

1. scope-independent type/variant resolution；
2. ordinary vendor Node factory；
3. shared normalization rules；
4. graph materializer。

Root 和 impl 再分别提供 context 与 boundary overlay。

## 8. 高风险区域

### 高确定性

- setter typed variant 在 impl 缺失；
- type suffix、concrete index、literal/conn pin 逻辑重复；
- ordinary edge 在两 scope 使用不同实现；
- `composite.ts` 已成为普通节点 backend 与 boundary backend 的混合体。

### 需要最小实验

- `new Node(324)` 对 setter literal 的完整 encoded 字段是否逐字段匹配真实 GIA；
- vendor `Graph.connect()` 是否为 impl 产生预期 target-only connects；
- 临时 Graph 提取 NodeGraph 是否引入/丢失 impl 所需字段；
- generic/concrete identity 在 `323`（Int variant 与 generic ID 数值相同）时如何稳定断言；
- output pin、local variable hidden pin、signals 等 root normalization 是否应全局共享。

## 9. 审计结论

当前复合实现的核心架构错误不是“没有调用一个主图函数”，而是：

> Composite impl 被建模为另一种节点编码格式，而不是同一种普通图在另一个 scope 中的实例。

重构必须先建立统一的 resolved contract，再让 vendor 成为普通节点 schema 的唯一物化器；否则只是把
`resolveImplNodeId()` 的特例搬到另一个文件。
