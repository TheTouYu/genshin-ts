# 资源包 2：随机工具包（random-tools）

> 状态：当前推荐
> 来源：真实 GIA 资源包「常用复合节点大全 v1.7」逆向整理
> 最近校验：2026-08-22
> 适用范围：千星沙箱服务端节点图；概率玩法基础件

## 用途

概率玩法的各种随机：随机判定（按概率出布尔）、加权随机、范围内随机点、随机玩家、随机分支。

## 节点清单

| 复合 ID | 功能 | 内部节点 | 关键点 |
|---|---|---|---|
| 1073741826 | 随机判定（按概率出布尔） | Get Random Integer/Float → Less Than or Equal To | 概率精度可切换（int/float） |
| 1073741861 | 加权随机 | Weighted Random + Assembly List | 输入=各权重，总权重和=100 |
| 1073741825 | 范围内随机点（正方体） | 随机×4 + Create 3D Vector + 3D Vector Addition | 中心点三种来源 |
| 1073741838 | 随机玩家 | Get List of Player → Get List Length → Get Random Integer → Get Corresponding Value | 输出一个随机玩家实体 |
| 1610612745 | 随机分支（少分支） | Get Random Integer → Multiple Branches | 每次调用随机值不同 |
| 1610612744 | 随机分支（多分支） | Get Random Integer → Multiple Branches ×2 | 21 个输出 pin |

## 通用方法论（提炼）

1. **随机判定 = 随机数 + 比较**：`Get Random Integer/Float` 输出一个随机值，再用 `Less Than or Equal To` 与「判定成功概率」比较，得到布尔。**概率精度由随机数类型决定**（int 是离散档位，float 是连续概率）——作者注释「可通过更改输入源切换概率精度」。
2. **加权随机用专用节点**：`Weighted Random` + `Assembly List`（权重列表），总权重和=100。**不要自己用随机数+多分支模拟加权**，专用节点更省且语义清晰。
3. **范围内随机点 = 各轴独立随机 + 组合**：X/Z 轴在上下限内随机、Y 轴随机，再 `Create 3D Vector` 组合。**中心点有三种来源**（手动输入参考点 / 预设点位置 / 实体位置），作者用 `Query Preset Point Position Rotation` + `Query Entity by GUID` + `Get Entity Location and Rotation` 三选一。
4. **随机玩家 = 随机索引 + 列表取值**：`Get List Length` 拿长度 → `Get Random Integer` 拿随机索引 → `Get Corresponding Value From List` 取值。**这是「从列表随机取一个」的通用模板**，适用于任何列表。
5. **随机分支 = 随机数 + Multiple Branches**：作者明确警告「每次调用的随机值不同；如果需要结果相同，建议用变量存储」——**随机值是一次性的，要复用必须先存变量**。

## 复用提示

- 「从列表随机取一个」模板（随机索引 + 取值）是最通用的，可套用到任意列表（玩家/实体/元件/…）。
- 随机分支的「随机值存变量」是重要陷阱：`Multiple Branches` 的输入随机值如果被多处引用，每次求值都不同，会导致分支不一致。
