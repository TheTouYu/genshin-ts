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
npx tsx src/cli/gsts.ts assets:node-graphs read --gil <map.gil> --graph <id> --node <n>   # 单节点（explain 过长时定点替代）
npx tsx src/cli/gsts.ts assets:node-graphs read --gil <map.gil> --composite <defId>       # 复合定义接口 + impl 图节点详情（2026-08-19 起直接带出 implGraph/implNodes，免二次 --graph）
npx tsx tools/parse-gil-node-graph.ts <map.gil> --graph <id> --json                        # 底层结构（含 value）；输出键名速查见 gil-node-graph-reading SKILL.md Step 2.6
npx tsx tools/compare-gil-node-graph.ts <before.gil> <after.gil> <graphId>                # 差分（仅单图）
npx tsx tools/diff-gil-files.ts <before.gil> <after.gil> [--detail <graphId>] [--full]    # 文件级全量 diff（NodeGraph 1/4 + CompositeDef 2，含同 id 双记录）
# 管道解析 JSON 时用 ./node_modules/.bin/tsx（npx 的 npm notice 会污染 stdout）

# 建图 / 挂载（2026-08-09 turn-ctl 实战验证）
npx tsx src/cli/gsts.ts assets:node-graphs create --gil <map.gil> --name <图名> --output <候选.gil>   # 新建空图（--output 不覆盖）
npx tsx src/cli/gsts.ts assets:mounts attach <entity-id> --gil <map.gil> --graph <gid> --output <候选.gil>  # 挂载到场景实体（默认）或 --def 元件定义
npx tsx src/cli/gsts.ts assets:mounts list [<target-id>] --gil <map.gil>                 # 挂载全景 / 某目标的挂载列表

# 建图/挂载链路（2026-08-14 复合族实验复盘补充）——三件事的顺序：
#   ① create/--name 建空 placeholder 图（或 gsts 注入 .gia 填内容）
#   ② 填充内容：a) gsts 单文件注入编译产物（推荐，verify-injection 技能流程）；
#      b) 本技能 patch ops 直接编辑空图（节点/连线/参数）
#   ③ assets:mounts attach 挂载到实体/元件定义（可选——挂载后图才随实体生效）
# 空图不挂载也能被事件触发（图 id 直接存在即生效），挂载用于"实体携带逻辑"场景；
# 编辑器里"创建节点图 + 三个箭头"= 建图 + 挂载到三个目标（等价 assets:mounts attach × 3）。
# 新建图 id 自动分配（1073741825 起递增）；同地图多图时注入务必核对目标 id（见 verify-injection 关键点 2b）。
# 改（默认 preview 不落盘；--output 写候选；--write 备份+写回真实；**impl 图（复合实例体，16107xxxxx）可直接 patch**，2026-08-10 魔方 Bind 复合实战验证）
npx tsx src/cli/gsts.ts assets:node-graphs patch --gil <map.gil> --graph <id> <ops...> --output <候选.gil>
# 自动布局 / 布局 lint（2026-08-11 布局长期方案）：
npx tsx src/cli/gsts.ts assets:node-graphs layout --gil <map.gil> --graph <id> --check          # 只检查（lint），报告违规
npx tsx src/cli/gsts.ts assets:node-graphs layout --gil <map.gil> --graph <id> --output <候选> # 按拓扑自动重排 → 候选
npx tsx src/cli/gsts.ts assets:node-graphs layout --gil <map.gil> --graph <id> --write         # 自动重排 + 备份写回
# 说明：引擎 src/cli/static_assembly/graph_layout.ts（autoLayout 坐标 + planFlowUpgrade 超限拆线 + checkLayout lint）；自动布局会改写连接（超长线自动升级为分叉线），先 --output 预览再 --write
# 跨图复制（把另一张图/另一文件的节点链搬过来）：
npx tsx src/cli/gsts.ts assets:node-graphs patch --gil <候选.gil> --src-gil <源图.gil> --graph <目标图> \
  node-copy-from <源图id> <idx1,idx2,...> <x> <y> --output <新候选.gil>   # 保持相对布局 + 自动重映射连线
# 清空图全部节点（保留图记录/变量/挂载）：
npx tsx src/cli/gsts.ts assets:node-graphs patch --gil <map.gil> --graph <id> graph-clear --output <候选.gil>
```

### 节点 ID / 名称查询速查（先查这里，别翻第三方定义文件）

```bash
# 名称→ID（node_pin_records.ts 的 reflectMap 含变体 concreteId 与 indexOfConcrete，一行命中）
grep -n "3D Vector Zoom\|Subtraction\|Multiple Branches" \
  src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.ts
# 精确解析（多行排版）
python3 - <<'PY'
import re
src = open('src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/node_pin_records.ts').read()
for m in re.finditer(r"name: '([^']+)',\s*\n\s*id: (\d+),(.*?)(?=\n  \})", src, re.S):
    if any(k in m.group(1) for k in ('Zoom', 'Subtract', 'Multiply', '缩放', '减法', '乘法')):
        print(m.group(1), m.group(2), re.findall(r"\[(\d+), '([^']+)'\]", m.group(3)))
PY
# 备选：python .agents/skills/editor-incremental-gia-investigator/scripts/extract-node-defs.py <data.json> --list
```

### 图编辑库导出位置（自写脚本 import 前先查这里）

| 模块 | 导出 |
|---|---|
| `src/cli/static_assembly/wire.ts` | `parseWireMessage` / `emitWireMessage`（wire 编解码，脚本 import 首选；**不在** graph_edit.ts） |
| `src/cli/static_assembly/graph_edit.ts` | `addGraphNode` / `copyGraphNode` / `setParam` / `linkInParam` / `addOutFlow` / `addParamFlow` / `buildVarValue` / `wrapConcreteValue` / `parseNodeRecord` / `locateBlobField` / `addGraphVariable` / `patchRecord` / `patchGraphNode` / `addCompositePin` / `parseGraphNodes` / `locateGraphField` 等 |
| `src/cli/static_assembly/wire.ts` 导出名 | `parseWireMessage` / `emitWireMessage` / `wireMessage`（**没有 `sub`**——2026-08-12 bind-hold 曾 import `sub` 连错 2 次；自写脚本先 `grep "^export"` 再 import） |
| `src/cli/static_assembly/graph_edit.ts` 复合构建 | `buildCompositeDef` / `buildCompositeImplGraph` / `addInflowFlow` / `compositePinWire`（2026-08-11 eval-split 备选方案实战：`composite create` 会把内部全部 OutFlow 提升为复合 outflow，**内部链复合必须用这组库函数手建 def+impl**，见常见任务 playbook「复合构建（程序化）」） |
| `src/cli/gil_signal_registrations.ts` | `registerSignalInGil` / `repairSignalInGil` / `updateSignalInGil`（CLI 被残缺注册阻塞时的直调入口；读回用 `tools/scan-gil-signal-registry.ts`） |

### patch ops（顺序执行）

| op | 语法 | 说明 |
|---|---|---|
| 位置 | `node <idx> pos <x> <y>` | 设节点坐标 |
| 参数 | `node <idx> param <shell> <typed>` | 设 InParam 固定值（Int:1 Flt:1.5 Str:abc Bol:true Vec:1,2,3 Gid:1 Pfb:1 Cfg:1 **EnumItem:1101**；类型前缀大小写敏感；**R<T> pin 自动 ConcreteBase 包装**）。EnumItem 编码=bEnum{1:枚举数值}（2026-08-10 真实快照闭合：Bind 复合 668 InParam[5]/[6]） |
| cases 列表 | `node <idx> cases <v1,v2,...>` | 全量替换 MultiBranch cases（Int/Str 均可；需已有非空列表作模板） |
| 数据连线 | `node <idx> link <shell> <src-idx> [src-shell]` | 目标 InParam ← 源节点输出；**对"已有 value 无 connects"的 Fixed pin 是静默 no-op**（linkInParam 只替换已有 f5，graph_edit.ts:689）——值→连线转换用 `tools/gil-pin-value-to-link.ts`（2026-08-12 bind-hold 实测） |
| 断数据线 | `node <idx> unlink <shell>` | Fixed 删 pin / Variant 清 connects |
| 控制流连线 | `node <idx> flow <shell> <dst-idx> [dst-shell]` | 源 OutFlow → 目标 InFlow（pin 不存在会自动新建） |
| 断控制流线 | `node <idx> flow-rm <shell> <target>` | 从源 OutFlow 删一条 connects；无余线时整 pin 移除 |
| 加节点 | `node-add <generic-id> <x> <y>` 或 4 参 `node-add <generic-id> <concrete-id> <x> <y>` | 3 参=旧形式（Variant donor fail closed）；4 参=显式 concrete（reflectMap 校验，f2/f3 与真实样本同构，2026-08-12 闭合）；无 pin 落盘 |
| 复制节点 | `node-copy <src-idx> <x> <y>` | 完整克隆源记录（含 pin 值/cpi/ClientExec），即编辑器复制粘贴语义 |
| 删节点 | `node-del <idx>` | 删记录；**先断掉指向它的连线**（源侧 connects 会悬空）；impl 图（section 4）实测可用（2026-08-12 bind-hold 首验）；索引变空洞，后续 node-add 复用最小空洞（diff 显示 changed 而非 removed，属正常） |
| 清空图 | `graph-clear` | 移除全部节点（图记录/变量/挂载保留） |
| 跨图复制 | `node-copy-from <src-gid> <idx1,idx2,...> <x> <y>` | 配 `--src-gil <文件>`；保持源内相对布局平移、自动重映射列表内连线；引用列表外节点 fail closed 报错 |
| 图变量注册 | `graph-var-add <name> <type>` | 仅 Str(6) 闭合；exposed/structId 默认省略 |
| 复合改名 | `composite <def-id> rename <名>` | |
| 复合分类 | `composite <def-id> category <名称\|clear>` | 名称可含路径 `复合节点/xxx` 或简写 `xxx`；`clear`=移回默认分类（wire 规则见 references/wire-rules.md「复合分类」） |
| 复合参数改名 | `composite <def-id> param input\|output\|inflow\|outflow <shell> rename <名>` | |
| 复合加输入 | `composite <def-id> add-input <shell> <name> <type> <inner-node> <inner-shell>` | 实例唯一才允许；每输入只绑 1 条 inner——**共享映射**（1 outer 供多 inner，如 pivot→668 IP1×4、c1→668/99/365 IP0×3）用 `tools/inject-composite-pin.ts` 补注（2026-08-12 bind-hold 流程） |
| 复合加 InFlow | `composite <def-id> add-inflow <shell> <name> <inner-node> <inner-shell>` | 只 patch def+impl，**实例不落 pin**（真实实例无 InFlow pin）；inflow 记录无 name 字段（2026-08-12 闭合） |
| 复合创建 | `composite create <名> <anchor-idx> <node-idx...>` | 选节点打包成复合 |
| 复合删/换输入 | `composite <def-id> del-input <shell>` / `swap-input <a> <b>` | 实例重编号 |

## 安全流程（写回真实地图的固定步骤）

```
0. 动源图前先导出：parse --json 落盘源图全量结构（复制源 + 对比基准），再开始改
1. 快照：cp 真实 .gil → ~/genshin-ts-evidence/<实验>/raw/before.gil + sha256sum 记录
2. 候选：patch --output /tmp/cand.gil（或分步脚本 step1→step2→…），不碰真实文件
3. 回读：read/parse 验证候选结构符合预期；改动唯一性验证：
   a. 单图细节：tools/compare-gil-node-graph.ts <before> <after> <graphId>（仅单图）
   b. 文件级全量：用 playbook「文件级 diff 脚本模板」对比 before/after 全部记录，
      输出应为「预期改动 + 其余记录逐字节相同」；可疑项先逐字节核对再下结论
      （注意 def+impl 同 id 双记录：记录键必须带序号，勿用首次匹配）
   c. 变量名三方一致性（2026-08-11 游戏核验教训：名字错一个不报错但逻辑静默错）：
      tools/scan-gil-var-pins.ts <cand> 零新增违规（缺/空/裸节点）；
      再逐节点核对「定义名 == 设置时名 == 使用时名」三方一致：
      实体自定义变量定义集（assets:entities 或相关图段）vs 所有 Get/Set Custom Variable
      引用的变量名 vs 图变量（Node Graph Variable）；注意大小写、全角/半角、前后缀差异；
      read --node 输出带 [变量=...] 注解，逐变量核对；不一致必须修（优先改引用侧对齐定义侧）
4. 写回前：sha256sum 真实文件 == 步骤 1 记录（用户可能又在游戏里动过，变了就停下问）
5. 写回：cp 候选 → 真实 .gil（先备份 .gsts/backups/<map>.<时间戳>.<说明>.bak）
6. 复读：写回后再 read 一遍真实文件确认
7. 报告：备份路径 + 改动摘要 + 游戏核验点；工作区指纹用
   `find src tests docs .agents -newer <候选.gil> -type f`（git status 有会话前改动会误报）
```

## 已闭合 wire 规则速查（真实快照 + 工具回归）

详见 `references/wire-rules.md`（操作前按需加载）。摘要：

- **控制流**：源 OutFlow 默认(0) index 省略 / 非默认显式；目标 InFlow 默认省略 / 非默认显式；
  断线 = 从源 OutFlow 删 connects 记录；无余线整 pin 移除；新 OutFlow 按 ShellIndex 升序排参数 pin 前
- **数据流**：connects 挂目标侧 InParam；替换线改 connects.id；Variant 类型不匹配删整 pin
- **Variant/MultiBranch**：concreteId=KernelID（3 多分支 Int=3 / Str=4）；key/cases 两个 InParam；
  cases 列表 IntegerList type=8；未连线 case 不实例化 OutFlow pin
- **节点增删**：node-del 只删记录（impl 图 section 4 已闭合，2026-08-12）；node-add 用最小空闲索引（复用删除空洞）、无 pin 落盘
- **cases 条目**（scripts/patch-cases-list.ts 已验证）：`{1:2, 2:1, 4:{1:1,6:{2:3}}, 102:{1:val}}`，
  bInt(102) 的 val 在字段 1

## 未闭合功能清单（fail closed，遇到先停下）

| 功能 | 现状 | 对策 |
|---|---|---|
| ~~node-add Variant 节点（含 MultiBranch）~~ | ✅ 已闭合（2026-08-12）：`node-add <generic> <concrete> <x> <y>` 显式 concrete（f2/f3=nodeRefWire 22000 双写，与真实样本逐字节同构）；无 concrete 的 Variant donor 仍 fail closed | 显式 concrete 用前先 `read --json` 确认 reflectMap 含之 |
| 复合 impl 记录 id 查找 | ✅ 已闭合（2026-08-12）：`compositeImplGraphId` 读 def field4.sub4（defId≠implId，勿硬编码 +0x10000） | add-input/del-input/swap-input/add-inflow 均已用 |
| 图变量定义（graph variables） | 注册已闭合（`graph-var-add`，Str 模板）；**使用**（Set/Get）已闭合（全变体 f3/indexOfConcrete 见 wire-rules；R<T> 固定值已闭合）；**跨图复制 f6 变量记录已验证**（turn-ctl：11 个 Ety/Bol 原样搬移，见 wire-rules） | 图变量跨图复制仍是临时脚本（f6 记录搬移，见 wire-rules）；节点跨图复制已正式化（`node-copy-from`） |
| cases 列表写入 | ✅ 已正式化（`node <idx> cases <v1,v2,...>`，2026-08-09 并入 CLI；`scripts/patch-cases-list.ts` 逻辑同源；Q2 扩展 Str 条目） | 空列表无法克隆模板，fail closed |
| 节点重编号 / 墓碑复用 | 部分闭合（composite ops 有） | 尽量不触发 |
| 复合实例的节点增删 | 未闭合 | 用户编辑器最小变化 |
| ~~impl 图（section 4）patch~~ | ✅ 已闭合（2026-08-10）：`--graph <impl 图 id>` 自动探测 section 4，node pos/param/link/flow 等 op 可用（Bind 复合 668 EnumItem 实战）；✅ node-add / node-del / unlink 等结构性 op 已实测（2026-08-12 bind-hold：12 unlink + node-del + 5 node-add 全成功，回读/布局/diff 全过） |compositePin 注入需脚本（`tools/inject-composite-pin.ts`，未入 CLI ops） |

## 布局规范（书页式；新建/复制/自动布局必读；2026-08-11 用户确认 + 引擎 graph_layout.ts 实现，真实地图 1073741849 三图验证）

总体像看书：**长线横向（从左到右），多条长线从上到下堆叠成行**；事件起点 = 一个长方形代码块，块从上到下排列。

- 坐标约定：x 向右、y 向下；行内节点步进 800（NODE_X_STEP）、行距 900（ROW_Y_STEP）、事件块间距 1200（BLOCK_Y_GAP）
- **事件起点（入口）= 一个代码块，块从上到下排列**；入口在行首，块内第一条线（OutFlow connects 顺序）与入口同行，后续线各占一行
- **一条长线 ≤ 10 个控制流节点**（LINE_LIMIT）：超限由引擎自动升级为分叉线（断开超限点、把新线头注册到入口 OutFlow，每条线独立成行）；lint 提示 long-chain 时也可用 `composite create` 拆复合节点
- 块内多条长线按执行顺序（OutFlow 顺序）从上到下，线行首垂直对齐（同一 x）
- **分支 = 叉子**：分支节点与上游同行（水平对齐），out[0] 同行右侧，其余出口同一 x 列垂直排列（间隔 900）；入口分叉时 out[1..] 从行首起垂直排列
- 数据源跟随消费者：单节点贴边（同行左侧优先，间隙 400）不重叠；多轮运算链（约 5 个）横排成一条线；更多建议写复合节点（lint data-chain-long）
- **复制源图节点必须重排坐标**（copySeq/copyFromSrc 传新 x,y），禁止保留源图坐标或让序号累积推远 x；新图从 (0,0) 起排
- **自动布局一键重排**：`layout --output/--write` 按拓扑重排（书页式 + 超限自动拆线分叉 + 数据源吸附 + 孤立节点收尾栏）——新建/复制图后直接跑，再手工微调
- **自动布局已知局限**（2026-08-11 eval-split 实测）：对跨行执行流（如 上游 busySet 行 → 下方实例行）会产出 `flow-upward` 违规——引擎按拓扑排位不保证流方向；跑完自动布局**必须重跑 `layout --check`**，剩余违规按规则手排（flow-upward：把目标行挪到源行下方；data-detached：数据源贴消费者 ≤1200；island：节点移到最近行内）
- **写回前 lint**：`layout --check` 零违规才算布局合格。违规类型：flow-upward（执行流向上）/ flow-backward（同行向左）/ chain-vertical（竖排链）/ long-chain（一行连续 >10 控制流节点，建议拆复合）/ block-order（事件块顺序错）/ line-align（分叉线行首未与入口对齐）/ data-detached（数据源离消费者 >1200）/ data-chain-long（数据链 >5，建议复合）/ island（孤岛 >2000）/ overlap（重叠）
- 回读检查：read 时看 pos——每条线内 x 递增、线间行首对齐且间隔 900；发现竖排链/孤岛/重叠立刻重排

## 常见任务 playbook

### 文件级 diff（安全流程第 3 步 b；替代自写脚本）

```bash
./node_modules/.bin/tsx tools/diff-gil-files.ts <before.gil> <after.gil>            # 全部图记录逐字节比对
./node_modules/.bin/tsx tools/diff-gil-files.ts <before.gil> <after.gil> --detail <gid>  # 对变化图追加节点级 diff
```
输出：`graphs`（主图+impl 图 section 1/4）+ `composites`（CompositeDef section 2，2026-08-12 复盘补）
两段 ADD/REMOVED/CHANGED + 每记录 blob sha256 摘要；**期望 = 预期改动 + 其余记录逐字节相同**；
同 id 双记录（def+impl）按记录序号自动分开，不再误报。
**stdout 是纯 JSON**：管道解析用 `2>/dev/null` 或 `NODE_OPTIONS=--no-deprecation` 前缀
（tsx 的 DeprecationWarning 是**两行** stderr，`2>&1 | grep -v Deprecation` 只滤第一行，
第二行 `(Use node --trace-deprecation ...)` 会破坏 JSON 解析——实测踩坑）。
**2026-08-10 增强**：①`--detail` 参数值不再误报 Usage（原 bug：值不以 `--` 开头被拒）；②主图+impl 图（section 4）全量覆盖（原只比主图，复合 impl 变化漏检）。`compare-gil-node-graph` 同步支持 impl 图。

### 跨图复制整条链（node-copy-from 用法）

```bash
# 1) 先 parse 源图落盘，确认要复制的节点闭包（被引用节点必须都在列表里）
./node_modules/.bin/tsx tools/parse-gil-node-graph.ts <源图.gil> --graph <源图id> --json > /tmp/src.json
# 2) 复制：闭包列表（逗号分隔）+ 链左上角目标坐标；相对布局自动保持
./node_modules/.bin/tsx src/cli/gsts.ts assets:node-graphs patch --gil <候选.gil> --src-gil <源图.gil> \
  --graph <目标图id> node-copy-from <源图id> 1,2,3,...,30,62,...,69 800 200 --output <新候选.gil>
# 3) 回读检查 pos（每条线内 x 递增、线间行首对齐间隔 900）与连线（无悬空）；超长链交给自动布局拆线
# 注意：复制列表外引用会报错并给出缺失索引；图变量（f6）需另行复制（见 wire-rules）
```

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

### 信号注册与回读（assets:signals；2026-08-11 eval-split 复盘）

1. **先探活**：`npx tsx tools/scan-gil-signal-registry.ts <候选.gil> --gate` —— 存在残缺注册项（definition 缺 field 106 信号名 CPI，如 1073741849 的 `cube2_test_turn` 1610612777/78/79）时，`assets:signals inspect/register/repair` **整体不可用**（`readRegisteredSignalsFromGil` 对任一残缺项抛错）。gate 退出码 1 = CLI 必挂，直接走第 3 步绕过，别浪费时间试 CLI。
2. **布局池规则**（register 前先评估参数可行性）：池 = **单个模板信号**（`--template-signal` 取本图信号 / `--template-gil` 取 donor 文件）内**同类型参数的真实布局集合**；同类型参数每出现一次必须消费一套**真实且不同**的布局，套数不足 fail-closed 拒绝（报错如 `parameter type "str" needs 2 distinct layouts, but the template GIL provides 1`）。本图 entity 布局全图只有 1 套（pin 三元组 69/77/84）→ 4 个 entity 参数不可行，**不要**手写布局绕过（pinIndex 必须来自注册定义，不能推算）。
3. **repair 限制**：`repair` 要求 donor 与 target **同名**且 donor 完整；残缺项无同名完整 donor 时无法修复，只能编辑器重建或删。
4. **绕过路径**（CLI 被阻塞时）：自写脚本 `import { registerSignalInGil } from 'src/cli/gil_signal_registrations'` 直调（返回 bytes+ids，无 CLI 外壳回读校验），产出候选后用手工/宽容工具回读自洽。注册后必须回读三份定义布局：send 信号名 CPI / monitor 执行输出+信号名 CPI（`tools/scan-gil-signal-registry.ts --signal <名> --defs`）。

### 复合构建（程序化；2026-08-11 eval-split 备选方案）

`composite create` 会把所选节点的内部 OutFlow 全部提升为复合 outflow——需要**内部链闭合**的复合（如 监听/停止事件 → Hold → 发信号 全在 impl 内）必须用库函数手建：
`buildCompositeDef(defId, 名, [])` → `addInflowFlow(defBlob, 0)` → `buildCompositeImplGraph(defId, nodes, [compositePinWire(1, 0, 6, 1, 0)])`，def+impl 两条记录 append 到 root10（section 2/4，用 `patchRecord`/`applyReplacement` 或自写 append 时注意插入序）；实例节点 = 仅 defId 引用的裸记录。复合 impl 内可放事件节点（真实样本：定时任务 impl 1610612737 含 When Timer Is Triggered）。

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
- **WSL 环境无 diff 命令**：文本对比用 `python3 -c "import difflib..."` 或 tools/compare
- **同 id 双记录**：复合 def 与 impl 图共用同一 id（如 1610612779 中心旋转），全量 diff 时记录键必须带序号，逐字节 hash 核对，勿用首次匹配（会误报变化）
- 用户要求只读分析时用 `gil-node-graph-reading`，本技能只管改
