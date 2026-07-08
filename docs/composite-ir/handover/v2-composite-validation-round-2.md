# V2 复合节点验证交接文档 · 第二轮

> 状态：已验证 / 已归档 / 历史记录
> 来源：当前代码实现 + 自动解码验证 + 用户游戏内验证反馈
> 最近校验：2026-07-08
> 适用范围：v2 简单场景合集、复合 impl 参数 pin 编码 bug 修复、下一轮继续选择更复杂 case 前的交接

> **必须先读的工作细节**：[layout-working-rules.md](layout-working-rules.md)
> **上一轮入口**：[v2-composite-validation-round-1.md](v2-composite-validation-round-1.md)
> **当前推荐低层控制流 API**：[../../architecture/composite/raw-control-flow-dsl-quickstart.md](../../architecture/composite/raw-control-flow-dsl-quickstart.md)
> **当前复合节点 API**：[../../architecture/composite/dsl-api.md](../../architecture/composite/dsl-api.md)

---

## 一、本轮目标

本轮从 `真-测试通过` 中的简单 case 开始，建立按“特点分类”的 v2 测试目录，并把多个简单场景合并到一个 GIA 中，方便用户一次导入、按不同事件轴验证。

用户要求的关键工作方式：

1. 项目测试目录和游戏测试目录都按特点建二级目录。
2. 简单场景不要拆成过多 GIA；优先合并为一个 GIA，内部用多个事件触发轴覆盖多个场景。
3. 测试 GIA 直接导出到游戏导入根目录 `Beyond_Local_Export`，不要只放在 `真-测试通过/v2/...`。
4. 如果合集某一部分出问题，再拆单独测试文件定位。

---

## 二、本轮新增目录和文件

项目目录：

```text
tests/composite/v2/simple-scenes/
```

游戏侧 v2 分类目录：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/真-测试通过/v2/simple-scenes
```

本轮主要源码（清理后保留的高质量参考文件）：

```text
tests/composite/v2/simple-scenes/simple-scenes-combined-passed.ts
```

该文件对应图名：

```text
V2-简单场景合集-passed
```

v2 目录只保留可给他人参考的最终版本；本轮早期的 step/拆分探针源码已清理。

---

## 三、用户游戏内验证结果

用户已游戏内确认通过，并已归档：

测试导入根目录文件：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/simple-scenes-combined-passed.gia
```

v2 passed 归档文件（清理后该分类目录唯一保留的 GIA）：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/真-测试通过/v2/simple-scenes/simple-scenes-combined-passed.gia
```

该 GIA 对应图名：

```text
V2-简单场景合集-passed
```

覆盖的简单场景：

1. `whenEntityIsCreated` 轴：基础 exec-only 复合调用 + 带参打印复合调用。
2. `whenEntityIsDestroyed` 轴：两个 exec-only 复合顺序调用。
3. `whenTimerIsTriggered` 轴：整数纯数据复合串联，包含 `数据翻倍` 和 `数据加一`。
4. `whenSkillNodeIsCalled` 轴：整数翻倍 + 浮点三数相乘纯数据复合。

注意：用户说通过后，本轮已提交代码，并在用户补充确认后创建了 passed 归档文件。随后按用户要求清理了 v2 测试目录和游戏 v2 归档目录，只保留高质量最终参考文件：

```text
tests/composite/v2/simple-scenes/simple-scenes-combined-passed.ts
真-测试通过/v2/simple-scenes/simple-scenes-combined-passed.gia
```

---

## 四、本轮修复的编译器 bug

### 4.1 问题现象

在 `简单场景合集-数据加一-step1` 中，用户反馈：

- 复合节点只有一个参数 `x`。
- 内部实现节点 `x + 1` 中的 `+1` 应该是实现节点默认值，不应变成复合参数。
- 游戏里实际表现为 `+0` 或默认值异常。

### 4.2 错误定位链路

最小复现：

```text
tests/composite/v2/simple-scenes/bug-data-default-plus-one.ts
```

逐层结论：

1. TS 源码正确：`f.addition(args.x, new int(1n))`。
2. `.gs.ts` 正确保留 `new int(1n)`。
3. IR JSON 正确：impl addition args 为 `capture x` + `int value 1`。
4. 错在 Stage 3 `IR -> GIA`：`src/compiler/ir_to_gia_transform/composite.ts` 的 `buildImplNodePins()` 遇到 `capture === true` 时直接 `continue`，没有递增 `pinIndex`。

结果：

```text
外部参数 x -> compositePins -> addition.InParam[0]
内部常量 1 -> 被错误编码到 addition.InParam[0]
```

两者撞 pin，游戏中表现异常。

### 4.3 修复

提交：

```text
3310af9 fix composite impl capture pin indexing
```

修复行为：

- capture 参数仍然不生成物理 InParam pin；
- 但 capture 参数必须占用原始参数槽位，因此需要 `pinIndex++`；
- 后续 literal/conn 参数保持原始 arg index，不再左移。

修复后解码确认：

```text
外部参数 x -> addition.InParam[0]
内部常量 1 -> addition.InParam[1], bInt.val = 1
```

用户已游戏内确认该改动通过。

---

## 五、本轮发现但未作为问题处理的点

用户额外反馈：

> `简单场景合集-三数相乘-step3` 在游戏里明确显示浮点数，但整数 `数据翻倍` / `数据加一` 复合节点显示泛型。

本轮已做初步比对，结论：暂不作为 bug 处理。

已比对项：

1. `CompositeDef` 层整数参数编码为 `class=2,type1=3,type2=3`。
2. 该编码与旧的已通过样本一致，包括：
   - `simple_double.gia`
   - `ts_g_define_双倍运算.gia`
3. 浮点三数相乘编码为 `class=4,type1=5,type2=5`，与 `replicate_mul3.gia` 一致。
4. 主图调用节点整数 pin 有具体 `bInt` / `type=3`，浮点 pin 有 `bFloat` / `type=5`。

可能解释：整数加法内部节点 `addition` 使用的节点 ID/编辑器显示策略可能偏泛型；浮点乘法节点显示为浮点，不代表 CompositeDef 参数编码缺失。用户已表示“明白，这个不是问题”。

后续若再次怀疑该点，应优先比较真实编辑器导出的同类整数复合 impl 节点 pin，而不是从显示文案直接判断类型丢失。

---

## 六、本轮没有覆盖到的点

本轮只覆盖“简单场景”分类，且目标是合并验证与修复一个数据默认值编码 bug。未覆盖以下内容：

1. `basic_call_param.gia` 等真实旧文件的逐字段复刻对比；本轮是功能等价改写，不是逐字段复刻。
2. 嵌套复合：如 `demo_C_nested_call.gia`、`nested_exact.gia`。
3. 混合普通节点和复合节点：如 `mixed_composite_and_normal.gia`。
4. 多 InFlow / 多 OutFlow / fan-in / fan-out 精确复刻：如 `recreate_debug5.gia`、`recreate_debug6.gia`、`分支2-精确.gia`。
5. 节点图变量：如 `节点图变量.gia`。
6. 类型全覆盖与类型转换：如 `全覆盖类型复合.gia`、`全覆盖类型转化.gia`。
7. 大型流程：如 `完整创建爱心流程.gia`、心形动画相关文件。
8. 布局专项 case：`真-测试通过/布局/` 下的文件。
9. 合并版文件命名清理：当前源码文件名仍是 `simple-scenes-combined-step1.ts`，图名已经是 step3。
10. 自动测试断言：本轮主要依赖 `npm run build`、手工生成、decode/trace 和用户游戏内验证；没有把最小复现接入独立自动断言脚本。

---

## 七、下一轮建议

建议下一轮不要继续扩大“简单场景”，而是选择一个新的特点分类。推荐顺序：

1. `nested-composites/`：从 `demo_C_nested_call.gia` 或 `nested_exact.gia` 开始。
2. `mixed-normal-composite/`：从 `mixed_composite_and_normal.gia` 开始。
3. `raw-control-flow/`：从 `recreate_debug5.gia` / `recreate_debug6.gia` 开始。
4. `graph-variables/`：从 `节点图变量.gia` 开始。

继续工作时遵守：

1. 项目内按特点建目录：`tests/composite/v2/<feature>/`。
2. 游戏侧可放临时分类目录：`真-测试通过/v2/<feature>/`，但给用户验证的文件优先直接复制到 `Beyond_Local_Export` 根目录。
3. 能合并的简单功能优先合并为一个 GIA，多事件轴区分；复杂或出错点再拆单独复现文件。
4. 如果某个行为被用户游戏内确认通过，先提交相关代码；用户明确说可以归档后，再复制为 `真-测试通过/v2/<feature>/<case>-passed.gia`。

---

## 八、本轮关键命令

```bash
npm run build
node bin/gsts.mjs tests/composite/v2/simple-scenes/simple-scenes-combined-passed.ts || true
npx tsx tests/composite/trace-exec-flow.ts dist/tests/composite/v2/simple-scenes/simple-scenes-combined-passed.gia --io
npx tsx tests/composite/trace-dataflow.ts dist/tests/composite/v2/simple-scenes/simple-scenes-combined-passed.gia 12 --all-params
npx tsx tools/decode-gia.ts dist/tests/composite/v2/simple-scenes/simple-scenes-combined-passed.gia > /tmp/simple-scenes-combined-passed.decoded.json
```

导出给用户测试：

```bash
export root='/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export'
rm -f "$root/simple-scenes-combined-passed.gia"
cp dist/tests/composite/v2/simple-scenes/simple-scenes-combined-passed.gia "$root/simple-scenes-combined-passed.gia"
```

---

## 九、给下一位助手的一句话

> 简单场景合集已经游戏内验证通过、提交并归档（`3310af9`，归档文件 `真-测试通过/v2/simple-scenes/simple-scenes-combined-passed.gia`；项目参考源码 `tests/composite/v2/simple-scenes/simple-scenes-combined-passed.ts`），核心 bug 是 Stage 3 复合 impl capture 参数未占 pin 位导致内部默认值左移，已修复。v2 simple-scenes 目录已清理，只保留 passed 高质量参考文件。下一轮应选新特点分类（建议嵌套复合或混合普通节点/复合节点），项目和游戏侧都按特点建二级目录，给用户验证的 GIA 直接复制到 `Beyond_Local_Export` 根目录。
