# V2 复合节点验证交接文档 · 第四轮

> 状态：已验证 / 已归档 / 历史记录
> 来源：当前代码实现 + 自动解码验证 + 用户游戏内验证反馈
> 最近校验：2026-07-08
> 适用范围：v2 嵌套复合节点场景、下一轮选择更复杂 case 前的交接

> **必须先读的工作细节**：[layout-working-rules.md](layout-working-rules.md)
> **上一轮入口**：[v2-composite-validation-round-3.md](v2-composite-validation-round-3.md)
> **当前推荐低层控制流 API**：[../../architecture/composite/raw-control-flow-dsl-quickstart.md](../../architecture/composite/raw-control-flow-dsl-quickstart.md)
> **当前复合节点 API**：[../../architecture/composite/dsl-api.md](../../architecture/composite/dsl-api.md)

---

## 一、本轮目标

本轮启动 `nested-composites/` 分类，验证复合 impl 内部再次调用复合节点时，Stage 2 捕获、Stage 3 impl GraphUnit `relatedIds`、主图调用和数据追踪是否能一起工作。

本轮不是逐字段复刻旧的 `demo_C_nested_call.gia` 或 `nested_exact.gia`，而是构造一个更适合 v2 参考的合集：一个 GIA 内同时覆盖纯数据嵌套复合和执行型嵌套复合。

---

## 二、本轮新增目录和文件

项目目录：

```text
tests/composite/v2/nested-composites/
```

本轮最终保留源码：

```text
tests/composite/v2/nested-composites/nested-composites-combined-passed.ts
```

该文件对应图名：

```text
V2-嵌套复合-passed
```

游戏侧归档目录：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/真-测试通过/v2/nested-composites
```

最终归档 GIA：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/真-测试通过/v2/nested-composites/nested-composites-combined-passed.gia
```

---

## 三、用户游戏内验证结果

用户已游戏内确认通过。

测试时导出到游戏导入根目录的文件：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/nested-composites-combined-step1.gia
```

用户确认通过后，按当前归档规则，该文件已**移动**到归档目录，并命名为：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/真-测试通过/v2/nested-composites/nested-composites-combined-passed.gia
```

覆盖的嵌套场景：

1. `whenEntityIsCreated` 轴：数据嵌套复合。
   - `嵌套复合-三数相加` 内部调用两次 `嵌套复合-两数相加`。
   - 输入 `10 + 20 + 30`。
   - 预期打印：`60`。
2. `whenEntityIsDestroyed` 轴：执行嵌套复合。
   - 主图普通打印 → 外部 exec 复合 → 内部 exec 复合 → 主图普通打印。
   - 预期依次看到外部开始、内部执行、主图结束等打印。

---

## 四、本轮自动验证

生成测试 GIA：

```bash
node bin/gsts.mjs tests/composite/v2/nested-composites/nested-composites-combined-step1.ts || true
```

自动检查命令：

```bash
npx tsx tests/composite/trace-exec-flow.ts dist/tests/composite/v2/nested-composites/nested-composites-combined-step1.gia --io
npx tsx tests/composite/trace-dataflow.ts dist/tests/composite/v2/nested-composites/nested-composites-combined-step1.gia --list-nodes
npx tsx tests/composite/trace-dataflow.ts dist/tests/composite/v2/nested-composites/nested-composites-combined-step1.gia 4 --all-params
npx tsx tests/composite/trace-dataflow.ts dist/tests/composite/v2/nested-composites/nested-composites-combined-step1.gia 5 --all-params
npx tsx tools/decode-gia.ts dist/tests/composite/v2/nested-composites/nested-composites-combined-step1.gia > /tmp/nested-composites-combined-step1.decoded.json
```

自动验证摘要：

1. 控制流 trace 正常：执行型嵌套复合在主图中保持 `print → composite → print` 串联。
2. 数据流 trace 能从主图打印追进 `三数相加`，再追到内部 `两数相加` 的 impl 节点。
3. 解码确认有 4 个 `CompositeDef` / impl graph：两数相加、三数相加、内部执行、外部执行。
4. 上层 impl GraphUnit 的 top-level `relatedIds` 指向被调用的子复合：
   - `三数相加` → `两数相加`
   - `外部执行` → `内部执行`
5. 源码整理为 `passed` 后，重新生成 `dist/tests/composite/v2/nested-composites/nested-composites-combined-passed.gia` 成功。最后注入阶段因本机 `Beyond_Local_Save_Level` 缺失报错，但 GIA 产物已生成，不影响本轮归档事实。

---

## 五、本轮实现注意点

执行型嵌套复合的外部复合 build 中，`f.callComposite(innerExec, ...)` 返回的是带 `__markerNodeId` 的调用结果对象，而不是普通 `MetaCallRecordRef`。因此要把该 marker 用于连线，同时用 `{ id: inner.__markerNodeId }` 标记 outflow：

```typescript
const start = f.node('print_string', [new strValue('嵌套复合 外部执行开始')])
const inner = f.callComposite(innerExec, { message: args.message })
f.link(start, 0, inner)
f.outflow('完成', { id: inner.__markerNodeId }, 0)
```

如果直接 `f.outflow('完成', inner, 0)`，Stage 2 会报：

```text
Error: outflow: ref is not a registered node
```

这不是游戏内问题，而是当前 runtime API 的对象形态差异。后续如果整理 API，可以考虑让 `outflow()` 接受 composite call marker 对象，或提供更明确的 helper。

---

## 六、本轮没有覆盖到的点

本轮只覆盖基础嵌套复合，没有覆盖：

1. 逐字段复刻旧 `demo_C_nested_call.gia`、`nested_exact.gia` 或 `user_edit/嵌套.gia`。
2. 多 InFlow / 多 OutFlow / fan-in / fan-out 精确复刻。
3. 嵌套复合内复杂分支、循环或多入口拓扑。
4. 节点图变量。
5. 大型流程和复杂布局专项 case。

---

## 七、下一轮建议

建议下一轮继续进入更复杂的控制流分类：

1. `raw-control-flow/`：从 `recreate_debug5.gia` / `recreate_debug6.gia` 开始。
2. `graph-variables/`：从 `节点图变量.gia` 开始。
3. `all-types/` 或 `type-conversion/`：从全覆盖类型类样本开始。

继续工作时遵守：

1. 项目内按特点建目录：`tests/composite/v2/<feature>/`。
2. 给用户验证的 GIA 先放 `Beyond_Local_Export` 根目录。
3. 用户确认通过并允许归档后，使用 `mv -f` 移动到 `真-测试通过/v2/<feature>/<case>-passed.gia`，不要复制后在根目录留下残留文件。
4. v2 测试源码目录只保留高质量最终参考文件；临时 step 和探针文件及时清理或改名为 passed 参考文件。

---

## 八、关键命令

```bash
node bin/gsts.mjs tests/composite/v2/nested-composites/nested-composites-combined-passed.ts || true
npx tsx tests/composite/trace-exec-flow.ts dist/tests/composite/v2/nested-composites/nested-composites-combined-passed.gia --io
npx tsx tests/composite/trace-dataflow.ts dist/tests/composite/v2/nested-composites/nested-composites-combined-passed.gia --list-nodes
```

导出给用户测试：

```bash
export root='/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export'
rm -f "$root/nested-composites-combined-step1.gia"
cp dist/tests/composite/v2/nested-composites/nested-composites-combined-step1.gia "$root/nested-composites-combined-step1.gia"
```

通过后归档（移动，不复制）：

```bash
export root='/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export'
mkdir -p "$root/真-测试通过/v2/nested-composites"
mv -f "$root/nested-composites-combined-step1.gia" \
  "$root/真-测试通过/v2/nested-composites/nested-composites-combined-passed.gia"
```

---

## 九、给下一位助手的一句话

> `nested-composites` 第三个 v2 分类已经游戏内验证通过并归档；项目参考源码为 `tests/composite/v2/nested-composites/nested-composites-combined-passed.ts`，归档 GIA 为 `真-测试通过/v2/nested-composites/nested-composites-combined-passed.gia`。本轮验证纯数据嵌套复合和执行型嵌套复合都可用，且上层 impl GraphUnit 的 `relatedIds` 正确指向被调用子复合。执行型嵌套中 `f.callComposite()` 返回 marker 对象，给 `f.outflow()` 时需用 `{ id: inner.__markerNodeId }` 适配当前 runtime API。
