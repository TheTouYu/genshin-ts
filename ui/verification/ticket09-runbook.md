# 票09 Runbook — 游戏内核验（新地图，真实 CLI + 用户逐条确认）

> 用途：.scratch/ui-command-layer/issues/09 的执行配方。执行环境=真实地图 live 文件 + `node ./bin/gsts.mjs`
> （tsx 沙箱故障时用 bin 入口，见 asset-operations SKILL step 0）。结果落盘 ui/verification/ticket09-verification-report.md。
> 纪律来源：BOARD.md（前沿=票09）、issues/05/06/07（命令面已就绪）、ui/AGENTS.md 铁律 1-9。
> 真机 --help 为准：本文件命令签名按 DESIGN.md 第三章 + 票 05/06/07 轮次记录书写；
> **每类命令首次执行前先跑一次 `--help` 核对 flag 名，冲突以真机为准并回注本文件。**

## 0. 执行前不变量（违反即停）

- 一次性授权窗口：**只写本票新地图**的 live .gil；目标 mapId/路径/文件任一变化 → 停止重新确认。
- 建图/写回时**游戏关闭**（编辑器内存 gip 覆盖注册；写回后磁盘结果可能被旧内存保存覆盖）。
- 每步顺序：SHA 锁定 → 候选（`--output`，不写源）→ 独立回读候选 → 展示安全门
  （目标/源 SHA/候选 SHA/备份路径）→ 写回 → 独立回读 → 提醒用户重载。
- 图内 ID 一律从快照读，不硬猜；出现"变更消失/不对"先核对当前 hash 是否=写回后 hash，
  相等则先怀疑**旧编辑器内存保存覆盖**、请用户重载后再观察，不要先怀疑结构。
- 报告分层：`候选就绪 → 写回成功 → 编辑器可见 → 游戏核验通过`，前一层不冒充后一层；
  **行为层证据 = 用户游戏确认原文**（逐条贴句子）；结构层证据（SHA/回读/diff）单独列出。

## 1. §A 基座（新地图 + 基线锁）

```bash
# 1) 列出地图确认当前状态（本票仅此一次全量 maps；之后用锁定路径）
node ./bin/gsts.mjs maps
# 2) 新建干净地图（游戏名=编辑器显示名，玩家可辨识；确认输出含 temp=；无 temp= 则补 resync）
node ./bin/gsts.mjs maps:create --name "<UI核验09>"   # 实际 flag 以 maps:create --help 为准
node ./bin/gsts.mjs maps:resync --map-id <新图id>      # 仅当创建输出无 temp= 时
# 3) 补全首存骨架（root7 地形/布局注册等）：判定缺 root7 则跑 init
node ./bin/gsts.mjs maps:init --map-id <新图id> --write
# 4) 锁定基线：物理快照 + SHA-256 双保险
mkdir -p .gsts/diff-exp/<新图名>/
cp <live 路径>/<mapId>.gil .gsts/diff-exp/<新图名>/<mapId>.baseline-<hash8>.gil
sha256sum <live 路径>/<mapId>.gil
# 5) UI 承载确认（默认布局/控件组库容器就位，否则按分支）
node ./bin/gsts.mjs assets:ui list --gil <live 路径>/<mapId>.gil --format json
```

**§A 判定（写进报告）**

- [ ] mapId / 编辑器显示名 / live 路径已记录
- [ ] `temp=`（Temp 双写 + gip 注册）已确认（或 resync 已补）
- [ ] root7 判定完成；缺 → maps:init 已跑并回读
- [ ] `assets:ui list` 显示 **默认布局 1073741825** 与 **控件组库容器 1073741840**
- [ ] 基线物理快照 + SHA-256 已锁（记录到报告「基线」节）
- 分支：若 1825/1840 缺失 → 先请用户开编辑器**首存一次**（引擎种子布局注册/root21/root29 规范化）再查；
  仍缺 → 按已学规则种子（克隆官方预置集，ui-controls.md §新建布局），不得无承载直接 create。

## 2. §B 命令逐条游戏核验

每行记录一条固定验收句式；用户逐条在游戏内回「✅/❌ + 描述」，原文入库。
通用字段：`候选路径+SHA`、`备份路径`、`写回后 SHA`、`回读摘要`、`用户游戏确认（原文）`。

### B1 Create（布局面各一条 + 存为模板；kind=custom-button/textbox/input-box/message-queue）

| # | 目标 | 命令形态（以 --help 为准） | 游戏内确认点 |
|---|---|---|---|
| B1a | 按钮 | `assets:ui create --type custom-button --on layout:1073741825 [--name --position] --gil <live> --output <cand>` → 回读 → `--write` | 显示 ✅ / 位置大致正确 ✅ / **可点击**（无报错） |
| B1b | 文本框 | `create --type textbox --on layout:1073741825 …` | 显示 ✅ / **可输入文本** |
| B1c | 图文输入框 | `create --type input-box --on layout:1073741825 …` | 显示 ✅ / 图文/输入正常 |
| B1d | 消息队列 | `create --type message-queue --on layout:1073741825 …` | 显示 ✅ / **队列正常渲染**（消息项可显示） |
| B1e | 存为模板 | `template create --target <B1a 实例 ID>`（官方源或实例源；autoLibrary 按 kind） | 原实例仍在 ✅ / 模板生效（不破坏既有布局） |

注（对齐票05 open-items，如实标注）：
- create 阶段**不启用样式参数** `--text/--color/--font-size`（无「同参编辑器 create 样本」，CLI fail-closed）；
  控件按默认形态创建，文本/样式由 B2 或玩家细排设置。
- `--position/--size` 几何 patch 仅有语义回读断言（无编辑器同参 create 样本），坐标单位口径以真机
  `--help` + 回读为准；位置是否正确最终以游戏内视觉为准（这正是本票行为层核验点）。
- 候选先 `--output` 落 /tmp 或 .gsts/diff-exp/<新图名>/candidates/，独立回读确认只增目标记录
  （布局 f503 成员 + 新记录），再展示安全门写回。写回后提醒用户**重载地图**再进游戏确认。

### B2 Edit（6 项，全部针对已确认存在的控件实例）

> 目标控件按实现支持面选（fail-closed 防拒）：改名/位置 → 任意已确认实例（本清单用 B1a 按钮）；
> 文本/字号/对齐/颜色 → **B1b 文本框或 B1c 图文输入框**（f19 文本配置容器，S11-17 与轮19→20
> 字节级对拍已 PASS）；若 --text/--align 对按钮被拒（无 f19 宿主），改用文本框目标并在报告注明。

| # | 目标控件 | 命令形态 | 游戏内确认点 |
|---|---|---|---|
| B2a | B1a 按钮 | `update --target <B1a ID> --name …` | 名字变化（编辑器/屏上可见名） |
| B2b | B1b 文本框 | `update --target <B1b ID> --text …` | 屏上文字变化正确 |
| B2c | B1b 文本框 | `update --target <B1b ID> --font-size …`（1..512） | 字号视觉变化 |
| B2d | B1b 文本框 | `update --target <B1b ID> --align left|center|right` ×3 | 三种对齐都正确 |
| B2e | B1b 文本框 | `update --target <B1b ID> --color #RRGGBB` | 文字颜色视觉变化 |
| B2f | B1a 按钮 | `update --target <B1a ID> --position x,y` | 位置移动正确 |

每项写回后独立回读（extractTextConfig/transform 只差目标字段），再请用户重载+游戏确认。

### B3 Delete（先预览 removed 清单）

```bash
# 预览（不写）：输出 removed 清单（目标记录+私有素材树+宿主成员+模板 backref+索引）
assets:ui delete --target <一条布局控件> --gil <live>      # 无 --write → dry-run 预览
# 展示 removed 给用户确认 → 再写
assets:ui delete --target <控件> --write --yes
```

游戏内确认：**控件消失 ✅ / 无报错 / 无残留**（其它控件不受影响）。
open-item 若触发（模板 f14 空列表/queue 家族删除无样本）→ 停止并开修复轮。

## 3. §C 玩家细排动作读回（真实核验）

1. 请用户在编辑器/游戏对已创建控件做 **≥2 类**细排动作（示例：拖位置、改文字、
   改字号/颜色、增删一条控件——任选两类以上；告知用户动作清单供对账）。
2. 用户保存后：`sha256sum` 核对 hash 已变（未变 → 先确认真的保存了，禁止先下空操作结论）。
3. 读回并逐项对上：
   ```bash
   assets:ui anchor save --gil <live>                          # 记录当前语义锚点（首次在玩家动作前也存一次）
   assets:ui list --flat --gil <live> --format json            # 平面读回玩家改动后状态
   assets:ui diff --anchor <动作前锚点> --gil <live>           # 新增/删除/字段级变更/playerChanges
   ```
4. 把 diff 输出的每条 playerChange 与用户动作逐项对上，写「动作 ↔ 读回」对照表，请用户复核。

## 4. §D 收尾

- 每步三栏报告写入 ui/verification/ticket09-verification-report.md：
  **已验证**（注明证据层：结构=SHA/回读/diff；行为=用户游戏确认原文）/
  **未验证** / **需用户确认**。
- 发现问题：先 hash 归因（覆盖假象）→ 仍异常才怀疑结构 → 当场开修复轮至通过。
- 全部通过后：结果回灌票08 关账（复盘/PKC/技能回灌/知识书/看板划掉在 08 统一执行），
  本票只落核验记录，不另立进度（BOARD.md 规则）。

## 5. 异常处置速查

| 症状 | 第一动作 |
|---|---|
| 写回后游戏里没变化 | sha256 当前 live == 写回后 SHA？是 → 请用户重载/重开编辑器，勿重写 |
| hash 与预期不符 | 停下，列出当前 hash/备份 hash，定位哪一步被覆盖，再决定 |
| 编辑器首存后结构多出 root21/29 | 已知首存规范化（skill 记录），登记非异常 |
| 命令报错/候选回读不符 | 展示原文，先按真机 --help 核对调用，仍不符 → 开修复轮（代码层） |
| 目标 mapId/路径/ID 变化 | 授权窗口失效，停止并重新征求确认 |
