# V2 复合节点验证交接文档 · 第九轮

> 状态：当前实现 / 历史记录
> 来源：当前代码实现 + 普通 gsts 编译链路自动验证 + L1 主图 vs composite impl 严格对照
> 最近校验：2026-07-10
> 适用范围：复合节点系统节点复用 Phase 3 启动；`assembly_list` vendor pin 生成复用；后续 dict/enum/signal/variable 扩面

> **整体推进入口**：[../../architecture/composite/system-node-reuse-audit.md](../../architecture/composite/system-node-reuse-audit.md)
> **上一轮入口**：[v2-composite-validation-round-8.md](v2-composite-validation-round-8.md)
> **当前测试矩阵文档**：[../../architecture/composite/testing.md](../../architecture/composite/testing.md)
> **当前 Stage 3 GIA 编码文档**：[../../architecture/composite/gia-encoding.md](../../architecture/composite/gia-encoding.md)

---

## 一、本轮目标

本轮按 round-8 的要求从 Phase 3 开始，不继续手写 `assembly_list` 的 100+ pin 形状，而是复用普通/vendor pin 编码路径。

本轮完成：

1. 把 `get_node_graph_variable` 的既有临时 `Graph + Node + encode` 逻辑抽成 `encodeVendorNodePins(...)` helper。
2. 让 composite impl 中的 `assembly_list` 使用该 helper 生成完整 vendor pin 集合。
3. 为 `assembly_list` 的 impl node ID 增加按首个元素/连接类型选择 typed node ID 的局部逻辑。
4. 让当前 L1 `compare-system-node-reuse.ts --strict` 通过。

本轮代码提交：

```text
本提交：Advance composite assembly-list pin reuse
```

工作区注意：仍有既有未跟踪目录：

```text
.agents
```

不要误提交或删除它，除非用户明确要求。

---

## 二、本轮修改文件

代码：

```text
src/compiler/ir_to_gia_transform/composite.ts
```

文档：

```text
docs/architecture/composite/system-node-reuse-audit.md
docs/architecture/composite/testing.md
docs/architecture/composite/gia-encoding.md
docs/composite-ir/handover/README.md
docs/composite-ir/handover/v2-composite-validation-round-9.md
```

---

## 三、核心实现

### 3.1 `encodeVendorNodePins(...)`

新增 helper：

```ts
function encodeVendorNodePins(
  concreteNodeId: number,
  configure?: (node: Node<'server'>) => void
): NodePin[]
```

行为：

1. 创建临时 `Graph('server')` 与 `Node(0, 'server', concreteNodeId)`；
2. 由 vendor `Node#setConcrete` 自动生成完整 pins；
3. 可在 `configure` 中设置字面量 pin value；
4. 过滤普通主图也会过滤的 `Unk` InParam/OutParam pins；
5. `encode()` 后提取 protobuf `NodePin[]`；
6. 清理临时 graph 产生的 `connects`。

该 helper 当前用于：

- `get_node_graph_variable`；
- `assembly_list`。

### 3.2 `assembly_list` 完整 vendor pin 复用

旧实现：

- 手写 count pin；
- 只按实际元素个数生成 InParam；
- 手写 OutParam list `ConcreteBase(ArrayBase)`；
- 无法复刻普通主图/vendor 的固定 100 个元素 pin 形状。

新实现：

- `assembly_list` 直接调用 `encodeVendorNodePins(concreteNodeId, ...)`；
- `pin0` 设置为元素数量；
- 字面量元素设置到 `pinIndex = idx + 1`；
- conn 元素不设值，只找到 vendor 生成的对应 InParam pin，并在返回后补 composite impl data connects；
- vendor 负责生成完整 InParam/OutParam 形状、`ConcreteBase` 包裹、`indexOfConcrete`、list OutParam。

这消除了 round-8 剩余的 L1 差异：

```text
assembly_list 的 composite impl pin 集合未与主图/vendor 完整同构
```

### 3.3 `assembly_list` typed node ID 局部补强

`resolveImplNodeId(...)` 中新增 `assembly_list` 特判：

- 从首个非 capture arg 读取类型；
- conn arg 从 `arg.value.type` 读取；
- 使用 `irTypeToNodeSuffix(...)` 生成 suffix；
- 查找 `assembly_list__${suffix}`。

这不是完整 Phase 2，只是避免 `assembly_list` 在 vendor pin 复用后继续落到错误 concrete 变种。

---

## 四、自动验证结果

本轮最终跑过：

```bash
npm run build
node bin/gsts.mjs tests/composite/v2/all-types/system-node-reuse-smoke.ts || true
npx tsx tests/composite/v2/all-types/compare-system-node-reuse.ts \
  dist/tests/composite/v2/all-types/system-node-reuse-smoke.gia --strict
npx tsx tests/composite/v2/all-types/assert-vartype-map.ts
node bin/gsts.mjs tests/composite/v2/all-types/list-type-ops-smoke.ts || true
npx tsx tests/composite/v2/all-types/assert-list-type-ops-smoke.ts \
  dist/tests/composite/v2/all-types/list-type-ops-smoke.gia
git diff --check
```

结果：

- `npm run build`：通过；
- `system-node-reuse-smoke.ts`：`.gia` 生成成功，末尾仅 LocalLow 环境错误；
- `compare-system-node-reuse.ts --strict`：通过；
- `assert-vartype-map.ts`：通过；
- `list-type-ops-smoke.ts`：`.gia` 生成成功，末尾仅 LocalLow 环境错误；
- `assert-list-type-ops-smoke.ts`：通过，检查 100 个 pin；
- `git diff --check`：通过。

LocalLow 报错为当前环境复制/注入阶段问题：

```text
multiple WSL LocalLow folders found; set GSTS_LOCALLOW_DIR: ...
```

它发生在 `.gia` 生成后，不影响本轮编码验证。

---

## 五、当前精度判断

截至本轮：

- Phase 3 已启动，并完成第一个明确节点级复用案例：`assembly_list`。
- 当前 L1 样本的 `--strict` 已通过。
- `get_node_graph_variable` 与 `assembly_list` 现在共用同一种 vendor pin helper。
- 这不代表 composite impl 已完整复用普通系统节点；`buildImplNodePins` 中仍有大量手写规则。

仍需特别注意：

- dict、enum、signal、variable、hidden pin、特殊 args 仍未纳入 L1 扩展样本；
- `resolveImplNodeId` 仍是简化版，`assembly_list` typed 推断只是局部补强；
- 当前验证是自动 GIA 结构对照，未做新增游戏内验证。

---

## 六、下一轮建议

建议继续 Phase 3，但不要只追求“更多节点能过”，而是继续减少手写分叉：

1. 扩大 L1 样本到 dict / variable / enum / signal 中的一小组高风险节点；
2. 每增加一组，先用 `compare-system-node-reuse.ts --strict` 找出主图 vs impl 差异；
3. 优先让这些节点调用 `encodeVendorNodePins(...)` 或抽到可共享 helper 文件；
4. 若某类节点需要普通主图 `applySpecialArgs` / `setLiteralArgValue` / enum special handling，不要直接从 `composite.ts` import `index.ts` 制造循环；优先抽纯 helper；
5. 再进入 Phase 2，把 `resolveImplNodeId` 逐步迁到共享节点 ID 推断。

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

## 七、给下一位助手的一句话

> round-9 已启动 Phase 3：`assembly_list` 不再手写 pin 形状，改用 `encodeVendorNodePins(...)` 通过临时 `Graph + Node + encode` 复用 vendor 完整 pin 集合；`get_node_graph_variable` 也改用同 helper；`assembly_list` 的 impl node ID 增加按首个元素/连接类型选择 typed node ID 的局部逻辑。当前 `compare-system-node-reuse.ts --strict` 已通过，`assert-list-type-ops-smoke.ts` 仍通过。下一步继续扩 L1 到 dict/variable/enum/signal，并优先抽共享 helper，避免 `composite.ts` 继续复制普通主图特殊编码逻辑。
