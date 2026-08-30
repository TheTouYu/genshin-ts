# 完整复盘：服务端↔客户端通信手段矩阵第 1 轮——手段 3（自定义变量跨端）闭环与新地图基线断层（2026-08-30）

> 范围：本会话第 0 轮盘点（矩阵草稿）→ 新地图 1073741916 从零资产链 → 手段 3 两轮实测（3007 失败/3008 闭环）→ 知识落盘
> 视角：跨端通信验证方法论 + "编辑器基线资产"系统性断层 + 静默失败谱系
> 证据：提交 98b6d6e / ad946cd / 4cfc05b / 2905d24；日志 3007/3008；地图 1073741916（新建）；
> 受控差分对（同编译产物，仅资产变量注册差异）
> 状态：手段 3 ✅ 闭环；4 项 open 待办（helper 定义缺口/PKC bundle/基线 CLI 化/默认值语义）

## 一、错误谱系总览

| # | 根因层 | 具体错误 | 症状 | 修复 | 提交/证据 |
|---|---|---|---|---|---|
| 1 | 环境 | 沙箱内 /mnt/c 挂 ro（EROFS） | maps:create 写不进 | 宽权限升级（宿主 rw 实证）+ 用户关审批 | 会话内 |
| 2 | 工具形状 | assets:entities export color=对象 vs import 要求 `#RRGGBB` 字符串；缺 `import` 子命令 | import 空返回/报错 | 去 color 字段 + 补子命令 | 会话内 |
| 3 | 资产基线 | 新地图无 folder 基线记录（12/14/61/67/68） | `assets:node-graphs create --type 20002` 与 skill-config 均 fail closed | 空模板同构补齐（参考图逐字节对照后插入） | 会话内脚本 |
| 4 | CLI 缺陷 | appendRootRecord 对缺失 root15/16 **静默无操作** | skill-config create 报"回读 missing"（误导性错误） | 缺失时按字段号升序补建容器 + 19 快照回归 | 98b6d6e |
| 5 | 定义不一致 | 客户端 helper interface 声明无参版、类实现只有带参版 | `getPlayerEntityToWhichTheCharacterBelongs()` 运行时 undefined → `Invalid value type: entity` | DSL 改 `getCurrentCharacter()`+带参调用；定义层缺口登记 | ad946cd |
| 6 | 流程 | 分支图 id 与 d2-lv 撞（1073741840）→ merge 按图 id 合并污染（60 节点混入旧逻辑） | 注入后 parse 回读发现 n29-60 是 d2-lv 链 | 改 id 1073741842 重编译重注入 | ad946cd |
| 7 | 领域规则 | **动态创建的自定义变量客户端图不可见** | 3007：客户端「获取自定义变量」无 OUT 帧→信号 val=None→monitor 不触发 | 用户定规：**CLI 预注册前置**；预注册（顶层+9 副本）后 3008 闭环 | 2905d24 |
| 8 | 知识分层 | 预注册路径只在代码里，技能文档未承载 | 模型翻源码找 API（用户指出） | 技能红线落盘（SKILL.md 指路 + reference 全文） | 4cfc05b |
| 9 | 工具流 | PKC new-claim `--apply` 生产模式禁用（bundle 审批流） | 录入停在 dry-run | 待 bundle 流（open 登记） | — |
| 10 | 探针环境 | tsx -e 多行被 npm 拦、LenField 字段名/protobuf API 误用、Long 类型打印空 | 临时脚本反复失败 | 全部改为脚本文件 + 对照源码写探针 | 会话内 |

## 二、核心调查链：3007 → 3008 受控差分（本轮最大产出）

1. **现象**（3007）：写入链 ✓（`d2cv|w|`=1..8，timerSequenceId 连 OUT4 值正确）、施放链 ✓
   （CreateInstance=10000002、技能实例ID 当 tick Set→Get 正常、Cast 触发客户端图 f8=2097154 ×3）、
   实体链 ✓（两端玩家实体同为 Entity3）——但客户端「获取自定义变量」帧**无 OUT 行**，
   发信号 `IN1:None=?`，服务端 monitor 零触发。
2. **假设分叉**：A 动态创建变量客户端不可见（服务端 Set 帧正常≠跨端生效）；
   B 客户端 200016 Variant 出参未定型（编译缺口）。官方文档"设置自定义变量要求变量已存在"
   +用户定规指向 A。
3. **受控差分**：预注册 `d2c_counter`+`技能实例ID`（玩家 prefab 顶层 + 9 副本实体容器），
   **编译产物零改动**（不重编译不重注入）。
4. **定论**（3008）：客户端 `OUT0:Integer=2` → 信号 `IN1:Integer=2` → f22 `cv`=2；
   N=2,4,7 三点一致。**假设 A 成立，B 排除**（同产物仅资产差异→行为翻转）。
5. **附带发现**：同 tick 双定时器 cv_cast 先于 cv_write（t=20 读 4 非 5，单样本）；
   官方文档"变量不存在返回类型默认值"与实测不符（无输出帧而非默认值帧，int 单样本）。

## 三、系统性根因（为什么连环踩）

1. **"编辑器基线资产"断层（本轮系统性发现）**：`maps:create` 最小骨架 ≠ 编辑器地图。
   folder 记录（类型级常量空模板）、root15/16/20 技能配置容器、玩家模板组（root4 定义 + 9 副本 +
   角色编辑实体）都是**编辑器保存产物**，而每个资产 CLI 都隐式依赖它们——本轮逐个撞：
   folder（fail-closed 报错，好模式）→ root15/16（静默无操作，已修 CLI）→ 玩家模板（缺失，
   import+donor 补）→ 变量容器（预注册三步）。"干净地图"其实不干净。
2. **静默失败三连**：appendRootRecord map 静默返回 / 动态创建变量跨端静默不可见 / interface
   无参版静默传 undefined——三者编译期与 wire 断言全绿，只有**回读真实 .gil + 真实日志差分**
   才能暴露。证据分层铁律（编译≠注入≠游戏行为）第三次大规模实证。
3. **决策知识未进技能层**：预注册前置、新地图基线缺失、玩家模板路径——这些"何时用哪个命令族"
   的决策知识原本只在源码/用户脑中，技能文档缺失导致模型翻代码（用户 2026-08-30 明确指出）。
   知识的生效载体是技能，不是文档/账本。

## 四、流程与方法论教训

1. **受控差分 = 定论引擎规则的最快路径**：固定编译产物，只动一个资产变量（预注册有无），
   一轮实测即从两个假设中定论。比"逐个排查编译器 Variant 逻辑"快一个数量级。
2. **三点一线帧值判据**（跨端手段闭环标准）：触发端写入帧 → 链路中间客户端读取帧（f8=2097154
   + OUT 值）→ 接收端回传帧（f22），三点值一致才闭环。缺中间帧=链路断，有中间帧无接收帧=回传断。
3. **parse 回读真实 .gil 是 merge 污染的唯一防线**：图 id 撞车时编译/wire 断言/注入全绿，
   只有 parse 列节点时"节点数 60≠28"暴露。新分支 id 必须先 `grep -r 'g.server({ id'` verify/。
4. **临时探针脚本应即时转正**：本轮 ensure-folders / register-player-vars 两个 /tmp 脚本
   解决了通用问题（新地图基线/玩家变量预注册）——按用户指示沉淀为技能命令资源（见产出清单），
   避免"下次重新发明"。

## 五、风险探索与未闭合项

| 项 | 状态 | 备注 |
|---|---|---|
| 客户端 helper interface 无参版未落到类实现 | OPEN | 生产定义缺口；全量排查（ClientEntityHelperMethods × 各类实现）待做；TS 层为何没拦（interface 并集签名）待查 |
| PKC 录入 bundle 流 | OPEN | clm_01M18VQAQZ8VW5EHDJ6WRT7YA9 dry-run 已验证；bundle-create→approve→apply 收尾轮统一 |
| 新地图基线补齐 CLI 化 | OPEN | folder/root15-16/玩家模板组应一条命令补齐（本轮散在两个 /tmp 脚本，已沉淀技能 references/scripts/）；完整 CLI 化待做 |
| "变量不存在返回默认值"文档语义 | OPEN | 实测无输出帧（int 单样本）；float/容器类型待验 |
| 同 tick 双定时器执行顺序 | 观察 | cast 先于 write（单样本），与旧"双 5s 仲裁"局限同族，下轮多样本 |
| assets:entities export/import 形状不对齐 | OPEN | color 对象 vs `#RRGGBB`；export 应输出 import 兼容形状 |

## 六、产出清单

- **闭环**：手段 3（S 写玩家变量→C 图读→信号回传）3008 三点一线铁证；矩阵 8 手段中 4 闭环 4 定性不支持/待做。
- **新资产**：地图 1073741916（GSTS核验-变量C2S）完整基线（模板组/信号/技能配置/双图/挂载/预注册变量）。
- **修复**：assets:skill-config appendRootRecord 容器补建（98b6d6e，19 快照回归）。
- **知识落盘**：矩阵定稿 + verified-cases 案例 + 预注册红线（SKILL.md+reference）+ debug-log-format 客户端读变量帧模式 + 本复盘。
- **技能迭代**：verify-injection（id 防撞+helper 陷阱）/ genshin-ts-asset-operations（基线缺失一节+命令脚本转正）/ debug-log-investigator（速查帧判据）；miliastra-knowledge、task-retrospective 已检查无需迭代。
- **提交**：98b6d6e / ad946cd / 4cfc05b / 2905d24 + 本轮复盘提交。
