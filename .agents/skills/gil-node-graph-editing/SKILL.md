---
name: gil-node-graph-editing
description: 精准编辑真实地图节点图的专用技能。当用户要求"改/编辑/优化/新增/删除/清理节点图逻辑"、"移除旧逻辑"、"加分支/连线/节点/出引脚"、"把某张图改成XX结构"、或任何需要修改 .gil 里节点图（节点、引脚、连线、参数、复合、cases 列表）的任务时，必须使用本技能，哪怕用户没明说"编辑"。它给出安全写回流程（先快照备份→候选验证→回读→写回→报告备份路径）、gsts assets:node-graphs read/patch 全操作速查、已闭合 wire 规则与未闭合功能清单（fail closed 不猜字节），让模型像做外科手术一样安全改真实节点图。配合 gil-node-graph-reading（只读分析）使用：先读懂图，再动手改。
---

# 节点图精准编辑（gil-node-graph-editing）

## 定位

用 `gsts assets:node-graphs read|patch`（`src/cli/assets_node_graphs.ts` +
`src/cli/static_assembly/graph_edit.ts`，记录级局部替换）安全修改真实地图 `.gil` 里的节点图。
只改目标 NodeGraph 记录字节，其余 root 原样保留。

**黄金原则**：
1. 改真实地图前**先备份**（候选文件 + 真实文件快照 + sha256 记录，存 `~/genshin-ts-evidence/` 证据目录）
2. 所有修改先在候选上做，**回读验证通过后再写回真实地图**
3. 写回后**必须向用户报告备份路径**（CLI `--write` 自动打印 `backup=`；手动流程自己报告）
4. **未闭合规则一律 fail closed**：不确定的编码不猜，停下来向用户要编辑器最小变化
5. 复杂逻辑先读后改：先用 `gil-node-graph-reading` 技能（explain/parse）读懂图结构

## 工具链速查

```bash
# 读（先看现状）
npx tsx src/cli/gsts.ts assets:node-graphs read --gil <map.gil> --graph <id|名>           # 全图节点/引脚/连线
npx tsx src/cli/gsts.ts assets:node-graphs read --gil <map.gil> --graph <id> --node <n>   # 单节点
npx tsx src/cli/gsts.ts assets:node-graphs read --gil <map.gil> --composite <defId>       # 复合定义接口
npx tsx tools/parse-gil-node-graph.ts <map.gil> --graph <id> --json                        # 底层结构（含 value）
npx tsx tools/compare-gil-node-graph.ts <before.gil> <after.gil> <graphId>                # 差分（验证改动唯一性）

# 改（默认 preview 不落盘；--output 写候选；--write 备份+写回真实）
npx tsx src/cli/gsts.ts assets:node-graphs patch --gil <map.gil> --graph <id> <ops...> --output <候选.gil>
```

### patch ops（顺序执行）

| op | 语法 | 说明 |
|---|---|---|
| 位置 | `node <idx> pos <x> <y>` | 设节点坐标 |
| 参数 | `node <idx> param <shell> <typed>` | 设 InParam 固定值（Int:1 Flt:1.5 Str:abc Bol:true Vec:1,2,3 Gid:1 Pfb:1 Cfg:1；类型前缀大小写敏感） |
| cases 列表 | `node <idx> cases <v1,v2,...>` | 全量替换 MultiBranch cases（IntegerList；需已有非空列表作模板） |
| 数据连线 | `node <idx> link <shell> <src-idx> [src-shell]` | 目标 InParam ← 源节点输出 |
| 断数据线 | `node <idx> unlink <shell>` | Fixed 删 pin / Variant 清 connects |
| 控制流连线 | `node <idx> flow <shell> <dst-idx> [dst-shell]` | 源 OutFlow → 目标 InFlow（pin 不存在会自动新建） |
| 断控制流线 | `node <idx> flow-rm <shell> <target>` | 从源 OutFlow 删一条 connects；无余线时整 pin 移除 |
| 加节点 | `node-add <generic-id> <x> <y>` | 仅 Fixed 节点（Variant fail closed）；无 pin 落盘 |
| 复制节点 | `node-copy <src-idx> <x> <y>` | 完整克隆源记录（含 pin 值/cpi/ClientExec），即编辑器复制粘贴语义 |
| 删节点 | `node-del <idx>` | 删记录；**先断掉指向它的连线**（源侧 connects 会悬空） |
| 图变量注册 | `graph-var-add <name> <type>` | 仅 Str(6) 闭合；exposed/structId 默认省略 |
| 复合改名 | `composite <def-id> rename <名>` | |
| 复合参数改名 | `composite <def-id> param input\|output\|inflow\|outflow <shell> rename <名>` | |
| 复合加输入 | `composite <def-id> add-input <shell> <name> <type> <inner-node> <inner-shell>` | 实例唯一才允许 |
| 复合创建 | `composite create <名> <anchor-idx> <node-idx...>` | 选节点打包成复合 |
| 复合删/换输入 | `composite <def-id> del-input <shell>` / `swap-input <a> <b>` | 实例重编号 |

## 安全流程（写回真实地图的固定步骤）

```
1. 快照：cp 真实 .gil → ~/genshin-ts-evidence/<实验>/raw/before.gil + sha256sum 记录
2. 候选：patch --output /tmp/cand.gil（或分步脚本），不碰真实文件
3. 回读：read/parse 验证候选结构符合预期；compare 验证改动唯一性（无意外变更）
4. 写回前：sha256sum 真实文件 == 步骤 1 记录（用户可能又在游戏里动过，变了就停下问）
5. 写回：cp 候选 → 真实 .gil（先备份 .gsts/backups/<map>.<时间戳>.<说明>.bak）
6. 复读：写回后再 read 一遍真实文件确认
7. 报告：告诉用户备份路径 + 改动摘要 + 游戏核验点
```

## 已闭合 wire 规则速查（真实快照 + 工具回归）

详见 `references/wire-rules.md`（操作前按需加载）。摘要：

- **控制流**：源 OutFlow 默认(0) index 省略 / 非默认显式；目标 InFlow 默认省略 / 非默认显式；
  断线 = 从源 OutFlow 删 connects 记录；无余线整 pin 移除；新 OutFlow 按 ShellIndex 升序排参数 pin 前
- **数据流**：connects 挂目标侧 InParam；替换线改 connects.id；Variant 类型不匹配删整 pin
- **Variant/MultiBranch**：concreteId=KernelID（3 多分支 Int=3 / Str=4）；key/cases 两个 InParam；
  cases 列表 IntegerList type=8；未连线 case 不实例化 OutFlow pin
- **节点增删**：node-del 只删记录；node-add 用最小空闲索引、无 pin 落盘
- **cases 条目**（scripts/patch-cases-list.ts 已验证）：`{1:2, 2:1, 4:{1:1,6:{2:3}}, 102:{1:val}}`，
  bInt(102) 的 val 在字段 1

## 未闭合功能清单（fail closed，遇到先停下）

| 功能 | 现状 | 对策 |
|---|---|---|
| node-add Variant 节点（含 MultiBranch） | 工具拒绝（Variant donor 未闭合） | 用户在编辑器加节点 → 快照差分闭合规则；**复制已闭合**（`node-copy` 可克隆现有实例） |
| 图变量定义（graph variables） | 注册已闭合（`graph-var-add`，Str 模板）；**使用**（Set/Get）已闭合（Str 变体字节）；跨图复制节点未做 op（临时脚本） | Set Str 变体 f3=326、indexOfConcrete=3（详见 wire-rules） |
| cases 列表写入 | ✅ 已正式化（`node <idx> cases <v1,v2,...>`，2026-08-09 并入 CLI；`scripts/patch-cases-list.ts` 逻辑同源） | 空列表无法克隆模板，fail closed |
| 节点重编号 / 墓碑复用 | 部分闭合（composite ops 有） | 尽量不触发 |
| 复合实例的节点增删 | 未闭合 | 用户编辑器最小变化 |

## 常见任务 playbook

### 删旧节点 + 清理（2026-08-09 tab-input 实战）
1. 先 `flow-rm` 断开指向被删节点的源侧连线（事件→旧分支、多分支默认分支→旧占位）
2. `node-del` 逐个删除；目标侧不落盘无需清理
3. 回读确认剩下的连线没有悬空目标

### 给 MultiBranch 加 case 分支
1. 确认 cases 列表已含该 key 值（没有用 `node <idx> cases <v1,v2,...>` 补）
2. `node <mb-idx> flow <case-shell> <发送信号节点>`（Case1=shell1, Case2=shell2...）
3. 回读：新 OutFlow pin 应排在 InParam 前、非默认 index 显式

### 改发送信号参数（face/direction 等）
`node <idx> param <shell> str:U`——先 read 确认 shell 号和当前值

## 增量规则闭合流程（遇到工具不支持的编辑）

```
1. 用户编辑器做一个最小单变化并保存
2. 保存前先备份快照（before）——切记！否则无法差分
3. compare-gil-node-graph 差分 → 确认唯一 changed node
4. extract-node-raw 提取 raw 字节 → 对照知识树/文档
5. 手工同构重放（临时脚本）→ 回读一致
6. 更新 references/wire-rules.md + docs/game-engine-knowledge/ → 提交
7. 扩展工具（graph_edit.ts + 测试）或登记待办
```

## 陷阱

- **删节点前不断线**：源侧 connects 指向已删节点 → 悬空引用（编辑器可能报错/清线）
- **写回前不校验 sha**：用户在游戏里又保存了 → 覆盖用户新变化（先 sha 校验，变了就停下）
- **before 不落盘**：只记 hash 不存文件 → 之后无法字节级差分（务必 cp 快照）
- **param 设值会清 connects**：值/连线二选一（编辑器规则），设值前确认该 pin 无线
- **节点索引会变**：composite ops 可能重编号；后续 op 用新索引
- 用户要求只读分析时用 `gil-node-graph-reading`，本技能只管改
