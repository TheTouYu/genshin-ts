# examples/ 演示项目路由（探索本目录时自动注入）

每个子目录是独立 demo（自带配置与进度文档）。**进入子目录前先按下表定位；
进入后先读该目录 AGENTS.md（若有）与 PROGRESS.md，再动手。**

| 目录 | 定位 | 状态 | 入口 |
| --- | --- | --- | --- |
| football/ | 真实物理足球（主线） | 活跃 | AGENTS.md（含不变量清单+看板指针） |
| rubik-3x3/ | 3×3 魔方自动还原主线 | 活跃 | AGENTS.md、PROGRESS.md |
| rubik-game/ | 魔方残局挑战游戏化（1899 donor 复制） | 活跃 | PROGRESS.md（设计=根 .scratch/rubik-game/RG-DESIGN.md） |
| rubik-3x3-client/ | 魔方客户端计算改造（3x3 复制） | 活跃 | AGENTS.md |
| cage-football/ | 笼式足球实验 | 活跃（实验） | CONTEXT.md、DESIGN.md |
| rubik-2x2/ | 2×2 魔方（game-from-scratch 参照样板） | 静默（08-23 后） | README.md、PROGRESS.md |
| lights-out/ | 灯阵关灯玩法 | 静默 | DESIGN.md、PROGRESS.md |
| cube-replica-c4/ | C4 元件复刻实验 | 单轮实验 | PLAN.md |
| composite-replica/ | 复合复现实验 | 实验 | README.md |
| ui-interact-test/ | UI 交互测试 | 实验 | 无文档，看 src |
| capture-set-repro/ | 捕获集复现 | 实验 | 无文档，看 src |
| maze-repro/ | T12 端到端复现（《空中花园》式迷宫） | 进行中（卡注入确认） | PROGRESS.md |

规则：

- demo 之间不共享代码；跨 demo 复用先确认目标 demo 的节点预算与资产 ID 段。
- 各 demo 的地图/图/元件 ID 以各自 AGENTS.md / PROGRESS.md 为准，禁止跨 demo 推测。
- 静默 demo 优先只读——作参照样板时不要顺手改动。
- 状态列按提交活动人工维护（最近核对 2026-09-02）；引用前可用 `git log -1 -- <目录>` 复核。
