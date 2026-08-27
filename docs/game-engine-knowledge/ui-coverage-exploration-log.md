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