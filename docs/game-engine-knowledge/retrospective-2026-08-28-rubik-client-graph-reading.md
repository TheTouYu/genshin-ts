# 完整复盘：魔方客户端图读图——客户端节点图识别与解读方法论（2026-08-28）

> 范围：读图分析任务「魔方-客户端优化版本.gil」（2026-08-28 会话），只读分析、无代码改动。
> 视角：客户端节点图（CharacterControlSkill/StatusNode/BooleanFilter）的读图方法论 + 读图工具缺口 + 该地图的架构知识。
> 证据：真实 GIL `/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/魔方-客户端优化版本.gil`
> （SHA-256 f90ac5438c3211f8782e39706945ecbaa205b6a30cb2dd2c19339361c604c5e1，9 图 / 191 节点客户端图 /
> 1 信号「旋转信号」）；会话历史：DSH 今日 8+ 个同任务会话（用户多轮重试，本次为完成会话）。
> 状态：已交付报告；技能已迭代；open-items 已登记；客户端遍历语义与 UI 计数链待游戏核验。

## 一、错误/坑谱系总览

| # | 层 | 具体错误 | 根因 | 修复 | 记录位置 |
|---|---|---|---|---|---|
| 1 | 工具读图 | explain/parse 把客户端图节点错标成服务端 API 名（「多分支」显示为 Set Custom Variable Dict Str List Int、「节点图开始」显示为 Set Custom Variable Dict Str List Bool、「获取自定义变量」显示为 When Custom Variable Changes） | 工具名字解析只查服务端名字表（node_pin_records），客户端 genericId 与服务端 ID 撞号后落到错误条目 | 读图时按 genericId 查 `client_node_metadata.ts`（subType 过滤）手工映射；工具修复登记 O-2026-08-28-05 | 本复盘 + 技能 Step 2.8 |
| 2 | 引擎语义 | 客户端「多分支」OutFlow 引脚与 case 的对应关系不明确 | 客户端 multiple_branches 的 out_flow[0] 是 default 未匹配分支，out_flow[i]=case[i-1]（i≥1），与直觉"第 0 引脚=第 0 case"相反 | 读真实 GIL 逐引脚核验（F→OutFlow[1]→范围中心 z=-1 等 9 面全部吻合）后固化到技能 | 本复盘 + 技能 Step 2.8 |
| 3 | 工具环境 | `parse --json > /tmp/g.json` 后另开 bash 命令读 /tmp 文件 → FileNotFoundError 反复重跑 parse（本次 ~4 次，每次 3-5s） | DSH 每 bash 调用独立沙箱，/tmp 不跨调用持久 | parse + python 分析合并到**同一条** bash 命令 | 技能 Step 2.6 补注 |
| 4 | 工具环境 | python 正则反斜杠转义（d/s/n）在 run_code→bash heredoc 链路中被吃，正则静默 0 命中（"genericId" 能 find、带转义的正则全不匹配，诊断花 3 轮） | JS 模板字符串先做转义处理，反斜杠在到达 bash 前丢失 | 正则写双反斜杠或改用无转义写法 | 技能 Step 2.6 补注 |
| 5 | 执行流判读 | 客户端 `遍历实体列表` 的 out_flow[0]/[1] 与「有限循环」（0=循环体/1=完成）语义相反还是相同无法从 GIL 静态确定 | 两种解释都读得通；设计自洽性（"是否还原"必须在计数完成后发）指向 0=完成/1=每次 | 按设计自洽判定并在报告标注"需游戏核验"；登记 O-2026-08-28-06 | 本复盘 |

## 二、本次任务的核心成果（方法论提炼）

### 2.1 客户端节点图识别（graph.id.type 字段）

真实 .gil 里节点图的 `Id.type`（`list-gil-node-graphs.ts` 输出的 `type` 字段）枚举来自官方 proto
`src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/protobuf/gia.proto`
`NodeGraph.Id.Type`：

```text
20000 BasicNode(服务端玩法图)  20001 BooleanFilter(客户端过滤器)  20002 Skills
20003 StatusNode(客户端状态图)  20004 ClassNode  20005 ItemNode  20006 IntegerFilter
20007 CreationStatusDecision  20008 CreationSkill  20009 CreationStatus
20010 CharacterControlSkill(客户端角色操控技能图)
```

本图 3 张客户端图：`完全隐藏`=20001、`选中状态`=20003、`指令->旋转魔方块实体…`=20010。
**读图第一眼先看 list 输出的 type 字段**，非 20000 的图走客户端读法（Step 2.8）。

### 2.2 客户端图节点名解析

`parse --json` 的 `graph.nodes[i]` 有真实 `generic_id`/`concrete_id`；按 genericId 在
`src/thirdparty/…/node_data/client_node_metadata.ts` 里查 `subType` 与 `displayName` 即得真名
（本次 191 节点全量映射成功，`subType: 'character_control_skill'` 子集覆盖该图全部节点）。

### 2.3 客户端「多分支」pin 语义（真实 GIL 核验）

- `OutFlow[0]` = **default/未匹配** 分支；`OutFlow[i]` = case[i-1]（i≥1）。
- 多个多分支按 default 串联成 fallthrough 链 = 顺序分类器（n=22→28→29→30→31→32→33：
  普通转/撇转/双重转/宽转/宽撇/宽双重/整体转，最后 default = 指令异常兜底发信号）。
- 恒真条件的「双分支」单 OutFlow 挂 7 条边 = **扇出 fork**（同一指令族 7 个独立处理开关全部进入，
  只有命中的那个真正执行）。
- 客户端「有限循环」out_flow[0]=循环体 / [1]=完成（真实 GIL 核验）。

### 2.4 该地图的架构知识（读图产物）

- **客户端优化原理**：转动的一切计算（26 个多分支查表指令解析、层内方块坐标区间筛选、
  轴×角向量、角速度、整体朝向更新、还原预测）全部在 191 节点客户端 CharacterControlSkill 图内本地完成；
  服务端只留 30 节点动画执行器（魔方块-旋转）。每转一次客户端只向服务端发一条 6 参数「旋转信号」。
- **触发链**：悬浮页按钮（字典按键取转动字符串）→ 服务端 UI 图写玩家变量「指令」(触发事件=true)
  → Cast Specified Skill Instance（技能实例ID）→ 客户端图「节点图开始」运行。
- **busy 锁闭环**：客户端给层内方块 `添加单位状态 1077936131` → 服务端动画图
  `Query If Entity Has Unit Status` 只动被标记方块 → 运动设备停止时服务端移除状态。
- **信号 6 参数**：旋转时长 / 旋转角度(轴角向量) / 是否还原(计数==26) / 魔方整体向前向量 /
  魔方整体向上向量 / 指令异常。
- explain 把客户端图入口「节点图开始」显示为"孤立执行链"是**正常现象**（客户端图无事件/InFlow 入口，
  由技能释放触发），不是坏图。

## 三、系统性根因（为什么读得磕磕绊绊）

1. **读图工具链只覆盖服务端图**：explain/parse/scan 的名字解析、控制流模型（事件入口/复合 InFlow）
   都按服务端图建模。客户端图节点族（multiple_branches/traverse_entity_list/node_graph_begins 等）
   没有名字表和语义映射 → 第一步就被错标名字带偏，险些把「多分支」当「Set Custom Variable」。
   规律：**读图先看 graph type，非 20000 的图不要信 explain 的节点名**，一律走 client_node_metadata 映射。
2. **引擎语义只有真实 GIL 能裁决**：多分支 OutFlow[0]=default 的偏移语义，任何文档/代码推断都可能猜反；
   逐引脚对照（case 列表 ↔ OutFlow 目标 ↔ 目标的字面量赋值）是唯一可靠核验法——本次用 9 个面全部吻合
   才敢固化。
3. **分析脚本的环境假设在 DSH 下不成立**：/tmp 跨调用持久 + 反斜杠转义这两个"习惯"在 bash 原生环境成立，
   在 run_code 沙箱里静默失效，且失败形态是"无输出/0 命中"而非报错 → 容易误判为工具没数据。
   规律：分析型命令用一条 bash 串完成 parse+分析；正则转义统一双反斜杠。

## 四、流程与方法论教训

- **有用**：先啃客户端元数据文件（client_node_metadata.ts）再读图，一次把 30 个 genericId 全部映射，
  后续所有 pin/flow 分析都建立在真名之上，避免反复猜。
- **有用**：case↔引脚映射核验用"case 列表 × OutFlow 目标 × 目标字面量"三方互证（F→z=-1、U→y=+1、
  E/M/S→层数1+中心0 等全部闭合），这是本次读图没出大错的锚点。
- **绕路**：读图早期被工具错标的节点名带着走了两步（把 74 个"Set Custom Variable"当成了变量操作，
  直到看 OutFlow 多出边才起疑）。先查 type 字段 + 先映射名字可省这两步。
- **绕路**：/tmp 与正则转义两个环境坑合计浪费约 6-8 轮往返，属"工具环境假设"类坑，已固化进技能。

## 五、风险探索与未闭合项

- [ ] O-2026-08-28-06：客户端 `遍历实体列表` out_flow 语义（按设计推断 0=完成/1=每次，与有限循环相反）待日志核验。
- [ ] O-2026-08-28-07：玩家-界面图 n=62 计数链（遍历方块统计"运动完成魔方块数量"）读不到执行流入口
      （监听信号 n=88 无执行出边），待游戏日志核验是否随信号触发。
- [ ] 客户端图 191 节点是否计入地图节点预算（2000 红线口径）未验证。
- [ ] O-2026-08-28-05：parse/explain 客户端节点名错标，工具修复方向已登记。

## 六、产出清单

- **报告**：本会话最终解读报告（渲染动画链路 + 客户端优化原理，含 5 条疑点）。
- **技能**：`gil-node-graph-reading/SKILL.md` 新增 Step 2.8 客户端节点图读法（类型枚举/名字映射脚本/
  多分支 pin 语义/入口判读）+ Step 2.6 单命令分析补注 + 陷阱清单补客户端图条目。
- **复盘**：本文件。
- **open-items**：O-2026-08-28-05/06/07/08（05=工具错标、06=遍历语义、07=UI 计数链、08=PKC 待录入）。
- **未动**：工作区遗留改动（src/cli/gil_ui.ts 浮窗改造、examples/rubik-3x3 prefabs.ts、.tmp_cube/、
  根目录 explain 输出残留文件）属其他会话，未纳入本轮提交。
