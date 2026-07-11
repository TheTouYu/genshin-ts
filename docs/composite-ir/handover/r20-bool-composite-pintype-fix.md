# Session 交接：复合节点 Bool 类型编码修复（r20）

> **目标轮次：** r20
> **当前状态：** 部分完成，复合节点出引脚未绑定内部分支
> **核心成果：** 修复了 itemType type_server 缺失、pin 顺序、composite 定义 outflows

---

## 🔑 本会话最重要的经验：工具先行

### 用户的原则（必须遵守）

**"先改工具，再改代码。工具能一眼看出差异，才能验证修复是否正确。"**

| 场景 | 正确做法 |
|------|----------|
| 工具没检测出差异 | 先改工具，让它能检测出来 |
| 工具显示不清晰 | 简化显示，只要能标记异常即可 |
| 修复代码后 | 用工具验证，确认无异常标记 |
| 工具和实际行为不符 | 以游戏实际行为为准，工具可能有遗漏 |

### 本会话的沟通实例

**实例 1：工具升级**
> 用户：trace-exec 工具应该显示 composite 的 outflow 定义
> 我：在 printTree 中添加 `[是, 否]` 标注
> 用户：还需要显示 itemType 差异
> 我：添加 `⚠ itemType异常` 标记

**实例 2：差异定位**
> 用户：游戏里 DoubleBranch 连接断开了
> 我：用 jq 和 Python 解码对比，发现 pin 顺序相反
> 用户：工具为什么没检测出来？
> 我：工具只显示了 composite call 的差异，没有显示 DoubleBranch 的差异
> 用户：扩展工具，让所有节点都能显示异常

**实例 3：修复顺序**
> 用户：先别改代码，先找到差异
> 我：用 decode-gia 和 Python 脚本对比 JSON
> 用户：确认差异后再改代码
> 我：修复后用工具验证

---

## 一、问题背景

### 症状
- 复合节点的 bool 输入参数在游戏里渲染异常，无法选择具体值
- 主图里的 DoubleBranch 连接在游戏里显示为断开

### 根因分析（3 个差异）

| # | 差异 | 参考文件 | 生成文件 | 影响 |
|---|------|----------|----------|------|
| 1 | itemType 缺少 type_server | `{classBase:1, type_server:{type:4,kind:0}}` | `{classBase:1}` | 游戏不知道这是 bool 类型 |
| 2 | DoubleBranch pin 顺序 | OutFlow 在前，InParam 在后 | InParam 在前，OutFlow 在后 | 游戏按索引解析连接时对不上 |
| 3 | composite 定义缺少 outflows | `["是", "否"]` | `[]` | 复合节点没有定义控制流出口 |

---

## 二、已修复的内容

### 2.1 itemType 缺少 type_server

**文件：** `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/gia_gen/basic.ts`

**改动：** `item_type` 函数返回值从 `itemType` 改为 `type_server`

```typescript
// 修复前
export function item_type(type: VarType): VarBase_ItemType {
  return {
    classBase: 1,
    itemType: {  // ❌ 错误字段名
      type: type
    }
  }
}

// 修复后
export function item_type(type: VarType): VarBase_ItemType {
  return {
    classBase: 1,
    type_server: {  // ✅ 正确字段名
      type: type,
      kind: 0
    }
  }
}
```

### 2.2 pin 顺序相反

**文件：** `src/compiler/ir_to_gia_transform/index.ts`

**改动：** 在 `graph.encode()` 后添加 pin 重排序

```typescript
// 重排序 pins：OutFlow (kind=2) 在前，InParam (kind=3) 在后
if (mainNodes) {
  for (const n of mainNodes) {
    if (n.pins && n.pins.length > 1) {
      n.pins.sort((a: any, b: any) => {
        const kindA = a.i1?.kind ?? 0
        const kindB = b.i1?.kind ?? 0
        if (kindA === 2 && kindB !== 2) return -1
        if (kindA !== 2 && kindB === 2) return 1
        return 0
      })
    }
  }
}
```

### 2.3 composite 定义缺少 outflows

**文件：** `src/runtime/composite_registry.ts`

**改动：** 检测 doubleBranch 节点，自动创建 2 个 outflows

```typescript
// 检测 double_branch 节点：自动为其两个分支创建 outflows
let doubleBranchOutflows = 0
if (impl?.execNodes) {
  for (const n of impl.execNodes) {
    if (n.nodeType === 'double_branch') {
      doubleBranchOutflows = Math.max(doubleBranchOutflows, 2)
    }
  }
}
const totalOutflows = Math.max(leafCount, outflowNodeCount, doubleBranchOutflows)
```

### 2.4 outflow 名字为空

**文件：** `src/runtime/composite_registry.ts`

**改动：** 设置 doubleBranch 的 outflow 名字为 "是" 和 "否"

```typescript
outflows: hasExec
  ? Array.from({ length: totalOutflows }, (_, i) => ({
      name: doubleBranchOutflows > 0 ? (i === 0 ? '是' : '否') : '',
      visible: true, index: i,
      pinIndex: isMultiOutflow ? PIN_INDEX_OUTFLOW_MULTI_BASE + i : PIN_INDEX_OUTFLOW_SINGLE
    }))
  : [],
```

### 2.5 多余的终端节点

**文件：** `src/compiler/ir_to_gia_transform/index.ts`

**改动：** 移除为未连接 outflow 创建的 PrintString 节点

```typescript
// 删除了这段代码（~30 行）
// 不再为未连接的 outflow 创建终端 PrintString 节点
```

---

## 三、未解决的问题

### 3.1 compositePins 未绑定内部分支

**症状：** 复合定义有 outflows `["是", "否"]`，但内部 DoubleBranch 的两个分支没有通过 compositePins 绑定到这些 outflows。

**预期行为：**
- compositePins 应该有 2 条记录，将内部 DoubleBranch 的 OutFlow[0] 和 OutFlow[1] 映射到 composite 的 outflow[0] 和 outflow[1]

**实际行为：**
- compositePins 为空，outflows 没有绑定到任何内部节点

**可能的修复方向：**
- 在 `composite_registry.ts` 或 `composite.ts` 中，为 doubleBranch 的两个分支创建 compositePins 映射
- 需要分析 compositePins 的数据结构和生成逻辑

### 3.2 composite 内部 pin 顺序

**症状：** composite 内部图的 DoubleBranch 节点 pin 顺序仍然是 InParam 在前，OutFlow 在后。

**原因：** pin 重排序代码只处理主图节点，没有处理 composite 内部图节点。

**修复方向：**
- 在 `composite.ts` 的 `buildImplGraphNodes` 中添加类似的 pin 重排序逻辑

---

## 四、改动文件清单

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `src/thirdparty/.../gia_gen/basic.ts` | Bug fix | `item_type` 返回 `type_server` 而非 `itemType` |
| `src/compiler/ir_to_gia_transform/index.ts` | Feature | 添加 pin 重排序、移除终端节点生成 |
| `src/runtime/composite_registry.ts` | Feature | 检测 doubleBranch 创建 outflows、设置 outflow 名字 |
| `tests/composite/trace-exec-flow.ts` | Tool | 添加 `[是, 否]` 标注和 `⚠ itemType异常` 标记 |
| `tests/composite/test-bool-input.ts` | Test | Bool 复合节点测试文件 |

---

## 五、验证方式

### 5.1 工具验证

```bash
# 对比参考文件和生成文件
npm run trace-exec -- <参考文件.gia>
npm run trace-exec -- <生成文件.gia>
```

**预期输出：**
- 两个文件都应该显示 `[是, 否]` 标注
- 两个文件都不应该有 `⚠ itemType异常` 标记
- 节点数量一致（4 个）

### 5.2 游戏验证

将生成的 `.gia` 文件复制到游戏目录：
```bash
cp tests/composite/output/bool复合测试.gia "/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/"
```

**预期行为：**
- 复合节点的 bool 参数可以正常选择值
- 主图里的 DoubleBranch 连接正常，不会断开

---

## 六、参考文件

```
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/
├── user_edit/
│   └── bool.gia                    ← 黄金标准（手动创建）
└── bool复合测试.gia                 ← 生成文件（复制到此处）
```

### 参考文件结构

**复合定义：**
- name: "bool"
- inputs: ["条件" (bool)]
- outflows: ["是", "否"]

**复合内部（impl graph）：**
- n=2: DoubleBranch → OutFlow[0] 连接到 PrintString
- n=3: PrintString (InParam = "是")

**主图：**
- n=1: WhenEntityCreated → 并行连接 n=8 (composite) 和 n=4 (DoubleBranch)
- n=4: DoubleBranch → InParam = bool(true)
- n=5: PrintString (InParam = "是-来自主图")
- n=8: CompositeCall → InParam = bool(true), compositePinIndex=61

---

## 七、沟通检查清单（给后续会话用）

拿到任务时，按以下顺序执行：

- [ ] **复述理解**：把要做的步骤列出来，问用户对不对
- [ ] **工具优先**：如果工具没检测出差异，先改工具
- [ ] **分析后汇报**：trace/diff 完，先给用户看结果，不要直接动手
- [ ] **验证先行**：能不改源码验证的，先写脚本验证
- [ ] **每步汇报**：改完、编译完、生成完、比对完，每步都汇报
- [ ] **等确认**：用户说"下一步"或"可以"之后，再动手
- [ ] **发现新问题**：顺手想修的时候，停下来，先汇报

---

## 八、已升级的工具

### trace-exec-flow.ts

**新增功能：**
1. 显示 composite 定义的 outflow 名称 `[是, 否]`
2. 检测并标记 `⚠ itemType异常`（缺少 type_server）

**使用方式：**
```bash
npm run trace-exec -- <文件.gia>                    # 主图执行流
npm run trace-exec -- <文件.gia> --expand=<复合名>   # 展开复合内部
```

**输出示例：**
```
n= 1 [系统] When Entity Is Created
   Branch×1 纯执行流触发  (Ety, Gid)
├─ 1 → n=8 复合:bool (InFlow[0]) [是, 否]
└─ 1 → n=4 Double Branch (InFlow[0])
   └─ 是 → n=5 Print String (InFlow[0]) → (终端)
```

---

## 九、关键代码位置

| 功能 | 文件 | 行范围 |
|------|------|--------|
| itemType 生成 | `src/thirdparty/.../gia_gen/basic.ts` | 317-327 (`item_type` 函数) |
| pin 重排序 | `src/compiler/ir_to_gia_transform/index.ts` | ~767-780 |
| composite outflows 生成 | `src/runtime/composite_registry.ts` | ~215-240 |
| compositePins 绑定 | `src/compiler/ir_to_gia_transform/composite.ts` | ~200-240 (`buildCompositeAccessories`) |
| 测试文件 | `tests/composite/test-bool-input.ts` | 全文 |

---

## 十、2026-07-11 最终勘误（真实游戏验证）

> 本节覆盖本文前面的阶段性根因判断；本文其余内容仅保留为历史调查背景。

最终参考文件为 `user_edit/变量/bool.gia`。该文件的 `CompositeDef.outflows=[]`，并非本文早期记录的 `[是, 否]`。逐项排除了 outflows、pinIndex、定义/impl ID 关系、调用 pin wrapper 和 `type_server.kind` 后，纯 protobuf decode/encode round-trip 仍会让游戏中的 bool 控件异常。

wire 扫描定位到旧 schema 未声明的字段：

```text
CompositeDef.ParameterFlow.Type.field 101
raw bytes: aa06020801
child field 1 = 1
```

正式语义为：

```proto
message EnumId { int64 val = 1; }
EnumId enumId = 101;
```

复合 bool input/output 必须生成 `enumId: { val: 1 }`。这里的 `enumId.val` 是接口枚举类型元数据；调用 pin 的 `bEnum.val` 是实际布尔值。补齐 schema 和编译器编码后，`bool-gsts-7-compiler-enum-id.gia` 已由用户于 2026-07-11 确认游戏内控件正常。

当前自动回归为 `tests/composite/test-composite-bool-input-gia.ts`；正式编码规则见 `docs/architecture/composite/gia-encoding.md`。
