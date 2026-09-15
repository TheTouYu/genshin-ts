# 维度归纳（T03 产出）

> 输入：40 个源 / **822 条知识条目**（8 个子代理按 `extract/_SPEC.md` 精读）
> 数据：`aggregate.json`（全量结构化条目）｜脚本：`scripts/aggregate.py` + `scripts/induct.py`

## 一、结论：D 骨架装不下 48% 的知识

| 族 | 条数 | 占比 | 含义 |
|---|---|---|---|
| D（骨架 7 维） | 429 | 52% | 官方目录能装下的功能知识 |
| D-refine（骨架细化） | 159 | 19% | 骨架太粗，语料自发生成的实/现子域 |
| **K（优质度面）** | 234 | 28% | **官方目录里没有，但决定游戏好不好** |

**判据**：子代理按 `_SPEC.md` 规定，只有当 D 骨架确实不合适时才自拟维度加 ⊕。
结果 58 个 ⊕ 维、393 条（48%）装不进骨架 —— 这印证了「维度要从语料长出来」而非预设。

## 二、K 轴 · 优质度面（**本图谱的学习重点**）

> 这些维度官方文档不写（它只讲功能有什么），但决定玩家会不会玩、会不会留下。

| K 轴 | 条数 | 源数 | 讲它的源 |
|---|---|---|---|
| **K1 选题与赛道** | 50 | 10 | BV11d6rB4Ejc, BV18ARnBVEZP, BV18Ken6bEwT, BV1FaC3BVEdZ, BV1JCY36EEax… |
| **K2 引导与上手** | 33 | 10 | BV11d6rB4Ejc, BV16mJH6EEBE, BV18Ken6bEwT, BV19ab76LE6c, BV1FaC3BVEdZ… |
| **K3 难度与关卡** | 32 | 8 | BV143U7BUEbD, BV16mJH6EEBE, BV18Ken6bEwT, BV1Gj1jB1EQf, BV1L6416oER1… |
| **K4 玩家心理** | 16 | 8 | BV11d6rB4Ejc, BV18ARnBVEZP, BV19ab76LE6c, BV1JCY36EEax, BV1L6416oER1… |
| **K5 数据与迭代** | 17 | 3 | BV1PXrpBrEYk, BV1d1UYB6EtS, BV1ehYGzxEJe |
| **K6 平台与生态** | 57 | 15 | BV18ARnBVEZP, BV18Ken6bEwT, BV19ab76LE6c, BV1FaC3BVEdZ, BV1Gj1jB1EQf… |
| **K7 团队与项目管理** | 20 | 5 | BV18ARnBVEZP, BV19ab76LE6c, BV1ehYGzxEJe, BV1h1qeBgEnt, BV1s6LB6WEF4 |
| **K8 质量保证** | 9 | 1 | BV19ab76LE6c |

## 三、D-refine · 骨架细化（语料自发产生的实现子域）

> 这些不是新族，是 D 骨架太粗 —— 官方目录把「模型拼装」「打表映射」「执行流语义」这类有独立技法的子域平铺成了一个大章节，实际需要独立成篇。

| 细化子域 | 条数 | 源数 |
|---|---|---|
| D2（+模型拼装） | 18 | 1 |
| D3（+客户端算力） | 18 | 1 |
| D2（+实体UI） | 10 | 2 |
| D7（+性能负载） | 10 | 1 |
| D3（+程序架构） | 10 | 1 |
| D3（+架构设计） | 8 | 1 |
| D3（+技能插件化） | 6 | 1 |
| D7（+引擎边界） | 6 | 1 |
| D3（+打表映射） | 6 | 1 |
| D7（+性能与负载） | 6 | 2 |
| D2（+运镜演出） | 5 | 1 |
| D3（+物理约束） | 5 | 1 |
| D7（+能力边界） | 5 | 1 |
| D2（+关卡基建） | 5 | 1 |
| D2（+场景美术） | 5 | 1 |
| D3（+执行流语义） | 5 | 1 |
| D7（+多端适配） | 4 | 1 |
| D7（+AI协作） | 4 | 1 |
| D5（+UI框架） | 4 | 1 |
| D7（+引擎天花板） | 3 | 2 |
| D7（+负载与开发机） | 3 | 2 |
| D3（+客户端通信） | 3 | 1 |
| D3（+数据同步） | 3 | 1 |
| D2（+存档与养成） | 2 | 1 |
| D2（+素材平替） | 2 | 1 |
| D2（+场景还原） | 2 | 1 |
| D5（+UI 动效） | 1 | 1 |

## 四、D 骨架覆盖

| D 域 | 条数 | 源数 |
|---|---|---|
| D0 元知识 | 35 | 18 |
| D1 概念模型 | 28 | 4 |
| D2 编辑器资产 | 70 | 14 |
| D3 逻辑编写 | 127 | 20 |
| D4 玩法系统 | 69 | 24 |
| D5 表现层 | 52 | 15 |
| D7 工程化工具链 | 48 | 11 |

## 五、证据等级分布

| 等级 | 条数 | 判据 |
|---|---|---|
| 实测 | 301 | 有人真做过并给出数据/现象 |
| 硬规则 | 221 | 官方文档/引擎事实 |
| 个人经验 | 220 | 单一讲师主观（**引用时须标注**） |
| 经验共识 | 80 | 多来源同说 |

## 六、章节分布

| 章节 | 条数 |
|---|---|
| 规则与机制 | 351 |
| 做法与技巧 | 268 |
| 设计经验与教训 | 203 |

## 七、逐源条目数

| BV | 条目 | | BV | 条目 |
|---|---|---|---|
| BV1K4tH6GE4k | 108 | | BV1h1qeBgEnt | 14 |
| BV1uUJCzMEfs | 66 | | BV1WXY96GETB | 13 |
| BV1ehYGzxEJe | 55 | | BV1RESoBgEoA | 12 |
| BV1qdrTBpEQw | 43 | | BV1dNkDBgEUn | 12 |
| BV19ab76LE6c | 40 | | BV1mLMr6QESr | 12 |
| BV1oaDrBuE11 | 33 | | BV1qkYa6zEVP | 12 |
| BV1UCxWzhEcx | 28 | | BV1SgqPBQEpM | 11 |
| BV1s6LB6WEF4 | 27 | | BV16mJH6EEBE | 10 |
| BV1ZAnGzhEVS | 25 | | BV1FksrzAEo7 | 10 |
| BV1PXrpBrEYk | 24 | | BV1L6416oER1 | 10 |
| BV1Uq6vBLEJP | 24 | | BV1t8xPzzE4b | 10 |
| BV164CEBfE1L | 23 | | BV1MVYj65EoV | 9 |
| BV1xFu26AER3 | 23 | | BV1d1UYB6EtS | 9 |
| BV18Ken6bEwT | 21 | | BV18ARnBVEZP | 7 |
| BV11d6rB4Ejc | 20 | | BV1eoJJ6eEUR | 7 |
| BV1NWYE6LEDz | 19 | | BV1FaC3BVEdZ | 6 |
| BV1JCY36EEax | 17 | | BV1p9SJBQEBA | 6 |
| BV1Gj1jB1EQf | 16 | | BV143U7BUEbD | 5 |
| BV1Zy4JzMEvT | 16 | | BV1PWFAzeEpN | 3 |
| BV1CL3d6fEZJ | 15 | | BV1JwiwB4EPd | 1 |
