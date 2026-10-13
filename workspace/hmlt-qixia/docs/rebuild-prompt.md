# 任务：虹猫蓝兔·七侠传 —— 千星 Lua 实现重新迁移（clean-room）

> 背景一句话：本仓库已有一版千星 Lua 实现（lua/main.lua，2337 行）与完整的 HTML 原型。
> 现在做一次**独立重写**：把网页版游戏重新迁移为千星模拟器 Lua，检验架构与可玩性，与旧版并存对照。

## 一、任务目标

- **做什么**：以 `prototype/index.html`（1098 行，v34b 全功能版）为**行为规格唯一真源**，用千星客户端 Lua 重新实现完整游戏：六关 + 双角色（虹猫/蓝兔）+ 蓄力双档 + 大招 + 银针匣 + 七隐藏特性 + 十悟图鉴 + 暴击/燃烧 + 结算/重开 + 触屏。
- **产出物**：`lua/rebuild/main.lua`（**不要动 `lua/main.lua`**，两版并存）+ 可运行存档 `hmlt-qixia.save.json`（经 build.py 生成）。
- **成功长什么样**：本地电池全绿 + MCP 截图渲染正确 + **真实浏览器试玩页行为级可玩**（键盘全通、六关可通关）。

## 二、铁律

1. **不覆盖 `lua/main.lua`**；新实现写 `lua/rebuild/main.lua`。收尾阶段才允许对照旧实现（参考，勿抄结构）。
2. **步骤 1-4 产物冻结**：GDD/测试用例/HTML 原型/美术资产只读不改；玩法语义冲突时**以 index.html 为准**（它比 GDD 新，含用户十几轮裁决）。
3. **数值不许自创**：全部数值（N 表/wavesDef/敌人表/特性表/悟条件）逐行取自 index.html；原版考据存疑时查 `research/notes/mechanics-whitepaper.md`。
4. **美术=图元占位**：ART 表保持「键名对齐 demo」的图元结构；`prototype/assets/*.svg` 是已裁决的手绘素材（正式美术轮另开任务，本任务不导入 imageId）。
5. **验证不许只走 MCP 通道**（历史事故教训）：任何「可玩」结论必须有真实浏览器通道（试玩页+合成键盘或真人）证据；MCP 截图是必要非充分。
6. 遇阻先分层排查（输入→逻辑→渲染），证据落盘；不硬绕、不静默降级。

## 三、核验标准

**模型侧（每轮提交前全过）**：
- `python3 workspace/hmlt-qixia/qxqy/build.py` 生成存档成功；
- 本地电池：`node workspace/hmlt-qixia/qxqy/runner.mjs`（读 qxqy/build.py 头部注释了解两者关系；需要把输入源指向 lua/rebuild/ 时自行参数化）；
- `tests/*.json` 12+ 用例从 Red（新实现无行为）跑到 Green；
- MCP 链：qxqy_studio_load → play start → 按名 click/serverSend 交互 → **play_screenshot 截图终审**（电池绿≠渲染绿：控件漏 place、文字被裁只有截图能暴露）。

**用户侧（每轮）**：用户开试玩页实测，反馈体感与异常（按键/手感/可见性）。

**最终验收**：真实试玩页六关通关链 + 双角色切换 + 特性触发可见 + 结算/重开正常；日志出现六关 `level_clear`+`game_win` 铁证。

## 四、多轮迭代与衔接

轮次骨架（按探索结果自行调整）：
1. **骨架轮**：挂载+生命周期+选人屏+开局入战+移动边界（电池：boot/char-select/movement-bounds 绿）。
2. **关 1 循环**：射击/敌机/波次门闩/boss1/胜负/结算重开（first-success/first-fail/restart/bomb 绿）。
3. **全内容**：关 2-6、蓄力双档、大招、银针匣、七特性、十悟（wave-gate/phoenix/pow-cycle/insight-guanri/cw-escape/level-chain 绿）。
4. **终审轮**：截图逐屏核验 + 真实浏览器通道行为级 + 触屏。

每轮结束：更新 `docs/PROGRESS-rebuild.md`（做了什么/证据/下一步）+ git commit。

## 五、复用清单（先查再用，不要重新发明）

| 资产 | 路径（相对 workspace/hmlt-qixia/） |
| --- | --- |
| 行为规格真源 | `prototype/index.html`（全读；N 表/wavesDef/LEVELS/TRAITS/CODEX/输入模型/SFX 全在里面） |
| 设计意图与裁决史 | `docs/gdd.md`、`records/playtest.md`（用户口味：节奏化射击/蓄力高风险高回报/机制不重叠/效果要可感知） |
| TDD 用例 | `tests/*.json` + `docs/tests-trace.md`（日志词汇表+Debug 信号协议+键位映射，**必读**） |
| 原版考据 | `research/notes/mechanics-whitepaper.md`（AS2 逆向全数值）、`levels-2-6-waves.md`（关 2-6 波次）、`charge-and-feedback-report.md` |
| 手绘美术（已裁决） | `prototype/assets/*.svg` + 四张预览页 |
| 原版素材库 | `research/extract/assets/shapes/`（534 SVG）、`sounds/`（54 mp3） |
| 构建与电池装置 | `qxqy/build.py`（存档构造器）、`qxqy/runner.mjs`（本地 fengari 电池）、存档模板 `hmlt-qixia.save.json` |
| 千星客户端 API 权威 | 仓库根 `research/千星知识图谱/learn-lua71/官方API文档-客户端控件.md`（11359 行，v2.5.1） |
| 旧实现（收尾才读） | `lua/main.lua` |
| 技能 | 会话内加载 `qxqy-game-studio`（本任务从步骤 5 开始，1-4 产物已冻结）；模拟器工具= qxqy_studio_* 系列 |

**平台契约（命令级，写入前先对照官方 API 文档核实）**：
- 单脚本挂 n1「游戏层」（server-control-template，stretch 全屏，showCursor=true）；逻辑场 **444×250，Y 轴向上**，`K=画布宽/444` 统一缩放；`script:EnableUpdate(true)`，OnUpdate(dt) 用 1/60 固定步长累加器 + 每帧 render() 全量同步控件。
- 键位（Enum.KeyEventType）：**J=KeyboardCraftspersonKey19、K=Key20**、方向键=Key36-39、WASD=KeyboardMoveLeft/Right/Forward/Backward*、enter=Key11、R=KeyboardCharacterSkill3*；写码前查枚举全表，不要凭记忆造键名。
- Debug 信号走 serverSend（协议表在 tests-trace.md），确定性测试不依赖手打。

## 六、已知局限与前车之鉴（上一版踩过的坑，别重交学费）

1. **Lua 异常=无声死机**：宿主无 try/catch 护栏就不跑——OnUpdate 必须包 pcall+错误日志。
2. **控件创建≠布局**：位置每帧 render 同步，新建控件忘 place 就叠在画布中心；HUD/卡片每个控件的 y 逐一对账。
3. **中文渲染**：textbox 不设宽会被按控件宽裁剪（症状=只见偏旁）；文本控件要估宽（CJK 1em/半角 0.62em）+ Middle 对齐；字体栈问题症状=整字豆腐/韩文字形。
4. **暂停态要随状态清理**：fail/重开必须清特性卡、时停、无敌等挂起态，否则穿透结算屏/永久冻结；教学卡给超时自动关（键盘焦点丢失时用户按不了键）。
5. **键名映射**：select 分支读的键变量必须和键位表注册的一致（上一版 a/d 是死代码）；文案承诺的键（如「重开(R)」）必须真注册。
6. **波次计数 1-based**（Lua 表），spawn 先判界再自增；G 表重建时控件引用要 KEEP。
7. **已知平衡问题（不是你的 bug，不用修）**：关 1 dj3 远程狙杀+lv1 输出不足=开局死亡螺旋，已登记待平衡轮。
8. 模拟器只预览图元 100001-100006；千星坐标 Y 向上，HTML 是 Y 向下——**禁抄像素坐标**。

## 七、第 0 轮任务（现在开始）

1. 依次读：`docs/tests-trace.md` → `prototype/index.html`（全文）→ `docs/gdd.md` → `qxqy/build.py` 头部与 `qxqy/runner.mjs` 用法；
2. 跑一次现有装置（build.py + runner.mjs）确认环境活；
3. 建 `lua/rebuild/`，让 runner 指向新实现（必要时加参数），确认 12+ 用例当前全 Red（有效 Red=骨架在跑而行为缺失）；
4. 交付：骨架方案一页（挂载/生命周期/主循环/池结构怎么组织）+ Red 清单，等确认后进骨架轮。
