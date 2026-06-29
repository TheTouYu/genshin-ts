# 编译管线整体架构总览

> 本文档描述 genshin-ts（gsts）的整体架构：如何将 TypeScript 源代码编译为可在原神·千星奇域中运行的节点图（.gia）文件。

---

## 1. 核心问题

原神·千星奇域的"节点图"（Node Graph）本质上是一个**基于数据流和事件驱动的可视化编程系统**——类似于 UE4 蓝图或 Scratch。脚本需要被翻译成由**节点**和**连线**组成的图结构，最终序列化为二进制 `.gia` 文件，注入到 `.gil`（关卡文件）中。

genshin-ts 的核心使命是：**让开发者用 TypeScript 编写逻辑，自动转换为等价的节点图**。

---

## 2. 三阶段编译管线

```
输入 TypeScript 源文件
       │
       ▼
┌──────────────────────────────────────┐
│  阶段一：TS → .gs.ts                  │
│  (ts_to_gs_transform/)                │
│                                       │
│  用 TS Compiler API 解析 AST，将       │
│  g.server().on()、gstsServer* 等高阶   │
│  DSL 语法 → 节点函数调用形式            │
└──────────────┬───────────────────────┘
               │ (.gs.ts 文件)
               ▼
┌──────────────────────────────────────┐
│  阶段二：.gs.ts → IR JSON             │
│  (gs_to_ir_json_transform/)           │
│                                       │
│  通过 tsx 执行 .gs.ts 文件（运行时调  │
│  用 ir_builder 记录所有节点创建和连线）， │
│  产出 IR JSON —— 显式的节点+连线中间表示 │
└──────────────┬───────────────────────┘
               │ (IR JSON 文件)
               ▼
┌──────────────────────────────────────┐
│  阶段三：IR JSON → .gia               │
│  (ir_to_gia_transform/)               │
│                                       │
│  读取 IR JSON，做预处理、节点映射、     │
│  pin 布局、ID 解析、timer 优化，最终     │
│  用 protobuf 编码为二进制 .gia 文件     │
└──────────────┬───────────────────────┘
               │ (.gia 二进制文件)
               ▼
┌──────────────────────────────────────┐
│  注入器 (injector/)                    │
│                                       │
│  将 .gia 注入到 .gil 关卡文件中，         │
│  替换或新增目标节点图                    │
└───────────────────────────────────────┘
```

---

## 3. 关键设计原则

### 3.1 不可达阶段分离

三个阶段的产物相互独立：

| 阶段 | 输入 | 输出 | 格式 | 可读性 |
|------|------|------|------|--------|
| 1 | `.ts` | `.gs.ts` | TypeScript 源码 | 高（人类可读） |
| 2 | `.gs.ts` | `.json` | JSON | 高（结构化节点+连线） |
| 3 | `.json` | `.gia` | protobuf 二进制 | 低（机器可读） |

阶段 1 和阶段 2 产生的中间文件（`.gs.ts` 和 `.json`）就是**调试时的主要入口点**。

### 3.2 为什么分成三个阶段？

- **阶段 1（TS AST 变换）** 使用 TypeScript Compiler API 直接操作 AST。这是"前端"——把高级语法糖剥离，转换成函数调用构成的"扁平"中间代码。
- **阶段 2（执行生成 IR）** 通过**实际执行**（`import()` + tsx）`.gs.ts` 文件来生成 IR。这是因为节点图的构建本质上是一个**运行时过程**：`g.server()` / `f.add()` 这些调用在 JS 层面执行时会调用 `ir_builder` 记录节点和连接。
- **阶段 3（序列化）** 是"后端"——把平台无关的 IR JSON 映射到游戏特定的 GIA 二进制格式。

### 3.3 并行编译

阶段 2 和阶段 3 都支持**多文件并行编译**（通过 `runWithLimit` 控制并发数，默认使用 `cpu 核心数 - 1`）。

---

## 4. 核心模块关系图

```
┌─────────────────────────────────────────────────┐
│  src/runtime/                                     │
│    core.ts        — DSL 层：g.server, gstsServer* │
│    ir_builder.ts  — IR 构建器（记录节点和连线）    │
│    value.ts       — 值类型系统（int, str, vec3…)  │
│    composite_registry.ts — 复合节点支持            │
│    variables.ts   — 节点图变量管理                 │
│    server_globals.ts — 全局注册表                 │
│    IR.d.ts        — IR 类型定义                   │
└──────┬──────────────────────────────────────────┘
       │ 被阶段一变换引用，被阶段二执行
       ▼
┌─────────────────────────────────────────────────┐
│  src/compiler/                                    │
│    ts_to_gs_pipeline.ts        — 阶段 1 编排       │
│    ts_to_gs_transform/         — 阶段 1 变换器     │
│      index.ts  — transformToGs 入口              │
│      stmt.ts   — 语句（if/switch/loop/return…)   │
│      expr.ts   — 表达式变换                       │
│      loops.ts  — 循环（for/while/do-while/for-of)│
│      ops.ts    — 运算符映射                       │
│      builtins.ts — 内建函数映射                    │
│      lists.ts  — 列表类型推断                      │
│      const_eval.ts — 常量折叠                     │
│      types.ts  — Env/TransformCtx 类型            │
│    gs_to_ir_json_transform/   — 阶段 2 编排        │
│      index.ts  — emitIrJsonForEntries             │
│      runner.ts — 执行入口（import + buildIR）      │
│    ir_to_gia_transform/       — 阶段 3 变换        │
│      index.ts  — irToGia 主函数                   │
│      preprocess.ts — IR 预处理（列表展开）          │
│      mappings.ts — TS 类型 ↔ GIA 节点/枚举映射    │
│      node_id.ts — 节点 ID 解析                    │
│      pins.ts   — 引脚值设置                        │
│      layout.ts — 节点自动布局                      │
│      composite.ts — 复合节点 GIA 编码             │
│      optimize_timer_dispatch.ts — timer 优化      │
│    ir_merge.ts  — IR JSON 合并                    │
│    gsts_config.ts — 配置类型                      │
│    config_loader.ts — 配置加载                     │
└──────┬──────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────┐
│  src/injector/    — .gia → .gil 注入              │
│    index.ts      — createInjector 入口            │
│    proto.ts      — protobuf 加载                  │
│    binary.ts     — 二进制解析（varint/field 读取） │
│    node_graph.ts — 节点图提取/扫描                 │
│    signal_nodes.ts — 信号节点补丁                  │
│    folder.ts     — GIL 文件夹索引                  │
│    types.ts      — 类型定义                        │
└─────────────────────────────────────────────────┘
```

---

## 5. 配置系统

配置文件 (`gsts.config.ts`) 使用 Zod 定义 schema：

```typescript
interface GstsConfig {
  compileRoot: string       // 编译根目录
  entries: string[]         // 入口文件 glob 模式
  outDir: string            // 输出目录
  inject?: {                // 注入参数
    gameRegion: string
    playerId: number
    mapId: number
    nodeGraphId?: number
  }
  options?: {
    optimize?: {
      precompileExpression?: boolean   // 常量折叠
      removeUnusedNodes?: boolean      // 移除无用节点
      timerPool?: boolean              // timer 名称池
      timerDispatchAggregate?: boolean // timer 分发聚合
    }
  }
}
```

测试配置 (`gsts.test.config.ts`) 将 `compileRoot` 指向 `.`，`entries` 指向 `./tests`，并默认关闭优化选项以暴露所有潜在问题。

---

## 6. 数据流摘要

### 6.1 控制流

节点图中的"控制流"对应可执行链（绿色/灰色连线）。在 TS 中表现为：

- **事件入口**: `g.server(…).on('eventName', (evt, f) => { … })` 触发整个图
- **控制流分支**: `if/else` → `doubleBranch` 节点；`switch` → `multipleBranches` 节点
- **循环**: `for/while/do-while/for-of` → 底层的循环节点（如 `listIterationLoop`）
- **函数复用**: `gstsServer*` 函数被提取为独立的子图，通过 `call_gsts_server` 调用

### 6.2 数据流

- **局部变量**: 分析变量使用模式（读写次数、是否在循环中、是否被修改）后，决定是否映射为节点图的 `LocalVariable`
- **值传递**: 所有值通过"数据引脚"连线传递。基本类型（int、float、str 等）通过字面量或变量引用传递
- **集合类型**: list/dict 需要特殊处理——区分"实时引用"（liveRef）、"显式复制"（copy）、"临时集合"（temporary）

---

## 7. 测试架构

gsts **没有使用 Jest/Vitest 等测试框架**。测试以 `.ts` 文件形式放在 `tests/` 目录下，通过 gsts 自身编译。编译成功即测试通过。

```
tests/
├── generated/      # 自动生成：由 generate-node-gia-tests.ts 为每个
│                   # server F 方法生成调用测试
├── enum_cases/     # 枚举参数测试
├── composite/      # 复合节点测试（手动编写）
├── risk/           # 有风险的边界情况测试
├── other/          # 其他杂项测试
└── *.ts            # 手动编写：timer、loop、变量语义等
```

此外在 `scripts/` 下有 `assert-*.ts` 脚本，可用 `tsx` 单独运行以验证特定的编译行为。
