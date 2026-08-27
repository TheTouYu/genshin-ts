# UI 能力覆盖探索登记本

> 状态：持续更新（每探索完一个典型样本登记一条，按时间倒序）
> 目的：登记每个样本探索的「做得好 / 覆盖 / 缺陷 / 不清楚」，驱动覆盖率提升与流程优化
> 方法：先手选典型样本逐个完整探索（容错高）→ 试点成熟后写批量脚本覆盖 → 对异常点单独探索
> 评估基准：[能力覆盖全景](../capability-coverage-map.md)（官方指南 A/B/C/D/E 五构成块 + 联动；20 控件类型清单）

## 探索 SOP（3 样本固化，2026-08-27）

- **.gil 关卡**：list-gil-node-graphs（图全景）→ assets:ui list --gil（UI 记录）→ wire-inspect --type 13/55/42（结构定位）→ explain 关键图 → 触发 ID 回查
- **.gia 资产**：inventory-gia-units（单元盘点）→ parse-gia-graphs --summary（图节点聚合）→ wire-inspect --find（记录定点）
- **工具**：tools/wire-inspect.ts（通用 wire 检查：--list/--type/--find/--packed）| tools/parse-gia-graphs.ts（.gia 图节点）| tools/inventory-gia-units.ts（.gia 单元盘点）
- 每样本登记五栏：做得好 / 覆盖 / 缺陷 / 不清楚 / 流程优化

## 登记条目

---

### 样本1：1073741910「推箱子」关卡（2026-08-27）

- 性质：127 张节点图的完整双人合作解谜关卡（推箱子/机关/存档/引导/成就/结算/DLC）
- 探索方式：list-gil-node-graphs 全景 → assets:ui list 构成 → python wire 找 type13/t42 记录 → explain 关键 UI 图（玩家1/2发言、存档点按键）→ 触发 ID 回查

**做得好（可复用的模式）**：
1. 事件 case = 素材组子记录 ID（按钮素材组直接作为事件分派值）——修正了「事件 case=模板 ID」的猜测
2. 三大交互模式：临时提示(Activate→定时器→Remove) / 多按钮一图分派(Multiple Branches) / 双人同步(双玩家 GUID 都操作)
3. 字符串 case：定时器事件的 Multiple Branches 用定时器名分派，可批量清理多个提示组
4. 一个控件组模板承载多按钮（存档点=传送、切换视角=切镜头），同一图多事件入口分工
5. 自定义布局「开场」真实在用（switchCurrentInterfaceLayout 场景）

**覆盖（现有能力已支持）**：
- DSL 全有：whenUiControlGroupIsTriggered / activateUiControlGroupInControlGroupLibrary / removeInterfaceControlGroupFromControlGroupLibrary / multipleBranches / switchMainCamera / teleport / setCustomVariable / 定时器
- assets:ui list 完整列出 30 模板 + 2 布局 + 所有素材组子记录
- assets:mounts list 能列 127 图挂载

**缺陷（登记，需补能力）**：
- 缺陷1：CLI 无法识别「素材组子记录 = 可点击按钮」语义——list 输出看不出哪些素材组是按钮（t22/t25 组合特征？）
- 缺陷2：f505[22] 组件子类型未知（快捷语言面板子记录里出现，疑似图标/图片变体）
- 缺陷3：assets:ui list --format json 在超大关卡（222 记录）上性能未知（未测）

**不清楚（待探索）**：
- 可点击素材组与普通素材组的 wire 差异（哪个字段标记可点击？t22？）——需编辑器最小差分
- 「观察周围！」是官方预制控件混入素材组面板，官方控件作为按钮的事件语义
- UI 事件图挂载实体细节（玩家图挂哪：玩家实体/角色定义？mounts 未逐项核）
- 字符串 case 与整数 case 混用的编码细节（Multiple Branches 输入类型切换）
- 快捷键面板的隐藏/显示机制（开场布局→快捷语言切换？）

**流程优化（下次探索先做）**：
- 先 python 扫 type13/t42 标记再决定 explain 哪张图，比逐张 explain 高效
- 事件 case 值直接用 python 回查 ui list，步骤已固化（ID → 记录 → 语义）
---

### 样本2：千星音乐播放器元件版 V1.1.0.gia（2026-08-27）

- 性质：悬浮交互页音乐播放器完整资产（466 单元：18 MP-* 复合定义 + 21 节点图 + MP-播放器控件模板 + MP-玩家模板元件 + 406 素材组）
- 探索方式：inventory 盘点 → 自写 .gia 图解析器（wire 遍历 f13 → protobufjs 解 NodeGraph → vendor NODE_PIN_RECORDS 映射节点名）→ 聚合节点类型

**做得好（可复用模式）**：
1. 悬浮页播放器 = 复合节点模块化（MP-实体相等/获取交互项索引/切换BGM/监听交互项/选择上下曲等 18 个）+ 一张 159 节点主图（MP-悬浮交互页）+ 大控件模板树（MP-播放器 related=143）
2. 主图节点构成：Show Floating Interaction Page(828)、When Custom Variable Changes ×3、When Timer Is Triggered、Multiple Branches、Assembly List/Set List Value/Query Dictionary、Data Type Conversion —— **变量驱动 + 定时器 + 结构体数据**组合
3. 元件模板（MP-玩家模板，which=18）作为播放器宿主，控件树挂在模板下
4. 信号协作：监听信号/向服务器节点图发送信号（2 组），跨图/跨服务通信
5. DSL 的 showFloatingInteractionPage 与真实节点 con=828 直接对上（DSL→真实节点映射可验证）

**覆盖（现有能力已支持）**：
- DSL：showFloatingInteractionPage / 自定义变量 / 列表字典 / 定时器 / 复合节点 全有
- 结构体：拼装/拆分/修改（assets 无，DSL 复合有？需确认——这是 C 体系结构体的高级用法）
- 信号注册：assets:signals 支持

**缺陷（登记）**：
- 缺陷4：.gia 图内容此前无法读（explain 只认 .gil）——本轮自写 tmp-parse-gia-graphs.ts 验证可行，可转正为 tools/ 工具（试点成功，符合批量覆盖前置）
- 缺陷5：genericId 无名节点=自定义复合（concreteId 即复合实例 ID），需结合 f14 复合定义才能映射到 MP-* 名——当前解析器只显示 ???(id)，后续可接 compositeDef 名

**不清楚（待探索）**：
- MP-播放器模板 143 related 的内部控件树明细（按钮/页签/文本/图片各多少）
- MP-玩家模板元件（which=18）的 wire 结构（元件 vs 角色模板的区别）
- 音乐数据存储（MP-数据库 164KB 复合定义——数据库怎么组织：dict？list？）
- 隐藏/显示播放器的触发链路（哪个按钮 → showFloatingInteractionPage）

**流程优化（下次先做）**：
- .gia 图解析器已验证，转正 tools/ 工具；批量覆盖阶段直接用它扫全部资产
- 控件模板 related=143 表示大控件树——先看 f19 再定深入深度

---

### 样本3：UGC对话框模板——元件版（经典模式资产）.gia（2026-08-27）

- 性质：完整对话系统资产（373 单元/93 图：流程控制器+渲染器双主图 + 30+ 对话复合 + 大量发送信号）
- 探索方式：inventory 概览 → parse-gia-graphs --summary 聚合两张主图节点构成

**做得好（可复用模式）**：
1. 对话系统 = 复合深度模块化：CreateDialogue(7)/DialogueRenderer/获得自身拥有者实体(19)/切换对话类型/角色限位/推进下一句话 等
2. **UI 注册表模式**：RegistryUI/RegisterdUIOpen/RegisterdUIHide/UnregistryUI/UnregisterdAllUI 复合封装「UI 实例注册-打开-关闭-注销」生命周期
3. **按控件名操作**：PRIVATE_根据控件名激活控件/移除控件 —— UI 操作支持控件名(字符串)引用，不只有 ID（对 CLI：list 输出 name 的用途 +1）
4. 隐藏/显示官方 UI：HideNormalUI/ShowNormalUI 复合（对话时隐藏默认布局?）
5. 主图 224 节点：变量(Get/Set ×45 + 节点图变量 12) + 复合调用(30+) + 判断(Equal/String.Equals/List Includes/Query Dictionary) + Activate/Remove 控件组(开合对话框) —— 变量驱动 + 复合 + UI 开关三合一
6. FadeController（淡入淡出复合）+ ContentHexTween（文本 Hex 色 tween）+ Delay + 开启定时器 —— 表现层复合

**覆盖（现有能力已支持）**：
- DSL：自定义变量/节点图变量/Activate&Remove控件组/Set UI Control Status/列表字典/定时器/信号
- CLI：assets:signals 注册（该资产大量发送信号节点）、assets:ui 控件组开关链路

**缺陷（登记）**：
- 缺陷6：99% 的"发送信号/监听信号"复合（which=14）如何注册到目标地图——大量信号名需要批量注册流程（当前 assets:signals register 单条）
- 缺陷7：UI 按控件名操作（根据控件名激活/移除）的真实节点名未在 vendor 映射（PRIVATE_ 前缀）——需要确认系统节点还是复合内实现（dsl: 按名操作节点是否存在？）

**不清楚（待探索）**：
- 对话数据流：对话实例（which=1 复合定义）里存什么（文本/选项/分支）
- HideNormalUI/ShowNormalUI 具体隐藏哪些官方 UI（默认布局控件？）
- 渲染器 Set UI Control (Group) Status 的操作对象（对话框文本框？）

**流程优化（下次先做）**：
- 对 which=14（发送信号/监听信号）复合：区分"信号节点"与"复合封装"，批量信号注册是这类资产的共性需求
- 登记样本时先跑全资产 --summary 聚合（几秒），再挑 1-2 张主图深究

---

### 样本4：教程UI系统_多级切换.gia（2026-08-27）

- 性质：多级教程 UI 系统（922 单元：主图 214 节点 + 打开教程入口图 + 控件模板 related=735 巨型控件树 + 教程角落素材容器）
- 探索方式：SOP 全流程（inventory → parse-gia-graphs --summary/明细 → DSL 支持确认）——工具就绪后显著加快

**做得好（可复用模式）**：
1. **教程多级切换 = Update Floating Interaction Page List Data ×15**：主图以「悬浮页列表数据更新」为核心驱动多级教程内容；配合 Show Floating Page ×2 / Close ×1 / When Floating Interaction Page is Triggered 完成开-切-关闭环
2. **新事件 When Tab Is Selected（页签选中触发，con=307）**：教程打开入口——页签点击进节点图，DSL whenTabIsSelected 已支持（events.ts:278）
3. 商业级图数据操作：节点图变量 Get/Set ×62、Assembly List ×43、列表运算（长度/最大/最小/搜索/有限循环/List Iteration Loop）、字典 ×7
4. 教程进度用节点图变量记录（43+19 读写 + When Node Graph Variable Changes 事件）

**覆盖（现有能力已支持）**：
- DSL：whenTabIsSelected / show+close+updateFloatingInteractionPage / 列表字典 / 变量
- CLI：assets:ui floating-page 骨架 + variables list（富版待做——该资产证明列表更新是真实商业需求）

**缺陷（登记）**：
- 缺陷8：控件模板 related=735 巨型控件树——CLI list 性能/输出格式未针对这种规模验证（922 单元对应 735 子记录）
- 缺陷9：Assembly List ×43 + Update List Data ×15 的组合模式 = 「列表内容定义 → 批量推送」——CLI 若支持"列表数据模板"会大幅简化此类资产复刻

**不清楚（待探索）**：
- 打开教程入口图里 1073741826（复合）的具体作用（Multiple Branches case 分支后调什么）
- When Tab Is Selected 的 payload 参数（哪个页签/列表索引）——events-payload 可查但未细读
- 教程节点图挂载对象（[玩家]前缀 → 玩家图？）

**流程优化（已验证 SOP 提速）**：
- .gia 资产现在 3 步出结论（inventory → parse-gia-graphs → DSL grep），无需手写脚本
