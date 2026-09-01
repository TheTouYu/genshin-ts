# 真实足球机制参照库·汇总索引

> 实况系（PES → eFootball）与 FIFA 系（FIFA → EA Sports FC）机制调研汇总，
> 为笼式足球（examples/cage-football/）提供真实度参照。
> 映射三分类：**可还原**（引擎有直接能力）/ **可简化**（无直接能力但有近似通道）/
> **不可还原**（引擎无通道）。判断依据 = DESIGN.md §3 证据表 + engine-rules.md（引擎能力边界，
> 与设计草稿取舍无关）。
> 数值未官方公开的一律标"社区实测"；"未查到"= 查过但无公开数据。

## 汇总表

| 域 | 文档 | 条目数 | 可还原 | 可简化 | 不可还原 |
|----|------|--------|--------|--------|----------|
| R1 操控与输入 | mechanics-controls.md | — | — | — | — |
| R2 球物理 | mechanics-ball-physics.md | — | — | — | — |
| R3 射门/传球/带球 | mechanics-shooting-passing.md | — | — | — | — |
| R4 防守与守门员 | mechanics-defending-goalkeeping.md | — | — | — | — |
| R5 规则与裁判 | mechanics-rules-referee.md | — | — | — | — |
| R6 球员属性 | mechanics-player-attributes.md | — | — | — | — |
| R7 AI 与战术 | mechanics-ai-tactics.md | — | — | — | — |
| R8 呈现与反馈 | mechanics-presentation.md | — | — | — | — |

（各篇完成后回填；细目到各篇的"机制条目"查，编号 M1/M2/… 全库唯一前缀=域号+序号）

## 跨域速查：设计最常用结论

（终审后回填，如"蓄力条满格时长参照 FIFA 射门力量条约 X s"粒度的可引用结论）
