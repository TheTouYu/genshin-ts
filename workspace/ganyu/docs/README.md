# 霜华纪 · FROSTBLOOM

> 甘雨主题的 2D UI 游戏模板（千星沙箱模拟器 · 纯 Lua + 六种基础图元）。
> 关键词：**冰雪 / 射击 / 关卡 / 养成 / 清新**。玩法数值不接平衡，**全部界面与完整流程可跑、可点、可出图**。

![标题](preview/title.png)

## 一、它是什么

一套可以直接改成正式游戏的「壳 + 流程 + 视觉语言」：

- **完整流程**：启动 → 标题 → 主菜单 → 关卡地图 → 出战准备 → 战斗 → 结算 → 回地图；养成、图鉴、设置、制作名单各自闭环。
- **可操作的战斗演示层**：悬停敌人出现霜华准星与瞄准虚线，点击射出霜华矢，命中碎裂、伤害数字、连击、能量条，能量满按 `E` 释放「降众天华」，三波清空进结算，计时归零判负。
- **双主题视觉系统**：`day`（清爽冰蓝，菜单/养成/图鉴/设置）与 `night`（深蓝夜雪月色，标题/战斗/结算），一套 `T.th.*` 令牌切换。
- **可复用组件库**：按钮/卡片/页头/页脚/页签/胶囊/徽章/进度条/图标（40+ 种）/槽位/头像/星级/弹层/Toast/转场/震屏。
- **纯图元美术**：rect / circle / triangle / fourstar / fivestar / ring 六种图元画出雪峰山脊、月轮极光、甘雨立绘、霜翼虫/霜甲守卫/霜华兽王、冰晶与关卡小景。

它不是：数值平衡后的正式玩法，也不是带存档持久化的上线产品（见「已知限制」）。

## 二、流程与界面

```
boot(启动)
  └─ title(标题) ─┬─ menu(主菜单)
                  ├─ settings(设置) → help(指南) / confirm(重置确认)
                  └─ credits(制作名单)

menu ─┬─ map(关卡地图：2 章 × 3 关，锁定/星级/奖励)
      │    └─ prepare(出战准备：队伍/武器/圣遗物/关卡情报)
      │         └─ battle(战斗 HUD + 瞄准射击 + 能量技能 + 3 波)
      │              ├─ pause(暂停：继续/重开/设置/返回地图)
      │              └─ result(结算：胜负/星级/奖励/经验)
      ├─ growth(养成：甘雨 Lv/属性/武器/圣遗物/天赋/命之座/材料)
      │    ├─ ascend(突破弹层)
      │    └─ talent(天赋弹层)
      ├─ codex(图鉴：敌人/装备/材料/世界 4 页签 + 详情)
      ├─ settings
      └─ credits
```

所有弹层走同一套 `T.openOverlay`：暗色遮罩 + 上浮面板 + 焦点接管 + `Q` 关闭 + 关闭后焦点归还来源项。

## 三、操作

| 输入 | 作用 |
| --- | --- |
| 鼠标悬停 | 高亮/选中；战斗中对准敌人出现准星与虚线 |
| 鼠标点击 | 确认 / 射击 |
| ↑ ↓ ← → | 移动焦点（几何导航，支持回绕） |
| 空格 / J | 确认 |
| E（`DropKey`） | 释放元素爆发（战斗） |
| Q（`CharacterSkill2Key`） | 返回 / 暂停 |
| H（`CraftspersonKey15`） | 打开/关闭霜华指南 |

## 四、工程与命令

```bash
cd workspace/ganyu

node qxqy/build.mjs                 # 拼接 lua/src/*.lua → lua/main.lua → ganyu.save.json + device-package/GIA
node qxqy/runner.mjs                # 18 个回归用例（移动端 + PC + 4:3）
node qxqy/shot.mjs                  # 全流程 24 屏出图（手机 1280×720）
node qxqy/shot.mjs pc-16-9          # 全流程 24 屏出图（PC 1600×900，文件名带 -pc）
node qxqy/shot-battle.mjs           # 战斗链专项出图（命中/波次/技能/结算/暂停）
python3 ../../.agents/skills/lua-2d-ui-game-build/scripts/audit-lua.mjs lua/main.lua   # 静态审计
```

构建产物：

- `lua/main.lua`：单文件 Lua（约 5.0k 行 / 208KB），三个运行时模板 `prim/label/hit` 的 GUID 由构建注入。
- `ganyu.save.json`：模拟器工程存档（3 个客户端控件模板 + 服务端脚本宿主）。
- `device-package/霜华纪-整合包.gia`：可导入编辑器的整包 GIA。

## 五、代码结构

| 文件 | 职责 |
| --- | --- |
| `lua/src/00_config.lua` | 设计尺寸、双主题色板与令牌、角色/关卡/敌人/材料/天赋/命座/成就/设置/进度数据、音效表 |
| `lua/src/10_core.lua` | 画布与自适应、控件工厂、补间/逐帧、焦点与几何导航、弹层、转场、Toast、震屏、圆角/雪晶/雪松等基础几何、文本高度安全阀 |
| `lua/src/15_ui.lua` | 组件库：header/footer/backBtn/button/iconBtn/tabs/chip/badge/resChip/bar/segBar/sectionLabel/divider/avatar/slot/star3/chevron/40+ 图标 |
| `lua/src/20_art.lua` | 美术：双主题背景、雪峰山脊、月轮光晕、极光、雪松、甘雨立绘与头像、敌人、关卡小景、冰晶/弓/圣遗物 |
| `lua/src/30_home.lua` | 启动 / 标题 / 主菜单 |
| `lua/src/32_quest.lua` | 关卡地图 / 出战准备 |
| `lua/src/34_battle.lua` | 战斗（HUD、瞄准、射击、技能、波次、暂停、胜负判定） |
| `lua/src/36_result.lua` | 结算（星级、奖励、经验、记录写入、成就） |
| `lua/src/38_growth.lua` | 养成屏 + 突破/天赋弹层 |
| `lua/src/40_codex.lua` | 图鉴 / 设置 / 制作名单 |
| `lua/src/45_overlays.lua` | 暂停 / 指南 / 通用确认弹层 |
| `lua/src/50_main.lua` | OnStart/OnUpdate、键位映射（枚举优先、字符串回落）、模板探测与自动发现 |
| `qxqy/build.mjs` | 构建：模板 → 拼接 Lua → lua5.3 语法门 → 存档 + GIA |
| `qxqy/runner.mjs` | 回归执行器（支持 `audioExpect/audioExclude`） |
| `qxqy/shot.mjs` | 全流程出图（模拟真实点击/按键，`playStep` + `renderScenePng`） |
| `tests/*.json` | 18 个用例：启动/菜单/地图/战斗/波次/技能/暂停/结算/养成/图鉴/设置/名单/画布适配 |
| `docs/preview/*.png` | 手机 24 张 + PC 24 张真实渲染出图（`probe/` 为分屏脚本的额外态） |

## 六、踩过的四个引擎级坑（已修，后续复用请注意）

1. **补间数组空洞**：用 `list[i] = nil` 移除已完成 tween，会让 `#list` 变小；之后 append 的新 tween 落在长度之外，**永远不执行且零报错**。必须 `table.remove`。
2. **半透明圆角矩形**：`T.rrect` 由 2 矩形 + 4 角圆组成，半透明会在角上叠出淡斑/花瓣。界面色一律不透明预混；高光用单条不透明色。
3. **文本框高度**：千星 `textLayout.blockInset` 随字号变化（fs24→10、fs34→12.5），高度不足会 `visibleLineCount=0` 整段不画。`T.txt` 已统一按 `行数×1.2×字号 + 字号×0.5 + 10` 抬升。
4. **音效帧闸**：`T.sfx` 默认一帧一条，点击音会吞掉同帧的业务反馈音。重要反馈（错误/结算/成就）用 `T.sfx(id, true)`。

## 七、验证读数（本机实测）

| 项 | 读数 |
| --- | --- |
| `build` | exit 0，`[frost][warn]` 0 条，5019 行 / 208KB，3 模板，1 脚本 |
| `runner` | **18/18 通过，7.0s**（含战斗 12 次命中完整通关、PC 1600×900、4:3 1280×960） |
| `shot`（手机） | **24 屏，errors=0**，节点 291–1033 |
| `shot pc-16-9` | **24 屏，errors=0**，1600×900 |
| 静态审计 | `verdict=PASS fail=0 warn=3`（warn 为 tetris 专用日志锚点与 `ipairs` 字面量表提示） |

## 八、真机地图（已创建）

- 地图 **1073741842 · 霜华纪**（Save/Temp 同 sha，240,083 B），自带 3 个客户端模板（`1073741930/1931/1932`）、宿主容器（`1073742502 → 1073742503 → 占位 1073742540`）与已挂载脚本 `ganyu_main`（`guid=1073741825`，内联+外部 Lua）。
- 生成命令、资产清单、验收步骤与回滚方式见 [`真机部署.md`](真机部署.md)。
- 真机加载/执行**尚未验证**，等待真机试玩。

## 九、已知限制 / 下一步

- **数值与战斗**：伤害、星级、经验、材料只是演示值；战斗固定 3 波，无真正敌人 AI 与弹道碰撞（命中由点击命中区判定）。
- **持久化**：进度只在本次会话内存中；重启回到初始状态。存档字段已集中放在 `T.records`，接持久化只需在该表读写。
- **真机**：GIA 整合包已生成，但**未做真机导入与真机验证**（需要一张新地图承载模板/脚本）。模拟器与出图已全绿。
- **声音**：音效 id 来自官方库（选型见 `game-sfx-kit`），模拟器只验证「播了」，**未在真机听感确认**。
- **分辨率**：已验证 1280×720、1600×900、1280×960；手机 19.5:9（1560×720）未单独出图（布局按 `min(W/1280,H/720)` 等比，理论安全）。
- **多人/触屏手势**：未做；当前以鼠标 + 键盘为主。

## 十、把模板改成你自己的游戏

1. 改 `00_config.lua`：配色（`T.P` / `T.setTheme`）、角色、关卡、材料、天赋、命之座、文案。
2. 改 `20_art.lua` 的 `T.portrait` / `T.enemyArt` / `T.stageArt`：替换角色与敌人造型。
3. 在 `32_quest.lua` 的 `T.screenFns.map` 改章节与节点；`34_battle.lua` 的 `T.battleSpawnWave` 改波次与敌人组合。
4. 加新屏：在 `lua/src/` 建 `5x_*.lua`，定义 `T.screenFns.<name>`，用 `T.go('<name>')` 跳转；记得 `T.screen.key` 接键盘。
5. 每次改完跑 `build` + `runner` + `shot`，**逐张看图**再交付（`docs/UI-GUIDE.md` 有完整的界面施工约定）。


---

验收记录（三栏：已验证 / 未验证 / 待用户确认）见 [`验收报告.md`](验收报告.md)。
