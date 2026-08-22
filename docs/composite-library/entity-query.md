# 资源包 4：实体查询/遍历包（entity-query）

> 状态：当前推荐
> 来源：真实 GIA 资源包「常用复合节点大全 v1.7」逆向整理
> 最近校验：2026-08-22
> 适用范围：千星沙箱服务端节点图；遍历是节点图最常用操作

## 用途

按元件/范围查询实体、列表迭代、玩家/角色列表获取。遍历是节点图里最常用的操作。

## 节点清单

| 复合 ID | 功能 | 内部节点 | 关键点 |
|---|---|---|---|
| 1073741839 | 查场上指定元件的实体列表 | Get All Entities on the Field → Get Entity List by Specified Prefab ID → Get List Length | 全量检索 |
| 1073741835 | 遍历场上某元件对应实体 | Get Entity With Specified Prefab ID → Finite Loop → 取值 | 有限循环遍历 |
| 1073741831 | 范围内指定元件实体列表 | 中心点三选一 + Get Entity List by Specified Range | 范围筛选 |
| 1073741830 | 范围内指定元件实体迭代 | 1073741831 + List Iteration Loop | 范围+迭代 |
| 1073741860 | 范围内玩家列表 | 中心点三选一 + Get Entity List by Specified Range | 范围筛玩家 |
| 1073741837 | 场上角色列表迭代 | Get List of Player → Get All Character Entities → 取值 | 玩家→角色 |
| 1073741842 | 场上玩家列表迭代 | List Iteration Loop + Get List of Player | 玩家迭代 |
| 1073741845 | 玩家序号→玩家/角色实体 | 玩家列表 + 角色列表 + 取值 | 序号转实体 |

## 通用方法论（提炼）

1. **「查列表 → 遍历 → 取值」是遍历的标准三段式**：先 `Get Entity List by Specified Prefab ID`（或 `Get All Entities`）拿列表，再 `List Iteration Loop`（或 `Finite Loop`）遍历，循环体内 `Get Corresponding Value From List` 取当前元素。**这是节点图里「for 循环」的等价物**。
2. **两种循环：List Iteration Loop vs Finite Loop**：`List Iteration Loop` 直接遍历列表（自动处理索引）；`Finite Loop` 是「循环 N 次 + 手动取值」（需要 `Get List Length` + `Get Corresponding Value From List`）。**前者更简洁，后者更灵活**（可在循环内改列表）。
3. **中心点三选一是范围查询的通用模式**：作者在多个范围查询节点里都用「1、直接获取位置；2、预设点获取；3、查询实体位置」三种方式提供中心点。**范围查询 = 中心点 + 半径 + 元件 ID**。
4. **玩家序号 ≠ 列表索引**：作者在 1073741845 注释里明确「玩家序号从 1 开始，但玩家实体列表从 0 开始」——**玩家序号要 -1 才是列表索引**。这是多人玩法的经典坑。
5. **玩家→角色是两级关系**：`Get List of Player Entities` 拿玩家，`Get All Character Entities of Specified Player` 拿该玩家的角色。**玩家实体和角色实体是不同概念**，很多玩法要区分。

## 复用提示

- 「查列表 → 遍历 → 取值」三段式是最通用的模板，几乎每个涉及多实体的玩法都要用。
- 范围查询的「中心点三选一」模式值得直接抄——它把「中心点从哪来」这个常见需求抽象成了可配置输入。
- 玩家序号 -1 的坑要牢记，否则会取错玩家。
