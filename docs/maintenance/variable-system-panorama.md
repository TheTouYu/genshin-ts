# 变量系统问题全景地图与三层执行计划（跨会话）

> 状态：当前推荐（任务地图 + 计划；本文件是跨会话工作入口，不是引擎语义 Authority）
> 来源：官方千星知识库 / 米游社问答楼 / PKC 知识树 / 本地权威文档 / 当前源码与 CLI（各节分别标注）
> 最近校验：2026-08-29
> 适用范围：千星沙箱（原神 UGC）变量体系——按范围（自定义/节点图/局部）+ 按实体特殊性
> （元件/普通实体/关卡/玩家/角色）+ 特殊类型（列表/字典/结构体暂缓）+ 四类操作（定义/设置/获取/引用）
>
> 引擎语义 Authority 入口不变：`docs/game-engine-knowledge/variables.md`、
> `variable-scopes.md`、`gil-structure-semantics.md`；本文件只做地图与计划，不新增 wire 结论。

## 0. 三层执行计划总览

| 层 | 内容 | 输入 | 产出 | 验收 |
| --- | --- | --- | --- | --- |
| 第一层（本会话已完成） | 探索问题全景地图 | 官方/论坛知识点 + PKC + 本地文档 + 代码/CLI | 本文件 §1-§5 | 五类变量范围/实体/类型/操作全部有据可查；坑清单与能力矩阵落盘 |
| 第二层（与用户配合） | 差分样本 → 规律 | 用户在编辑器做 10 秒最小差分实验 | 每条规律 = 样本 SHA + 观察 + 结论 + 适用范围，录入 \`docs/game-engine-knowledge/\` + PKC | §4 差分清单逐项闭合或标记失败 |
| 第三层 | 系统性修复 | 第二层已闭合的规律 | 编译器/CLI/工具/文档修复 + 回归 + 真实 GIL 回读 + 用户游戏核验 | 读图核验红线通过 + 分层报告 |

**跨会话约定**：每层/每批完成后更新本文件「§6 进度检查点」；新会话恢复上下文 =
读本文件 §6 → 按 AGENTS.md 检索优先级查 PKC/文档 → 继续。

---

## 1. 变量知识全景（按用户框架）

### 1.1 按范围：三类核心 + 一类旁系

#### A. 自定义变量（= 实体变量）
来源：官方《自定义变量》mhso1b9wjica + 本地 PKC clm_070E69D18F1EBD551E2925921D + `variables.md`

- 存储：实体「自定义变量组件」内；**所有单位默认挂载该组件**；以变量名（字符串）为唯一索引，同实体不可重名。
- 类型：基础（整数/浮点/字符串/布尔/三维向量/实体/GUID/元件ID/配置ID/结构体）+ 全部基础类型列表 + 全部字典类型。
- 整数范围：-2147483647 ~ 2147483647（不含 -2147483648）。
- 生命周期：跟随组件（及实体）；实体销毁同步销毁。
- 作用域：**读写全局**（任意图可读写任意实体上的变量）；**变化事件只推送给节点图所挂载的实体**。
- 节点：设置（目标实体/变量名/变量值泛型/是否触发事件）、获取（查询，泛型出参）、自定义变量变化时（事件；
  同值写入也触发；**容器类型变化事件无变化前/后值**）、查询自定义变量快照（仅「实体销毁时」事件可用）。
- 客户端/本地图可读；**只有组件里默认创建的变量会同步到本地**（供界面/本地过滤器）。
- 官方文档内部矛盾（列入差分清单 D2）：一处说「设置节点要求变量已存在，否则无法执行」，
  另一处说「可动态创建新变量（不得重名）」。
- **容器类型引用传值**：列表/字典/结构体变量是引用语义，列表插入/排序等操作直接改存储数据；
  引用型修改不触发变化事件，仅「设置自定义变量」触发。

#### B. 节点图变量
来源：官方《节点图变量》mhtshailzs7w + PKC + `variables.md` / `variable-scopes.md`

- 仅服务端节点图可用；生命周期跟随节点图；定义域限本图（跨图不可见）。
- 同名允许跨图并存（各自独立状态）。
- 可「向关卡暴露」→ 编辑关卡时按实体覆写（暴露 wire 未闭合，见差分清单 D9）。
- 官方表述「挂载在实体上时该实体持有这些变量」vs 论坛（冰糖小樱桃）「挂载同一张图的实体都
  共享这份变量（相当于服务器端局部变量）」——**语义冲突，列为差分清单 D1**。
- 引擎节点 ID：设置 323 / 获取 337（`tools/scan-gil-var-pins.ts` 头部确认）。
- 日志形态：图变量 get/set 是两级帧 {N.03 主, N.04 子}（04 先于 03）；实体变量 get/set 是单帧。

#### C. 局部变量
来源：官方查询/执行节点说明 + 米游社问答 + PKC clm_A154340AA0EAEA30107AB18040 + `variable-scopes.md`

- 「获取局部变量」（查询，可设初始值）+「设置局部变量」（执行，值覆写语义）两个节点；
  vendor id：Get=18 / Set=19。
- 生命周期**跟随事件节点的执行流**：执行流结束即消失，不能跨事件流/跨实体取用（论坛实测答复）。
- GIL 编码：**wire 中无名**，只有类型码 E<1016>（LocalVariable）；身份沿数据连线引用链传递
  （Set 的 E<1016> 输入通常直连某 Get 的 E<1016> 输出）。「按名映射」不可行。
- 论坛：部分编辑器版本局部变量类型选项缺少结构体列表（用节点图变量替代）。

#### D. 技能变量（旁系，用户框架外的第四类）
来源：官方《技能变量》mhhzqw98264i

- 持久化在玩家身上的**客户端**值；默认浮点、暂不支持其它类型；客户端节点直接改立即生效；
  **角色倒下后置 0**；系统菜单管理（变量名 + 配置ID）；节点=设置/增加/查询（客户端，角色技能类）。
- 与「角色实体变量」不是一回事：技能变量按玩家职业持久化、可跨节点图取用。

### 1.2 按实体特殊性

| 实体 | 性质（官方文档） | 变量承载 | 工具链支持 |
| --- | --- | --- | --- |
| 元件（root4 定义） | 定义本体；动态元件支持组件/变量，**静态资源不支持变量/组件/高级功能**（写变量会损坏存档，用户实证 2026-08-20） | 定义 f8 组件槽 `.8.11` | `assets:custom-variables`（target prefab，config 声明）+ `assets:prefabs update` 三层同步 |
| 普通场景实体（root5） | 引用定义；**运行时各自持有变量值**（继承的是定义不是值） | 实体 f7 组件槽 `.7.11` | `assets:entities import` 自动继承定义变量容器 → `assets:custom-variables --entity` 读写 |
| 关卡实体 | **游戏运行时默认创建**（1094713345，官方 defId=10003004）；**禁止手动 import**（会导致地图异常） | root5.1 关卡实体记录 f7[11] | `assets:level-variables list\|create\|update`（默认 --entity 1094713345） |
| 玩家实体 | **纯逻辑实体**：无物理、无布设信息；随关卡初始化创建、退出大厅移除 | 玩家模板（组件：自定义变量/全局计时器/单位状态）+ 实例容器 5.1.7.11 | `assets.customVariables` target=player（顶层定义 + syncInstances 实例同步两处都写才可见） |
| 角色实体 | 玩家实际控制的**物理实体**；无 GUID；按模板动态初始化；生命归零 → 其节点图收「实体销毁时」 | 角色模板（自定义变量等组件，另有装备栏）+ 实例容器 5.1.7.11.1 | `assets.customVariables` target=character |

- 玩家 vs 角色是不同实体，出入参必须严格区分（官方 FAQ/米游社多次强调）；
  例如「隐藏角色」要加给角色实体而非玩家实体；UI 按钮事件源实体 = 玩家实体。
- 元件/玩家/角色初始变量的 CLI 配置：`assets.customVariables: [{ target, prefabId, syncInstances, declarations }]`（`src/compiler/gsts_config.ts`）。
- 三层独立副本铁律（2026-08-20/22 实证）：root4 定义 f8 / root8 实例 f7 / root5 实体 f7 是三份副本，
  编辑器只改目标层；游戏实际读取 root5 实体 f7。

### 1.3 特殊类型

#### 列表
- 21 类型全支持；GIL 编码：原始标量列表用 packed `{field1(len), 元素原始字节拼接}`；
  str_list/vec3_list 用重复 field1(len)；entity 元素为完整 `{f1 varint}`（`variables.md` 2026-08-18 CONFIRMED）。
- 论坛实测：**设置自定义变量节点不能整体改写列表**（只改第一个元素）；改列表必须用
  「对列表插入值/移除值」等列表节点。
- ⚠️ 全 0 int_list 运行时短物化陷阱（日志 2765/2766 + O-2026-08-27-08）：声明满长全 0 列表，
  运行时只物化出短长度；**写 0 不扩容**，只有写非 0 值才扩展——对策=先写非 0 哨兵撑满再写真值。

#### 字典
- 键类型：实体/GUID/整数/字符串/阵营/元件ID/配置ID；值类型：基础 + 各列表 + 自定义结构体。
- 引用传递、键唯一、乱序存储；操作节点：设置或新增/按键移除/清空/按键排序/按值排序/长度/
  按键查询/键列表/值列表/是否包含键值/建立/拼装。
- GIL 编码：dict(27) f37 = parallel f501 keys + f502 values + f503(key 类型码) + f504(value 类型码)；
  marker 按 (keyType,valueType) 枚举，已实测 8 对（str6: str→66 / str_list→76 / float→65 /
  float_list→75 / bool_list→74 / vec3_list→78；int3: int→43 / vec3_list→58）；Map25 层仅历史样本。
- **int key CLI 已闭合（2026-08-29）**：纯数字键自动 int key（f13 编码）；编辑器样本（2026-08-18 after-dict-keytypes/int-key-dict/int-values）字节级锁定 marker (3,3)=43、(3,11)=56、(6,3)=63、(6,11)=76；混合键/混合值类型 fail closed 拒绝（见 F1）。

#### 结构体
- 官方：基础/列表/字典/自定义结构体可用；高级数据管理里声明结构体类型；「空模型归纳变量」技巧
  （composite-library general-patterns 1610612751/2）可替代结构体。
- **按用户指示暂缓**，本计划只登记为 backlog（差分 D13）。

### 1.4 变量操作四件套

| 操作 | 官方/引擎面 | DSL 面 | CLI/资产面 |
| --- | --- | --- | --- |
| 定义 | 编辑器组件页签定义（名+类型+默认值）；节点图变量页签；修改/删除已定义变量会导致图中相关节点无法执行 | `g.server({ variables: {...} })` 声明图变量（`src/runtime/variables.ts` parseVariableDefinitions 全类型解析） | `assets:level-variables create`、`assets:custom-variables`（--vars / config declarations，upsert 语义） |
| 设置 | Set Custom Variable（22，含「是否触发事件」）/ Set Node Graph Variable（323）/ Set Local Variable（19） | `entity.set(...)`、`f.setCustomVariable(target, name, value, triggerEvent)`、`f.setNodeGraphVariable(name, value, triggerEvent=false)`、`f.setLocalVariable` | 资产写回（初始值/默认值） |
| 获取 | Get Custom Variable（50，不存在返回类型默认值）/ Get Node Graph Variable（337）/ Get Local Variable（18） | `entity.get(...)`、`f.getCustomVariable(...).asType('T')/.asDict(k,v)`、`f.get(...)`（g.server variables 类型推断别名）、`f.getNodeGraphVariable(...)` | `--list/--format json` 回读 |
| 引用 | 局部变量=连线身份引用（E<1016> 链）；容器=引用传值；UI 文本框引用玩家变量（语法 `{1:ps.变量名}`，**只能引用玩家实体变量**，论坛实测）；节点图变量「向关卡暴露」按实体覆写；获取/设置自定义变量入参「变量名」是字符串 pin | `customVariableSnapshot(name, value)`（仅实体销毁时事件）；节点图变量 pin 值=变量名字符串 | 挂载槽/覆写 wire 未闭合（D9） |

---

## 2. 已记录的坑（含证据指针）

按证据层级标注：🟢 用户游戏/编辑器实证；🟡 真实 GIL/日志实证（未游戏复验）；🔵 官方/论坛文档；
⚪ 源码推断（待验证）。

1. 🟢 **int 变体分裂**：Set Custom Variable 按值类型选变体（number→float cid26、bigint→int cid22）；
   Get asType('int') 只读 int 变体 → number 写 + int 读 = 恒读空。规则：**实体自定义变量存整数必须用
   bigint 字面量（0n/1n…）**。证据：灯阵 winCount 失败日志 2712 + probe（`variable-scopes.md` / PKC clm_EFBFB1B399A65BADA32F540774）。
2. 🟢 **变量名三方一致性**：定义名 == 设置时名 == 使用时名（含大小写/全角半角/前后缀）；错一个
   编译不报错、逻辑静默错。核查工具 `tools/scan-gil-var-pins.ts`（PKC clm_38E9BD071D723E4A8FD6C039B5）。
3. 🟢 **变量名 pin 缺失**（2026-08-12 split2 复盘）：构建脚本漏写 name pin 时 explain/parse/layout 全绿，
   编辑器加载后变量名下拉为空、运行时写不进。nameShell：Custom Variable=1、Node Graph Variable=0。
4. 🟢 **全 0 int_list 短物化**：见 §1.3 列表（对策=非 0 哨兵两阶段复位；「长度由什么决定」仍未闭合 → D6）。
5. 🟢 **静态资源写变量损坏存档**（2026-08-20 用户实证）：静态元件/实例无组件槽，禁止写变量。
6. 🟢 **关卡实体手动 import 导致地图异常**：由游戏运行时默认创建，禁止手动添加。
7. 🟢 **玩家变量只写顶层定义不生效**：需顶层玩家资源定义 + 实例容器 5.1.7.11 同步（两处都写）。
8. 🟢 **编辑器旧内存保存覆盖磁盘写回**：写回后 hash 相等但"变更消失"= 请用户重载编辑器，不要重做注入。
9. 🟡 **列表变量不能用「设置自定义变量」整体改写**（只改第一元素）；须用列表节点（论坛冰糖小樱桃）。
10. 🟡 **跨图变量每 tick 同步负载失控**（2026-08-21 实证：单次转动 5000-10000 帧）：
    同步用「读自定义变量→写节点图变量」三段式，且**按需同步不每 tick**（composite-library cross-graph-sync）。
11. 🔵 **变量变化事件三规则**：同值写入也触发；设置时需开启「是否触发事件」；容器类型变化事件无前后值。
12. 🔵 **角色倒下类事件要挂关卡实体**：角色倒下后其图丢失，关卡实体自动接收转发事件（论坛）。
13. 🔵 **UI 控件只能引用玩家实体变量**（`{1:ps.分数}`）；引用角色变量不刷新（论坛实测）。
14. 🔵 **局部变量不能跨事件流/跨实体**；跨节点图状态用技能变量或自定义变量（论坛）。
15. 🔵 **复合节点无自定义变量编辑入口**（变量跟随所在节点图）；跨复合共享变量用暴露/实体变量（论坛）。
16. 🟡 **dict marker 已闭合 9 对（含 int→str_list=56）；int key CLI 已支持 + 混合键/值 fail closed（2026-08-29）**；其余组合为拟合外推，未逐项实样（`variables.md`）。
17. 🟡 **关卡变量 discriminator**：bool=4 / integer=3（CONFIRMED_BOUNDED，非正式 enum，仅默认类型两个）。
18. ⚪ **官方文档矛盾**：设置自定义变量能否动态创建（§1.1 A 末）；节点图变量共享 vs 每实体持有（D1）。
19. 🟡 **int 在日志帧内编码为 float（类型5）**；循环迭代变量才是真 Integer（类型3）——读日志别误判类型。
20. ⚪ **结构体列表在局部变量类型选项缺失**（论坛）——结构体整体暂缓（D13）。

---

## 3. 当前工具链能力矩阵

### 3.1 DSL（src/runtime）
- `g.server({ variables })`：全类型解析（标量/列表/dict，含类型推断与错误检查）——`variables.ts`。
- `f.get/f.set`（NodeGraphVarApi，类型推断）+ `f.getNodeGraphVariable/setNodeGraphVariable`；
  `asType('T')/.asDict(k,v)` 读值；`f.setNodeGraphVariable(name, value, triggerEvent)`。
- `f.getCustomVariable/setCustomVariable`（target: player/character/stage/object/creation 五类实体 helper）；
  `entity.get/entity.set` 别名。
- `initLocalVariable/getLocalVariable/setLocalVariable`；`customVariableSnapshot`（销毁时事件）。
- Stage 3：`set_node_graph_variable` 值类型与声明一致性校验（2026-08-19）；`ir_optimize_return_vars`
  （_gsts_return_* 变量优化）；变量声明进 GIA graph.variables（dict 需 k/v 类型）。

### 3.2 CLI（src/cli）
- `assets:level-variables list|create|update`：全 21 类型（含 dict），默认关卡实体 1094713345。
- `assets:custom-variables --entity <id> --vars "a=1;d:dict=k1=[a,b]&k2=3" --write|--output` +
  config `assets.customVariables`（prefab/player/character + syncInstances）。
- 安全写回：--output 候选回读 → --write（.gsts/backups 时间戳备份 + SHA 校验）。
- 已闭合：实体级/关卡变量全 21 类型读写、dict marker 公式、str-key 六种值类型、**dict int key**（纯数字键自动 int；marker 43/56/63/76 编辑器样本锁定；混合键/值 fail closed）。
- 未覆盖：dict 的 entity/guid/阵营/元件ID/配置ID 键、负整数、空名/重名规则、游戏内获取/设置/变化事件、多实例运行时隔离。

### 3.3 工具（tools/）
- `scan-gil-var-pins.ts`：变量名 pin 完整性 + --list-names 与声明集合核对。
- `inspect-gil-custom-variables.ts` / `scan-gil-custom-variable-candidates.ts`：容器与祖先 wire 摘要/批量枚举。
- `explain-gil-node-graph` `--node` 带 [变量=...] 注解；debug-log 解析器（VarType 码 1/2/3/4/5/6/12/14/16/18 + 8/11/21）。

### 3.4 复用资源
- composite-library：variable-ops（读-算-写三段式，int/float 分套）、cross-graph-sync（自定义变量桥接）、
  general-patterns（空模型当结构体/跨实体读写）、debug-log-tag（图变量+dataTypeConversion 定位帧）。

---

## 4. 第二层：差分实验清单（需用户配合的最小实验）

用户提供编辑器最小差分样本（做一步 → 保存 → 提供相邻快照或确认），我方提取 wire 规律。
每项完成后在 §6 登记。

| # | 问题（当前状态） | 实验（10 秒级） | 产出规律 |
| --- | --- | --- | --- |
| D1 | 节点图变量：官方「每实体持有」vs 论坛「挂同图实体共享」 | 一张图挂 2 个实体，A 改图变量，B 读（或打印日志） | 共享/隔离语义 + 多人影响 |
| D2 | 设置自定义变量能否动态创建变量（官方文档矛盾） | 空白实体上直接 Set 不存在的变量名 → 看是否创建/报错 | 动态创建规则 |
| D3 | 列表变量 Set 只改第一元素（论坛） | Set 列表变量整体赋值 → 回读 | 列表赋值语义 |
| D4 | 局部变量生命周期=事件执行流（论坛） | 两个事件各用同一种局部变量，跨事件读值 | 生命周期/隔离边界 |
| D5 | ~~dict int key 的 wire（marker/key 编码）~~ **已闭合**：证据复用 2026-08-18 编辑器样本 after-dict-keytypes/int-key-dict/int-values（marker 43/56/63/76 + f13 key 编码字节级同构）；无需新实验 | 已完成 | 其余键类型（entity/guid/阵营/元件ID/配置ID）仍缺样本 |
| D6 | 全 0 int_list 运行时短物化长度规则 | **声明 wire 已闭合（2026-08-29 v1 差分）**：编辑器 int50=50×0 样本 → 列表长度=f109 元素记录数、零值元素空 payload；我方生产编码已归一化逐字节一致。剩余：**游戏内读下标 49 是否越界（待用户复测）** | 物化长度公式（若实机仍短物化 → 引擎运行时侧，哨兵模式继续） |
| D7 | UI 引用变量语法 `{1:ps.名}` 的实体/类型范围 | 文本框引用角色/关卡/元件变量 | UI 引用规则 |
| D8 | 关卡变量 discriminator 其它类型（bool=4/int=3 之外） | 编辑器逐个类型建关卡变量 → 相邻快照 | 关卡变量类型表 |
| D9 | 节点图变量「向关卡暴露」的 wire 位置与覆写编码 | 暴露一个图变量 → 关卡里改覆写值 → 相邻快照 | 暴露/覆写 wire |
| D10 | 元件定义变量 → 已有实体是否更新（继承规则） | 改元件定义变量默认值/新增 → 看已有实体 | 继承/初始值重置规则 |
| D11 | 变量变化事件跨图可达性 | A 图 Set（开触发事件）B 实体变量，B 的图是否收到事件 | 事件投递规则 |
| D12 | Get 不存在变量的默认值（官方一致）与 Set 不存在变量行为（D2 关联） | 对不存在的变量 Get/Set | 缺省行为 |
| D13 | 结构体（暂缓） | — | backlog，等用户开启 |
| D14 | 技能变量配置ID 的客户端图编码（暂缓） | — | backlog |

---

## 5. 第三层：系统性修复候选（按规律闭合情况排期）

| # | 修复 | 依赖 | 验证方式 |
| --- | --- | --- | --- |
| F1 | dict int key 走 CLI（`--vars`/config）表达与编码 | ~~D5 闭合~~ **已完成 2026-08-29**：`assertUniformDictPairs` fail closed + 回归（gil_level/custom_variables_full）+ marker 表锁定；编辑器/游戏核验待用户 | 测试通过 + 字节级同构（editor sample） |
| F2 | int 变体分裂的编译器防线：写实体自定义变量时 number/bigint 类型检查或 lint | 规则已闭合（🟢） | focused 回归 + 真实 GIA |
| F3 | 变量名三方一致性校验进生产链（scan-gil-var-pins 集成到注入后检查/错误提示） | 规则已闭合（🟢） | 注入后自动核对 |
| F4 | 全 0 int_list 陷阱的 DSL 告警/哨兵自动物化（评估后决定） | D6 闭合 | 日志回读长度 |
| F5 | 节点图变量暴露/覆写的 CLI 支持 | D9 闭合 | 候选回读 + 编辑器核验 |
| F6 | 局部变量复合边界回归加固（2026-08-14 两处生产 bug 已有修复） | 现有回归 | 扩展 boundary 用例 |
| F7 | 实体销毁快照（customVariableSnapshot）编译链路核对 | 现有文档 | 编译+GIA 回读 |
| F8 | 多人/多实例隔离文档化（D1/D4 结论落盘 + 技能更新） | D1/D4 闭合 | 文档 + PKC capture |
| F9 | 本次第一层新知识录入 PKC（官方《技能变量》《字典》《局部变量》等 claim 补强） | — | pkc capture L3 审批 |

---

## 6. 进度检查点（跨会话状态）

- [x] 第一层：全景地图完成（本文件）。知识来源：官方 KB（自定义变量/节点图变量/技能变量/字典/玩家/角色/
      3.13 教程）+ 米游社问答楼（局部变量生命周期/列表 Set/UI 引用/节点图变量共享等 70+ 条命中）+
      PKC（clm_070E69D18F1EBD551E2925921D 等）+ 本地权威文档（variables/variable-scopes/gil-custom-variables/
      gil-structure-semantics/composite-library 4 篇）+ 源码（runtime variables/server_globals/nodes.ts、
      compiler node_id/Stage3 变量校验、cli assets_level/custom_variables、tools scan-gil-var-pins）。
- [x] 第三层 F1（dict int key CLI + 混合键/值 fail closed，2026-08-29 goal 第 1 轮）：证据复用编辑器样本
      锁定 marker（43/56/63/76）+ `assertUniformDictPairs` + 回归（`tests/gil_level_variables_full.ts`
      第 5-7 节、`gil_custom_variables_full.ts` 统一化）+ 技能/全景文档更新；编辑器/游戏核验待用户。
- [x] 第二层实验台就绪（2026-08-29）：基准地图 **1073741915「变量」**（用户新建，图 1073741825「1」/
      1073741826「2」均为 20000 空图）；基线快照 v0 锁定
      （`~/genshin-ts-evidence/variable-system/raw/var-baseline-v0-empty-graphs-1-2.gil`，
      sha256 3d9282e20a1d5…，manifest 见 `~/genshin-ts-evidence/variable-system/notes/manifest.md`）。
- [x] 差分 v1（2026-08-29，用户编辑器加 int50=50×0 int_list 图变量）：声明 wire 闭合 + 生产编码
      归一化（`ir_to_gia_transform/index.ts`）→ 注入回读与编辑器样本 1668 hex 逐字节一致；
      回归 `tests/graph_variable_int_list_editor_wire_test.ts`；知识回填 `variables.md` 新节；
      **待用户游戏内核验（读下标 49 是否越界）**。
- [x] v2/v3（2026-08-29）：我方注入图 2 同变量（用户授权）→ 用户编辑器打开可见（长度 50 默认值）并保存；
      保存后差分：变量记录 1668 hex 未变 ✓，仅编辑器首存簿记（节点 id 引用省略 indexOfConcrete=0、
      root6/10/46 登记/审计）——无未预期变更（详见 manifest v2/v3、open-items O-2026-08-29-03）。
- [x] v4/v5（2026-08-29）：图变量非默认元素（末位 1234）alreadySetVal+显式 payload 规则闭合；
      关卡实体自定义变量 str_list 长度 5（5 空串）——CLI 空元素保留 + entry f6 单层包裹修复，
      两条 CLI 路径 entry 与编辑器 96 hex 逐字节一致（提交 abeaa4b/beed72a + 回归双测试）。
- [x] v6/v7（2026-08-29）：图变量十变量全默认值（空列表去 alreadySetVal、零 vec3 空 val）+ 关卡实体
      9 变量带初始值（**vec3 包裹+稀疏编码修正**，推翻 2026-08-18 平铺外推；解码兼容双形态）——
      两条容器/全类型带初始值均字节级对齐编辑器（提交 020d1df/93f459b + 回归三测试）。
- [x] v8/v9（2026-08-29）：普通实体（缩放 0.1）+ 玩家（def=1000000 ×3，per-player 隔离实证）+
      角色（def=1000001）——四类实体变量容器与 entry 编码**全同族**；custom 路径 vec3 稀疏 +
      空字符串默认值→空消息（int0/false/'' 三态规则）两处修复（提交 3451744/d07021f + 回归）。
- [x] v10/v11/v12（2026-08-29，P0 局部变量主体闭合）：Get=创建/Set=更新/E<1016> 身份连线/类型一致；
      R<T> pin 值归一化（内层无 alreadySetVal、零值空 payload）；**concreteId 类型变体**
      （Get 18/20/2656-2660、Set 19/21/2674-2678）+ **server ioc 表**（与 client 表顺序不同）；
      六类型 Get/Set 全字节级一致；跨容器类型体系共性与差异落盘 variables.md
      （提交 79a24a7/5ebd598/db50787/120db1f/1f30e08）。
- [x] **P3-M1 规律表驱动核验体系（2026-08-29）**：C4 规律表 `tests/fixtures/variables-wire-rules.json`
      （四 scope 容器×形态×hex fixture×样本 sha×inferred 标注）+ `gsts variables:verify`（只读，PASS/DIFF/NOTE
      报告+字节偏移+退出码）+ L1 双锁一致性测试（48 fixture 与回归常量自动比对 + 17 样本 sha）；
      验收：v0–v16b 全 17 样本全 scope 全 PASS，21 类型客户端 .gia 核验（dict 标 inferred NOTE），
      改 1 字节报 DIFF（设计文档 §七 M1 ✅）。证据修正：v14 元素 4=233（非 489）、拼装 OutParam ioc=元素 ioc
      （manifest 已加注记）。
- [ ] 第二层：差分清单 D1-D14（D5/D6 声明侧已闭合）逐项与用户配合执行（每项 ≤10 秒编辑器实验）；D1 待用户指示。
- [ ] 第三层：F2-F9 按闭合情况排期修复。
- 临时取证文件：`.local/vars-explore/kb-*.json`（KB 原文落盘，非 git 跟踪）。
- 相关 open-items：见 `open-items.md` O-2026-08-29-01。

## 7. 文档索引（Authority 快速入口）

- 官方 KB：自定义变量 / 节点图变量 / 技能变量 / 字典 / 结构体 / 玩家 / 角色（miliastra-knowledge 查询）
- `docs/game-engine-knowledge/variables.md`（21 类型 wire 表 + dict marker + 全 0 陷阱）
- `docs/game-engine-knowledge/variable-scopes.md`（作用域 + 局部变量 E<1016> + int 变体）
- `docs/game-engine-knowledge/gil-structure-semantics.md`（GIL 字段树）
- `docs/architecture/gil-custom-variables.md`（玩家/角色/CustomPrefab 初始变量注入）
- `knowledge/game-engine-knowledge/variable-scopes-encoding.md`（PKC 主题源文件）
- `docs/composite-library/{variable-ops,cross-graph-sync,general-patterns,debug-log-tag}.md`
