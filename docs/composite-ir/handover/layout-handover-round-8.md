# 布局任务交接文档 · 第八轮

> **本轮目标**：探索场景 C：同一事件 / 同一执行节点分出多条执行路径时，应该如何按泳道和占位区块布局。
> **上一轮文档**：[layout-handover-round-7.md](layout-handover-round-7.md)
> **当前权威设计文档**：[../layout-patterns.md](../layout-patterns.md)
> **状态**：探索与文档更新完成；下一轮开始实现。

---

## 一、本轮结论

本轮未改布局算法，重点是基于真实编辑器参考图和截图提炼多执行路径布局规则，并补充可重复分析工具。

核心结论：

1. 多执行路径不能只按 child 序号做固定 Y 偏移。
2. 每条执行路径应视为一个带高度的语义区块，而不是一个节点点位。
3. 排下一条分支时，需要避开上方分支已经占用的区块底部，再加缓冲。
4. 主事件分出的多条主泳道应明显分离，基础间距建议不低于约 480-500px。
5. 如果上方分支含多输入节点、多行数据流、复合摘要或多出口区，应继续额外下推。
6. 同一多出口列内部可以更紧凑，目标间距约 300-360px 可读。
7. 一条执行线如果已经下移，后续节点应沿同一 Y 水平继续右移，不要为了填空回到上方。

---

## 二、参考样本

### 2.1 综合正样本：主图布局1

文件：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/主图布局1.gia
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/主图布局1-40%缩放.png
```

该样本是当前最综合的主图布局参考，覆盖：

- 同一事件分三条主执行泳道。
- 顶部执行线为下游数据链拉开 X 间距。
- 中部执行线包含纯数据复合和数据转换。
- 下方执行线用复合节点压缩复杂流程。
- 复合摘要后接多出口列。
- `顺序执行` 复合再次展开多出口列。

关键执行泳道坐标：

```text
n1 event at (-355, -206)
├─ n2  at (434, -209), dy ≈   0
├─ n8  at (421,  281), dy ≈ 490
└─ n24 at (418,  879), dy ≈ 1085
```

多出口列坐标：

```text
n25 -> n26/n30/n29/n28: step ≈ 341, 287, 339
n38 -> n37/n34/n35/n36: step ≈ 359, 287, 339
```

视觉结论：白色执行线允许较长曲线，关键是语义区块和泳道清楚；蓝色数据线可以靠近或穿过执行区域，但不能在节点密集区重叠成团。

### 2.2 场景 C 专门样本：布局c

文件：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/布局c.gia
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/布局c-多条连线-50%缩放.png
```

该样本把布局原因写在 `Print String` 参数里：

```text
n2:  基础场景
n3:  基础场景
n11: 上面一个节点图有比较多的参数，所以距离下移
n12: 上面一条线的节点图已经占位了，所以距离继续下移
n13: 这条线已经下移了，虽然上面有空间，也保持这条线，继续平移
```

关键坐标：

```text
n1 event at (-414, -281)
├─ n2  at ( 48, -286), dy ≈   0
│  ├─ n5  at (1138, -288), dy ≈   0  # 多输入节点，右侧数据 pin 很多
│  └─ n11 at ( 545,  681), dy ≈ 967  # 避开 n5 的多行参数/数据连线区
└─ n3  at ( 51,   84), dy ≈ 365
   └─ n12 at (554, 1142), dy ≈ 1058 # 避开上方已占位执行线
      └─ n13 at (1176,1142), dy ≈ 0 # 下移后继续保持同一执行线水平平移
```

`n5 Initiate Attack` 的多个数据输入节点分布在 y≈-170、12、203、396；`n11` 放到 y≈681 后，截图中蓝色数据线和白色执行线不会挤成一团。

---

## 三、本轮文档更新

更新文件：

```text
docs/composite-ir/layout-patterns.md
```

新增内容：

- `主图布局1.gia` 的多执行泳道坐标观察。
- `布局c.gia` / 截图对“上方区块占位决定下方泳道位置”的说明。
- 多出口列目标 Y 间距观察。
- 下一轮实现应遵循的多执行路径规则。

注意：`layout-patterns.md` 仍是当前权威设计文档；本 handover 只是本轮历史交接。

---

## 四、本轮新增工具

新增：

```text
tests/composite/analyze-exec-lanes.ts
```

用途：分析 `.gia` 中每个执行 fan-out 父节点的子节点坐标、dx/dy、相邻目标 Y step。后续拿到新参考文件后可以直接复用。

命令：

```bash
npx tsx tests/composite/analyze-exec-lanes.ts <file.gia> [files...]
```

已验证：

```bash
npx tsx tests/composite/analyze-exec-lanes.ts \
  /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/主图布局1.gia

npx tsx tests/composite/analyze-exec-lanes.ts \
  /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/布局c.gia
```

---

## 五、下一轮实现建议

下一轮建议从 `src/compiler/ir_to_gia_transform/layout.ts` 入手，不要继续只调 `branchGap` 常量，而是把执行路径布局改成“区块高度驱动”。

建议实现顺序：

1. 为每个 exec 分支估算局部区块高度。
2. 区块高度至少包含：本分支执行节点高度、附属数据节点最高/最低 Y、多输入数据线区、多出口子列高度。
3. 同一父节点 fan-out 时，第一个 child 维持父节点所在 Y 附近。
4. 后续 child 的 Y = 上一个 sibling 区块底部 + 垂直缓冲。
5. 如果 child 后续是一条执行链，链上节点保持同一 lane Y 右移，不回填上方空洞。
6. 多出口列内部使用较紧的局部间距，约 320-360px 起步。
7. 主事件多泳道使用更大的基础间距，约 480-500px 起步；如果上一泳道有数据区块或多出口区则继续下推。

当前代码相关位置：

```text
src/compiler/ir_to_gia_transform/layout.ts
- layoutExecutionChain(...)
- expandExecGapsForDataChains(...)
- placeDataNearConsumers(...)
```

当前明显不足：

```ts
const branchGap = Math.trunc(config.rowHeight * 0.9)
```

该逻辑只按 child index 做固定偏移，不能表达 `布局c` 中“上方节点图参数多所以距离下移”和“上面一条线已经占位所以继续下移”的规则。

---

## 六、建议验证流程

实现后至少生成/验证：

```text
tests/layout-r6-c-multi-lane.ts
```

建议覆盖：

1. 同事件两条基础执行路径。
2. 第一条路径接多输入节点，第二个分支应下移避开数据区。
3. 下方已有执行线后，后续执行线继续下移。
4. 下移后的链后续节点保持同一 Y 右移。
5. 多出口列内部保持同列纵向展开。

分析命令：

```bash
npx tsx tests/composite/analyze-exec-lanes.ts <generated.gia>
npx tsx tests/composite/dump-nodes.ts <generated.gia>
npx tsx tests/composite/trace-exec-flow.ts <generated.gia> --io
npx tsx tests/composite/trace-dataflow.ts <generated.gia> --list-nodes
```

最终仍需游戏内截图判断；`audit-layout.ts` 的 ORPHAN / EDGE_CROSS 不作为裁判。

---

## 七、给下一位助手的简短交接语

> 第八轮完成场景 C 的真实样本探索和文档更新，没有改布局算法。`主图布局1.gia + 40%截图` 是综合正样本；`布局c.gia + 50%截图` 专门说明多执行线应按上方区块占位继续下移。新增 `tests/composite/analyze-exec-lanes.ts` 可抽 fan-out 坐标。下一轮实现时，不要只调 `branchGap`，应把 exec 分支当作带高度的区块，按 sibling 区块底部加缓冲排下一条 lane；主泳道基础间距约 480-500px，多出口列内部约 320-360px。
