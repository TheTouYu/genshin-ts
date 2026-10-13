# 任务：把《虹猫蓝兔·七侠传》网页版迁移为千星沙箱 Lua 实现

## 一、游戏是什么

横版卷轴弹幕射击游戏（原型：虹猫蓝兔七侠传 Flash 游戏，已重设计）：

- **双角色**：虹猫（长虹剑：重击流，蓄力=贯日巨剑，大招 K=火凤燎原）；蓝兔（快射流，每发攒银针，蓄力=冰魄剑+针雨齐发，大招 K=冰封千里）。
- **六关**：第一关·长虹出鞘 / 第二关·冰魄试炼 / 第三关·蛟龙怒涛 / 第四关·机械咆哮 / 第五关·魔神降临 / 终关·弹雨终局；含中 boss 车轮战、逃脱演出、分相 boss、环境刷怪（鱼雷）。
- **成长与系统**：pow 升级 5 级弹型、蓄力双档（70%/满）、炸弹清屏、七条隐藏特性（首次触发弹教学卡）、十条「悟」图鉴条件、暴击/燃烧/冻结、得分结算与重开、选人屏、触屏拖动+虚拟按钮。

**行为规格唯一真源 = `prototype/index.html`（1098 行）**：全部数值（N 表/wavesDef/LEVELS/敌人表/TRAITS/CODEX）、输入模型、渲染表现、音效钩子都在其中，逐行对齐实现。原版 Flash 的考据资料在 `research/notes/`（白皮书/关 2-6 波次/蓄力报告），供溯源，冲突时以 index.html 为准。

## 二、任务

把上述游戏完整迁移为千星模拟器客户端 Lua，达到：真实试玩页可玩——选人→六关通关链（`level_clear`×6 + `game_win` 日志）→双角色/蓄力/大招/特性/结算/重开全部可操作。美术用基础图元占位（素材键名对齐 index.html 的 ART 表；`prototype/assets/*.svg` 为已定稿的手绘素材，本任务不导入 imageId）。

产出：`lua/main.lua`（单脚本）+ `hmlt-qixia.save.json`（构建生成）。

## 三、资产地图（相对 workspace/hmlt-qixia/，均已核实存在）

| 内容 | 路径 |
| --- | --- |
| 行为规格真源 | `prototype/index.html`（开工前全文读一遍） |
| 游戏设计文档 | `docs/gdd.md` |
| 测试用例与协议 | `tests/*.json`（12 用例）+ `docs/tests-trace.md`（日志词汇表 / Debug 信号协议 / 键位映射） |
| 素材考据 | `research/notes/mechanics-whitepaper.md`、`levels-2-6-waves.md`、`charge-and-feedback-report.md`、`asset-manifest.md` |
| 手绘美术与预览页 | `prototype/assets/*.svg`、`*-preview.html` |
| 原版素材库 | `research/extract/assets/shapes/`（534 SVG）、`research/extract/assets/sounds/`（54 mp3） |
| 构建与本地测试装置 | `qxqy/build.py`（生成存档）、`qxqy/runner.mjs`（本地跑 tests/ 用例） |
| 玩法测试记录 | `records/playtest.md` |

## 四、平台事实（千星沙箱）

- 脚本挂载：单脚本挂 n1「游戏层」控件（server-control-template，全屏容器，showCursor=true）；`script:EnableUpdate(true)` + OnUpdate(dt) 驱动。
- 坐标系：逻辑场 **444×250，Y 轴向上**（设计定案，见 gdd）；实际画布经 `game.GetUICanvasSize()` 取得后按 K=画布宽/444 缩放。
- 键位枚举（Enum.KeyEventType，全表见官方文档）：J=KeyboardCraftspersonKey19、K=Key20、方向键=Key36-39、WASD=KeyboardMoveLeft/Right/Forward/Backward*、enter=Key11、R=KeyboardCharacterSkill3*。
- 官方客户端 API 文档（权威，写码前对照）：仓库根 `research/千星知识图谱/learn-lua71/官方API文档-客户端控件.md`。
- 模拟器工具：qxqy_studio_load（装存档）/ play（启动与交互）/ play_screenshot（截图）；模拟器画面仅预览图元 100001-100006。
- 千星坐标 Y 向上，HTML 坐标 Y 向下，换算关系不要直接照抄像素值。

## 五、验收

1. `python3 qxqy/build.py` 构建存档成功；`node qxqy/runner.mjs` 跑 `tests/` 全部用例通过。
2. 模拟器：选人屏渲染正常（中文可读）、六关依次通关、结算/重开正常，截图留档。
3. 真实试玩页（用户）试玩确认可玩。

每轮结束更新 `docs/PROGRESS-rebuild.md` 并 git commit。
