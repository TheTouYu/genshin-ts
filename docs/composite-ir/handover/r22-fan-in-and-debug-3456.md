# Session 交接：复合节点 fan-in 支持 + debug3/4 精确复刻（r22，已完成）

> **目标轮次：** r22
> **当前状态：** **已完成、游戏中测试通过、未提交**。所有代码改动在工作区（未 stash、未 commit）。
> **核心交付：** 3 个新 gsts API（`f.declareDetached` / `f.linkTo` / `f.eventMarker`），让用户能在 DSL 层面表达"1 节点被多源触发"（fan-in）。debug4 复刻做到 6/6 节点 + 8/8 exec 边 + 1/1 data 边的精确结构匹配。

---

## 一、本轮工作脉络

### 1.1 用户提的 3 个连环问题

按时间顺序，用户推进了 3 件事，每一件都基于前一件的发现：

**Q1（结构理解）**: "用 trace-exec-flow + trace-dataflow 分析 `user_edit/分支/debug3.gia`"
→ 跑了 trace 工具，揭示 debug3 是"6 节点、0 事件、5 Double Branch 复合 + 1 Logical NOT 复合"的静态断头台，4 exec 边 + 1 data 边，全硬编码条件。

**Q2（实物对照）**: "再来看 `复杂gia/物理运动.gia`（118KB 真复杂图）"
→ 跑了 trace 工具，看到真实场景下：顺序执行（1→4）、Multiple Branches（10 case）、物理运动控制器（10 InFlow 多模态）、4 种控制流复合。

**Q3（关键概念纠正）**: "顺序执行 ≠ 并行 fork，是**严格串行**。形状像叉子只是视觉。"
→ 用户在 review 时明确指出：线 1 跑完才跑线 2，4 条 OutFlow 按 impl 内 connects 数组顺序触发。
→ 这是**最早的"打架"信号**，但当时还没意识到。

**Q4（纯数据 API 写法）**: "纯数据流那个复合节点，不应该用 `registerExecNode`，应该用 `f.xxx` 纯数据调用"
→ 改用 `f.logicalNotOperation(输入)`，避免 gsts 隐式加 InFlow，Logical NOT 真正变 I=0。

**Q5（debug4 复杂控制流）**: "debug4.gia 是个更复杂的控制流"
→ 跑了 7 个文件的全面扫描，触发"打架"问题暴露（见 §2.1）。

### 1.2 "打架"问题的完整演变

**阶段 1（用户描述）**: "API 因为代码变更，有几种写法，在打架了，非常混乱"

我列出 3 种写法：
- `f.leaf(idx)` — 显式标记当前 tail 节点 OutFlow[idx]（P2-S3 模式）
- `f.branchExec(sourceIdx, record)` — 创建新节点，外层 OutFlows 由 gsts 隐式透出
- `f.branchExec(0) + f.branchExec(1)` — 从 sourceIdx 0/1 各建一个节点

**阶段 2（关键发现）**: 跑 `phase2_normal_nodes.ts`（真-测试通过目录）vs 当前 gsts 输出，发现 **gsts 编译器有 regression**：
- 旧版（真-测试通过的 .gia）：`循环+打印叶子` 复合有 2 OutFlows（空名）
- 新版：同一源码生成的只有 0 OutFlows（`f.branchExec(0)` + `f.branchExec(1)` 失效）

**阶段 3（暴露规则）**: 跑了 `phase1_system_nodes.ts`（顺序执行），揭示 gsts 的**隐式透出规则**：
- entry=double_branch → 自动透出 是/否
- entry=finite_loop → 不透出
- entry=print_string → 不透出
- → 不可依赖

**结论**: `f.leaf(idx)` 是**唯一稳定**的 outer OutFlow 标记方式。

### 1.3 fan-in 实战暴露

**Q6（用户发现）**: "现在你复刻的 debug4 版本就和我的参考文件不一样，连线不一致。是你的写法问题还是 api 的问题？"

对比原 debug4.gia 和我的复刻：
- 原 debug4：**n=5 是 1 节点被 2 源引用（r3.是 + r7.是）**，**n=6 是 1 节点被 3 源引用（event + r3.是 + r7.否）**—— fan-in
- 我的 v1 复刻：n=5/n=6 各创建了 2-3 个独立节点——结构不等价

**根因（用户原话）**: "`f.connectOutFlow` callback 总是创建新节点"（验证：`src/runtime/core.ts:931-943` 的 `connectOutFlowBranch`，line 975 `tailEndpoints = [{ nodeId: record.id }]` 强制重置 tail）

**Q7（用户选择）**: "选 2，改 gsts"

→ 进入了 r22 的核心交付：给 gsts 加 fan-in API。

### 1.4 关键心智模型（避免再踩）

**不要把"实例化 / 内部连线 / 出口标记"耦合到一个 API 里**（这与 r21 §1.6 同源）。

3 件事正交：
1. **实例化**：创建 marker 节点（`f.callComposite` vs `f.declareDetached`）
2. **内部连线**：在已存在节点间加边（`f.linkTo`）
3. **出口标记**：声明节点 OutFlow 是外部接口（`f.leaf`）

任何"自动推断入口/出口"的写法都是陷阱。

---

## 二、r22 核心交付：3 个新 API

### 2.1 用户面 API（`ServerExecutionFlowFunctions`）

```ts
// 1. declareDetached: 创建 marker 但不自动串联到当前 tail
declareDetached(handle: CompositeHandle, inputs: Record<string, any>): Record<string, any>

// 2. linkTo: 在两个已存在 marker 间加一条 OutFlow→InFlow 边（fan-in / fan-out 都行）
linkTo(
  source: { __markerNodeId: number },
  sourceOutflowIdx: number,
  target: { __markerNodeId: number }
): void

// 3. eventMarker: 拿 event 节点的 marker（供 linkTo 作为源用）
eventMarker(): { __markerNodeId: number }
```

### 2.2 内部 API（`MetaCallRegistry`）

| 方法 | 行号（r22 后）| 作用 |
|------|--------------|------|
| `linkOutflowToMarker(srcId, srcOutflowIdx, tgtId)` | `src/runtime/core.ts:1190-1198` | 调 `addEdge` 加边，**不**创建新节点，**不**改 tail |
| `getEventMarkerId()` | `src/runtime/core.ts:1200-1204` | 返回 `flow.eventNode.id` |
| `runDetachedCompositeCall(compositeId, inputs, build)` | `src/runtime/core.ts:1206-1300` | 复制 `runCompositeCall` 但**绕过 `registerNode`**：直接 push 到 `flow.execNodes`，设置 head/tail 但**不**调 `connectFromEndpoints` |

### 2.3 关键设计决策

| 决策 | 原因 |
|------|------|
| **不修改 `registerNode`** | registerNode 是核心，改了 risk 太大。复制其 exec 处理逻辑到 `runDetachedCompositeCall` |
| **`linkOutflowToMarker` 直接调 `addEdge`** | 不需要新 exec context，不修改 tailEndpoints，**纯加边** |
| **`eventMarker` 返回 fake marker** | event 本身不是 callComposite，但需要 `__markerNodeId` 才能被 linkTo 用 |
| **Detached 仍设置 `tailEndpoints`** | 后续 declareDetached 才能链上（即便我们不连接，留着对调试有用）|
| **`addEdge` 不去重** | 与 gsts 现有行为一致；当前 `registerNode` 也不去重 |

### 2.4 现有 API 关系图

| API | 自动串联 | 创建新节点 | 用途 |
|-----|---------|----------|------|
| `f.callComposite(h, i)` | ✅ | ✅ | 主链顺序调用 |
| `f.declareDetached(h, i)` ✨ | ❌ | ✅ | 创建 detached marker（用 linkTo 显式连边）|
| `f.linkTo(src, idx, tgt)` ✨ | ❌ | ❌ | 在已存在节点间加边 |
| `f.connectOutFlow(r, idx, cb)` | n/a | ✅（在 callback 内）| 在 marker 的 OutFlow[idx] 触发后跑新代码 |
| `f.eventMarker()` ✨ | n/a | ❌ | 拿 event 节点做 linkTo 源 |
| `f.leaf(idx)` | n/a | ❌ | 标记当前 tail 节点 OutFlow[idx] 为外部出口 |
| `f.branchExec(srcIdx, rec)` | n/a | ✅ | 内部从 sourceIdx 分叉建新节点 |

---

## 三、复刻成果（debug3 + debug4 v1/v2）

### 3.1 debug3.gia 复刻

- **原文件**：`user_edit/分支/debug3.gia`（1442 B，6 节点，0 事件，4 exec + 1 data）
- **v1 复刻**（用 `f.registerExecNode` 错版）：1897 B
- **fix 复刻**（用 `f.leaf(0)+f.leaf(1)`）：1871 B
  - 13/13 结构断言通过
  - 复合接口：`DB I=1 O=2 In=1 Out=0` + `NOT I=0 O=0 In=1 Out=1`（与原 100% 匹配）
  - 数据线 n=2→n=3（1/1）
  - exec 边 5/4（多 1 条因为 n=3 扇出 2 路）
- **已复制到游戏**：`Beyond_Local_Export/recreate_debug3.gia`

### 3.2 debug4.gia 复刻

- **原文件**：`user_edit/分支/debug4.gia`（1571 B，7 节点，1 事件，8 exec + 1 data，含 fan-in n=5/n=6）
- **v1 复刻**（f.fork + connectOutFlow，n=5/n=6 各创建 2-3 个独立节点）：2264 B
- **v2 复刻**（用新 fan-in API）：1961 B
  - **6/6 节点匹配**（n=10 NOT, n=4 决策, n=3, n=7, n=5, n=6）
  - **8/8 exec 边匹配**（含 event→[r4,r6], r4→[r3,r7], r3→[r5,r6], r7→[r5,r6]）
  - **1/1 data 边匹配**（n=10→n=4.条件）
  - **n=5/n=6 是共享节点**（被多源触发），与原 debug4 拓扑完全等价
- **已复制到游戏**：`Beyond_Local_Export/recreate_debug4_v2.gia`

### 3.3 v2 写法（供 r23 复用）

```ts
g.server({ name: 'main' }).on('whenEntityIsCreated', (_e, f) => {
  const r10 = f.callComposite(notComp, { 输入: new bool(true) })
  const r4 = f.declareDetached(doubleBranch, { 条件: r10.结果 })
  const r3 = f.declareDetached(doubleBranch, { 条件: new bool(true) })
  const r7 = f.declareDetached(doubleBranch, { 条件: new bool(false) })
  const r5 = f.declareDetached(doubleBranch, { 条件: new bool(true) })
  const r6 = f.declareDetached(doubleBranch, { 条件: new bool(false) })

  const ev = f.eventMarker()
  f.linkTo(ev, 0, r4)
  f.linkTo(ev, 0, r6)
  f.linkTo(r4, 0, r3)
  f.linkTo(r4, 1, r7)
  f.linkTo(r3, 0, r5)
  f.linkTo(r3, 0, r6)
  f.linkTo(r7, 0, r5)
  f.linkTo(r7, 1, r6)
})
```

**关键**: `f.callComposite` 仍自动串联（r10 是数据源，连一下 OK），其他全部 `declareDetached` + `linkTo` 显式控制。

---

## 四、当前状态

### 4.1 代码改动（未 commit，未 stash）

```
$ git status --porcelain
 M docs/README.md                                           # 引用新文档
 M docs/architecture/composite/dsl-api.md                   # 头部加 link
 M docs/architecture/composite/multi-outflow-composite-guide.md  # 头部加 link
 M docs/composite-ir/todo.md                                # 记录 r22
 M src/definitions/nodes.ts                                 # +3 公共 API
 M src/runtime/core.ts                                      # +3 内部 API
?? docs/architecture/composite/control-flow-api-cookbook.md  # 新文档 (826 行)
?? docs/composite-ir/handover/r21-outflow-api-redesign-pending.md  # 上轮 r21 (未动)
?? docs/composite-ir/handover/r22-fan-in-and-debug-3456.md        # 本文档
?? tests/composite/recreate-debug3.ts
?? tests/composite/recreate-debug4.ts
?? tests/composite/recreate-debug4-v2.ts
```

**注意**: r21 的 stash **没有动**（r21 在 stash 里没 pop，r22 是独立的工作）。

### 4.2 Build / 测试状态

- `npm run build` ✅ 0 error
- 现有测试影响（regression 验证）:
  - **3 个 pre-existing fail**（跟我改动无关，git stash 验证过）:
    - `test-phase1-system-nodes`: P2-S2 失败（f.branchExec 那个 gsts regression）
    - `test-mixed-composite-normal`: outflows=0（f.printString 在 build 里没生成 outer OutFlow）
    - `exec-with-data`: 1 项失败
  - **我新增的 3 个方法: 0 regression**（已用 git stash 反复验证）
  - **我的复刻: 全 pass**:
    - `recreate-debug3`: 13/13 ✅
    - `recreate-debug4-v2`: 6/6 + 8/8 + 1/1 ✅
- **游戏中测试**: 用户在 Genshin 跑了 `recreate_debug4_v2.gia`，**行为与原 debug4.gia 一致**，fan-in 工作正常

### 4.3 已交付到游戏目录

```
/mnt/c/Users/touyu/.../Beyond_Local_Export/
├── debug3.gia                      (原, 1442 B, 不动)
├── debug4.gia                      (原, 1571 B, 不动)
├── recreate_debug3.gia             (r22, 1871 B, v1 fix 复刻)
├── recreate_debug4.gia             (r22, 2264 B, v1 f.fork 复刻, n=5/n=6 独立)
└── recreate_debug4_v2.gia          (r22, 1961 B, v2 fan-in API 复刻, n=5/n=6 共享) ← 用户测试通过
```

---

## 五、待办：debug5/debug6 复刻（r23 的任务）

### 5.1 debug5.gia 已知信息（用户升级版）

- **大小**：517 B（极简，**纯系统节点图，无任何复合**）
- **节点数**：5
- **复合数**：0（accessories 为空）
- **节点清单**：

| nIdx | nid | 角色 | 推测 |
|------|-----|------|------|
| 1 | 36 | 扇出 3 源（n=2/n=3/n=5）| 服务器事件 (Server Event) |
| 2 | 190 | 1 OutFlow → n=4，1 InParam ← n=1 | 数据接收节点 |
| 3 | 5 | 2 OutFlow[0,1] 各扇出多目标 | Multiple Branches (nid=5) |
| 4 | 19 | 1 OutFlow → n=5 | Set Variable 类 |
| 5 | 1 | 0 pins | printString (terminal) |

- **exec 边（8 条）**：
  ```
  n=1.OutFlow[0] → n=2, n=3, n=5     (扇出 3)
  n=2.OutFlow[0] → n=4
  n=3.OutFlow[0] → n=4
  n=3.OutFlow[1] → n=2, n=5         (扇出 2, OutFlow[1] 反向指回 n=2)
  n=4.OutFlow[0] → n=5
  ```
- **data 边（1 条）**：`n=2.InParam[0] ← n=1`（注意 n=1 没看到 OutParam，data source 可能是 event arg）
- **结构特征**：
  - **没有复合**，纯系统节点
  - 8 条 exec 边，3 处扇出，1 处**反向边**（n=3.OutFlow[1]→n=2，形成回环/重入）
  - 1 条 data 边

### 5.2 debug6.gia 已知信息（用户升级版）

- **大小**：1607 B
- **节点数**：6
- **复合数**：1
- **复合名**：`复杂分支`（id 1610612743）
- **n=11 nid=1610612743**：复合调用，0 pins（说明这是"**纯数据复合**"模式：impl 内有 exec 节点但外部只暴露 0 InFlow/0 OutFlow/0 InParam/0 OutParam 的话，**主图里这个 marker 节点 0 pins 是合法的**——需要进一步看 impl）

- **exec 边（13 条）**：
  ```
  n=1.OutFlow[0] → n=2, n=3, n=5, n=11   (扇出 4)
  n=2.OutFlow[0] → n=4, n=11
  n=3.OutFlow[0] → n=4, n=11
  n=3.OutFlow[1] → n=2, n=5, n=11
  n=4.OutFlow[0] → n=5, n=11
  ```
- **data 边（1 条）**：`n=2.InParam[0] ← n=1`
- **结构特征**：
  - debug5 + n=11 复合调用（`复杂分支`）
  - 所有非 terminal 节点都连到 n=11
  - n=11 是 n=1/n=2/n=3/n=4 都能触发的**扇入目标**（4 个 inflow）

### 5.3 r23 任务清单

1. **完整 decode debug5/debug6**: 拿到 impl 详情（n=11 的 复杂分支 长什么样、node nids 36/190/19/5/1 各是什么系统节点）
2. **写复刻源码**：
   - `tests/composite/recreate-debug5.ts`（纯系统节点，不需要复合定义）
   - `tests/composite/recreate-debug6.ts`（1 个复合 `复杂分支` + 主图调用）
3. **编译 GIA**：
   - `tests/composite/output/recreate_debug5.gia`
   - `tests/composite/output/recreate_debug6.gia`
4. **结构验证**：exec 边数、data 边数、复合接口、节点 nids
5. **复制到游戏**：
   - `Beyond_Local_Export/recreate_debug5.gia`
   - `Beyond_Local_Export/recreate_debug6.gia`
6. **写文档**：补充到 `control-flow-api-cookbook.md` §8.6

### 5.4 关键挑战

- **n=11 是 4 inflow 的扇入节点**——这正是 r22 实现的 fan-in 能力！debug6 是 fan-in 的真实场景，**不是抽象出来的**。是 r22 工作的进一步验证。
- debug5 **没有事件**——回到 debug3 类似的"静态断头台"边界。
- debug5 的 n=3.OutFlow[1]→n=2 是**反向边**（重入/循环引用），需要用 `f.linkTo(n3, 1, n2)` 显式表达。

---

## 六、git 找回（如果上下文丢失）

### 6.1 当前 branch / commit

```
$ git log -1 --oneline
cc60fcd r19: fix bool composite pin type and order

$ git branch
* feat/fork-api-and-layout  (1 commit ahead of origin, NOT pushed)
```

### 6.2 r21 stash（**不要 pop**）

```
$ git stash list
stash@{0}: WIP on <branch>: r21 — outflow API 重设计（未完成，详见 r21 handover）
```

**重要**: r21 是独立的"outflow API redesign"轨道（`f.leaf(name)` 思路），**已被 r22 的 fan-in API 路径取代**。**不要 pop r21 stash**——它跟 r22 的改动不兼容（同时改 `f.leaf` 签名和新增 `f.linkTo`）。

如果用户后来决定要把 r21 的 outflow API 思路整合进来，需要先决定：
- 是用 r22（fan-in 优先）+ 在 r22 基础上加 r21 的 `f.outflow(name, ref, pinIndex?)`？
- 还是用 r21（outflow 声明优先）+ 在 r21 基础上加 r22 的 `f.linkTo`？

→ **建议**: 保持 r22 现状，等 r23 跑完再讨论。

### 6.3 r22 改动找回

```bash
# r22 改动都在工作区（未 commit），git status 可看
git status --porcelain

# 如需丢弃:
git checkout -- src/runtime/core.ts src/definitions/nodes.ts
# 注意: 不要 checkout 文档和 recreate-debug*.ts，那是要保留的
```

### 6.4 复刻源码（已就位，无需恢复）

```
tests/composite/recreate-debug3.ts        # debug3 v1 fix
tests/composite/recreate-debug4.ts        # debug4 v1 (f.fork)
tests/composite/recreate-debug4-v2.ts     # debug4 v2 (fan-in API)
tests/composite/output/recreate_debug3.gia
tests/composite/output/recreate_debug4.gia
tests/composite/output/recreate_debug4_v2.gia
```

### 6.5 build 测试手顺

```bash
# 1. 验证 build OK
cd /home/h/genshin-ts
npm run build 2>&1 | tail -3

# 2. 跑我的复刻确认全 pass
npx tsx tests/composite/recreate-debug3.ts 2>&1 | grep "🏆\|💥"
npx tsx tests/composite/recreate-debug4-v2.ts 2>&1 | grep "🏆\|💥"

# 3. 跑 pre-existing fail（确认仍然 fail，没新增 regression）
npx tsx tests/composite/test-phase1-system-nodes.ts 2>&1 | tail -2
npx tsx tests/composite/test-mixed-composite-normal.ts 2>&1 | tail -2
npx tsx tests/composite/exec-with-data.ts 2>&1 | tail -2
```

---

## 七、下次（r23）开工前要做的事

1. **先读本文档 §1.4**（关键心智模型）+ §3.3（v2 写法范式）+ §5（debug5/6 已知信息）。
2. **完整 decode debug5/debug6**:
   ```bash
   npx tsx tools/decode-gia.ts "<debug5 路径>" | jq ...
   npx tsx tools/decode-gia.ts "<debug6 路径>" | jq ...
   ```
   重点拿 n=11 impl（"复杂分支" 复合），确认它是纯数据还是 exec-only。
3. **写 recreate-debug5.ts**:
   - 不需要复合定义
   - 用 `f.linkTo` + `f.callComposite`（如果需要）表达 8 条 exec 边 + 1 条 data 边
   - debug5 没有事件，**需要 dummy event + eventMarker** 让 gsts 不报 0-node IR 错
4. **写 recreate-debug6.ts**:
   - 定义 `复杂分支` 复合（impl 内放 nid=5 Multiple Branches 系统节点？或者别的？）
   - 主图 6 节点，**n=11 是 4 inflow 扇入**——验证 r22 的 fan-in API 在更复杂场景下也能用
5. **跑 + 对比 + 复制到游戏**。
6. **如果 debug5/debug6 复刻成功，写 r23 handover**。
7. **如果用户希望 commit + push**: 写好 commit message（"r22: fan-in API + debug3/4 精确复刻"），push 到 `feat/fork-api-and-layout` 分支。

---

## 八、复盘一句话

> **r22 解决了"复合节点能不能被多源触发（fan-in）"的问题**。解法是把"实例化 / 内部连线 / 出口标记"分到 3 个 API（`declareDetached` / `linkTo` / `eventMarker`），每个独立正交，不再耦合。`f.leaf` 仍是 outer OutFlow 标记的唯一稳定方式（`f.branchExec` 的隐式透出规则不可依赖）。debug3/4 复刻做到结构等价（debug4 v2 6 节点 8 exec 边 1 data 边全匹配原 debug4.gia），**游戏中实际测试通过**，fan-in 工作正常。

---

## 附：r21 handover（上一轮，独立轨道）

见 `r21-outflow-api-redesign-pending.md`。**不要动 r21 stash**。r22 是独立轨道，专门补 fan-in 能力。r21 的"outflow API redesign"思路是不同方向（把 outflow 声明提到 defineComposite 层 + `f.leaf(name)`），r22 走的是"补 3 个独立正交 API"。两者将来可能整合，但不是 r23 的事。
