# 票 34 复现：全屏浏览器 / 别的虚拟桌面 → live 取帧必须拒绝

> 状态：**当前实现**（2026-10-18，`ys-observe`/`ys-atop --json`）｜来源：Lead 19:42/19:54 真机实测 + 本轮夹具回归
> 自动化回归：`bash tools/ys-editor/tests/win-attrib.selftest.sh`（25 项，0 抓屏）
> 手工复现需要**用户侧切窗口/桌面**，代理不要为了复现去移动/抬升窗口（见项目窗口纪律）。

## 故障形态（2026-10-18 实测）

`ys-observe frame` 在**原神窗口存在但不在当前桌面 / 被完全遮挡**时，曾返回：

```json
{"kind":"frame","path":"/tmp/ys-observe/cur.png","fresh":true,"atop":true,
 "window":"0x01400001","source":"spectacle-fullscreen"}
```

而 `cur.png` 内容是**当前桌面上的浏览器（DSH GUI）**——spectacle 抓的是合成器全屏，
再按原神窗几何裁剪（0,0 2561×1440），于是「窗口身份」与「像素内容」脱钩。
根因两条：① 旧 `ys-atop` 只看**堆叠序**、不看虚拟桌面；② 旧 `ys-wins` 把 KWin 脚本写到
`/tmp`，DSH 沙箱 `--tmpfs /tmp` 隔离后宿主 KWin 读不到 → 脚本零输出 → 被误读成 NOT_ATOP。

## 手工复现步骤（用户侧，约 1 分钟）

1. 让原神（窗口 id `0x01400001`）停在**桌面 2**，切到**桌面 1**。
2. 在桌面 1 打开一个**全屏**窗口（浏览器全屏即可）。
3. 运行：
   ```bash
   tools/ys-editor/ys-observe frame; echo rc=$?
   ```
4. **期望**（修复后）：
   - 退出码 **4**；
   - stdout 是 `{"error":"OTHER_DESKTOP",...,"attribution":{...,"verdict":"OTHER_DESKTOP","current_desktop":1,"window":{"desktop":[2],...}}}`
   - **没有** `path`/`value` 字段（拒绝返回像素）。
5. 把原神切回桌面 1，但让全屏浏览器**压在原神上面**，再跑一次：
   - 期望退出码 **5**，`error=OCCLUDED`，`attribution.covered_ratio` ≈ 1.0。
6. 正常态（原神在当前桌面且在最上层）：
   - 期望退出码 **0**，`attribution.verdict=OK`、`attribution_ms` ≤ 100（实测 51–67ms）。

## 自动化覆盖（不需要真机）

`win-attrib.selftest.sh` 用 `ys-wins --attrib` 格式的夹具覆盖同样的几何/桌面组合：

| 场景 | 期望 |
|---|---|
| 同桌面 + 栈顶 | rc=0 / verdict=OK |
| 原神在别的桌面（当前桌面是浏览器） | rc=6 / OTHER_DESKTOP |
| 全屏浏览器压住原神（同桌面） | rc=7 / OCCLUDED |
| 600×400 小窗部分遮挡（14.6%） | rc=0 / OK（未完全遮挡） |
| 大窗在上但只盖 31% | rc=1 / NOT_ATOP |
| 原神最小化 | rc=7 / OCCLUDED |
| 标题含「原神」的编辑器 + 真原神在别的桌面 | rc=6（**按 WM_CLASS 选真原神**，不选编辑器） |
| 只有编辑器、没有原神 | rc=2 / NOT_FOUND，且顶层 `atop=false` |

`YS_ATTR_FIXTURE=<文件>` 注入夹具；`YS_OBSERVE_SKIP_GRAB=1` 让 `ys-observe` 只校验不抓屏。

## 判据与代价

- **身份**：窗口 id 优先（`YS_WIN`，默认 `0x01400001`），其次 `WM_CLASS`（`YS_WIN_CLASS`，默认 `yuanshen.exe`）；
  标题只作提示——「原神编辑器」也含"原神"，按标题会选错窗口。
- **桌面**：`_NET_CURRENT_DESKTOP` vs `_NET_WM_DESKTOP`（X11，0 基；`4294967295`=所有桌面）。
- **遮挡**：`_NET_CLIENT_LIST_STACKING` 中目标之上的、同桌面、未最小化窗口，与目标求交集并集；
  覆盖率 ≥99.5% ⇒ OCCLUDED；最小化也判 OCCLUDED。
- **代价**：默认 `ys_attrib.py`（X11/EWMH）≈**20ms**（ys-atop）/ **51–67ms**（ys-observe 含进程启动）；
  `--verify` 的 KWin 慢路径 ≈**0.96s**，只在显式要求全量 occluder 名单时用。
- 顶层 `atop` **由 verdict 推出**（`verdict != OK ⇒ atop=false`），读数里同时给 `atop_source`
  （`attribution` / `legacy`）——不允许出现「attribution 说 NOT_FOUND、顶层却说 atop:true」。
