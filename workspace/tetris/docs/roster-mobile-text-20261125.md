# 角色档案跨端文字空白：修复候选 v6.36

> @status: active
> updated: 2026-11-25
> 状态：代码与模拟器通过；用户授权后已部署Win11并独立回读通过；手机真机尚待确认。

## 生效路径

| 教训 | 生效载体 | 自动触发 | 验证 |
|---|---|---|---|
| 正文不能另抄小于按钮副标的高度公式 | view_roster 使用共享 textMinH/wrapText | 每次构建角色页 | roster_text_contract_test，2384控件 |
| 不继承模板垂直对齐，多行默认高度按内容算 | 共享 view_kit | 所有 K.text 调用 | 框架与游戏 view_kit_test |
| 估算互证不能代表实际字体 | roster-text-audit.mjs | 交付运行；校验存档源码一致 | 4画布×4角色×5页签 |

## 根因分层

用户两张同屏截图中，手机标题、角色名、按钮副标、卡片标题存在，正文、台词、提示及页脚缺失；所有角色和页签都受影响。
完整核对当前目录5份日志（21:07、21:26、21:39、21:44、21:58）：Lua记录数分别为1095、0、2110、3210、14006。
含Lua的四份文件均只有启动标记 `KeyboardAndMouse mobile=false`、画布约3080×900，没有手机启动/画布标记。
21:44文件中的角色页切换未报错误；这些是PC可确认记录，**暂未找到可归属于手机端的渲染日志**。
日志文件名/UID本身不足以证明是否汇总其他玩家，不能将“未发现”说成“引擎不记录手机”；
完整审计保存为备份目录 `log-client-audit.json`。

已证实的代码缺口：角色页独立使用 `ceil(1.45f+4)` 一类估算，
框架按钮副标却使用 `ceil(1.45f+6)`。在720高画布，正文12号高22、台词13号高23，
同字号按钮副标12号高24。正文同时没有显式 verticalAlignment，依赖模板默认。
旧测试只比较相似估算公式，因此放过了框架口径分叉。

这是已闭合的代码层原因；**手机原生排版究竟是内边距、实际字号还是模板差异，尚无手机字段/日志证明**。
不能把上述差异直接写成已经证明的手机引擎机制，也不能仅凭模拟器绿灯宣称手机已修好。

## TDD与实现

新测试在修改前报 `charTitle 高度39小于框架合同41`；修改后检查2384个实际render→mock文字控件通过。
正文统一由共享框架算高度与折行，显式垂直居中；折行考虑4px横向留白并保留空白行。
移除了角色页重复折行实现，历史估算仅作为旧缺陷测试辅助，不进入生产布局。
文字工厂未指定高度时按实际换行数算；显式高度保留，调用者仍须验证是否容纳。

实际模拟器字体矩阵：旧内嵌源码2352个文字检查有12处放不下；新版2384个、0处失败。
覆盖 pc-16-9、mobile-16-9、mobile-19.5-9、mobile-2400-1080；4角色×5页签。
该矩阵验证不同尺寸，**不复刻手机原生字体引擎**。PC/手机尺寸出图均已查看，正文可见，无新增明显覆盖。

回归：游戏 view_roster34、view_kit31、render_board20、view_help58、view_settle58、view_title75 条全过；
框架 view_kit62、scenes17、app30、platform14、view_node_lint10、view_node_cover13 条全过；
全部40个Lua文件语法检查、上一轮超宽背景/AI准备态回归通过；共享框架副本逐字节相同。
原生Lua测试由 Windows Python+Lupa Lua5.3执行，未冒充系统lua5.3命令或完整Linux门禁。

复现：`node workspace/tetris/qxqy/roster-text-audit.mjs <输出.json>`；
`tests-lua/roster_text_contract_test.lua` 自动纳入现有 run_all 的文件发现。
Windows模拟器依赖使用临时独立目录与加载钩子，未改写Linux的node_modules。

## 真实地图候选安全门

目标：方块大战 1073741834，当前Win11 uid 110170759 的 Save_Level；不触碰Linux游戏存档。
修改仅4条脚本 main_1/main_2/tetris_view_kit/tetris_view_roster；42条脚本登记、5处挂载不变，
顶层除脚本字段外字节不变。候选已经真实CLI生成、解析回读。

源SHA256：`650a1e08b2b877065ff2f362f5c2f760ee4904713f0cd5a7ae9dcf4f08c6f404`

候选SHA256：`2abc29d033a92cf190a0dfcab7895b74adcef820bb4daf615aaf52059a2cfa52`

版本v6.36，40模块，指纹 `58a9f366`。
备份/候选/manifest/模拟器矩阵/部署脚本：
`C:/Users/Administrator/Documents/GenshinTS-backups/tetris-roster-text-20261125/`。
用户明确要求“先部署修复的版本”后已写回。写前源SHA匹配；写后独立回读确认候选/Save/Temp同SHA、42份external源码一致、5处挂载与非脚本字段不变。
部署版本戳 `v6.36 · 11-25 22:28 296db044`，模块指纹仍为 `58a9f366`；`readback.mjs` 与 manifest 留在备份目录。
回滚使用该目录 before 的原图及external备份，须重新确认。

## 验证三栏

| 已验证 | 尚未验证 | 用户游戏内确认 |
|---|---|---|
| TDD、模拟器字体矩阵与出图；结构层：Win11地图已部署、Save/Temp/external独立回读通过 | 新版PC与手机原生渲染行为 | 重载地图，PC+手机查看4角色5页签的正文/台词/脚注；不要先保存旧内存地图 |

## 规则反馈检查

已把“正文与按钮同合同、显式对齐、估算与字体双路线”回灌 qxqy-ui-framework。
本轮没有用户对排查方法的新纠偏。旧测试负样本因安全高度增加而不再足够坏，已改为明确缩窄+单行高度，保留检测器负控。
PKC在本Win11环境报告 `locked PKC runtime is missing; invoke global pkc-project-operator doctor`；
本轮未录入知识树，规则已落入框架入口与自动回归，待基础设施恢复后补录，未将手机猜测推广成事实。
