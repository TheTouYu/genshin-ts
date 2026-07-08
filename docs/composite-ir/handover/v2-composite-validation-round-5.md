# V2 复合节点验证交接文档 · 第五轮

> 状态：已验证 / 已归档 / 历史记录
> 来源：当前代码实现 + 普通 gsts 编译链路自动验证 + 用户游戏内验证反馈
> 最近校验：2026-07-08
> 适用范围：v2 raw-control-flow DSL、普通 `node bin/gsts.mjs <ts>` 链路、debug5/debug6 结构合集

> **必须先读的工作细节**：[layout-working-rules.md](layout-working-rules.md)
> **上一轮入口**：[v2-composite-validation-round-4.md](v2-composite-validation-round-4.md)
> **当前推荐低层控制流 API**：[../../architecture/composite/raw-control-flow-dsl-quickstart.md](../../architecture/composite/raw-control-flow-dsl-quickstart.md)
> **当前复合节点 API**：[../../architecture/composite/dsl-api.md](../../architecture/composite/dsl-api.md)

---

## 一、本轮目标

本轮进入 `raw-control-flow/` 分类，目标是把第四轮后选择的 debug5/debug6 控制流场景从 composite harness 推进到普通 `gsts` 编译链路。

本轮验证重点：

1. `f.entry()` / `f.node()` / `f.link()` 可以在普通 `g.server().on(...)` 用户脚本中通过 Stage 1。
2. `f.node('forwarding_event', [e.eventSourceEntity])` 的第二参数保持 JS 参数数组语义，不被错误改写成 DSL list。
3. `f.declareDetached(...)` 返回的复合 marker 不被 Stage 1 错误当成本地变量或 collection 处理。
4. 多 InFlow 复合调用能通过 `f.link(source, outIdx, branch, targetInflowIdx)` 保留 `target_index`。
5. 最终 GIA 游戏内可导入并运行。

---

## 二、本轮新增目录和文件

项目目录：

```text
tests/composite/v2/raw-control-flow/
```

本轮最终保留源码：

```text
tests/composite/v2/raw-control-flow/raw-control-flow-debug56-passed.ts
```

该文件是普通用户脚本路径，使用：

```bash
node bin/gsts.mjs tests/composite/v2/raw-control-flow/raw-control-flow-debug56-passed.ts
```

生成项目内 GIA：

```text
dist/tests/composite/v2/raw-control-flow/raw-control-flow-debug56-passed.gia
```

游戏侧归档目录：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/真-测试通过/v2/raw-control-flow
```

最终归档 GIA：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/真-测试通过/v2/raw-control-flow/raw-control-flow-debug56-passed.gia
```

---

## 三、用户游戏内验证结果

用户已游戏内确认通过。

测试时导出到游戏导入根目录的文件：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/raw-control-flow-debug56-step2.gia
```

用户确认通过后，按当前归档规则，该文件已**移动**到归档目录，并命名为：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/真-测试通过/v2/raw-control-flow/raw-control-flow-debug56-passed.gia
```

覆盖场景：

1. `whenCustomVariableChanges` 轴：debug5 结构。
   - 纯 raw 系统节点。
   - `When Custom Variable Changes -> Forwarding Event / Finite Loop / Print String`。
   - `Finite Loop.OutFlow[0] -> Set Local Variable`。
   - `Finite Loop.OutFlow[1] -> Forwarding Event / Print String`。
   - `Set Local Variable -> Print String`。
   - `forwarding_event` 使用事件参数 `e.eventSourceEntity`，保留数据边。
2. `whenEntityIsCreated` 轴：debug6 结构。
   - 主图 5 个 raw 系统节点 + 1 个多 InFlow 复合调用。
   - 复合 `Raw控制流-复杂分支-step2` 有 4 InFlow / 5 OutFlow / 1 OutParam。
   - 主图通过 `f.link(..., branch, 0/1/2)` 连接到复合调用不同入口。

---

## 四、本轮代码修复

修复提交：

```text
04aefb5 fix(ts-to-gs): support raw control-flow markers
```

修改文件：

```text
src/compiler/ts_to_gs_transform/stmt.ts
src/compiler/ts_to_gs_transform/expr.ts
tests/composite/v2/raw-control-flow/raw-control-flow-debug56-step2.ts
```

后续整理提交将把 step2 测试源码重命名为：

```text
tests/composite/v2/raw-control-flow/raw-control-flow-debug56-passed.ts
```

修复内容：

1. `stmt.ts`：Stage 1 变量规划识别 raw control-flow marker initializer。
   - `f.entry()` / `f.eventMarker()`
   - `f.node()` / `f.rawExecNode()`
   - `f.declareDetached()`
   - `f.callComposite()`
2. raw marker 不再被误判为 collection，也不再被误判为可映射 LocalVariable 的 basic 值。
3. `expr.ts`：`f.node()` / `f.rawExecNode()` / `f.registerExecNode()` 的第二个参数保留 JS 参数数组语义。
   - 修复 `f.node('forwarding_event', [e.eventSourceEntity])` 被改写成 DSL list 的风险。
4. 普通 `node bin/gsts.mjs <ts>` 链路可生成 `.gs.ts`、IR JSON 和 GIA。

本轮修复前的失败表现：

```text
[error] cannot infer list type, please add type annotation
  at raw-control-flow-debug56-step1.ts:60:9 (VariableDeclaration)
```

第二个失败表现是 `f.declareDetached(...)` 被错误 localvar 化，生成类似：

```typescript
const branch = gsts.f.initLocalVariable("entity")
gsts.f.setLocalVariable(branch.localVariable, f.declareDetached(complexBranch, {}))
f.link(entry, 0, branch.value, 0)
```

这会在 Stage 2 运行时报 generic 参数不匹配。修复后 `branch` 保持普通 JS marker 对象。

---

## 五、本轮自动验证

普通编译链路：

```bash
node bin/gsts.mjs tests/composite/v2/raw-control-flow/raw-control-flow-debug56-passed.ts || true
```

结果：

```text
[ok] dist/tests/composite/v2/raw-control-flow/raw-control-flow-debug56-passed.gs.ts
[ok] dist/tests/composite/v2/raw-control-flow/raw-control-flow-debug56-passed.json
[ok] dist/tests/composite/v2/raw-control-flow/raw-control-flow-debug56-passed.gia (id=1073741922)
```

最后注入阶段因本机 `Beyond_Local_Save_Level` 缺失报错，不影响 GIA 已生成。

控制流 trace：

```bash
npx tsx tests/composite/trace-exec-flow.ts dist/tests/composite/v2/raw-control-flow/raw-control-flow-debug56-passed.gia --io
```

摘要：

```text
总节点: 11
n=1..5: debug5 纯 raw 系统节点结构
n=6..11: debug6 多 InFlow 复合调用结构
n=11 复合:Raw控制流-复杂分支-step2
  InFlow[0] 有限循环 <- n=6.OutFlow[0]
  InFlow[1] 开始转化事件 <- n=8.OutFlow[0], n=8.OutFlow[1]
  InFlow[2] 开始设置局部变量 <- n=7.OutFlow[0], n=9.OutFlow[0]
```

数据流节点列表：

```bash
npx tsx tests/composite/trace-dataflow.ts dist/tests/composite/v2/raw-control-flow/raw-control-flow-debug56-passed.gia --list-nodes
```

摘要：

```text
主图节点 = 11
When Custom Variable Changes / Forwarding Event / Finite Loop / Set Local Variable / Print String
When Entity Is Created / Forwarding Event / Finite Loop / Set Local Variable / Print String / 复合调用
```

---

## 六、本轮实现注意点

1. `f.node()` 返回的是 raw marker，不是 DSL value。
   - Stage 1 不能把它当成 list/dict collection。
   - Stage 1 也不能把它当成 `entity`、`int` 等 LocalVariable。
2. `f.declareDetached()` 返回的是 composite call marker 对象。
   - 即使 TS 类型上带 `Record<string, any>`，也不能让 collection/localvar 规划接管。
3. `f.node(type, args)` 的 `args` 是 runtime 节点参数数组。
   - 这里的数组是 JS 参数数组，不是用户 DSL 的 `list<T>` 值。
   - 因此 `[e.eventSourceEntity]` 必须保持数组字面量。
4. 本轮归档 GIA 是用户实际测试通过的 `raw-control-flow-debug56-step2.gia` 移动重命名而来。
   - 没有复制后在导入根目录保留残留文件。

---

## 七、本轮没有覆盖到的点

本轮只覆盖 debug5/debug6 的基础 raw-control-flow 结构，没有覆盖：

1. 更复杂的 raw control-flow 分支/循环组合。
2. 多 OutFlow 复合调用后继续自动串联普通节点的复杂场景。
3. raw node `outParams` 在主图中继续进入复杂数据流的专项 case。
4. 节点图变量。
5. all-types / type-conversion 全覆盖类型组合。
6. 大型流程和复杂布局专项 case。

---

## 八、下一轮建议

下一轮可以从以下方向继续：

1. `graph-variables/`：从 `节点图变量.gia` 开始。
2. `all-types/` 或 `type-conversion/`：从全覆盖类型类样本开始。
3. 更复杂 raw-control-flow：加入多 OutFlow 复合调用后的下游串联、raw node outParams 数据消费、更多 fan-in/fan-out。

继续工作时遵守：

1. 项目内按特点建目录：`tests/composite/v2/<feature>/`。
2. 给用户验证的 GIA 先放 `Beyond_Local_Export` 根目录。
3. 用户确认通过并允许归档后，使用 `mv -f` 移动到 `真-测试通过/v2/<feature>/<case>-passed.gia`，不要复制后在根目录留下残留文件。
4. v2 测试源码目录只保留高质量最终参考文件；临时 step 和探针文件及时清理或改名为 passed 参考文件。

---

## 九、关键命令

生成：

```bash
node bin/gsts.mjs tests/composite/v2/raw-control-flow/raw-control-flow-debug56-passed.ts || true
```

自动验证：

```bash
npx tsx tests/composite/trace-exec-flow.ts dist/tests/composite/v2/raw-control-flow/raw-control-flow-debug56-passed.gia --io
npx tsx tests/composite/trace-dataflow.ts dist/tests/composite/v2/raw-control-flow/raw-control-flow-debug56-passed.gia --list-nodes
```

导出给用户测试：

```bash
export root='/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export'
rm -f "$root/raw-control-flow-debug56-step2.gia"
cp dist/tests/composite/v2/raw-control-flow/raw-control-flow-debug56-step2.gia "$root/raw-control-flow-debug56-step2.gia"
```

通过后归档（移动，不复制）：

```bash
export root='/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export'
mkdir -p "$root/真-测试通过/v2/raw-control-flow"
mv -f "$root/raw-control-flow-debug56-step2.gia" \
  "$root/真-测试通过/v2/raw-control-flow/raw-control-flow-debug56-passed.gia"
```

---

## 十、给下一位助手的一句话

> `raw-control-flow` 第四个 v2 分类已经游戏内验证通过并归档；普通 `node bin/gsts.mjs` 链路已可编译 raw marker API，关键修复提交为 `04aefb5`。最终源码为 `tests/composite/v2/raw-control-flow/raw-control-flow-debug56-passed.ts`，归档 GIA 为 `真-测试通过/v2/raw-control-flow/raw-control-flow-debug56-passed.gia`。本轮验证 debug5 纯 raw 系统节点结构和 debug6 多 InFlow 复合调用结构都可通过普通链路生成并在游戏内运行。
