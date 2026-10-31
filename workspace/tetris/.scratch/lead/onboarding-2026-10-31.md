# 俄罗斯方块（tetris）接手报告 — 2026-10-31

> 读者：下一个接手本工程的代理。全部读数都在本机复现过，命令写在每条后面。
> 配套：同目录 `refactor-audit.md`（242 行静态审计，未改码）。

## 0. 一句话现状

模拟器路线全绿、能出图、70 条用例全过；代码本身是「一个大 main.lua（6859 行）+ 10 个闭包模块」，
重构窗口是开着的（main chunk 还剩 54 个 local 余量），但**层序靠创建顺序**这条铁律决定了重构必须一块一块动。

## 1. 可复现读数（本轮亲测）

| 步骤 | 命令 | 结果 |
|---|---|---|
| 构建（含闸门） | `node qxqy/build.mjs` | exit 0；`main locals 146/200（余量 54）`、`lua compile ok (11 files, luac5.3)`、`gia combined true`、save 848132 B |
| 全用例 | `node qxqy/runner.mjs` | **70/70 通过，387.2s，exit 0** |
| 出图 | `node qxqy/shots-v5.mjs --all --out <dir>` | 5 画布 × 6 屏 = 30 张，15.4s，exit 0 |
| 模拟器网页 | `curl -m3 http://127.0.0.1:4173` | http=200（进程 pid 866，`node web/server.js --workspace /home/h/qxqy-workspace`，cwd=`/home/h/miliastra-beyond-simulator`） |

## 2. 代码地图

- `lua/main.lua` 6859 行 = 20 节。关键节行号：模块装载器 44-86 / 确定性与 7-bag 94-289 /
  控件工具箱+音效 290-711 / 结算三选项 712-1834 / 规则说明页 2122-2454 / 标题展台 2519-2969 /
  四模式选择 2970-3130 / 双屏布局 3319-3556 / HUD 双写 3557-3724 / 角色技能 3725-3778 /
  席位配色 3779-4514 / 动作队列清洗 4779-5345 / **布局唯一实现 `layout(W,H)` 5760-6514** /
  按钮布局搬到 `ui.lua` 5563-6586 / 画布尺寸轮询 6587-6859。
- 10 个模块 `lua/tetris/*.lua`（config/aieval/audio/controls/copy/fx/roster/skills/ui/widgets）
  一律 `M.new(spec)` 闭包工厂，返回表被 main 挂到 `FN` 上；`loadModule` 按 4 级候选 pcall require。
- 全局状态纪律（main.lua:87-94）：**Lua 5.3 main chunk local 硬限 200**（超了真机整份脚本拒载），
  所以新状态一律写全局或挂表（FN/UI4/HUD_INST/G/SETTLE_HOTS…）。这条是「屎山」的物理起因，不是懒。
- 工具 `qxqy/`：build（产 save+GIA+闸门）/ runner（用例）/ shots-v5（出图矩阵）/ frame-strip（公共）/
  deploy（真机一步部署）/ audit-ui / measure-ai。

## 3. 屎山三病灶 + 重构计划

1. **`layout(W,H)` 755 行里塞了整个 OnStart**：样式基线 + 模板探针 + 背景池/200 格/4 框 +
   **515 行键位注册**（5996-6510）+ 结算三动作 + 手柄 + 技能键。
2. **控件工厂被绕过**：`InstantiateClientUIControl` 35 处调用点里 22 处是手写 pcall 样板；颜色运算 9 处、
   角色名表 4 张（真源 `copy.lua`）、键位真源 5 份。
3. **状态无边界**：`g` 重绑定即切盘；`roster.lua` 向 main 的 `FN` 表反写 9 项；模块 env 是 12-30 个闭包的隐式契约。

重构顺序（都挂 `FN` 表，新增 0 个 local，因此不碰 200-local 红线）：

- **R1** 抽 `FN.registerInputs()`（5996-6510 纯搬家）→ layout 755→240 行。守：02/03/05/06/26/27/30/31/35-38/41/43/48/52-55/61-62。
- **R2** `FN.mkCell/mkText/mkHit` 工厂替 22 处样板。守：01/29/32/37/43/49/58。
- **R3** 角色元数据单源（删 main:3736-3744 四张表，读 `FN.COPY.ROLES`）。守：52-55/58/63。
- **R4** `buildBoard` 拆出前**必须先有出图基线**（动层序）。

**别动清单**：① 层序=创建顺序（wash→背板→200 格→4 框；A13「左上角灰方块」= 探针建早了被 wash 盖住，
main.lua:5835-5842；`SetAsLastSibling` 在模拟器是空操作）；② 日志字面量是测试契约（tests/56 断言
`contains:"copy levelup lv=2"`，print 只能包装不能改字面量）；③ 服务端 textbox 恒在运行时实例之下。

## 4. 模拟器部署四条路

1. **网页试玩**（人手玩）：存档复制进 `/home/h/qxqy-workspace/` → 浏览器 `http://127.0.0.1:4173` 选择器里挑名字。
   网页只显示 `meta.name`（build.mjs 本轮起自动写 `俄罗斯方块 <BUILD_TAG>`，此前一律「未命名存档」）。
2. **离线跑用例**：`node qxqy/runner.mjs [子串]`（exit 0 = 全绿）。
3. **离线出图**：`node qxqy/shots-v5.mjs --all --canvas <id> --screen <title|game|help|settle|roster|dual> --out <dir>`。
4. **真机**：`node qxqy/deploy.mjs`（重建+铺网页工作区+复制 GIA 到游戏导出目录）；`--device` 直写地图 .gil
   （**破坏性，需用户确认**）；`--calibrate` 读真机 guid 回写候选表。

画布：pc-16-9 1600×900 / pc-21-9 2100×900 / mobile-16-9 1280×720（用例基线）/ mobile-19.5-9 1560×720 / mobile-4-3 1280×960。

## 5. 人眼出图发现的问题（L2 渲染层，用例全绿也看不出来）

1. **手机端结算页三个触控键几乎不可见**：`ptaagain/ptahome/ptadetail` 三个 textbox 只有文字，
   底板胶囊 `pbaagainb` 等 imageColor=0xFFFAF43D（**alpha=0x3D≈24% 白**）压在近白 wash
   (247,250,255) 上，像素采样证实取不到底；且 `ptaagain` 在 ty=-220、高 64，与结算卡（中心 780×400，
   底 -200）**重叠 12px**，而卡先创建→卡压住胶囊。见 `.scratch/lead/shots/v5/mobile-16-9/settle.png`。
2. **手机端角色档案三处折行被裁**：`charPanelL1/L4/charPanelS` `textLayout.fits=false`
   （需高 51.7/51.7/46.4，实际框高不够，第二行被切）；PC 同页 fitsBad=0 ⇒ 宽度未按移动端重算。
3. **重复标签**：结算卡上 `[R]再来一局 / [V]回主页 / [Q]结算明细` 与下面的触控标签 3 个动作同屏出现两遍。

## 6. 本轮改了什么（均已验证）

| 文件 | 改动 | 验证 |
|---|---|---|
| `qxqy/build.mjs` | 存档写 `meta.name = '俄罗斯方块 ' + BUILD_TAG`（此前恒「未命名存档」） | 重建 exit 0；`meta.name=俄罗斯方块 v5.38 · 10-31 02:1x`；与改前存档**去掉 meta 后逐字节相同**（用例结论不受影响） |
| `qxqy/shots-v5.mjs:136,193` | roster 到达判据锚点 `roster open n=` → `char codex open n=`（前者全仓 0 命中=死判据，导致 5 画布误报 BLOCKED） | 重出图 5/5 `✓ char codex open`，阻塞 0 |

备份：`.scratch/lead/save-before-build.json`（本轮首次构建前的存档）、`/tmp/tetris.workspace-v4.backup.json`（网页工作区旧存档）。
