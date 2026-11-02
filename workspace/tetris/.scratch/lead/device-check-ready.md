# 真机核验 · 就绪清单与待确认项

> 状态：**尚未执行**。`deploy --device` 会直写地图 `.gil`（破坏性），按项目规则必须先取得用户确认。

## 1. 为什么必须做真机核验

以下三项**只在模拟器验过**，真机完全未知：

| 项 | 模拟器读数 | 真机风险 |
|---|---|---|
| `SetImage` 圆角胶囊（imageId 100002） | 端点 `image.size=='circle'`、`size[1]==size[2]` 断言通过 | 真机图元枚举形态可能不同；`platform.setImage` 有枚举回退但未实测 |
| 悬停/按下三态 + 音效 | `settleCapRestartB.imageColor` 变化读数 + 50870/50884 播放 | 真机 `CursorEnter/Exit` 时序、音效 id 可用性未知 |
| 覆盖屏层序（服务端 textbox 压实例之上） | 帧级 z 值比对 | 真机 z 行为可能不同（本项目已有先例：`SetAsLastSibling` 是空操作） |

**另外**：`tests/` 全部 74 个用例跑在模拟器上，真机的 Lua 是 LuaJIT（不是 Fengari），整数位宽与 API 形态都可能不同。

## 2. 执行前必须确认的（问用户）

1. **允许直写地图 `.gil` 吗？** `node qxqy/deploy.mjs --device` 会：
   - 重建 → 更新 `device-package/tetris-整合包.gia`
   - 直写地图 `1073741834` 的 f5 内联源码 + external lua + Temp 同步
   - **不可逆**（有 `.gsts/backups/` 备份，但需要知道怎么回滚）
2. **现在可以占用编辑器/游戏窗口吗？**（真机试玩需要切到游戏、可能占用屏幕若干分钟）
3. 如果要跑完整试玩流程，走 `device-playtest-loop` 技能，需要窗口独占。

## 3. 执行步骤（确认后照此做）

```bash
cd workspace/tetris

# ① 备份（先做，别跳）
cp -a <地图保存目录>/Save_Level.sav /tmp/save-before-deploy.sav
sha256sum /tmp/save-before-deploy.sav

# ② 部署（--device 直写 .gil）
node qxqy/deploy.mjs --device

# ③ 校验写入（读回，不靠"命令没报错"）
#    判据：地图里的 f5 内联源码含新版特征串；external_lua 三份一致；
#    Temp 与 Save_Level 的 sha 一致

# ④ 真机试玩（device-playtest-loop 技能）
#    三件要看的：
#      a) 结算页三颗胶囊的圆角是否真的圆（放大截图看边缘像素）
#      b) 鼠标划过胶囊是否变色 + 是否有音效
#      c) 开档案页/说明页/结算页时，游戏层文字是否透出
```

## 4. 判据（缺一不可，逐条给读数）

| # | 看什么 | 怎么判 |
|---|---|---|
| 1 | 圆角 | 截图放大到胶囊端点，边缘应是弧线不是直角 |
| 2 | 悬停 | 鼠标移入前后截图对比，填充色应有可辨差异 |
| 3 | 音效 | 真机日志里出现 50870 / 50884 |
| 4 | 透出 | 结算/档案/说明三屏的截图里，不应出现角色名（纳西妲/刻晴/甘雨/少女） |
| 5 | 不崩 | 真机日志无 `lua-error`、无 `attempt to` 类错误 |

**任一条不过 ⇒ 记录到 `.scratch/lead/device-findings.md`，不要当场改代码。**

## 5. 已知的真机差异（来自历史事故，别再踩）

- 真机 `DestroyClientUIControl` 后写控件会抛 `invalid object`（模拟器不报）。
- 真机 `SetVisible(false)` 对运行时实例不生效。
- 真机 `SetAsLastSibling` 是空操作。
- 真机 `game.ServerSignal` 是函数，不是表。
- 真机 Lua 无护栏：一处抛错会中断整段 OnStart/OnUpdate。
- 模板 guid 在导入后会重编号（`config.lua` 的 `TPL_GUIDS` 候选表就是为此）。
