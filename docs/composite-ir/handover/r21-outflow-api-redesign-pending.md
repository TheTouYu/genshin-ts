# Session 交接：复合节点 outflow 出口 API 重设计（r21，未完成）

> **目标轮次：** r21
> **当前状态：** 进度到 ~95%，**未完成、未提交**。所有代码改动已 stash 保存，仓库回到 r19 状态。
> **核心遗留：** 纯净方案 `f.leaf(name)` 已经落代码，但从 7 个真实分支复合解构后发现 **API 形态的根本设计错了**——把"出口标记"和"内部执行链"耦合到一起了。需要重新设计为「实例化 / 内部连线 / 打出口标签」三步正交的 API。
> **代码找回：** 见 §六（git stash 已保存）。

---

## 一、本轮沟通脉络（避免下次重新踩坑）

下面 6 件事是这一轮一步步从用户那里"抠"出来的，**请按顺序读**——下次设计前先把这套心智模型装好。

### 1.1 r20 交接 → r21 我以为要做的

r20 handover 说有 3 个未解决差异：compositePins 没绑定 OutFlow / impl pin 顺序 / doubleBranch 高级 API。我读了文档 + 跑 decode-gia，定位到**根因比 r20 描述的还要精确**：

- Bug A：缺少 2 条 OutFlow compositePin（`addOutFlowCompositePins` 没给 double_branch 自动生成）
- Bug B：captureInput 不该生成物理 InParam pin（违反文档 03-validation-basics §2「仅由 compositePins 路由 → 不需要物理 pin」）
- r20 的 double_branch 硬编码 hack「自动造 2 个 outflow 并起 '是'/'否' 名字」是个权宜之计，方向不对

### 1.2 用户提的根本问题：API 体系不完善

> 复合节点的控制流可能有多个输出。我们可以**选择性**地标记是否作为输出，并为每个输出起自定义名字。但现有 API 体系**不完善**来支持这一点。这个问题很可能和数据/连线的两个 bug **重叠**。

→ 提醒：本会话后续一切讨论，**isel 都不要把"outflow"和数据/连线的 bug 混在一起 fix**，否则会相互影响。

### 1.3 第一轮 API 方案（路线 B，已作废）

我提的「**outflows 提到 defineComposite 声明层**」：用户在 `g.defineComposite({ outflows: [{name:'是'},{name:'否'}] })` 显式声明，`build` 里用 `f.leaf(0)` / `f.leaf(1)` 标记每个分支出口。**用户认同了**，我开始落代码。

### 1.4 用户中途切方向盘

落代码过程中，遇到 `f.leaf(outflowIndex)` 在**嵌套 double_branch** 时如何对齐 index（嵌套两层 leaf 难以让 index 和声明顺序对齐）的问题。用户随即切方向：

> 我们或许应该采用最开始你提的那种想法——**调用 + 把名字传进去**。

→ 把 outflow 的"命名权"从声明层**收回到 `leaf` 调用里**：删 `outflows` 声明，改用 `f.leaf(name)`。**用户认同**。

### 1.5 我落了第二版代码（纯净方案）

- `f.leaf(name: string)`：name 必传，index 由 runtime 按 leaf 调用顺序自动分配
- 同名 leaf 允许（游戏允许），收取警告
- strict 校验改为「有 execNodes 但 0 leaf → 报错」
- bool 测试结构跑通：4 条 compositePins、double_branch 只剩 OutFlow:0 物理 pin

**主图 byte 级对齐 REF bool.gia 95%**，但有一条 compositePin 不一致：

| | REF bool.gia | 我生成的 |
|---|---|---|
| OutFlow[0] 内部节点 | **printString** (n=3) | **double_branch** (n=2) |

我提议三选一（拼命想绕开），用户都还没回，接下来用户**亲自跳出来把根本认知点说清**。

### 1.6 ⚠ 用户 key insight（我之前没分清的两件事）

> 游戏里，节点的**执行**和它是否**作为复合出口**，是**两件独立的事情**。
>
> 条件分支默认有"是""否"两个输出点。这两个输出点**可以接别的节点**（内部执行流），但**这不影响它作为输出点**——它在这里作为输出点结束了，但后面还有别的节点可以执行。

→ **节点的"实例化（带参数）"、内部连线、出口标记，是三个正交的操作**。我之前的 `f.leaf` 把"取当前执行链尾"和"打出口标签"耦合到了一起，所以 API 形态只能是"在分支末尾打 leaf"——根本错误。

### 1.7 用户亲自指路去看 ref 标准形态

让我去解构 `user_edit/分支/` 目录下的 7 个手写分支复合。结果发现 **ref 标准形态远比我设想的简单**（见 §三）。

---

## 二、本会话最重要的认知更新（下次设计前必读）

### 2.1 三件事正交

| 操作 | 内容 | 注意 |
|------|------|------|
| ① **实例化** | 注册一个节点，喂参数（字面量 / 复合输入 / OutParam 引用） | 参数不限于字面量（漏点 1：我设计 API 时把参数简化掉了） |
| ② **内部连线** | 把某节点的某 OutFlow pin 接到另一节点的 InFlow | **可选**——可以不接任何内部下游（漏点 2：我以为分支出口必须接叶子） |
| ③ **打出口标签** | 把任意已注册节点的任意 OutFlow pin，标记为复合的一个出口 | 完全独立的操作，**和内部连线无关** |

→ 用户的"打标签"等价于游戏里"选中节点 → 把某 OutFlow pin 升格为复合出口"的 UI 操作。

### 2.2 出口 pin 是 **OutFlow** 类

不是 InFlow pin，是把一个节点 **某条对外执行流出口** 升格为复合的出口。在 GIA compositePins 中体现为 `innerPinKind = 2`（OutFlow）。runtime 编出 compositePin：`outflowIndex → innerNodeId.OutFlow[pinIndex]`。

### 2.3 r20/r19 老的 hack 全部作废

- r20 「检测 double_branch 节点 → 自动 2 个 outflow + '是'/'否' 硬编码」（已删除，见代码改动）
- r19 「主图 pin 重排序 OutFlow 在前 InParam 在后」，**保留**（与本次重设计无关，仍要让生成文件贴近 ref 编辑器输出）

---

## 三、ref 标准形态（`user_edit/分支/` 7 个文件真相）

我用 `tools/decode-gia.ts` 全部解码，**7 个里 6 个**形态完全一致（仅 pinIndex 数字不同）：

```
目录: user_edit/分支/
  ├── 01.gia        双分支-user       (主端 1 复合 + 1 主图复合调用)
  ├── 分支.gia      双分支-user       (主端: 1 printString + 2 次主图调用复合作为 fork)
  ├── 分支2.gia     双分支-user       (主端: 复合调用 ×2, 各自 OutFlow[0] 接主图下游 printString)
  ├── 分支3.gia     双分支-user       (主端: 多次 + OutFlow fanout 到下游)
  ├── debug.gia     创建复合节点       (主端: 复合调用 ×5, 调试各 pin 连接组合)
  ├── debug2.gia    创建复合节点 + 创建复合节点(1)(纯数据子复合, 嵌套调用)
  └── debug3.gia    创建复合节点 + 创建复合节点(1)(带 outflow+OutParam 主图连接)
```

### 3.1 复合内部「impl」一致形态（01/分支/分支2/分支3/debug 全部）

```json
CompositeDef:
  inflows:  [ { name: "", pinIndex: 47 } ]
  outflows: [ { name: "是", index:0, pinIndex:66 }, { name: "否", index:1, pinIndex:67 } ]
  inputs:   [ { name:"条件", pinIndex:51 } ]
  outputs:  []

impl graph:
  节点: 仅 1 个 double_branch (nodeIndex=2)
  连线: 无任何内部连线（pins=[]）
  compositePins: 4 条，全部指向这同一个 double_branch
     { outerPin: InFlow[0]    → inner: doubleBranch.InFlow[0] }
     { outerPin: OutFlow[0]"是" → inner: doubleBranch.OutFlow[0] }
     { outerPin: OutFlow[1]"否" → inner: doubleBranch.OutFlow[1] }
     { outerPin: InParam[0]"条件" → inner: doubleBranch.InParam[0] }
```

→ **double_branch 的 2 个 OutFlow pin 直接被标为复合出口，内部不接任何子链**。这就是 §2.1 三件事正交的最干净的例证——没有"内部连线"（步骤 ②省略），但"出口标签"仍直接打在节点的 OutFlow pin 上。

### 3.2 主图「调用」形态

- **分支.gia / 01.gia**：主图只调用复合，复合的两个 OutFlow 一个接别的节点、一个不接（如同复合就是 double_branch 的"接口封装"）。
- **分支2.gia**：主图调用复合时，`CompositeCall.outflow[0]=cpi66` 接到下游 `printString`；主图里这个 printString 是**主图的**，不是复合内部。
- **分支3.gia**：复合调用的 OutFlow fanout 到多个主图下游节点（n[4].Outflow→[7]、n[6] 也 fork 出更多 CompositeCall）。

→ 复合外部主图像"`connectOutFlow(d, idx, callback)`"接下游，跟现有 DSL 完全兼容。

### 3.3 bool.gia 形态（另一合法形态，混合内部连线）

`user_edit/bool.gia` 是另一种合法写法：在内部接 `double_branch.OutFlow[0] → printString`，然后把 **printString 的 OutFlow[0]** 标为复合 "是"、double_branch 的 OutFlow[1] 标为 "否"。和 §3.1 区别只是**多了一条内部连线 + 出口标签贴在更下游的节点上**。两种都对，最终 gra 完全依赖用户 printString 是放复合内还是放主图。

### 3.4 debug3.gia 的"主图中的两个 OutFlow 都标 + OutParam 接下游"

debug3 主图中：
- n[3].OutFlow[0] (cpi=79 "是") → 接到主图 n[5]、n[6]
- n[4] 同时 OutFlow[0]+OutFlow[1]+InParam[0] 都接了下游（CompositeCall 既可以接 OutFlow 出口，也可以接 OutParam 做计算）

→ 这是 CompositeCall 在主图中作为"功能节点"的所有连接形态样本，可作为 §五对照表核心。

---

## 四、修正后的 API 设计（待下次确认实现）

### 4.1 设计倾向（α：在 f 上挂 outflow API，挂在节点 ref 上）

```ts
build({ 条件 }, f) => {
  // 步骤①: 实例化节点（参数可以是输入引用 / 字面量 / 节点 OutParam 引用）
  const db = f.registerExecNode('double_branch', [???])   // ??? 见 §4.2
  const ps = f.registerExecNode('print_string', [new str('是')])

  // 步骤②: 内部连线（可选 — 游戏里 db.True 可接一条子链或留空）
  f.connect(db, 0, ps)   // db.OutFlow[0] → ps.InFlow[0]

  // 步骤③: 打出口标签（独立于①② — 选任何节点的任意 OutFlow pin）
  f.outflow('是', ps, 0)   // ps.OutFlow[0] 升格为复合出口"是"
  f.outflow('否', db, 1)   // db.OutFlow[1] 升格为复合出口"否"
  return {}
}
```

### 4.2 我没底、需用户亲自拍 / 看现有代码的细节

#### 问题 A：复合输入怎么当节点参数

我猜的 `f.refParam('条件')` 是**瞎猜**，对实际 DSL 形式没把握。需查：
- 现有复合 build 形如 `build(inputs, f) => { f.addition(inputs['x'], inputs['y']) }` 在 build 签名里拆 inputs——`inputs['条件']` 就是复合输入引用对象（带 `__captureInputName`）。
- 「复合输入」该怎么写既能塞进 `registerExecNode` 的 args 数组：直接 `inputs['条件']` 应该就可以（它是 `value` 实例）？现有 `f.doubleBranch(条件, ...)` 已经把 `inputs['条件']` 当参数传了，机制就是这套。
- 节点的 OutParam（前一个的计算结果）能否直接当下一节点的 args？看 `f.addition(...)` 返回的也是 `value`（带 pin meta），现有 runtime 也支持。
- **下次实现前先把 buildDSL 抓清楚了再写，不要再臆测**。

#### 问题 B：节点参数能塞几种

- 字面量 ✓
- 复合输入引用 ✓
- OutParam 引用（前一节点输出）应该是 ✓（runtime 已有 `value.getMetadata()=pin` 机制）
- 表达式结果（如 `f.addition(a,b)` 的返回值喂给参数）应该 ✓

→ 三种基本都该支持；目标：和现有 `f.X` API 的参数语义打通，不引入新限制。

#### 问题 C：`outflowPinIndex` 与 OutFlow pin 的对应

double_branch 有 2 个 OutFlow（True=0, False=1），写 `f.outflow('否', db, 1)` 对应 `db.OutFlow[1]`。**建议**：参数名 `outflowPinIndex`，默认 0 —— 下次实现前要到节点定义表里 verify "OutFlow 数量"是定义可查的、index 语义对齐了。

#### 问题 D：默认 pinIndex 省略

节点若只有 1 个 OutFlow pin（如 printString），能不能写 `f.outflow('是', ps)` 等价 `f.outflow('是', ps, 0)`？我倾向**支持默认 0**——下次实现时 verify 节点定义能不能查到"default OutFlow index"。

#### 问题 E：strict 校验

「有 execNodes 但 0 出口标记 → 报错」保留 r21 上轮承诺。下次继续保留。

#### 问题 F：同名 + index 由调用顺序

- 同名 leaf/outflow 调用：允许（游戏允许），编译警告（保留 r21 承诺）。
- outflow index 由 runtime 按 `f.outflow` 调用顺序自动分配（0,1,2...）。

### 4.3 完整实施清单（下次接着干）

1. **runtime `core.ts`**：新增 `outflow(name: string, ref: MetaCallRecordRef, outflowPinIndex: number = 0)` 方法，把记录推入 `__outflowMarks: Array<{name, innerNodeId, outflowPinIndex}>`。**废弃 `leaf(name)`**（已 stash 的代码用 `leaf` 实现，下次替换）。
2. **runtime `composite_registry.ts`**：
   - `CompositeCapture.outflowMarks: Array<{name, innerNodeId, outflowPinIndex}>` 替代 `leafMarks`
   - `addOutFlowCompositePins` 改为按 outflowMarks 顺序生成 compositePins，`innerPinIndex` 用 `outflowPinIndex`
   - strict 校验改"有 execNodes 但 0 outflowMarks → 报错"
3. **`runtime/core.ts` `captureRegistry.getFlows()` 后捕获**：读 `__outflowMarks` 装入 `captured.outflowMarks`
4. **`compiler/ir_to_gia_transform/composite.ts`**：保留 Bug B 修复（captureInput `capture: true` flag 跳过物理 InParam pin）—— 该代码已落、且本轮验证正确，**不重写**
5. **`definitions/nodes.ts`**：保留 `f.doubleBranch` 弃用守卫（仅 capture 模式抛错）—— 已落，不重写
6. **测试全部重写**：
   - `test-bool-input.ts`：复刻 user_edit/bool.gia 结构（printString 在复合内部 + db.OutFlow[1] 直标 "否"）
   - `test-phase2-normal-nodes.ts`：把 P2-S1..S4 的 `f.leaf(index)` / `f.leaf({name})` 改写为 `f.outflow(...)` + （必要时加 `f.connect`）
   - `test-phase2-reference-patterns.ts`：P3a/P3b/P5 改用 `f.outflow` + 双 OutFlow 复合（不要再用嵌套）
7. **trace-exec `tests/composite/trace-exec-flow.ts`**：r20 加的 `[是, 否]` 标记现在从 `outflows[].name` 直接读，不依赖硬编码——保留
8. **回归全过**：phase2-normal-nodes、phase2-reference-patterns、bool 测试、test-composite-part1/2/3

---

## 五、现行机制（已通透，避免重复逆推）

| 机制 | 文件:行 | 说明 |
|------|---------|------|
| `f.registerExecNode(type, args[])` | `core.ts:861` | 注册 exec 节点 + 自动接当前 tail + **tail 推进到自己**。返回 MetaCallRecordRef |
| `f.branchExec(sourceIndex, record)` | `core.ts:837` | 把节点挂在 fork 源的指定 OutFlow pin 上，**不推进 tail** |
| `f.withExecBranch` | `core.ts:778` | 进分支上下文跑回调，单独连边（leaf 旧实现里用） |
| `f.connectOutFlow` | `nodes.ts:744` | **主图侧** API，让 CompositeCall 的某个 OutFlow 接下游 |
| `MetaCallRegistry.isCapturing` | `core.ts:1053`（r21 新增） | 区分复合 build() vs 主图 |
| `__captureInputName` flag | `core.ts:1562` | 复合输入引用标记 → compositePin 路由 + Bug B 跳过物理 InParam pin |
| Bug B 编码（capture flag） | `composite_registry.ts:264` + `composite.ts:712` | IR arg 加 `capture: true` → buildImplNodePins 跳过物理 pin 已实现 |
| compositePins 生成（OutFlow） | `composite_registry.ts:addOutFlowCompositePins` | 当前用 leafMarks，下一步按 outflowMarks 重写 |

---

## 六、改动 stash 找回指南（必读）

> 本会话所有 r21 代码改动**已 stash 保存**，仓库已回到 r19 commit 状态。下次接着做时按下列步骤找回。

### 6.1 当前仓库状态

```bash
$ git stash list   # 应有一条 r21 stash
stash@{0}: WIP on <branch>: r21 — outflow API 重设计（未完成，详见 handover）
$ git log -1 --oneline
cc60fcd r19: fix bool composite pin type and order
```

### 6.2 stash 中包含的内容

- `src/runtime/composite_registry.ts` —— 至 r21 已完成的 "纯净 leafMarks 方案" 改动（74 行）
- `src/runtime/core.ts` —— `f.leaf(name)` 签名 / `__leafMarks` 数组形态 / `isCapturing` flag
- `src/definitions/nodes.ts` —— `f.leaf(name: string)` 新签名 / `f.doubleBranch` 弃用守卫
- `src/compiler/ir_to_gia_transform/composite.ts` —— Bug B 修复（capture flag 跳过物理 pin，7 行）
- `tests/composite/test-bool-input.ts` —— 重写后的 bool 测试（基于 leaf 形态，**下次要重写为 outflow 形态**）
- `tests/composite/test-phase2-normal-nodes.ts` —— P2-S1..S4 已改 leaf 写法（**下次要重写为 outflow 形态**）
- `tests/composite/test-phase2-reference-patterns.ts` —— P3a/P3b/P5 改写中（**未完成 + 要重写为 outflow 形态**）
- `tests/generated/*` —— `npm test` 重新生成的产物（不是手改，下次 stash pop 后 `npm run gen` 会重生）

### 6.3 找回 / 判读 / 应用建议

```bash
# 看改动概览:
git stash show -p stash@{0} --stat

# 看某关键文件的完整 diff:
git stash show -p stash@{0} -- src/runtime/composite_registry.ts | less

# 方法 A：直接 pop 全量应用，在此基础上继续改（注意 tests/generated/* 也会被带回，可 git checkout 掉）
git stash pop
git checkout -- tests/generated/   # 这些是生成的，不参与手改

# 方法 B：只挑要保留的源码改动（推荐）：
#   Bug B 修复（composite.ts） + loop tellis 弃用守卫（nodes.ts） + isCapturing flag（core.ts:1053）可保留
#   leaf(name) 相关的 core.ts + composite_registry.ts 大改要废弃，下次按§4.3 重写
git checkout stash@{0} -- src/compiler/ir_to_gia_transform/composite.ts
git stash show -p stash@{0} -- src/runtime/core.ts | git apply  # 选择性取想要的 hunk
```

### 6.4 哪些代码值得"参考搬过去"

| r21 stash 内容 | 是否下次直接复用 | 说明 |
|----------------|------------------|------|
| `composite.ts` Bug B 修复（7 行） | ✅ 保留 | 验证正确，不动 |
| `nodes.ts` `f.doubleBranch` 弃用守卫 | ✅ 保留 | 与 API 重设计无关 |
| `core.ts` `MetaCallRegistry.isCapturing` getter | ✅ 保留 | 弃用守卫依赖它 |
| `core.ts` `leaf(name)` 实现 | ❌ 废弃 | 改为 `outflow(name, ref, pinIndex?)` |
| `composite_registry.ts` `addOutFlowCompositePins` | ❌ 重写 | 改成读 outflowMarks 数组 |
| `composite_registry.ts` 删 `outflows` 声明 + 删 r20 hack | ✅ 保留 | 这是方向正确的清理 |
| bool 测试 / phase2 / phase3 测试写法 | ❌ 全部按 §4.3 重写 | leaf 形态 → outflow 形态 |

### 6.5 build 测试手顺（验证已回到 r19 干净状态）

```bash
npm run build 2>&1 | grep -E 'error TS'   # 应只有 0 error 或仅那个 r19 已有的 'cannot infer list type' warning
npm run trace-exec -- tests/composite/output/bool复合测试.gia
# 期望仍能解码 r20 handover 期发布的 bool复合测试.gia 文件
```

---

## 七、下次开工前要做的事（避免又一次跑偏）

1. **先读本文档 §1.1～§3.2**，把"三件事正交"和 ref 标准形态装好。
2. **解决 §4.2 §4.3 问题 A**：实际查询 `tests/composite/test-phase2-normal-nodes.ts` 或 `tests/composite/example/_demo` 看现有 build DSL 怎么写、复合 `input` 怎么当 args——不要凭空猜。
3. **挑 §6.4 中「✅ 保留」的代码搬回工作树**（composite.ts Bug B / nodes.ts doubleBranch 弃用 / core.ts isCapturing / registry 删 r20hack + 删声明）。**不要把 leaf 相关的也搬回来**——那部分要重写。
4. **按 §4.3 实施清单重写** leaf → outflow，写完一个测试就跑一遍，**不要憋一堆**。
5. **跑回归测试集**：phase2-normal-nodes / phase2-reference-patterns / test-composite-part1/2/3 / bool，全过才视为 r21 done。
6. **写 r22 handover** 如果又有未决——比文档更重要的，把"为什么这版 OK"的心智模型也写清楚。

---

## 八、复盘一句话

> **不要把"出口 / 实例化 / 内部连线"耦合进单个 API**。游戏里它们是三件事，API 也得是三件事。任何"自动检测节点生成 outflow"、任何"leaf 取当前 tail"的写法都是耦合陷阱。下次设计 API 前先去解构 ref 文件，凭真实结构而不是想象来设计。

---

## 附：r20 handover（上一轮）

见 `r20-bool-composite-pintype-fix.md`。其中 §2 已修复内容（itemType type_server / 主图 pin 重排序）**予以保留**；§3 未解决问题中 3.1/3.2 由本文档 r21 继续。