# hmlt-qixia 真机导入指南（步骤 7 交接 · 2026-10-13 夜版）

> 产出：`device-package/` 五件套。**推荐路径 = 整合包单文件**；分体包备用。

## 产物清单

| 文件 | 用途 |
| --- | --- |
| `hmlt-qixia · 整合包.gia` | **推荐**。服务端控件模板 + 客户端控件模板 + 脚本映射一并导入，模板边界与挂载关系保留 |
| `hmlt-qixia · 服务器控件模板.gia` | 分体：仅「游戏层」全屏容器（脚本挂载点） |
| `hmlt-qixia · 客户端控件模板.gia` | 分体：4 个实体模板（img/tx/btn/panel，guid 1073742300-303） |
| `hmlt-qixia · 脚本.gia` | 分体：main.lua 脚本包（**GIA 不含挂载关系，导入后需手动挂到游戏层**） |
| `main.lua` | 纯 Lua 源码（人工核对/复制粘贴用） |

## 导入步骤（真机编辑器）

1. 新建游戏地图（或用你指定的空图）。
2. 导入 `hmlt-qixia · 整合包.gia`（资产导入入口）。导入后资产树应出现：
   - 服务端控件模板「hmlt-qixia 界面」（含 游戏层 容器，showCursor=true）
   - 客户端控件模板「hmlt-qixia 实体模板」（img/tx/btn/panel 四个根子节点）
   - Lua 脚本 main（挂载在 游戏层）
3. 把服务端控件模板放进地图的 UI 空间（按你项目既有流程）。
4. 试玩：应见选人界面「虹猫·长虹剑 / 蓝兔·冰魄针」两张卡。

## 操作

- **移动**：WASD 或方向键（两套都接了）
- **J**：普通攻击（按下即发）；长按蓄力（lv≥2 起效），松手放大招（虹猫=长虹贯日 / 蓝兔=冰魄剑+银针齐发）
- **K**：放宝（虹猫=火凤燎原 / 蓝兔=冰封千里）；特性教学卡弹出时也是 K 关闭
- 满匣（蓝兔）：针匣光环亮 → 再点按 J = 倾匣；长按 = 蓄力保匣
- 右上角「RestartBtn」随时回到选人

## 已知限制 / 待真机核验项

1. **视觉=六种基础图元占位**（100001 rect / 100002 circle / 100003 triangle / 100004 fourstar / 100005 fivestar / 100006 ring + 色板）——用户口径「素材不好看不阻塞」；正式拟合图走 image-css-builder→GIA imageId 后续替换（ART 表一处改）。
2. **音频=单一占位音**（audioId 50888，开火时播）——用户口径「最简单的替代」；正式 54 音效后续挂。
3. `tx` 模板「垂直居中按推定值导出，尚待实机确认」（导出器警告）——真机若文本错位，报回我修。
4. **GIL 直注未做**（用户优先级①）：模拟器存档→GIA 已通；gsts 直接注入真实 .gil 属 genshin-ts 节点图链路，与千星 UI 资产体系不同轨——需要时开票单做。
5. 特性进度（traitsSeen）为会话内存——跨会话保留需关卡变量（serverLogic 规则），本轮未做。
6. 模拟器 lua 沙箱与真机 Lua 细节差异（Color 语义 AARRGGBB vs RGBA 函数等，api面清单§十三）——真机首验重点。

## 回归清单（模拟器 11/11 已绿，真机对照）

`tests/`：boot / char-select / movement-bounds / wave-gate / bomb / phoenix / pow-cycle / first-success / first-fail / restart / mobile-smoke。
真机手动冒烟路径：选蓝兔→打 8 波→boss 击杀→通关卡→RestartBtn→选虹猫再来一轮。
