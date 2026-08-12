# PRD: 魔方旋转自旋修复 + 节点图结构治理

- 日期：2026-08-12
- 目标地图：`1073741849.gil`（Beyond_Local_Save_Level，游戏实际加载目录）
- 当前地图 SHA：`33537a2a208e19dae56ac68a66c432b2a3e546267f6d1626ebf028b700b938e3`
- 执行方式：子代理（isolated-model-evaluator）分工作包执行，主代理校验写回

## 1. 背景

魔方地图 U 面旋转存在三类自旋症状：旋转开始时 cubie 自旋、连续旋转时瞬间自旋、旋转停止时自旋。
调试过程中发现游戏内日志面板无法查看 FaceTurnU（1073741847）的执行记录与状态值，
并发现 `_GSTS_turn-ctl`（1073741846）存在手写生成的怪异结构。

## 2. 问题清单与根因（已查证）

### P1. FaceTurnU 游戏内日志缺失
- **现象**：游戏内日志面板看不到 FaceTurnU 的执行记录/状态值；其他图正常。
- **证据**：`.gia` 文件日志里 FaceTurnU 记录完整（12 条，每次旋转 44~48 帧，进程 2623）；
  图记录字节与正常的 FaceTurnD 同构（f1/f2/f3/f6 结构一致，仅多 3 个 rot_acc 节点）。
- **根因**：上一版地图（exp8，SHA ed00b18e 已覆盖）主图含手写加法节点 `200011/concreteId=31`，
  该 ID 属于"角色操控技能节点图"体系（graphType 20001/20002），关卡图引擎不识别 →
  整图在游戏面板渲染失败（日志缺失）+ 游戏重存时删除该节点。
- **当前状态**：游戏重存后的当前地图（33537a2a）已无 200011 节点，结构应已恢复。
- **待办**：重新加载当前地图验证日志恢复（见 W1）。

### P2. rot_acc 累计链失效（自旋根因之一）
- **现象**：Bind/Hold 的 668 节点 IN4 旋转向量恒为 `(0,0,0)`；停止时 Set rot_acc 写入空值。
- **证据**（11:08 日志）：
  - impl `1610710020` 内 Get rot_acc 输出空 → Zoom 输出 `(0,0,0)`；
  - 主图 n48/n49 Set rot_acc 的 IN2 无连线（裸 pin，写入空值）；
  - 主图 n19 Get rot_acc（50/54）孤立，无消费方。
- **根因**：累计链 `rot_acc = rot_acc + direction` 的加法节点（200011/31）被游戏删除，链路断裂。
- **当前地图状态**（33537a2a）：
  - 变量容器完好：13 个变量（pivot/pos_ufr/ufl/ubl/ubr/dfl/dfr/dbr/dbl/temp/busy/direction/rot_acc）均在 `root.f5.f1.f7.f11`，rot_acc 初始值为空盒（游戏规范化）；
  - impl `1610710020`（BindUFaceToPivot(1)）完好：Get rot_acc(50/54) + Vector Zoom + 4×668；
  - 主图 n19/n48/n49 仍在但断链。
- **修复方向**：用关卡图体系正确编码重建累计链。关卡图 Addition = **genericId 200，Flt 变体 concreteId 201**
  （来源 `node_pin_records.ts`：`{ name:'Addition', id:200, inputs:['R<T>','R<T>'], outputs:['R<T>'], reflectMap:[[200,'S<T:Int>'],[201,'S<T:Flt>']] }`）。
  注意：官方样本图（1835~1844）中无任何加法节点，无现成真实样本可克隆，必须先做最小验证。

### P3. `_GSTS_turn-ctl`（1073741846）101 参数 Assembly List
- **现象**：n31~n38 共 8 个 Assembly List（169）节点，每个带 101 个 InParam（IN1~IN100 全为无连线 ConcreteBase）。
- **证据**：运行时只读 IN0（输出空列表），101 个空参纯冗余；游戏能执行但面板渲染可疑。
- **修复**：裁剪为最小参数数（保留 IN0 + 需要数量），小手术。
- **注意**：用户确认此问题不影响 FaceTurnU 日志，但确属需要治理的结构问题。

### P4. `_GSTS_turn-ctl` 节点序号跳号
- **现象**：70 个节点序号用到 114（n1→n47→n48→n30→n77...），Flow 链大量跳号。
- **证据**：游戏重存未修复跳号（说明游戏接受）；无功能影响。
- **修复**：可选。重排序号是大手术（需同步所有引脚引用），收益仅为美观。默认搁置，除非用户明确要求。

### P5. 复盘教训：CLI 缺少"未知节点防线"（本次事故根因）
- **事故链**：需要加法节点 → 误查第三方元数据（client_node_metadata 的 200011 技能图体系）→
  未对照 CLI 自身 RECORDS（node_pin_records 的 200/201）→ 未最小验证 → 直接写生产主图 →
  游戏不识别 → 面板日志缺失 + 重存删除。
- **教训**：
  1. 节点编码调研必须对照 CLI 自身 RECORDS（`node_pin_records.ts`），第三方元数据只作补充；
  2. 新节点编码必须先经"实验图最小注入 → 游戏加载确认保留且执行"验证，再写生产；
  3. "引擎不认"不是"无害"——可能影响整图解析/面板/重存。
- **修复**：CLI 校验增强（见 W4）。

## 3. 工作包（子代理执行，每包独立验收）

### W1. 验证 FaceTurnU 日志恢复（只读 + 用户配合）
- 前置：无（当前地图已无 200011）。
- 动作：
  1. 确认当前地图 SHA 仍为 33537a2a（或重存后的新 SHA）；
  2. `assets:node-graphs validate --gil <当前地图>` 确认主图 1073741847 无硬错误；
  3. 请用户在游戏内加载当前地图，转一次 U，确认：a) 游戏内日志面板能看到 FaceTurnU 记录与状态值；b) 生成新日志文件。
- 验收：面板恢复显示；新日志中 FaceTurnU 记录存在。
- 通过条件：用户确认 + 新日志 records 含 1073741847。

### W2. 裁剪 `_GSTS_turn-ctl` 的 101 参数 Assembly List
- 动作：
  1. 快照备份当前地图（SHA 记录 + 副本到 `~/genshin-ts-evidence/`）；
  2. 将 n31~n38 的 Assembly List 参数从 101 个裁剪到最小可用数量（保留 IN0；其余 ConcreteBase 空参全部删除）；
  3. 回读验证：节点参数数正确、其余结构不变；
  4. `assets:node-graphs validate` + `git diff --check`。
- 验收：1846 的 8 个 Assembly List 参数数最小化；图结构其余部分字节不变（除被裁剪节点）。
- 写回后需用户游戏内加载确认 1846 正常执行（监听/转发/重置 busy 不受影响）。

### W3. 重建 rot_acc 累计链（正确编码 + 最小验证优先）
- 目标：旋转结束时 `rot_acc = rot_acc + direction`（正/反两分支），使 Bind/Hold 的 668 IN4 旋转向量 = 当前朝向。
- 步骤：
  1. **最小验证（必须先做）**：在验证地图（当前专用 `1073741852`「InFlow核验」，若被占用则新建 verify 图）注入 Addition `200/concreteId=201`（Flt 变体）：
     - IN0=ConcreteBase(indexOfConcrete=1)、IN1=常量 90.0、OUT0=ConcreteBase；
     - 输出连到 Set rot_acc 或 Print，形成可观测闭环；
     - 用户加载游戏 → 确认节点保留（重存未删）+ 执行日志有值；
  2. 验证通过后，在 33537a2a（或其后续重存版）主图重建累计链：
     - 主图停止链 n22 分支两路：`Get direction → Add(n20, 90/常量 or 变量) → Set rot_acc`；
     - 或按游戏认可方式放入复合 impl（impl 图多次重存存活，是游戏认可的结构）；
     - n48/n49 的 IN2 必须接到 Add 输出，禁止裸 pin；
  3. 回读 + validate + 备份。
- 验收：游戏重存后 Add 节点保留；日志中 Set rot_acc 的 IN2 有值且等于上一轮 rot_acc + direction；
  Bind 时 impl 内 Get rot_acc 非空；三次 U 旋转后颜色对位正确（rot_acc 累积 270）。
- 若 200/201 验证失败：回退方案 = 累计逻辑放入复合 impl（1610710020 同款结构），或用户编辑器手工创建加法节点后克隆字节。

### W4. CLI 校验增强（防再次手写未知节点）
- 动作（改动 `src/cli/static_assembly/graph_edit.ts` / `src/cli/assets_node_graphs.ts`）：
  1. `validate` 增加硬错误：**主图/impl 图中出现 genericId 不在 RECORDS（node_pin_records.ts）的节点 → error**（提示"技能图体系节点不可用于关卡图"）；
  2. 对 RECORDS 中存在但 reflectMap 不含 concreteId 的变体 → error（现有逻辑保留）；
  3. 增加"Addition 200/201"等常用运算节点在 CLI 生成/编辑路径的显式支持记录（定义表已有，确认 patch/plan 可生成）。
- 验收：对含 200011 的地图副本运行 validate 报硬错误；对当前 33537a2a 运行零硬错误；
  `npm run build` + `npx tsc --noEmit` + `git diff --check` 通过。

### W5. （搁置，默认不做）1846 节点序号重排
- 触发条件：用户明确要求。
- 说明：需重排 70 节点序号并同步全部引脚引用，风险高收益低；游戏重存已证明接受跳号。

## 4. 验收总纲（分层证据）

| 层级 | 证据 | 对应工作包 |
|---|---|---|
| 代码层 | validate/CLI 输出、tsc、git diff --check | W2/W3/W4 |
| 自动回归 | 相关测试运行（--noinject） | W4 |
| 地图层 | 快照备份、回读 diff、SHA 记录 | W2/W3 |
| 真实 GIA | 新日志中节点执行/变量值记录 | W1/W3 |
| 用户核验 | 游戏内面板日志恢复、旋转无自旋、颜色对位 | W1/W2/W3 |

## 5. 约束与安全

- 写回前快照备份到 `~/genshin-ts-evidence/`，记录前后 SHA；
- 每包只改一个可唯一归因的变量；不混入无关重构；
- 破坏性/写地图操作先向用户确认；子代理只产 /tmp 候选，主代理校验后写回；
- 不手改 `src/definitions/` 与 `src/thirdparty/`；CLI 改动走正常提交流程（提交由用户决定）；
- 不得再次使用 200011（技能图体系）编码进关卡图。

## 6. 相关文件

- 地图：`/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741849.gil`
- 日志：`/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Debug_Log/`
- 节点定义：`src/thirdparty/.../node_data/node_pin_records.ts`（CLI 权威）、`client_node_metadata.ts`（第三方补充，技能图体系）
- 验证地图：1073741852「InFlow核验」（最小注入用）
- 证据备份：`~/genshin-ts-evidence/cube-hold-fix-1/raw/`
