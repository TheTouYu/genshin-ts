# R10 · 跨图数据追溯已打通 — 交接文档

> 本轮完成了 `traceInParam` 的跨图自动追溯——遇到复合 OutParam 时自动进入 compiled body，
> 通过 `compositePins`（`outerPin.kind=4`）定位内部来源节点继续递归。
> 同时修复了 `--max-depth=N` 等号格式 CLI 解析 bug，并对信号驱动复合标注了信号通道名。

---

## 已完成：跨图数据追溯

### 核心改动

| 改动 | 说明 |
|------|------|
| `CrossGraphContext` / `buildCrossGraphContext` | defId→compiledId + compiledBodies + signalSources 三映射 |
| `CrossGraphEntry` 类型 | 记录编译体内部节点信息（复合名、内部节点索引、OutParam、InParam 分支） |
| `traceInParam` 跨图逻辑 | 遇到复合 OutParam → 查 `defToCompiled` → 进 `compositePins` → 定位内部节点 → 递归 |
| `renderBranch` 跨图显示 | 树模式: `── ⤷ 进入 复合名 编译体 内部节点 n=X ... ──` |
| `branchToJson` 跨图输出 | JSON 模式: `cross_graph: { composite, inner_node, inputs, ... }` |
| 信号复合标注 | 无编译体的复合显示 `(信号源: 发送信号)`，从 which=14 accessory 提取通道名 |
| `--max-depth=N` 修复 | 等号格式现在也被正确解析（之前只认空格格式） |
| depth 守卫 | 跨图追溯受 `depth < maxDepth` 约束，防止无限嵌套 |

### 改动文件

`tests/composite/trace-dataflow.ts`（~1035 → ~1190 行）

新增 +155 行，修改 ~10 行。

### 验证结论（物理运动.gia）

| 验证项 | 状态 | 示例 |
|--------|------|------|
| 单层跨图 | ✅ | `n=61 InParam[0] ← n=51 计算物理运动状态 OutParam[2]` → 自动进入 compiled body → n=44 |
| 嵌套跨图 | ✅ | `n=75 InParam[0]` → 计算物理运动状态 → 复合:与 → 复合:can fly（自动进入第二层） |
| depth 限制 | ✅ | `--max-depth=1` → 只进入 1 层；`--max-depth=2` → 进入 2 层；截断标记正确显示 |
| JSON 模式 | ✅ | `cross_graph` 字段包含完整嵌套结构 |
| 信号复合 | ✅ | `(信号源: 发送信号)` + OutParam 名，用户可识别数据来自哪个信号通道 |
| 无编译体跳过 | ✅ | 监听信号等伪复合不会触发跨图进入，但标注信号源 |
| --composite 模式回归 | ✅ | 现有手动进入编译体模式不受影响 |
| --list-nodes 回归 | ✅ | 列表功能正常工作 |

### 输出示例

**有编译体的复合：**
```
InParam[0] "w" (?)
  <- n=51  复合:计算物理运动状态  OutParam[2] "接触地面"
    ── ⤷ 进入 计算物理运动状态 编译体  内部节点 n=44  Greater Than or Equal To  OutParam[0] ──
      InParam[0] "R<T>" (R<T>)
        <- n=42  Get Custom Variable  OutParam[0]  (读取自定义变量)
      InParam[1] "R<T>" (R<T>)
        = 1
```

**信号驱动复合：**
```
InParam[0] "run" (?)
  <- n=14  复合:监听信号  OutParam[3] "run"  (信号源: 发送信号)
```

### 关键设计

#### 数据流

```
main graph: n=51 复合:计算物理运动状态 OutParam[2]
  → src.genericId.nodeId = defId
  → defToCompiled.get(defId) → compiledId
  → compiledBodies.get(compiledId) → which=9 accessory
  → accessory.graph.inner.graph.compositePins[]
    → find cp where cp.outerPin.kind===4 && cp.outerPin.index===srcOutIdx
    → cp.innerNodeId → inner node in compiled body
  → traceInParam(innerNode, eachInParamIdx, innerNodeMap, ...)
```

嵌套复合自动支持（同一 `crossGraphCtx` 递归传递）。

#### 边界处理

| 场景 | 处理方式 |
|------|----------|
| 复合节点无 compiled body（信号驱动） | `signalSources` 提取通道名，标注 `(信号源: 通道名)` |
| compositePins 中无匹配 OutParam entry | 跳过，保持现有行为 |
| 内部节点在编译体 nodeMap 中不存在 | `innerNodeMap.get()` 返回 null → 跳过 |
| 嵌套复合 | 递归传递 `crossGraphCtx` → 自动触发同一逻辑 |
| 循环复合（A→B→A） | `maxDepth` 天然限制 |
| `srcOutIdx` 为 null 或 -1 | 条件 `srcOutIdx >= 0` 阻止进入 |

### 验证命令

```sh
# 核心验证：跨图追溯
npx tsx tests/composite/trace-dataflow.ts <物理运动.gia> 61 0 --max-depth=10
npx tsx tests/composite/trace-dataflow.ts <物理运动.gia> 75 0 --max-depth=10
npx tsx tests/composite/trace-dataflow.ts <物理运动.gia> 65 --all-params --max-depth=10

# 深度限制
npx tsx tests/composite/trace-dataflow.ts <物理运动.gia> 75 0 -d 1
npx tsx tests/composite/trace-dataflow.ts <物理运动.gia> 75 0 --max-depth=2

# 信号复合
npx tsx tests/composite/trace-dataflow.ts <物理运动.gia> 58 0 --max-depth=5

# JSON
npx tsx tests/composite/trace-dataflow.ts <物理运动.gia> 61 0 --json --max-depth=5
```

---

## 仍缺失的（下一轮）

### P0 — 图变量写追溯（～4h）

```
GetNodeGraphVariable (nid=337) → 被标记为终端"读取图变量"
不查谁 SetNodeGraphVariable 同一变量
```

当前 `isTerminalNode` 对 `nid=337` 返回 `{ yes: true, note: '读取图变量' }`。
需要修改为：在同一图/编译体中搜索 `SetNodeGraphVariable`（nid=323），
匹配 `InParam[0].bString.val === varName`，追溯其 value 来源。

### P1 — 无一键分析（～5h）

没有脚本能自动串联：事件源 → 执行链 → 数据链 → 报告

### P2 — 参数名补齐（～2h）

复合输出参数名 type `(?)` 可以被补全

---

## 文件路径参考

```sh
# 本仓库根目录
~/genshin-ts/

# 数据流工具（本轮主改）
tests/composite/trace-dataflow.ts       # ~1190 行

# 执行流工具（未改）
tests/composite/find-event-sources.ts   # 765 行

# GIA 测试文件
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/复杂gia/
├── 传球.gia      (24 节点，3 事件源)
├── 弹球.gia      (74 节点，6 事件源)
└── 物理运动.gia  (68 节点，7 事件源) ← 本轮主要测试用
```

---

*交接时间：2026-07-02*
*当前分支：`feat/fork-api-and-layout`*
*下一轮任务：图变量写追溯（GetNodeGraphVariable → SetNodeGraphVariable）*

