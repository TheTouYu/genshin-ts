# 灯阵（Lights Out 3×3）玩法设计

> 状态：设计完成（2026-08-16）；**最小图 1073741890 v4 动态关卡版已重构落地（2026-08-16，注入层证据，待用户游戏核验——重点验证 def 挂载继承）**；主图 v2 已注入待核验；节点调查为「玩法闭环所需节点族」粒度，非帧级编码
> 来源：官方千星知识库（ugc.070077.xyz）+ 本地权威 `node_pin_records.ts` + 已闭合文档（signals.md / components.md / graph-mounting.md / PROGRESS.md）+ 真实 CLI 验证（地图创建）
> 适用范围：灯阵玩法立项与后续实现（examples/lights-out）
> 设计文档说明：本阶段**不编写真实代码**，仅完成玩法设计、资源清单、最小地图与节点调查闭环；v2/v4 状态为注入层证据，游戏内验证未通过前不作为已验证结论。

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

**胜利判定（最小图已实现，2026-08-16，注入层证据）**：全部 9 灯 lit=true 即胜利。
实现：点击者广播 `win_check(senderPos)` → 每盏 lit=true 的灯回 `win_ack(senderPos)` →
检查者按距离（≤0.1 即本人）累计 winCount 实体变量，==9 → 打印 `lamp-win`（胜利提示）。
后续可升级为选项卡闪烁/胜利特效（P8）。

---

## 2. 资源清单（前期建模）

| 资源 | 用途 | 现状 |
|---|---|---|
| 灯柱L1 prefab 1077936129 | 关卡 1 灯柱（tabBar+basicMotion，def 挂玩法图 1825） | ✅ 已建模（v4） |
| 灯柱L2 prefab 1077936133 | 关卡 2 灯柱（tabBar+basicMotion，def 挂玩法图 1826） | ✅ 已建模（v4） |
| 灯柱L3 prefab 1077936134 | 关卡 3 灯柱（tabBar+basicMotion，def 挂玩法图 1827） | ✅ 已建模（v4） |
| 灯头 prefab 1077936130 | 动态创建的发光灯头（basicMotion——旋转庆祝前置） | ✅ 已建模（v4） |
| 管理台 prefab 1077936131 | 「开始游戏」入口（tabBar+basicMotion） | ✅ 已建模（v4） |
| 引导牌 prefab 1077936132 | 帮助文字（tabBar 选项显示） | ✅ 已建模（v4） |
| 地图 1073741890「灯阵-最小图」 | 玩法地图 | ✅ 已创建（见 §3） |
| 玩法图 1073741825/1826/1827/1828 | 关卡 1/2/3 + 管理图 | ✅ 已注入（73/73/73/123 节点） |

> **v4 动态关卡架构**：地图**只放管理台+引导牌**（观察阶段无关卡）；灯柱由管理台图
> `createPrefab` **动态创建**（每关一组）；灯柱 prefab **def 挂载**对应玩法图（动态实体
> 继承执行 = 待游戏验证的引擎规则，见 §6 能力边界）。

**建模设计（v2 精美版，7 装饰物灯柱 + 3 装饰物灯头）**：
- 灯柱=底座圆柱+台阶+柱身+双金色装饰环+灯罩座+五棱柱半透明暖黄灯罩(opacity45)+顶球，tabBar 半径 1.0/球心 y1.3
- 灯头=暖金发光球+内芯高光+挂环+顶珠；管理台=立柱+金色顶球；引导牌=木牌+石碑底座

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
- [ ] **def 挂载继承 = ✅ 已确认成立（2026-08-16 日志 2723）**：动态灯柱执行玩法图
      （lamp-created 75 次）且 tabBar 生效（lamp-toggle 10 次）——非缺口，用户判断正确。
- [ ] **createPrefab 动态实体的组件继承 = ⚠️ 编译器/工具链缺口（2026-08-16 日志 2723）**：
      prefab def/inst 两侧均有 basicMotion(type 4)，但动态创建的灯头实体未继承 → 85 运动器
      节点执行但 0 停止帧（静默无效）。P4 角块同坑。**已用 workaround：庆祝改管理台旋转
      （静态实体 basicMotion 可靠）+ 灯头 308 闪烁**；缺口如实上报，待工具链补齐
      createPrefab 组件复制规则后恢复灯头旋转。
- [ ] 光源组件 CLI 支持（667 toggleEntityLightSource 前置）——当前 CLI 组件白名单仅
      tabBar/basicMotion/followMotion，光源组件需编辑器配置 → **能力缺口已登记**；
      v4 已用旋转庆祝（basicMotion 修复）替代光源特效。
- [ ] 动态实体上 whenTabIsSelected 触发（U9 变体）——设计已规避（灯头不承载交互）。
- [ ] 胜利判定游戏内表现（已实现 lamp-win + 闪烁/旋转庆祝，待游戏核验）。
- [ ] 单图节点预算（目标 < 2000；关卡图 84 节点/管理图 129 节点，余量充足）。
- [ ] **主地图（外部阻塞）**：1073741889 启动报错——实体 1077936131/132、预置灯头 150-158 位于 y=2000 超出场景生效范围；已交建模子代理处理。**最小图 1073741890 不受此阻塞影响，可独立核验**。
- [ ] 屏幕 UI 控件/铭牌/文本气泡（需编辑器预置 Cfg，CLI 无入口）——当前用 tabBar 选项文字替代（引导/UI 3D 可见方案，游戏核验后评估是否升级）

---

## 7. 下一步（健康节奏，单变量）

当前主线（2026-08-16 主代理更新 + 最小图 v4.1 双 bug 修复落地）：
1. **v4.1 游戏核验（优先）**：①第二关不再提前解锁（计数修复+关卡清理）②通关庆祝可见
   （管理台旋转+灯头闪烁）。按 §8 测试步骤。
2. **日志解析**：核验后按 debug-log-investigator 逐帧核对 `lamp-cleaned`（关卡清理）、
   `win-counting`（计数不再翻倍）、`console-spin`（管理台旋转）、`lamp-celebrate`（闪烁）。
3. **能力缺口反馈（已登记）**：createPrefab 动态实体组件继承缺口（P4 角块同坑），
   workaround 已上线，待工具链补齐后恢复灯头旋转。
4. **主地图**：等建模子代理修复 y=2000 阻塞后，再核验主图 v2。
5. **玩法迭代**：胜利特效反馈、UI 升级等；每批变更落地即更新 PROGRESS.md。

---

## 8. 最小图 v4.1 测试步骤（用户核验指引）

**地图**：灯阵-最小图（1073741890）｜**v4.1**：观察阶段**无关卡** → 点开始动态创建；通关后本关灯柱自清理

| # | 步骤 | 预期行为 |
|---|---|---|
| 1 | 进入地图 | **只见管理台（金色顶球）+ 引导牌**——无任何灯柱（观察阶段交互最少） |
| 2 | 走近引导牌 | 显示帮助文字选项卡：「点击灯柱翻转明暗」「点亮全部灯过关」「通关解锁下一关」 |
| 3 | 点管理台「开始游戏」 | 反馈：**9 座路灯在关卡 1 区域动态出现**（createPrefab 生效） |
| 4 | 走近灯柱 | 出现「切换」选项卡（tabBar 继承） |
| 5 | 点「切换」 | 自身+上下左右邻居点亮（308 暖金光球透过灯罩）；再点翻转 |
| 6 | 点亮全部 9 灯 | 胜利：`lamp-win` + **灯头闪烁庆祝 + 管理台旋转**；**关卡 1 灯柱自清理消失**；第二关 16 路灯动态出现 |
| 7 | 关卡 2（4×4） | **通关前不会解锁第三关**（计数修复）；16 灯全亮 → 胜利 + 庆祝 + 清理；第三关 25 路灯出现 |
| 8 | 关卡 3（5×5） | 25 灯全亮 → 胜利 + 庆祝；日志 `game-clear` |
| 9 | 退出游戏 | 落盘 Beyond_Debug_Log，供逐帧解析 |

**插桩日志速查（v4.1）**：`manager-ready`（管理台就绪）/ `game-start-clicked`（开始）/
`level1/2/3-building`（创建中）/ `level1/2/3-ready`（关卡可玩）/ `level1/2/3-complete`（通关）/
`console-spin`（管理台旋转庆祝）/ `lamp-created`（灯柱创建）/ `lamp-win`（胜利）/
`lamp-celebrate`（灯头闪烁）/ `lamp-cleaned`（灯柱自清理）/ `game-clear`（全通）/
基础链 `lamp-toggle` / `lamp-recv-self-skip` / `lamp-neighbor-toggle` / `lamp-recv-far-skip` /
`win-check-sent` / `win-ack-sent` / `win-counting`（计数应逐次 +1，不再翻倍）。
