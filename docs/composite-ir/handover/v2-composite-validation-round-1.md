# V2 复合节点验证交接文档 · 第一轮

> 状态：待继续 / 当前推荐工作入口
> 来源：当前代码实现 + 当前文档体系 + 游戏导出目录盘点 + 用户长期目标
> 最近校验：2026-07-08
> 适用范围：从游戏目录中已真实测试通过的 `.gia` 逐个复刻或改写，验证 gsts 当前复合节点支持能力；不代表所有复合节点能力已完成

> **本轮目标**：为新的长期验证线建立起点：基于游戏目录 `真-测试通过` 中已经通过的 GIA，创建 `v2` 归档目录，后续逐个分析、复刻或改写，并用游戏内测试确认 gsts 对复合节点和节点图 API 的支持边界。
> **必须先读的工作细节**：[layout-working-rules.md](layout-working-rules.md)（小步验证、命名、导出、用户沟通规则）
> **当前推荐低层控制流 API**：[../../architecture/composite/raw-control-flow-dsl-quickstart.md](../../architecture/composite/raw-control-flow-dsl-quickstart.md)
> **当前复合节点 API**：[../../architecture/composite/dsl-api.md](../../architecture/composite/dsl-api.md)
> **工具索引**：[../../gia-tools-reference.md](../../gia-tools-reference.md)

---

## 一、本轮背景

用户明确了新的长期目标：

1. 从游戏目录中真实测试通过的 `.gia` 开始。
2. 逐个查看、分析、复刻或改写这些文件。
3. 完整验证当前 gsts 对复合节点的支持能力。
4. 用户会高度参与质量把控和方向控制。
5. 新产物进入 `v2` 版本目录，避免污染已有通过归档。

本轮不是布局调参，也不是马上改编译器功能；核心是建立正确目录、确认现有资料和 API 口径，并留下下一轮可直接继续的交接入口。

---

## 二、本轮已确认的游戏目录

游戏导出根目录：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export
```

该目录下已确认存在：

```text
composite/
gsts-layout-test/
t/
test/
ts_test_passed/
user_edit/
复杂gia/
实用/
布局/
真-测试通过/
```

本轮重点目录是：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/真-测试通过
```

其中已有多批游戏内通过的 `.gia`，包括但不限于：

```text
basic_call.gia
basic_call_param.gia
demo_A_basic_call.gia
demo_B_exec_call.gia
demo_C_nested_call.gia
mixed_composite_and_normal.gia
nested_exact.gia
phase1_system_nodes.gia
phase2_normal_nodes.gia
phase2_reference_patterns.gia
recreate_debug3.gia
recreate_debug4_v2.gia
recreate_debug5.gia
recreate_debug6.gia
replicate_mul3.gia
simple_double.gia
two_exec.gia
two_simple.gia
两个复合节点.gia
全覆盖类型复合.gia
全覆盖类型转化.gia
分支2-精确.gia
完整创建爱心流程.gia
节点图变量.gia
```

另有布局类通过文件在：

```text
真-测试通过/布局/
```

---

## 三、本轮已创建的 V2 归档目录

已创建：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/真-测试通过/v2
```

当前状态：空目录。

本轮没有移动、覆盖或删除 `真-测试通过` 中已有文件。

建议后续用途：

1. 放新的 v2 生成 `.gia`。
2. 放用户游戏内确认通过后的归档版本。
3. 如需记录对照材料，可按样本建子目录或使用同名前缀；不要把未验证中间产物伪装成已通过结果。

推荐命名：

```text
真-测试通过/v2/<case-name>-step1.gia
真-测试通过/v2/<case-name>-step2.gia
真-测试通过/v2/<case-name>-passed.gia
```

是否采用子目录制，等第一批样本确定后再和用户确认。

---

## 四、当前 API 口径

后续新测试和新示例优先使用当前推荐 API，不沿用旧 handover 中的历史写法。

### 4.1 复合节点 API

优先入口：

```ts
g.defineComposite(...)
f.callComposite(...)
f.declareDetached(...)
```

语义：

- `f.callComposite(...)`：创建复合调用并自动接入当前执行链。
- `f.declareDetached(...)`：创建 detached 复合调用，不自动从当前 tail 连入，适合手工复刻 fan-in / fan-out / 多 InFlow 拓扑。

### 4.2 raw 控制流 API

优先入口：

```ts
f.entry()
f.node(...)
f.rawExecNode(...)
f.link(source, outIdx, target, inIdx?)
f.inflow(name, target, idx?)
f.outflow(name, source, idx?)
```

语义要点：

- `f.node()` 创建 detached 系统 exec 节点，不自动连线。
- `f.link()` 连接已存在节点的 `OutFlow -> InFlow`，支持 fan-in 和 fan-out。
- `f.inflow()` / `f.outflow()` 负责复合边界 pin 映射。
- `f.registerExecNode()` 会自动串联当前 tail；只有确实需要自动串联语义时再用。
- `f.eventMarker()`、`f.linkTo()`、`f.leaf()` 仍可作为历史/兼容上下文理解，但新示例优先用 `entry/link/outflow`。

### 4.3 测试写法原则

普通高层行为测试优先用高层 `f.xxx()` DSL。

精确复刻真实 `.gia` 拓扑时，用 raw API 显式表达：

```ts
const entry = f.entry()
const a = f.node('...')
const b = f.node('...')
f.link(entry, 0, a)
f.link(a, 0, b)
```

不要用 `registerExecNode()` 代替 `node()` 做主图普通手工复刻；前者会推进 tail，容易把“创建节点”和“连线”耦合起来。

---

## 五、开工前必须读取的资料

后续每一轮开始前，必须先读取 `layout-working-rules.md`，尤其是其中关于“小步迭代、导出独立 GIA、用户游戏内验证、命名同步、通过后再提交”的工作细节。不要只依赖本文档摘要；如果规则和本文档有冲突，以 `layout-working-rules.md` 的通用协作规则为准，并在新 handover 中记录本轮特有例外。

本轮已按文档治理规则确认以下入口：

```text
docs/documentation-map.md
docs/documentation-governance.md
docs/architecture/composite/raw-control-flow-dsl-quickstart.md
docs/architecture/composite/dsl-api.md
docs/architecture/composite/ir-representation.md
docs/architecture/composite/gia-encoding.md
docs/composite-ir/index.md
docs/composite-ir/analyze-workflow.md
docs/composite-ir/01-ir-types.md
docs/composite-ir/03-validation-basics.md
docs/composite-ir/06-advanced-patterns.md
docs/gia-tools-reference.md
docs/composite-ir/handover/layout-working-rules.md
```

后续如果继续写 handover，应继续遵守 `layout-working-rules.md` 第七节：handover 只记录本轮特有事实，通用路径、命令、小步验证规则不要重复复制。

特别强调：每次修改前都要先和用户确认当前 step 的目标与验收点；每次只改一个用户可以在游戏内验证的 step。不要一次性连续改多个样本或多个维度后再让用户一起验收。

---

## 六、建议的 V2 单样本工作流

每个样本建议按以下节奏推进。核心节奏必须是：**和用户确认目标 -> 只改一个可验证 step -> 同步测试文件名、节点图 name、GIA 文件名 -> 导出给用户游戏内验证 -> 用户通过后再继续下一步或提交**。

### 6.1 选择样本

从 `真-测试通过` 中选择一个 `.gia`，优先从小到大：

1. `basic_call.gia`
2. `basic_call_param.gia`
3. `two_exec.gia`
4. `two_simple.gia`
5. `demo_A_basic_call.gia`
6. `demo_B_exec_call.gia`
7. `demo_C_nested_call.gia`
8. `phase1_system_nodes.gia`
9. `phase2_normal_nodes.gia`
10. `phase2_reference_patterns.gia`

如果用户指定样本，以用户指定为准。

### 6.2 分析真实通过 GIA

优先跑：

```bash
npx tsx tests/composite/trace-exec-flow.ts '<file.gia>' --io
npx tsx tests/composite/trace-dataflow.ts '<file.gia>' --list-nodes
```

必要时补充：

```bash
npx tsx tools/decode-gia.ts '<file.gia>' > /tmp/<case>.decoded.json
npx tsx tests/composite/gia-inspect.ts '<file.gia>'
npx tsx tools/topology.ts '<file.gia>'
```

记录时必须区分：

- 真实 GIA 观察结果。
- gsts 当前实现能否表达。
- 是否只是推测。

### 6.3 编写或改写测试

测试源码建议先放项目内，并按 step 命名：

```text
tests/composite/v2/<case-name>-step1.ts
tests/composite/v2/<case-name>-step2.ts
```

当前该目录尚未创建；第一轮实际开始写样本时再建。

测试文件、节点图 name、导出 GIA 文件名必须同步表达同一个 step，避免用户在游戏里看到旧图名或混淆版本。例如：

```text
测试文件：tests/composite/v2/basic-call-step1.ts
节点图名：V2-basic-call-step1
导出文件：真-测试通过/v2/basic-call-step1.gia
```

每个 step 只承担一个用户可以验证的问题，例如“基础调用结构是否能导入并执行”、“参数调用是否连线正确”、“多 OutFlow 是否能继续接下游”。不要在一个 step 里同时验证多个新能力。

如果样本更像普通 gsts CLI 测试，也可以放在 `tests/` 根目录，但需要先和用户确认归档策略，避免和现有 layout 系列混在一起。

### 6.4 生成 GIA

如果只新增/修改测试文件且不改编译器代码，可直接：

```bash
node bin/gsts.mjs tests/composite/v2/<case-name>.ts || true
```

如果改了 runtime / compiler / layout / Stage3，需要先：

```bash
npm run build
```

### 6.5 复制到游戏目录

未验证中间产物可以先复制到游戏导出根目录或 `真-测试通过/v2`，但要在对话中说清楚验证状态，并把完整路径发给用户。导出前必须检查测试文件中的 `g.server({ name })` 是否已经更新到当前 step。

推荐通过后归档到：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/真-测试通过/v2/<case-name>-stepN-passed.gia
```

覆盖同名文件前先删除旧文件：

```bash
rm -f '<target.gia>'
cp '<generated.gia>' '<target.gia>'
```

### 6.6 游戏内测试与提交

交给用户测试前，必须说明：

1. 当前 step 只改了什么。
2. 用户应在游戏里验证什么。
3. 复制后的完整 `.gia` 路径是什么。

用户游戏内确认通过后，再考虑：

1. 更新本轮 handover 或新增下一轮 handover。
2. 记录通过的测试文件名、节点图 name、导出 GIA 路径。
3. 如果有代码改动，运行 `git diff --check` 和必要 build。
4. 按小步提交。

如果用户反馈截图或问题，先读取截图或复述问题，再决定下一个最小 step；不要在同一次修改里同时修多个可能原因。

---

## 七、下一轮推荐第一个样本

建议从 `basic_call.gia` 或 `basic_call_param.gia` 开始。

理由：

1. 文件小，便于建立 v2 流程模板。
2. 覆盖最基础的 `defineComposite` / `callComposite`。
3. 能先验证“分析真实通过 GIA -> 写 v2 测试 -> 生成 -> 归档 -> 用户游戏内确认”的闭环。
4. 失败时更容易定位是 API 写法、GIA 编码还是测试流程问题。

第二批再进入：

```text
two_exec.gia
two_simple.gia
demo_C_nested_call.gia
phase1_system_nodes.gia
phase2_normal_nodes.gia
phase2_reference_patterns.gia
```

这些能逐步覆盖 exec-only、pure-data、嵌套复合、多 OutFlow、混合数据/执行流等能力。

---

## 八、当前风险和注意事项

1. `真-测试通过` 中的文件是“游戏内通过”的结果，但每个文件的源码来源、生成方式、是否对应当前 gsts 版本，需要逐个确认。
2. 不要把 `真-测试通过` 中的旧文件直接当成当前 API 教程；API 以当前 docs/architecture 文档和源码为准。
3. `tests/composite` 下已有历史 v2 单文件，但没有统一 `tests/composite/v2/` 目录；是否创建项目内 v2 测试目录应在第一批实际写测试时确认。
4. 真实编辑器 GIA 的 pinIndex 分配不能假设等于 gsts 默认值；关键是定义端和调用端一致。
5. 未经用户游戏内确认的生成文件，不应命名为 `passed`。
6. 当前工作区有未跟踪 `.agents` symlink；本轮未处理，提交文档时注意不要误加。

---

## 九、给下一位助手的一句话

> 新长期任务已经启动：以游戏目录 `真-测试通过` 中已通过的 `.gia` 为来源，逐个分析并用当前 gsts API 复刻/改写，验证复合节点支持能力。本轮已在 `真-测试通过/v2` 创建空归档目录，未移动旧文件。下一步必须先读 `layout-working-rules.md`，再从 `basic_call.gia` 或 `basic_call_param.gia` 开始，先跑 `trace-exec-flow --io` 和 `trace-dataflow --list-nodes`，再和用户确认 step 目标。测试文件、节点图 name、导出 GIA 文件名要同步带 step；每次只交付一个用户可验证 step，通过后再归档到 `真-测试通过/v2` 并记录下一轮 handover。
