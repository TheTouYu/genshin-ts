# 复盘：完整游玩日志驱动日志技能进化（2026-08-28 会话 2980 第二轮）

> 范围：用户提供会话 2980 完整游玩日志（480+ 条记录 / 7 个图 / 5 次操作，含全部客户端+服务端节点），
> 用它核验事件线工具并把 debug-log 技能升级到"轻松处理海量日志"——新增操作时间线/聚合视图/服务端模式，
> 未覆盖内容逐一与节点图一对一比对后登记。
> 视角：海量日志的读法（先操作时间线 → 再逐记录事件线/倒查）+ 服务端图的日志闭环 + f8/f3 语义修正。
> 证据：日志 `2026-08-28_23-51-57_2980_110170759.gia`（f3 秒 8..165，客户端记录 rec5/81/165/329/405）、
> 地图 `魔方-客户端优化版本.gil`（SHA f90ac5438c…）；全部结论来自脚本实际输出 + parse-gil-node-graph 回读。
> 状态：已验证（本仓库 CLI 复现）；用户面板逐节点核对未做。
> 关联：retrospective-2026-08-28-client-log-flow.md（事件线工具诞生轮）；
> open-items O-2026-08-28-09 ①已闭合、O-2026-08-28-10 新登记。

## 一、海量日志读法（新主视图）

482 条记录的日志不能逐条 frames——本轮确立三步读法：

1. **`records --summary`**：按图聚合（条数/f8 范围/f21 总量）+ f3 秒范围——7 图一眼看清。
2. **`ops` 操作时间线**：以客户端记录（f8=2097154）为界聚类成 5 次操作，自动解码每次操作的指令码、
   客户端帧数、服务端各图响应条数、转动块 f8 集合、是否含结算。本次输出完整还原用户游玩叙事：
   D(25s) → L(31s) → x(74s 整体旋转) → D(93s) → L(111s，触发结算=还原通关)。
3. **逐记录钻取**：`frames --rec N`（原始）/ `gia_log_flow --rec N [--client]`（事件线）/ `--trace-node`（倒查）。

## 二、f8/f3 语义修正（推翻旧"级别"说）

- **f8 = 记录相关实体的实体索引**：魔方块-旋转每条记录 f8=5..30 ↔ 客户端遍历列表 IN1=[5..30] ↔
  帧内 OUT0:Entity=f8 三向一致；玩家-界面恒 f8=3。旧注"f8=级别 2/3/4"（2602 实验）实为该图相关实体索引。
- **f3 = 会话内已过秒数**（全记录同一时间轴，perf 秒桶依据，不再视为 f22 记录规律）。
- 客户端记录 f8=2097154(0x200002)=客户端图标记；f10=组件定义 ID（8 常规/5 结算合法）。

## 三、服务端模式（O-09-① 闭合）+ 一对一比对闭合

1. **gia_log_flow 服务端模式**：head 首字节=主图节点序号；节点链标注复用 gia_log.py（--gil）；
   双语控制流关键词（Branch/Loop/Signal/Status/Motion/When/Set…）；同节点连续机制帧合并 ×N；
   trace-node 支持主图节点；图解析按 gil mtime 缓存 /tmp。魔方块-旋转 137 帧 → 15 行事件线。
2. **服务端块响应链一对一闭合**：监听信号（=客户端 n115 信号参数）→ Query Unit Status(类型码20)
   → 双分支 → List Iteration Loop×3（Assembly List 三向量 → 3D Vector Rotation → 取整 → Set 写回）
   → 魔方动画=1 → Direction Vector to Rotation → Add Basic Target-Oriented Rotation-Based
   Motion Device（时长=信号 Float）。玩家-界面图也监听该信号（每次操作 1 帧）。
3. **选中状态图 = 运动中魔方块数计数**：When Unit Status Changes → 运动中魔方块数 +1；其 f8 集合
   恒等于转动块集合（面旋转 9 块/整体旋转 26 块）——日志级核验了 ops 聚类正确性。
4. **按钮字典精确映射**：F/B/L/R/U/D=1073741937/1073741938/1073741870/1073741936/1073741939/
   1073741940、x/y/z=1073743064/3065/3066——**修正 PKC claim 的 L 值**（原写 1937~1940 连续）。
5. **新节点/类型码**：When Unit Status Changes(300)/When Global Timer(315)/When Tab Selected(307)/
   Multiple Branches(3)/Activate Tab(306)/Set Player Motion Device(839/837)/List Iteration Loop(509)/
   Get/Set Local Variable(18/19)；类型码 25/26=结构体（局内存档 chip 数据）。

## 四、未闭合项（登记 O-2026-08-28-10，非无视）

- 类型码 25/26 结构体内部字段（需读图 1073741853 或编辑器差分）；
- 服务端循环体级折叠（当前仅机制帧合并 ×N）；有限循环 0d05/0d09 精确语义；
- trace-node 服务端复合 impl 帧参数（当前仅主图节点）；
- 结算合法全局计时器周期/判胜链（读图 1073741854）；
- PKC claim 修正（L=1073741870）待重跑 capture；
- 魔方动画=1 写入方、指令异常空值触发条件、f10 组件定义 ID 完整枚举。

## 五、产出清单

- `scripts/gia_log.py`：新增 `ops` 操作时间线 + `records --summary` 聚合视图。
- `scripts/gia_log_flow.py`：服务端模式（--client 缺省为服务端）、图解析 /tmp 缓存、
  双语控制流关键词、同节点连续帧合并 ×N、trace-node 服务端主图节点、状态查询展示。
- `SKILL.md`：工具链 +2 行、gia_log_flow 双模式描述、完整游玩日志小节、待解问题更新。
- `docs/game-engine-knowledge/debug-log-format.md`：f8/f3 修正 + 完整游玩日志实证节 + 待解更新。
- `docs/maintenance/open-items.md`：O-09 ①闭合标注 + O-2026-08-28-10 六项新登记。
- 验证：ops 5 次操作/records --summary 7 图；服务端 rec18 137 帧→15 行；客户端 rec5 56 行 ×26 折叠
  无回归；trace-node 客户端 n115/服务端 n1 正常；`python3 -m py_compile` 通过。
