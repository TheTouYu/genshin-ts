# 复合节点与普通系统节点复用审计

> 状态：当前推荐 / 待验证
> 来源：当前代码实现 + 第六轮自动验证与用户游戏内反馈 + 架构审计
> 最近校验：2026-07-10
> 适用范围：gsts 当前 Stage 3 复合节点实现；真实编辑器输出仍需以 composite-ir 真实 GIA 验证文档为准

本文档记录第六轮 `all-types` 复合验证后形成的架构判断：复合节点的目标不是为每个暴露问题逐个补丁，而是让复合 impl 图尽可能复用普通系统节点的 Stage 3 编码能力，并把不能复用的部分显式列入差距表、测试矩阵和重构路线。

相关入口：

- [GIA 编码](./gia-encoding.md) — 当前 `CompositeDefIR` 到 GIA accessories 的编码细节。
- [管线追踪](./pipeline-flow.md) — 复合定义与调用流经三阶段的过程。
- [测试体系](./testing.md) — 复合测试现状与后续测试矩阵。
- [第六轮 handover](../../composite-ir/handover/v2-composite-validation-round-6.md) — 触发本审计的历史记录。
- [第七轮 handover](../../composite-ir/handover/v2-composite-validation-round-7.md) — Phase 1 类型映射统一的当前交接。

---

## 1. 背景：第六轮暴露的问题不是单点 list bug

第六轮将普通 `f.*` 系统节点 API 自动包入 `g.defineComposite(... build ...)`，用来验证复合节点 impl 理论上是否能承载普通节点能力组合。

已验证现象：

1. `core` profile 可通过普通编译链路，并由用户反馈可在游戏内导入打开。
2. `collections` profile 在普通编译链路可生成 `.gia`，但用户反馈数据结构操作参数类型严重错误。
3. 对比 `.gs.ts` 和 IR JSON 后确认：Stage 1、Stage 2 保留了正确类型，例如 `config_id_list` 没有丢失。
4. 错误集中在 Stage 3 composite impl GIA encoding：普通主图同类节点 pin 类型正确，而 composite impl 中部分 list pin 被编码为 `0`。

因此，问题的价值不在于补齐几个类型 case，而在于证明当前架构存在更深层的“双路径分叉”：

> 普通系统节点和 composite impl 节点在 Stage 3 并未共享同一套节点 ID、pin 类型、字面量、连接和特殊节点编码逻辑。

---

## 2. 当前实现的复用分层

### 2.1 API 层：复用较高

用户面上，普通主图和复合 build 都调用同一套 `f.*` API：

```ts
f.assemblyList(...)
f.concatenateList(...)
f.getListLength(...)
f.add(...)
```

这说明 runtime DSL 层已经具备“把普通系统节点组合进复合定义”的基本形态。

### 2.2 IR 层：复用中等偏高

第六轮验证表明，Stage 2 capture 后的 `CompositeDefIR.implNodes` 仍保留普通节点类型、参数类型和连接信息。也就是说，复合捕获并没有把 `config_id_list` 等类型提前破坏。

### 2.3 GIA 编码层：复用偏低

普通主图路径主要使用 vendor `Graph` / `Node` / `Pin` 编码能力；composite impl 路径则在 `src/compiler/ir_to_gia_transform/composite.ts` 中大量手写 proto object。

这导致：普通主图已经能正确编码的系统节点能力，在 composite impl 中仍可能因手写映射不完整而失败。

---

## 3. 两条 Stage 3 编码路径

### 3.1 普通主图路径

普通系统节点大致经过：

```text
IRNode
  -> resolveGiaNodeId(...)
  -> new Node(...)
  -> vendor Pin / Graph API
  -> setLiteralArgValue(...) / setEnumArgValue(...)
  -> graph.flow(...) / graph.connect(...)
  -> graph.encode()
```

关键文件：

- `src/compiler/ir_to_gia_transform/index.ts`
- `src/compiler/ir_to_gia_transform/node_id.ts`
- `src/compiler/ir_to_gia_transform/pins.ts`
- `src/compiler/gia_vendor.ts`

### 3.2 Composite impl 路径

复合 impl 节点大致经过：

```text
CompositeDefIR.implNodes
  -> resolveImplNodeId(...)
  -> buildImplNodePins(...)
  -> argVarType(...) / argVarBaseClass(...)
  -> buildLiteralPin(...) / buildConnPin(...) / buildPlaceholderPin(...)
  -> makeVarBaseValue(...) / wrapConcreteValue(...)
  -> 手写 pin.connects
  -> accessory GraphUnit proto
```

关键文件：

- `src/compiler/ir_to_gia_transform/composite.ts`

### 3.3 已复用与未复用

| 能力 | 普通主图路径 | composite impl 当前状态 | 风险 |
|---|---|---|---|
| 用户 API | `f.*` | 同一套 `f.*` build API | 低 |
| IR 节点与 args | `IRNode` | `CompositeDefIR.implNodes`，语义接近 | 中 |
| 节点 ID 解析 | `resolveGiaNodeId`，含 typed/dict/enum/mode 推断 | `resolveImplNodeId` 简化版 | 高 |
| literal pin 编码 | vendor `Pin.setType` / `Pin.setVal` + `pins.ts` | 手写 VarBase / VarType / value object | 高 |
| enum 参数 | `setEnumArgValue` + `parseEnumValue` | 未形成统一复用路径 | 高 |
| list/dict 类型 | 普通路径覆盖更完整 | 手写映射容易遗漏 | 高 |
| bConcreteValue 包裹 | vendor 与普通路径逻辑 | `concreteWrappedNodeTypes` 等硬编码 | 高 |
| data connect | `graph.connect` | 手写 `pin.connects` | 中 |
| exec flow | `graph.flow` | 手写 OutFlow connects | 中 |
| hidden pin / index remap | 普通路径处理 | composite impl 覆盖不完整 | 中/高 |
| layout | 共享部分 layout 函数 | impl 有独立适配 | 中 |
| vendor 编码复用 | 主路径默认使用 | 目前主要仅 `get_node_graph_variable` 有临时复用尝试 | 高 |

---

## 4. 当前主要分叉点

### 4.1 类型映射分叉

当前同一概念“IR 类型字符串到 GIA 类型”的映射散落在多处：

- `composite.ts`
  - `argVarType`
  - `argVarBaseClass`
  - `typeIdFromValueType`
  - `typeClassFromValueType`
- `pins.ts`
  - `toVendorBaseTag`
  - `setLiteralArgValue`
- `node_id.ts`
  - typed node suffix 推断
- `index.ts`
  - composite call/interface 相关类型转换

第六轮失败就是这种分叉的直接结果：普通路径已经能编码 `config_id_list`、`prefab_id_list`、`faction_list` 等类型，而 composite impl 的某个手写映射遗漏后落到 `0`。

### 4.2 节点 ID 推断分叉

普通路径 `resolveGiaNodeId(...)` 会根据参数、连接、变量、字典 key/value、枚举类型和 runtime mode 推断具体节点 ID。

composite impl 的 `resolveImplNodeId(...)` 当前是简化版，只覆盖 special ID、部分 `data_type_conversion_*` 和 direct/generic fallback。后续即使修复 list pin type，仍可能在 typed dictionary、variable、enum、list assembly 等节点上选择错误 concrete node ID。

### 4.3 Pin 编码分叉

普通路径依赖 vendor `Pin` 对象：

```text
new Pin(...)
pin.setType(...)
pin.setVal(...)
```

composite impl 直接构造 protobuf-like object：

```text
{ i1, i2, value, type, connects }
```

这要求 `composite.ts` 自己知道 `VarBase_Class`、`VarType`、`itemType`、`bConcreteValue`、`indexOfConcrete`、bool/enum、ID 类型、vec3、list 等所有编码细节。长期维护风险很高。

### 4.4 特殊节点处理分叉

普通路径已有针对 list、dict、enum、signal、variable、hidden pin 等特殊节点的逻辑。composite impl 只覆盖其中一部分，导致 `core` 能通过并不代表 collections、enum、dict、signal、variable 等类别也可靠。

---

## 5. 架构原则

后续复合节点修复应遵循以下原则：

> 复合节点不是普通系统节点的第二套实现。复合节点应是普通系统节点 IR 子图的包装与路由层。

复合节点可以有自己的：

- `CompositeDef`；
- `__composite_call__` marker；
- `compositePins`；
- InFlow / OutFlow routing；
- accessories / impl graph packaging。

但不应长期拥有自己的：

- IR 类型到 VarType 的独立映射；
- typed system node ID 推断；
- enum literal 编码；
- list/dict item type 编码；
- bConcreteValue 包裹规则；
- hidden pin remap 规则；
- 普通 data/exec connect 语义。

这些应尽可能归入普通系统节点编码层，由普通主图和 composite impl 共用。

---

## 6. 分阶段路线与当前进度

### 当前进度快照（2026-07-09）

| 阶段 | 状态 | 说明 |
|---|---|---|
| Phase 0：建模与文档入口 | 已完成 | 本文档已成为整体入口，`documentation-map.md`、`gia-encoding.md`、`testing.md`、handover README 已指向本审计。 |
| Phase 1：统一类型映射 | 已完成核心收口 | 已新增 `src/compiler/ir_to_gia_transform/vartype_map.ts`，并让 `composite.ts`、`pins.ts`、`node_id.ts`、`index.ts` 复用共享映射；`composite.ts` 中的类型映射 wrapper 已删除。 |
| Phase 1 验证 | 已自动验证 | `npm run build`、L0 `assert-vartype-map.ts`、`list-type-ops-smoke.gia`、`assert-list-type-ops-smoke.ts` 已通过；collections literal/wire 仍可作为大集成生成验证。 |
| L1 对照测试 | 已建立 / 当前样本严格通过 | 新增 `system-node-reuse-smoke.ts` 与 `compare-system-node-reuse.ts`，覆盖 `assembly_list/get_list_length`、`concatenate_list`、`addition/equal`；已修 `get_list_length` OutParam、list pin `ConcreteBase(ArrayBase)` 包裹、`equal` bool 输出和 int `addition/equal` concrete index。2026-07-10 起 `assembly_list` 改为复用 vendor 完整 pin 形状，当前样本 `--strict` 已通过。 |
| Phase 2：统一节点 ID 推断 | 未全面开始 / 局部补强 | 下一阶段重点，目标是 composite impl 复用普通路径 `resolveGiaNodeId` 或抽出的共享解析逻辑。当前仅为 `assembly_list` 在 impl 路径补了按首个元素类型选择 typed node ID 的局部逻辑。 |
| Phase 3：扩大 vendor 编码复用 | 已启动 | `assembly_list` 已改用临时 `Graph + Node + encode` 提取 vendor pins；`get_node_graph_variable` 的既有临时 vendor pin 生成也被整理为同一 helper。后续继续扩大到 dict/enum/signal/variable 等高风险节点。 |

### Phase 0：暂停止血，把问题先建模

本阶段不急于补齐 `argVarType` 的遗漏 case，而是先完成本文档和测试/审计入口，让后续修复不再被描述为“某几个 list 类型 bug”。

验收：

- 本文档成为当前推荐入口；
- `documentation-map.md`、`gia-encoding.md`、`testing.md` 指向本审计；
- 第六轮 handover 在索引中标记为架构审计触发点，而非仅“下一轮修 list”。

### Phase 1：统一类型映射

当前已新增共享模块：

```text
src/compiler/ir_to_gia_transform/vartype_map.ts
```

已集中提供：

```ts
irTypeToVarType(type)
irTypeToVarBaseClass(type)
irTypeToVendorBaseTag(type)
irTypeToNodeSuffix(type)
irScalarTypeToNodeType(type)
irTypeToNodeType(type)
isListType(type)
listElementType(type)
```

已接入位置：

- `composite.ts`：CompositeDef interface、impl pin 类型、`get_node_graph_variable` suffix 推断已直接使用共享模块；旧的 `argVarType`、`argVarBaseClass`、`typeIdFromValueType`、`typeClassFromValueType` wrapper 已删除。
- `pins.ts`：删除本地 `toVendorBaseTag`，改用 `irTypeToVendorBaseTag`。
- `node_id.ts`：`suffixFromValueType` 改用 `irTypeToNodeSuffix`。
- `index.ts`：`baseNodeType`、`valueTypeToNodeType`、`compositeTypeToBaseTag` 改用共享模块。

已覆盖 round-6 的关键 list 类型缺口：

| IR 类型 | VarType |
|---|---:|
| `vec3_list` | `VectorList = 15` |
| `config_id_list` | `ConfigurationList = 22` |
| `prefab_id_list` | `PrefabList = 23` |
| `faction_list` | `FactionList = 24` |

已验证：

```bash
npm run build
npx tsx tests/composite/v2/all-types/assert-vartype-map.ts
node bin/gsts.mjs tests/composite/v2/all-types/list-type-ops-smoke.ts || true
npx tsx tests/composite/v2/all-types/assert-list-type-ops-smoke.ts \
  dist/tests/composite/v2/all-types/list-type-ops-smoke.gia
node bin/gsts.mjs tests/composite/v2/all-types/system-node-reuse-smoke.ts || true
npx tsx tests/composite/v2/all-types/compare-system-node-reuse.ts \
  dist/tests/composite/v2/all-types/system-node-reuse-smoke.gia
```

其中 `node bin/gsts.mjs ... || true` 是因为当前环境的游戏 LocalLow/保存目录检测会在 `.gia` 生成后报路径问题，不影响本轮自动编码验证。

已收口目标：

- 新增 L0 `assert-vartype-map.ts`，直接断言所有 scalar/list 映射。
- 去掉 `composite.ts` 中仍保留的兼容 wrapper，让调用点直接使用共享函数。
- 所有 scalar/list 类型有一套权威测试。
- L1 诊断入口已能显示主图与 composite impl 的 pin/value 编码差距；已根据诊断修复 `get_list_length` OutParam 类型、list pin `ConcreteBase(ArrayBase)` 包裹、`equal` bool 输出和 int `addition/equal` concrete index。
- 2026-07-10 起，当前 L1 样本中的 `assembly_list` 剩余差异已通过 vendor 完整 pin 生成消除，`compare-system-node-reuse.ts --strict` 已通过。注意这只证明当前 L1 样本严格同构，不代表所有系统节点已完整复用。

### Phase 2：统一节点 ID 推断

目标是让 composite impl 节点调用普通路径的 `resolveGiaNodeId(...)` 或抽出的共享纯函数。

需要为 impl 图构造局部上下文：

- impl node list；
- impl data edges；
- impl variables；
- conn type index；
- runtime mode。

这样 typed list/dict/variable/enum/conversion 节点的 concrete node ID 推断才能和普通主图一致。

### Phase 3：扩大 vendor 编码复用

当前 `get_node_graph_variable` 已经使用临时 `Graph + Node + encode` 提取 vendor pins 的方式，是值得扩展的方向。

当前进展（2026-07-10）：

- `src/compiler/ir_to_gia_transform/composite.ts` 新增 `encodeVendorNodePins(...)`，集中复用临时 `Graph + Node + encode` 的 vendor pin 生成模式。
- `get_node_graph_variable` 的既有临时 vendor pin 生成逻辑改为调用该 helper。
- `assembly_list` 改为调用该 helper，生成 vendor 完整 InParam/OutParam pin 集合（包括固定 100 个元素 pin、`ConcreteBase` 包裹和 `indexOfConcrete`），只在返回后补 composite impl 的 data connects。
- `resolveImplNodeId` 为 `assembly_list` 增加按首个元素/连接类型选择 typed node ID 的局部逻辑，避免非 int list 继续落到 generic/int 变种。
- 已自动验证：`compare-system-node-reuse.ts --strict` 对当前 L1 样本通过；`assert-list-type-ops-smoke.ts` 仍通过。

优先尝试复用 vendor pin 生成的类别：

1. list 节点：`assembly_list`、`concatenate_list`、`list_iteration_loop` 等；
2. dict 节点：`assembly_dictionary`、`create_dictionary`、query/set/remove/sort 等；
3. concrete-wrapped 节点：数学、比较、类型转换；
4. vec3 节点：创建、拆分、运算。

长期目标：

```text
buildImplNodePins = dispatcher
  ├─ 普通系统节点：走共享/vendor 编码
  └─ composite-only marker：保留手写
```

### Phase 4：测试矩阵从“能生成”升级为“与普通路径等价”

不再只验证 `.gia` 能否生成或导入，而要比较普通主图和 composite impl 对同一个系统节点调用的编码差异。

---

## 7. 复用率/差距度量表

对每个 `f.*` 方法，建议记录以下维度：

| 维度 | 问题 | 状态值 |
|---|---|---|
| API 调用 | composite build 是否能调用同名 `f.*`？ | pass/fail |
| IR 捕获 | implNodes args/output/edges 是否保留普通语义？ | pass/fail/unknown |
| Node ID | impl concrete node ID 是否等于普通路径？ | same/different/unknown |
| InParam 类型 | `pin.type` / `itemType` 是否一致？ | same/different/unknown |
| Literal value | 字面量 value 编码是否一致？ | same/different/unknown |
| OutParam 类型 | 输出 pin 类型是否一致？ | same/different/unknown |
| Data connect | data edge index/connect 是否一致？ | same/different/unknown |
| Exec connect | flow edge 是否一致？ | same/different/unknown |
| Special args | hidden/count/enum/signal 等特殊逻辑是否一致？ | same/different/unknown |
| 自动验证 | 是否有脚本断言？ | yes/no |
| 游戏内导入 | 是否有用户或人工导入反馈？ | pass/fail/unknown |
| 游戏内运行 | 行为是否等价？ | pass/fail/unknown |

最终可以为每个方法标注：

```text
fully reused / partially reused / manually encoded / unknown / failing
```

---

## 8. 测试矩阵建议

### L0：类型映射测试

覆盖 scalar 与 list：

```text
bool/int/float/str/vec3/guid/entity/prefab_id/config_id/faction
bool_list/int_list/float_list/str_list/vec3_list/guid_list/entity_list/prefab_id_list/config_id_list/faction_list
```

断言：

- VarType；
- VarBase_Class；
- vendor base tag；
- node suffix；
- list element type。

### L1：普通主图 vs composite impl 对照测试

对同一 `f.*` 调用生成：

1. 普通主图节点；
2. composite impl 内节点。

decode 后比较：

- node ID；
- InParam pin type；
- OutParam pin type；
- literal value；
- data connects；
- exec connects。

### L2：list 全类型 × list 全操作

继续第六轮 `list-type-ops-smoke.ts` 方向，覆盖 10 种 list element type 与所有 list 操作。断言脚本需要区分原始 list consumer 与 `searchListAndReturnValueId` 返回的 `int_list` consumer。

### L3：dict key/value 矩阵

覆盖常见 key/value 组合，重点检查：

- typed dict node ID；
- key/value pin type；
- keys/values list output type；
- sort/query/remove/set 操作。

### L4：CompositeDef interface pin 类型

独立检查 `CompositeDef.inputs[]` / `outputs[]` 的类型定义，特别是 list 类型不应退化为 scalar VarType。

### L5：enum / signal / variable / event 节点

这些类别依赖普通路径较多特殊逻辑，必须单独验证：

- enum literal 与 enum typed node；
- signal payload；
- local/custom/node graph variable；
- typed event/change event。

### L6：游戏内验证

自动断言通过后，再导出少量代表 `.gia` 给用户游戏内导入/打开/运行验证。不要把自动编译成功等同于游戏内等价。

---

## 9. 当前已知风险

| 风险 | 影响 | 优先级 |
|---|---|---|
| composite impl 类型映射遗漏 | pin.type 变成 `0`，编辑器或运行时参数错误 | P0 |
| CompositeDef interface list 类型错误 | 复合调用边界显示或类型检查错误 | P0/P1 |
| impl node ID 选择 generic 而非 typed concrete | 编辑器显示/运行行为与普通节点不同 | P1 |
| enum 参数未复用普通编码 | enum 节点值缺失或 concrete node 错误 | P1 |
| dict key/value 推断缺失 | collections profile 后续仍可能失败 | P1 |
| bConcreteValue 手写集合不同步 | 数学、比较、类型转换节点不稳定 | P1 |
| hidden pin / remap 未统一 | 部分节点连线错位 | P2 |

---

## 10. 下一步建议

1. 保持 L1：继续把 `compare-system-node-reuse.ts --strict` 作为当前样本验收门槛；后续每扩大样本都先让 strict 重新通过。
2. 扩大 L1 样本：在当前 `assembly_list/get_list_length`、`concatenate_list`、`addition/equal` 基础上增加 dict、variable、enum、signal 等高风险节点。
3. 继续 Phase 3：优先把 dict/list/enum/variable 等普通系统节点 pin/value 编码迁向 vendor/主图路径，减少 `buildImplNodePins` 中的手写 VarBase / bConcreteValue 规则。
4. 进入 Phase 2：抽象或复用 `resolveGiaNodeId`，让 composite impl 节点 ID 推断不再依赖简化版 `resolveImplNodeId`；当前 `assembly_list` 的局部 typed 推断只是过渡补强。
5. 持续更新本文档的进度快照和复用率/差距表，不把架构状态只散落进 handover。
