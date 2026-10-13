# PROGRESS-rebuild — hmlt-qixia 纯净版重迁移（rebuild-prompt-pure.md）

> 执行：2026-10-13 夜 · clean-room（不读旧 main.lua，规格真源=prototype/index.html 1098 行全文精读）
> 产出：lua/main.lua（单脚本 ~1720 行）+ hmlt-qixia.save.json（build.py 生成）

## 验收状态

| 项 | 状态 | 证据 |
|---|---|---|
| 1. build.py 构建 + runner 15/15 | ✅ | 2026-10-13：`python3 qxqy/build.py` roundtrip ok + 冒烟 game_start；`node qxqy/runner.mjs` **15/15 PASS**（bomb/boot/char-select/cw-escape/first-fail/first-success/insight-guanri/level-chain/mobile-smoke/movement-bounds/phoenix/pow-cycle/restart/wave-gate/zz-repro-tick） |
| 2. 模拟器试玩+截图 | ⬜ | 待 qxqy_studio_load → play → 截图留档 |
| 3. 用户真实试玩页确认 | ⬜ | 待用户 |
| 每轮 git commit | ✅ | 见 git log |

## 实现架构（本次重迁移定案）

- **渲染**：基础图元 100001-100006（rect/circle/triangle/fourstar/fivestar/ring）× imageColor 分色；VIS 表 art键→{图元,ARGB,宽高}；**对象池** 318 个 image 控件一次性建（OnStart），每帧 `used` 标记回收 + 同值写跳过（lx/ly/lw/lh/lcol/lart 缓存）；逻辑场 444×250 × K=画布宽/444。
- **测试契约控件**（直接挂根，不嵌套）：CharSelectPanel/HongmaoCard/LantuCard/ScoreText/WaveText/LvText/BommText/HpBar/ChargeBar/BossBar/OptionControl/WinPanel/GameOverPanel/RestartBtn/NextBtn/FieldArea。**GameOverPanel 动态创建/销毁**（tree exists=false 断言要求真离树——SetVisible/SetActive 都留在快照里）；三按钮常驻（injectPlayClick 按名合成 SimulateCursorClick，不看可见性）。
- **契约差异（v2 以用例为准）**：fail lives（非 fail life）/ tryBomb 两角色都打 bomb_clear / WaveText=纯波号 / wave 1-based / playerHit 补 pow 1 / DebugGrantPow 补 pow N。
- **信号**：`script:RegisterServerSignalHandler(name, fn(name,params))` 11 个 Debug 信号；HMLT={wave,bullets} 全局表。
- **键位**：36=↑ 37=↓ 38=← 39=→（tests-trace 官方表顺序）；J=19 K=20 enter=11 R=CharacterSkill3；触屏 FieldArea=cursor 模板全屏最先建（底层不挡按钮），CursorDown/Drag 带 ev.x/y（画布 px/K→逻辑）。

## 踩坑记录（两轮迭代）

1. **0-based 索引迁移 bug**：startRun 里 `loadLevel(g,0)` 照抄 index.html 的 0-based，而 Lua LEVELS 是 1-based → `LEVELS[0]=nil` 炸 `attempt to index a nil value (local 'L')`。症状隐蔽：startRun 在 loadLevel 前已置 state='playing'，pcall 吞错后游戏靠 resetGame 里的 waves 兜底照跑。教训：**移植 0-based 源时索引边界要在写时统一声明**。
2. **tree exists=false 必须 DestroyClientUIControl**：controlSnapshot 递归 children 不看 active/visible——SetActive(false) 的控件仍在断言树里。

## 待办

- 模拟器试玩三截图（选人/游戏/结算）+ 真实试玩页用户确认
- 真机差异点（id/Id、Destroy userdata、行高）留 runtime-api.md 尾节
