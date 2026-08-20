# 进度记录 — 2×2 魔方 Demo

## 基本信息

| 项 | 值 |
|---|---|
| 地图 | 1073741882「魔方2x2」（2026-08-12 创建，sha256 `25080d84…ec58`） |
| 玩法节点图 | 1073741825「魔方玩法」 |
| 编译配置 | `examples/rubik-2x2/gsts.config.ts` |

## 阶段状态

| 阶段 | 内容 | 状态 | 验证层级 |
|---|---|---|---|
| P0 建模 | CONTEXT.md + ADR-0001/0002 + 需求拆解 | ✅ 完成 | 用户确认 |
| P1 骨架 | 示例目录 + 新地图 + 占位节点图 | ✅ 完成 | CLI 回显 |
| P2 资产 | 角块元件 v7：长方体薄片有厚度、缝 0.035、深灰 0x404040 + 6 色薄片 | ✅ 完成 | 用户游戏确认 |
| 控制器视觉 | 微缩魔方控制器 v11：薄片偏移公式修正（0.465）+ 厚度 0.01 | ✅ 完成 | 用户游戏确认（2026-08-13 v11） |
| P3 输入 | tabBar 选项卡组件（sphere r=3 [0.1,0,0]）CLI 支持 + 游戏核验 | ✅ 完成 | 用户游戏确认 |
| P4 玩法 | 节点图源码→编译→注入（最小实验→6 选项） | 🟡 主玩法闭环：8 角块动态创建 + 6 选项全量 + 组合旋转（v5.5 位置+朝向全精确，用户核验"数据非常完美"）；待 P5 正式验收 | 编译断言+回读+用户游戏核验+日志逐帧 |
| P5 验证 | 游戏核验 + 日志解析 | ⬜ 待做 | 用户游戏确认 |
| P6 沉淀 | PKC 回填 + 本文件更新 | ⬜ 待做 | pkc validate |

## 待闭合的未知规则

- [x] **关卡实体挂载玩法图（已闭环 2026-08-13，exp1）**：关卡实体 = root5 普通场景实体记录（本图 eid=1094713345，f8=10003004 官方定义引用为身份线索）；挂载槽位编码与普通实体逐字节一致（type 3 槽），CLI `assets:mounts attach --entity 1094713345` 直接可用（候选与编辑器产物 MATCH）。已移除实验性挂载恢复原状（槽位回到 08036a00）。证据：`~/genshin-ts-evidence/stage-entity-mount/exp1/`。待游戏核验：whenEntityIsCreated 在关卡实体上触发。

- [x] ~~平面 10009003 零旋转朝向~~（2026-08-12 用户解答：平躺法线 +Y、1×1、绕 Y 旋转；已更新两处权威文档）
- [x] ~~空模型体积~~（2026-08-12 用户解答：隐藏 1×1×1 正方体，与同尺寸装饰物重叠闪烁；模板直接改用长方体，宿主缩放会连带装饰物缩放）
- [x] ~~装饰物即主体的薄片偏移基准~~（2026-08-13 用户编辑器修正值 0.454/0.449/0.455 验证闭合：偏移 = 主体中心 0.23 + 半长 0.22 + 半厚 + 间隙 = 0.465；v9/v10 漏中心 → 薄片埋块内全黑；已入 static-gil-model-builder SKILL.md）
- [x] ~~选项卡（tabBar）组件 GIL 编码~~（2026-08-13 闭合：球体区域 r=3 中心[0.1,0,0] 6 选项，CLI 支持 + 游戏核验通过，提交 50565b8）
- [x] ~~用户编辑器修改的比对方法~~（2026-08-13 实测闭合：编辑器保存会把被编辑实体的 aux 整体重写为新 ID 区间，同 ID 记录不变；比对 = aux ID 集合差 + 新区间解析）
- [x] ~~基础运动器（basicMotion）组件对游戏行为的影响~~（2026-08-13 差分+游戏对照闭合：**基础运动器 = type 4**（9B 默认槽 `080410017203c81f01`），必须 CLI 显式配置；模板自带的是 [18,1,3,19,6,14]（18/19/14 为 UI 不可见系统组件），**不含基础运动器**。旧结论“type 18=基础运动器”为历史误判（A/B 把模板自带 18 当新增槽），生产代码已按 type 4 修复。P4 最小实验控制器能转 = 用户手动补了 type 4；角块未配时运动器节点执行但实体不动——日志验证）
- [ ] 匀速旋转型基础运动器对静态元件的行为（90° 停止后是否保持朝向）
- [x] ~~选项卡选中事件 → 实体节点图的完整链路~~（2026-08-13 游戏+日志核验闭合：whenTabIsSelected 在挂载实体上触发，payload=eventSourceEntity/eventSourceGuid/tabId/selectorEntity）
- [x] ~~tabId 值域~~（2026-08-13 用户确认：从 1 开始，1~6 对应 R/L/U/D/F/B）
- [x] ~~Data Type Conversion Int→Str 枚举~~（2026-08-13 真实日志闭合：802）
- [x] ~~旋转配方 90°/1s 行为~~（2026-08-13 用户游戏核验：每次 +90° 连续累积，世界轴语义成立）
- [x] 运行时动态创建元件实体的节点图能力（P4；前置已解除——关卡实体挂载规则已闭环，whenEntityIsCreated 触发待游戏核验）
- [ ] 编辑器保存规范化行为对写回的影响（root 5 自动补“默认模版”实体、被编辑实体 aux 重写新 ID）——已知行为，细节待 P5 前整理

## 决策与假设

- 旋转语义：2×2 共 6 种操作（X/Y/Z 轴 ±90°），不做任意角度（ADR-0002）。
- 方块结构：8 个独立场景实体，非宿主+装饰物（ADR-0001）。
- 输入机制：选项卡组件（事件直达挂载实体节点图）。
- 旋转实现：匀速旋转型运动器（官方无"设置旋转"节点）。
- **实体创建：不在编辑器预置场景实体，游戏开始由节点图动态创建**（用户 2026-08-12 反馈：方便整体移位）。

## 变更记录

- 2026-08-12：P1 完成。创建地图 1073741882 与占位节点图 1073741825。
- 2026-08-12：P2 v1（6 面片空心方块+8 实体）写回后用户反馈：①结构应为灰黑立方体+3 色薄片 ②平面旋转展开（法线朝向假设错）③不建实体改动态创建。恢复备份至空骨架，v1 证据保留在 `rubik-2x2-v1/`。
- 2026-08-12：平面 10009003 规则闭合（用户直接解答）：零旋转平躺/法线 +Y/外接圆直径 1=1×1/绕 Y 旋转。已同步 `calibration-and-geometry.md` 资源表 + `gil-structure-semantics.md` resID 表。
- 2026-08-12：P2 v2 写回（空模型+灰黑立方体装饰物 6 面片→4 items），用户再反馈：①空模型有隐藏 1×1×1 体积（同尺寸装饰物重叠闪烁；宿主缩放会连带装饰物）→ 模板直接改用长方体 10009001 ②8 块要按角位拼成魔方（Y 悬空）③命名要规范。恢复备份，v2 证据保留在 `rubik-2x2-v2/`。
- 2026-08-12：空模型体积规则闭合（用户直接解答），已更新两处权威文档。
- 2026-08-12：P2 v4 写回（模板=灰黑长方体+3 薄片，WCA 命名，拼成 2×2×2）。用户反馈：①留缝（拼太死）②白色太亮。补文档（模板缩放连带装饰物、模板直接用长方体）。
- 2026-08-12：P2 v5 写回：元件 scale 0.93（缝 0.07）+ 白色 opacity 85；备份 `…T14-27-49-914Z.bak`；候选在 `rubik-2x2-v5/`。
- 2026-08-12：P2 v6 写回：缝 0.07→0.035（scale 0.965）；薄片平面→长方体（平面 scale 厚度不生效）；白色→0xE8E8E8；备份 `…T14-33-50-720Z.bak`；候选在 `rubik-2x2-v6/`。待核验。
- 2026-08-12：制作 `game-from-scratch` 技能（8 阶段完整游戏管线 + rubik-2x2 案例速查），完成下一阶段①进度/文档②技能制作。
- 2026-08-12：按要求分批提交 git（①工作区其他未提交文件 ②游戏项目相关文件含技能）。
- 2026-08-12：P2 v7 白色修正 0xE8E8E8→0xD0D0D0（角块最终配色），控制器设计定稿（微缩魔方：8 深灰块 0.44 + 24 彩面薄片）。
- 2026-08-12：控制器 v8 写回（模板空模型 + 32 items，tabBar 组件 sphere r=3 [0.1,0,0] 6 选项），候选 `rubik-2x2-v9/controller-final-candidate.gil`（SHA 42418fbf = 写回后地图）。
- 2026-08-13：tabBar 球体区域 CLI 支持提交 50565b8（真实样本 exp5/exp6 + 游戏核验通过）。
- 2026-08-13：用户游戏核验控制器 → 全黑大块。调查：编码回读全部正确（旋转/颜色/位置与角块一致），v10 改薄片加厚 0.06/间隙 0.03 写回 → 仍全黑。用户手动在编辑器修正一个块的 3 个薄片（pos 0.454/0.449/0.455、厚 0.01）→ 比对发现根因：**薄片偏移公式漏加主体装饰物中心 0.23**（v9/v10 偏移 0.235/0.28 < 块外表面 0.45，薄片埋块内）。
- 2026-08-13：**P4 最小实验闭环**。源码 `src/game.ts`（whenTabIsSelected → printString(tabId) + 对事件源实体加旋转运动器 X 轴 90°/1s）→ 编译 wire 断言（create3dVector 预计算内联为常量）→ 注入图 1073741825（_GSTS_game，4 节点）→ `assets:mounts attach 1077936138 --entity` 挂载 → 用户游戏核验（旋转正常连续累积）→ 日志核验（7 次点击 4 帧链完整，参数逐项一致，无错误；用户补基础运动器组件后节点正常执行）。闭合：whenTabIsSelected 链路、tabId=1~6（R/L/U/D/F/B=1-6）、Int→Str 枚举 802、旋转 90° 连续累积（世界轴）。第二步待做：8 角块 createPrefab 动态创建 + 6 选项分派（图变量存实体引用，DSL g.server({variables}) 支持 entity 类型）。
- 2026-08-13：控制器 v11 写回（偏移 0.465 = 0.23+0.22+0.005+0.01，厚度 0.01），最终地图 SHA be4c5cae，**用户游戏核验通过**。规律与方法（装饰物即主体偏移基准、编辑器 aux 重写比对法）已沉淀入 static-gil-model-builder SKILL.md。

## 变更记录 2026-08-13（颜色减半 + 关卡实体挂载实验回滚）

- **颜色亮度减半（已写回，SHA dc0fb105…）→ 随后调亮至 75%（已写回，SHA 88876e6d…）**：
  - 50%（÷2）：主体 0x404040→0x202020；红 0xFF0000→0x800000、橙 0xFF8C00→0x7F4600、黄 0xFFFF00→0x7F7F00、绿 0x00FF00→0x008000、蓝 0x0000FF→0x000080、浅灰白 0xD0D0D0→0x686868
  - 75%（×0.75，用户反馈 50% 太暗）：0x202020→0x303030、0x800000→0xBF0000、0x7F4600→0xBF6900、0x7F7F00→0xBFBF00、0x008000→0x00BF00、0x000080→0x0000BF、0x686868→0x9C9C9C
  - 覆盖全部 163 个材质槽（8 角块 def/inst + 控制器元件 def/inst + 控制器场景实体 aux）；等长字节替换，root 4/5/8/27 仅颜色字节变化、文件大小不变
  - 备份：`~/genshin-ts-evidence/stage-entity-mount/exp1/raw/colors-halved-20260813T195048.bak`（50% 前）、`colors-75-20260813T200208.bak`（75% 前）
  - 生成器 gen-assets.py / gen-controller.py 常量已同步为 75% 值（重新生成配置不会回退）；注意第二次写回时源 SHA 已从 dc0fb105 变为 4037ebe2（编辑器保存版），记录级替换仍全部命中
  - 待游戏核验。
- **关卡实体挂载实验已回滚**：编辑器挂载的 _GSTS_game 已用 CLI detach 移除（槽位恢复 08036a00，与 v0 快照一致）。

## 变更记录 2026-08-13（P4 第二步 v1：8 角块动态创建 + 6 选项分派）

- **源码** `src/game.ts` 重写：whenEntityIsCreated（过滤 eventSourceEntity==stage）→ 8 × createPrefab（prefabId 1077936129..136，中心 (3,3,3)、偏移 ±0.4825、rotate 0、owner=stage）→ 存图变量 b0..b7；whenTabIsSelected → lock 检查 → tabId 1..6 分派（R/L/U/D/F/B）→ 每分支 4 块自旋（90°/s×1s，轴=层轴±方向）+ 5 段直线公转（每段 18°、0.2s，速度 = v·(cos18−1)/0.2 + (axis×v)·sin18/0.2，运行时按当前位置计算）→ 定时器序列 200/400/600/800ms 推进段 2..5 → 1000ms 解锁。
- **编译产物**：1203 节点（6 分支 × 4 spin + 4 orbit1 + 5 start_timer；orbit2..5 由编译器共享为 capture 定时器，4 个 when_timer_is_triggered 回调各 4 块）；IR 断言：create_prefab 参数（prefabId/位置/owner）逐项正确、分派链 equal(1..5)+else 完整、定时器结构正确。
- **注入+挂载**：图 1073741825 注入（515KB GIA）；控制器 1077936138 已有挂载，新增关卡实体 1094713345 挂载（备份 `.gsts/backups/1073741882.gil.2026-08-13T12-15-56-557Z.bak`）；地图 SHA `afea8411…`。
- **待游戏核验**：① 8 角块是否出现在 (3,3,3) 为中心（离地高度 2.5）② 各层方向符号（WCA：R 从 +X 看顺时针，L/U/D/F/B 相应取反；反了翻转对应轴）③ 自旋+公转是否并行 ④ 5 段折线平滑度/输入锁 ⑤ 重复加载是否会重复创建角块（whenEntityIsCreated 过滤逻辑）。
- **风险**：一实体两运动器并行是 ADR-0003 假设（未验证）；若同名/并行运动器冲突，回退方案：自旋运动器改名或改用单运动器合成。

## 变更记录 2026-08-13（P4 第二步 v2：日志根因修复——图变量实例隔离）

- **症状**：角块创建成功，但按 tab 无转动。
- **日志定位**（Beyond_Debug_Log/2026-08-13_20-26-45，rec0-rec8 完整还原）：whenTabIsSelected 触发、lock/分派/运动器/段定时器/解锁全部执行，唯一故障：控制器实例 `get b1/b3/b5/b7` 返回**空实体**（rec2 帧 10/13/16/19），位置按 (0,0,0) 计算，运动器作用空实体。
- **根因**：**图变量按挂载实体实例隔离**——b0..b7 写在关卡实体实例（rec0），控制器实例读取为空（rec1 已证明 whenEntityIsCreated 在控制器上也会触发，prelude 正常）。
- **修复（v2）**：图只挂控制器（detach 关卡实体），whenEntityIsCreated 去掉 stage 过滤 → 角块创建+变量写入都在控制器实例，同实例读写。编译注入成功（备份 `.gsts/backups/1073741882.gil.2026-08-13T12-40-03-308Z.bak`）。
- **待游戏核验**：① 8 角块出现且转动生效（U/R）② 方向符号 ③ 双运动器并行（ADR-0003）④ 平滑度/输入锁。

## 变更记录 2026-08-13（P4 第二步 v3：补配 basicMotion 组件——运动器生效前提）

- **症状**：v2 后角块创建+变量+分派+运动器节点全部执行（日志逐帧确认），但实体位置 0.2s 后纹丝不动（orbit2 段回调读出的位置与初始值相同、速度与 orbit1 完全一致）。
- **根因（用户纠正，第二次犯该盲区）**：实体组件必须显式配置，模板从不自带。P4 最小实验控制器能转 = 用户手动补了 basicMotion 组件；角块装配体（createPrefab 实例）从未配置 → 节点图运动器节点执行但引擎不驱动实体。
- **修复（v3）**：`assets/plans/asset-updates.mjs` 用官方 `staticPrefabUpdates` 原地更新 8 个角块闭包，双写 basicMotion；备份 `.gsts/backups/1073741882.gil.2026-08-13T13-54-27-231Z.bak`；gen-assets.py 同步加 components（新地图重建时生效）。**注意：v3 写的是 type 18（历史误判产物），游戏内不生效**。
- **修复（v4，2026-08-13 差分复盘）**：type 18 是模板自带组件（用户 UI 只显示 1/3/6，GIL 槽为 [18,1,3,19,6,14]），真正的基础运动器是 **type 4**（用户两次手动添加差分确认 + 控制器对照：控制器有 4 能转、角块无 4 不能转；1849“组件比对-基础运动器”元件相对模板基线新增槽也是 4）。生产代码 `basicMotionComponent()` 18→4、三个测试锁定字节同步、export/entities 解码同步；**8 角块已重新写回 type 4**（写后 SHA 193691b7…，备份 `.gsts/backups/1073741882.gil.2026-08-13T14-51-30-279Z.bak`，用户手动加的命中检测/物件镜头保留）。
- **文档纠正**：`docs/game-engine-knowledge/components.md` 删除“模板自带 basicMotion/旋转无需组件”错误结论并修正 type 4=基础运动器（v4）；`docs/architecture/gil-static-model-assets.md` 19.2.4 标注历史误判；CLI 文档 zh/en 同步；PROGRESS 待办 33 闭合。

## 变更记录 2026-08-13/14（P4 第二步 v5.x：转动闭环——位置+朝向全验证）

- **v5（方案 A）**：tab 事件一次性预计算 5 段速度（p_k 递推），定时器回调不再读运行时位置。缺陷：layers 字典未填充 → 运动器作用空实体（日志 00-14-20）。
- **v5.1/5.2**：数据驱动（axes/layers 字典）+ whenEntityIsCreated 填充 layers。缺陷：①getCorrespondingValueFromList 下标 1..4（应为 0-based）→ 第 4 块越界空；②p_k 公式压缩平行分量 → 每轮漂移 0.5（日志 00-20-15 逐帧）。
- **v5.3**：平行分量保持（vp + vPerp·Ck + axv·Sk）+ 0-based → **单面连续旋转精确**（用户核验）。
- **v5.4**：组合旋转错位根因 = 魔方转动后层成员变化，静态 layers 失效 → **循环 + 按当前坐标筛选层成员**（节点 2400→240，循环体只物化 1 次）。
- **v5.5**：组合旋转朝向错乱根因 = 运动器 axis 为"相对朝向"（局部轴，官方定义+矩阵实证）→ **自旋轴 = R^T·worldAxis（罗德里格斯×3，YXZ 内旋）** → **任意面连续/组合旋转位置+朝向全部精确**（用户核验：数据非常完美）。
- **知识落盘**：`docs/game-engine-knowledge/motion-devices.md` 运动器运行时行为专章（轴语义/公式/层成员/DSL 笔记）；TASKS.md P4-1/P4-2 关闭。
- **遗留**：P4-3（CLI 组件移除+逐组件验证）、P4-5（type 4 变体）、P4-6（type 18 UI 名）、定时器 tick 量化（⚪）——见 TASKS.md。

## 变更记录 2026-08-15（P4-4 关闭：examples 构建类型问题全修复）

- **背景**：TASKS.md P4-4——`npm run build` 被 examples 的 `game.ts` + `game.gs.ts` 类型错误阻塞（接手时 34 个错误，含历史 timerName 缺口）。
- **修复**（纯类型契约，不改运行时语义）：
  - `src/runtime/value.ts` 新增 `RuntimeExecNodeArg`（value | DSL 伪装返回值类型），`f.node`/`registerExecNode`/`registerDetachedExecNode` 使用；
  - `defineComposite` 接受 Stage 1 注入的 `provenance`；`connect` 源参接受 `FlowMarkerRef`（对齐 #10 实现）；
  - `createEntity/createPrefab/createPrefabGroup` 的 `unitTagIndexList` 接受 `list<'int'>`；
  - `server_globals.d.ts` 的 `setTimeout/setInterval` 声明转换器第三参 `meta?: TimerOptions`（闭合历史 timerName 类型缺口）；
  - `shouldCaptureIdentifier` 排除类型级 `typeof a.b`（QualifiedName），修复定时器捕获生成跨作用域引用的 ReferenceError。
- **生成与回归**：`scripts/generate-definitions.ts` 的契约补丁函数改名 `applyDefinitionTypeContracts`；用 `--composite-contracts-only` 最小生成 nodes.ts（完整 `npm run gen` 的 ~5k 行资源漂移未纳入，见 compiler-practical-optimization-backlog §7.1）。`tests/timer_global_overload_type_safety_test.ts` 增补 evt/timerName 非 any 类型断言。
- **验证**：`npm run build` 绿；`npm run quicktest` 绿（66 GIA，--noinject）；`npm test` 仍停在与本次无关的已知枚举组合断言边界（`E_UNKNOWN_NODE_VARIANT`，testing.md 2026-07-31 记录）；`git diff --check` 通过。

## 变更记录 2026-08-16（P4-3：CLI 组件移除能力 + 角块 12/13 移除写回）

- **工作①（提交 1ff4d6a）**：`GstsStaticPrefabUpdate.removeComponents`——定义槽 8 + 实例槽 7 双写移除；
  不存在码静默跳过并回报实际移除清单；与 components 同型互斥校验；CLI summary 输出
  `updatedRemovedComponents`。自动验证：tsc 绿 + `tests/gil_static_prefab_updates.ts`
  （增→删回源字节一致/幂等 no-op/重复码/互斥/非法码）+ `static_assembly_public_config.ts` + quicktest 66 GIA 绿。
- **工作②（写回完成）**：探针确认仅 1077936135（角块_UFL）多出 type 12/13（其余 7 块标准 7 槽）；
  候选 diff 只动该记录（25 图 + 24 复合零改动）；`--write` 后 SHA `dcca49ae→4a2368c2`（与候选一致），
  备份 `.gsts/backups/1073741882.gil.2026-08-15T05-29-23-697Z.bak`，Temp 已同步；回读 def+inst 均 7 槽标准。
  证据：`~/genshin-ts-evidence/p43-remove-components/`。**待用户游戏核验**（重新加载地图后角块 UFL 正常）。
- **工作③**：逐组件验证矩阵（添加→回读→游戏核验→移除）待安排（在验证地图上做，不碰魔方地图）。

## 变更记录 2026-08-17（基础设施：完整游戏关卡五层架构，编译验证通过，未注入）

- **新增文档**：`docs/architecture/rubik-game-level-infrastructure.md`（完整分析 + 架构设计）、`docs/adr/0005-魔方游戏关卡架构.md`（五层分离 + 逻辑状态单一事实源）。
- **2×2 逻辑状态 move 置换表**：`tools/gen-2x2-logic-table.mjs` 离线生成（位置环 + 朝向 twist 映射），
  内部校验（环闭合/R⁴=I/逆序列一致性）+ **CubeLib 交叉验证 2400 个 (piece,seq) 样本一致**；
  产物 `tools/2x2-logic-tables.json` + TS 片段。修复过两处生成器 bug：层符号筛选（L/D/B 误用 x+）与错误的不变量校验（slot 编码下总和 mod3 不恒定）。
- **game.ts 重构为五层**（保留全部已验证转动复合原样）：
  - 逻辑状态层：cornerPos/cornerOrient（dict<int,int>，已还原初始态）+ read/apply/is_solved/reset 复合；
    状态变更是"先全部读→暂存→再全部写"（防环内别名覆盖）；twist 编码对齐受限求解原型 cube.js。
  - 流程层：gstsDoMove（逻辑+视觉一体）、gstsAfterTurn（AUTO 队列推进/MANUAL 胜利检查）、
    gstsScramble（随机 20 步，避免相邻同层）、gstsSolve（占位，2×2 轮实装）、gstsResetCore（销毁+重建+复位）。
  - 输入层：tabId 1-6 转动 / 7 打乱 / 8 复原 / 9 重置（9 由宿主分支处理——复合内 entity_list 数组字面量编码缺口，v13 已验证路径）。
  - 结算层：gstsCheckWin → setPlayerSettlementSuccessStatus(Victory)（lights-out 已验证模式）。
- **能力预验证**（DSL 技能要求）：复合 build 内 f.finiteLoop 可用、终端 exec 复合（无 outflow）合法、
  SettlementStatus.Victory 可作 f.node 参数。
- **编译验证**：`gsts -c examples/rubik-2x2/gsts.config.ts --noinject` 全绿（gs.ts + IR + GIA id=1073741825）；
  **总节点 419**（root 17 + 复合 impl 402，35 个复合 def），2000 预算内。
- **踩坑记录**：①复合内 entity_list 数组字面量（blocks）有 matchTypes 缺口 → blocks 写回宿主；②f.node 参数必须是值对象
  （裸 bigint 报 toIRLiteral 错）→ new int() 包装；③变量声明裸数字值推断为 Flt → int 值必须 new int()；
  ④复合 build 内不能用 TS for（Stage1 会转有限循环破坏显式链）→ 展开/显式链；⑤声明 outflows 必须显式 f.outflow 绑定。
- **未做（等待用户确认后继续）**：注入回读、游戏核验（转动/逻辑一致性/打乱/胜利结算/重置）、日志验证。

## 变更记录 2026-08-17（基础设施离线深度验证——未注入）

- **GIA 解码结构核验**：`tools/decode-gia.ts` 解码 game.gia → 70 accessories（35 复合 def + 35 impl 图）、
  主图 17 节点、全部 35 个复合名正确（13 新增 + 22 既有），复合 impl 节点 ~367 与 IR 一致。
- **IR 变量类型核验**：30 个图变量全部正确——qLen/qIdx/lastMove 为 int、逻辑字典全部 dict<int,int>。
- **端到端 apply_move 模拟验证**：`tools/verify-2x2-logic-state.mjs`（固化可复用）——
  从编译产物 game.json 提取**内嵌真实表数据**，按复合相同算法（读 4 槽→暂存→写回+twistMap）模拟，
  **CubeLib 对照 3200 个 (piece, seq) 样本一致 + 逆序列 50 组一致**——证明「表数据 + 更新算法」整体正确。

## 变更记录 2026-08-17（基础设施注入 + 回读核验通过）

- **注入**：新 game.gia 注入图 1073741825（config 注入）。前置：备份 `.gsts/backups/1073741882.gil.2026-08-17T14-50-07.infra-pre-inject.bak`（注入前 hash 4a2368c2…）；注入后 hash **891dda84…**。
- **环境坑**：①注入器备份目录 `~/.genshin-ts/backups` 只读 → 用 `APPDATA=<可写目录>` 重定向；②`/mnt/c` 沙箱只读挂载 → 注入命令需 danger-full-access 宽权限。
- **回读核验**（dump_gil_index 注入后图）：主图 1073741825 = **17 节点**（与 IR 一致）；37 个复合 impl 图合计 ~372 节点；whenTimerIsTriggered 位于 orbit_trigger 复合（1610710034）、setPlayerSettlementSuccessStatus 位于 check_win 复合（1610710006）、8 个 impl 图含字典查询（逻辑状态层）——结构完整。
- **待游戏核验**（基线）：① R/L/U/D/F/B 无回归 ② 正常运行无拒载 ③ 拼好后触发胜利结算 ④ 逻辑状态流转日志。
- **待做**：控制器 tabBar 增加 7/8/9 选项（打乱/复原/重置）资产更新；基线通过后按 ALGORITHM_DOC.md 设计 2×2 自动求解。

## 变更记录 2026-08-17（回归修复：tab_dispatch 分支方向接反）

- **症状**：游戏内点击选项无任何变化（日志 rec1：whenTabIsSelected → 读 lock → brLock 条件 false 后零帧）。
- **根因**（日志 + GIA wire 实证）：`connectOutFlow` 索引 **0=真分支、1=假分支**（对照已验证的 gsts_tab_lock：
  isFree 真分支在 outflow 0）。我的 gstsTabDispatch 把「转动分派」放在了 brLock(lock==true) 的**真分支**
  （=锁着时），未锁时走空分支 → 正常点击什么都不执行。brMove 方向正确，仅 brLock 接反 + 显式 link 索引需同步改。
- **修复**：brLock 真分支(0)=空、假分支(1)=转动分派；`f.link(brLock,1,brMove,0)`。
- **审计**：check_win/after_turn/scramble 分支方向均正确（已逐一核对）。
- **验证**：重编译 → decode 确认 brLock out1→brMove、brMove out0→tabLock；重注入（备份
  `.gsts/backups/1073741882.gil.2026-08-17T15-xx.infra-branchfix-pre-inject.bak`，新 hash d0489c5a…）；回读 17+372 节点结构正常。
- **待用户复测**：R/L/U/D/F/B 转动应恢复；拼好触发结算。

## 变更记录 2026-08-18（编译器修复：复合 impl 列表反射节点 concreteId 回退泛型 → 游戏拒载）

- **症状**：gsts_turn_check 里 getCorrespondingValueFromList(axes vec3_list) 的**输出类型与列表元素类型不匹配**，游戏拒绝启动；编辑器/编译器未拦截。
- **根因（编译器 bug）**：复合 impl 普通节点的 concreteId 由 `resolveImplOrdinaryConcreteNodeId`（composite.ts）解析，其只处理 `concreteWrappedNodeTypes`（数学/比较）；**get_corresponding_value_from_list / set_list_value 等列表反射节点不在内** → 回退泛型 id（128=int 变体 / 160）。axes 的 get_list 输出到复合边界 producedType 为 undefined 更解析不了。泛型回退**静默发生** → 编辑器/编译器不报错 → 游戏拒载。
- **修复**：
  1. `resolveImplListReflectiveConcreteNodeId`：按列表参数元素类型解析 concrete 变体（vec3→133、entity→130 等；vendor 键经 SPECIAL_NODE_MAPPINGS 重命名，如 set_list_value→modify_value_in_list→165）。
  2. **fail-closed**：列表参数类型已知却解析不出变体 → 抛错，禁止静默回退泛型。
- **验证**：rubik 图 wire 检查 get_list→133/130、set_list→165（int 变体 128/160 为正确特化非回退）；新增回归测试 `tests/composite/test-list-reflective-concrete.ts`（PASS，断言 vec3_list get_list=133 / set_list=165）。
- **环境坑**：`src/cli/gil_ui.ts` 工作区未提交改动带 tsc 错误阻塞 `npm run build`（postbuild 复制 .proto 不执行 → dist 残缺）→ 手动 `tsc + postbuild` 恢复。
- **已注入**：hash 0b8963c1…（列表优化 + 循环修复 + 结算修复 + 本修复合一）。

## 变更记录 2026-08-20（性能优化 A+B：命中块预知，砍掉动画期位置层判断）

- **背景**：上一轮测试（日志 `2026-08-19_23-34-03_2736_110170759.gia`，104 记录）确认基本流程全正常，
  但一次完整转动执行约 **1925 帧**（帧 = 单节点执行）：点击帧 380（apply_move 逻辑层 360）+ 8 个块事件
  turn_one ≈1270（turn_check 位置层判断 102 + orbit_velocity 88 + spin 41 + store 15）+ 16 个段事件 224 + after_turn 93。
- **方案（A+B，用户已确认）**：命中块由逻辑层表数据直接确定，动画期不再读实体位置做层判断——
  - `gsts_turn_check`（读 blocks/axes 变量 + 6 equal + layer_hit 位置层判断链）→ **`gsts_turn_lookup`**（查表版）：
    i = 槽位 0..3（do_move 块事件 timerSequenceId），`tempP[i]` = apply_move 已按 tblFrom 表算出的命中块编号，
    再查 `blocks[piece]` 实体 + `axes[tabId]` 轴——纯数据 7 节点，无位置读取/层判断。
  - `gsts_turn_block`：删除 doubleBranch 分支（块事件必为命中块），直接链 spin → orbit_store（key=命中块编号）→ orbit1 运动器。
  - `gsts_turn_one`：turn_block.done → orbit_scheduler（i=命中块编号，段定时器 timerName=块编号，与 velsN 字典 key 对齐）。
  - `gsts_do_move`：块事件定时器 **8 → 4**（0.05/0.10/0.15/0.20s，timerSequenceId=槽位）；unlock 1.40s 不变。
  - **删除 4 个不再使用的层判断复合**：gsts_tab_axis_flags / gsts_layer_hit / gsts_in_layer / gsts_axis_compare。
- **预期收益**：每转动省约 200 帧（4 个未命中块事件 + 层判断链），帧数从 ~1925 → ~1700（-10%+）；
  命中块事件 272 → ~180 帧（turn_check 位置判断 102 → 查表 ~24）。
- **踩坑（DSL 链接规则）**：复合定义内部 `f.link(f.entry(), 0, 复合调用, 0)` 会把 capture→复合调用记为
  **对象边**，而 exec 复合调用注册时 auto-chain（`runCompositeCall` 单 outflow 尾部 tail 推进）已生成
  **裸边** capture→复合调用 → IR compositePins 出现两条相同 InFlow 物理路由 →
  `GSTS-COMPOSITE-ACCESSORY-BUILD-FAILED: duplicate physical route`。修复：**删除显式 f.link**，
  依赖 auto-chain 生成入口边（与 apply_move 既有模式一致——复合入口直连普通节点，复合调用只作链中目标）。
- **验证**：
  - 编译 + GIA 生成绿（32 复合 def = 35−4+改名，impl 401 节点，root 18）。
  - GIA 解码回读：gsts_turn_lookup 就位，删除的 4 复合无残留。
  - **注入**（备份 `.gsts/backups/1073741882.gil.2026-08-20.perf-pre-inject.bak`，注入前 sha `e911e7fa…`，
    注入后 sha `175825a9…`，Temp 已同步）：读图自检 turn_block/turn_one/do_move 结构正确、
    InFlow 入口非空、执行流条数正确、`scan-gil-var-pins` 39 图 136 变量节点 0 违规。
  - **待用户游戏核验**：转动/打乱/复原/胜利结算无回归 + 新日志帧数对比（目标每转动帧数下降）。

## 变更记录 2026-08-20（⚠️ 注入事故 + 修复：删除复合导致 ID 重排，残留旧 def 类型错位拒载）

- **事故**：性能优化第一版删除 4 个层判断复合（tab_axis_flags/axis_compare/layer_hit/in_layer）→
  defineComposite 按定义顺序分配 ID，后续复合 ID 前移（orbit_scheduler 0034→0030 等）。注入器 merge
  复合定义只覆盖同 ID、不删除地图残留旧 def → 残留的 gsts_in_layer(0032) 仍引用旧 axis_compare 的 ID 0030，
  而该 ID 已被覆盖为 gsts_orbit_scheduler → **类型错位（Float→Integer、Boolean→Entity）→ 游戏拒载、无日志**
  （加载期错误不落 Beyond_Debug_Log，符合既有规则）。
- **复现/证据**：explain 残留 gsts_in_layer 显示接口 x/y/z/isR… 但内部实现是 3 个 gsts_orbit_scheduler 调用；
  地图 sha 从注入后 175825a9 变为 b94a689d（编辑器/游戏写回固化）；坏版备份
  `.gsts/backups/1073741882.gil.2026-08-20.broken-pre-inject.bak`。
- **深层教训（fail-closed 缺失）**：① 编辑器/编译器/注入器都未在 Link/注入时发现"复合引用 ID 类型错位"；
  ② 我的注入后自检盲区：只查关键复合 + var-pins，未全量对比复合定义表。
- **修复**：
  1. 恢复注入前干净备份（e911e7fa，8/19 用户测试正常版）→ 重新注入性能优化版（空洞 ID 30-32 由地图旧版
     axis_compare/layer_hit/in_layer 死复合填充，引用自洽、不被调用、无害）→ 注入后 sha `ed645c0a`，Temp 已同步。
  2. game.ts 恢复 4 个死复合定义（标注"保 ID 稳定勿删"占位）——**但实测编译器会剔除未调用定义**，
     仅靠占位无法进 GIA，真正的防线是注入后全量校验（见下）。
  3. 新增 `tools/check-gil-composite-refs.ts`：全量复合引用完整性（0 悬空）+ `--incoming` 检测残留 def
     引用被注入覆盖的 ID（事故模式）。注入后必跑，已纳入 gil-node-graph-reading Step 3.5。
  4. open-items O5 登记治本候选：注入器残留类型校验 / 编译器保留死复合定义。
- **待用户游戏核验**：转动/打乱/复原/胜利结算 + 新日志帧数对比（性能优化目标：每转动 ~1925→~1700 帧）。

## 变更记录 2026-08-20（✅ 性能优化游戏核验通过：每转动 1925→1617 帧，-16%）

- **用户游戏核验**（2026-08-20 11:37 会话，日志 `2026-08-20_11-37-24_2737_110170759.gia`，90 记录）：
  4 次转动 + 打乱/复原流程正常、无拒载；`rubik-solved-win` 胜利结算触发（rec88）。
- **优化效果（帧 = 单节点执行，旧 8/19 日志 vs 新 8/20 日志）**：

  | 阶段 | 旧版 | 新版 | 变化 |
  |---|---|---|---|
  | 点击帧（apply_move 逻辑层） | 380 | 380 | 不变（方案 C 未做） |
  | 块事件（turn_one） | 4×272+4×35=1228 | 4×230=920 | **-308** |
  | 段事件（segment_dispatch） | 16×14=224 | 224 | 不变 |
  | after_turn | 93 | 93 | 不变 |
  | **一次转动合计** | **1925** | **1617** | **-308（-16%）** |

- **构成分析**：8→4 块事件省 140 帧（未命中块事件消失）+ 命中块 turn_check 位置层判断→查表省 168 帧
  （命中块事件 272→230）；点击帧 380 未动（apply_move 变量重复 get，属方案 C 范畴，后续可做）。

## 变更记录 2026-08-20（✅ 复合生命周期管理示范：4 个废弃复合改名 _deprecated）

- **落实"改名保留定义"规则**：四个不再使用的层判断复合统一加 `_deprecated` 后缀
  （gsts_tab_axis_flags_deprecated / gsts_axis_compare_deprecated / gsts_layer_hit_deprecated /
  gsts_in_layer_deprecated），内部互引同步改名——**不删除定义**（删除会导致复合 ID 前移 +
  注入器残留错位，2026-08-20 事故教训）。
- **验证**：编译绿；decode 新 GIA 复合 ID 集合与注入版完全一致（32 def、空洞 24/30-32、
  关键 ID 0025/0033/0034/0035 不变）→ **无需重新注入**（地图 ed645c0a 保持有效）。
  注：当前编译器会剔除未调用定义，_deprecated 复合不进 GIA（ID 由定义顺序占位保住），
  待 open-items O5 治本（编译器保留全部定义 / 注入器残留清理）后可真正删除。
- **规则已沉淀**：dsl-nodegraph-development 技能「复合生命周期管理」——改名/改实现 = 安全
  （ID 不变，注入同 ID 覆盖，composite-reinjection.test.ts 回归保护）；删除 = 需先 O5 治本。

## 变更记录 2026-08-20（✅ 写法重复优化 ②：变量 get 合并，已注入待核验）

- **负载分析新维度**（用户方法论，已沉淀 `docs/game-engine-knowledge/node-load-reference.md`）：
  优化不能只看帧数，要看 ①总帧数 ②单帧负载（load）③写法重复物化——段事件帧数 14% 但负载 34%
  （add motion device 单帧 load=30）；Create Prefab 单帧 load=36-114（最重单节点）。
- **优化 ②（零风险代码改写）**：
  - `gsts_logic_is_solved`：cornerPos/cornerOrient 各 get 一次共享 → 64→50 节点（GetVar 16→2）
  - `gsts_logic_apply_move`：tempP/tempT 各 get 一次共享 → 25→19 节点（GetVar 8→2）
  - `gsts_logic_write_slot`：7 个变量句柄 get 一次共享（tempQ 2→1）→ 23→22 节点（GetVar 8→7）
- **验证**：编译绿；注入（备份 `.gsts/backups/1073741882.gil.2026-08-20.opt2-pre-inject.bak`，
  注入后 sha `984f5aed`，Temp 已同步）；自检 check-gil-composite-refs 0 悬空 + scan-gil-var-pins
  94 节点 0 违规（GetVar 合并生效：var 节点 115→94）。
- **待用户游戏核验**：转动/胜利结算 + 新日志对比（预期：点击帧 380→~340，after_turn 93→~70，
  总负载 3547→~3400；打乱/自动队列 20 步逻辑层再省 ~880 帧）。

## 变更记录 2026-08-20（✅ 优化②游戏核验：is_solved 生效，exec 链 GetVar 共享无效——方法论修正）

- **用户游戏核验**（2026-08-20 12:05 会话）：转动 + 胜利结算正常（rubik-solved-win）。
- **实测结果（12-05 vs 11-37 日志）**：
  - `gsts_logic_is_solved`（纯数据复合）GetVar 16→2 **生效**：after_turn 93→65 帧（-28/转动，
    负载 136→111；打乱/自动队列 20 步逻辑层 -560 帧）
  - `gsts_logic_apply_move` / `gsts_logic_write_slot`（exec 复合）GetVar 共享 **帧数零变化**
    （点击帧 380→380，负载 678→674）——引擎按 exec 链逐节点求值，共享 GetVar 不减少执行帧
  - **每转动：1617 → 1589 帧（-1.7%）**；累计优化（A+B+②）：1925 → 1589（**-17.5%**）
- **方法论修正**（已更新 node-load-reference.md）：GetVar 共享只在纯数据复合有效；
  exec 链变量优化应聚焦减少节点本身，而非共享引用。
- **下一步候选**：① 段事件合并（orbit2-5 四段→两段，负载 -17%，需确认动画取舍）。

## 变更记录 2026-08-20（✅ vel1 物化实验：用户理论证实——复杂链双消费重复求值，物化有效）

- **实验**（用户方法论："执行性能 = 单次负载 × 次数；复杂运算结果被多处消费会重复求值，物化到
  变量可省"）：turn_block 的 m1 运动器 vel1 从 `v.vel1`（orbit_velocity 复杂链 ~40 节点输出，
  被 store+m1 两处消费）改为读回 `vels1[piece]`（store 已写入，物化模式）。
- **结果（12-29 vs 12-05 日志）**：
  - 块事件帧数 **230 → 216（每事件 -14 帧）**——证实 orbit_velocity 链确因 vel1 双消费被重复求值
    （省下的一次链执行 = 14 帧/块）；每转动 4 块 → **-56 帧/转动**
  - 每转动 **1589 → 1533 帧（-3.5%）**；累计优化（A+B + is_solved + vel1 物化）：**1925 → 1533（-20.4%）**
  - 胜利结算正常（rubik-solved-win）
- **方法论结论（已更新 node-load-reference.md）**：复杂运算链（多节点复合）输出被 ≥2 处消费时，
  引擎按消费点重复求值整链——**物化到变量（set 后 get 读回）只付读变量负载**，是真实负载优化
  （区别于简单节点 GetVar 共享：只减节点不减负载）。
- **日志工具升级（2026-08-20）**：gia_log.py frames 递归解析完整嵌套节点链 + 新增 perf 子命令
  （每记录/节点链聚合 次数×负载，--compare 对比），性能分析一眼可见。

## 变更记录 2026-08-20（动画渲染调优：轴方向修复 + 2 段公转 + 相位差收敛 + 实验 B 结论）

- **轴方向修复（日志几何实证）**：R/L/F/B 四面 `axes` 方向与 tblTo 表不符（R 用 -X 应为 +X 等）——
  初始渲染正确（y+ = Down 约定），但旋转运动器绕轴转的几何结果与逻辑表脱节，转动后块位置错位
  （fin-pos 诊断 (3.5,3.5,2.5) vs 逻辑 UFR）。修复 axes：R(+X)/L(-X)/F(+Z)/B(-Z)，U/D 不变。
  验证方法：模拟"块绕当前轴转 90°"（罗德里格斯）对比 tblTo 目标槽坐标，不一致即轴反。
- **运动器语义实证**：`addUniformBasicRotationBasedMotionDevice` 第 4 参 = **角速度°/s 非总角**
  （0.3s 传 90 → 只转 27°≈30°，旧版 1s×90°/s=90° 巧合正确）→ 修复 300°/s（0.3s 转满 90°）。
  motion-devices.md 补充两种旋转运动器（Uniform 85 / Target-Oriented 520，后者语义待验证）。
- **实验 B（失败，结论固化）**：公转改用旋转运动器绕层轴 90°——**旋转运动器只改朝向、不驱动位置**
  （M·R_local 局部旋转，motion-devices.md 3.1 一致），公转必须用线性运动器分段逼近弧线。已回退。
- **公转 5 段 → 3 段 → 2 段**：每段 0.15s（45°+45°，总 0.3s），K_VEL=6.6667；运动器/块 4→3，
  段事件/转动 8→4；负载目标：段事件运动器次数减半（-18%）。
- **相位差随机化收敛**：4 块启动间隔 getRandomFloatingPointNumber + 物化 turnTimes（float_list）——
  34ms 嫌多 → 13ms 好 → 8ms 重叠 → 回调 13ms（0.004~0.008 起始 + 0.003~0.006 间隔）。
- **日志工具升级**：gia_log.py frames 递归解析完整嵌套节点链 + `perf` 子命令（每记录/节点链 次数×负载，
  `--compare` 对比）；`tools/check-gil-composite-refs.ts` 注入后全量复合引用校验。
- **负载分析结论**（15-07 日志 40+ 转动）：段事件运动器 320 次×9810 负载居首（引擎操作，只能减次数）、
  apply_move 逻辑链 5904 帧×6414（待方案 C）、turn_block 计算链 161×5522。
- **待办**：方案 C（apply_move 变量 get 合并）、注入器残留治本（open-items O5）、
  Target-Oriented(520) 参数语义验证。
