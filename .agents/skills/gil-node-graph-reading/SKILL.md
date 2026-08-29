---
name: gil-node-graph-reading
description: 读取真实 GIL 节点图逻辑的专用技能。当用户要求"看/读/查/追踪/分析某个节点图的逻辑"、"这个图是怎么写的"、"帮我理解这个地图的玩法逻辑"、需要核对代码生成的 .gia 与真实图写法是否一致、或需要完整梳理任意复杂/深嵌套节点图的执行链路（事件入口、控制流分支、参数来源、复合内部逻辑）时，必须使用本技能。它给出从关卡全景到单节点数据来源的完整追踪路径、explain 输出的逐符号词汇表、常见代码惯用法识别和语义自洽验证方法，让模型像读本地代码一样读真实节点图，而不是瞎猜。任何涉及真实 .gil 文件、节点图追踪、复合嵌套梳理、信号链路分析的任务都先用本技能，哪怕用户没明说"读图"。
---

# 真实节点图逻辑追踪（gil-node-graph-reading）

## 定位

目标是让模型**像读本地代码一样**读懂游戏关卡里真人写的节点图：事件入口是什么、每条执行链做什么、
分支条件数据从哪来、复合节点内部怎么写、嵌套多深都能追完。工具全是只读分析器，不修改任何图文件。

适用素材：真实关卡 `.gil` 文件（含主图 + 复合 impl 图）。编译器生成的 `.gia` 产物**不是**本技能
工具链的输入（`explain/parse/list/scan` 等只接受 GIL 地图格式；2026-08-20 实测对 .gia 报"未找到节点图"）——
验证编译产物 `.gia` 用项目根 `tools/decode-gia.ts`（配 jq，输出 accessories[复合def]+graph[主图]，详见其文件头 jq 速查）；
`.gia` 注入到地图后才用本技能工具链读注入结果。工具链细节见 `docs/gia-tools-reference.md`；
引擎规则知识见 `docs/game-engine-knowledge/`（按需取用）。

## 工具链速查

| 工具 | 一句话定位 | 常用参数 |
|---|---|---|
| `tools/list-gil-node-graphs.ts` | 关卡全景：所有主图 + 复合目录 | `<地图.gil>` |
| `tools/explain-gil-node-graph.ts` | **人读式解读**：事件入口/控制流树/参数来源/复合内部 | `--graph <名\|id\|auto>` `--composite <名>` `--depth N` |
| `tools/scan-gil-signals.ts` | 信号全景清单（主图+impl 图全扫） | `--signal <名>` `--json` |
| `tools/trace-gil-exec-flow.ts` | 执行流机器级分析 | `--auto` `--json` |
| `tools/trace-gil-dataflow.ts` | 数据流定点：某节点输入来源 | `--node <id>` `--all-inputs` `--json` |
| `tools/parse-gil-node-graph.ts` | 底层结构化解析（变量定义/inputs/value/boundary） | `--graph` `--composite` `--json` |
| `tools/compare-gil-node-graph.ts` | 两个图/文件对比 | 见 `--help` |
| `gsts assets:node-graphs layout --check` | 布局 lint：读图并报告违规（flow-upward/backward、chain-vertical、long-chain、block-order、line-align、data-detached、data-chain-long、island、overlap） | `--gil <地图> --graph <id>` |
| `gsts assets:node-graphs read` | 单节点/单图原始 pin 值（explain 过长时的定点替代）；复合分类读取 | `--gil <地图> --graph <id> [--node <n>]`；分类：`[--category <名>]` 过滤、`--composite <id>` 详情含分类、`--json` 带 category |
| `tools/scan-gil-var-pins.ts` | 变量类节点（Get/Set Custom/Node Graph Variable）变量名 pin 完整性扫描——**交付候选前必跑**（2026-08-12 split2 复盘新增） | `<地图.gil> [--graph <id>] [--json] [--list-names]` |
| `tools/check-gil-composite-refs.ts` | **全量复合引用完整性**：impl 图引用复合 ID 0 悬空；`--incoming <本次.gia>` 检测残留 def 引用被注入覆盖（类型错位事故模式）——**注入后必跑**（2026-08-20 新增） | `<地图.gil> [--incoming <game.gia>] [--json]` |
| `tools/decode-gia.ts`（项目根） | **编译产物 `.gia` 解码**（accessories 复合 def + graph 主图 + compositePins；配 jq 查询）——验证 .gia 用这个，不用本技能其他工具 | `<file.gia> 2>/dev/null \| jq '[.accessories[] \| select(.which==12).name]'` |

运行方式：`npx tsx tools/<工具>.ts <文件> [参数]`（仓库根目录下）；`gsts` 用 `npx tsx src/cli/gsts.ts <子命令>`。

## 追踪 playbook（按顺序，需要才深入）

### Step 0 关卡全景
```bash
npx tsx tools/list-gil-node-graphs.ts <地图.gil>
npx tsx tools/parse-gil-node-graph.ts <地图.gil> --list   # 全量复合目录（含版本名）
```
先知道关卡里有几张图、每张多大、有哪些复合。**主图和复合 impl 图是两个容器路径**
（主图 root10.1.1、复合 impl root10.4.1），list 都列出来。空图（0 节点）忽略。

**复合目录版本一致性核对（2026-08-26 足球拒载实证，游戏报错与读图矛盾时必做）**：
`--list` 的复合目录里出现同名复合的多个版本（编辑器/历史注入残留，名字带 `(1)` 后缀、
id 新分配的副本）时，游戏会校验**目录里全部复合（含零引用条目）**——零引用错误副本照样拒载。
排查"游戏报内部参数不匹配"类拒载：① 全量列出复合目录看有没有多版本/重名；② 用
`--composite "名字(1)"` 读可疑副本内容与正确版对比；③ 用主图/impl 的 parse 输出统计
全部复合调用的 concrete_id，确认引用只落在正确版。修复=删除零引用错误条目（先备份快照）。

### Step 1 信号全景（事件入口线索）
```bash
npx tsx tools/scan-gil-signals.ts <地图.gil>
```
信号是跨图协作的主要机制：发送节点在哪张图、监听节点在哪张图、信号带什么参数。
`--signal <名>` 定点看某个信号的完整使用清单。信号可能藏在复合 impl 内部，scan 会覆盖。

### Step 2 主图事件树
```bash
npx tsx tools/explain-gil-node-graph.ts <地图.gil> --graph <图名>
```
一次拿到：事件入口列表 → 控制流树（分支+条件来源）→ 参数来源（每个节点输入）。这就是"读代码"的主视图。
- 控制流树读不懂或太长时，先看折叠行（线性链已压缩），再按需展开
- 嵌套复合默认不展开（`--depth 0`）；要追复合内部逻辑用 Step 3

### Step 2.5 输出过长怎么办（大图必读，2026-08-09 turn-ctl 复盘）
大图（Assembly List 60+ pin 节点、长参数段）会让 explain/read 输出上千行，**不要反复跑同命令分页**：
- 只看控制流：`explain ... | grep -E "^事件:|^  (Branch|default|true|false|complete|n=)"`（跳过大段「参数来源」）
- 只看单节点：`gsts assets:node-graphs read --gil <地图> --graph <id> --node <n>`（--node 定点）
- 结构化提取：`parse --json > /tmp/g.json` 后 python 按 index 过滤（比 explain 更省 token）
- 大 pin 节点（Assembly List 等）直接跳过「参数来源」段，pin 值用 --node 定点查
- **DSH 沙箱环境（2026-08-28 魔方客户端图复盘）**：每条 bash 命令独立沙箱，/tmp 不跨调用持久——
  `parse > /tmp/g.json` 与"下一条命令读 /tmp"必然 FileNotFoundError。**parse+python 分析合并进同一条
  bash 命令**（heredoc 一次跑完）；正则转义（d/s/n）在 run_code→bash 链路会被 JS 模板字符串吃掉，
  统一写双反斜杠或改用无转义写法，否则正则静默 0 命中且无报错。
  **同族扩展（2026-08-29 元复盘）**：run_code 模板字面量内联**大段 Markdown/脚本**同样踩坑——
  反引号会截断模板、转义序列（如 \\u0060）变成字面量甚至语法报错。通用纪律：**大文本一律先用
  write 工具落文件（或 String.fromCharCode(96) 拼反引号），不要在模板字面量里内联**；

### Step 2.6 parse --json 输出键名速查（勿猜结构，2026-08-12 复盘）

魔方重构 eval-main/eval-bindhold 曾反复 `python3 -c "d=json.load(...)"` 探测结构（42 次浪费）；顶层与常用子结构如下（真实输出，`npx tsx tools/parse-gil-node-graph.ts <map.gil> --graph <id> --json`）：

- 顶层：`input`（path/bytes/sha256）、`target`（kind/id/name/type/selection）、`graph`、`status`、`discovery`（auto_candidates[]）
- `graph`：`id` / `type` / `name` / `scope` / `node_count` / `variables`（图变量，带初始值）/ `boundary` / `nodes` / `dataflow` / `flow` / `children`（复合子图）
- `graph.nodes[i]`：`index` / `api` / `generic_id` / `concrete_id` / `kind` / `position` / `inputs` / `outputs` / `pins`
- `graph.dataflow` / `graph.flow` 元素：`{from, to, wire}`；按 index 过滤用 `nodes` 的 `index` 字段
- 键名变了？先 `python3 -c "import json,sys; print(list(json.load(sys.stdin).keys()))"` 一行确认，不要写多行探测

### Step 2.7 节点名 → ID 查询（读图时需要节点 ID 时先查这里，勿 grep 全仓库）

```bash
# 一行命中（reflectMap 含变体 concreteId 与 indexOfConcrete）
grep -n "3D Vector Zoom\|Subtraction\|Multiple Branches" \
  src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.ts
# 精确解析（多行排版，按关键词过滤）
python3 - <<'PY'
import re
src = open('src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.ts').read()
for m in re.finditer(r"name: '([^']+)',\s*\n\s*id: (\d+),(.*?)(?=\n  \})", src, re.S):
    if any(k in m.group(1) for k in ('Zoom', 'Subtract', 'Multiply', '缩放', '减法', '乘法')):
        print(m.group(1), m.group(2), re.findall(r"\[(\d+), '([^']+)'\]", m.group(3)))
PY
```
（与 `gil-node-graph-editing` SKILL.md「名称→ID 速查」同源，读图分析时同样适用）

### Step 2.8 客户端节点图读法（2026-08-28 魔方-客户端优化版本实证，勿跳）

地图里混着客户端图时（`list-gil-node-graphs.ts` 输出的 `type` ≠ 20000）先按本 Step 读。
**2026-08-29 工具修复**：parse/explain 已按图 type 自动切换客户端名字解析（genericId →
`client_node_metadata.ts` displayName）；未收录的节点显示为 `客户端API#<gid>` 中性占位（如
「向服务器节点图发送信号」gid 1610612774 元数据无 displayName，见下）。
**修复前的旧行为**（历史坑，勿再被旧输出误导）：工具曾把客户端节点错标成服务端 API 名
（多分支→"Set Custom Variable Dict Str List Int"、节点图开始→"Set Custom Variable Dict Str List Bool"、
获取自定义变量→"When Custom Variable Changes"…）——若看到这类错名说明工具是旧版。正确读法：

1. **先认图型**：graph `type` 字段枚举见官方 proto
   `src/thirdparty/.../protobuf/gia.proto` 的 `NodeGraph.Id.Type`：
   20000=BasicNode(服务端玩法图) / 20001=BooleanFilter / 20003=StatusNode / 20010=CharacterControlSkill
   （客户端图：过滤器/状态图/角色操控技能图；其余 20002~20009 同理）。
2. **名字映射**：`parse --json` 的 `nodes[i].generic_id` 是真身份，用它查
   `src/thirdparty/.../node_data/client_node_metadata.ts` 的 `subType`+`displayName`：

```bash
python3 - <<'PY'
import re
src = open('src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/client_node_metadata.ts').read()
for m in re.finditer(r"subType:\s*'(character_control_skill|bool_filter|int_filter)',\s*\n\s*nodeType:\s*'([^']+)',\s*\n\s*displayName:\s*'([^']*)',\s*\n\s*graphType:\s*\d+,\s*\n\s*genericId:\s*(\d+),", src):
    print(m.group(1), m.group(4), m.group(3))
PY
```

3. **客户端多分支 pin 语义（真实 GIL 核验，勿按服务端习惯猜）**：`OutFlow[0]` = default/未匹配分支，
   `OutFlow[i]` = case[i-1]（i≥1）；多个多分支用 default 串联成 fallthrough 链 = 顺序分类器
   （链尾 default = 兜底分支，如"指令异常"）。case↔引脚映射用"case 列表 × OutFlow 目标 × 目标字面量赋值"
   三方互证（魔方 9 面全部吻合才固化）。
4. **客户端循环语义（2026-08-28 日志 2979 闭合）**：「有限循环」out_flow[0]=循环体 / [1]=完成；
   「遍历实体列表」out_flow[0]=**完成**（循环结束后执行一次，如发信号 1 次）/ [1]=**每次**（每元素执行，
   如 26 块各加一次单位状态）——与有限循环相反。日志铁证：整体旋转记录 1438 帧中遍历实体列表节点
   27 帧（26 块 + 1 完成）、添加单位状态 26 帧、向服务器发信号 1 帧。O-2026-08-28-06 已闭合。
5. **客户端图入口**：入口节点是「节点图开始」(node_graph_begins)，explain 会显示成"孤立执行链"——
   这是正常现象（客户端图由技能释放/事件轨道触发，无事件/InFlow 入口），不是坏图。
   **触发链路在服务器图侧读**（2026-08-28 魔方客户端图实证）：服务器侧
   Create Custom Skill Instance（技能配置ID→实例ID）→ Cast Specified Skill Instance（施放指定技能实例）
   → 技能动画"节点图事件轨道"打点触发客户端图。角色操控技能（20010）仅在操控状态可用、释放期间
   无动画表现（官方文档 mhj4a0rzu4pi）；读图时把"谁施放了技能实例"链（Cast 节点的实例ID来源 +
   技能配置 ID）一并追清，才算闭环。
6. **恒真条件的「双分支」单 OutFlow 挂 N 条边** = 扇出 fork（N 个独立处理开关都进入，只有命中者执行）。
7. **跨端信号**：客户端图发信号用「向服务器节点图发送信号」节点，信号名在 `ClientExecNode[1]` pin；
   parse JSON 里监听信号节点的 `composite.interface.outputs` 直接给出参数名列表（本次旋转信号 6 参数
   在监听侧核对与发送侧一致）。

### Step 3 追进复合
```bash
npx tsx tools/explain-gil-node-graph.ts <地图.gil> --composite <复合名>
npx tsx tools/explain-gil-node-graph.ts <地图.gil> --graph <主图> --depth 2   # 原地展开嵌套
```
`--composite` 显示：定义接口（inputs/outputs/inflows/outflows）→ impl 图内部解读（与主图同格式）。
复合的执行起点显示为【外部入口】（InFlow 驱动），不是孤立链。`--depth N` 递归展开嵌套复合，
循环引用自动标注。复合内部节点的数据输入显示 `← 接口 <名>`（来自调用方传参）。

### Step 3.5 修复后读图自检（2026-08-14 方法论强制，勿跳）
**修改生产代码（编译/注入后）的第一件事是读图自检，通过后才交用户游戏测试。**
编译产物 .gia 正确 ≠ 注入后 .gil 正确（#20b/#20c 实证：.gia 有边、.gil 丢边——
注入器按 CompositeDef 接口裁剪调用点引脚）。自检清单：
- **全量复合引用完整性（2026-08-20 注入事故后必跑）**：`npx tsx tools/check-gil-composite-refs.ts <地图.gil> --incoming <本次.gia>`——
  校验每个复合 impl 图引用的复合 ID 存在（0 悬空）+ 残留 def 引用被本次注入覆盖的 ID（类型错位事故模式）。
  注入器 merge 复合定义只覆盖同 ID、**不删除地图残留旧 def**；残留 def（如 gsts_in_layer）引用被覆盖的
  ID 会类型错位 → 游戏拒载（无日志）。删除/新增复合会改变后续复合 ID（defineComposite 按定义顺序分配），
  所以**每轮注入后必须全量对比 def 集合**（dump_gil_index 或本工具），不能只看关键复合。
  工具局限：连续注入的残留（引用更早注入的覆盖物）可能逃逸 → 残留 def 用 `explain --composite` 人工核对接口。
  误报判读（2026-08-21 实证）：`--incoming` 把 GIA 中 which=12（监听信号）/14（发送信号/向服务器发送信号）的
  **信号定义单元**也收进对比，会报「GIA 复合 16106127xx 注入后在地图中缺失」——这是误报，信号单元以信号形态注册
  （用 `scan-gil-signals.ts` 确认信号存在且被使用即正常），不是复合图；修复方向见 open-items O-2026-08-21-4。
- 复合接口完整性：被调用复合（尤其被 MB 分支调用的）必须有 `inflows` 非空
  （混合复合=调用流+事件节点，如 orbit_segment 有 whenCustomVariableChanges + done
  outflow，必须有 InFlow 入口；纯事件复合如 trigger 接口全空是正常的）
- 执行流条数：MB 分支 → 子复合调用的边应逐条可见；"外部入口 InFlow → MB →
  各分支"结构完整；执行流条数 = 分支数 + 后续链数
- **执行边健康（2026-08-20 日志 2777 后新增，强制）**：用 `parse --json` 的 `flow` 列表核对：
  - 每个普通 exec 节点（start_timer / set_list_value / set_node_graph_variable 等）**最多一条 InFlow 入边**；
    复合调用 done 因 auto-chain 可能额外拉一条入边，导致同一节点执行两次（日志特征：Start Timer 同节点两帧）。
  - 公共 merge/done 节点**不得回到分支入口**（否则 execution flow loop，游戏直接报循环）。
  - 链尾节点应通过 `boundary` 映射到复合 `done` outflow，或显式连到后续节点。
- 事件复合：事件入口 → MB 分发 → case 各分支完整（trigger 应为 10 条执行流）
- 判定标准详见 docs/game-engine-knowledge/composite-nodes.md #20 章节验证命令
读图自检发现问题 → 直接修（不浪费用户测试轮次）；读图技能覆盖面不足无法定位 →
记录技能缺口（覆盖范围、缺什么），再查 debug-log-investigator 日志。

### Step 3.6 编写后二次核验（新写节点图编译注入后，2026-08-20 用户要求，勿跳）

**刚写的 DSL 编译注入 ≠ 生成的图正确**——API 写法（连接/参数/引脚）和编译器 bug
（节点爆炸/漏节点/捕获错误）都要靠读回真实图核验，尽早发现，不浪费用户游戏测试轮次。
顺序：`decode-gia.ts 解码 .gia` → 注入 → `list-gil-node-graphs 全景` → `explain 人读式核对` → 定点检查。

1. **.gia 解码核预期**（注入前）：`tools/decode-gia.ts <file.gia>` —— 复合 def 集合（accessories
   which=12 的名字列表）、主图节点/连线、compositePins——核对"我写了 N 个复合、M 条逻辑"都生成；
   节点数异常（膨胀）在这里就看出来。
2. **注入后全景**：`tools/list-gil-node-graphs.ts <地图.gil>`——目标图存在、图名被替换为
   `_GSTS_<gia基名>`、节点数 > 0。
3. **人读式核对**：`tools/explain-gil-node-graph.ts --graph <名> --composite <名>`——按
   "写的逻辑"逐条核对：事件入口挂对（whenXxx）、分支结构、复合调用展开、关键参数值在位。
4. **定点检查**（每项都有对应工具）：
   - 节点预算：`gsts assets:node-graphs nodes --gil <map>`（implTotal < 3000；膨胀在此暴露）
   - 信号 pin：`tools/scan-gil-signals.ts`（send/monitor/server 编号与注册表一致）
   - 变量 pin：`tools/scan-gil-var-pins.ts`（Get/Set 变量名 pin 完整）
   - 复合引用：`tools/check-gil-composite-refs.ts --incoming <本次.gia>`（0 悬空 + 残留覆盖）
   - 布局 lint：`gsts assets:node-graphs layout --check`
5. **典型问题信号**：
   - API 写法：预期节点/连线缺失、参数值错、复合调用展开数与预期不符、compile 期
     `duplicate physical route`（exec 链显式 link 复合调用）
   - **重复入边/死循环**：同一节点在 `flow` 列表出现多条 InFlow；或公共 done 回到分支入口。
     这类问题编译期不报错，必须读 `flow`/`boundary` 才能发现（2026-08-20 日志 2777 实证）。
   - 编译器 bug：节点爆炸（函数内联×分支/常量当变量读）、capture 链异常、值类型错、
     丢边（.gia 有边 .gil 丢边——注入器按 CompositeDef 裁剪调用点引脚）

核验通过才交用户游戏测试；发现问题直接修（改 DSL 或改注入器），不猜测。

### Step 3.7 多图拆分核验（2026-08-21 新增）

当玩法拆到多个节点图时，除了单图读图，还要：

- `assets:mounts list <entity> --gil <map>`：确认目标实体挂载了哪些图，顺序是否符合预期。
- 按图 ID 分别核对节点预算：`assets:node-graphs nodes` 目前默认只统计主图；多图时需扩展支持 `--graph <id>`。
- `check-gil-composite-refs --incoming <各图.gia>`：检查跨图残留 def 是否被覆盖 ID（新增图后必跑）。
- 每个图的 `whenTimerIsTriggered` / `Multiple Branches` 分发只处理自己负责的 timerName，避免两个图同时处理同一 timer 造成重复。
- 共享状态通过实体自定义变量桥接时，读图确认 `getCustomVariable` / `setCustomVariable` 的变量名 pin 完整。

### Step 4 数据流定点（查具体节点参数来源）
```bash
npx tsx tools/trace-gil-dataflow.ts <地图.gil> --graph <图名> --node <id> --all-inputs
```
控制流树只显示"执行顺序"，参数值从哪来要查数据流。`--json` 拿结构化结果（依赖路径/终端来源）。

### Step 5 语义验证（确保理解正确而不是猜）
读懂了"大概"不等于"读懂"。用这些手段验证：
- **变量名 pin 完整性（2026-08-12 split2 复盘新增）**：Set/Get Custom Variable、Set/Get Node Graph
  Variable 的变量名 pin 必须存在且非空。交付候选前跑 `npx tsx tools/scan-gil-var-pins.ts <候选.gil>`，
  0 违规才过关（它把 explain 的 `[变量=...]` 注解变成可机器核查的断言）
- **图变量默认值**：`parse --json` 看 `graph.variables`（每个变量带初始值，如 `direction="cw"`——这决定首次行为）
- **未连线条件**：分支节点的 Bol 输入 `字面量 Default(0)/True(1)` 表示条件未连线，**默认值决定固定走哪个分支**（可能是设计，也可能是死分支）
- **几何/状态自洽**：有位移/旋转/轮转逻辑时，用数值互相验证（如旋转 90° 后坐标变换与变量轮转顺序是否吻合）
- **写而不读**：局部变量被 Set 但无任何 Get 消费 = 冗余；复合定义存在但主图未调用 = 死代码
- 复合内部能直接 `Get Node Graph Variable` 读宿主图变量（impl 与宿主共享变量空间）
- **跨图复制/清空源图场景**：动任何图之前，先 `parse --json` 把源图全量落盘（复制源 + 对比基准），与 `gil-node-graph-editing` 的安全流程第 0 步联动

### Step 6 输出报告
按下面的模板给用户报告，**疑点单独列**（不猜测，标注"需用户/游戏核验"）。

## explain 输出词汇表（逐符号）

```
事件: n=1 When Entity Is Created          ← 事件入口（n=节点号 + 节点名）
  Branch[0] → n=4 Set Node Graph Variable [变量="pivot"]   ← 执行出边：Branch[0]=默认出边
    true → n=35 ...                       ← Double Branch 的 true/false 分支
    false → n=37 ...  [条件: n=36 Equal.Bol]  ← 分支条件的数据来源
  complete → n=55 ...                     ← 复合 outflow（执行完回调）
  (与上方路径合并/循环，不再展开)           ← 汇合点：该节点前面已展开过
  n=4 ... → n=6 ... → n=8 ...（折叠行）     ← 线性链压缩：单入单出无真实条件 ≥3 节点，
                                              每 6 个断行；链内省略默认条件噪音
```

- `[变量="pivot"]`：变量设置类节点的变量名（Set Node Graph Variable / Set Custom Variable）
  **缺失该注解 = 变量名 pin 缺失（硬伤）**：explain 输出里变量设置类节点不带 `[变量=...]` 说明其
  变量名 pin 没落盘——编辑器加载后下拉为空、运行时写不进变量；explain/parse/layout --check 都不会报错
  （2026-08-12 split2：init 链 9 个 Set Custom Variable 因此漏检）。看到即视为违规，用
  `gsts assets:node-graphs read --node` 或 `tools/scan-gil-var-pins.ts` 复核。
- `[信号="cube_turn"]`：系统信号节点（发送/监听）的信号名
- `[局部变量 ← n=34 Get Local Variable.E<1016>]`：局部变量身份来源。**E<1016> 是 Local Variable
  类型码，不是索引**；局部变量 wire 无名（引擎事实），身份只能沿 E<1016> 连线追溯
- `← 接口 pivot`：复合 impl 内部节点输入来自外部接口（调用方传参）
- `← n=10 复合:监听信号.伤害值`：数据来源 = 节点输出（n=10 复合的输出引脚）
- `← 字面量 X`：未连线的字面量值（枚举自动转名，如 `CoordinateSystemType_WorldCoordinateSystem(1201)`）
- `← 未连线`：没有来源也没有值（对复合内部，先查是否接口映射；对复合调用点，可能是真的没传）
- 【系统/复合节点】：系统节点=无 impl 图（信号类，参数行为由信号名决定）；复合节点=有 impl 图
- 【外部入口】复合由调用方 InFlow 驱动：impl 图的执行起点（不是孤立链）
- 孤立执行链：无事件入口、无外部 InFlow 的链（调试时可能短暂不启用）

## 常见惯用法（快速识别"这段代码在干嘛"）

详细模式库见 `references/patterns.md`，先记住这些高频模式：

1. **初始化链**：`When Entity Is Created` → Get Self Entity → Create Prefab 一排 + Set 图变量记录实体/位置
2. **busy 锁**：信号处理开头检查 `busy` 变量，处理结束（如运动设备停止）才解锁——防止重入
3. **方向/状态记忆**：图变量存上次状态，下次根据它取反/轮转（如 `direction="cw"` 默认值）
4. **信号参数分发**：监听信号 → Equal 链按参数匹配（face=="U" → 执行 U 面逻辑），无匹配分支=该参数无效
5. **绑定/解绑**：`Switch Follow Motion Device Target by Entity` + `Activate/Disable Follow Motion Device`
   （Relative+CompletelyFollow=绑定到目标；World+FollowLocation=回到世界）
6. **设备名约定**：`Add Basic Target-Oriented Rotation-Based Motion Device` 带设备名（如 `p2_u_cw`），
   停止事件按设备名匹配分支
7. **状态轮转**：多个变量循环赋值（`pos_ufr←pos_ufl←pos_ubl←pos_ubr←temp`）= 记录实体归属的轮换
8. **死代码信号**：未连线条件的默认分支永不执行；局部变量写而不读；旧版复合未被调用

## 陷阱清单

- **impl 图不在主图列表里**：复合内部逻辑要 `--composite <名>` 或 `--depth N` 才看得到
- **折叠行省略条件**：链内节点的 `[条件: 字面量 Default(0)]` 噪音被省略；要看条件细节用 `parse --json`
- **"未连线"可能是接口**：复合 impl 内部节点的输入显示 `← 接口 X` 是外部传参，其余未连线才是真没连
- **`字面量 0` 未必等于路由错误**：boundary capture 落到普通数据节点（如 Addition）时，explain 可能把 pin 显成
  `字面量 0`，但编辑器里接口路由是正常的（2026-08-24 rubik-3x3 面转复盘实证）。别据此直接改编译器 pin 编码；
  先让用户编辑器回读确认 + 用 debug-log 看运行值
- **信号参数在发送节点**：信号带什么参数看发送节点（scan --signal 定点会列出发送/监听位置）
- **图变量默认值影响首次行为**：`direction` 这类记忆变量初始值 = 第一次运行的行为
- **空图/测试残留**：list 里 0 节点图、`GSTS_` 前缀图、`信号测试全参数` 类信号是测试/注入残留，跳过
- **`[变量=...]` 注解缺失 ≠ 无关紧要**：变量设置类节点没显示变量名 = 变量名 pin 缺失，是交付硬伤
  （不是可选参数）；explain/layout 都不报错，只有逐节点核 pin 才看得到
- **不要猜**：引擎规则不确定时查 `docs/game-engine-knowledge/`；查不到就列为疑点交给用户/游戏核验
- **客户端图节点名不可信**：list 输出 type≠20000 的图，explain/parse 的节点名是服务端名字表撞号产物
  （2026-08-28 魔方客户端图实证），一律按 Step 2.8 用 generic_id 映射真名后再读
- **客户端"孤立执行链"可能是入口**：客户端图入口「节点图开始」被 explain 显示为孤立链是正常现象，
  别当成死链；服务端图的孤立链才需要警惕

## 报告模板

```
图名 (id=..., N 节点) [范围: main/composite]
事件入口: ...
每条执行链: 入口 → 分支 → 关键操作（附关键参数）
复合: 被调用复合 + 各自内部逻辑（嵌套层级）
关键数据来源: 有疑问的节点输入
疑点（需核验）: 1. ... 2. ...
```
