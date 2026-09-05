# TickManager 资产设计（可复用）

> status: draft
> 目标：为服务端节点图提供一个低负载、跨项目可复用的 TickManager 资产。

## 为什么优化

原社区版“TickManager 信号版”把单个 0.06s 级 TickUpdate 广播给所有消费方：

- 低频消费方（如 200ms / 1000ms）也会被 0.06s 信号反复唤醒；
- 每次唤醒都要执行一次 Update 接收器门卫；
- 高频广播下，N 个消费方的“无效门卫执行”成本随 N 线性放大。

优化方向（用户 2026-09-05 确认）：**多档频率信号**。

## 核心思想

一个专用 TickManager 实体持有一个**基础心跳定时器**，并在每次心跳中：

1. 维护单调递增 `tickCount`；
2. 按 tick 取模分别发送：
   - `TickUpdate_60`：每 1 tick（60ms 档）
   - `TickUpdate_200`：每 4 tick（200ms 档，比例可调）
   - `TickUpdate_1000`：每 17 tick（约 1000ms 档）
3. 消费方只需监听自己需要的档位信号，低档消费方不会再被高频信号唤醒。

## 挂载边界（参考足球.gil 实测）

- 使用者需要**一个专用空模型实体/定义**作为 TickManager；
- 在该实体上挂载本资产主图（一个 g.server 图即可，不必拆 TickInit/Timers/TickUpdate 三张图）；
- 需要时在 TickManager 实体上配置全局计时器组件 `GlobalTick`，用于发送 `now_ms`；
- 消费方在自己的图里放置对应档位的 Update 监听/门卫复合。

## 信号 schema

| 信号 | 参数 | 说明 |
|---|---|---|
| `TickUpdate_60` | `manager:entity`, `now_ms:int`, `interval_s:float` | 60ms 档心跳 |
| `TickUpdate_200` | `manager:entity`, `now_ms:int`, `interval_s:float` | 200ms 档心跳 |
| `TickUpdate_1000` | `manager:entity`, `now_ms:int`, `interval_s:float` | 1000ms 档心跳 |

## 实现路径

1. 先用最小 DSL 验证：单 g.server 图能否编译、信号能否在无地图/有 donor 地图下编译。
2. 分别生成每张主图 `.gia`，再用合并脚本合成“多主图资产 `.gia`”（与社区功能元件同构）。
3. 使用刚扩展的 GIA 读图命令回读验证所有主图/复合/信号齐全。

## 测试计划

- 结构层：`list-gil-node-graphs.ts <asset.gia>` 能看到 TickManager 主图；
  `parse-gil-node-graph.ts <asset.gia> --list` 能看到全部复合/信号目录。
- 注入层：在足球.gil 副本上注册三档信号、挂到专用实体、注入后 `explain`/`scan-signals` 回读。
- 行为层：Beyond_Debug_Log 对比旧版与新版每秒负载/低频消费方唤醒次数。
