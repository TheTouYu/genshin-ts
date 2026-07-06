# 测试体系：复合节点的验证策略

> 状态：当前实现
> 来源：当前代码实现
> 最近校验：2026-07-06
> 适用范围：gsts 当前复合节点测试脚本和验证流程

> 本文档描述复合节点功能的测试架构——从 GIA 比对测试到单元行为验证，以及已知的限制和注意事项。
> 参见：[DSL API](./dsl-api.md) | [捕获机制](./capture-mechanism.md) | [管线追踪](./pipeline-flow.md)

---

## 入门示例

对于想理解复合节点管线的开发者，推荐从 `tests/composite/demo_addsub2.ts` 开始：

```
npx tsx tests/composite/demo_addsub2.ts
```

该脚本完整展示了 TS 定义 → 运行时捕获 → IR JSON → GIA 编码的全流程，对应 `ts_g_define_加减运算2.gia` 参考文件的结构。参见：[dsl-api.md](./dsl-api.md) | [捕获机制](./capture-mechanism.md)

## 1. 测试文件位置

所有复合测试文件位于 `tests/composite/`：

```
tests/composite/
├── test-composite-part1.ts         # Part 1: GIA 比对测试（48 项）
├── test-composite-part2.ts         # Part 2: 设施图定义+调用（20 项 + 4 pending）
├── test-composite-part3.ts         # Part 3: 单元行为验证（42 项）
├── test-composite-runner.sh        # 运行器
├── test-composite-all.ts           # 合并运行入口
│
├── test-simple-basic-call.ts       # 基础 exec-only 复合
├── test-two-composites.ts          # pure data + exec 复合串联
├── test-basic-call-param.ts        # 带参数复合
├── test-two-exec.ts                # 两个 exec 复合串联
├── test-type-conversion.ts         # 类型转换复合
├── test-mixed-composite-normal.ts  # 复合与普通节点混合
├── test-composite-game-demo.ts     # 游戏场景示例
│
├── analyze-nested-composites.ts    # 嵌套复合调研
│
├── gia-compare.ts                  # GIA 对比工具
├── gia-diff.ts                     # GIA diff 工具
├── gia-inspect.ts                  # GIA 检查工具
├── verify-composite-gia.ts         # GIA 验证工具
│
├── test-phase1-system-nodes.ts     # 阶段 1 系统节点
├── test-phase2-normal-nodes.ts     # 阶段 2 普通节点
├── test-phase2-reference-patterns.ts # 阶段 2 参考模式
├── test-replicate-mul3.ts          # 验证用例：mul3 复制
└── test-simple-ref-compare.ts      # 简单参考对比
```

## 2. 测试类型

### Part 1: GIA 比对测试（48/48 通过）

将复合节点定义编译为 GIA 二进制文件，与预先存储的参考 `.gia` 文件进行逐字节比对。验证编码正确性和稳定性。

```bash
# 运行
npx tsx tests/composite/test-composite-part1.ts
```

验证方式：
- 为每个测试用例生成 `.gia` 输出
- 与 `tests/composite/ref/` 下的参考文件逐一对比
- 使用 `gia-compare.ts` 进行结构化比较而非简单字节比较

### Part 2: 设施图定义+调用（20/20 通过，4 pending）

在设施图（Facility Graph）场景中测试复合节点的定义和调用——即生成包含复合节点调用的完整 `.gia`。

```bash
npx tsx tests/composite/test-composite-part2.ts
```

20 项测试全部通过，但以下场景缺少参考 GIA 文件（标记为 `@pending_ref`）：

1. **返回值连线精确对比** — `getMetadata()` 返回的 pin 索引在跨复合边界的精确性
2. **多次调用同一复合** — 同一复合定义在同一主图中被多次调用的 GIA 结构
3. **空复合** — 无 inputs/outputs 且 build 为空的复合节点
4. **嵌套复合** — 复合 build 内部调用另一个 `f.callComposite`

### Part 3: 单元行为验证（42/42 通过）

对捕获结果和 IR 结构的精细化验证，不依赖完整管线：

```bash
npx tsx tests/composite/test-composite-part3.ts
```

测试覆盖：
- `CompositeCapture` 的 `isPureData` 判定
- `compositePins` 的映射正确性（InParam 扫描、OutParam 元数据）
- `toCompositeDefIR()` 的 `implNodes` 和 `implEdges` 结构
- 多 OutFlow 的 `outflowMarks` / `f.outflow()` 优先级（旧文档中的 `leafMarks` 属于历史实现）
- 单 OutFlow 的默认行为

---

## 3. 主要测试用例

| 测试文件 | 验证重点 |
|----------|----------|
| `test-simple-basic-call.ts` | 最简单 exec-only 复合：定义 → 调用 → 编译 |
| `test-two-composites.ts` | pure data + exec 复合的串联和 compositeDataEdges |
| `test-basic-call-param.ts` | 带输入/输出参数的复合，参数传递正确性 |
| `test-two-exec.ts` | 两个 exec 复合在一条执行链上的顺序执行 |
| `test-type-conversion.ts` | 内部节点含 `data_type_conversion_*` 的复合 |
| `test-mixed-composite-normal.ts` | 复合调用与普通 `f.method()` 交叉排列 |
| `test-composite-game-demo.ts` | 模拟真实游戏逻辑的复合（条件、变量、多个复合） |
| `analyze-nested-composites.ts` | 研究嵌套复合的技术可行性（结果：当前不支持） |

---

## 4. 运行方式

### 独立脚本模式

复合测试是独立脚本，**不属于** `npm test` 自动执行流程：

```bash
# 运行完整测试集
bash tests/composite/test-composite-runner.sh

# 或单独运行各部分
npx tsx tests/composite/test-composite-part1.ts
npx tsx tests/composite/test-composite-part3.ts
```

### 独立进程

每个测试脚本在**独立 Node.js 进程**中运行。这是因为：

1. `compositeRegistry` 是模块级全局单例
2. 测试间的 `g.defineComposite` 调用会污染注册表
3. 同一进程中的多次 `buildServerGraphRegistriesIRDocuments` 调用会产生重复定义

### 回归测试

```bash
npm run quicktest
```

不受复合测试直接影响（复合测试不在 quicktest 中），但复合功能的正确性可以通过编译包含复合调用的测试 `.ts` 文件来验证——56 个 GIA 文件全部生成成功。

---

## 5. 测试注意事项

### `// @ts-nocheck`

所有测试文件顶部包含 `// @ts-nocheck`，因为测试代码直接操作 IR 结构、CompositeCapture 等内部类型，不需要严格的 TS 类型检查。

### 注册表污染

测试脚本须独立运行。若在同一进程中运行多个测试：

```typescript
// 问题：第二次 defineComposite('X', ...) 会抛错
// "[error] composite "X" already defined"

// 解决方案：每个测试文件独立进程，或在 beforeEach 中清空注册表
compositeRegistry['definitions'].clear()  // hack: 不推荐
```

### 对比参考文件

Part 1 的 `.gia` 参考文件需要手动维护。新增测试用例时：

1. 先运行一次生成 `.gia`（--save 模式）
2. 人工验证 `.gia` 结构正确
3. 作为参考文件提交

---

## 6. 已知限制

| 限制 | 影响 | 状态 |
|------|------|------|
| 返回值连线精确对比 | 部分场景中 OutParam pin 索引偏移 | `@pending_ref` |
| 多次调用同一复合 | 同一复合在两处被调用时 accessories 处理 | `@pending_ref` |
| 空复合 | build 函数为空时的 IR 和 GIA 表示 | `@pending_ref` |
| 嵌套复合 | composite build 内部调用另一个复合 | `@pending_ref` |
| 跨复合类型参数 | 复合输出作为另一复合输入时的类型推导 | 需验证 |

> 详情参见 [composite_node_testing.md](composite_node_testing.md) 的历史测试记录。
