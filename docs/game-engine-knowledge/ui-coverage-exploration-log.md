# UI 能力覆盖探索登记本

> 状态：持续更新（每探索完一个典型样本登记一条，按时间倒序）
> 目的：登记每个样本探索的「做得好 / 覆盖 / 缺陷 / 不清楚」，驱动覆盖率提升与流程优化
> 方法：先手选典型样本逐个完整探索（容错高）→ 试点成熟后写批量脚本覆盖 → 对异常点单独探索
> 评估基准：[能力覆盖全景](../capability-coverage-map.md)（官方指南 A/B/C/D/E 五构成块 + 联动；20 控件类型清单）

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
