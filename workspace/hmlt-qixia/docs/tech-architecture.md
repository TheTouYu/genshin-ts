# hmlt-qixia 千星版技术架构（2026-10-13 v1，runCase 11/11）

> 运维手册口径：模块职责 / 数据流 / 挂载点。改这里必须同步改本文。

## 总体

单脚本 `lua/main.lua`（~890 行）挂**服务端控件模板**根容器 `n1 游戏层`（stretch 全屏，showCursor=true）。全部实体为**运行时实例化控件对象池**——存档侧只有 1+4 个节点，GIA 导出面最小。逻辑场 444×250（千星 Y 向上），运行时 `K=GetUICanvasSize()/444` 缩放，`SetAnchoredPosition(gx*K-cw/2, gy*K-ch/2)`（有父=与父中心相对偏移）。

## 资产结构

- **服务端模板**（assets.server）：`sc1 > n1 游戏层`（唯一节点，键监听/光标门挂这）
- **客户端模板**（assets.client）：根下 4 个**单控件模板**（prefabIndex=节点 guid）：
  - `img`(1073742300, image, enableFill=true Horizontal Left) — 全部图形实体
  - `tx`(1073742301, textbox) — 文本/飘字/HUD
  - `btn`(1073742302, button) — 卡片/按钮
  - `panel`(1073742303, container) — 面板
- **脚本**：`main`(guid 1073742400) 挂 n1

## Lua 模块图（main.lua 内部）

| 段 | 职责 |
| --- | --- |
| `N` | 全部数值（player 界限/zdlv/ps/chargeRate/ships/enemy/boss1）——**调数值只动这里** |
| `ART` | 视觉表 key→{图元id,w,h,RGB}——**换素材只动这里** |
| `WAVES` | 关1 波次表（门闩模式） |
| `TRAITS` | 七特性定义 |
| 工厂 | `mkc/imgc/txtc/place/placeSize/setVis` |
| 池 | `mkpool/alloc/freePools`：bullets 72 / ebullets 80 / enemies 16 / items 10 / booms 24 / floaters 12 / msgs 3 / wings 4 / stars 6；**z 序=池创建序**（敌→道具→僚机→玩家→弹→敌弹→特效→飘字→HUD） |
| 特性 | `traitFire/traitBulletDmg/critRate`（crit 5%基/背水+20%/一针+50%；暴击×2；`traitQ` 2.5s 延迟弹卡；重复=say+4s cd；卡期 tick 早退=暂停，K 关） |
| 战斗 | `fireVolley`（分角色 offs：虹猫扇形/蓝兔纵排；僚机同步齐射/蓝兔积针）/ `releaseCharge`（贯日巨剑/冰魄剑+needleBarrage）/ `needleBarrage`（salvo 固化原位逐发）/ `tryBomb`（火凤/冰封）/ `damage/onKill`（掉落+薪火链）/ `bulletHits`（pierce 与非 pierce 两路径；巨剑/火凤独立接触场每 tick 一次） |
| 波次 | `spawnEnemy/spawnWave`：门闩=非 dj1 全清+waveGap 2.2s 延迟；dj1 环境刷怪 6%@0.12s；boss1 入场 90px/s→hover 摆动+三招式轮换（三向扇/环形 10/三连） |
| 输入 | v34b 三铁律：**按下即发**（jFireCore 守 fireCd）/**倾匣只认按下快照 jPressFull**/**长按 0.25s 转蓄力**。键位：J=Key19、K=Key20、WASD=具名 Move*、方向=Key36-39 |
| tick | 固定步长 1/60 累加器（OnUpdate dt 限 0.1s，每帧≤4 步）；慢镜 slowT/slowK；胜利 winPending 6s |
| render | 每帧位置同步+HUD 脏检查（文本仅变化才写）+血条/蓄力条 SetFillHorizontal+受击白闪 |
| Debug | 8 信号 RegisterServerSignalHandler 直达（AutoPlay/SkipToBoss/KillBoss/Damage/SetLife/GrantPow/GrantBomb/Noop），无需 serverLogic 规则 |

## 关键数据流

```
keydown → AddKeyEventListener(n1) → onKey → keys/edges
OnUpdate(dt) → acc → tick(1/60)×n → [特性卡?] → 输入v34b → 移动/蓄力/释放
  → 波次门闩 → 敌机/boss AI → 子弹/敌弹推进 → bulletHits → damage → onKill(掉落/分数/薪火)
  → 道具/特效/飘字 → winPending
render() → place(池槽) → HUD SetFillHorizontal/SetActive
```

## 测试通道

- **开发**：`qxqy/build.py`（存档构造+playRun 冒烟）+ `qxqy/runner.mjs`（createStudio().playRunCase 本地电池 11/11）
- **交互**：MCP `qxqy_studio_load → play start → click(name)/key(key=键名)/serverSend(name,params)`；截图 `qxqy_studio_play_screenshot`
- **导出**：`st.exportData('save-gia')`/`('gia-combined')` → `device-package/`

## 已知技术债

1. 关 2-6 数据未搬（demo 已有，WAVES 表结构就绪，增量移植）
2. traitsSeen 内存态（跨会话→关卡变量）
3. audio 单占位音（PlayAudio2D 50888，pcall 护栏）
4. 视觉=图元+色板（ART 表换 imageId 即升级）
5. autopilot 无释放逻辑（仅测试用）
6. 死亡掉落 pow 原位即拾（demo 有随机漂移，拾取半径内首帧即中）
