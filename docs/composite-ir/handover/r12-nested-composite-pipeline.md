# Session 交接：嵌套复合节点管线验证

> **目标轮次：** r12
> **前置依赖：** [r11-exec-composite-pipeline.md](./r11-exec-composite-pipeline.md)
> **参考文件：** `composite/demo_C_nested_call.gia`（游戏导出目录）
> **当前状态：** 规划阶段，尚未开始编码

---

## 1. 目标

验证复合定义内部调用另一个复合（`f.callComposite`）的端到端管线。

```
Composite "基础加法" (pure data)
  inputs:  x (int), y (int)
  outputs: s (int)
  build:   f.addition(x, y)

Composite "嵌套调用" (pure data)
  inputs:  a (int), b (int), c (int)
  outputs: result (int)
  build:
    const mid = f.callComposite(基础加法, { x: a, y: b })   ← 嵌套调用！
    return { result: f.callComposite(基础加法, { x: mid.s, y: c }).s }
```

### 验收标准

- [ ] IR 正确捕获：`嵌套调用` 的 `captured.dataNodes` 包含 `__composite_call__` 节点
- [ ] GIA 编码成功：复合定义和主图均能生成 `.gia`
- [ ] 工具链验证：`trace-exec-flow` + `trace-dataflow` 跨复合边界追溯通过
- [ ] 游戏验证：编辑器打开结构正确
- [ ] `test-composite-all.ts` 的 `@pending_ref` 嵌套测试由跳过→通过

---

## 2. 已知准备

### 2.1 已 ready 的能力（r11 已验证）

- exec 复合 + 数据流复合 ✅
- compositePins 重定向机制（InFlow/OutFlow/InParam/OutParam）✅
- `__composite_call__` 标记节点编码 ✅
- 终端节点自动生成 ✅
- 工具链：dump-layout / trace-exec-flow / trace-dataflow ✅

### 2.2 已有参考文件

`composite/demo_C_nested_call.gia` — 游戏编辑器产出的嵌套复合参考。应先解码分析其结构：

```bash
npx tsx tools/dump-layout.ts "/path/to/composite/demo_C_nested_call.gia"
npx tsx tests/composite/trace-exec-flow.ts "/path/to/composite/demo_C_nested_call.gia"
npx tsx tests/composite/trace-dataflow.ts "/path/to/composite/demo_C_nested_call.gia" <nodeIdx> <paramIdx>
```

### 2.3 已有测试占位

`test-composite-all.ts` Part 2E 已有嵌套复合的定义和捕获验证，标记为 `@pending_ref`（等待 GIA 参考文件对比）。修复路径：

1. 先确保嵌套复合的基本管线能跑通
2. 将 GIA 输出与 `demo_C_nested_call.gia` 对比
3. 移除 `@pending_ref`

```typescript
// Part 2E 当前的测试代码（已修复 registry.get 问题）
const baseAdd = defineComposite('基础加法', { ... })
defineComposite('嵌套调用', {
  ...
  build: ({ a, b, c }, f: any) => {
    const mid = f.callComposite(baseAdd, { x: a, y: b })
    return { result: f.callComposite(baseAdd, { x: mid.s, y: c }).s }
  }
})
```

---

## 3. 已知瓶颈

| 问题 | 位置 | 说明 |
|------|------|------|
| **嵌套调用 IR 捕获** | `core.ts` Phase A | 子复合的 build 在父复合捕获期间执行 → 需要确保子复合的 `captured` 已就绪。当前时序是 Phase A 按 registry 顺序捕获，子复合可能还没被捕获 |
| **多层 `__composite_call__` GIA 编码** | `index.ts` | 当前只处理单层 composite call 的终端生成和 pin 映射。嵌套调用时，子复合的 `__composite_call__` 在父复合的 implNodes 中，需要独立编码 |
| **预捕获 hack 的稳定性** | 测试脚本 | 嵌套场景下多个复合的捕获时序更复杂，当前 dummy call hack 可能不够可靠 |
| **子复合布局** | `composite.ts` | 嵌套时子复合内部的 impl 节点布局如何与父复合协调？当前 `computeImplLayout` 在父复合的 BFS 中只处理父级的 exec 节点，不递归进入子复合 |
| **跨复合数据连线** | `index.ts` `compositeDataEdges` | 父复合的输出 → 子复合的输入，这条数据连线如何在 GIA 中编码？compositePins 需要扩展支持嵌套场景 |

### 3.1 时序问题详解

当前 Phase A 捕获流程：

```
buildServerGraphRegistriesIRDocuments()
  → 遍历 compositeRegistry.getAll()
    → 对每个 def.captured === null 的复合：
      1. 创建 captureRegistry
      2. 调用 def.build(inputs, fns)
      3. 如果 build 内部调用了子复合 → 子复合触发 runCompositeCall → 但子复合可能还没被 Phase A 处理！
```

解决方案选项：

| 选项 | 描述 | 复杂度 |
|------|------|--------|
| A. Phase A 递归 | 在父复合 build 时检测到子复合未捕获 → 先捕获子复合再继续 | 低 |
| B. 两趟 Phase A | 第一趟捕获所有叶子复合，第二趟捕获依赖它们的父复合 | 中 |
| C. 预注册所有复合 | 在 Phase A 前先 serialize 所有 def，按拓扑顺序排序 | 高 |

---

## 4. 建议推进步骤

### Step 1：分析参考文件
解码 `demo_C_nested_call.gia`，理解游戏编辑器如何编码嵌套复合。

### Step 2：修复捕获时序
实现选项 A（Phase A 递归捕获）或验证当前时序是否已能工作。

### Step 3：编写最简单的嵌套测试
从 `exec-with-data.ts` 复制修改，把复合内部的数据运算改为 `callComposite`。

### Step 4：工具链验证
`trace-exec-flow` 和 `trace-dataflow` 跨两层复合边界的追溯。

### Step 5：回补 `test-composite-all.ts`
把 `@pending_ref` 改为完整验证，确认 80/80 全绿。

### Step 6：游戏验证
复制 GIA 到游戏目录，编辑器中打开确认结构正确。

---

## 5. 快速启动命令

```bash
# 1. 分析参考
npx tsx tools/dump-layout.ts "/mnt/c/.../composite/demo_C_nested_call.gia"

# 2. 构建 + 运行嵌套测试（编写后）
npm run build && npx tsx tests/composite/exec-nested.ts

# 3. 工具链验证
npx tsx tests/composite/trace-exec-flow.ts output/exec_nested.gia
npx tsx tests/composite/trace-dataflow.ts output/exec_nested.gia 4 0

# 4. 回归
npm run quicktest
npx tsx tests/composite/test-composite-all.ts
```
