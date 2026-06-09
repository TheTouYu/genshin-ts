---
name: 复合节点测试结果
description: 复合节点完整测试结果记录，包括发现的 bug 和待办事项
type: project
---

## 测试结果（2026-06-09）

P0-P4 + 纯数据复合 + 数据连线 + impl pin 编码全部修复。游戏验证通过：

- `basic_call.gia` (exec-only) ✅
- `basic_call_param.gia` (带参数) ✅
- `两个复合节点_gen.gia` (exec+data) — 待验证
- `two_simple.gia` (addition数据+printString exec) — 待验证
- `two_exec.gia` (双exec串行) — 待验证

### 新增测试脚本
- `tests/composite/test-simple-basic-call.ts` — 最简单 exec-only 复合
- `tests/composite/test-basic-call-param.ts` — 带 str 参数复合
- `tests/composite/test-two-composites.ts` — exec+data 双复合(使用 data_type_conversion)
- `tests/composite/test-two-composites-simple.ts` — 双数据+exec(使用 addition)
- `tests/composite/test-simple-ref-compare.ts` — 结构化对比参考 vs 生成
- `tests/composite/test-type-conversion.ts` — 复现类型转化.gia(非复合)

### 之前（2026-06-08）

三次提交（984fc68 + 0d2877f + 工作区）的复合节点功能全部验证通过。

### 各分区结果
- **Part 1**（复合定义 GIA 比对）：48/48 通过
- **Part 2**（设施图定义+调用）：20/20 通过，4 项 @pending_ref
- **Part 3**（单元行为验证）：42/42 通过
- **回归测试**（npm run quicktest）：56 个 GIA 文件全部生成成功

### 发现的 Bug
- `src/thirdparty/.../gia_gen/basic.ts` 第 135 行：`gia.graph!.inner!.graph!` 应改为 `gia.graph!.graph!.inner!.graph!`。旧的写法访问了 `GraphUnit` 顶层不存在的 `inner` 属性，导致所有 `Graph.encode()` 调用失败。已在测试中修复。

### 待办（@pending_ref）
以下场景缺少完整的"设施图(定义+调用)"类型的参考 GIA 文件，当前仅验证了 IR 结构正确性和 GIA 可解码性：
1. callComposite 返回值连线精确对比
2. 多次调用同一复合的 GIA 结构
3. 空复合的 GIA 结构
4. 嵌套复合（复合内 callComposite）的 GIA 结构

### 测试脚本
- `tests/composite/test-composite-part3.ts` — 单元级验证（快速，无管线依赖）
- `tests/composite/test-composite-part1.ts` — GIA 对比（依赖参考文件）
- `tests/composite/test-composite-part2.ts` — 设施图测试（标记 @pending_ref）
- `tests/composite/test-composite-runner.sh` — 运行器
- 所有脚本含 `// @ts-nocheck`，独立进程运行避免注册表污染
