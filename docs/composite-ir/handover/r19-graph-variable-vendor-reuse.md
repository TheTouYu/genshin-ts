# Session 交接：复合节点 GetNodeGraphVariable 100% 复用主图编码逻辑（r19）

> **目标轮次：** r19
> **当前状态：** 已完成，已验证通过
> **核心成果：** 复合节点内 `get_node_graph_variable` 类型编码从"手动硬编码"改为"临时 Graph+Node 复用 vendor 自动编码"，所有标量/列表类型均已验证

---

## 🔑 本会话最重要的经验：沟通方式

### 用户的原则（必须遵守）

**"一定要多和我沟通，澄清方向。"**

这是本次会话最核心的准则。具体执行方式：

| 场景 | 正确做法 | 反面教材 |
|---|---|---|
| **拿到任务** | 先复述理解、列出计划、问用户对不对 | 直接动手，做完才发现方向错了 |
| **技术方案选择** | 把可选方案列出来，分析优缺点，让用户选 | 自己选一个“最合理的”直接做 |
| **探索/分析完** | 先汇报结果，说清楚发现了什么，等确认再动手 | 分析完直接改代码 |
| **遇到不确定** | 停下来问，标记为"需要讨论" | 试图自己研究透，可能方向不对 |
| **修完一步** | 汇报结果，问下一步方向 | 一口气修完多个点再汇报 |
| **发现额外问题** | 先汇报，不顺手修 | 顺手修了，但可能不在当前优先级 |

### 本会话的沟通实例

**实例 1：接到任务后的确认**
> 用户："复合节点里的获取节点图变量类型不对，主图 OK，看两条路径差异"
> 我：先对比代码，列出 5 个差异点，汇报给用户，确认分析方向
> 用户：确认理解正确

**实例 2：技术方案选择**
> 我：提出三个方案（A. 全面重构、B. 只补丁当前节点、C. 折中——只对 get_node_graph_variable 复用主图逻辑），分析工作量/风险/长期价值
> 用户：选 C（折中方案），并补充"先验证单个类型，可靠后再扩展"

**实例 3：动手前的验证**
> 我：提出先做 Step 0（写独立脚本验证 vendor 编码行为），确认 vendor 能生成正确格式后再改源码
> 用户：同意，并说"你甚至可以单独探索一下它里面的逻辑"
> 结果：验证成功，vendor 确实自动生成 `bConcreteValue(indexOfConcrete=10, value={class=10002, bArray:{entries:[]}})`

**实例 4：每一步后汇报**
> 修改源码 → 编译 → 生成测试 → 零过滤比对 → 复制到游戏目录 → **每一步都汇报结果**
> 用户测试通过后 → 再提出扩展全类型的计划 → 用户同意 → 再动手

---

## 一、问题背景

### 症状
- 复合节点内部的 `获取节点图变量`（GetNodeGraphVariable）OutParam 类型错误
- 主图（非复合）中的同一节点类型正确

### 根因（两轮分析后确认）

| | 主图 | 复合内部图 |
|---|---|---|
| **Pin 创建** | `new Node()` → vendor 根据 `concreteId` **自动**从节点定义加载 pins | `buildImplNodePins()` **手动**逐字段硬编码 `{i1, i2, value, type}` |
| **OutParam 值格式** | vendor 自动处理列表类型 → `bConcreteValue` + `bArray` | 手动逻辑缺少列表分支 → 错误生成裸 `bString` |
| **indexOfConcrete** | vendor 自动从节点定义的 TypeConcreteMap 查找 | 手动逻辑完全没这个概念 |

**核心结论：两条路径的数据结构不同，无法直接复用代码，但可以让复合图也走一遍 vendor 自动编码。**

---

## 二、技术方案演进

### 第一轮：分析差异

对比 `index.ts`（主图）和 `composite.ts`（复合）中 `get_node_graph_variable` 的处理路径，发现 5 个差异点：
1. **OutParam 值格式** — 最关键的差异（直接导致游戏内类型错误）
2. `needsConcreteWrapping` 集合遗漏
3. `makeVarBaseValue` 缺少列表类型分支
4. Name Pin 创建路径不同
5. `gvConcreteNid` 的 fallback 有风险

### 第二轮：提出三个方案

| 方案 | 描述 | 工作量 | 风险 | 长期价值 |
|---|---|---|---|---|
| A | 全面重构：让复合图也走 `Graph` + `Node` 类 | 大 | 中-高（核心编码路径重构） | **高** — 彻底解决两边不同步 |
| B | 补丁修复：只修 `get_node_graph_variable` 的 OutParam 列表格式 | 小 | 低 | 低 — 解决当前问题，但其他节点可能再出现 |
| C | **折中：只对 `get_node_graph_variable` 临时走 `Graph` + `Node` 编码** | 小 | **极低**（只影响一个节点类型） | **中-高** — 验证了复用思路可靠，可推广 |

**用户选择 C**，并补充：先验证单个类型，可靠后再扩展。

### 第三轮：验证 + 扩展

**Step 0 — 独立验证脚本**
- 写 `scripts/test_vendor_gngv2.ts`，临时 `Graph` + `Node(concreteId=347)` + `encode()`
- 验证 vendor 自动生成 OutParam：`bConcreteValue(indexOfConcrete=10, value={class=10002, bArray:{entries:[]}})`
- ✅ 和参考文件完全一致

**Step 1 — 修改 `composite.ts`**
- 新增 `import { Graph, Node } from '../gia_vendor.js'`
- `buildImplNodePins` 增加 `gvConcreteNid` 参数
- 拦截 `get_node_graph_variable`：临时 `Graph` + `Node` + `setVal(name)` + `filterUnkPins` + `encode()` → 提取 `pins`

**Step 2 — 编译 + 生成 + 比对**
- `npm run build` ✅
- `npx tsx tests/composite/replicate-graph-variable.ts` ✅
- 零过滤比对：核心差异已修复，剩余 3 处 vendor 行为差异（`itemType.type_server` 缺失、`alreadySetVal=true`）和主图一致

**Step 3 — 游戏内验证**
- 复制 `节点图变量.gia` 到游戏目录
- **用户测试通过** ✅

**Step 4 — 扩展到全类型**
- 修改 `gvConcreteNid` 的 suffix 推导逻辑，增加 `vec3_list`/`config_id_list`/`prefab_id_list`/`faction_list` 支持
- 写 `replicate-all-graph-variables.ts`，测试 10 个标量 + 10 个列表类型
- 编译生成，复制 `全类型图变量.gia`
- **用户测试全部通过** ✅

---

## 三、关键决策点

### 决策 1：为什么选临时 Graph 而不是全面重构

**理由：**
- 临时 Graph 方案只改 `buildImplNodePins` 一个函数的一个分支，风险极低
- 全面重构需要验证 `Graph` 类在复合图模式下的行为（Entry/Exit 节点、nodeIndex 分配等），工作量大
- 用户原则：先验证小范围改动可靠，再考虑推广

**结果：** 验证成功，证明了"复用 vendor 自动编码"这条路是通的。

### 决策 2：验证顺序（先脚本，再改源码）

**理由：**
- 不改源码就能验证 vendor 行为，避免无效改动
- 如果 vendor 编码结果和参考不一致，需要换方案；如果一致，才值得改源码

**结果：** 脚本验证确认 vendor 编码和参考一致，改源码后一次成功。

### 决策 3：比对时忽略 vendor 行为差异

零过滤比对发现 3 处差异：
1. `itemType.type_server` 缺失 — vendor 的 `item_type()` 只设 `classBase`
2. `alreadySetVal=true` — vendor `list_pin_body` 硬编码
3. `alreadySetVal=true` — vendor `bool_pin_body` / `string_pin_body` 硬编码

**判断：** 这些差异主图也有（主图也是 vendor 编码），游戏内已经验证主图是 OK 的，所以这些差异不会导致问题。

---

## 四、代码修改摘要

### 修改文件

| 文件 | 行范围 | 改动 |
|---|---|---|
| `src/compiler/ir_to_gia_transform/composite.ts` | import 区 | 新增 `import { Graph, Node } from '../gia_vendor.js'` |
| `src/compiler/ir_to_gia_transform/composite.ts` | `buildImplGraphNodes` | 扩展 `gvConcreteNid` 的 list 类型支持（`vec3_list`/`config_id_list`/`prefab_id_list`/`faction_list`） |
| `src/compiler/ir_to_gia_transform/composite.ts` | `buildImplNodePins` 签名 | 增加 `gvConcreteNid?: number` 参数 |
| `src/compiler/ir_to_gia_transform/composite.ts` | `buildImplNodePins` 开头 | 新增 `get_node_graph_variable` 临时 `Graph` + `Node` 编码分支 |

### 核心新增代码（~25 行）

```typescript
// get_node_graph_variable：临时用 Graph+Node 编码，100% 复用 vendor 的 pin 生成逻辑
if (node.type === 'get_node_graph_variable' && gvConcreteNid) {
  const tmpGraph = new Graph('server', 0, '', 0)
  const tmpNode = new Node(0, 'server', gvConcreteNid, undefined as any)

  const nameArg = (node.args ?? [])[0]
  if (nameArg && nameArg.type === 'str') {
    for (const pin of tmpNode.pins) {
      if (pin.kind === 3 && pin.index === 0) pin.setVal(nameArg.value)
    }
  }

  tmpNode.pins = (tmpNode.pins ?? []).filter(
    (p: any) => !((p?.kind === 3 || p?.kind === 4) && p?.type?.t === 'b' && p?.type?.b === 'Unk')
  )

  tmpGraph.add_node(tmpNode)
  const tmpRoot = tmpGraph.encode() as any
  const vendorPins = tmpRoot.graph?.graph?.inner?.graph?.nodes?.[0]?.pins ?? []
  for (const p of vendorPins) p.connects = undefined
  return { pins: vendorPins, dataConns: [] }
}
```

---

## 五、验证方式

### 本次会话的验证链

```
1. 独立脚本验证 vendor 行为 → 2. 改源码编译 → 3. 零过滤比对 → 4. 复制到游戏目录 → 5. 用户游戏内测试
```

### 测试文件

| 文件 | 内容 |
|---|---|
| `tests/composite/replicate-graph-variable.ts` | 单类型验证（`str_list`） |
| `tests/composite/replicate-all-graph-variables.ts` | 全类型验证（10 标量 + 10 列表） |

### 比对标准

- **核心字段必须一致**：`concreteId`、`OutParam type`、`OutParam value 结构`（`bConcreteValue` + `bArray`）
- **vendor 行为差异可接受**：`itemType.type_server` 缺失、`alreadySetVal=true`（和主图一致）

---

## 六、遗留工作

### 已验证可靠的推广方向

1. **`list_iteration_loop`** — 交接文档 r18 指出同样有 concreteId/pin 顺序/InParam 值格式问题。可以走同样的"临时 Graph+Node"方案，或全面让复合图走 vendor 编码。
2. **其他列表操作节点** — 如果还有类似"复合内类型错误、主图 OK"的节点，都可以考虑此方案。

### 未解决的问题

- 主图 `get_node_graph_variable` 和复合内的 `alreadySetVal` 差异（`false` vs `true`）是否在某些场景下会触发编辑器警告，尚不明确。当前游戏内测试未发现问题。

---

## 七、沟通检查清单（给后续会话用）

拿到任务时，按以下顺序执行：

- [ ] **复述理解**：把要做的步骤列出来，问用户对不对
- [ ] **分析后汇报**：trace/diff 完，先给用户看结果，不要直接动手
- [ ] **方案选择**：列出可选方案 + 优缺点，让用户选
- [ ] **验证先行**：能不改源码验证的，先写脚本验证
- [ ] **每步汇报**：改完、编译完、生成完、比对完，每步都汇报
- [ ] **等确认**：用户说"下一步"或"可以"之后，再动手
- [ ] **发现新问题**：顺手想修的时候，停下来，先汇报

---

## 参考文件

```
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/
├── user_edit/
│   └── 节点图变量.gia          ← r18 参考（黄金标准）
├── 节点图变量.gia               ← r19 生成（覆盖复制）
└── 全类型图变量.gia             ← r19 扩展测试生成
```
