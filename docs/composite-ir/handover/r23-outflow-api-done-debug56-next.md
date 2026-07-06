# Session 交接：r23 outflow API 完成，下一轮复刻 debug5/debug6

> **当前分支：** `feat/fork-api-and-layout`
> **当前状态：** outflow API 重设计已完成并提交；下一轮重点是复刻 `debug5.gia` / `debug6.gia`，生成文件交给用户进游戏测试。
> **最新提交：**
>
> ```bash
> fc38acd test(composite): migrate phase2 outflow fixtures
> 5fc41e1 test(composite): migrate bool and phase1 outflow fixtures
> dcce975 feat(composite): add explicit outflow marker API
> ```

---

## 一、本轮完成内容

### 1.1 outflow API 已落地

本轮把 r21 handover 里讨论的“实例化 / 内部连线 / 出口标记三件事正交”真正落到代码里：

```ts
const db = f.registerExecNode('double_branch', [条件])
const ps = f.registerExecNode('print_string', [new str('是')])

f.connect(db, 0, ps)     // 内部连线：db.OutFlow[0] -> ps.InFlow[0]
f.outflow('是', ps, 0)   // 出口标记：ps.OutFlow[0] 升格为复合出口“是”
f.outflow('否', db, 1)   // 出口标记：db.OutFlow[1] 升格为复合出口“否”
```

涉及代码：

| 文件 | 变化 |
|------|------|
| `src/runtime/core.ts` | 新增 `MetaCallRegistry.outflow()` / `connect()`；`leaf()` 保留为 deprecated 兼容别名 |
| `src/definitions/nodes.ts` | 暴露 `f.outflow()` / `f.connect()` |
| `src/runtime/composite_registry.ts` | `CompositeCapture.outflowMarks` 替代 `leafMarks/outflowExitNodes`；OutFlow `compositePins` 仅由显式 outflow 标记生成 |
| `src/compiler/ir_to_gia_transform/composite.ts` | Bug B：`capture: true` 输入不再生成物理 InParam pin，只走 `compositePins` |

### 1.2 重要设计修正

- `f.leaf(i)` 没删，保留为兼容旧测试的 deprecated alias，会把当前 tail 标成 `outflow_${i}`。
- 没有采用“有 execNodes 但 0 outflow 就报错”的 strict 方案。
  - 原因：仓库已有合法 sink/terminal 复合，例如 `tests/composite/test-composite-part2.ts` 的 `打印2B`：有 exec 节点但 0 OutFlow。
  - 游戏/真实文件也存在终端下沉型复合；因此“选择性标记是否作为输出”允许 **0 个出口标记**。
- `f.connect(source, idx, target)` 会去重同一 `(source, target, idx)` 的旧默认边，避免 `registerExecNode` 自动串联 + 显式 `connect` 造成双边。

### 1.3 测试迁移

已迁移：

| 文件 | 内容 |
|------|------|
| `tests/composite/test-bool-input.ts` | 改成 ref `bool.gia` 形态：`double_branch.OutFlow[0] -> printString`，出口“是”挂 `printString`，“否”挂 `double_branch.OutFlow[1]` |
| `tests/composite/test-phase1-system-nodes.ts` | `顺序执行` 显式标 4 个 outflow，避免依赖旧隐式/硬编码规则 |
| `tests/composite/test-phase2-normal-nodes.ts` | P2-S1..S4 改为显式 `f.outflow(...)` |
| `tests/composite/test-phase2-reference-patterns.ts` | P2/P3/P5 改为显式 `f.outflow(...)`，并更新 Bug B 断言 |

---

## 二、验证状态

### 2.1 已通过

```bash
npm run build
npx tsx tests/composite/test-bool-input.ts
npx tsx tests/composite/test-phase1-system-nodes.ts
npx tsx tests/composite/test-phase2-normal-nodes.ts
npx tsx tests/composite/test-phase2-reference-patterns.ts
git diff --check
```

结果摘要：

- `test-bool-input.ts` ✅ 生成 `tests/composite/output/bool复合测试.gia`
- `test-phase1-system-nodes.ts` ✅ Phase 1 验证通过
- `test-phase2-normal-nodes.ts` ✅ `通过: 12 失败: 0`
- `test-phase2-reference-patterns.ts` ✅ `通过: 21 失败: 0`
- `debug4_v2` 已重新生成并复制给用户测试：

```bash
npx tsx tests/composite/recreate-debug4-v2.ts
cp tests/composite/output/recreate_debug4_v2.gia \
  "/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/recreate_debug4_v2.gia"
```

本轮重新生成的 `recreate_debug4_v2.gia`：

- 6 个 composite call
- 8 条 exec 边
- 1 条 data 边
- 文件大小 1884 B

### 2.2 已知非本轮阻塞

这些命令仍会失败，但失败点不是 outflow API 路径：

```bash
bash tests/composite/test-composite-runner.sh
npm run quicktest
```

观察到的失败：

- `test-composite-part3.ts`：`outputValue.getMetadata is not a function`
- `test-composite-part2.ts` 2C：`Value has no metadata: {"type":"int","value":null}`
- `quicktest`：停在 `tests/composite/recreate-debug3.ts:81` 的 `cannot infer list type`

下一轮做 debug5/debug6 前不需要先修这些，除非用户明确要求清主回归。

---

## 三、下一轮重点：复刻 debug5/debug6

### 3.1 目标交付物

下一轮目标不是继续改 outflow API，而是用现有 API 复刻并产出给用户测试：

```text
tests/composite/recreate-debug5.ts
tests/composite/recreate-debug6.ts
tests/composite/output/recreate_debug5.gia
tests/composite/output/recreate_debug6.gia
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/recreate_debug5.gia
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/recreate_debug6.gia
```

用户下一轮要进游戏测试这两个输出。

### 3.2 参考文件路径

```bash
REF_DIR="/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/user_edit/分支"
DEBUG5="$REF_DIR/debug5.gia"   # 517 B
DEBUG6="$REF_DIR/debug6.gia"   # 1607 B
```

目录当前确认存在：

```text
debug5.gia 517 B
debug6.gia 1607 B
```

### 3.3 已知 debug5 结构

`debug5.gia`：纯系统节点图，无复合。

| nIdx | nid | 已知角色 |
|------|-----|----------|
| 1 | 36 | 扇出 3 源，疑似服务器事件/入口节点 |
| 2 | 190 | 1 OutFlow -> n=4，1 InParam <- n=1 |
| 3 | 5 | Multiple Branches，2 个 OutFlow，各自扇出 |
| 4 | 19 | 1 OutFlow -> n=5，疑似 set variable 类 |
| 5 | 1 | printString terminal |

已知 exec 边：

```text
n=1.OutFlow[0] -> n=2, n=3, n=5
n=2.OutFlow[0] -> n=4
n=3.OutFlow[0] -> n=4
n=3.OutFlow[1] -> n=2, n=5
n=4.OutFlow[0] -> n=5
```

已知 data 边：

```text
n=2.InParam[0] <- n=1
```

关键难点：

- `debug5` 没有复合，理论上应该用系统节点 / marker 直接复刻。
- `n=3.OutFlow[1] -> n=2` 是反向边/重入，需要用 `f.linkTo(n3, 1, n2)` 风格表达。
- 如果没有真实 event 可直接复刻，可能需要 dummy event + `f.eventMarker()` 作为入口，和 r22 `debug4_v2` 一样显式连边。

### 3.4 已知 debug6 结构

`debug6.gia`：`debug5 + n=11 复合调用`。

| 项 | 已知信息 |
|----|----------|
| 节点数 | 6 |
| 复合数 | 1 |
| 复合名 | `复杂分支` |
| 复合 id | `1610612743` |
| n=11 | 复合调用，主图中 0 pins |

已知 exec 边：

```text
n=1.OutFlow[0] -> n=2, n=3, n=5, n=11
n=2.OutFlow[0] -> n=4, n=11
n=3.OutFlow[0] -> n=4, n=11
n=3.OutFlow[1] -> n=2, n=5, n=11
n=4.OutFlow[0] -> n=5, n=11
```

已知 data 边：

```text
n=2.InParam[0] <- n=1
```

关键难点：

- `n=11` 是 4 路 fan-in 目标，正好验证 r22 的 `declareDetached/linkTo/eventMarker` 能力。
- `n=11` 外部 0 pins，但 impl 内可能有 exec 节点；需要先完整 decode `debug6.gia` 的 accessories，看 `复杂分支` 的 impl。
- 不要误判为纯数据复合；“主图 0 pins”只说明外部接口 0/0/0/0，不说明 impl 无 exec。

---

## 四、下一轮建议流程

### 4.1 先 decode，不要先写代码

```bash
npx tsx tools/decode-gia.ts "$DEBUG5" > /tmp/debug5.json
npx tsx tools/decode-gia.ts "$DEBUG6" > /tmp/debug6.json
```

重点查：

```bash
jq '.graph.graph.inner.graph.nodes[] | {nodeIndex, genericId, concreteId, pins}' /tmp/debug5.json
jq '.graph.graph.inner.graph.nodes[] | {nodeIndex, genericId, concreteId, pins}' /tmp/debug6.json
jq '.accessories[] | select(.which==12 or .which==9)' /tmp/debug6.json
```

必须确认：

- nid 36 / 190 / 5 / 19 / 1 的准确语义和参数 pin。
- debug5 的 n=1 data source 到 n=2 InParam[0] 到底是什么类型。
- debug6 的 `复杂分支` CompositeDef 接口是否真的是 0 InFlow / 0 OutFlow / 0 InParam / 0 OutParam。
- `复杂分支` impl graph 是否有 nodes / pins / compositePins。

### 4.2 再写 `recreate-debug5.ts`

建议从 r22 `recreate-debug4-v2.ts` 的风格开始：

- 如果能用现有 `f.*` 方法直接注册 nid=36/190/5/19/1，对应写高层 API。
- 如果不能，使用低层 helper：`registerExecNode(...)` / `declareDetached(...)` / `linkTo(...)`。
- 目标验证不是字节一致，先做到结构一致：
  - 节点数 5
  - exec 边 8
  - data 边 1
  - accessories 0

### 4.3 再写 `recreate-debug6.ts`

建议复用 debug5 主图结构，然后新增 `复杂分支` 复合和 `r11 = f.declareDetached(...)`：

```ts
const r11 = f.declareDetached(complexBranch, {})
f.linkTo(ev, 0, r11)
f.linkTo(n2, 0, r11)
f.linkTo(n3, 0, r11)
f.linkTo(n3, 1, r11)
f.linkTo(n4, 0, r11)
```

实际参数和接口必须以 decode 出来的 `复杂分支` 为准。

目标验证：

- 主图节点数 6
- CompositeDefs = 1
- exec 边 13
- data 边 1
- n=11 为共享 fan-in 目标

### 4.4 输出到游戏目录

通过后复制：

```bash
cp tests/composite/output/recreate_debug5.gia \
  "/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/recreate_debug5.gia"

cp tests/composite/output/recreate_debug6.gia \
  "/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/recreate_debug6.gia"
```

然后让用户进游戏测试。

---

## 五、注意事项

1. 当前工作区在本文档创建前是 clean；本文档本身创建后会变成未提交文件。
2. 本轮 commits 已提交但未 push。
3. 不要 pop r21 stash；r21 的旧 `leafMarks` 方案已经被当前 `f.outflow(...)` 正式替代。
4. 下一轮如果要改复刻脚本，优先新增 `tests/composite/recreate-debug5.ts` / `recreate-debug6.ts`，不要动原始 `user_edit/分支/debug5.gia` / `debug6.gia`。
5. `recreate_debug4_v2.gia` 本轮已重新生成到游戏目录，可作为 fan-in 成功模板。

---

## 六、一句话总结

> r23 已完成复合 outflow API 的正交化：`registerExecNode` 负责实例化，`connect/linkTo` 负责内部/主图执行连线，`outflow` 负责出口标记。下一轮不要再改 API，直接 decode `debug5/debug6`，用 r22 fan-in 模式复刻并输出 `recreate_debug5.gia` / `recreate_debug6.gia` 给用户进游戏测试。
