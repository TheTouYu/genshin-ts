# GIA/GIL 分析工具索引

> 状态：当前推荐
> 来源：当前工具实现 + 真实 GIA 分析流程
> 最近校验：2026-08-01
> 适用范围：gsts 当前工具链

> 本项目有约 30 个 GIA 分析/调试脚本，分散在 `tests/composite/` 和 `tools/` 下。本文按**使用场景**组织，告诉你遇到什么问题该用哪个工具。

---

## 1. 核心双工具组合：执行流 + 数据流

这两个工具覆盖了 GIA 分析的绝大部分需求，建议优先掌握。

### 1.1 `trace-exec-flow.ts`（原名 find-event-sources）

> 推荐通过 `npm run trace-exec -- <file.gia> ...` 调用，已自动屏蔽 Node/tsx deprecation warning；直接使用 `npx tsx` 时，JSON 输出请设置 `NODE_OPTIONS='--no-deprecation'`。

```
npx tsx tests/composite/trace-exec-flow.ts <文件.gia>
npx tsx tests/composite/trace-exec-flow.ts <文件.gia> --io
npx tsx tests/composite/trace-exec-flow.ts <文件.gia> --json [--depth=3]
npx tsx tests/composite/trace-exec-flow.ts <文件.gia> --json --io --depth=1
npx tsx tests/composite/trace-exec-flow.ts <文件.gia> --detail=5
npx tsx tests/composite/trace-exec-flow.ts <文件.gia> --expand=<复合名>
```

**能力：**

- 识别事件起点（无上游、有 Branch、非被调用）
- 渲染完整执行流树（含分支名：Double Branch 显示"是/否"，Multiple Branches 显示 case 值）
- `--expand` **穿透复合边界**，展开 impl 图内部事件源分析；嵌套复合节点会显示其当前 OutFlow 名称
- `--expand` 依赖 `compOutflows` 从主分析传入子图分析；`tests/composite/trace-exec-flow.ts` 已覆盖 `更新v、w -> 顺序执行` 场景
- `--json` 结构化输出，适合程序消费
- `--io` 输出每个节点的控制流输入/输出汇总，适合快速比对多 InFlow、多 OutFlow 和 fan-in/fan-out
- `--detail=N` 查看任意节点的完整引脚信息
- 孤悬节点检测

**典型用例：**

```bash
# 看整体执行骨架
npx tsx tests/composite/trace-exec-flow.ts 物理运动.gia

# 看每个节点的控制流输入/输出
npx tsx tests/composite/trace-exec-flow.ts 物理运动.gia --io

# 钻进复合节点看内部执行流
npx tsx tests/composite/trace-exec-flow.ts 传球.gia --expand=监听信号

# JSON 输出供后续分析
npx tsx tests/composite/trace-exec-flow.ts 弹球.gia --json --depth=3

# JSON 输出控制流 I/O，适合做小范围 diff
npx tsx tests/composite/trace-exec-flow.ts 弹球.gia --json --io --depth=1
```

### 1.2 `trace-dataflow.ts`

> 推荐通过 `npm run trace-dataflow -- <file.gia> ...` 调用。使用 `--composite` 时，节点索引必须来自该复合 impl 图的 `--list-nodes` 输出；主图节点索引和 impl-node-index 不可混用。

```
npx tsx tests/composite/trace-dataflow.ts <文件.gia> <节点索引|节点名> [参数索引...] [flags]
```

**flags：**

- `--all-params` 追溯目标节点的所有输入参数
- `--composite <复合名>` 定位到复合的 impl 图
- `--max-depth N` 追溯深度（默认 5）
- `--json` 嵌套 JSON 输出
- `--list-nodes / -l` 列出当前图的所有节点

**能力：**

- 从任意节点的 InParam 逆向追溯数据来源
- `⤷` 标记跨复合边界（从调用方进入被调复合的 impl 图）
- 支持手选指定参数索引追溯
- 当前工具实现会从 `CompositeDef.inputs` 解析复合调用节点的输入类型；已用真实 `user_edit/变量/bool.gia` 自动验证 bool 输入显示为 `Bol`，避免仅显示 `?`
- trace 展示的是 schema 解码后的语义结构，不能发现 schema 未声明的 protobuf unknown field；遇到“JSON 一致但游戏异常”时，必须增加无修改 round-trip 哈希或 wire 字段扫描

**典型用例：**

```bash
# 列出主图节点
npx tsx tests/composite/trace-dataflow.ts 物理运动.gia --list-nodes

# 追溯复合内节点的所有数据来源
npx tsx tests/composite/trace-dataflow.ts 传球.gia 3 --all-params --composite=监听信号

# 追溯指定参数，限制深度
npx tsx tests/composite/trace-dataflow.ts 物理运动.gia 5 0 1 --max-depth 10
```

### 1.3 组合工作流

```bash
# Step 1: 看执行骨架
npx tsx tests/composite/trace-exec-flow.ts 物理运动.gia

# Step 2: 钻进关键复合
npx tsx tests/composite/trace-exec-flow.ts 物理运动.gia --expand=物理运动控制器

# Step 3: 列出内部节点，找到感兴趣的数据节点
npx tsx tests/composite/trace-dataflow.ts 物理运动.gia --list-nodes --composite=物理运动控制器

# Step 4: 追溯数据来源
npx tsx tests/composite/trace-dataflow.ts 物理运动.gia 5 --all-params --composite=物理运动控制器
```

---

## 1.4 GIL NodeGraph 控制流与数据流分析

> 状态：当前实现
> 来源：当前工具实现 + 只读 GIL 自动验证
> 最近校验：2026-08-05
> 适用范围：所有使用 Genshin-TS 工具链的游戏项目

`.gil` 节点图分析采用两步工作流：先用控制流定位主要逻辑，再用数据流工具追踪指定节点的参数来源。不要使用一个命令默认打印整张图的控制流、数据流、所有参数和所有复合实现。

> 需要给玩家/策划做“这张图在跑什么”的人读式概要时，用 `explain-gil-node-graph.ts`（见下），一次性输出事件入口、控制流主干、参数来源和系统/复合节点说明；机器级分析仍用两步工作流。

### 一键解读（人读式概要）

```bash
npx tsx tools/explain-gil-node-graph.ts <地图.gil> --graph <图ID或名称>
npx tsx tools/explain-gil-node-graph.ts <地图.gil> --auto
npx tsx tools/explain-gil-node-graph.ts <地图.gil> --composite <复合名>
```

输出四段：

- 事件入口（`When ...` 事件节点）；
- 控制流执行树（从事件出发的分支主干，分支条件注明数据来源）；
- 参数来源（每个节点每个输入：上游节点输出 / 字面量值（枚举自动转名）/ 未连线）；
- 系统/复合节点：无 impl 图的定义节点标为“系统节点”（如发送信号/监听信号，无内部图，参数行为由信号名决定）；有 impl 图的标为“复合节点”并给出实现图 id。

`--composite` 只输出指定复合/系统节点的定义接口（inputs/outputs/inflows/outflows），有 impl 时附带实现图 id。

### 信号使用全量扫描

```bash
npx tsx tools/scan-gil-signals.ts <地图.gil>                    # 列出全部信号及使用图数
npx tsx tools/scan-gil-signals.ts <地图.gil> --signal 足球      # 指定信号的完整使用清单
npx tsx tools/scan-gil-signals.ts <地图.gil> --signal 足球 --json
```

扫描全部**主图 + 复合 impl 图**所有节点的信号 pin（`ClientExecNode`/`ClientSignal`，`i1.kind=5/6` 的字符串值）。信号名就编码在这些 pin 的 value 里，发送/监听节点是系统复合（无 impl 图）：

- `发送信号`：信号名 pin `compositePinIndex=3`；
- `监听信号`：信号名 pin `compositePinIndex=7`；
- `向服务器节点图发送信号`：信号名 pin `compositePinIndex=16`，事件/行为名填在输入参数（如"开始蓄力""发射足球"）。

输出按信号名聚合：发送/监听/其他三类节点清单（含图名+图ID+节点号），以及按图去重的图数统计。

真实 GIA 核验案例（2026-08-06，1835.gil）：游戏内"足球"信号显示 25 个图使用到，全量扫描结果 = 14 个主图 + 2 个复合 impl 图（物理运动控制器 n=36、评分 n=5，信号藏在复合实现内部）+ 9 个信号事件定义图。只扫主图会漏掉 impl 图与定义图（定义图用的复合叫"向服务器节点图发送信号"，不叫"发送信号"，按节点名过滤也会漏）。

### 控制流导航

```bash
npx tsx tools/trace-gil-exec-flow.ts <地图.gil> --graph <图ID或名称>
npx tsx tools/trace-gil-exec-flow.ts <地图.gil> --graph auto
npx tsx tools/trace-gil-exec-flow.ts <地图.gil> --composite <复合名>
```

控制流工具只输出：

- 事件入口和复合图外部 `InFlow` 入口；纯数据复合（没有 `InFlow`/`OutFlow`）不会误报为事件入口；
- 没有入口但存在执行边的孤立执行根会单独显示为“未连接入口的执行链”，JSON `paths` 中标记为 `entry_type=orphan-execution`；
- 节点索引、API 名称、分支名称和执行路径；
- 执行边数量、入口数量和复合节点接口；
- 循环、汇合和复合 `OutFlow` 出口标记。

它不会默认输出节点参数、全图数据流或复合图内部实现。`--composite` 才会把指定复合实现作为一张独立主图解析。

`--auto` 在存在唯一非空用户图时选择该图；发现多个候选时会列出名称、ID 和节点数并停止猜测；没有候选时回退到 `_GSTS_main`，再回退到文件中的第一个图。多候选时应显式使用 `--graph`，不要依赖图在文件中的顺序。

### 数据流定点追踪

```bash
npx tsx tools/trace-gil-dataflow.ts <地图.gil> \
  --graph <图ID或名称> \
  --node <节点索引或名称> \
  --input <参数索引或名称>

npx tsx tools/trace-gil-dataflow.ts <地图.gil> \
  --graph <图ID或名称> \
  --node <节点索引或名称> \
  --all-inputs
```

数据流工具只从指定节点的 `InParam` 出发，显示：

- 参数名称、类型、字面量或未连接状态；
- 直接来源节点及其 `OutParam`；
- 来源节点继续向上的相关输入依赖；
- 图变量、事件上下文、字面量等终点来源；
- 数据依赖确实穿过复合节点时的相关内部路径。

`--node` 必须明确指定；`--input` 和 `--all-inputs` 二选一。`--max-depth N` 可以限制递归深度，连续相同的大量字面量会保留起止索引和重复数量而折叠显示；直接使用 `--all-inputs` 时也遵循同一规则。

### JSON 输出

两个工具的 JSON 契约分开：

- 控制流：`input`、`target`、`event_entries`、`nodes`、`execution_edges`、`paths`、`composite_interfaces`；`paths` 还可包含 `entry_type=orphan-execution` 的孤立执行链；
- 数据流：`input`、`target_node`、`target_inputs`、`dependency_paths`、`terminal_sources`。

控制流 JSON 不包含全图 `dataflow`，数据流 JSON 不包含全图 `flow` 或节点目录。当前 focused 回归为：

```bash
npx tsx tests/gil_nodegraph_tools_test.ts
```

它在仓库 fixture 上锁定唯一 `--auto`、控制流/数据流 JSON 隔离、直接 `--all-inputs` 的重复参数折叠和根目录/模板脚本一致性；复杂真实 `.gil` 的矩阵核验仍需按具体样本另行记录。

### 低层兼容入口

```bash
npx tsx tools/parse-gil-node-graph.ts <地图.gil> --graph <图ID或名称>
npx tsx tools/parse-gil-node-graph.ts <地图.gil> --graph <图ID或名称> --full
```

`parse-gil-node-graph.ts` 默认只输出文件哈希、图统计和节点索引。`--full` 或显式 `--json` 才用于低层综合调试；日常分析优先使用上面的两个专用工具。

### 证据边界

这些工具只读 `.gil`，不会生成 `.gia`、注入 NodeGraph、覆盖地图或修改游戏文件。工具运行成功只证明当前解析器能够读取该文件；它不证明 GIA 生成、注入成功或游戏内行为正确。文档、自动运行、真实 GIL 观察和用户游戏核验必须分开记录。

## 2. 布局验证工具

验证 gsts 生成的 GIA 节点位置是否合理。

| 工具                        | 功能                                                                                                                  | 用法                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `ascii-layout.ts`           | **ASCII 布局图** — 将节点渲染为 2D 制表符图形，直观看到位置和连线；支持 `--composite <名称>` 选择 impl 图             | `npx tsx tests/composite/ascii-layout.ts [--composite <名称>] <文件.gia>` |
| `audit-layout.ts`           | **布局质量审计** — 重叠检测、间距过近（<20px）、OutFlow 分支分析；默认忽略无 exec 边的数据节点，可用 `--strict` 恢复  | `npx tsx tests/composite/audit-layout.ts [--strict] <文件.gia>`           |
| `dump-nodes.ts`             | **坐标 dump** — 输出所有 GIA 节点的 `nIdx @ (x, y)`                                                                   | `npx tsx tests/composite/dump-nodes.ts <文件.gia>`                        |
| `analyze-exec-lanes.ts`     | **执行分叉泳道分析** — 输出 fan-out parent/child 坐标、dx/dy、stepFromPrev                                            | `npx tsx tests/composite/analyze-exec-lanes.ts <文件.gia> [files...]`     |
| `calibrate-layout-lanes.ts` | **布局调参校准** — 输出 sibling step、exec/data Y 范围、blockBottom、gapAfterPrevBlock，适合对比参考 GIA 与 gsts 输出 | `npx tsx tests/composite/calibrate-layout-lanes.ts <文件.gia> [files...]` |

**典型问题 → 工具：**

- 节点全堆在一起？→ `ascii-layout.ts` 直观看
- 怀疑有坐标重叠？→ `audit-layout.ts` 精确检测
- 想批量比对坐标？→ `dump-nodes.ts` 输出文本，配合 diff
- 想看 fan-out lane 是否过高/过低？→ `analyze-exec-lanes.ts`
- 想反推 sibling 与上方数据区块的间距？→ `calibrate-layout-lanes.ts`

---

## 3. 跨文件对比工具

| 工具                      | 功能                                                 | 用法                                                                    |
| ------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| `gia-compare.ts`          | **多维度结构化语义对比** — 对比两个 GIA 的结构异同   | `npx tsx tests/composite/gia-compare.ts <a.gia> <b.gia>`                |
| `gia-diff.ts`             | **文件级结构 diff** — 逐字段 diff                    | `npx tsx tests/composite/gia-diff.ts <a.gia> <b.gia>`                   |
| `gia-inspect.ts`          | **模块化检查** — 单文件结构分析                      | `npx tsx tests/composite/gia-inspect.ts <文件.gia>`                     |
| `verify-composite-gia.ts` | **复合节点对比** — 生成的 GIA vs 参考 GIA 结构化对比 | `npx tsx tests/composite/verify-composite-gia.ts <生成.gia> <参考.gia>` |

**适用场景：** gsts 生成结果与游戏导出参考 GIA 做精确对比。

---

## 4. `tools/` — 独立分析脚本

> 推荐使用 `npm run gia:decode -- <file.gia>`、`npm run gia:inspect -- <file.gia>`、`npm run gia:compare -- <ref.gia> <gen.gia>` 和 `npm run gia:diff -- <ref.gia> <gen.gia>`，避免 deprecation warning 污染输出。`decode-gia.ts`、`analyze-composite-gia.ts`、`topology.ts` 支持 `--help`。

| 工具                                     | 功能                                                                                                                          | 用法                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `decode-gia.ts`                          | **解码 GIA → 完整 JSON**，支持 compact、header 校验、文件输出和 stdin                                                         | `npm run gia:decode -- <文件.gia> \| jq '...'`                                            |
| `analyze-composite-gia.ts`               | **CompositeDef/SignalDef 深度分析**，支持多文件对比                                                                           | `npx tsx tools/analyze-composite-gia.ts <f1.gia> [f2.gia ...]`                            |
| `analyze-gia-arch.ts`                    | **架构概览** — 分析复杂 GIA 的顶层结构                                                                                        | `npx tsx tools/analyze-gia-arch.ts`                                                       |
| `topology.ts`                            | **复合调用拓扑** — 主图中复合节点的调用关系图                                                                                 | `npx tsx tools/topology.ts <文件.gia>`                                                    |
| `coverage.ts`                            | **文档覆盖率** — 按已知模式分类复合定义                                                                                       | `npx tsx tools/coverage.ts <文件.gia>`                                                    |
| `gap-scan.ts`                            | **文档缺口扫描** — 用启发式找未知模式                                                                                         | `npx tsx tools/gap-scan.ts <文件.gia>`                                                    |
| `inspect-gil-custom-variables.ts`        | **GIL 自定义变量候选检查** — 只读显示变量名所在 protobuf 容器、字段路径及原始 wire 摘要                                       | `npx tsx tools/inspect-gil-custom-variables.ts <地图.gil> <变量名> [出现序号]`            |
| `scan-gil-custom-variable-candidates.ts` | **GIL 自定义变量批量候选扫描** — 按定义容器枚举名称、类型码、初值 wire 摘要及可识别的 CustomPrefab 所有者                     | `npx tsx tools/scan-gil-custom-variable-candidates.ts <地图.gil>`                         |
| `list-gil-node-graphs.ts`                | **GIL NodeGraph 列表** — 只读列出图 ID、类型、名称和节点数，用于先定位目标图                                                  | `npx tsx tools/list-gil-node-graphs.ts <地图.gil>`                                        |
| `compare-gil-node-graph.ts`              | **相邻 GIL 快照的定点 NodeGraph 比较** — 输出文件哈希、图元数据变化和 added/removed/changed 节点摘要；`--full` 才展开完整节点 | `npx tsx tools/compare-gil-node-graph.ts <before.gil> <after.gil> <nodeGraphId> [--full]` |
| `preview_markdown.ts`                    | **终端渲染 Markdown**                                                                                                         | `npx tsx tools/preview_markdown.ts <文件.md>`                                             |

**`decode-gia.ts` 选项与常用查询：**

```bash
# 紧凑 JSON，适合保存或跨进程传输
npm run gia:decode -- --compact <文件.gia> > decoded.json

# 校验 GIA 容器头尾；诊断输出写 stderr，不污染 JSON
npm run gia:decode -- --check-header <文件.gia> > decoded.json

# 输出到文件，stdout 不输出 JSON
npm run gia:decode -- -o decoded.json <文件.gia>

# 从 stdin 读取完整 GIA 容器
cat <文件.gia> | npm run gia:decode -- - --compact | jq '.graph'
```

`decode-gia.ts` 脚本本体的 stdout 只输出 JSON；`--check-header` 的校验结果和错误输出到 stderr。注意：通过
`npm run gia:decode -- ... > output.json` 时，npm 的脚本标题/lifecycle 文本可能混入 shell 重定向，不能直接假定
`output.json` 为纯 JSON。需要管道给 `jq` 或保存 JSON 时，优先直接调用：

```bash
NODE_OPTIONS='--no-deprecation' npx tsx tools/decode-gia.ts --compact <文件.gia> > output.json
```

直接使用 `npx tsx` 可能显示 Node 的 deprecation warning；上例用 `NODE_OPTIONS` 抑制它。

### 4.1 只读探查 GIL 自定义变量候选

变量资产写回的当前实现、术语边界、真实地图证据与支持范围以
[`architecture/gil-custom-variables.md`](architecture/gil-custom-variables.md) 为准；本节只维护工具用法。

```bash
npx tsx tools/inspect-gil-custom-variables.ts <地图.gil> <变量名> [出现序号]
```

该工具基于 `readGilPayloadFields()` 的通用 length-field 扫描，显示匹配变量名的直接容器和祖先
protobuf 字段摘要；它**不写入**地图，也不推断或修改资产。它适用于为自定义变量抽取器建立真实
GIL 字段证据：先用编辑器创建最小样本，再比较同一变量在类型/初值变动前后的输出。

### 4.2 相邻 GIL 快照中的 NodeGraph 单变化

未知节点编码、新功能或疑难 bug 优先查询 PKC 和当前 Authority；只有 coverage gap 才启动编辑器实验。让用户在专用 `_GSTS*` 图中每轮只改一个变量，保存相邻快照后运行：

```bash
npx tsx tools/list-gil-node-graphs.ts <after.gil>
npx tsx tools/compare-gil-node-graph.ts <before.gil> <after.gil> <nodeGraphId>
```

默认摘要用于快速判断节点是新增、删除、重建为新 `nodeIndex`，还是只变化 pins。确认唯一差异后才使用 `--full` 检查 `type`、`compositePinIndex`、value 和 connects，并为关键字段留下最小 PASS/FAIL 断言。不要未经规模评估就打印完整列表节点；不要把语义 JSON 默认值当成 wire presence；不要在规则闭合前调用待修生产 lowering 生成“证明候选”。

若需要验证可重放性，应在临时 GIL 副本上把“前快照目标图 + 手工增量”包装为完整 GIA，再通过现有 injector 整图替换并回读，与后一真实快照比较。临时替换成功不等于真实地图写回，更不等于游戏行为通过。

批量扫描可使用：

```bash
npx tsx tools/scan-gil-custom-variable-candidates.ts <地图.gil>
```

它仅将明确位于顶层 CustomPrefab 资源表的候选项关联到 prefab ID；嵌入 NodeGraph、实体实例或
其它复制/引用位置的同形条目会一并展示但不会被冒充为独立资产定义。字段 `3` 与内层类型标记的
对应关系、字段 `4`/`6` 的初始值语义、以及不在资源表中容器的玩家归属，都必须通过受控真实样本
差分确认；不能仅凭单个现有地图推断为稳定协议。

自定义变量资产的写回属于“变量注入”：直接修改目标 `.gil` 的资产字段，使地图加载时可读取更新后的
初始值。它不同于 `.gia` 节点图注入：不生成 GIA、不替换 NodeGraph、不需要 `nodeGraphId` 或图挂载。
写回前仍必须明确地图、玩家、资产 ID、变量变更和备份；写后重新解析只能证明文件结构，编辑器/游戏
是否接受并加载该值仍须由用户核验。

**`decode-gia.ts` 常用 jq 查询：**

```bash
# 查看所有 CompositeDef 名称
npx tsx tools/decode-gia.ts <文件> | jq '[.accessories[] | select(.which==12).name]'

# 查看主图节点
npx tsx tools/decode-gia.ts <文件> | jq '.graph.graph.inner.graph.nodes[]'

# 查看 compositePins
npx tsx tools/decode-gia.ts <文件> | jq '.accessories[] | select(.which==9) | .graph.inner.graph.compositePins'

# 统计 accessories 类型分布
npx tsx tools/decode-gia.ts <文件> | jq '[.accessories[].which] | sort | unique | map({which: ., count: [.accessories[] | select(.which==.)] | length})'
```

---

## 5. 明细 Dump 脚本（`tests/composite/_dump_*.ts`）

这些脚本用于深入探查 GIA 的特定方面。所有脚本都从命令行接受文件路径：

| 脚本                                   | 分析对象                      |
| -------------------------------------- | ----------------------------- |
| `_dump_accessories.ts`                 | accessories 总体结构          |
| `_dump_all_connections.ts`             | 所有连接                      |
| `_dump_all_dataflow.ts`                | 数据流连线                    |
| `_dump_all_dataflow2.ts`               | 扩展数据流（含复合边界）      |
| `_dump_branch_details.ts`              | 分支 pin 细节                 |
| `_dump_composite_outputs.ts`           | 复合输出 pin 映射             |
| `_dump_composite_pinrec.ts`            | 复合 pin 记录                 |
| `_dump_composite_types.ts`             | 复合类型分布                  |
| `_dump_dataflow_n9.ts`                 | 特定节点 n=9 的数据流         |
| `_dump_event_pinrecs.ts`               | 事件 pin 记录                 |
| `_dump_impl_graphs.ts`                 | impl 图节点（含嵌套复合标记） |
| `_dump_literal_values.ts`              | 字面值分布                    |
| `_dump_literals_deep.ts`               | 字面值深度扫描                |
| `_dump_mbranch.ts`                     | Multiple Branches 分析        |
| `_dump_n19n23.ts`                      | 节点 n=19/n=23 专项           |
| `_dump_outparams.ts`                   | OutParam 分布                 |
| `_dump_pinrec_debug.ts`                | pin 记录调试                  |
| `_dump_presets_deep.ts`                | 预制件深度分析                |
| `_dump_setvar_details.ts`              | setVariable 细节              |
| `_dump_setvar_enum.ts`                 | setVariable 枚举值            |
| `_dump_setvar_raw.ts`                  | setVariable 原始值            |
| `_dump_setvar_values.ts`               | setVariable 值分析            |
| `_dump_type_abbrevs.ts`                | 类型缩写统计                  |
| `_debug_graph.ts` / `_debug_graph2.ts` | 图结构调试                    |
| `_debug_pins.ts` / `_debug_pins2.ts`   | pin 调试                      |
| `_debug_trace.ts`                      | 追踪调试                      |
| `_debug_accessories.ts`                | accessories 调试              |
| `_draw_named_branches.ts`              | 命名分支可视化                |
| `_find_deepest_chains.ts`              | 最长执行链查找                |
| `_lookup_params.ts`                    | 参数查找                      |
| `_render_chains.ts`                    | 链渲染                        |
| `_trace_chains.ts`                     | 链追踪                        |

**用法统一：** `npx tsx tests/composite/_dump_XXX.ts <文件.gia>`

---

## 6. 工作流速查

### 调试 gsts 生成的 GIA

```bash
# 1. 整体骨架
npx tsx tests/composite/trace-exec-flow.ts 生成的.gia

# 2. 布局检查
npx tsx tests/composite/audit-layout.ts 生成的.gia

# 3. ASCII 布局可视化
npx tsx tests/composite/ascii-layout.ts 生成的.gia

# 4. 数据流追溯（找到感兴趣的节点后）
npx tsx tests/composite/trace-dataflow.ts 生成的.gia 3 --all-params
```

### 分析参考 GIA（游戏导出）

```bash
# 1. 列事件起点
npx tsx tests/composite/trace-exec-flow.ts 参考.gia

# 2. 展开每个复合看内部结构
npx tsx tests/composite/trace-exec-flow.ts 参考.gia --expand=复合名

# 3. 看复合定义
npx tsx tools/decode-gia.ts 参考.gia | jq '.accessories[] | select(.which==12) | .compositeDef.inner.def.name'

# 4. 看数据流
npx tsx tests/composite/trace-dataflow.ts 参考.gia --list-nodes --composite=复合名
```

### 对比生成 vs 参考

```bash
npx tsx tests/composite/verify-composite-gia.ts 生成.gia 参考.gia
npx tsx tests/composite/gia-compare.ts 生成.gia 参考.gia
```

---

## 7. 快速启动检查清单

初次接触一个 GIA 文件时：

```
□ npx tsx tests/composite/trace-exec-flow.ts <文件.gia>       — 执行骨架
□ npx tsx tests/composite/ascii-layout.ts <文件.gia>          — 布局可视化
□ npx tsx tests/composite/trace-exec-flow.ts <文件.gia> --expand=<所有复合> — 穿透复合
□ npx tsx tests/composite/trace-dataflow.ts <文件.gia> --list-nodes         — 节点列表
□ npx tsx tools/decode-gia.ts <文件.gia> | jq '.graph.graph.inner.graph.nodes | length'  — 节点数
```
