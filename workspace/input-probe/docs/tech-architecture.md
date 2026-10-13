# input-probe 技术架构

> 真机输入探针：测量 CursorClick→CursorBeginDrag 临界位移（校准模拟器 PR #11 的 5px 死区常数）+ 物理键→KeyEventType 映射（校准 PR #12）。非玩法游戏，是测量工具。

## 模块清单

| 文件 | 职责 |
| --- | --- |
| `lua/main.lua`（≈340 行，挂 n1「探针层」） | 全部逻辑：读出行渲染、全屏光标区监听、键盘全量绑定、统计、SIM/RST |
| `qxqy/build.py` | 组装 `input-probe.save.json`（走 cli.mjs get 种子 + 无头 playRun 120 帧冒烟） |
| `qxqy/export-gia.mjs` | 调模拟器 `createStudio().exportData('save-gia'/'gia-combined')` 导出真机五件套到 `device-package/` |
| `input-probe.save.json` | qxqy-simulator-save v4 存档（meta.name=input-probe） |
| `device-package/` | 整合包.gia（推荐导入）+ 服务器/客户端控件模板.gia + 脚本.gia + main.lua |
| `records/measurement-template.md` | 真机测量记录表模板（阈值区间 + 键盘映射表） |
| `docs/device-handoff.md` | 真机导入 + 测量操作协议 |

## 控件树与挂载

- server：`sc1`(server-container) → `n1`「探针层」(container, stretch 全屏, showCursor=true)。
- client 模板（guid 即 Lua 常量）：`t2` tx=**1073742301** textbox / `t3` btn=**1073742302** button / `t5` cursor=**1073742304**。
- 脚本挂载：`assets.scripts[0] = {id:'main', guid:1073742400, controlId:'n1', controlAsset:'server-control-template'}`（显式双参，防两棵树同名 ID 挂错）。
- 运行时动态实例化（OnStart）：7 个读出 textbox + 全屏 ProbeArea(cursor 模板, `SetAnchoredPosition(0,0)+SetSizeDelta(CW,CH)`) + SIM/RST 按钮（最后建=顶层）。逻辑场 444×250，K=CW/444 缩放，Y 向上。

## 数据流（测量核心）

```
pointer/键盘 ─→ 千星事件系统 ─→ 探针回调
  cursor 8+1 种监听（ProbeArea）─→ dispOf()=GetUIPos-GetPressUIPos 距离
      ├─ Click: clickN++, clickMaxD=max(...)     ┐
      ├─ BeginDrag: dragN++, dragMinD=min(...)   ├─ line3 `T [max,min]` 阈值区间
      └─ 全部事件 → SEQ 环形 10 条(连续 Drag 折叠) ┘→ line2
  键盘 164 项监听（容器 n1）─→ onKeyEv(闭包事件名) → line4 最近 2 键 + ok/total
  OnUpdate 0.1s 节流 ─→ GetCursorUIPos → line5
```

## 关键 API 判定（模拟器白名单 + 契约复核，真机待验）

- **坐标读法**：`d:GetUIPos()/d:GetPressUIPos()/d:GetUIPosDelta()` 方法——Lua 侧 `d.x` 非字段（模拟器 mtCursor 白名单仅 dragging/touchId，探针 line5 探测真机行为）。
- **写文本**：`c.text='...'` 字段赋值（textbox 无 SetText）。
- 键回调**无参数**（事件名必须闭包捕获）；返回 false 不中断（true=中断后续监听）。
- `SimulateCursorClick()`：模拟器发 Dn+Up+Cl@局部(0,0)；真机契约条 8 只保证发 Click——SIM 按钮验证真机行为。
- CursorMove 枚举：模拟器无（CM=NO），真机探测中；hmlt 当前版引用它属潜在无效挂载。

## 服务端变量/信号

无（serverLogic.rules 空）——纯客户端读出，屏上 textbox 是唯一读出通道，测量靠人眼抄录/拍照。

## 修改指引

- 改探针：编辑 `lua/main.lua` → `python3 qxqy/build.py`（冒烟必须无日志错误）→ MCP 加载试玩验证 → `node qxqy/export-gia.mjs` 重导真机包。
- 常量：模板 guid（T_TXT/T_BTN/T_AREA）、SEQ_SZ=10、逻辑场 FW=444。
