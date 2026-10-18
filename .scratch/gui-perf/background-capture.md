# 后台抓帧（按窗口抓，不依赖栈顶/当前桌面）——task-6

> **本文件最重要的两条结论（Lead 2026-10-19 要求置顶）**：
> 1. **最小化后能不能"后台盯着游戏"取决于客户端**：原神（GL/DXVK）最小化后**仍在出活帧**（KWin ScreenShot2 234–255ms，5 次采样 sha 全不同）；
>    普通 X11 客户端最小化后**内容冻结**（同法测 700ms 内 diff=0）。⇒ 后台盯游戏**可行**，但工具必须用 `frame_source`/`visible` 明示，别把"冻结帧"当活帧。
> 2. **后台帧必须由调用方显式声明**：守护是 `--source window` 时，`latest` 不带 `--allow-background` 一律拒绝
>    （**exit 12 `BACKGROUND_NOT_ALLOWED`**，不落像素）——否则上层会以为自己拿的是可见画面，动作照做就会点错（票 34 同族）。


> 2026-10-18 23:4x–2026-10-19 00:0x｜仓库 `/home/h/genshin-ts`｜KDE Wayland（KWin 6）+ Xwayland `:1`
> 目标窗：原神 `0x01400001`（KWin internalId `{02ef18e8-9e9a-420d-8639-cb530e58b04b}`）
> 实现：`tools/ys-editor/ys-capture` + `ys_capture.py` 新增 **`--source window|screen`**（默认 screen 不变）
> 原始读数：`background-capture-game.json`、`background-capture-test.json`、probe/（kwin_capture.py、capture_matrix.py、game_matrix.py）

## 结论先行

| 问题 | 答案（实测） |
|---|---|
| 窗口在**别的虚拟桌面**能抓吗 | **能**。XShm 窗口抓帧 5–15ms、KWin ScreenShot2 242–288ms，两条都出**活帧**（4 次采样内容都在变） |
| 被**完全遮挡**能抓吗 | **能**。把游戏移到当前桌面并 `keepBelow` 压到 Firefox 底下：XShm 5.8–12.6ms、KWin 269–274ms，均活帧 |
| **最小化**能抓吗 | **分路径**：**XShm 直接失败**（`X_ShmGetImage` BadMatch，窗口不可映射）；**KWin ScreenShot2 能拿到帧**——原神最小化时是**活帧**（234–255ms，5 次采样 sha 全不同），普通 X11 测试窗最小化时是**陈旧帧**（内容冻结）。⇒ 结论=**能拿到帧，但"是否活帧"取决于客户端最小化后是否继续渲染**；工具用 `frame_source`/`visible` 明示，不猜 |
| 单帧耗时 | XShm **1.5–15ms**；KWin ScreenShot2 **242–288ms**（原神 2560×1440，冷启动 604ms）；小窗（640×400）KWin 4–10ms |
| CPU / GPU | window 模式守护（fps=5，XShm 路径）**9.5% 单核**；GPU 抓帧≈0（采样时原神最小化 0%、平时 14% 是游戏自身） |
| 与屏幕路径一致性 | **静态窗**：mean_abs **0.0035**、max 32、>8 的像素 **0.0133%**（≈逐像素一致）；**原神（动画）**：mean_abs 0.89（同帧不同时刻，差异来自动画） |

**票 34 红线**：`--source window` 的每一帧都带 `"capture_mode":"background"` + `"visible":0/1` + `"frame_source":"xshm-window|kwin-ss2"`；
**它永远不冒充"在栈顶"**——严格可见性判定仍归 `attribution.strict`（KWin），只是不再据此拒绝返回像素。
`--source screen`（默认）语义与之前完全一致（不可见就 exit 4/9）。

## 路径实现与失败模式

| 路径 | 实现 | 实测 | 失败模式 |
|---|---|---|---|
| **KWin ScreenShot2 DBus** | `org.kde.KWin.ScreenShot2.CaptureWindow(handle=internalId, options, pipe_fd)`；`type='raw'` 时 pipe 里是**裸像素**（BGRA，stride 对齐），元数据在返回 dict（format=18/width=2560/height=1440/stride=10240/scale=1.5） | 242–288ms/帧；无需 portal 授权、无弹窗 | handle=KWin `internalId`（UUID），需用 KWin 脚本取（~1.1s，缓存；失败时重取）；非 raw 结果直接报错（协议变化 fail-closed） |
| **X11 窗口 XShmGetImage**（兜底/默认快路径） | 现有实现（进程内共享内存） | 1.5–15ms | 窗口最小化 → BadMatch；窗口销毁 → BadWindow |
| PipeWire 窗口流 | **未测** | — | 需要 xdg-desktop-portal 交互授权（会弹选窗对话框），与"后台无人值守抓帧"冲突；KWin DBus 已够用，故未引入 |

**组合策略（已实现）**：`window` 模式先走 XShm；失败（最小化 BadMatch）→ 自动切 KWin ScreenShot2，`frame_source=kwin-ss2`。
两条都失败 → 状态里 `last_err` 记录两者原因，客户端 fail-closed（不会拿旧帧冒充新帧）。

## 接口与状态

```bash
ys-capture serve --source window --fps 5          # 后台抓帧守护（默认 screen）
ys-capture latest --out /dev/shm/bg.bmp --format bmp
# → {"ok":true,"capture_mode":"background","visible":0,"frame_source":"xshm-window",
#    "ms":4,"frame":{...},"attribution":{"fast":"OK","strict":"OTHER_DESKTOP",...}}
```

- `state.tsv` 末尾新增 3 字段：`mode`（screen|background）、`src`（xshm-window|kwin-ss2）、`visible`（1|0，来自 KWin 严格结论）。
- `--source window` 的闸门：**调用方显式 `--allow-background`**（否则 exit 12 `BACKGROUND_NOT_ALLOWED`，不落像素）
  + 身份（class 必须匹配、`fast` 不能是 NOT_FOUND/UNKNOWN）+ 帧龄；**不查可见性**。
- `--source screen`：完全保留原有四道 fail-closed 闸门。

## 回归

| 检查 | 结果 |
|---|---|
| `ys-capture selftest` | **17/17 PASS**（原 14 + 新增 `gate_background_mode`（带 flag 出像素且明示 background）、`gate_background_requires_flag`（**不带 flag ⇒ exit 12 且不落像素**）、`gate_background_identity_fail`（身份不可信仍拒）） |
| `tools/ys-editor/tests/win-attrib.selftest.sh` | **25/25 全绿** |
| `ys-observe frame`（严格） | 仍按 KWin 结论拒绝（当前游戏在 desktop 3 → rc=2/NOT_ATOP 语义不变；未改 ys-observe） |
| `ys-capture` screen 模式（默认） | 行为不变：不可见 → `exit 4 OTHER_DESKTOP`，不落像素 |

## 安全与副作用（本轮实测踩到的）

1. 测试窗口 map 时会**抢焦点**（KWin 默认激活新窗）——收尾用 KWin 脚本把焦点还给用户窗口（本轮已还原到 firefox）。
2. 测试最小化/移动原神窗口时，**每次都核验还原**（`ys-atop --json --verify`：desktop [3]、minimized=false、current=1），全部通过。
3. KWin 脚本必须落在**宿主可见路径**（仓库内），否则静默零输出（D385）——`kwin_internal_id()` 已按此写，并区分 `YS-<tag>` 标记。

## 推荐

- **后台读屏/读像素**：`ys-capture serve --source window`（XShm 快路径 1.5–15ms，最小化自动落 KWin 242–288ms）。
- **动作前判可见性**：仍用 `--source screen` 或 `attribution.strict`（KWin 权威）——后台模式只用于"看"，不用于"点"。
- 若以后要抓 **Wayland 原生窗口**（无 X11 id、不在 XWayland 列表里）：XShm 不可用，只剩 KWin ScreenShot2（handle=internalId，本文件已实现），或 PipeWire 窗口流（需授权）。
