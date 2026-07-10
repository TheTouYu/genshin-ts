# 布局任务交接文档 · 物理运动复刻 Round 5

> 状态：历史记录
> 来源：当前代码实现 + 真实 GIA 验证 + 自动结构验证 + 用户游戏内反馈
> 最近校验：2026-07-10
> 适用范围：`复杂gia/物理运动.gia` 复刻工程、impl capture pin、generic custom-variable 类型、detached S/D Set、注入与资源提取

> **本轮结果**：已修复复合 impl 中 capture 参数导致的 pin index 压缩，以及 `get_custom_variable(...).asType(...)` 未生成 typed `concreteId`/ConcreteBase OutParam 的问题；已补回 `S`、`D` 两个 Set 节点并保持 detached。生成结构、针对性回归和用户游戏内测试均通过。注入成功写入 `1073741845.gil`，注入过程自动提取的资源代码应保留。

通用路径、注入命令、小步验证和用户交互约定见 [layout-working-rules.md](layout-working-rules.md)。尤其注意：遇到任何阻碍、不确定、用户侧状态或业务取舍问题，必须先停下来向用户确认；游戏内状态、资源副作用和真实意图不是单靠大模型继续推断就能高效、可靠确定的。

---

## 一、本轮完成的编译器修复

### 1.1 capture 参数保留 pin index 空洞

修改文件：

```text
src/compiler/ir_to_gia_transform/composite.ts
```

Round 4 已确认 IR 中 `get_custom_variable` 的参数形状为：

```json
[
  { "type": "entity", "value": null, "capture": true },
  { "type": "str", "value": "G" }
]
```

旧实现跳过 capture 参数时没有递增 `pinIndex`，导致变量名被压缩到 `InParam[0]`。真实 GIA 中 capture 实体占逻辑 index 0，变量名应位于 `InParam[1]`。

本轮修改：

- 通用 impl arg 路径跳过 `capture: true` 时仍递增 `pinIndex`。
- typed `get_custom_variable` vendor 模板路径只过滤对应的物理 InParam，不过滤同 index 的 OutParam。

游戏内结果：变量名不再显示为空。

### 1.2 impl 输出类型索引

新增 `buildImplConnTypeIndex()`：

- 扫描所有 impl node 的 `conn.value.type`。
- 建立 `source node id -> output pin index -> value type` 索引。
- 同一输出 pin 出现冲突类型时直接报错，不静默选择其中一个。
- 若 generic producer 直接暴露为复合 OutParam、没有普通下游 conn，则回退到 `implOutParamMap`。

这使 Stage 3 能把 Stage 2 已经携带的 `.asType(...)` 结果反映回生产节点自身。

### 1.3 typed `get_custom_variable` 编码

根据 impl 输出类型解析 typed vendor node id：

```text
int   -> concreteId 50
str   -> concreteId 51
entity-> concreteId 52
guid  -> concreteId 53
float -> concreteId 54
vec3  -> concreteId 55
bool  -> concreteId 56
```

编码时保留 `genericId.nodeId=50`，只切换 `concreteId`，并复用对应 vendor typed-node 的 pin 模板。

本轮重点验证：

```text
float: type=5, ConcreteBase, indexOfConcrete=4, inner=FloatBase
GUID:  type=2, ConcreteBase, indexOfConcrete=3, inner=IdBase
int:   type=3, ConcreteBase, indexOfConcrete=0, inner=IntBase
```

因此 `G -> mul3` 的来源 OutParam 与目标 float InParam 类型一致，游戏内连线恢复。

---

## 二、复刻源码修复

修改文件：

```text
tests/layout/physics-motion/composites/set-physics-params.ts
```

补回两个真实文件中存在但已禁用的节点：

```text
Set Node Graph Variable("S")
Set Node Graph Variable("D")
```

实现方式：

- 使用 `f.node('set_node_graph_variable', ...)` 创建节点并保留数据输入。
- 不保存 handle、不调用 `f.link(entry, ...)`。
- `gsts.physics-motion.config.ts` 已设置 `removeUnusedNodes: false`，因此 detached 节点会保留在 impl 图中。

最终结构：

```text
Set Node Graph Variable ×13
outer InFlow[0] targets ×11
Set("S") / Set("D") 存在，但不在 InFlow targets 中
```

---

## 三、回归测试

新增：

```text
tests/composite/test-custom-variable-impl-pins.ts
```

该脚本直接构造 `CompositeDefIR` 并调用 `buildCompositeAccessories()`，不依赖游戏注入，验证：

1. capture `InParam[0]` 不编码物理 pin。
2. 变量名保留在 `InParam[1]`。
3. float/guid/int 的 typed `concreteId` 正确。
4. OutParam 为正确 ConcreteBase 类型和 concrete index。

命令：

```bash
npx tsx tests/composite/test-custom-variable-impl-pins.ts
```

结果：

```text
PASS custom-variable impl pin indices and concrete output types
```

相邻回归：

```bash
npx tsx tests/composite/replicate-graph-variable.ts
npx tsx tests/composite/test-phase2-normal-nodes.ts
```

结果：正常完成，Phase 2 为 `12 passed / 0 failed`。

`tests/composite/test-replicate-mul3.ts` 仍报告 6 个既有差异：它期待 capture 输入生成物理 pins，与当前 compositePins 路由方式不一致；本轮真实物理生成物中的 nested `mul3` 调用仍满足 3-pin 结构，未把该旧测试的既有问题扩大到本轮范围。

全量命令：

```bash
npm run quicktest
```

`npm run build` 阶段通过；随后测试语料编译在既有调试脚本 `tests/composite/_dump-layout-c-ir.ts:19` 中止：

```text
[error] cannot infer list type, please add type annotation
```

该文件与本轮改动无关，本轮未扩大范围修复。提交依据为构建通过、针对性 custom-variable 回归通过、Phase 2 回归通过、物理 GIA decoded 断言通过，以及用户游戏内验证通过。

---

## 四、生成结构验证

命令：

```bash
npm run build
node bin/gsts.mjs -c gsts.physics-motion.config.ts || true
npx tsx tools/decode-gia.ts dist/tests/layout/physics-motion/main.gia > /tmp/physics-gen-r5-fixed.json
```

decoded 断言结果：

```json
{
  "customVariables": 12,
  "setNodes": 13,
  "inflowTargets": 11,
  "mul3Pins": 3
}
```

同时逐个检查：

- 12 个 custom variable 名称均位于 `InParam[1]`。
- float custom variables 使用 `concreteId=54`、concrete index 4。
- GUID custom variables 使用 `concreteId=53`、concrete index 3。
- `更新间隔` 使用 `concreteId=50`、concrete index 0。
- `S`、`D` Set 节点不在 outer InFlow targets 中。

---

## 五、注入与资源提取

### 5.1 两种路径的区别

仅执行：

```bash
GSTS_LOCALLOW_DIR=/mnt/c/Users/touyu/AppData/LocalLow \
node bin/gsts.mjs -c gsts.physics-motion.config.ts
```

会生成 `.gia`，但批量注入按 `.gia` 自带 graph id `1073741904` 查找，当前存档中没有该 NodeGraph：

```text
[error] Injection failed main.gia: target NodeGraph not found: 1073741904
```

正确的物理运动注入方式是显式传入生成文件，让配置中的 `inject.nodeGraphId=1073741825` 路径定位目标地图并写入：

```bash
GSTS_LOCALLOW_DIR=/mnt/c/Users/touyu/AppData/LocalLow \
node bin/gsts.mjs -c gsts.physics-motion.config.ts dist/tests/layout/physics-motion/main.gia
```

成功结果：

```text
[ok] injected main.gia -> /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741845.gil (74ms)
```

### 5.2 自动资源提取

指定正确 `GSTS_LOCALLOW_DIR` 后，生成/注入流程会自动提取资源代码。本轮产生的有效变更包括：

```text
src/resources/signals.ts
```

新增 6 个信号定义：

```text
TickUpdate
日志操作
物理运动
物理运动引擎实体
物理运动计算
足球
```

用户明确确认：自动资源代码变更是预期结果，后续会直接使用，不应恢复。

---

## 六、游戏内验证

用户于 2026-07-10 确认：

```text
测试通过！
```

本轮验证目标全部通过：

1. `Get Custom Variable` 输入变量名正常显示。
2. float custom variable 类型和 `G -> mul3` 连线恢复。
3. `S`、`D` Set 节点保留但不接入口控制流。
4. Round 4 已修复的 fan-out、nested literal pin 和布局未出现回归。

---

## 七、本轮协作经验

本轮曾在自动结构断言通过后过早开始更新完成文档，用户提醒尚未进行游戏内核验；随后立即撤回文档，完成显式注入并等待用户确认。另一次把自动提取的 `src/resources/signals.ts` 误判为无关副作用，用户说明该资源代码应保留后再恢复。

应固化的规则：

1. 自动结构验证不能替代用户游戏内验证。
2. 未经用户确认，不提前把本轮写成最终完成状态。
3. 对注入副作用、资源生成、游戏内状态、业务取舍有任何疑问时，立即停下询问。
4. 不要假设大模型仅凭代码就能确定所有真实意图；及时确认能避免返工，通常也是效率最高的路径。

这些规则已写入 [layout-working-rules.md](layout-working-rules.md)。

---

## 八、后续建议

本轮目标已关闭。下一步继续复刻前，建议由用户选择：

1. 是否把当前 `视觉实体guid` custom variable 改为真实文件中的 literal GUID `1077936360`。
2. 是否开始复刻 `物理运动.gia` 的下一个复合结构。
3. 是否先改善 `generic.asType(...)` 到 raw `f.node()` 的 TypeScript 类型适配，减少 `as unknown as value`。

---

## 九、给下一位助手的一句话

> Round 5 已完成并经用户游戏内验证：impl capture 参数不再压缩 pin index，`Get Custom Variable` 名称位于 `InParam[1]`；`.asType(float/guid/int)` 会生成正确 typed concreteId 和 ConcreteBase OutParam，`G -> mul3` 连线恢复；S/D Set 节点已补回但保持 detached。正确注入必须显式传入 `dist/tests/layout/physics-motion/main.gia`，成功写入 `1073741845.gil`；自动提取的 `src/resources/signals.ts` 是预期结果，应保留。任何不确定、用户侧状态或业务取舍问题都应立即停下确认，不要依赖大模型继续猜测。
