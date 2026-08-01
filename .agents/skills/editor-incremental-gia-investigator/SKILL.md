---
name: editor-incremental-gia-investigator
description: Investigate Genshin editor GIA/GIL behavior through user-saved, adjacent, single-change map snapshots. Always use this skill when the user says they saved a map or NodeGraph after adding/changing/removing one node, pin, connection, parameter, signal, variable, or editor setting; asks to compare before/after GIL files; wants incremental exploration of an unknown editor rule; or wants a new feature/bug narrowed through minimal editor changes. It locates the exact map and NodeGraph without guessing, preserves immutable snapshots and hashes, produces bounded structural diffs, derives one falsifiable rule at a time, and optionally hand-replays the increment into a temporary GIL copy before any production fix or real injection.
compatibility: Genshin-TS repository with Node.js, tsx, tools/pkc.py, tools/list-gil-node-graphs.ts, and tools/compare-gil-node-graph.ts.
---

# 编辑器单变化 GIA/GIL 调查

把用户在游戏编辑器中的一次最小变化，转换成可复查的相邻快照、定点差分和同构重放证据。目标是逐步缩小范围直到规则闭合，而不是一次分析整张地图。

## 硬约束

- 默认全程只读；复制快照到 `/tmp` 不构成真实地图写回。
- 先用 Project Adapter / PKC 查询已有规则。只有 coverage gap 才启动新实验，不从头重做已有逆向。
- 每轮只允许一个可唯一归因的编辑器变化。出现多个变量时停止并请用户拆分。
- 不猜 `mapId`、`nodeGraphId`、图类型、信号 ID、pin index 或版本；都从当前地图和相邻快照读取。
- 未知规则闭合前，不改生产代码，不调用待修 production lowering/finalize 链生成“规则证明”。
- 不未经规模评估打印完整地图、整图 JSON 或 100 槽列表节点；默认只输出摘要和 PASS/FAIL。
- 手工重放只写临时 GIA/GIL；真实注入前必须单独展示目标、当前 hash、命令、修改范围和回滚路径，并获得明确确认。
- 自动比较、临时注入、真实写回、编辑器导入和游戏行为是不同证据层，分别报告。

## 开始一轮

先复述用户声明的唯一变化，例如：

```text
本轮唯一变化：未绑定发送节点 → 绑定信号 foo；没有新增连接或其他节点。
```

若用户只说“好了/已保存”，沿用上一轮明确约定的唯一变化；若没有明确约定，先问一个问题，不扫描猜测。

然后：

1. 读取根 `AGENTS.md`、本 Skill，以及 `.gia/.gil` 导航/Adapter Skill。
2. 运行一次 bounded PKC 查询，目标是本轮节点/字段规则；已有 Claim 直接复用。
3. 只读运行实际配置的 `gsts maps`，把 `[recent]` 当候选，不当授权。
4. 对比已保存基线的路径/hash 与最近地图；地图未变化时停止，出现多个候选时请用户确认。
5. 使用现有工具列图，不写一次性全量 decoder：

```bash
npx tsx tools/list-gil-node-graphs.ts <map.gil>
```

通过上一轮 graph ID 或明确图名定位目标。新图必须用“前后图集合差”识别，不能按常见 ID 推断。

## 保存不可变快照

每轮都在读取当前地图 hash 后复制到一个不存在的 `/tmp` 路径：

```text
/tmp/<task>-v0-<semantic>.gil
/tmp/<task>-v1-<semantic>.gil
```

复制前 `test ! -e <snapshot>`，复制后再次计算源和快照 SHA-256，必须一致。不得覆盖旧快照。

记录最小基线：

```text
map path / mapId
map SHA-256 / size / mtime
nodeGraphId / type / name / node count
用户声明的唯一变化
snapshot path / SHA-256
```

## 比较相邻快照

默认运行有界摘要：

```bash
npx tsx tools/compare-gil-node-graph.ts \
  <before.gil> <after.gil> <nodeGraphId>
```

先判断：

- 图 metadata 是否变化；
- 节点 added / removed / changed；
- 编辑器是否重建节点并改变 `nodeIndex`；
- identity 和 pin 数是否符合用户声明的单变化。

只有摘要能唯一定位后才运行：

```bash
npx tsx tools/compare-gil-node-graph.ts \
  <before.gil> <after.gil> <nodeGraphId> --full
```

对完整输出做定点提取，只报告相关节点的：

```text
nodeIndex
genericId / concreteId / signalVersion
pin kind + index / type / compositePinIndex
value / connects
必要的图级字段
```

protobuf 默认值不能证明 wire presence；需要区分“缺失”和“默认值”时补 raw-wire 或 round-trip 断言。

## 每轮输出

每轮只给一个结论块：

```text
快照：路径 + SHA-256
目标图：ID / 名称 / 类型 / 节点数前后
唯一增量：added / removed / changed
规则状态：CONFIRMED / CONFLICT / INSUFFICIENT
证据边界：真实编辑器观察 / 自动结构断言 / 尚未游戏验证
下一轮：只做一个最小变化（若规则已闭合则停止索要编辑器操作）
```

如果观察与已有知识冲突，标 `CONFLICT` 并停止；不静默覆盖旧规则。

## 手工同构重放

当相邻增量已经唯一且字段闭合时：

1. 从前快照读取完整目标 NodeGraph；
2. 只应用刚观察到的节点/pin/connection 增量；
3. 用 protobuf 编码器包装成完整 GIA，但不调用待验证 production lowering；
4. 用现有 `createInjector().injectBytes()` 对 `/tmp` GIL 副本按明确 `targetId` 整图替换；
5. 回读目标 NodeGraph，与后一真实快照做 protobuf bytes 或严格结构比较；
6. 留下一个最小 runnable 断言，只输出 PASS/FAIL 和关键摘要。

目标图一致即可；编辑器可能同步改动地图其他记录，因此不要要求整个 GIL 文件 hash 相同。

## 进入生产修复的门

只有以下条件全部满足才读取并修改 production seam：

- 已有知识与本轮增量的边界清楚；
- 相邻快照确为单变化；
- 手工同构重放通过，或明确记录为什么不适用；
- 已有一个在旧生产实现上失败的 focused regression；
- 用户要求进入修复。

之后执行最小 red→green 修复，重新用生产代码生成同样的最小候选，并把自动结果与用户编辑器/游戏核验分开报告。

## 知识与提交

稳定流程或规则先更新最小 Authority 并提交；只从已提交基线创建 PKC knowledge-plan。一个 plan 串行完成 Claim、Authority Ref 和必要 stale refresh，finalize 后展示精确 Bundle content hash，等待用户确认后才能 approve/apply。局部路径、一次性 ID 和未验证猜测不进入 `AGENTS.md`。
