# 传球.gia 完整绘制 · 交接文档

> 给下一棒大模型的完整上下文。目标：完成控制流图 + 数据流追溯 + 节点概要三层渲染。

---

## 一、总目标与当前阶段

**最终目标**：完整绘制 `复杂gia/传球.gia` 的全部细节，产出设计参考图，用于重新设计 GIA 可视化工具。

**当前进度**：控制流图基本完成，数据流追溯工具正在优化，节点概要尚未开始。

### 三阶段架构

```
阶段的划分:
  1. 控制流图 (done ~80%)  — 树形 exec 拓扑, 分支命名, 复合展开
  2. 数据流追溯 (done ~60%) — 追溯每个 InParam 的完整数据源链 (工具已写, 渲染待打磨)
  3. 节点概要 (not started) — 单个节点/复合的完整参数、类型、功能描述
```

### 涉及文件

```
GIA 原始文件 (Windows 路径):
  /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/复杂gia/
    传球.gia        (24 节点, 17 exec 边, 主参考)
    弹球.gia        (74 节点, 多扇入场景)
    物理运动.gia    (68 节点, 复合嵌套场景)

已复制到游戏根目录, 可在编辑器中打开查看:
  /mnt/c/.../Beyond_Local_Export/物理运动.gia
```

---

## 二、已完成文档

### docs/composite-ir/handover/r4-gia-draw-passball.md

**用途**：全面参考文档。原始数据萃取、节点总表、exec 边、复合接口、方法论文档。

**关键内容**：
- 24 个主图节点完整数据
- 13 个复合定义接口
- 三大 exec 链拓扑
- **第八章：数据来源与方法论**（最重要！包含 9 个小节）
  - 8.1 节点名称解析
  - 8.2 Exec 控制流边提取
  - 8.3 分支名称获取
  - 8.4 参数名字获取
  - 8.5 枚举值解析
  - 8.6 数据流追溯规则
  - 8.7 参数类型系统
  - 8.8 复合定义 ↔ Impl 图映射
  - 8.9 关键代码路径

### docs/composite-ir/handover/r4-passball-topology.md

**用途**：主图控制流设计参考图。纯图，无说明。

**结构**：
- 第 1/3 页：事件根 n=3 + n=39 → n=40 职业branch → 5 路分支
- 第 2/3 页：n=2 监听信号 → n=8 自身实体条件 → n=7 Multiple Branches (6 条件命名)
- 第 3/3 页：n=29 蓄力时间 → n=43 职业branch → n=30 顺序执行 → n=5/n=11
- 数据流追溯 (n=9, n=20, n=7, n=8, n=11/12, n=19/23, n=29, n=41/45/46/47/48)
- 复合 OutFlow 命名一览
- Multiple Branches 条件值

**注意**：数据流部分是用"参数名 <- 源节点"链式格式写的。往后可能需要用工具自动生成。

### docs/composite-ir/handover/r4-passball-impl.md

**用途**：复合节点 impl 图展开。与主图同格式的树表示。

**包含**：
- 顺序执行 (n=30) — 4 路 exec 展平
- 自身实体条件 (n=8) — Equal 判断
- 职业branch (n=40/n=43) — 职业判断 + 条件branch
- 蓄力时间 (n=29) — ≥ 判断逻辑
- e技能特效 (n=5) — 定时器 → 清除特效
- 标记e技能释放 (n=11/n=12) — 时间计算
- 条件branch — 4 层 Double Branch
- etc.

---

## 三、已完成工具

### tests/composite/trace-dataflow.ts — 数据流追溯工具

**用途**：对任意节点 InParam，逆向追溯完整数据源链，支持多扇入复合展开。

**用法**：
```bash
npx tsx tests/composite/trace-dataflow.ts <文件.gia> <节点索引> <InParam索引>

# 例子
npx tsx tests/composite/trace-dataflow.ts "复杂gia/传球.gia" 9 2
```

**输出格式**：
```
InParam[X] "参数名" (类型)
  <- n=N  源节点  OutParam[Y] "输出名"  (功能说明)
    InParam[0] "参数名"        ← 源节点的输入参数(继续追溯)
      <- n=M  更上游  OutParam[Z]
    InParam[1] "参数名"
      = 字面值                 ← 数据终点
```

**关键逻辑**：
```
traceInParam(node, inParamIdx):
  1. 找 node.pins[] 中 i1.kind=3, i1.index=inParamIdx 的 pin
  2. 检查 connects[0].id → 源节点索引
  3. 检查 connect2.index → 源 OutParam 索引
  4. 如果源节点是复合 → 查 compositeDef.outputs[] 获取输出名
  5. 如果源节点不是终点 → 递归追溯源节点的所有 InParam
  6. 如果 pin 无连接但有 value → 字面值
  7. 已知终点: event/GetSelfEntity/GetVariable/GetCustomVar/GetTimerTime
```

**已确认工作**：
- 单跳链 √
- 多跳链 (复合 → 复合 → 数据源) √
- 多扇入 (复合有 N 个 InParam 全部展开) √
- 字面值/枚举值 √
- 3 个 GIA 文件全部测试通过 √

**未实现**：
- 复合 impl 图内部追溯（当前在复合出口停止，不进入 impl 图节点）
- 复合 OutParam → leaf 节点映射（需要解析 compositePinIndex）

### tests/composite/ascii-layout.ts — 2D ASCII 渲染工具

**用途**：按坐标位置渲染节点盒子和 exec 连线。

**用法**：
```bash
npx tsx tests/composite/ascii-layout.ts [--compact] <文件.gia>
```

**状态**：
- 节点盒子渲染 √
- 正交连线路由 √
- 分支 spine 支持 √
- 碰撞/孤立/回边检测 √
- 多图(主图+accessories)支持 √
- 复合名未解析 ❌ （nid=1610612902 未显示为"复合:监听信号"）
- 数据连接不渲染 ❌
- 分支名不显示 ❌

### tests/composite/ 下的辅助脚本

| 脚本 | 用途 |
|------|------|
| `dump-nodes.ts` | 打印所有节点坐标和 nid |
| `audit-layout.ts` | 对比 gsts 输出与参考文件布局 |
| `analyze-editor-layout.ts` | 编辑器布局统计分析 |
| `gia-compare.ts` | GIA 文件对比 |
| `_trace_chains.ts`, `_dump_*.ts` | 分析用零碎脚本 |

---

## 四、设计标准（已确定）

### 4.1 控制流图格式

```
n=N  节点名  nid=XXX  (坐标x, 坐标y)
├── OutFlow[X] "分支名" → n=M  下一节点
├── OutFlow[Y] "分支名" (未连接)
└── ...
```

- 复合节点显示 `复合:名称`
- 分支名来自 compositeDef.outflows[].name（职业branch: "前锋"/"中锋" 等）
- Multiple Branches 分支名来自 InParam[1] 数组（"短传球-自动方向" 等）
- 未连接出口标注 `(未连接)`

### 4.2 数据流追溯格式

```
InParam[X] "参数名" (类型)
  <- n=N  源节点  OutParam[Y] "输出名"  (功能说明)
    InParam[0] "参数名"         ← 源节点的输入
      <- n=M  更上游
    InParam[1]
      = 字面值
```

- `<-` 表示"数据来自"
- `=` 表示字面值
- 每条链是一个数据经过的节点链，不是参数明细
- 复合不展开 impl，只标注 OutParam 名

### 4.3 参数名来源

```
系统节点参数名 → NODE_PIN_RECORDS.inputs[] (仅类型如 "Ety", "Flt")
复合节点参数名 → compositeDef.inputs[i].name / outputs[i].name
运行时参数名   → src/runtime/variables.ts 函数签名:

  setNodeGraphVariable(variableName, variableValue, triggerEvent)
    → InParam[0] "变量名", [1] "变量值", [2] "是否触发事件"

  getNodeGraphVariable(variableName)
    → InParam[0] "变量名"
```

### 4.4 枚举值查找

```
enum_id.ts 中:
  ENUM_ID.Skill_Slot = 30  (enum 类型 ID)
  SkillSlot_1E = 3111      (具体的枚举值)

InParam 存 bEnum.val = 3111, 类型 E<30> → Skill_Slot 枚举
查找: enum_id.ts → 搜数值 3111 → SkillSlot_1E → "E 技能插槽"
```

---

## 五、待完成工作

### 子任务 1: 控制流渲染 (current ~80%)

**已完成**：
- 传球.gia 主图三页树图
- 复合 impl 图树图
- 分支命名提取方法

**待完成**：
- 实现 "从事件出发渲染完整追踪图" 的工具化 (当前是手画的)
- 渲染时不需要展开复合节点内部 (单层)
- 需要能处理 弹球.gia (74 节点) 和 物理运动.gia (68 节点) 的大图
- ASCII 渲染工具 (ascii-layout.ts) 的复合名解析和分支名显示增强

**关键数据**：
```
exec 边: node.pins[].i1.kind===2 (OutFlow)
          connects[].id → 目标节点
          没有 → 终端节点 / 字面值

复合分支名: compositeDef.outflows[].name
Multiple Branches 分支名: node.pins[].i1.kind===3 idx=1
                          bConcreteValue.value.bArray.entries[].bString.val
```

### 子任务 2: 数据流追溯 (current ~60%)

**已完成**：
- trace-dataflow.ts 工具 (支持多扇入追溯)
- 主图数据流已经手写进 full-topology.md

**待完成**：
- trace-dataflow.ts 渲染打磨（当前格式已定稿，需确认是否全局采用）
- 复合 impl 内部追溯（可选，当前停在复合出口）
- 对 弹球.gia / 物理运动.gia 遍历重要节点生成数据流图
- 参数名翻译完善（当前通过 getInParamName 函数处理，有些是类型名占位）

**数据流格式已定型**：
```
InParam[X] "参数名" (类型)
  <- n=N  源节点  OutParam[Y] "输出名"  (功能说明)
    InParam[0] ...
      <- n=M ...
    InParam[1] ...
      = 字面值
```

### 子任务 3: 节点概要 (not started)

**何时开始**：子任务 1 和 2 完成后再开始。

**预期内容**：
- 单个节点：所有引脚 (InFlow/OutFlow/InParam/OutParam) 列表
- 每个引脚：名字、类型、连接去向/来源
- 复合节点：接口定义 + impl 节点数 + 关键逻辑

---

## 六、关键陷阱与注意事项

### 数据提取陷阱

```
1. protobuf 只存有内容的 pin
   → 无连接无值时不在 pins[] 中显示

2. 连接方向: InParam (kind=3) 是数据流入
   connects[].id = 源节点
   connect2.index = 源 OutParam 索引

3. 复合接口 OutParam 不在节点 pins[] 中
   → 需从消费者 InParam 反向追溯
   → connect2.index 确定是哪个 OutParam

4. 复合 impl 图映射
   → compositeDef.relatedIds[0].id = impl 图 ID
   → accessories[] 中 id 匹配的是 impl 图
   → 注意有些复合的 relatedId 指向另一个 compositeDef (如 监听信号)
```

### 设计陷阱

```
1. 复合名不能编造
   → 必须从 compositeDef.def.name 获取
   → kind=22001 且 nid>=1e9 的节点是复合调用

2. 参数名不能编造
   → 优先从代码函数签名/文档获取
   → setNodeGraphVariable 第三参数是"是否触发事件" 不是"追加"
   → 运行时 src/runtime/variables.ts 是最准确的参数名来源

3. 枚举值要查表
   → enum_id.ts 中有 ENUM_ID 和具体值
   → 不可以写 "enum=3111" 就完事，要翻译成 SkillSlot_1E

4. 多分支的输入条件不同
   → n=41~48 虽然都是 SetNodeGraphVariable 但写入值不同 (9,8,10,12,8)
   → 不要合并为同一配置
```

### 文件路径提示

```
Windows GIA 文件:
  /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/
  └── 复杂gia/传球.gia, 弹球.gia, 物理运动.gia
  └── user_edit/*.gia     (参考文件)

代码路径:
  src/thirdparty/.../node_data/node_pin_records.ts  (节点名)
  src/thirdparty/.../node_data/enum_id.ts           (枚举值)
  src/thirdparty/.../node_data/node_id.ts           (NODE_ID 常量)
  src/thirdparty/.../protobuf/decode.ts             (GIA 解码)
  src/runtime/variables.ts                          (变量函数参数名)
  src/runtime/core.ts                               (MetaCallRegistry, fork/leaf)
  src/definitions/enum.ts                           (生成枚举类型)
  src/definitions/zh_aliases.ts                     (中英文对照)
  src/definitions/nodes.ts                          (NODE_ID + 事件常量)

工具路径:
  tests/composite/trace-dataflow.ts                 (数据流追溯)
  tests/composite/ascii-layout.ts                   (ASCII 渲染)
  tests/composite/dump-nodes.ts                     (坐标导出)
```

---

## 七、下一步行动建议

1. **继续子任务 1** — 增强 ascii-layout.ts 的复合名解析和分支名显示，使其能自动生成传球.gia 的控制流图
2. **收尾子任务 2** — 跑 trace-dataflow.ts 遍历 3 个 GIA 文件的关键节点，输出数据流图，更新 full-topology.md
3. **检查工具可用性** — 确保 `npm run build` 后 trace-dataflow.ts 可正常运行
4. **开始子任务 3** — 设计节点概览视图的格式 (可能参考 8.7 类型系统)
5. **复合展开增强** — (可选) 实现 trace-dataflow.ts 的复合 impl 内部追溯，通过 compositePinIndex 映射 OutParam → leaf 节点

### 需要用户确认的待定项

- 控制流图是否完全定型（格式、分页方式）
- 数据流追溯格式是否最终定稿
- 子任务 3 节点概要的详细需求
