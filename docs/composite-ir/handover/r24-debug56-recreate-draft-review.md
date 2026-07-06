# Session 交接：r24 debug5/debug6 复刻草稿已生成，但确认不是完美复刻

> **当前分支：** `feat/fork-api-and-layout`
> **当前状态：** 已基于 r23 outflow / fan-in API 写出 `debug5` / `debug6` 的可运行复刻草稿并复制到游戏目录，但 review 后确认它们不是严格复刻。下一轮应先和用户沟通复刻目标，再决定是否重写。
> **最新已知提交：**
>
> ```bash
> fc38acd test(composite): migrate phase2 outflow fixtures
> 5fc41e1 test(composite): migrate bool and phase1 outflow fixtures
> dcce975 feat(composite): add explicit outflow marker API
> ```

---

## 一、本轮新增内容

本轮新增了两个复刻脚本，并生成、复制了对应 GIA：

```text
tests/composite/recreate-debug5.ts
tests/composite/recreate-debug6.ts
tests/composite/output/recreate_debug5.gia
tests/composite/output/recreate_debug6.gia
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/recreate_debug5.gia
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/recreate_debug6.gia
```

两个脚本都能运行并自检通过：

```bash
npm run build
npx tsx tests/composite/recreate-debug5.ts
npx tsx tests/composite/recreate-debug6.ts
npx tsx tools/topology.ts tests/composite/output/recreate_debug5.gia
npx tsx tools/topology.ts tests/composite/output/recreate_debug6.gia
git diff --check
```

结果摘要：

| 文件 | 大小 | 自检结果 |
|------|------|----------|
| `tests/composite/output/recreate_debug5.gia` | 2639 B | 主图 5 节点 / 8 exec 边 / 1 data 边 |
| `tests/composite/output/recreate_debug6.gia` | 3870 B | 主图 6 节点 / 13 exec 边 / 1 data 边 |

复制到游戏目录后的文件大小：

```text
recreate_debug5.gia 2639 B
recreate_debug6.gia 3870 B
```

> 这些文件可以作为“拓扑级变体”交给用户进游戏试，但不能声明为严格复刻。

---

## 二、关键结论：这不是完美复刻

用户已明确指出两个核心偏差，下一轮必须以这两点为主线推进。

### 2.1 debug5 偏差：参考是系统节点，当前实现是复合包装

参考文件：

```text
debug5.gia 517 B
```

真实结构重点：

- 纯系统节点图。
- 无复合节点定义。
- 主图节点是原始系统节点：
  - n=1 / nid=36: `When Custom Variable Changes`
  - n=2 / nid=190: `Forwarding Event`
  - n=3 / nid=5: `Finite Loop`
  - n=4 / nid=19: `Set Local Variable`
  - n=5 / nid=1: `Print String`

当前草稿：

- 用 `g.defineComposite(...)` 把 `Forwarding Event` / `Finite Loop` / `Set Local Variable` / `Print String` 各自包成复合节点。
- 主图节点数和 exec/data 边数对齐了，但节点类别不对。
- 当前 `recreate_debug5.gia` 有 4 个 CompositeDef；参考 `debug5.gia` 是 0 个 CompositeDef。

对比：

| 项 | 参考 `debug5.gia` | 当前 `recreate_debug5.gia` |
|----|-------------------|-----------------------------|
| 文件大小 | 517 B | 2639 B |
| 主图节点数 | 5 | 5 |
| exec 边 | 8 | 8 |
| data 边 | 1 | 1 |
| CompositeDefs | 0 | 4 |
| 节点形态 | 系统节点 | 复合调用包装系统节点 |

结论：

> 当前 debug5 只能算“主图 edge-count 等价”，不是结构等价，更不是原始系统节点复刻。

### 2.2 debug6 偏差：参考复杂复合有多个控制流引脚，当前合并成一个入口

参考文件：

```text
debug6.gia 1607 B
```

本轮 trace / decode 后确认：

```text
CompositeDef: 复杂分支
I=[有限循环,开始转化事件,开始设置局部变量,开始打印字符串]
O=[循环体,循环完成,打印字符串,设置局部变量,事件转发完成]
In=[]
Out=[当前循环值:3]
impl: 4 nodes
```

也就是说，参考 `复杂分支` 的外部控制流入口不是一个，而是 4 个：

| InFlow index | 名称 |
|--------------|------|
| 0 | 有限循环 |
| 1 | 开始转化事件 |
| 2 | 开始设置局部变量 |
| 3 | 开始打印字符串 |

当前草稿：

- `complexBranch` 只用普通 `g.defineComposite` 定义。
- 主图中只有一个 `f.declareDetached(complexBranch, {})` 得到的复合调用入口。
- 所有来源都通过 `f.linkTo(..., n11)` 连到同一个入口，等价于把参考文件的多个控制流入口合并为一个入口。

对比：

| 项 | 参考 `debug6.gia` | 当前 `recreate_debug6.gia` |
|----|-------------------|-----------------------------|
| 文件大小 | 1607 B | 3870 B |
| 主图节点数 | 6 | 6 |
| exec 边 | 13 | 13 |
| data 边 | 1 | 1 |
| CompositeDefs | 1 | 5 |
| `复杂分支` InFlow | 4 个具名入口 | 实际调用入口被合并成 1 个 |
| 基础系统节点 | 主图系统节点 | 复合包装节点 |

结论：

> 当前 debug6 的 main graph edge-count 对齐了，但没有复刻参考 `复杂分支` 的多入口控制流接口，这是下一轮最重要的问题。

---

## 三、本轮有价值的发现

### 3.1 trace / decode 工具确认的信息

建议工具顺序是对的：

1. 先跑 `tools/topology.ts` 和 `tests/composite/trace-exec-flow.ts` 看主图。
2. 再用 `tools/decode-gia.ts` + `jq` 查 pin / accessory / compositePins。
3. 对复合接口用 `tools/analyze-composite-gia.ts`。

关键命令：

```bash
REF_DIR="/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/user_edit/分支"
DEBUG5="$REF_DIR/debug5.gia"
DEBUG6="$REF_DIR/debug6.gia"

npx tsx tools/topology.ts "$DEBUG5"
npx tsx tools/topology.ts "$DEBUG6"
npx tsx tests/composite/trace-exec-flow.ts "$DEBUG5"
npx tsx tests/composite/trace-exec-flow.ts "$DEBUG6"
npx tsx tools/analyze-composite-gia.ts "$DEBUG6"
npx tsx tools/decode-gia.ts "$DEBUG5" > /tmp/debug5.json
npx tsx tools/decode-gia.ts "$DEBUG6" > /tmp/debug6.json
```

已确认节点映射：

| nid | 名称 | gsts nodeType / API |
|-----|------|----------------------|
| 36 | When Custom Variable Changes | `g.server().on('whenCustomVariableChanges', ...)` |
| 190 | Forwarding Event | `forwarding_event` / `f.forwardingEvent(...)` |
| 5 | Finite Loop | `finite_loop` / `f.finiteLoop(...)` |
| 19 | Set Local Variable | `set_local_variable` / `f.setLocalVariable(...)` |
| 1 | Print String | `print_string` / `f.printString(...)` |

### 3.2 debug5 参考拓扑

```text
n=1.OutFlow[0] -> n=2, n=3, n=5
n=2.OutFlow[0] -> n=4
n=3.OutFlow[0] -> n=4
n=3.OutFlow[1] -> n=2, n=5
n=4.OutFlow[0] -> n=5
```

data edge：

```text
n=2.InParam[0] <- n=1.OutParam[0]
```

### 3.3 debug6 参考拓扑

```text
n=1.OutFlow[0] -> n=2, n=3, n=5, n=11
n=2.OutFlow[0] -> n=4, n=11
n=3.OutFlow[0] -> n=4, n=11
n=3.OutFlow[1] -> n=2, n=5, n=11
n=4.OutFlow[0] -> n=5, n=11
```

data edge：

```text
n=2.InParam[0] <- n=1.OutParam[0]
```

### 3.4 `复杂分支` impl graph

decode 出来的 impl 内部节点：

| impl nodeIndex | nid | 名称 |
|----------------|-----|------|
| 6 | 190 | Forwarding Event |
| 7 | 5 | Finite Loop |
| 8 | 19 | Set Local Variable |
| 9 | 1 | Print String |

impl 内部 exec 边：

```text
n=6.OutFlow[0] -> n=8
n=7.OutFlow[0] -> n=8
n=7.OutFlow[1] -> n=6, n=9
n=8.OutFlow[0] -> n=9
```

compositePins 映射重点：

```text
outer InFlow[0] -> inner n=7.InFlow[0]
outer InFlow[1] -> inner n=6.InFlow[0]
outer InFlow[2] -> inner n=8.InFlow[0]
outer InFlow[3] -> inner n=9.InFlow[0]

outer OutFlow[0] -> inner n=7.OutFlow[0]
outer OutFlow[1] -> inner n=7.OutFlow[1]
outer OutFlow[2] -> inner n=9.OutFlow[0]
outer OutFlow[3] -> inner n=8.OutFlow[0]
outer OutFlow[4] -> inner n=6.OutFlow[0]

outer OutParam[0] -> inner n=7.OutParam[0]
```

---

## 四、下一轮建议路线

### 4.1 先和用户确认目标，不要直接重写

下一轮模型必须先和用户沟通方向，尤其要确认：

1. **目标到底是“游戏可运行拓扑变体”，还是“尽可能贴近参考文件的结构复刻”？**
   - 当前草稿属于前者。
   - 用户刚刚明确指出两点偏差，说明更希望推进后者。

2. **debug5 是否必须做到 0 CompositeDefs？**
   - 如果必须，就不能再用 wrapper composite 包系统节点。
   - 需要探索是否能在主图直接 `registerExecNode` / raw marker 化系统节点，并用 `linkTo` 连接。

3. **debug6 是否必须复刻 `复杂分支` 的 4 个 InFlow 入口？**
   - 如果必须，需要扩展或绕过现有 `g.defineComposite` API。
   - 当前 API 可能只支持单入口复合调用；需要先判断是 API 能力缺口还是脚本写法问题。

4. **如果当前 API 无法表达多 InFlow 复合接口，是否允许修改 compiler/runtime API？**
   - 这是关键决策。
   - 不要擅自改 API；先给用户方案和风险。

> **重要提醒：下一轮模型要多和用户沟通想法、确认方向。不要默默重写，不要把“可运行”当作“复刻完成”。**

### 4.2 debug5 可能路线

目标：从 4 CompositeDefs 降到 0 CompositeDefs。

候选方案：

1. 尝试在 `g.server().on('whenCustomVariableChanges', ...)` 主图中直接调用高层 API：
   - `f.forwardingEvent(e.eventSourceEntity)`
   - `f.finiteLoop(...)`
   - `f.setLocalVariable(...)`
   - `f.printString(...)`

2. 问题：高层 API 会自动串联，不一定能表达 fan-out / fan-in / 反向边。

3. 如果高层 API 不够，探索能否暴露主图级 raw exec marker：
   - 当前 `f.registerExecNode(...)` 返回 `MetaCallRecordRef`，但 `f.linkTo(...)` 要求的是 composite marker `{ __markerNodeId }`。
   - 需要评估是否新增类似 `f.declareDetachedExecNode(...)` / `f.linkExecTo(...)` 的 API。
   - 这个方向涉及 API 设计，必须先和用户确认。

### 4.3 debug6 可能路线

目标：`CompositeDefs = 1`，且 `复杂分支` 外部控制流接口为 4 InFlow / 5 OutFlow / 0 InParam / 1 OutParam。

候选方案：

1. 在 `g.defineComposite` 里支持多 InFlow 入口声明。
   - 例如概念上需要表达：

```ts
g.defineComposite('复杂分支', {
  inflows: ['有限循环', '开始转化事件', '开始设置局部变量', '开始打印字符串'],
  outflows: ['循环体', '循环完成', '打印字符串', '设置局部变量', '事件转发完成'],
  outputs: { 当前循环值: { type: 'int' } },
  build(...) { ... }
})
```

2. 或者新增更低层的 CompositeDef builder，直接指定 compositePins。

3. 必须确保 call site 能把不同来源连到 `n=11.InFlow[0..3]`，不是全连到同一个入口。

4. 这可能触及：
   - `src/runtime/composite_registry.ts`
   - `src/runtime/core.ts`
   - `src/definitions/nodes.ts`
   - `src/compiler/ir_to_gia_transform/composite.ts`
   - `docs/architecture/composite/control-flow-api-cookbook.md`

### 4.4 当前草稿怎么处理

建议保留当前两个脚本作为草稿参考，但不要把它们当作最终复刻：

```text
tests/composite/recreate-debug5.ts
tests/composite/recreate-debug6.ts
```

它们有价值的部分：

- `linkTo` 表达 reverse edge / fan-in 的写法正确。
- 自检统计主图 exec/data 边的逻辑可复用。
- 输出复制流程已验证。

需要改的部分：

- debug5 不应产生 4 个 wrapper CompositeDef。
- debug6 不应产生 5 个 CompositeDef。
- debug6 的 `复杂分支` 不能把 4 个控制流入口合并成一个入口。

---

## 五、验证状态

本轮已跑过：

```bash
npm run build
npx tsx tests/composite/recreate-debug5.ts
npx tsx tests/composite/recreate-debug6.ts
npx tsx tools/topology.ts tests/composite/output/recreate_debug5.gia
npx tsx tools/topology.ts tests/composite/output/recreate_debug6.gia
git diff --check
```

已知限制：

- LSP diagnostics 未能执行：TypeScript LSP 未安装，且之前已拒绝安装。
- `npm test` / `npm run quicktest` 未跑；r23 handover 已记录它们有非本轮阻塞失败。

post-review 结果：

| lane | 结果 | 摘要 |
|------|------|------|
| Goal verification | 不通过严格复刻 | main graph edge-count 通过，但 CompositeDef 结构不匹配参考 |
| QA execution | 可测试，有偏差 | 输出可运行且已复制，但 debug5/debug6 都是 composite-wrapped variant |
| Code quality | 通过 | 脚本可维护，LOC 低于 250；非阻塞问题是 graphId / duplication / runtime flag |
| Security | 通过 | 固定路径、无 shell、无网络、无新依赖 |
| Context mining | 不通过严格复刻 | handover 明确要求 debug5 accessories 0、debug6 CompositeDefs 1 |

---

## 六、当前工作区状态

当前未跟踪文件：

```text
docs/composite-ir/handover/r23-outflow-api-done-debug56-next.md
docs/composite-ir/handover/r24-debug56-recreate-draft-review.md
tests/composite/recreate-debug5.ts
tests/composite/recreate-debug6.ts
```

本轮没有提交。

当前生成的 `.gia` 文件在 `tests/composite/output/` 和游戏目录中存在，但是否纳入 git 要等下一轮方向确认。参考 r22 先例，通常只提交 `.ts` 复刻脚本，`tests/composite/output/*.gia` 多数不是 git tracked；提交前务必先检查 `git status` / `git ls-files`。

---

## 七、下一轮第一句话建议

下一轮模型开始时建议先对用户说：

> 我先确认方向：你现在希望把 debug5/debug6 从“可运行拓扑变体”推进到“尽量贴近参考 GIA 的结构复刻”，对吗？如果是，我会优先解决两件事：debug5 去掉 wrapper CompositeDef，debug6 保留 `复杂分支` 的 4 个 InFlow 入口，而不是把入口合并成一个。若现有 API 表达不了，我会先给你 API 方案，不直接改。

这句话很重要。下一轮不要直接开写。

---

## 八、一句话总结

> 本轮产出了可运行的 `recreate_debug5.gia` / `recreate_debug6.gia` 并复制到游戏目录，但它们只是 main-graph edge-count 对齐的草稿：debug5 错在用复合包装了系统节点，debug6 错在把参考 `复杂分支` 的 4 个控制流入口合并成了 1 个。下一轮必须先和用户确认目标，再围绕“debug5 0 CompositeDefs”和“debug6 4 InFlow 复杂分支”继续推进。
