# V2 复合节点验证交接文档 · 第八轮

> 状态：当前实现 / 历史记录
> 来源：当前代码实现 + 普通 gsts 编译链路自动验证 + L1 主图 vs composite impl 诊断对照
> 最近校验：2026-07-09
> 适用范围：复合节点系统节点复用 Phase 1 收口、L1 诊断测试、下一轮 Phase 3 vendor/主图 pin 编码复用

> **整体推进入口**：[../../architecture/composite/system-node-reuse-audit.md](../../architecture/composite/system-node-reuse-audit.md)
> **上一轮入口**：[v2-composite-validation-round-7.md](v2-composite-validation-round-7.md)
> **当前测试矩阵文档**：[../../architecture/composite/testing.md](../../architecture/composite/testing.md)
> **当前 Stage 3 GIA 编码文档**：[../../architecture/composite/gia-encoding.md](../../architecture/composite/gia-encoding.md)

---

## 一、本轮目标

本轮承接 round-7：继续从“复合节点是否完整复用普通系统节点”的架构方向推进，不把问题当成零散 list bug。

本轮完成三件事：

1. 收口 Phase 1：新增 L0 类型映射断言，删除 `composite.ts` 中剩余类型映射 wrapper。
2. 建立 L1 普通主图 vs composite impl 诊断入口，用同一 `.gia` 中的主图 control 和复合 impl 节点做签名对照。
3. 根据 L1 诊断修复一批明确的 composite impl pin/value 编码差异，并把剩余差异收敛到 `assembly_list` 的 vendor 完整 pin 形状。

本轮代码提交：

```text
4988b63 Advance composite system-node reuse validation
```

工作区注意：仍有既有未跟踪目录：

```text
.agents
```

不要误提交或删除它，除非用户明确要求。

---

## 二、本轮新增/修改文件

新增测试脚本：

```text
tests/composite/v2/all-types/assert-vartype-map.ts
tests/composite/v2/all-types/system-node-reuse-smoke.ts
tests/composite/v2/all-types/compare-system-node-reuse.ts
```

修改代码：

```text
src/compiler/ir_to_gia_transform/composite.ts
```

更新文档：

```text
docs/architecture/composite/system-node-reuse-audit.md
docs/architecture/composite/testing.md
docs/composite-ir/handover/README.md
```

当前交接文档：

```text
docs/composite-ir/handover/v2-composite-validation-round-8.md
```

---

## 三、Phase 1 收口情况

### 3.1 L0 类型映射断言

新增：

```text
tests/composite/v2/all-types/assert-vartype-map.ts
```

覆盖 scalar/list 类型：

```text
bool/int/float/str/vec3/guid/entity/prefab_id/config_id/faction
bool_list/int_list/float_list/str_list/vec3_list/guid_list/entity_list/prefab_id_list/config_id_list/faction_list
```

断言维度：

- `irTypeToVendorBaseTag(...)`；
- `irTypeToVarBaseClass(...)`；
- `irTypeToVarType(...)`；
- `irTypeToNodeSuffix(...)`；
- `isListType(...)` / `listElementType(...)`；
- `irScalarTypeToNodeType(...)`。

已验证：

```bash
npx tsx tests/composite/v2/all-types/assert-vartype-map.ts
```

输出：

```text
VarType map assertions passed. Checked scalar=10, list=10
```

### 3.2 删除 composite 类型映射 wrapper

`src/compiler/ir_to_gia_transform/composite.ts` 中已删除：

```ts
argVarType(...)
argVarBaseClass(...)
typeIdFromValueType(...)
typeClassFromValueType(...)
```

调用点现在直接使用共享模块：

```ts
irTypeToVarType(...)
irTypeToVarBaseClass(...)
irTypeToNodeSuffix(...)
```

本轮检查：

```bash
rg -n "argVarType|argVarBaseClass|typeClassFromValueType|typeIdFromValueType" \
  src/compiler/ir_to_gia_transform/composite.ts -S || true
```

结果：无匹配。

---

## 四、L1 主图 vs composite impl 诊断入口

### 4.1 新双通路样本

新增：

```text
tests/composite/v2/all-types/system-node-reuse-smoke.ts
```

它在同一个 `.gia` 中生成：

1. 普通主图 control 节点；
2. 同语义的 composite impl 节点。

当前覆盖：

- `assembly_list` + `get_list_length`；
- `concatenate_list`；
- `addition` + `equal`。

生成命令：

```bash
node bin/gsts.mjs tests/composite/v2/all-types/system-node-reuse-smoke.ts || true
```

生成成功：

```text
dist/tests/composite/v2/all-types/system-node-reuse-smoke.gia
```

当前环境末尾会报 LocalLow/保存路径检测问题：

```text
multiple WSL LocalLow folders found; set GSTS_LOCALLOW_DIR: ...
```

这是 `.gia` 生成后的复制/注入阶段问题，不影响本轮编码验证。

### 4.2 新 L1 compare 脚本

新增：

```text
tests/composite/v2/all-types/compare-system-node-reuse.ts
```

默认是诊断模式：发现差异但不返回失败码。

```bash
npx tsx tests/composite/v2/all-types/compare-system-node-reuse.ts \
  dist/tests/composite/v2/all-types/system-node-reuse-smoke.gia
```

严格模式作为后续验收门槛：

```bash
npx tsx tests/composite/v2/all-types/compare-system-node-reuse.ts \
  dist/tests/composite/v2/all-types/system-node-reuse-smoke.gia --strict
```

当前严格模式仍失败，但失败已收敛到 `assembly_list` 的 vendor 完整 pin 形状差异。

---

## 五、本轮根据 L1 诊断修复的编码差异

修改文件：

```text
src/compiler/ir_to_gia_transform/composite.ts
```

### 5.1 `get_list_length` OutParam 固定为 int

问题：composite impl 之前会从输入 list pin 继承输出类型，导致 `get_list_length` 输出错误地变成 list 类型。

修复：`get_list_length` 的 OutParam 固定为：

```text
VarType.Integer
VarBase_Class.IntBase
```

### 5.2 list pin 使用 `ConcreteBase(ArrayBase)` 包裹

问题：composite impl 的 list conn/OutParam placeholder 原来按元素 scalar base 手写，和主图/vendor 的 list pin value 结构不同。

修复：新增 list VarType 判断和 `makeListVarBaseValue(...)`，让 list pin value 至少使用：

```text
ConcreteBase
  -> ArrayBase
      itemType.type = <list VarType>
      bArray.entries = []
```

当前效果：`concatenate_list`、`get_list_length` 的 list 输入 pin 在 L1 诊断中已和主图更接近。

### 5.3 比较节点 bool 输出

问题：`equal` 等比较/逻辑节点的 composite impl OutParam 之前可能继承输入 int/concrete 类型。

修复：新增 `booleanOutputNodeTypes`，让以下节点输出 bool：

```text
equal/greater_than/less_than/greater_than_or_equal_to/less_than_or_equal_to
logical_and_operation/logical_or_operation/logical_not_operation/logical_xor_operation
enumerations_equal
```

当前 L1 样本已验证 `equal` 输出变为：

```text
type=4 class=6
```

### 5.4 当前样本覆盖到的 concrete index 对齐

本轮先做了最小修复，只覆盖当前 L1 样本确认过的差异：

- int `addition` OutParam concrete index：对齐主图为 `0`；
- int `equal` InParam concrete index：对齐主图为 `5`。

注意：这不是完整的 concrete map 统一，下一轮应进入 Phase 3 复用 vendor/主图编码路径，而不是继续扩散手写索引表。

---

## 六、自动验证结果

本轮最终跑过：

```bash
npm run build
npx tsx tests/composite/v2/all-types/assert-vartype-map.ts
node bin/gsts.mjs tests/composite/v2/all-types/system-node-reuse-smoke.ts || true
npx tsx tests/composite/v2/all-types/compare-system-node-reuse.ts \
  dist/tests/composite/v2/all-types/system-node-reuse-smoke.gia
node bin/gsts.mjs tests/composite/v2/all-types/list-type-ops-smoke.ts || true
npx tsx tests/composite/v2/all-types/assert-list-type-ops-smoke.ts \
  dist/tests/composite/v2/all-types/list-type-ops-smoke.gia
git diff --check
```

结果：

- `npm run build`：通过；
- `assert-vartype-map.ts`：通过；
- `system-node-reuse-smoke.ts`：`.gia` 生成成功，末尾仅 LocalLow 环境错误；
- `compare-system-node-reuse.ts` 默认诊断模式：可运行，当前只报告 `assembly_list` 剩余差异；
- `compare-system-node-reuse.ts --strict`：预期失败，作为下一轮验收门槛；
- `list-type-ops-smoke.ts`：`.gia` 生成成功，末尾仅 LocalLow 环境错误；
- `assert-list-type-ops-smoke.ts`：通过，检查 100 个 pin；
- `git diff --check`：通过。

当前 `compare-system-node-reuse.ts --strict` 的核心剩余输出：

```text
missing matching main signature ... nodeId=169 ...
```

也就是 `assembly_list` 的 composite impl pin 集合仍未和 vendor 主图完整同构。

---

## 七、当前精度判断

截至本轮：

- Phase 1 类型映射核心收口完成。
- L0 类型映射已有直接断言。
- L1 对照测试已建立，可以持续量化复用精度。
- 当前 L1 覆盖范围内，`get_list_length`、`concatenate_list`、`addition/equal` 的目标节点签名已明显收敛。
- 严格同构仍未通过，剩余主要差距是 `assembly_list` 的 vendor 完整 pin 形状。

因此现在不能说“复合节点完整复用主图逻辑”，但已经从“凭感觉判断”推进到“有可执行诊断和严格验收门槛”。

---

## 八、下一轮从 Phase 3 开始

用户明确要求下一轮开始 Phase 3。

Phase 3 目标：

> 把普通系统节点 pin/value 编码迁向 vendor/主图路径，减少 `buildImplNodePins` 里手写 VarBase / bConcreteValue / concrete index / list pin 形状规则。

建议顺序：

1. 以 `compare-system-node-reuse.ts --strict` 为验收门槛，先消除当前唯一剩余 L1 差异：`assembly_list` 的完整 pin 形状。
2. 不建议继续手写 100+ pin 的 `assembly_list` 形状；优先探索复用 vendor `Graph/Node/Pin` 生成的 pins，然后将其 remap 到 impl graph。
3. 总结一个可复用 helper，例如“用临时 `Graph + Node + setLiteralArgValue/applySpecialArgs + encode` 生成系统节点 pins，再剥离布局和 graph 外壳”。当前 `get_node_graph_variable` 已有临时复用 vendor pin 生成的先例。
4. Phase 3 第一批只覆盖当前 L1 样本，确保 `--strict` 通过后再扩大到 dict/variable/enum/signal。
5. 若 Phase 3 需要从 `index.ts` 复用 `applySpecialArgs` / `applyGenericArgs`，不要直接制造循环依赖；优先抽出纯 helper 文件，再让主图和 composite impl 双方调用。

推荐下一轮第一组命令：

```bash
npm run build
node bin/gsts.mjs tests/composite/v2/all-types/system-node-reuse-smoke.ts || true
npx tsx tests/composite/v2/all-types/compare-system-node-reuse.ts \
  dist/tests/composite/v2/all-types/system-node-reuse-smoke.gia --strict
node bin/gsts.mjs tests/composite/v2/all-types/list-type-ops-smoke.ts || true
npx tsx tests/composite/v2/all-types/assert-list-type-ops-smoke.ts \
  dist/tests/composite/v2/all-types/list-type-ops-smoke.gia
```

---

## 九、给下一位助手的一句话

> round-8 已提交 `4988b63`：Phase 1 类型映射完成核心收口，新增 L0 `assert-vartype-map.ts`，新增 L1 `system-node-reuse-smoke.ts` + `compare-system-node-reuse.ts`。根据 L1 诊断修复了 `get_list_length` OutParam、list pin `ConcreteBase(ArrayBase)` 包裹、`equal` bool 输出和当前样本覆盖的 int `addition/equal` concrete index。当前 `compare-system-node-reuse.ts --strict` 只剩 `assembly_list` 的 vendor 完整 pin 形状差异。下一轮按用户要求从 Phase 3 开始：优先复用 vendor/主图 pin 编码路径，不要继续扩散手写 pin/concrete 规则。
