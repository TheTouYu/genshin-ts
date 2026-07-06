# 复合节点预捕获 — 消除纯数据复合的 exec marker 时序耦合

> 状态：历史记录 / 待确认
> 来源：捕获机制调试过程
> 最近校验：2026-07-06
> 适用范围：纯数据复合捕获时序问题的历史修复计划；当前机制说明以 capture-mechanism.md 为准。

## 问题

`runCompositeCall()` 创建 `__composite_call__` 标记节点时，pure data 判定依赖 `def.captured`，但此时 captured 尚未设置（复合定义在 `buildServerGraphRegistriesIRDocuments()` 的 handler 处理之后才被捕获）。导致纯数据复合的 marker 被错误标记为 `type: 'exec'`，进入执行流产生无效的 exec 连线。

```typescript
// core.ts:1052-1053
const def = compositeRegistry.getById(compositeId)
const isPureData = def?.captured?.isPureData ?? false
//                              ^^^^^^^^
//  此时始终为 null → isPureData 恒为 false
```

### 根因

`buildServerGraphRegistriesIRDocuments()` 的执行顺序：

```
① handler 执行 → callComposite → marker 创建（type=exec，因为 captured=null）
② 遍历 compositeRegistry → 捕获复合定义 → 设置 captured
```

② 应该在 ① 之前。

### 修复方案

**核心改动：** 在 `buildServerGraphRegistriesIRDocuments()` 中，将复合捕获循环移到 handler 处理之前。

```typescript
// 修复前（core.ts:1454）
export function buildServerGraphRegistriesIRDocuments(opts) {
  // ① 先处理 serverRegistries（handler 执行，marker 创建时 captured=null）
  const list = serverRegistries.map(registry => { ... })
  
  // ② 再捕获复合定义
  for (const def of compositeRegistry.getAll()) {
    if (!def.captured) { ... capture ... }
  }
  
  // ③ 过滤 compositeDefs 嵌入文档
  ...
}

// 修复后
export function buildServerGraphRegistriesIRDocuments(opts) {
  // ① 预捕获所有复合定义（此时 handler 尚未执行，但 compositeRegistry 已注册）
  captureAllComposites()
  
  // ② handler 执行 → callComposite → def.captured 已存在 → isPureData 正确
  const list = serverRegistries.map(registry => { ... })
  
  // ③ 过滤 compositeDefs 嵌入文档
  ...
}
```

`captureAllComposites()` 从当前 `compositeRegistry.getAll()` 中循环捕获所有 `!def.captured` 的复合。提取现有捕获代码（第 1486-1545 行）为独立函数。

### 验收标准

1. **纯数据复合的 marker 在 IR JSON 中为 data 类型**：主图 `nodes[]` 中纯数据复合的 `__composite_call__` 节点不应有 `next` 字段
2. **exec 复合不受影响**：非纯数据复合的 marker 仍为 exec 类型，保持 `next` 连线
3. **`isPureData` 在 `runCompositeCall` 中正确**：line 1053 的 `def.captured` 不再为 null
4. **现有测试不变更结果**：npm run quicktest 全部通过，composite Part 1/2/3 不变
5. **`compositeDataEdges` 不受影响**：跨复合数据连线仍正确记录

### 涉及的文件

| 文件 | 改动 |
|------|------|
| `src/runtime/core.ts` | `buildServerGraphRegistriesIRDocuments`：调换顺序，提取 `captureAllComposites()` |
| `src/runtime/core.ts` | `removeUnusedNodesFromFlow`：第 1414-1416 行的 `__composite_call__` 特殊保护可评估是否仍需要 |

### 不受影响

以下是当前补偿逻辑，修复后保持原样（防御性安全）：

- `src/compiler/ir_to_gia_transform/index.ts:534` — 纯数据不生成 OutParam pin（仍正确）
- `src/compiler/ir_to_gia_transform/index.ts:655-658` — 移除 flow pins（对 data 类型 marker 为 no-op，对 exec 类型 marker 仍需要）
- `src/runtime/core.ts:1059` — `type: isPureData ? 'data' : 'exec'`（现在 isPureData 正确了，这条逻辑开始生效）

### 执行顺序关键验证

确保 `captureAllComposites()` 放在 serverRegistries 处理之前是安全的：

- `compositeRegistry` 在 `await import(entryUrl)` 时已填充（和 `serverRegistries` 同时）
- `captureAllComposites()` 使用自己的 `MetaCallRegistry`，不读取 `serverRegistries`
- restore of `gsts[kServerF]` 在 capture 完成后恢复现场
- handler 执行在 capture 之后，此时 `def.captured` 已设置

### 后续（可选，非本 PR）

- 嵌套复合支持：预捕获后，复合 A 的 build 中调用复合 B 时，B 也已 pre-captured，可正确递归
- removeUnusedNodes 对纯数据复合的 dead call elimination
