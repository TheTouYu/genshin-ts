# 灯阵（Lights Out 3×3）玩法设计

> 状态：设计完成（2026-08-16）；v2 已注入主地图（2026-08-16，待游戏核验）；节点调查为「玩法闭环所需节点族」粒度，非帧级编码
> 来源：官方千星知识库（ugc.070077.xyz）+ 本地权威 `node_pin_records.ts` + 已闭合文档（signals.md / components.md / graph-mounting.md / PROGRESS.md）+ 真实 CLI 验证（地图创建）
> 适用范围：灯阵玩法立项与后续实现（examples/lights-out）
> 设计文档说明：本阶段**不编写真实代码**，仅完成玩法设计、资源清单、最小地图与节点调查闭环；v2 状态为注入层证据，游戏内验证未通过前不作为已验证结论。

---

## 1. 核心玩法

**游戏名**：灯阵（Lights Out 3×3）

**规则**：3×3 共 9 盏灯，初始全灭。点击任一灯，该灯及其**上下左右四邻居**（无邻居则跳过）翻转明暗。目标：将全部 9 盏灯点亮（或全灭，二选一作为胜利判定，建议**全亮**，与"点亮灯阵"直觉一致）。

**输入机制**：实体选项卡（tabBar 组件 + When Tab Is Selected 事件）。每盏灯柱实体挂载同一玩法节点图，点选灯柱的选项卡触发自身翻转与邻居翻转。

**状态存储**：灯柱实体自定义变量（type 1，在位已验证）存 `lit`（bool）与 `head`（灯头实体引用）。已规避图变量 per-instance 隔离风险（U2b 未知项待实现中核验）。

**明暗表现**：308 节点（Activate/Disable Model Display）对灯头实体显隐（U4b 已验证生效）。

**邻居传播**：信号广播（Send Signal 300000 / Monitor Signal 300001）+ 距离判定（Distance Between Two Coordinate Points 244 + 比较节点）。点击时广播 `lamp_toggle(senderPos, hop)`，各灯柱按距离判断自身/邻居/远处（`<=0.1` 自身跳过 / `<=3.0` 邻居翻转 / 其余忽略）。

**v2 参数与阈值（已注入主地图，注入层证据）**：
- 信号 `lamp_toggle(senderPos: vec3, hop: int)` 两参数对齐地图注册（发送恒传 hop=1）；
- 9 灯柱网格间距 2.5（邻居 2.5 / 对角 3.54，阈值 3.0 正确区分）；
- tabBar 半径 1.5 / 球心 y=1.2（修复 v1 radius 0.6 交互零触发）；
- 玩法图 44 节点（v1 为 41）。

**连锁**：只传一层（接收方翻转后不再广播），防止无限扩散。

**胜利判定（待实现阶段闭合）**：全部灯 lit=true → 输出胜利提示（打印字符串 / 选项卡闪烁 / 隐藏胜利）。

---

## 2. 资源清单（前期建模）

| 资源 | 用途 | 现状 |
|---|---|---|
| 灯柱元件 prefab 1077936129 | 9 个灯柱（含 tabBar 组件） | ✅ 已建模（P2 候选回读 14 项全 PASS） |
| 灯头元件 prefab 1077936130 | 动态创建的发光灯头 | ✅ 已建模 |
| 地图 1073741890「灯阵-最小图」 | 玩法空地图（本轮创建） | ✅ 已创建（见 §3） |
| 玩法节点图 1073741825「灯阵玩法」 | 玩法逻辑挂载（占位） | ✅ 已创建占位 |

> 灯柱/灯头元件在**生产地图 1073741889** 已写回；本轮新建的**最小图 1073741890** 为空图，用于玩法设计基线（不含任何实体，避免与生产图混淆）。

**后续阶段待建**（非本轮）：
- 胜利提示装饰物（如全亮后显示的特殊物体/文本）——规划期不建模，等玩法逻辑闭环后按需添加。

---

## 3. 最小地图（本轮已创建）

```text
maps:create --name "灯阵-最小图" --graphs "灯阵玩法"
```

**创建结果（CLI 回显 + maps 列表双重验证）**：

| 项 | 值 |
|---|---|
| 地图 ID | 1073741890「灯阵-最小图」 |
| .gil 路径 | `/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741890.gil` |
| 初始 SHA-256 | `1361fb267d265d8d62fa4f103687dd72b3f4ceafd93d073ecd6743d3bb63bf6d` |
| size | 163 |
| 占位图 | 1073741825「灯阵玩法」（新图自动分配，从 1073741825 起） |
| Temp 双写 | ✅ `Temp/1073741890.gil`（编辑器可见） |

> 验证层级：✅ CLI 回显 + `gsts maps` 列表确认；❌ 未做游戏内打开验证（空图无需进游戏，待后续玩法注入时统一核验）。

---

## 4. 官方节点调查（玩法闭环所需节点族）

调查来源分层：
- **官方知识库**（ugc.070077.xyz 千星沙箱）：选项卡、信号、显隐、变量、打印、创建事件等节点语义与归属端（服务端）。
- **本地权威** `src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.ts`：真实节点 ID 与引脚。
- **已闭合文档**：signals.md（发送/监听骨架）、components.md（tabBar 事件与 payload）、graph-mounting.md（挂载执行前提）。

### 4.1 事件节点（入口）

| 节点 | ID | 引脚 | 用途 | 来源 |
|---|---|---|---|---|
| When Entity Is Created | 71 | OUT: Ety, Gid | 灯柱创建 → 动态创建灯头 + 初始化 lit/head | 官方+本地 |
| When Tab Is Selected | 307 | OUT: Ety, Gid, Int(tabId), Ety(选择者), Gid | 点选灯柱选项卡 → 翻转 | 官方+本地 |
| Monitor Signal | 300001 | IN: Str(信号名); OUT: Ety, Gid, Ety | 监听 `lamp_toggle` 邻居广播 | 官方+本地 |
| Get Self Entity | 73 | OUT: Ety | 获取挂载实体自身 | 本地 |

### 4.2 执行/操作节点

| 节点 | ID | 引脚 | 用途 | 来源 |
|---|---|---|---|---|
| Create Prefab | 252 | IN: Pfb, Vec(位置), Vec(旋转), Ety(父), Ety, Bol, Int, L<Int>; OUT: Ety | 动态创建灯头 | 本地 |
| Activate/Disable Model Display | 308 | IN: Ety, Bol | 灯头显隐（明暗） | 官方+本地（U4b 已验证） |
| Set Custom Variable | 22 | IN: Ety, Str, R<T>, Unk, Bol | 写 lit/head | 官方+本地 |
| Send Signal | 300000 | IN: Str | 广播 `lamp_toggle(senderPos, hop)` | 官方+本地 |
| Activate/Disable Tab | 306 | IN: Ety, Int, Bol | （可选）胜利后禁用选项卡 | 官方+本地 |
| Print String | 1 | IN: Str | 日志插桩 | 官方+本地 |

### 4.3 查询/计算节点

| 节点 | ID | 引脚 | 用途 | 来源 |
|---|---|---|---|---|
| Get Custom Variable | 50 | IN: Ety, Str; OUT: R<T> | 读 lit/head | 官方+本地 |
| Get Entity Location and Rotation | 99 | IN: Ety; OUT: Vec(位置), Vec(旋转) | 取灯柱位置（广播/距离判定） | 官方+本地 |
| Distance Between Two Coordinate Points | 244 | IN: Vec, Vec; OUT: Flt | 邻居判定 | 本地 |
| Equal | 14 | IN: R<T>, R<T>; OUT: Bol | lit 状态比较 | 本地 |
| Less Than or Equal To | 231 | IN: R<T>, R<T>; OUT: Bol | 距离阈值（0.1 自身 / 3.0 邻居，v2） | 本地 |
| Double Branch | 2 | IN: Bol | 三态分支（自身/邻居/远处） | 本地 |

### 4.4 图变量（备用，规避 per-instance 隔离风险）

| 节点 | ID | 引脚 | 用途 | 来源 |
|---|---|---|---|---|
| Get Node Graph Variable | 337 | IN: Str; OUT: R<T> | （当前未用，U2b 未闭合前规避） | 本地 |
| Set Node Graph Variable | 323 | IN: Str, R<T>, Bol | （同上） | 本地 |

### 4.5 组件前置依赖（关键，来自已闭合经验）

| 组件 | 说明 | 来源 |
|---|---|---|
| tabBar | 灯柱实体必须配置 tabBar 组件（regionName / options；regionType `box|sphere` + regionSize/regionRadius/regionCenter）。**无组件则无选项显示、不触发选中事件**。tabId 从 1 开始 | components.md |
| basicMotion | 运动类节点（如旋转运动器）要求实体带基础运动器组件，否则节点执行报错 | game-from-scratch 技能 P4 实证 |

> ✅ **半径问题（v1 卡点）已修复（v2，注入层证据）**：v1 radius=0.6 太小导致交互零触发（日志 2026-08-15_17-54-13_2704 已解析）；v2 已改为 tabBar 半径 1.5 / 球心 y=1.2 + 灯柱间距 2.5，**已注入主地图 1073741889**。游戏内点击是否触发待启动报错修复后统一核验（不得以注入成功冒充游戏验证）。

### 4.6 信号注册（send/monitor/server 三份 identity）

信号必须先在地图注册（`assets:signals register`），不能直接写节点：
- 注册定义含 sendId / monitorId / serverId、参数名、类型与 pinIndex，必须从当前 GIL 注册定义读取。
- 发送节点绑定后：genericId = concreteId = 当前注册信号的 sendId，kind=SysGraph，signalVersion=1，信号名 pin 必须存在。
- 本玩法信号：`lamp_toggle(senderPos: vec3, hop: int)`（v2 两参数，发送恒传 hop=1）。
- v2 信号规范布局修复：`assets:signals` repair 重建注册表条目（pinIndex 68/76/83），发送/监听节点按注册定义绑定。

来源：signals.md（已验证 2026-08-05）。

---

## 5. 节点→玩法目标映射（闭环自检）

| 玩法目标 | 节点链 | 闭环状态 |
|---|---|---|
| 灯柱创建初始化 | 71 → 73 → 252(建灯头) → 22(存 head/lit) → 308(隐藏) | ✅ 全节点已确认 |
| 点击翻转自身 | 307 → 50(读 lit) → 14(比较) → 2(分支) → 22 + 308 | ✅ 全节点已确认 |
| 广播位置 | 307 → 99(取位置) → 300000(lamp_toggle, senderPos+hop=1) | ✅ 全节点已确认 |
| 邻居翻转 | 300001 → 99 → 244(距离) → 231/14(阈值 0.1/3.0) → 2(三态) → 22 + 308 | ✅ 全节点已确认 |
| 胜利判定 | （待实现阶段设计：全部 lit=true → 提示） | ⬜ 待玩法逻辑阶段闭合 |

**结论**：灯阵玩法闭环所需的全部节点族（事件 4 个、操作 6 个、查询/计算 6 个、图变量 2 个、组件 2 类）均已从官方知识库 + 本地权威记录确认存在且引脚匹配，**无未知名节点**。剩余未知项集中在**引擎行为**（见 §6），不阻塞玩法设计。

---

## 6. 待闭合未知（实现阶段核验，不阻塞设计）

- [ ] **U2b** 图变量 per-instance 隔离——已用实体自定义变量规避；如需图变量再做差分核验。
- [ ] **U12** getSelfEntity（73）在挂载上下文返回挂载实体——v2 已按此假设编写，待游戏日志核验。
- [ ] createPrefab 动态实体继承 tabBar/basicMotion 组件（basicMotion 继承已验证）。
- [ ] 动态实体上 whenTabIsSelected 触发（U9 变体）——设计已规避（灯头不承载交互）。
- [ ] 胜利判定实现细节（全亮检测 + 提示方式）——P8 事项。
- [ ] 单图节点预算（目标 < 2000；v2 为 44 节点，余量充足）。
- [ ] **当前阻塞（外部）**：主地图 1073741889 启动报错——实体 1077936131/132、预置灯头 150-158 位于 y=2000 超出场景生效范围；已交建模子代理处理，方案确认后写回。此阻塞解除前不推进游戏核验。

---

## 7. 下一步（健康节奏，单变量）

当前主线（2026-08-16 主代理更新）：
1. **等启动报错修复**：主地图 1073741889 启动报错（实体 1077936131/132、预置灯头 150-158 在 y=2000 超出场景生效范围）——建模子代理处理中，方案确认后写回。
2. **游戏核验**：启动报错修复后，用户进游戏点亮一次，核验 tabBar 交互（radius 1.5）与玩法 v2 行为。
3. **日志解析**：核验通过后按 debug-log-investigator 流程解析 Beyond_Debug_Log，逐帧核对 `lamp-toggle` / `lamp-recv-self-skip` / `lamp-neighbor-toggle` / `lamp-recv-far-skip` 插桩与距离判定。
4. **玩法迭代**：胜利判定等 P8 事项；每批变更落地即更新 PROGRESS.md + 相关知识文档。
