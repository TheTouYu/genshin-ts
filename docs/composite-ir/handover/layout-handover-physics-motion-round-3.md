# 布局任务交接文档 · 物理运动复刻 Round 3

> 状态：历史记录
> 来源：当前代码实现 + 真实 GIA 验证 + 用户游戏内核验反馈
> 最近校验：2026-07-09
> 适用范围：`复杂gia/物理运动.gia` 复刻工程、复合节点注入、`设置物理参数` 后续排查

> **本轮结果**：复合节点注入到游戏的功能已修复、游戏内核验通过，并已提交代码：`82261dd fix(injector): include composite graph units`。用户确认：主图正常，复合节点出现，`mul3` 的复合定义也在游戏内出现。剩余问题不在注入器，而在 `设置物理参数` 复刻质量：控制流入口扇出未正确进入最终 GIA、数据流/输入参数/连线多处不一致、复合 impl 布局退化为一条长水平线。

---

## 一、本轮已完成并提交：复合节点注入支持

### 1.1 用户游戏内核验结论

用户反馈：

```text
主图正常，复合节点有了，mul3复合节点的定义在游戏里面也有了。
可以认为注入复合节点到游戏这个功能好了。
```

因此可以把上一轮 P0 “复合节点注入支持”视为已完成。

### 1.2 代码提交

已提交：

```text
82261dd fix(injector): include composite graph units
```

提交范围仅包含：

```text
src/injector/index.ts
```

### 1.3 实现摘要

旧注入路径只替换 `.gil` 中目标 `NodeGraph` 的 `10.1.1` blob，没有写入 `.gia` 的 `accessories`。

本轮修改为：

1. 解码 `.gia` 的 `Root`。
2. 读取 `accessories` 中的：
   - `CompositeDef` 定义。
   - impl `NodeGraph`。
3. 重建 `.gil` 顶层 `field 10` 容器：
   - 保留普通 NodeGraph 列表 `10.1`。
   - 将 CompositeDef 合并到 `10.2`。
   - 保留复合目录标记 `10.3`。
   - 将 impl NodeGraph 合并到 `10.4`。
   - 保留已有 `10.5`（如果存在）。
4. 以 ID 合并：已有同 ID 则替换，没有则追加。

### 1.4 自动验证记录

执行过：

```bash
npm run build
node bin/gsts.mjs -c gsts.physics-motion.config.ts
node bin/gsts.mjs -c gsts.physics-motion.config.ts dist/tests/layout/physics-motion/main.gia
```

注意：`node bin/gsts.mjs -c gsts.physics-motion.config.ts` 仍不适合用来覆盖 `nodeGraphId`，批量注入路径仍会按 `.gia` 自带 graph id 查找。单文件注入命令才会使用配置中的 `nodeGraphId`。

临时 `.gil` 副本结构核验结果：

```text
field 10.1 = 6   普通 NodeGraph
field 10.2 = 2   CompositeDef: mul3 / 设置物理参数
field 10.3 = 1   复合节点目录标记
field 10.4 = 2   impl NodeGraph: 1610710000 / 1610710001
field 10.5 = 0   当前空地图无该附加元数据块
```

实际注入成功：

```text
[ok] injected main.gia -> /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741845.gil
```

---

## 二、用户本轮新反馈的问题

用户核验后反馈 3 类问题：

1. **控制流复刻错误**
   - 原版本拓扑是多个系统节点共用一个控制流输入引脚。
   - 它们没有相互连线，不构成逻辑上的顺序执行关系。
   - 当前复刻版本只有一个节点有输入控制流引脚，其他系统节点没有连接，导致实际上只有一个节点会运行。
2. **数据流节点多处不一致**
   - 包括但不限于缺少输入参数、连线断开。
3. **布局问题非常大**
   - 可接受标准：每个节点相互独立、不重叠、可清楚辨认。
   - 当前版本：一条连线。
   - 用户提供截图：`复合节点-布局错误-设置物理参数-局部.png`。

本轮未改复刻代码，只做结构核验和交接记录。

---

## 三、控制流问题核验

### 3.1 真实 GIA 行为

真实文件：

```text
复杂gia/物理运动.gia
```

命令：

```bash
npx tsx tools/decode-gia.ts 复杂gia/物理运动.gia > /tmp/physics-ref.json
```

真实 `设置物理参数`：

```text
CompositeDef id = 1610612926
impl graph id   = 1610612863
nodes           = 30
compositePins   = 21
```

真实 `compositePins` 中，同一个外部 InFlow 映射到 10 个内部系统节点：

```text
outerPin kind=InFlow index=0 -> innerNodeId: 20,15,1,6,11,13,19,14,26,28
```

这与用户反馈一致：真实拓扑不是顺序链，而是多个系统节点共用同一个控制流入口。

### 3.2 当前生成 GIA 行为

当前生成文件：

```text
dist/tests/layout/physics-motion/main.gia
```

命令：

```bash
npx tsx tools/decode-gia.ts dist/tests/layout/physics-motion/main.gia > /tmp/physics-gen.json
```

当前 `设置物理参数`：

```text
CompositeDef id = 1610700001
impl graph id   = 1610710001
nodes           = 28
compositePins   = 13
```

当前 `compositePins` 中，外部 InFlow 只映射到 1 个内部节点：

```text
outerPin kind=InFlow index=0 -> innerNodeId: 2
```

### 3.3 IR 层证据

当前 IR 文件：

```text
dist/tests/layout/physics-motion/main.json
```

当前 `设置物理参数` 的 `implEdges` 里其实存在从 capture root 到 10 个 Set 节点的扇出：

```json
"implEdges": {
  "1": [
    { "node_id": 18, "source_index": 0, "target_index": 0 },
    { "node_id": 19, "source_index": 0, "target_index": 0 },
    { "node_id": 20, "source_index": 0, "target_index": 0 },
    { "node_id": 21, "source_index": 0, "target_index": 0 },
    { "node_id": 22, "source_index": 0, "target_index": 0 },
    { "node_id": 23, "source_index": 0, "target_index": 0 },
    { "node_id": 24, "source_index": 0, "target_index": 0 },
    { "node_id": 25, "source_index": 0, "target_index": 0 },
    { "node_id": 26, "source_index": 0, "target_index": 0 },
    { "node_id": 27, "source_index": 0, "target_index": 0 }
  ]
}
```

但同一个 IR 的 `compositePins` 只包含 1 条外部 InFlow 映射：

```json
{
  "outerPinKind": 1,
  "outerPinIndex": 0,
  "innerNodeId": 1,
  "innerPinKind": 1,
  "innerPinIndex": 0
}
```

然后 Stage 3 去掉 `__composite_capture__` 后，最终 GIA 只剩一个内部节点被外部 InFlow 映射到。

### 3.4 当前判断

问题很可能不只是复刻代码漏写 `f.link(...)`。

当前复刻代码中确实有：

```ts
const entry = f.entry()
f.link(entry, 0, setGravityForce)
f.link(entry, 0, setMotionEntity)
...
f.link(entry, 0, setVisualEntity)
```

IR `implEdges` 也证明这些 link 被捕获了。

真正丢失发生在 `CompositeDefIR.compositePins` 生成或 Stage 3 `buildCompositeAccessories` 编码边界：多条 root fan-out 没有转换成“同一个外部 InFlow 映射多个内部 InFlow”的 `compositePins`。

下一轮优先排查：

```text
src/runtime/composite_registry.ts
src/runtime/core.ts
src/compiler/ir_to_gia_transform/composite.ts
```

重点搜索/核对：

- `CompositeCapture.inflowMarks`
- `CompositeDefIR.compositePins`
- `__composite_capture__` root fan-out 如何映射到外部 InFlow
- Stage 3 过滤 capture root 后是否应补齐所有 root fan-out 目标的 InFlow compositePins

---

## 四、数据流问题核验

### 4.1 节点数量差异

真实 `设置物理参数`：

```text
nodes = 30
Set Node Graph Variable ×13
Get Custom Variable ×12
Query Entity by GUID ×2
Data Type Conversion ×1
Division ×1
复合:mul3 ×1
```

当前生成：

```text
nodes = 28
Set Node Graph Variable ×11
Get Custom Variable ×12
Query Entity by GUID ×2
Data Type Conversion ×1
Division ×1
复合:mul3 ×1
```

仍缺两个 `Set Node Graph Variable`。上一轮已怀疑是 `S`、`D` 未写入最终 impl 图；本轮 IR 也能看到 `Get Custom Variable("S")`、`Get Custom Variable("D")` 存在，但没有对应 Set 节点。

### 4.2 `setHalfGravityDeltaSquared` 未接入入口

当前源码：

```text
tests/layout/physics-motion/composites/set-physics-params.ts
```

其中创建了：

```ts
const setHalfGravityDeltaSquared = f.node('set_node_graph_variable', ...)
```

但没有：

```ts
f.link(entry, 0, setHalfGravityDeltaSquared)
```

因此即使后续修复多 InFlow fan-out，当前 `0.5gt` 的 Set 节点也不会从入口执行。下一轮应先补这条 link，再重新对比节点数和 `compositePins`。

### 4.3 `mul3` 调用 pin 数不一致

真实 `设置物理参数` 内部的 `复合:mul3`：

```text
pins = 3
```

当前生成的 `复合:mul3`：

```text
pins = 2
```

在当前 decoded GIA 中，`mul3` 调用节点少了一个 pin，用户反馈“缺少输入参数、连线断开”与此吻合。

需要重点排查：

- `f.callComposite(mul3, { a, b, c: new floatValue(0.5) })` 中 literal 参数 `c` 是否应在复合调用节点上生成 InParam pin。
- Stage 3 对 `__composite_call__` 的 InParam 构建是否漏掉 literal composite input。
- `buildCompositePins` 与 `buildImplNodePins` 是否只处理 conn 输入，未完整处理 literal 输入。

### 4.4 `视觉实体` 来源差异仍保留

真实：

```text
Query Entity by GUID(literal guid 1077936360)
```

当前：

```text
Get Custom Variable("视觉实体guid") -> Query Entity by GUID
```

这是工程化可维护性与真实结构复刻之间的差异，下一轮需要由用户决定是否改回 literal GUID。

---

## 五、布局问题核验

### 5.1 用户游戏内反馈

用户可接受标准：

```text
每个节点相互独立，不重叠，可以清楚辨认。
```

当前版本：

```text
一条连线
```

用户提供截图：

```text
复合节点-布局错误-设置物理参数-局部.png
```

当前会话工作区未找到该截图文件，因此本文档仅记录用户反馈，不把截图作为脚本验证产物。

### 5.2 decoded GIA 坐标证据

真实 `设置物理参数` impl 图 bbox：

```text
minX = -1207.67
maxX = 1305.24
minY = -1096
maxY = 2538.59
```

真实节点没有重复坐标，且二维展开。

当前生成 `设置物理参数` impl 图 bbox：

```text
minX = 0
maxX = 21600
minY = 300
maxY = 300
```

当前所有可见节点都在同一条水平线上：

```text
n2  x=0      y=300
n3  x=800    y=300
n4  x=1600   y=300
...
n29 x=21600  y=300
```

这与用户反馈“一条连线”完全一致。

### 5.3 当前判断

布局问题不是单纯“节点重叠”，而是复合 impl 布局把整个图退化成一条超长水平链。可能原因包括：

1. 多个 entry fan-out 未通过 `compositePins` 正确表达，布局算法看到的入口结构失真。
2. `computeImplLayout()` 对只有 capture-root fan-out / detached raw nodes / data-only dependencies 的图缺少分层布局策略。
3. 当前复刻源码大量使用 `f.node()` detached 节点，布局核心可能把它们当作同一层孤立/顺序节点处理。

下一轮建议在修复 InFlow fan-out 后再评估布局。如果 fan-out 修复后仍是一条线，再单独改 `computeImplLayout()`。

---

## 六、下一轮建议优先级

### P0：修复复合 impl 外部 InFlow fan-out 映射

目标：让一个外部 InFlow 能映射到多个内部系统节点的 InFlow，与真实 `设置物理参数` 的 `compositePins` 行为一致。

验收标准：

```text
生成 GIA 中 设置物理参数.compositePins:
outerPin kind=InFlow index=0 的条目数量应接近真实 10，而不是当前 1。
```

建议命令：

```bash
npx tsx tools/decode-gia.ts dist/tests/layout/physics-motion/main.gia > /tmp/physics-gen.json
```

用脚本统计：

```text
.accessories[] | select(.compositeDef.inner.def.name=="设置物理参数")
  -> relatedIds[0].id
  -> impl graph compositePins
```

### P1：补齐 `设置物理参数` 当前源码漏接的执行节点

至少先补：

```ts
f.link(entry, 0, setHalfGravityDeltaSquared)
```

然后重新核对：

```text
Set Node Graph Variable ×13 vs 当前 ×11
```

并继续确认 `S`、`D` 应不应该写入 Node Graph Variable。

### P2：修复 composite call literal 输入 pin

目标：当前 `mul3` 调用节点 pins 从 2 修到 3，确保 `c = 0.5` literal 输入在游戏内可见且连线/参数完整。

相关方向：

```text
src/compiler/ir_to_gia_transform/index.ts
src/compiler/ir_to_gia_transform/composite.ts
```

重点看 `__composite_call__` 节点 pin 构建逻辑。

### P3：重新评估 impl 布局

在 P0/P1/P2 后重新生成并进游戏看布局。如果仍是超长水平线，再改布局算法。

最低验收标准：

```text
每个节点相互独立，不重叠，可以清楚辨认。
```

不要求复刻真实坐标，但不能退化为 `minY == maxY` 的单行长链。

### P4：再处理真实差异

包括：

1. `视觉实体` 是否改回 literal GUID `1077936360`。
2. `trace-exec-flow --expand=设置物理参数` 对内部事件起点显示 0 的问题。
3. 继续维护 `docs/composite-ir/physics-motion-recreate-guide.md`。

---

## 七、下一轮起手命令

建议下一轮先执行：

```bash
npm run build
node bin/gsts.mjs -c gsts.physics-motion.config.ts || true
npx tsx tools/decode-gia.ts 复杂gia/物理运动.gia > /tmp/physics-ref.json
npx tsx tools/decode-gia.ts dist/tests/layout/physics-motion/main.gia > /tmp/physics-gen.json
npx tsx tests/composite/trace-dataflow.ts 复杂gia/物理运动.gia --list-nodes --composite=设置物理参数
npx tsx tests/composite/trace-dataflow.ts dist/tests/layout/physics-motion/main.gia --list-nodes --composite=设置物理参数
```

注意：如果只是生成结构用于对比，可以忽略 config 命令末尾的注入失败；如果要真实注入游戏，仍使用单文件命令：

```bash
node bin/gsts.mjs -c gsts.physics-motion.config.ts dist/tests/layout/physics-motion/main.gia
```

如果 WSL 环境报多个 `LocalLow`：

```text
multiple WSL LocalLow folders found; set GSTS_LOCALLOW_DIR
```

可显式指定：

```bash
GSTS_LOCALLOW_DIR=/mnt/c/Users/touyu/AppData/LocalLow \
node bin/gsts.mjs -c gsts.physics-motion.config.ts dist/tests/layout/physics-motion/main.gia
```

---

## 八、给下一位助手的一句话

> 复合节点注入到游戏已修复并提交 `82261dd`，用户已游戏内确认主图、复合节点和 `mul3` 定义都出现。现在问题转到 `设置物理参数` 复刻质量：真实 impl 的一个外部 InFlow 映射到 10 个内部节点，而当前 IR 虽有 capture-root fan-out，但 `compositePins` 只保留 1 条 InFlow 映射，导致游戏里只有一个节点会执行；当前 `mul3` 调用节点 pins=2 而真实 pins=3，疑似 literal composite input 未编码；当前布局 bbox 为 `0..21600 × y=300`，全部节点排成一条水平线。下一轮先修复复合 impl 外部 InFlow fan-out，再补 `setHalfGravityDeltaSquared` 的入口 link 和 literal 输入 pin，最后重新评估布局。
