# 列表参数支持 — 三阶段测试计划

> 状态：历史记录
> 来源：2026-07-05 测试计划
> 最近校验：2026-07-06
> 适用范围：三阶段测试计划（数据流核验 → IR 检查 → 游戏验证）。当前 API 工具和工作流已有变化，本计划仅作参考。

## 验证目标
将生成的 GIA（`tests/composite/output/全覆盖类型复合.gia`）与参考文件（`类型转化-full-v2.gia`）逐层对比。

## 各阶段

### 第一阶段：数据流工具核验（当前）
- `trace-dataflow.ts` — 检查 CompositeDef 类型编码、impl 图节点、数据流
- `trace-exec-flow.ts` — 检查执行流链
- `_dump_impl_graphs.ts` — 检查 impl 图拓扑
- 逐个节点对比 pin 类型编码

### 第二阶段：IR JSON 中间产物 1:1 检查
- 运行时通过 `buildServerGraphRegistriesIRDocuments` 输出的 IR JSON
- 对比 `__composite_call__` args 类型、`implNodes` 结构

### 第三阶段：游戏内验证
- 部署 GIA 到游戏目录
- 在游戏编辑器中加载验证
