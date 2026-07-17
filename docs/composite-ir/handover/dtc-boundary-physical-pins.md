# Session 交接：复合节点 DTC 边界物理引脚修复

> 状态：当前推荐
> 来源：真实 GIA 验证 + 游戏内验证 + 自动回归
> 最近校验：2026-07-17
> 适用范围：gsts 当前 Stage 3 复合编码；涉及 DTC 边界 capture 输入必须保留物理 pin。

---

## 一、下一轮目标

### 唯一目标

暂无特定后续任务。本修复已自动回归、文档化并提交。

### 范围

- 修复：`data_type_conversion_*` 边界 capture 输入（被 compositePins 指向时）保留物理 InParam + 独立生成 OutParam。
- 检查：DTC 边界路由编码后执行 `requirePhysicalPins: true` 完整性检查。
- 不影响：普通 capture 跳过、嵌套复合 capture pin 空洞、pin-hole 和 special-arg 物理 remap。

### 完成标准

1. 自动验证：`test-stage3-bool-boundary-dtc-physical-pins.ts` 通过（JSON 层 + raw protobuf 层）。
2. 自动验证：capture、nested、overlay、bool 元数据、root/impl parity 回归均通过。
3. 语义结构：`gia:compare` 与用户修复导出版本完全一致（`compositePinIndex` 除外）。
4. 游戏验证：用户确认 `bool参数-gsts修复版.gia` 运行正常。

---

## 二、可用资源与执行边界

### 已验证基线

- `游戏内通过`：`bool参数-gsts修复版.gia`（SHA256 `4cfda81b`），复合 bool 参数→DTC 转换链正常运行。
- `真实 GIA 已验证`：`user_edit/复合节点/bool参数.gia`（1557B）与 `bool参数-导出版本.gia`（1579B）的 impl 首节点均有 `pins=2`。
- `自动验证通过`：`test-stage3-bool-boundary-dtc-physical-pins.ts` 断言物理 pin 存在性及 oneof 分支。
- `真实 GIA 观察`：坏样本 `bool参数-gsts复现.gia`（修复前，`d9ac7be8`）的 impl 首节点 `pins=[]`。

### 文档资源索引

#### P0：工作细节准则

- [`layout-working-rules.md`](layout-working-rules.md)
  - 用途：协作边界、游戏目录、生成/注入/归档命令。
  - 何时读：下次涉及真实 GIA 或游戏导入的新任务。
  - 范围：优先读"核心协作规则""路径速查"。

#### P1：当前任务权威资料

- [`../retrospectives/r20-bool-enum-metadata.md`](../retrospectives/r20-bool-enum-metadata.md)
  - 用途：同一 `bool参数.gia` 样本的前序 fix（enumId field 101），附录 1 记录本次 DTC 物理 pin 修复的全链路对比。
  - 何时读：需要区分 bool 参数 show/select 异常 vs DTC 运行异常的根因和排查路径。
  - 范围：附录 1 及 1.3 症状对比表。
- [`../../architecture/composite/gia-encoding.md`](../../architecture/composite/gia-encoding.md)
  - 用途：当前 DTC 边界物理 pin 异常的 GIA 编码规则和控制流例外。
  - 何时读：需要理解 capture 物理 pin 空洞和 DTC 边界约束原理。
  - 范围：§4.1 InParam 引脚、§4.2 边界物理 pin 完整性。
- [`../../../src/compiler/ir_to_gia_transform/AGENTS.md`](../../../src/compiler/ir_to_gia_transform/AGENTS.md)
  - 用途：Stage 3 的 capture 半跳过硬编码约束和 DTC 边界例外规则。
  - 何时读：修改 capture、nested composite 或边界布局时。

#### P2：升级调查入口

- `docs/documentation-map.md`：任务超出当前范围。
- `docs/documentation-governance.md`：判断证据等级。

### 代码与测试入口

```text
src/compiler/ir_to_gia_transform/composite.ts ::
  buildImplNodePins / buildImplGraphNodes / buildCompositeAccessories  当前编码入口

tests/composite/test-stage3-bool-boundary-dtc-physical-pins.ts        最小回归
tests/composite_bool_parameter_reference_repro.ts                     复现夹具
```

### 真实样本与比较字段

```text
真实文件: C:\Users\touyu\AppData\LocalLow\miHoYo\原神\BeyondLocal\Beyond_Local_Export\
  user_edit/复合节点/bool参数.gia               (最初参考, eb281637, 1557B)
  user_edit/复合节点/bool参数-导出版本.gia      (用户修复导出, 9b8187fc, 1579B)
  bool参数-gsts修复版.gia                       (修复后 gsts, 4cfda81b, 1800B)
  bool参数-gsts复现.gia                         (修复前 gsts, d9ac7be8, 1699B)

比较字段: accessory[1].graph.inner.graph.nodes[0].pins[]
  坏: pins=0
  好: pins=2 (InParam[0].type=4 + OutParam[0].type=3)
  检查: pin.type, value.class, value.bConcreteValue.indexOfConcrete,
        value.bConcreteValue.value.class, oneof 分支(bEnum/bInt)
```

### 易错点与禁止事项

- `capture: true` 不自动等于"不需要物理 pin"——`compositePins` 只是路由声明，不会创建目标 pin。
- DTC 边界例外只适用于当前复合 `compositePins` 直接指向的 capture；嵌套复合调用和 pin-hole 节点的 capture 语义不受影响。
- 数据生产节点 OutParam 生成条件放宽后，其他节点族若有纯 DTC 类似导致 `pins=[]` 的场景也会自动获益；新增回归需保持。

### 推荐工作流

下一次类似协议问题仍遵循 r20 盘点总结的 Phase A-E：

```text
Phase A: 建立最小差异 (A/B 文件)
Phase B: 先比 wire 再比 JSON
Phase C: 优先排查协议层 (field→oneof→类型→literal→拓扑)
Phase D: 记录假设与证据
Phase E: 五层验证 (游戏→IR→schema→wire→vendor)
```
