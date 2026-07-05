# Session 交接：复合内部图变量完全修复（r18）

> **目标轮次：** r18
> **当前状态：** r17 P0（GetNodeGraphVariable OutParam 类型 + concreteId）已修复，但游戏内类型仍然错误
> **根本原因：** 修复不完整——只修了 GetNodeGraphVariable 一个节点，但 ListIterationLoop 等其他节点的编码也全有问题

---

## 🔴 最高优先级：沟通规范（前车之鉴）

### 为什么 r17 修复失败

r17 的修复流程犯了以下错误：

1. **没有做零过滤的全面比对** — 只聚焦了 GetNodeGraphVariable 的 OutParam type，以为改完就完了
2. **对 "看起来正确" 的差异没有追问** — 看到 concreteId 不同但归类为"已知合理"，没有意识到它的语义重要性
3. **没有反复验证** — 修完 diff 没有逐条确认"为什么每条差异是合理的"
4. **用户说不对之后，仍然只修了一个点** — 没有停下来重新全面审视

### 必须遵守的流程

```
沟通 → 探索 → 汇报 → 等确认 → 动手 → 全面比对 → 逐条分类差异 → 汇报 → 等确认 → 再动手
```

**关键原则：**

1. **拿到任务先确认理解** — 把要做的步骤列出来，问用户对不对
2. **每做完一步就问下一步方向** — 不要一次做太多
3. **遇到不确定的立马停下来问** — 不要试图自己研究透
4. **分析完数据先汇报再行动** — trace 完、diff 完，先给用户看结果，问下一步
5. **任何看起来"已知合理"的差异，都要解释为什么合理** — 如果不能明确解释，那就是需要讨论的
6. **任何时候发现新问题，先停下来汇报** — 不要顺手修了，方向可能不对

---

## 一、现状：r17 做了哪些修复

### 已修复（在 `src/compiler/ir_to_gia_transform/composite.ts`）

1. **GetNodeGraphVariable OutParam 类型**（行 749-760）
   - 从 `implVariables` 查找变量名对应的真实类型
   - 用 `argVarType()`/`argVarBaseClass()` 设置 OutParam type
   
2. **GetNodeGraphVariable concreteId**（行 303-342 `buildImplGraphNodes` 中）
   - 类似 DTC 的方式，根据变量类型后缀查询 typed concreteId
   - 例如 `get_node_graph_variable__list_str` → concreteId=347

3. **数据通道打通**（行 74, 275, 585）
   - `buildCompositeAccessories` → `buildImplGraphNodes` → `buildImplNodePins` 传递 `implVariables`

### 这些修复还不够——游戏内类型仍然错误

---

## 二、零过滤比对的全部差异（119 处）

用零过滤的方式对比参考文件和生成文件，共发现 **119 处差异**。以下是核心分类：

### 🔴 ERROR（必须修复的）

#### 2.1 ListIterationLoop 编码完全不对

| 字段 | 参考 | 生成 | 影响 |
|------|:----:|:----:|:----:|
| concreteId | **514** (StringList 变体) | 509 (generic) | 引擎不识别的类型 |
| pin 顺序 | OutFlow[0] → InParam[0] → OutParam[0] | InParam[0] → OutParam[0] → OutFlow[0] | 引脚错位 |
| InParam type | **11** (StringList) | 0 (Unknown) | 输入类型错误 |
| InParam value 格式 | `bConcreteValue(indexOfConcrete=5)` + `bArray` | 空 `bString` | 值格式错误 |

#### 2.2 复合的 compositePins 和 outflows 缺失

| 字段 | 参考 | 生成 | 影响 |
|------|:----:|:----:|:----:|
| compositePins 数量 | 3 条（InFlow + 2×OutFlow） | 1 条（只有 InFlow） | 缺少流出路由 |
| compositeDef.outflows 数量 | 2（"循环完成"、"循环体"） | 0 | 复合出口缺失 |

#### 2.3 GetNodeGraphVariable OutParam 值格式

| 字段 | 参考 | 生成 | 影响 |
|------|:----:|:----:|:----:|
| value 结构 | `bConcreteValue(indexOfConcrete=10)` + `bArray` | bare `bString(val="")` | 值格式错误 |

#### 2.4 节点顺序

参考中复合内部节点顺序是 `ListIterationLoop → GetNodeGraphVariable → PrintString`，生成中 `ListIterationLoop → PrintString → GetNodeGraphVariable`。这影响执行流布局和连线。

### 🟡 WARNING（需要人工判断的）

详见零过滤比对输出。主要是 genericId/concreteId 和 compositeDef 中 ID 字段的差异。

### 🟢 INFO（已知合理）

- `x`/`y` 坐标
- `nodeIndex`（本地编号）
- `pinIndex` 基值
- `connects[].id`（连接引用 ID）
- 复合 ID 分配值不同

---

## 三、修复思路分析

### 根因链条

```
变量类型 str_list
  → GetNodeGraphVariable: OutParam type 固为 StringList (已有修复 + 值格式需修)
  → ListIterationLoop:
      → concreteId 需用 514 (str_list 变体)
      → InParam type 需为 11 (StringList)
      → InParam value 需为 bConcreteValue(indexOfConcrete=5) + bArray 格式
      → pin 顺序需为 OutFlow → InParam → OutParam
  → compositePins 需有 2 个 OutFlow (对应"循环完成"和"循环体")
  → compositeDef.outflows 需定义 2 个 outflow
```

### 需要修改的具体代码

#### 3.1 `list_iteration_loop` 特殊编码（类比 DTC 的处理）

当前 `list_iteration_loop` 没有特殊处理，走通用 arg → pins 逻辑。需要：

1. **concreteId**：在 `buildImplGraphNodes` 中，从 `node.args[0]` 的连接类型推断列表元素类型 → 查 `list_iteration_loop__<元素后缀>` → 得到 typed concreteId
2. **InParam 类型**：在 `buildImplNodePins` 中，从连接的 type 推导（已有部分代码但只在 conn 类型时触发生效）
3. **InParam value 格式**：需要 `bConcreteValue(wrapConcreteValue)` 包裹 + `bArray` 格式
4. **pin 顺序**：OutFlow 必须在 InParam/OutParam 之前生成

#### 3.2 复合 OutFlow 缺失

检查 `buildCompositeAccessories` 中 `compositeDef.outflows` 和 `compositePins` 的生成逻辑。当前只有 InFlow 被生成，缺少 OutFlow 的 composite pin。

可能是 `toCompositeDefIR()` 中 capture 捕获到的 outflow 信息不足（leafMarks 或 outflowExitNodes 为空）。

#### 3.3 主图也有同样的问题

主图（`irToGia` 在 `index.ts`）中的 `list_iteration_loop` 和 `get_node_graph_variable` 也需要检查 pin 顺序和值格式。

---

## 四、关键文件索引

### 源代码

| 文件 | 行范围 | 职责 |
|------|:------:|------|
| `src/compiler/ir_to_gia_transform/composite.ts` | 581-780 | **`buildImplNodePins()`** — 复合内部节点 pin 编码 |
| `src/compiler/ir_to_gia_transform/composite.ts` | 270-351 | **`buildImplGraphNodes()`** — 复合内部图构建 |
| `src/compiler/ir_to_gia_transform/composite.ts` | 26-238 | **`buildCompositeAccessories()`** — 复合 accessories 构建 |
| `src/compiler/ir_to_gia_transform/composite.ts` | 785-791 | `isDataProducerNode()` — 触发 auto-OutParam 的判断 |
| `src/compiler/ir_to_gia_transform/composite.ts` | 525-574 | `argVarType()` / `argVarBaseClass()` — 类型映射 |
| `src/compiler/ir_to_gia_transform/index.ts` | 322-331 | `applyGetNodeGraphVariableNamePin()` — 主图变量名 pin |
| `src/compiler/ir_to_gia_transform/index.ts` | 136-158 | `applyGraphVariables()` — 主图变量注册 |
| `src/compiler/ir_to_gia_transform/node_id.ts` | 509-518 | **主图 GetNodeGraphVariable 的 concreteId 解析（参考实现）** |
| `src/runtime/composite_registry.ts` | 123-271 | **`toCompositeDefIR()`** — ImplVariables 来源 |
| `src/runtime/core.ts` | 1549-1604 | 复合捕获流程，variable 注册 |
| `src/runtime/IR.d.ts` | 233-249 | `CompositeDefIR` 类型定义 |

### 测试

| 文件 | 内容 |
|------|------|
| `tests/composite/replicate-graph-variable.ts` | 图变量复刻测试（复合内 + 主图） |
| `tests/composite/replicate-full-dtc-v2.ts` | 全类型复刻 |
| `tests/composite/trace-exec-flow.ts` | 执行流追踪工具 |

### 参考 GIA 文件

```
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/
├── user_edit/
│   ├── 全类型测试v2.gia          ← 黄金标准（含列表操作，手动修复）
│   └── 节点图变量.gia            ← 图变量参考（手动编写）
├── 类型转化-full-v2.gia          ← 生成文件
└── 节点图变量.gia               ← 生成文件（复制时覆盖）
```

---

## 五、可用工具

### 5.1 解码和零过滤比对

```bash
# 解码 GIA 为 JSON
node -e "
const {decode_gia_file} = require('./dist/.../decode.js');
const data = decode_gia_file('路径.gia');
require('fs').writeFileSync('/tmp/xxx.json', JSON.stringify(data, null, 2));
"

# 全面比对（不忽略任何字段）
node -e "
const ref = require('/tmp/ref.json');
const gen = require('/tmp/gen.json');
function deepDiff(a, b, path='') { ... }  # 自定义递归，不跳过任何字段
"
```

### 5.2 diff_gia.py（有分类功能，但可能误过滤）

```bash
python3 /tmp/diff_gia.py <ref.json> <gen.json>        # ERROR + WARNING
python3 /tmp/diff_gia.py <ref.json> <gen.json> --verbose  # 含 INFO
```

**⚠️ 已知限制：** 此脚本对 `nodeId` 等字段做了分类过滤。重要差异可能被降级。建议先用零过滤比对确认全貌，再用此脚本做快速复查。

### 5.3 重新编译和生成

```bash
npm run build
npx tsx tests/composite/replicate-graph-variable.ts
cp tests/composite/output/节点图变量.gia "/mnt/c/.../Beyond_Local_Export/节点图变量.gia"
```

### 5.4 执行流追踪

```bash
npm run trace-exec -- <文件.gia>
npm run trace-dataflow -- <文件.gia> -l    # 列出节点
```

---

## 六、工作规范

### 比对规范

每次修改后必须做完整比对，**逐条**分类所有差异：

1. 解码 ref 和 gen 为 JSON
2. 运行零过滤的递归 diff（不要跳过任何字段）
3. 逐条检查每条差异，分类为：
   - **🔴 必须修复** — 类型、顺序、值格式、缺失字段
   - **🟡 需要讨论** — 不确定是否合理
   - **🟢 已知合理** — 必须给出理由（如"x/y 坐标不影响行为"）
4. 无法明确解释为"已知合理"的，全部视为"需要讨论"
5. 汇报给用户，**等确认后再动手**

### 修复规范

1. 一次只修一个独立的问题点
2. 修完立即重新生成、比对、逐条分类
3. 有改动就汇报，不累积多个改动
4. 发现其他问题也不要顺手修，先汇报

### 沟通规范

| 场景 | 行为 |
|------|------|
| 拿到任务 | 列出步骤，问用户对不对 |
| 分析完数据 | 先汇报结果，说清楚发现了什么，**不要直接动手** |
| 遇到不确定的差异 | 标记为"需要讨论"，问用户 |
| 发现额外的、任务范围外的问题 | 先汇报，不要顺手修 |
| 修完一步 | 汇报结果，问下一步方向 |
| 感觉"这个应该没问题" | 停下来——这可能就是遗漏的地方 |

---

## 七、r18 建议的修复顺序

```
Step 1: 修 ListIterationLoop 的 pin 顺序和 InParam 编码
  → 先只修这一个节点的 pin 顺序（OutFlow 在前）
  → 再修 InParam 的 type 和 value 格式
  → 每步重新生成、比对、汇报
  
Step 2: 修 ListIterationLoop 的 concreteId
  → 从连接类型推断 typed concreteId

Step 3: 修 GetNodeGraphVariable OutParam 的 value 格式
  → bConcreteValue 包裹 + bArray

Step 4: 修复合 compositePins 和 outflows
  → 检查 capture 阶段的 outflow 信息

Step 5: 修主图的相同问题

Step 6: 全类型测试也重新生成验证
```

⚠️ **再次强调：Steps 1-6 建议拆开做，每做一步汇报一次。不要一口气修完。**
