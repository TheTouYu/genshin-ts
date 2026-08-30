# 服务端↔客户端节点图通信手段矩阵 + 客户端 API 覆盖清单

> 状态：草稿（2026-08-30 第 0 轮盘点产出，随轮次演进为定稿）
> 任务：地图 1073741915（变量图）上让服务端图与客户端图（20002/20010）之间每种通信手段
> 都有真实游戏内验证案例。证据分层铁律：编译/注入/回读 = 自动证据；游戏行为结论只认
> Beyond_Debug_Log 真实帧值（客户端图记录 f8=2097154；服务端 f22 文本）。
> 维护节奏：每轮验证后更新本表状态列 + verified-cases.md 登记。

## DSL 面硬约束（2026-08-30 盘点实证，源码 `client_graph_support.ts` / `client_nodes.ts`）

- 客户端图事件入口**只有 `on('start')`**（creation_status 另有有序 start1..10）；无定时器、
  无信号监听、无变量变化事件。
- 客户端信号 API 只有 `sendSignalToServerNodeGraph`（单向 C→S）。
- 客户端自定义变量**只读**：`getCustomVariable(targetEntity, variableName)`，无 set 系 API。

## 一、通信手段矩阵

| # | 手段 | 方向 | 关键节点/链路 | 已有证据 | 状态（第 0 轮） |
|---|------|------|--------------|---------|------|
| 1 | 技能施放触发客户端图（20002 角色技能/6 模板） | S→C | getAllCharacterEntitiesOfSpecifiedPlayer[0] → addCharacterSkill → createCustomSkillInstance → setCustomVariable(玩家,"技能实例ID") → castSpecifiedSkillInstance → 技能事件轨道(0.0s) → 客户端图节点图开始(200042) | 2997：客户端图记录 f8=2097154×32 | ✅ 闭环 |
| 2 | 技能施放触发客户端图（20010 操控技能/36 模板） | S→C | 同上 + 需玩家操控状态（未受控 Cast 静默无效） | 配置 1228931075 已建；d2-client.ts 为其编译目标 | ❌ 未闭环（操控状态链） |
| 3 | 自定义变量共享存储（S 写→C 读） | S→C 数据面 | setCustomVariable(服务端,玩家实体) → 客户端 getCustomVariable(200016).asType | **3008 我方闭环**：写入帧(Set=2)→客户端读取帧(OUT0:Integer=2, f8=2097154)→回传帧(cv=2)，N=2,4,7 三点一致；**前置=变量预注册**（3007 反证：动态创建变量客户端读无 OUT 帧→信号 val=None；受控差分：同编译产物仅注册差异→行为翻转） | ✅ 闭环 |
| 4 | 信号回传 | C→S | sendSignalToServerNodeGraph → 服务端 onSignal（d2lv_client：send=1610612741/monitor=1610612742/server=1610612743，tag:str val:int） | 2997：set→100 / len→3（str+int 两参） | ✅ 基本闭环（float/bool/vec3/entity/list 参数待扩） |
| 4b | 通知服务器节点图 | C→S | notifyServerNodeGraph(s1,s2,s3)（三参均需字面量）→ 服务端 whenSkillNodeIsCalled（callerEntity/callerGuid/parameter1..3） | DSL 双端面已确认（client_nodes.ts:5045 / events-payload.ts:1264）；PKC clm_D1A2 官方链路描述；无我方游戏证据 | ❌ 未闭环（候选第 2 轮） |
| 5 | 单位状态间接通道 | C→S | addUnitStatus(客户端) → When Unit Status Changes(服务端) | 官方魔方 2979（26 块加状态→27 块监听） | ❌ 我方 DSL 链路未验 |
| 6 | 客户端写自定义变量 | C→S | — | PKC clm_070E：本地节点图（客户端）自定义变量引擎面仅可读不可写 | ⛔ 引擎不支持（DSL 无 API + 引擎只读，双重确认） |
| 7 | 服务端→客户端信号直发 | S→C | —（客户端图无监听事件/节点 API） | — | ⛔ DSL 不支持（引擎面待查，低优先） |
| 8 | （参照）服务端信号广播 | S↔S | sendSignal → 任意监听图 | 2699 U1：跨图广播语义 | ✅ 闭环 |

每条闭环验收标准：触发端帧 → 链路中间值帧 → 接收端执行帧，三点齐备且值一致。

## 二、客户端 API/DSL 覆盖清单（约 20 类目）

### 已验证（游戏内 2997，f8=2097154 + 服务器 f22）
1. localVariable int（显式名 + 常量 init + set 后读回 = 100）
2. localVariable int_list（字面量 [1,2,3] 值保留）
3. getListLength（= 3）
4. sendSignalToServerNodeGraph（str + int 两参）
5. on('start') 生命周期（施放触发顺序执行，非响应式）

### 自动证据（编译/wire/注入回读），无游戏行为证据
6. localVariable 其余 18 类型 + dict 声明锚（批次 9 容器元数据）
7. assemblyList / copyList / createDictionary / assemblyDictionary（wire 层）

### 已验证（游戏内 3008，手段 3 闭环随带）
8. getCustomVariable（客户端读服务端写入值；前置=预注册）✓ OUT0:Integer=2
9. 实体查询族：getCurrentCharacter（OUT0:Entity=4）/ getPlayerEntityToWhichTheCharacterBelongs（带参版，角色4→玩家3）✓

### 待验证（游戏内，按优先级）
10. 信号参数类型扩展：float / bool / vec3 / entity / list
11. 列表操作族：getCorrespondingValueFromList / min / max / listIncludesThisValue
12. dict 值族：queryDictionarySLength（非空 dict 读写）
13. 数学逻辑族客户端版：addition / equal / doubleBranch / finiteLoop
14. 向量族：create3dVector / 加减 / 点叉 / 归一化
15. 技能查询族：getSkillConfigIdBySkillInstanceId / querySkillInstanceIdBySkillSlotAndSkillConfigId / querySkillVariableValue
16. 时间族：getCurrentClientTime / HighPrecision
17. 输入族：getCurrentKeyBehavior / getPlayerMovementInput / getCursorHitResult / getPlayerClientInputDeviceType
18. 坐标转换族：worldCoordinatesToScreenCoordinates / screenCoordinatesToViewportCoordinates
19. 单位状态族：addUnitStatus / removeUnitStatus / whetherTheEntityHasTheSpecifiedUnitStatus
20. 枚举族：enumerationMatch；客户端施放：castSkillFromSpecifiedSlot；仇恨/控制马达/预瞄族（低优先）

失败项归因口径：引擎不支持 / 编译缺陷 / wire 未闭合 / 需前置状态（如操控）。

## 三、轮次计划

- **地图决策（2026-08-30 用户指示）**：创建新地图开始验证；1073741915（变量图）与
  1073741913（魔方-客户端优化版本）仅作参考图。理由：旧图有编辑器保存清零史、双 5s
  定时器仲裁、复合残留等干扰，新地图归因干净。
- 第 1 轮（✅ 已闭环，3008 日志）：手段 3——服务端图双定时器（cv_write 4s 写玩家变量
  d2c_counter=序列 / cv_cast 10s 施放链触发 20002 客户端图）→ 客户端读变量回传。
  **3007 首测失败 → 归因动态创建变量客户端不可见 → 预注册（顶层+9 副本）→ 3008 闭环**。
  证据链：写入帧 Set=2 → 客户端读取帧 OUT0:Integer=2（f8=2097154）→ 回传帧 cv=2；
  N=2,4,7 三次一致。附带观察：同 tick 双定时器 cv_cast 先于 cv_write 执行（t=20 读到
  t=16 的值 4 而非当 tick 值 5，单样本）。
- 候选后续：信号参数类型扩展（手段 4 加固）→ notifyServerNodeGraph 通道（手段 4b）→
  单位状态通道（手段 5）→ 20010 操控链（手段 2，需用户操控配合）→ API 清单 10-20 按族
  批量验证（每轮一族，共用信号回传通道）。

## 四、已知局限（做归因时参考）

- 客户端图在 d2skill tick 双执行；d2lv tick 的施放不产生客户端执行——引擎时序未闭合。
- When Timer 节点无名称过滤，同实体任意定时器触发都会进入（按 evt.timerName 分流）。
- 技能装配 = 编辑器【战斗预设】；CLI 装配未实现（root16 变体 wire 未闭合）。
- 客户端图打印不落服务器日志（f8=2097154 记录无 f22）——观测只能靠信号回传或客户端帧值。
- 1228931075 有 3 条 body-f5 绑定叠加待清理；1098907652 创建后丢失根因未查。
