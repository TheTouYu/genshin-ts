# 资源包 17：跨图状态同步包（cross-graph-sync）

> 状态：当前推荐
> 来源：从 rubik-3x3 项目抽象（2026-08-22）
> 最近校验：2026-08-22
> 适用范围：千星沙箱服务端节点图；多图拆分时的状态桥接

## 用途

当玩法拆到多个节点图（如主图 + 视觉图）时，把共享状态从「自定义变量」（挂在控制器实体上）同步进
本图的「节点图变量」，让本图复合节点能继续用 `getNodeGraphVariable` 读取。

## 节点清单（view_sync_* 系列，调用流复合）

| 复合名 | 功能 | 逻辑 |
|---|---|---|
| `view_sync_blocks` | 同步 blocks/tempP/blockOrient | 读自定义变量 → 写节点图变量 |
| `view_sync_center` | 同步中心位置 | 同上 |
| `view_sync_turn_params` | 同步转动参数 | 同上 |
| `view_sync_motion_params` | 同步运动参数 | 同上 |
| `view_sync_velocity_params` | 同步速度参数 | 同上 |
| `view_sync_shared` | 汇总：串行调用上面 5 个 | 链式 connect |

## 通用方法论（提炼）

1. **跨图共享状态 = 自定义变量桥接**：主图把共享状态写入控制器实体的自定义变量
   （`setCustomVariable`），视觉图用 `getCustomVariable` 读出，再 `setNodeGraphVariable` 写进本图图变量。
   **自定义变量是跨图共享的，节点图变量是图内私有的**——这是两者的本质区别。
2. **「读自定义变量 → 写节点图变量」是同步的标准三段式**：每个 sync 复合都是
   `setNodeGraphVariable(name, getCustomVariable(target, name).asType(...))`。
3. **同步时机要克制**：**每次操作首个事件同步一次，不要每 tick 同步**（2026-08-21 性能实证：
   每 tick 同步导致单次转动负载飙到 5000-10000）。同步是重操作，要按需触发。
4. **汇总复合串行调用子同步**：`view_sync_shared` 用 `f.connect` 把 5 个子同步串成链，
   一次调用完成全部同步。**「汇总复合 = 子复合串行链」是标准的分层方式**。
5. **跨图复合不能引用目标图没有的图变量**（2026-08-21 实证）：视觉图调用主图复合时，被调复合
   只依赖本图已声明的图变量，否则 GIA 编码报 `ordinary data edge pin type mismatch`。

## 复用提示

- 这是**多图拆分玩法的必备模式**（B 类），任何「单图超 3000 节点需要拆图」的场景都要用。
- 同步的变量清单、同步时机要按项目调整，但「自定义变量桥接 + 读→写三段式 + 克制同步」的骨架是通用的。
- 与「跨图拆分逻辑」配合（见 dsl-nodegraph-development 技能「跨图拆分逻辑」一节）。
