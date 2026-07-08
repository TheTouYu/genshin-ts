# 布局任务交接文档 · 物理运动复刻 Round 1

> 状态：已完成 / Step 0 已游戏内验证
> 来源：真实 GIA 验证 + 当前 gsts 复刻脚本 + 用户游戏内测试反馈
> 最近校验：2026-07-08
> 适用范围：`复杂gia/物理运动.gia` 结构复刻、AI 学习复杂 GIA API 写法、布局压力测试

> **本轮结果**：开始以真实 `复杂gia/物理运动.gia` 为样本进行小步结构复刻。用户明确纠正：目标不是复刻真实文件坐标，也不假设真实布局完美；目标是逐步写出与真实 GIA 控制流、数据流、复合节点结构一致的 gsts 代码，用这些真实结构测试当前布局方案是否合理，并沉淀 AI 可复用的 API 写法知识。本轮 Step 0 已严格改为真实 `Create Prefab` + `Get Custom Variable("物理计算元件id")` 数据来源 + `设置物理参数` 复合调用，用户已游戏内验证布局合理。

---

## 一、本轮目标校正

本轮开始时曾误把目标理解为“参考真实坐标布局”。用户已明确校正：

1. 真实 GIA 文件布局并非完美，不应刻意复刻坐标。
2. 当前阶段是抄写真实 GIA 的结构，尤其是控制流、数据流、参数来源和复合节点。
3. 不能用假的节点、假的参数来源或无意义占位来替代真实结构。
4. 每一轮可以很小，但必须包含可核验的小结构，用来逐步暴露当前布局方案的问题。
5. 最终目标之一是让 AI 学会写出较完整、较正确的复杂 GIA 代码。

---

## 二、新增持续维护文档

新增：

```text
docs/composite-ir/physics-motion-recreate-guide.md
```

定位：

- 不是普通 handover，而是持续维护的“AI 如何写 `物理运动.gia` 复刻代码”的知识文档。
- 每轮复刻新 API、新节点、新参数来源后，都应补充到该文档。
- 文档明确区分：真实 GIA 证据、当前 gsts 写法、已知差异、下一步计划。

当前已记录：

- 工作原则。
- 真实样本路径。
- 常用 trace/dataflow/decode 命令。
- Step 0 真实结构和证据。
- Step 0 gsts 写法。
- 当前生成结构和用户游戏内验证状态。
- 下一步完整复刻 `设置物理参数` 的启动命令。
- 后续多文件组织探索方向。

---

## 三、Step 0 当前实现

新增测试脚本：

```text
tests/layout/layout-physics-motion-step0-init.ts
```

真实参考子图：

```text
n38 When Entity Is Created @ (-4191, 1991)
├─ n29 Create Prefab       @ (-3355, 1812)
└─ n12 复合:设置物理参数    @ (-3899, 2315)

n45 Get Custom Variable("物理计算元件id") -> n29 Create Prefab.InParam[0]
n38 When Entity Is Created.OutParam[0] -> n12 设置物理参数.InParam[0]
```

当前生成子图：

```text
n1 When Entity Is Created
├─ n3 Create Prefab
└─ n4 复合:设置物理参数-step0

n2 Get Custom Variable -> n3 Create Prefab.InParam[0]
n1 When Entity Is Created.OutParam[0] -> n4 设置物理参数-step0.InParam[0]
```

关键写法：

```ts
const prefabIdFromCustomVariable = f
  .getCustomVariable(e.eventSourceEntity, '物理计算元件id')
  .asType('prefab_id')

const createPrefab = f.node('create_prefab', [prefabIdFromCustomVariable])
f.link(f.entry(), 0, createPrefab)
```

`设置物理参数-step0` 当前只是壳复合，用于保持主图调用结构和实体输入；下一轮要完整复刻其内部。

---

## 四、真实 GIA 证据

已执行：

```bash
npx tsx tests/composite/trace-dataflow.ts \
  /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/复杂gia/物理运动.gia \
  29 --all-params --max-depth 10

npx tsx tests/composite/trace-dataflow.ts \
  /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/复杂gia/物理运动.gia \
  12 --all-params --max-depth 10

npx tsx tools/decode-gia.ts \
  /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/复杂gia/物理运动.gia \
  | jq '.graph.graph.inner.graph.nodes[] | select(.nodeIndex==45 or .nodeIndex==29 or .nodeIndex==38 or .nodeIndex==12)'
```

关键观察：

```text
Create Prefab.InParam[0] "Pfb"
  <- n45 Get Custom Variable.OutParam[0]

设置物理参数.InParam[0]
  <- n38 When Entity Is Created.OutParam[0]

n45 Get Custom Variable.InParam[1]
  = "物理计算元件id"
```

---

## 五、当前自动验证与游戏内验证

已执行：

```bash
npm run build
node bin/gsts.mjs tests/layout/layout-physics-motion-step0-init.ts || true
npx tsx tests/composite/trace-exec-flow.ts dist/tests/layout/layout-physics-motion-step0-init.gia --io
npx tsx tests/composite/trace-dataflow.ts dist/tests/layout/layout-physics-motion-step0-init.gia 3 --all-params --max-depth 10
npx tsx tests/composite/trace-dataflow.ts dist/tests/layout/layout-physics-motion-step0-init.gia 4 --all-params --max-depth 10
npx tsx tests/composite/dump-nodes.ts dist/tests/layout/layout-physics-motion-step0-init.gia
```

生成文件：

```text
dist/tests/layout/layout-physics-motion-step0-init.gia
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局physics-motion-step0-init.gia
```

自动验证摘要：

```text
n1 When Entity Is Created
  OutFlow[0] -> n3 Create Prefab
  OutFlow[0] -> n4 复合:设置物理参数-step0

n3 Create Prefab.InParam[0]
  <- n2 Get Custom Variable.OutParam[0]

n4 设置物理参数-step0.InParam[0]
  <- n1 When Entity Is Created.OutParam[0]
```

坐标：

```text
n1 When Entity Is Created      @ (2, 3)
n3 Create Prefab               @ (802, 1)
n4 复合:设置物理参数-step0     @ (803, 619)
n2 Get Custom Variable         @ (383, 191)
```

用户反馈：已游戏内核验，布局合理。

---

## 六、已知差异

真实 `Create Prefab` 只有 `Pfb` 和 `Bol` 两个显式 pin，其他参数是预设值。当前 gsts 通过：

```ts
f.node('create_prefab', [prefabIdFromCustomVariable])
```

保持关键 `Pfb` 数据来源一致，其它输入走当前编译器默认值。该差异已记录在 `physics-motion-recreate-guide.md`。

后续如果需要值级完全一致，应单独分析 `Create Prefab` 默认 pin 的 GIA 编码，不要用假参数来源补齐。

---

## 七、下一轮任务

用户指定下一步：完整复刻底下的 `设置物理参数` 复合节点。

下一轮建议先执行：

```bash
npx tsx tests/composite/trace-exec-flow.ts \
  /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/复杂gia/物理运动.gia \
  --expand=设置物理参数 --io

npx tsx tests/composite/trace-dataflow.ts \
  /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/复杂gia/物理运动.gia \
  --list-nodes --composite=设置物理参数
```

然后逐个内部节点确认：

1. 内部控制流入口和出口。
2. 系统 API 节点类型。
3. 每个参数的数据来源。
4. 是否有多入口、多出口、fan-in/fan-out，需要 raw control-flow DSL。
5. 写完后把新增 API 写法补到 `physics-motion-recreate-guide.md`。

---

## 八、后续工程组织探索

用户希望下一轮探索把完整 `物理运动.gia` 分散在多个测试文件/函数库中，模拟真实写代码场景，而不是把所有内容堆在单个文件中。

建议方向：

```text
tests/layout/physics-motion/
├── composites.ts
├── variables.ts
├── step0-init.ts
├── step1-params.ts
└── main.ts
```

需要验证：

- gsts pipeline 对测试入口跨文件 import 的支持是否稳定。
- 多个 step 入口是否能复用同一批 composite/helper。
- 最终 `main.ts` 是否能编译为一个完整 GIA。

---

## 九、给下一位助手的一句话

> 不要复刻坐标，不要用占位节点。目标是逐步抄真实 `物理运动.gia` 的控制流、数据流、参数来源和复合结构，用真实复杂结构测试自动布局。Step 0 已完成并游戏内验证：`When Entity Is Created -> Create Prefab / 设置物理参数-step0`，其中 `Create Prefab.Pfb` 来自 `Get Custom Variable("物理计算元件id")`。下一轮先完整 trace 并复刻 `设置物理参数` 复合内部，同时继续维护 `docs/composite-ir/physics-motion-recreate-guide.md`。
