# gsts 编译器合规清单

> 状态：当前实现 + 真实 GIA 验证对照
> 来源：当前代码实现（gsts 编译器输出）+ 真实 GIA 验证
> 最近校验：2026-07-06
> 适用范围：gsts 编译器 vs 游戏编辑器输出差异清单。

> 本文档回答：**gsts 编译器的输出与游戏编辑器差异在哪里？要改什么才能产生一致的文件？**
>
> 所有的"正确"都基于真实 GIA 文件（user_edit 40 文件 + 复杂gia 3 文件 + 实用 log系统）。

---

## 验证基线

首次对比时间：2026-06-30

| 对比对 | gsts 样本 | 编辑器样本 | 结构匹配度 |
|:------|:---------|:----------|:---------:|
| 简单复合 | `tests/composite/output/basic_call.gia`（634B，2 nodes） | `user_edit/基本调用节点.gia`（2 nodes） | 高（相同结构，细节不同） |
| 预期对比 | test-*-composite 系列（~20个） | user_edit 系列（~20个） | 待进行 |

---

## 差异清单

### P0 — 阻碍 inject 后正确运行的差异

| # | 字段 | 编辑器产出（正确） | gsts 产出（当前） | 影响 | 涉及代码 |
|:-|:----|:----------------|:----------------|:----|:--------|
| ~~1~~ | ~~**gameVersion**~~ | ~~`6.6.0`~~ | ~~`6.3.0`~~ | ~~低版本 GIA 可能被游戏拒绝~~ | ~~`src/thirdparty/.../gia_gen/basic.ts:33`~~ |
| 2 | **graphId 分配规则** | 编辑器：**不遵从** `id+10000`，使用独立分配的 graphId（如 `1610612928` 对应 CompositeDef id `1610613021`） | gsts：`graphId = def.id + 10000`（如 `1610710000` → `1610710000`） | **高**——graphId 在 `relatedIds` 中引用，不一致时 injector 无法正确关联 impl 图 | `src/compiler/ir_to_gia_transform/composite.ts` graphId 派生逻辑 |
| ~~3~~ | ~~**event nodeIndex**~~ | ~~`1`（user_edit 全部文件）~~ | ~~`2`~~ | ~~影响 `relatedIds` 中的节点引用——部分游戏逻辑依赖 event 的 nodeIndex~~ | ~~`src/runtime/core.ts` ensureBootstrapFlow 消耗了 id=1 + `index.ts` 强制映射~~ |
| 4 | **nodeIndex 编序规则** | **非连续、非 1-based**（从 1 或 2 开始，跳跃，如 `基本调用节点.gia` 有 `nodeIndex=1` 和 `3`） | 连续 `1,2,3`（自事件修复后自然连续） | 游戏引擎可能根据 nodeIndex 判断图结构合法性 | `src/compiler/ir_to_gia_transform/index.ts` 节点编号 |

### P1 — 影响文件结构一致性但不一定阻塞运行

| # | 字段 | 编辑器产出 | gsts 产出 | 影响 | 涉及代码 |
|:-|:----|:----------|:---------|:----|:--------|
| 5 | **终端复合 OutFlow pin** | 终端复合**没有** OutFlow pin（compositePins 中也无 OutFlow 条目） | 终端复合**有** OutFlow pin（pi=4），只是 connects 为空 | gsts 生成了编辑器不存在的字段——反编译/审查工具可能报差异 | `src/compiler/ir_to_gia_transform/index.ts` 后处理逻辑 |
| 6 | **compositePins 数量** | 终端：仅 InFlow（1条） | 终端：InFlow + OutFlow（2条） | 同上 | 同上 |
| ~~7~~ | ~~**Impl 图 nodeIndex 起始**~~ | ~~从 `2` 开始（带编号偏移）~~ | ~~从 `1` 开始~~ | ~~可能与编辑器 layout 编号规则不同~~ | ~~`src/compiler/ir_to_gia_transform/composite.ts` nodeIndex 映射~~ |
| 8 | **布局坐标** | 编辑器人工调整，无固定步进 | gsts 布局算法值 | 编辑器打开后可能自动重排；不影响运行 | `src/compiler/ir_to_gia_transform/layout.ts` + `composite.ts` |

### P2 — 尚未验证但已知可能差异的领域

| # | 潜在差异 | 依据 | 需要验证 |
|:-|:--------|:----|:--------|
| 9 | **SignalDef 格式** | gsts 可能没有 SignalDef（which=14）编码 | 编译一个 `g.defineSignal()` 测试用例 |
| 10 | **structureDef（which=29）** | gsts 可能不支持 struct 类型 | 编译一个使用 struct 的测试用例 |
| 11 | **多 OutFlow 复合** | gsts 的 pinIndex（8+idx）vs 编辑器自定义值 | 编译一个多出口复合 + 对比顺序执行.gia |
| 12 | **多个复合定义（跨文件共享）** | gsts 使用 `1610700000+` 空间；编辑器使用 `16106128xx` | inject 到真实游戏环境后 gsts 的 ID 是否冲突 |
| 13 | **ClientExec 信号触发** | gsts 是否支持信号驱动架构（无 event） | 编译一个 `event.monitorSignal` 测试用例 |
| 14 | **DTC 边界物理引脚缺失** | composite capture 输入跳过 DTC 节点的物理 InParam，导致 OutParam 也不生成，compositePins 和数据边全部悬空 | 为 `data_type_conversion_*` 的边界 capture 保留物理 pin，并检查下游 OutParam |

---

## 已修复的差异

| # | 字段 | 修复 | 验证方式 |
|:-|:----|:----|:--------|
| 1 | gameVersion (`6.3.0` → `6.6.0`) | `basic.ts:33` | `npm run build && npx tsx tests/composite/verify-game-version.ts` |
| 3 | event nodeIndex (`2` → `1`) | `core.ts:551-570`：引导流不消耗 id=1；`index.ts:565`：事件强制 nIdx=1 | 运行任意测试，检查 GIA 的 event nodeIndex |
| 7 | Impl 图 nodeIndex 起始 (`1` → `2`) | `composite.ts:33`：`i+1` → `i+2` | 运行任意测试，检查 impl 图 nodeIndex |
| 8 | 布局坐标 (800/600 → 500/400) | `layout.ts:273-278` + `composite.ts:203-206`：缩小间距 | `npx tsx tests/composite/dump-nodes.ts` |
| 14 | DTC 边界物理引脚 | `composite.ts`：DTC capture 被 compositePins 指向时保留物理 InParam，独立生成 OutParam，启用 `requirePhysicalPins` 检查 | `npx tsx tests/composite/test-stage3-bool-boundary-dtc-physical-pins.ts` + 游戏验证通过 |

---

## 已验证的一致字段（无需修改）

以下字段在首次对比中确认 gsts 与编辑器一致：

| 字段 | 状态 | 说明 |
|:----|:----|:-----|
| `graph.which` | ✅ 一致 | 均为 `9`（EntityNode） |
| `entries` / `entrySlotIndex` / `evaluationInterval` | ✅ 一致 | 均为 `undefined`，真实文件也不用 |
| `graphValues` | ✅ 一致 | 均为 `0` 或空数组 |
| `type.kind` | ✅ 一致 | 均为 `1000`（Composite） |
| `relatedIds` 存在性 | ✅ 一致 | 均有 1 个 relatedId 指向 impl 图 |
| Impl 图 `graphValues`、`variables`、`affiliations`、`comments` | ✅ 一致 | 均未使用 |

---

## 验证方法

每次修改后，执行：

```bash
# 1. 生成 gsts 输出
npx tsx bin/gsts.mjs tests/composite/test-simple-basic-call.ts

# 2. 对比 vs 编辑器
npx tsx tools/analyze-composite-gia.ts ./tests/composite/output/basic_call.gia
npx tsx tools/analyze-composite-gia.ts "/mnt/c/.../user_edit/基本调用节点.gia"

# 3. 关键字段检查
#  - gameVersion: 6.6.0?
#  - event nodeIndex: 1?
#  - 终端复合: OutFlow pin 数 0?
#  - graphId: 不适用 id+10000?

# 4. 专用验证脚本（自动检查 gameVersion）
npm run build && npx tsx tests/composite/verify-game-version.ts
```

---

## 根源分析

为什么 gsts 与编辑器有这些差异？

1. **gsts 的设计目标不是"产出和编辑器一样"**——`src/runtime/composite_registry.ts` 的 `toCompositeDefIR()` 中的 pinIndex（1974/4/100-base/200-base）和 ID 起始（1610700000）是 gsts 自己定的常量，**没有参考真实文件**
2. **`ir_to_gia_transform/` 的大部分逻辑基于源码推导**——如 graphId = def.id + 10000 是编译器自己的约定，但编辑器有自己的 ID 分配机制
3. **`docs/architecture/composite/` 文档描述的就是 gsts 自身行为**，不是编辑器行为——之前误认为它是"官方规范"，但它描述的是 gsts 实际做了什么，而不是编辑器做了什么

**修正方向**：`ir_to_gia_transform` 需要增加"编辑器兼容模式"——在输出 GIA 前，调整 nodeIndex、graphId、pinIndex、终端处理等字段，使其匹配编辑器产出格式。
