# 自动解锁方案 v1（2026-10-20）

## 0. 一句话
假死是「Wine 输入状态错位」的**竞态**，解卡手势（Meta+右键拖动）每次有效且可编程 ⇒ **按焦点事件触发自动解卡**，而不是轮询或强杀重启。

## 1. 证据（本方案的输入）
| 事实 | 读数 | 出处 |
|---|---|---|
| 解卡手势可编程复现 | `ys-gesture-cure full` 经槽位执行 2–3s，用户当场确认「恢复了」 | 2026-10-20 07:45 |
| 假死会复发 | 07:45 解卡 → 08:13 菜单点不开（22 分钟后） | 同一晚两次 |
| 假死与焦点切换强相关 | 复发前有一段槽位切焦（每次槽位 = 激活编辑器 + 还原）；Wine Bug 59965 的机制正是「持 grab 时切换焦点 → WM_CANCELMODE → 应用内部捕获状态错位」 | D447 / Wine 59965 |
| 解卡成功后程序化点击稳定 | 双击树节点展开、菜单弹出、面板切换全部可复现 | 08:19–08:23 |

## 2. 触发源（三选一，按可靠性排序）
1. **焦点事件（首选）**：KWin 脚本 hook `workspace.windowActivated`，把 `from→to`（internalId/class）追加到事件文件。
   - 关键：**只关心与 `beyondeditor.exe` 相关的转移**（进/出编辑器）。
2. **试玩周期（可选叠加）**：游戏日志出现 `Destory Editor Page` / 结算场景后 → 已知的「试玩归来」场景，主动解卡一次。
3. **人工兜底**：一个全局快捷键跑同一命令（用户手动触发，零等待）。

## 3. 组件
```
KWin 脚本 (autocure-focus.js)
   └─ 写 /run/user/1000/ys-focus-events.log  (ts\tfrom_class\tto_class\tfrom_id\tto_id)

ys-autocure.service (systemd --user, Restart=always)
   └─ tail -F 该日志
      ├─ 过滤：from/to 涉及 beyondeditor.exe
      ├─ 防抖：距上次解卡 <10s 则丢弃
      ├─ 重入锁：/run/user/1000/ys-autocure.lock（解卡期间忽略自身切焦）
      ├─ 执行：ys-gui-slot <千星沙箱> 20 ys-gesture-cure full
      └─ 记账：~/.cache/ys-autocure.log（ts/触发原因/耗时/槽位退出码）
```

## 4. 安全不变量
1. **只动编辑器**：目标窗口必须 `class=beyondeditor.exe`，解析失败即放弃（不 fail-open）。
2. **净位移 0**：手势移出再移回，不改变窗口位置/大小。
3. **焦点严格还原**：由 `ys-gui-slot` 的 trap EXIT 保证，还原失败退出码 9 并记账。
4. **速率上限**：任意 60s 内最多 3 次解卡；超限进入 5 分钟冷静期并记账（避免与用户操作打架）。
5. **开关**：`touch ~/.cache/ys-autocure.off` 即停；`ys-autocure status` 看计数与最近事件。

## 5. 验收（必须全绿才启用）
1. **单次触发**：手动把焦点从编辑器切到 Firefox 再切回 → 日志出现 1 次解卡，编辑器保持可点。
2. **不误触发**：在 Firefox/游戏内正常切窗（不涉及编辑器）→ 解卡计数不增加。
3. **防重入**：解卡过程中自身的焦点切换不产生第二次解卡（60s 内计数 ≤1）。
4. **失败可见**：把编辑器杀掉再制造焦点事件 → 服务不崩溃、日志记录「目标不存在」。
5. **可关**：`touch` 开关文件后事件发生 → 计数不增加。

## 6. 已知风险与缓解
| 风险 | 缓解 |
|---|---|
| 解卡自身切焦引发递归 | 重入锁 + 10s 防抖 + 60s 速率上限 |
| 解卡时用户正在操作 | 仅在「焦点刚从编辑器离开/回到编辑器」时触发，且占位 ≤3s；槽位会打印占用秒数 |
| KWin 脚本 API 变更 | 脚本只依赖 `workspace.windowActivated`（KWin 6.x 稳定接口），失败时服务自然无事件、不动作 |
| 假死诊断可能不完整 | 本方案是**缓解**不是根治；根治仍指向 Wine x11drv 的 grab 状态机（Wine Bug 59965 同族） |

## 7. 与既有工具箱的关系
- 复用：`ys-gesture-cure`（手势）、`ys-gui-slot`（占用/还原）、`ys-lease`（窗口解析）。
- 不新增抓帧/注入通道；不依赖 `spectacle`（已被淘汰）。
- 新增文件：`tools/ys-editor/autocure-focus.js`（KWin 脚本）、`tools/ys-editor/ys-autocure`（服务主体）、unit 文件。
