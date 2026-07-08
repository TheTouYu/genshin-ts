# V2 复合节点验证交接文档 · 第三轮

> 状态：已验证 / 已归档 / 历史记录
> 来源：当前代码实现 + 自动解码验证 + 用户游戏内验证反馈
> 最近校验：2026-07-08
> 适用范围：v2 混合普通节点与复合节点场景、下一轮选择更复杂 case 前的交接

> **必须先读的工作细节**：[layout-working-rules.md](layout-working-rules.md)
> **上一轮入口**：[v2-composite-validation-round-2.md](v2-composite-validation-round-2.md)
> **当前推荐低层控制流 API**：[../../architecture/composite/raw-control-flow-dsl-quickstart.md](../../architecture/composite/raw-control-flow-dsl-quickstart.md)
> **当前复合节点 API**：[../../architecture/composite/dsl-api.md](../../architecture/composite/dsl-api.md)

---

## 一、本轮目标

本轮按上一轮建议启动第二个特点分类：`mixed-normal-composite/`，验证普通节点与复合节点混用时的控制流和数据流行为。

目标不是逐字段复刻旧的 `mixed_composite_and_normal.gia`，而是做一个更适合作为 v2 参考的合集：在一个 GIA 中用多条事件轴覆盖普通节点与复合节点的典型混合模式。

---

## 二、本轮新增目录和文件

项目目录：

```text
tests/composite/v2/mixed-normal-composite/
```

本轮最终保留源码：

```text
tests/composite/v2/mixed-normal-composite/mixed-normal-composite-combined-passed.ts
```

该文件对应图名：

```text
V2-混合普通与复合-passed
```

游戏侧归档目录：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/真-测试通过/v2/mixed-normal-composite
```

最终归档 GIA：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/真-测试通过/v2/mixed-normal-composite/mixed-normal-composite-combined-passed.gia
```

---

## 三、用户游戏内验证结果

用户已游戏内确认通过。

测试时导出到游戏导入根目录的文件：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/mixed-normal-composite-combined-step1.gia
```

用户确认通过后，按新的归档规则，该文件已**移动**到归档目录，并命名为：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/真-测试通过/v2/mixed-normal-composite/mixed-normal-composite-combined-passed.gia
```

覆盖的混合场景：

1. `whenEntityIsCreated` 轴：普通打印 → exec 复合打印 → 普通打印。
2. `whenEntityIsDestroyed` 轴：普通数据节点 `2 + 3` → 数据复合翻倍 → 普通节点 `+ 4` → 打印，预期值 `14`。
3. `whenTimerIsTriggered` 轴：数据复合翻倍 `6 * 2` → 数据复合加一 → 打印，预期值 `13`。

本轮还按用户补充要求处理了上一轮 simple-scenes 根目录残留文件：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/simple-scenes-combined-passed.gia
```

该文件已移动/覆盖到既有归档：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/真-测试通过/v2/simple-scenes/simple-scenes-combined-passed.gia
```

---

## 四、本轮自动验证

生成测试 GIA：

```bash
node bin/gsts.mjs tests/composite/v2/mixed-normal-composite/mixed-normal-composite-combined-step1.ts || true
```

自动检查命令：

```bash
npx tsx tests/composite/trace-exec-flow.ts dist/tests/composite/v2/mixed-normal-composite/mixed-normal-composite-combined-step1.gia --io
npx tsx tests/composite/trace-dataflow.ts dist/tests/composite/v2/mixed-normal-composite/mixed-normal-composite-combined-step1.gia --list-nodes
npx tsx tests/composite/trace-dataflow.ts dist/tests/composite/v2/mixed-normal-composite/mixed-normal-composite-combined-step1.gia 7 --all-params
npx tsx tests/composite/trace-dataflow.ts dist/tests/composite/v2/mixed-normal-composite/mixed-normal-composite-combined-step1.gia 8 --all-params
npx tsx tests/composite/trace-dataflow.ts dist/tests/composite/v2/mixed-normal-composite/mixed-normal-composite-combined-step1.gia 9 --all-params
npx tsx tests/composite/trace-dataflow.ts dist/tests/composite/v2/mixed-normal-composite/mixed-normal-composite-combined-step1.gia 10 --all-params
npx tsx tests/composite/trace-dataflow.ts dist/tests/composite/v2/mixed-normal-composite/mixed-normal-composite-combined-step1.gia 13 --all-params
npx tsx tests/composite/trace-dataflow.ts dist/tests/composite/v2/mixed-normal-composite/mixed-normal-composite-combined-step1.gia 14 --all-params
npx tsx tests/composite/trace-dataflow.ts dist/tests/composite/v2/mixed-normal-composite/mixed-normal-composite-combined-step1.gia 15 --all-params
npx tsx tests/composite/trace-dataflow.ts dist/tests/composite/v2/mixed-normal-composite/mixed-normal-composite-combined-step1.gia 16 --all-params
npx tsx tools/decode-gia.ts dist/tests/composite/v2/mixed-normal-composite/mixed-normal-composite-combined-step1.gia > /tmp/mixed-normal-composite-combined-step1.decoded.json
```

自动验证摘要：

1. 控制流 trace 正常：普通节点与 exec 复合按 `event → print → composite → print` 串联。
2. 数据流 trace 正常：普通数据节点输出可进入数据复合，数据复合输出可进入普通数据节点和普通打印链。
3. 解码确认有 3 个 `CompositeDef` / impl graph：执行打印、数据翻倍、数据加一。
4. `plusOne` impl 内部默认值 `1` 在 trace 中可见，覆盖上一轮修复过的 capture 参数 pin 占位风险。

归档后为保持项目参考源码名和图名一致，源码重命名为 `mixed-normal-composite-combined-passed.ts`，图名和复合名中的 `step1` 改为 `passed`，并重新生成了 dist 产物用于本地一致性检查。

---

## 五、新增工作流程规则

用户补充并已执行的新规则：

> 归档 GIA 文件时，直接从游戏导入根目录移动到归档目录，而不是复制，防止 `Beyond_Local_Export` 根目录同时存在太多 GIA 文件。

规则已同步到 [layout-working-rules.md](layout-working-rules.md)。

当前推荐流程：

1. 待测文件仍优先导出到 `Beyond_Local_Export` 根目录，方便用户导入。
2. 用户确认通过且允许归档后，使用 `mv -f` 移动到 `真-测试通过/v2/<feature>/<case>-passed.gia`。
3. 若归档目录已有同名 passed 文件，移动时覆盖归档文件，同时根目录不保留同名测试文件。

---

## 六、本轮没有覆盖到的点

本轮只覆盖普通节点与复合节点混合的基础模式，没有覆盖：

1. 逐字段复刻旧 `mixed_composite_and_normal.gia`。
2. 嵌套复合：如 `demo_C_nested_call.gia`、`nested_exact.gia`。
3. 多 InFlow / 多 OutFlow / fan-in / fan-out 精确复刻：如 `recreate_debug5.gia`、`recreate_debug6.gia`、`分支2-精确.gia`。
4. 节点图变量。
5. 类型全覆盖与类型转换全集。
6. 大型流程和复杂布局专项 case。

---

## 七、下一轮建议

建议下一轮继续按特点分类选择更复杂 case：

1. `nested-composites/`：从 `demo_C_nested_call.gia` 或 `nested_exact.gia` 开始。
2. `raw-control-flow/`：从 `recreate_debug5.gia` / `recreate_debug6.gia` 开始。
3. `graph-variables/`：从 `节点图变量.gia` 开始。

继续工作时遵守：

1. 项目内按特点建目录：`tests/composite/v2/<feature>/`。
2. 给用户验证的 GIA 先放 `Beyond_Local_Export` 根目录。
3. 用户确认通过并允许归档后，使用 `mv -f` 移动到 `真-测试通过/v2/<feature>/<case>-passed.gia`，不要复制后在根目录留下残留文件。
4. v2 测试源码目录只保留高质量最终参考文件；临时 step 和探针文件及时清理或改名为 passed 参考文件。

---

## 八、关键命令

```bash
node bin/gsts.mjs tests/composite/v2/mixed-normal-composite/mixed-normal-composite-combined-passed.ts || true
npx tsx tests/composite/trace-exec-flow.ts dist/tests/composite/v2/mixed-normal-composite/mixed-normal-composite-combined-passed.gia --io
npx tsx tests/composite/trace-dataflow.ts dist/tests/composite/v2/mixed-normal-composite/mixed-normal-composite-combined-passed.gia --list-nodes
```

导出给用户测试：

```bash
export root='/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export'
rm -f "$root/mixed-normal-composite-combined-step1.gia"
cp dist/tests/composite/v2/mixed-normal-composite/mixed-normal-composite-combined-step1.gia "$root/mixed-normal-composite-combined-step1.gia"
```

通过后归档（移动，不复制）：

```bash
export root='/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export'
mkdir -p "$root/真-测试通过/v2/mixed-normal-composite"
mv -f "$root/mixed-normal-composite-combined-step1.gia" \
  "$root/真-测试通过/v2/mixed-normal-composite/mixed-normal-composite-combined-passed.gia"
```

---

## 九、给下一位助手的一句话

> `mixed-normal-composite` 第二个 v2 分类已经游戏内验证通过并归档；项目参考源码为 `tests/composite/v2/mixed-normal-composite/mixed-normal-composite-combined-passed.ts`，归档 GIA 为 `真-测试通过/v2/mixed-normal-composite/mixed-normal-composite-combined-passed.gia`。本轮验证普通节点与 exec/data 复合混合串联均正常。用户新增归档规则：通过后的 GIA 从 `Beyond_Local_Export` 根目录 `mv -f` 到归档目录，不再复制，避免根目录堆积文件；该规则已写入 `layout-working-rules.md`。
