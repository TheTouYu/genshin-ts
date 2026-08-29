# 完整复盘：速度场带球注入拒载——从"五连失误"到"注入后核验纪律"（2026-08-30）

> 范围：2026-08-28 带球切速度场（be13897）→ 08-30 拒载修复（03bab09 + 本次）
> 视角：注入链路（DSL→编译→注入→核验→游戏）全流程复盘
> 证据：提交 be13897/03bab09、拒载快照 0ae6f5d1、清理后 7130d60d、
>       技能 gil-node-graph-reading Step 3.5 原文（注入后必跑项）
> 状态：已验证（真实地图清理实证 + 工具回测实证）

## 一、错误谱系总览（5 连失误）

| # | 日期 | 根因层 | 具体错误 | 修复 | 提交 |
|---|---|---|---|---|---|
| 1 | 08-28 | DSL 用法 | `dataTypeConversion(bool→float)` 直转——引擎无此变体，编译报 `E_UNKNOWN_NODE_VARIANT` | 改 bool→int→float 两段（项目既有模式） | be13897 |
| 2 | 08-28 | 代码删除 | 清理 physics.ts 死代码时**误删 physSlideTick**（物理复合当冲量踢球删）→ 编译报未定义 | 从 git HEAD 恢复 | be13897 |
| 3 | 08-28 | 排查方法 | `set_custom_variable` 误判"被 GIA 丢弃"——实际编码为 nodeId 22（数字而非字符串），搜字符串找不到 | 按 nodeId 核对，确认 4 个 state 同步节点在位 | be13897 |
| 4 | 08-28 | **流程遗漏** | 注入后**漏跑 `check-gil-composite-refs --incoming <本次.gia>`**（技能 Step 3.5 必跑项）→ 旧冲量踢球残留链（auto_check_tick→dribble_decide）类型错位漏检 → **游戏拒载无日志** | def-clean --force 清理 7 残留（含残留链整体删） | 03bab09 |
| 5 | 08-30 | 复盘深度 | 首版复盘只有"现象→根因→修复"，无谱系、无系统性根因、**未动任何技能** | 本完整复盘（五步闭环） | 本次 |

## 二、最近一次错误（#4 拒载）的完整调查链

### 现象
切换速度场带球并注入后，游戏启动不了（拒载无日志）。用户查 `dribble_decide` 复合节点"问题很大"。

### 差分定位（用户线索 → 铁证）
1. `parse-gil-node-graph --list` 全量复合目录 → 发现 7 个残留：`dribble_decide`(1610700021)、
   `auto_check_tick`(1610700022)、`phys_goal_collide(1)`、`kick_apply_force(1)`、`kick_launch(1)`、
   `kick_apply_impulse(1)`、`kick_reset(1)`。
2. `explain --composite dribble_decide` → impl 内部引用 `phys_slide_tick`/`kick_reset`/`kick_apply_force`
   （**新版复合**）——exec 复合被当数据复合引用，接口错位。
3. `def-clean <id> --dry-run` 报 `dribble_decide still referenced by 1 node(s): graph 1610710022 n17`
   → 暴露残留链：`auto_check_tick`(impl 1610710022) n17 调用 `dribble_decide`(1610700021)。

### 根因（为什么会有残留链）
- 旧版 game.gia（冲量踢球版）注入时写入 6 个冲量复合；新版删掉它们后，**注入器 merge 只覆盖同 ID、
  从不删除地图残留 def**（2026-08-20 orbit_scheduler 同款事故模式）。
- 新版复合 ID 按定义顺序前移，与旧残留 ID 段重叠 → 残留 impl 内部引用的 ID 落到新版复合上 → 类型错位。
- 游戏校验目录里**全部复合（含零引用残留）** → 拒载无日志。

### 修复与验证
- `def-clean 7 个残留 --force --output 候选` → 候选回读（目录干净 + 0 悬空 + 主图引用完好）→
  `--write` 写回（自动备份 + SHA 校验）→ 写后回读确认。
- 效果：SHA 0ae6f5d1 → 7130d60d，463303 → 409957 字节；24 正确复合 + 9 信号 def 保留；0 悬空。

## 三、为什么反复出问题——系统性根因（3 条）

1. **验证链有"必跑项"却无强制门**：技能 Step 3.5 白纸黑字要求注入后必跑
   `check-gil-composite-refs --incoming <本次.gia>`，且该工具**回测证明完全能抓住本次残留链**
   （3 条"类型错位"）。但"必跑"依赖模型自觉，没有机械强制 → 漏跑一次就造成拒载级事故。
   **教训：注入后核验必须逐项勾对，不是"跑几个检查"就算过。**

2. **"编译通过 + 0 悬空"不等于"游戏能加载"**：`check-gil-composite-refs`（不带 --incoming）只查
   "impl 图引用的 ID 存在"，不查"地图里多余的残留 def 是否类型错位"。两次工具输出都是 ✓，
   但游戏拒载。**教训：0 悬空是必要条件不是充分条件；残留 def 集合对比才是充分核验。**

3. **大范围删除/重构时"范围判断"依赖人工**：#2（误删 physSlideTick）和 #4（残留链）都是
   "删/改范围判断错"的变体。前者靠编译报错兜住，后者靠游戏拒载兜住——**两次都是事后发现，
   说明缺少"删除前先列清单、删除后回读对比"的机械步骤。**

## 四、流程与方法论教训

1. **注入后核验清单（Step 3.5）逐项执行，不省略**：解码 .gia 核预期 → 注入 → list 全景 →
   explain 人读核对 → **check-gil-composite-refs --incoming（必跑！）** → scan-gil-var-pins → layout。
   本次漏了 --incoming 一项，代价是拒载 + 用户一轮游戏测试。
2. **"疑似被丢弃/缺失"先查编码形态再下结论**：#3 的教训——GIA 里节点类型是数字 nodeId 不是字符串，
   搜字符串判"缺失"是错误方法。先按 node_pin_records 查 nodeId，再确认节点在位。
3. **残留清理用工具而非手改**：`def-clean` 是官方工具（候选→回读→写回），且 `--force` 能处理
   残留链互相引用（--all-unused 一轮删不掉有调用者的残留）。清理前先 --output 回读验证。
4. **复盘必须动技能**：#5 的核心教训——经验只落文档 = 下次不生效。可行动经验第一落点是技能
   （下次同类任务自动加载技能，不会自动翻文档）。

## 五、同族扩展（本次必做）

### 5.1 同族风险点枚举
| 风险点 | 现状 | 处理 |
|---|---|---|
| 足球地图其他注入残留（2000000000 段 motion_by_vel 等） | 与当前 game.gia 一致，非残留 | 已确认无害（check --incoming 显示"缺失"为误报，见下） |
| 其他地图（rubik-3x3 等）注入残留 | 未扫描 | **登记 open-items**，后续统一扫 |
| `check-gil-composite-refs --incoming` 误报项 | 2000000000-2000000003"缺失"是误报（本次 game.gia 未注入它们，非本次残留） | 已按技能 Step 3.5 误报判读规则识别 |
| def-clean 删残留链的 --force 用法 | 本次验证有效 | 写进 gil-node-graph-editing 技能 |

### 5.2 技能迭代（核心，逐技能过）
| 技能 | 迭代点 | 状态 |
|---|---|---|
| `gil-node-graph-reading` | Step 3.5 注入后必跑项补强：--incoming 的重要性说明 + "0 悬空≠充分"判读 | 本次改 |
| `gil-node-graph-editing` | 补 def-clean 残留清理速查（显式列表 + --force 残留链 + 候选→回读→写回） | 本次改 |
| `verify-injection` | 注入后核验补 --incoming 必跑项 | 本次改 |
| `dsl-nodegraph-development` | 补 bool→int→float 两段转换 + set_custom_variable 编码为 nodeId 22 | 本次改 |

## 六、产出清单

- 修复：def-clean 清理 7 残留（地图 7130d60d，备份 1073741908.gil.2026-08-29T23-14-25-933Z.def-clean.bak）
- 文档：本复盘 + retrospective-2026-08-30-dribble-residue-rejection.md（首版，现象级）
- 技能：gil-node-graph-reading / gil-node-graph-editing / verify-injection / dsl-nodegraph-development 四处迭代
- 待办：其他地图残留扫描（登记 open-items）
