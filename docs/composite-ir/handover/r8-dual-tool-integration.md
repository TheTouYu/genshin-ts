# 下一轮交接文档：双工具融合测试与优化

> 当前轮次完成了 `find-event-sources.ts` 的 P0 修复 + `--expand` 展开功能 + 参数显示 + 信号名提取。
> 下一轮目标：**将执行流追溯（find-event-sources）与数据流追溯（trace-dataflow）两个工具结合使用**，
> 对复杂 GIA 文件进行系统级测试和优化，实现真正的轻松探索。

---

## 一、当前成果

### 1.1 find-event-sources.ts — 执行流事件源分析工具

**文件：** `tests/composite/find-event-sources.ts`（当前分支 `feat/fork-api-and-layout`）

**P0 修复全部完成：**
| 修复 | 说明 |
|------|------|
| 分支计数 | `×N 下游` → `×N 分支`（按 `unique srcBranchIdx` 计数） |
| 树形渲染 | `buildTree` + `printTree`，`├─/└─/│` 树形字符，正确缩进 |
| JSON 深度 | `--depth=N`：0=扁平，省略=递归到终端 |
| 系统节点 Branch 名 | 数字 `1, 2, 3...`（不再用 `NODE_PIN_RECORDS.outputs[]` 误匹配 "Ety"） |
| 事件源参数显示 | 系统 `(Ety, Gid)` 输出参数 / 复合 `[dt, v, w]` 输入参数 |
| 复合内部展开 | `--expand=N` 或 `--expand=<名称>`，展示子图事件源 |
| 伪复合检测 | 无编译体的伪复合（如监听信号）自动归为 `[系统]` + 显示英文名 + 信号名 |
| 终端节点 | 复合节点不标记 `(终端)`，仅系统叶子节点标记 |

**当前输出示例：**
```
$ npx tsx tests/composite/find-event-sources.ts 物理运动.gia --expand=Update

📡 复合:Update — 内部事件起点 (1 个)
------------------------------------------------------------
n= 2 [系统] Monitor Signal (监听信号)  "TickUpdate"
   Branch×1  (事件源实体, 事件源GUID, 信号来源实体, TickManager, 实际刷新时间[ms], 实际刷新间隔[s])
└─ 1 → n=20 Double Branch (InFlow[0]) — ×2 分支
   ├─ 是 → n=23 Double Branch (InFlow[0]) — ×2 分支
   │  ├─ 是 → n=24 Set Custom Variable (InFlow[0]) ...
   │  └─ 否 → n=8 Double Branch (InFlow[0]) ...
   └─ 否 → n=26 Set Local Variable (InFlow[0]) → (终端)
```

### 1.2 trace-dataflow.ts — 数据流链追溯工具

**文件：** `tests/composite/trace-dataflow.ts`

已有功能：
- 主图数据输入追溯（从 InParam 反向追踪到源头）
- impl 图（复合内部）数据追溯（`--composite <名称>`）
- `--max-depth=N` 限制链深
- `--all-params` 显示节点所有参数
- 截断标记 `(∧ N 条上游)`

**用法示例：**
```sh
# 主图追溯 n=9 InParam[2]
npx tsx tests/composite/trace-dataflow.ts 物理运动.gia 9 2

# 在复合内部追溯
npx tsx tests/composite/trace-dataflow.ts 传球.gia 5 0 --composite 计算分力
```

---

## 二、文件路径参考

### 2.1 GIA 测试文件位置

```sh
# 游戏导出目录（Windows 路径，WSL 通过 /mnt/c 访问）
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/

# 复杂 GIA 文件（三个主要测试文件）
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/复杂gia/
├── 传球.gia      (24 节点，3 事件源 — 传球技能系统)
├── 弹球.gia      (74 节点，6 事件源 — 弹球游戏系统)
└── 物理运动.gia  (68 节点，7 事件源 — 物理运动控制系统) ← 主要测试用

# user_edit 目录（25 个基础布局参考文件）
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/user_edit/
├── 分支.gia / 分支2.gia / 顺序执行.gia / two_exec.gia
├── 两个复合节点.gia / 基本调用节点.gia / 基本调用节点（相对）.gia
├── 多种flow.gia / 复合内部分支branch.gia / fanout.gia
├── 数据类型测试.gia / 类型转化_gen.gia / 类型转化手动.gia
└── ...等共 25 个文件
```

### 2.2 工具路径

```sh
# 本仓库根目录
~/genshin-ts/

# 执行流工具
tests/composite/find-event-sources.ts

# 数据流工具
tests/composite/trace-dataflow.ts

# 编译输出目录（用于 protobuf 解码依赖）
dist/src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/

# 节点定义（节点 ID 映射、引脚记录）
dist/src/compiler/gia_vendor.js
dist/src/thirdparty/.../node_data/node_pin_records.js

# 中文→英文节点名映射
src/definitions/zh_aliases.ts
dist/src/definitions/zh_aliases.js
```

---

## 三、下一轮目标

### 总目标

**将 find-event-sources（执行流）和 trace-dataflow（数据流）两个工具配合使用，
对三个复杂 GIA 文件（传球.gia、弹球.gia、物理运动.gia）进行系统级验证，
修复发现的 bug，优化输出可读性，实现真正的「轻松探索任何复杂 GIA 文件」。**

### 具体子任务

#### P0 — 核心功能完善

1. **双工具结合探索**
   - 先用 `find-event-sources --expand=<复合>` 看执行流链
   - 对关键节点的 InParam 用 `trace-dataflow` 追溯数据来源
   - 对三个复杂 GIA 各做一次完整的执行流 + 数据流交叉分析
   - 记录探索中发现的问题

2. **trace-dataflow 改进**
   - 支持通过 `--expand=<名称>` 类似的复合名称查找（目前仅支持 `--composite <名称>`）
   - 确保 impl 图追溯能找到 sub-compound 内部的 def
   - `--all-params` 输出格式优化（对齐 find-event-sources 的风格）

3. **跨图追溯**
   - 目前 find-event-sources 只分析主图，trace-dataflow 支持 impl 图
   - 需要实现：从主图节点 InParam 追溯到复合定义内部的数据流
   - 从复合内部的 OutParam 追溯到主图下游节点的 InParam

#### P1 — 健壮性与可读性

4. **循环检测优化**
   - 当前 find-event-sources 有 `visited` 检测防止循环
   - trace-dataflow 也有类似的循环检测
   - 确保循环检测在复杂场景（如 Update 内的计时器循环）下正确工作

5. **输出可读性增强**
   - 两个工具的节点名格式统一
   - 数字/索引的显示一致性
   - 长链截断的提示信息改进

6. **错误处理和边缘情况**
   - 复合节点无编译体（信号驱动）时的友好提示
   - 找不到节点/参数时的明确错误信息
   - 跨图节点索引冲突的处理

#### P2 — 自动化

7. **一键分析脚本**
   - 创建一个探索脚本，对一个 GIA 文件自动：
     a. 列出所有事件起点
     b. 对每个事件起点展开分析
     c. 对关键数据参数追溯来源
     d. 合并输出为完整报告

8. **测试用例**
   - 对三个复杂 GIA 文件建立标准测试用例
   - 验证关键执行流和关键数据流的正确性
   - 回归测试（工具改动后重新运行）

### 技术细节注意事项

- **compositePins 处理**：内部引脚映射关系对跨图追溯至关重要，确保两个工具使用一致的方法
- **which 值的含义**：which=9（编译体）、which=12（定义体）、which=14（信号节点），理解这些对跨图分析很重要
- **defToCompiled 映射**：从 def.relatedIds[0] 建立，但需验证目标是否是 which=9（之前踩过坑）
- **信号驱动复合**：监听信号/发送信号没有编译体，它们的实现通过 which=14 信号节点
- **中英文节点名映射**：`SERVER_EVENT_ZH_TO_EN` 在 `zh_aliases.ts`，用于伪复合的英文名显示
- **pin kind 对照**：1=OutFlow(执行流输入)、2=Branch(执行流输出)、3=InParam(数据输入)、4=OutParam(数据输出)、5=配置参数/默认值

---

## 四、建议探索路径

建议按以下顺序验证三个 GIA 文件：

### 第一轮：传球.gia（最简，24 节点）

```sh
# 1. 列出事件源
npx tsx tests/composite/find-event-sources.ts 传球.gia

# 2. 展开关键复合
npx tsx tests/composite/find-event-sources.ts 传球.gia --expand=监听信号

# 3. 追溯数据流（对关键 InParam）
npx tsx tests/composite/trace-dataflow.ts 传球.gia 9 2

# 4. 验证信号驱动的复合
npx tsx tests/composite/trace-dataflow.ts 传球.gia 5 0 --composite 职业branch
```

### 第二轮：弹球.gia（中等，74 节点）

```sh
# 展开关键复合
npx tsx tests/composite/find-event-sources.ts 弹球.gia --expand=处理传球
npx tsx tests/composite/find-event-sources.ts 弹球.gia --expand=处理蓄力和普通攻击
```

### 第三轮：物理运动.gia（最复杂，68 节点，7 事件源）

```sh
# 展开各层复合
npx tsx tests/composite/find-event-sources.ts 物理运动.gia --expand=Update
npx tsx tests/composite/find-event-sources.ts 物理运动.gia --expand=物理运动控制器
npx tsx tests/composite/find-event-sources.ts 物理运动.gia --expand=条件branch

# 交叉追溯（逐级深入）
npx tsx tests/composite/trace-dataflow.ts 物理运动.gia <节点> <参数> --composite <复合名>
```

---

## 五、关联文件清单

| 文件 | 用途 |
|------|------|
| `tests/composite/find-event-sources.ts` | 执行流事件源分析工具（本轮主改） |
| `tests/composite/trace-dataflow.ts` | 数据流链追溯工具（下一轮主改） |
| `docs/composite-ir/handover/find-event-sources-handover.md` | 本工具交接文档（已更新） |
| `docs/composite-ir/handover/r7-trace-dataflow-tool-improvements.md` | trace-dataflow 改进记录 |
| `src/definitions/zh_aliases.ts` | 中文→英文节点名映射 |
| `dist/src/compiler/gia_vendor.js` | NODE_ID 映射（系统节点 ID→名称） |
| `dist/src/thirdparty/.../node_data/node_pin_records.js` | 节点引脚记录（名称、输入输出类型） |
| `dist/src/thirdparty/.../protobuf/decode.js` | GIA 文件解码器 |
| `dist/src/definitions/zh_aliases.js` | 编译后的中英文映射 |

---

## 六、设计笔记

### find-event-sources 架构要点

- 核心函数：`analyze()` → 构建 `downstreamOf` 执行流图 → 识别事件源 → `buildTree`/`printTree` 渲染
- 展开机制：`showExpand()` → `expandSubGraph()`（对 compiled body 子图重新运行分析）
- 伪复合检测：`_hasCompiledBody(nid)` → `defToCompiled.has(nid)`

### 事件源判定（跨图通用）

```
isEvent = !isCalled            # 无上游调用
       && hasInternalBranch    # 有未映射到外部 outflow 的 Branch
       && !inflowFromOutside   # 不从外部 inflow 触发
```

### 编译体定位

```
def.relatedIds[0] → candidateId
    ↓ 需验证 candidateId.which === 9
    ↓ 否则可能是信号节点（which=14）→ 无编译体
compiledBodyIds.has(candidateId) ? 确认 : 拒绝
```

---

*交接时间：2026-07-02*
*当前分支：`feat/fork-api-and-layout`*
*下一轮负责人：待定*
