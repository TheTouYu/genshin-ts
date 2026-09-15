# maze-repro · T12 端到端复现进度

> 复现对象：真实奇域《空中花园》的探索迷宫（源 `BV1Gj1jB1EQf`，作者自述 4 年经验积淀）
> 设计书：`docs/knowledge-graph/reproduction/T12-design.md`（9 条决策全部引图谱条目）
> 图谱上游：`docs/knowledge-graph/MAP.md`

## 为什么复现它

真实存在（有 GUID 可试玩）｜玩家验证过（757 赞评论"整体难度控制得很舒服"）｜
设计知识极密（4 条邪修级做法）｜**不依赖我方做不了的能力**（无局内存档，R8 已规避）。

## 进度

| 段 | 状态 | 产物 |
|---|---|---|
| 设计 | ✅ | `docs/knowledge-graph/reproduction/T12-design.md` |
| 几何 | ✅ | `reproduction/gen-maze.py` → 150 实体；BFS 验证 99 格全连通/出口可达/4 隐藏物可达/92 格有回头路 |
| 节点 | ✅ | `src/maze-collect.ts` → `.gia` id=1073741931，9 节点；IR 核验 9/9 与意图一致 |
| 注入 | ⬜ **需用户确认 mapId** | 本工程刻意不写 `inject` 段 |
| 游戏内核验 | ⬜ 需用户 | —— |

## 两条施工硬规则（踩过才写下来）

1. **编译必须走 `node ./bin/gsts.mjs -c gsts.config.ts`**。
   用 `npx tsx src/cli/gsts.ts` 会因 src/dist 双副本抛
   `gsts.f is only available in server_* ctxType`（`kCtxStack` 是 Symbol，两份 core.ts 各持一个）。
   **空图也会复现**，与图内容无关。
2. **信号节点需要目标地图的注册表**（编译期强制）→ 含信号的图不能"先写后挑地图"。
   本图因此暂不接信号；"集齐后场景惊喜"待 mapId 确认 + `assets:signals register` 后接入。

## 下一步（阻塞在用户）

1. 用户确认目标 mapId（红线：操作地图前必须确认）
2. 补回 `inject` 段 → `node ./bin/gsts.mjs -c examples/maze-repro/gsts.config.ts`
3. 几何 import：`gsts assets:entities --entities docs/knowledge-graph/reproduction/maze-entities.json --map-id <id> --write`
4. `assets:signals register 迷宫_隐藏集齐` → 恢复信号版回馈
5. 用户游戏内核验（隐藏物是否需要挂选项卡组件：`addComponent` 我方 🔴，只能走
   `assets:entities patch --tab-options` 或编辑器手工）
