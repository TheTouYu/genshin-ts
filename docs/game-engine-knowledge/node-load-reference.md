# 节点负载参考（Node Load Reference）

> 状态：已验证（2026-08-20 魔方日志实测，日志 `2026-08-20_11-37-24_2737_110170759.gia`）
> 用途：编写新的复合节点/玩法逻辑时，参考各节点的负载特征，避免高负载节点被高频调用、
>       避免同一变量/表达式被写法重复物化（多次调用）。
> 证据：帧表 `load=N` 字段（f6 = 计算负载），逐帧统计。

## 一、分析方法（三维度，缺一不可）

优化不能只看帧数（执行次数），要三维度合看：

1. **总帧数**：节点执行次数（帧表条目数）——衡量"调用频率"
2. **单帧负载（load）**：该节点一次执行的计算负载——衡量"单次消耗"（`gia_log.py frames` 每帧 `load=N`）
3. **重复物化**：同一变量 get / 同一表达式在代码里被多次写（如 `f.getNodeGraphVariable('x')` 在
   循环展开里写 8 次 → 8 个 GetVar 节点）——**写法不当导致多次调用**，是纯代码可优化项

**关键原则**：
- 负载高 × 调用多 = 最大热点
- 负载低 × 调用极多（几十次）= 写法重复，先改代码
- 负载高 × 调用少（一次性）= 可接受（如 createPrefab）

## 二、节点负载实测表（单帧 load）

| 节点 | 单帧 load | 出现场景 | 备注 |
|---|---|---|---|
| Create Prefab（创建实体） | **36-114** | 生成/重置角块 | 最重的日常单节点；不可降负载，只能减少调用（少重建） |
| Add Uniform Basic Linear/Rotation Motion Device | **~30** | 段事件/块事件运动器 | 引擎运动设备计算；段事件均负载 6 的主要来源 |
| Set Node Graph Variable（带值写） | 8-9 | curBlock/变量写入 | 写变量比读变量重 |
| When Timer Is Triggered | 5-6 | 定时器回调 | 事件分发开销 |
| Multiple Branches（MB 分发） | 6 | 定时器/段分发 | 分支越多越重 |
| Get Node Graph Variable（读变量） | 2 | 变量读取 | 两级帧（04 子 + 03 主），**读一次 = 2 帧** |
| Get Corresponding Value From List | 1-2 | 列表读取 | 轻 |
| Set List Value | 1 | 列表写入 | 轻 |
| 算术（Add/Mul/Equal/AND/OR…） | 1-2 | 逻辑计算 | 轻 |
| getEntityLocationAndRotation（读位置） | 2-4 | spin/orbit 计算 | 中等 |
| 3D 向量数学（dot/cross/zoom/sub） | 1-2 | 轨道速度计算 | 轻，但链长（5 段 × 每段 3-5 节点） |
| is_solved 全量检查（16 GetVar + 16 get_list + 16 equal + 15 AND） | 总 ~60 帧 | after_turn 胜利检查 | **GetVar 16 次是写法重复**（可合并为 2） |

## 三、一次转动负载分布（魔方 2×2，日志实测 3547 总负载）

| 阶段 | 帧数 | 总负载 | 负载占比 | 单帧均负载 |
|---|---|---|---|---|
| 点击帧（apply_move 逻辑层） | 380 | 678 | 19% | 1.8 |
| 块事件（turn_one：查表+速度+运动器） | 920 | 1502 | **42%** | 1.6 |
| 段事件（segment_dispatch：运动器） | 224 | 1231 | **34%** | **5.5** |
| after_turn（胜利检查 is_solved） | 93 | 136 | 4% | 1.5 |

> 结论：**段事件帧数少但负载占比高**（运动器添加 load≈30）；块事件总量最大（速度预计算链长）。

## 四、写法重复审计（代码可优化项，零语义风险）

| 复合 | 问题写法 | 实测影响 | 修复 |
|---|---|---|---|
| gsts_logic_is_solved | `pos(i)` 每槽调 `getNodeGraphVariable('cornerPos')` → 8+8=16 个 GetVar | 64 节点/次检查 | **get 一次共享**：`const pos = getNodeGraphVariable('cornerPos')` 后 8 个 get_list 复用 → GetVar 16→2 |
| gsts_logic_apply_move | 8 个 set_list_value 各自 `getNodeGraphVariable('tempP'/'tempT')` | 8 个 GetVar | get 一次共享（参照 gsts_logic_reset 已共享的好写法） |
| gsts_logic_write_slot | tempQ 变量 get 2 次（set 前 + 物化读） | 每槽 8 GetVar | 变量句柄 get 一次共享 |
| gsts_orbit_trigger | 段事件每次 `set curBlock`（load 9 × 32 事件） | 64 帧/会话 | 引擎限制（避免复合按常量特化），暂不可改，待编译器支持后优化 |

> 好写法示范：`gsts_logic_reset` 先 `const cornerPos = f.getNodeGraphVariable('cornerPos')` get 一次，
> 8 个写入共享引用——所有"循环展开多槽"的复合都应照此写。

### 2026-08-20 实测修正：GetVar 共享的收益取决于复合类型（重要）

优化 ② 已注入并游戏核验（日志 `2026-08-20_12-05-43` vs 优化前 `11-37-24`）：

| 复合 | 类型 | GetVar 变化 | 运行时帧变化 |
|---|---|---|---|
| gsts_logic_is_solved | **纯数据**（无 exec 链） | 16→2 | **生效**：after_turn 93→65（-28 帧/次检查，打乱 20 步 -560 帧） |
| gsts_logic_apply_move | **exec**（set_list_value 链） | 8→2 | **无效**：点击帧 380→380（帧数零变化） |
| gsts_logic_write_slot | **exec** | 8→7 | **无效**：帧数零变化 |

**结论**：GetVar 共享在**纯数据复合**（输出被 get_list/算术消费）能减少运行时帧；
在 **exec 复合**（输出被 set_list_value 等 exec 节点消费）**不减少帧**——引擎按 exec 链逐节点求值，
共享 GetVar 节点后每个消费点仍产生相同执行帧（数据流求值被吸收）。exec 链上的变量访问优化
应聚焦**减少节点本身**（如合并重复读取链），而不是共享 GetVar 引用。

### 2026-08-20 物化实验：复杂链双消费 → 重复求值，物化到变量有效（用户理论实证）

**真实执行性能 = 单次负载 × 次数**。复杂运算链（多节点复合）的输出被 **≥2 处消费**时，
引擎按消费点**重复求值整链**——此时"物化到变量"是真实优化（只付读变量负载）。

- 实验（12-29 vs 12-05 日志）：`turn_block` 的 m1 运动器 vel1 从 `v.vel1`（orbit_velocity 链
  ~40 节点输出，被 store 与 m1 双消费）改为读回 `vels1[piece]`（store 先写入）
- 结果：块事件 **230→216 帧（-14/事件）**，每转动 -56 帧（1589→1533，-3.5%）——证实双消费重复求值
- **判据**：某数据被 ≥2 处消费，且其计算链 ≥10 节点 → 物化（set 后 get 读回）优于直连；
  简单节点（GetVar load=2）双消费 → 物化无收益（负载不变），只影响可读性


## 五、最大优化项目（按三维度排名）

1. **段事件负载（34%）**：`add motion device` 是引擎重操作，代码不能降单帧负载，但可**减少调用次数**——
   orbit2-5 四段（0.2s/段）合并为 2 段（0.4s/段）→ 段事件 16→8/转动，负载省 ~600（-17%）。
   ⚠️ 动画从 5 段速度曲线变 3 段折线，视觉精度取舍，需用户确认。
2. **写法重复（is_solved + apply_move + write_slot）**：纯代码改写，零风险，省 ~44 帧/转动 +
   打乱/自动队列（20 步）再省 ~880 帧逻辑层。
3. **块事件 turn_one（42%）**：速度预计算（orbit_velocity 5 段）是位置相关必要计算，难省；
   位置读取 spin/orbit 各一次可合并（省 ~16 帧/转动，小）。

## 六、编写新复合的负载纪律

1. **循环展开多槽时，变量 get 一次共享**（见 gsts_logic_reset 示范），不要每槽 `getNodeGraphVariable`
2. 高负载节点（运动器/CreatePrefab）避免高频调用：批量动画优先合并段，实体创建优先复用
3. 定时器回调内避免重复计算（每事件重算的前置数据提前到事件外/表数据直接查）
4. 用 `gia_log.py frames --gil <地图>` 的 `load=` 字段量化验证优化前后负载（帧数不变也可能负载下降）
