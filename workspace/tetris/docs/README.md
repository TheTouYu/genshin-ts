# Tetris —— 千星模拟器 2D 路线技术验证 demo

一句话：**10×20 棋盘、七种方块、200 个客户端图片实例当格子、服务端控件跑 Lua 逻辑**的俄罗斯方块，
可在 `/home/h/miliastra-beyond-simulator` 里离线跑帧、批量回归，并导出可导入真机的整合包 GIA。

---

## 1. 工程构成（实测读数，来自 `tetris.save.json`）

| 项 | 数量 | 明细 |
| --- | --- | --- |
| 服务端控件 | **4** | `sc1` 客户端控件容器（guid 1073741850）→ `n1` container（1073741851）→ `n7` textbox `hud`（1073741852）、`n8` textbox `hudNext`（1073741853） |
| 客户端模板 | **1** | `n6` image 模板 `cell`（guid **1073742105**）—— 200 个格子共用这一个模板 |
| 脚本 | **1** | `lua/main.lua`（322 行 / 10558 B），脚本 guid 1073742106 |
| 脚本挂载 | — | 挂在**服务端** `n1`（`controlAsset: server-control-template`）；客户端模板树内零脚本 |
| 运行时控件 | **200** | `game.InstantiateClientUIControl(1073742105, root)` ×200，命名 `cell1`…`cell200` |
| 存档 | 36952 B | `tetris.save.json`（`format: qxqy-simulator-save`, version 4） |
| GIA 整合包 | 14279 B | `device-package/tetris-整合包.gia`（服务端 UIControlGroup + 客户端 UIControlTemplate + 脚本映射同文件） |

**路线**：服务端控件直接渲染 —— Lua 脚本挂在服务端容器上，渲染靠「实例化客户端模板 + 改
`imageColor`」，没有走「客户端脚本」路线（客户端模板树零脚本铁律，模板内挂脚本会被拒绝）。

## 2. 键位表（官方具名键，`studio/play/key-bindings.js` 实证存在）

| 操作 | 物理键 | 引擎事件名 |
| --- | --- | --- |
| 左移 | ← | `KeyboardCraftspersonKey38Down` |
| 右移 | → | `KeyboardCraftspersonKey39Down` |
| 顺时针旋转 | ↑ | `KeyboardCraftspersonKey36Down` |
| 软降（下一格） | ↓ | `KeyboardCraftspersonKey37Down` |
| 硬降（落底并锁定） | Space | `KeyboardJumpKeyDown` |
| 重开 | R | `KeyboardCharacterSkill3KeyDown` |
| 调试：填满最底两行 | T | `KeyboardCharacterSkill4KeyDown` |

`T` 是给用例用的调试钩子：它只填行、**不消行**；消行必须由下一次锁定经 `doLock → clearLines`
真实链路触发，所以 `tests/04` 覆盖的是真实消行路径。

## 3. 坐标系与布局

- 画布基准 `mobile-16-9` = 1280×720；`n1` 的 anchorMin/Max = 0/1（铺满父级），故 `n1` 中心 = 画布中心。
- 格子 26×26，间距 2（pitch 28）。`cell i`（i=1..200）：
  `col=(i-1)%10, row=(i-1)//10`；`SetAnchoredPosition((col-4.5)*28, (9.5-row)*28)`。
  ⇒ `cell1` = (-126, 266)，`cell200` = (126, -266)，棋盘 280×560 居中。
- 颜色走 `imageColor`（ARGB 整数）。**注意读回是有符号 int32**：`0xFF1A1D26`（空格）写入 4279901478、读回 `-15065818`；
  用例里的 `imageColor` 断言一律用有符号值。

## 4. 逻辑要点

- **固定步长**：`OnUpdate(dt)` 只做 `acc += dt`，`while acc >= 1/60` 才推进一拍（单帧最多 8 拍防积压）；
  重力每 30 拍落一格（0.5s）。`script:EnableUpdate(true)` 必须显式调用，否则 `OnUpdate` 根本不会派发。
- **方块**：七种（I/O/T/S/Z/J/L），坐标列表 + 顺时针 `(r,c) → (c, n+1-r)` 旋转，碰撞检测含边界与堆叠。
- **消行计分**：1/2/3/4 行 = 100/300/500/800 × level，`level = 行数//10 + 1`；
  消行后**不递减 r**（删行+顶部插空行后，原 r-1 行落到索引 r，需要重判——这是首版 bug）。
- **随机**：内置 LCG（种子 20261023），不用 `os`/`math.random`，用例可复现。
- **日志（用例断言用）**：`cellCount=200` / `piece=<名> x=<列> y=<行>` / `fall y=` / `move x=` /
  `rotate <名>` / `harddrop rows= y=` / `lock <名> cells=<落格下标>` / `clear n= score= lines=` / `gameover score=` / `newgame`。

## 5. 怎么跑

```bash
cd /home/h/genshin-ts/workspace/tetris

# ① 跑全部用例（离线，不需要 web 服务）
node qxqy/runner.mjs                 # 全部
node qxqy/runner.mjs 04              # 只跑文件名含 04 的

# ② 从 lua/main.lua 重建工程 + 存档 + GIA（会覆盖 tetris.save.json 与 device-package/*.gia）
node qxqy/build.mjs

# ③ 交付物自查（GIA 体积 / importGia 解出模板与脚本 / 存档能被 importData 与 createStudio 加载）
node qxqy/check-gia.mjs
```

- `runner.mjs` 读 `tetris.save.json` → `createStudio(save)` → 逐条 `playRunCase(case, {canvasId:'mobile-16-9'})`；
  全绿退出码 0，有失败退出码 1 并打印失败断言与客户端日志尾部。
- 修改游戏逻辑后 **先改 `lua/main.lua`，再 `node qxqy/build.mjs`**（存档里的脚本源码是构建时内联进去的，
  只改 `.lua` 不会让旧存档变）。

## 6. 用例（`tests/`，6 条 / 34 断言）

| 用例 | 覆盖 | 关键断言 |
| --- | --- | --- |
| `01-board-200.json` | 开局 200 格在场 + 布局 + 上色 | `cellCount=200`；`cell1/cell100/cell200` 存在；`cell1` 位置 (-126,266)、`cell11` y=238、`cell200` x=126；`cell4` = 方块色（Z 已画出）、`cell200` = 空格色；`hud` 文本 |
| `02-gravity-fall.json` | 固定步长重力 | 0.55s `fall y=2`、1.05s `fall y=3` |
| `03-move-left-right.json` | 左右移动改变列 | ←←→ 依次得到 `move x=3` / `move x=2` / `move x=3` |
| `04-line-clear-score.json` | 消行计分（真实锁定链路） | 填两行后硬降 → `clear n=2 score=300 lines=2`；消行前 `FILLED 20`、消行后 `FILLED 4` |
| `05-rotate-harddrop.json` | 旋转 + 硬降落格 + 落格上色 | `rotate Z`、`lock Z cells=176,186,185,195`、`cell195/cell176` = 方块色、`hud FILLED 4` |
| `06-gameover-restart.json` | 堆到顶判负 + R 重开 | `gameover score=`；重开后 `hud` 回到 `SCORE 0 … FILLED 0` |

用例不是"陪着代码走"的：做过 3 组变异回归（重开键名改错 / 分数表错位 / 锁定时不消行），
三组都让对应用例报红，证明断言确实在判东西。

## 7. 导入真机

1. 拿 `device-package/tetris-整合包.gia`（整合包 = 服务端控件组 + 客户端控件模板 + 脚本映射同文件）。
2. 编辑器里导入整合包 GIA → 得到「客户端控件容器」（4 个服务端控件）与「客户端控件模板」（1 个 image 模板）。
3. 检查脚本映射：`lua/main.lua` 应挂在服务端容器 `n1` 上（`controlId=n1`, `controlAsset=server-control-template`）。
   若导入后控件索引被重映射，**按 `controlGuidChanges` 语义更新脚本里的控件 guid（`T_CELL`）**，
   不要全局替换同值数字；核对后再 `acknowledgeControlGuidChanges`。
4. 进入试玩，键盘按上表操作。

## 8. 已验证 / 未验证（模拟器绿 ≠ 真机绿）

**已验证（模拟器层，`node qxqy/runner.mjs` 6/6 + `check-gia.mjs` 9/9）**
- 200 个模板实例真被创建、进场景树、`visible=true`、尺寸与坐标符合 10×20 布局；
- `imageColor` 真被写入并可读回（开局方块格与空格颜色不同、落格后对应格变色）——这是"渲染通路"的证据，
  不只是"逻辑照跑"；
- 键盘具名键真触发逻辑（移动/旋转/软降/硬降/重开/调试填行）；
- 重力按 1/60 固定步长推进；消行走真实锁定链路并计分；堆顶判负与重开；
- GIA 非空且能被 `importGia()` 解出 1 模板 / 1 脚本 / 4 服务端控件；存档能被 `importData('json')` 与
  `createStudio(seed)` 两种方式加载。

**未验证 / 已知风险（真机要回看的地方）**
1. **像素层未验证**：headless studio 没有截图 API，本轮只做到「控件属性层」（位置/尺寸/可见/`imageColor`），
   没有真机帧。真机可能出现：图片素材未指定（模板 image 用默认素材/空 imageId）、格子间隙视觉偏差、
   16:9 之外画布（pc-21-9 / mobile-4-3）下棋盘偏出屏幕——当前坐标是硬编码的 mobile-16-9 基准。
2. **真机 API 差异**：`game.GetUICanvasSize()` 返回值、`SetAnchoredPosition` 有父时的相对语义、
   `root:GetChild('hud')` 取子名字的可用性，都只在模拟器里验过。HUD 是 `nil` 容错写法，真机若取不到子节点
   只是没有文字，不影响棋盘。
3. **输入手感未验证**：模拟器固定 dt=1/60；真机变步长下重力节奏、长按连发（当前无 DAS/ARR，按住不重复）
   会与模拟器不同。旋转没有 SRS 踢墙，贴墙/贴堆时会转不动。
4. **性能只做过粗算未做真机负载**：每帧只做累加（不遍历 200 格），200 格重绘只在锁定/消行/生成时发生，
   但真机 200 个 image 实例的合批与 DrawCall 未测。
5. **脚本索引**：真机导入 GIA 会重映射客户端控件索引；本 demo 在 Lua 里硬编码了模板 guid `T_CELL = 1073742105`，
   导入后若索引变化必须按 `controlGuidChanges` 改这一处（`build.mjs` 会在构建时校验 guid 与常量一致）。
6. **`T` 调试键**是真机可见的：不需要就删掉那一段监听。

## 9. 文件清单

```
workspace/tetris/
├── lua/main.lua                       游戏逻辑（唯一需要手改的源）
├── tetris.save.json                   完整工程存档（importData / createStudio seed 均可加载）
├── device-package/tetris-整合包.gia    真机导入包
├── qxqy/build.mjs                     从默认工程重建 + 导出存档与 GIA
├── qxqy/runner.mjs                    离线跑用例（退出码 0/1）
├── qxqy/check-gia.mjs                 GIA / 存档自查
├── tests/*.json                       6 条用例
└── docs/README.md                     本文件
```
