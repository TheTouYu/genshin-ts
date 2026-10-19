# GUI 反馈轮 · 界面读数可视化（2026-10-19）

原神本体（窗口 `0x1800001`，2560×1440，UID 110170759）的**逐元素打开记录**，以及 GUI 模块对每一帧的读数。

打开方式：直接双击 `web/index.html`（数据已内联，不需要 http 服务）。

## 数据集里有什么

| 路径 | 内容 | 规模 |
|---|---|---|
| `frames/*.png` | 原始抓帧（2560×1440，**未入库**，只在磁盘） | 30 张 / 76 MB |
| `web/img/*.jpg` | 网页用缩图（1707×960） | 22 张 / 6.3 MB |
| `web/data.json` | 模块读数原始输出（containers/text/free_glyphs/structure/timing） | 131 KB |
| `web/index.html` | 可视化页（壁纸 + 图层叠加 + 总览表） | 127 KB |

`frames/` 里 22 张是被点开的界面帧（20 个派蒙菜单格子 + 世界 HUD + 派蒙菜单），
其余是 `_after_*`（每批收尾的"已回到菜单"证据帧）。

## 页面上能做什么

- 左栏切帧（← →），主画布是**原图壁纸**，上面叠 SVG 框
- 图层（1–5 键）：`容器` `文本框` `图形块` `分区` `标签`；`0` 是纯净模式（只看壁纸）
- 右栏点图例可以按 kind 隐藏/显示容器
- 悬停任意框出 tooltip：kind / id / bbox / 框内文本 / 可点性 / 是否被裁切
- 顶部「总览表」= 22 帧的容器/文本/图形块/游离文本/分区/耗时全表 + 合计

## 数据从哪来（可复现）

```bash
# 1) 抓帧（ys_lookd 常驻）
python3 -c '...cmd=grab...'            # 见 drive.py 里的 daemon()

# 2) 遍历点击（必须包在焦点租约里；ESC 是开关不是关闭，见 drive.py docstring）
tools/ys-editor/ys-lease run -- python3 .scratch/gui-feedback/drive.py .scratch/gui-feedback/steps-menu.json 0 20

# 3) 模块读数（tools/ys-screen --json）
python3 .scratch/gui-feedback/read_full.py .scratch/gui-feedback/web/data.json .scratch/gui-feedback/frames/[0-9][0-9]_*.png

# 4) 出网页
python3 .scratch/gui-feedback/build_web.py
```

## 这批数据暴露的模块缺口（不是记录失误，是真缺陷）

1. **容器层在多数面板上是空的**：22 帧里 **5 帧 containers=0**（世界 HUD、队伍配置、图鉴、角色图鉴、地图）。
   世界 HUD 明明有 46 个图形元素（小地图/技能位/队伍头像），模块一个容器都给不出来 —— 只有 `free_glyphs`。
2. **游离文本 = 结构缺失率**：背包 70/73、成就 38/39、角色图鉴 36/36、地图 24/24 条文本**没有任何容器接住**。
   后果：`act(text)` 在这些页面上解析不到目标。
3. **底部 4 格是 webview**，加载慢于固定等待 ⇒ 4 帧里有 2 帧拍到的是世界、1 帧拍到上一格。
   正确做法是"等判据"而不是"等固定时长"——重跑时已列进待办。
4. **耗时**：单帧 526–1388 ms（缓存后），与「≤200 ms/帧」的目标差 1 个数量级。

## 交互层三条硬事实（踩出来的）

- **ESC 是开关**：`世界 --ESC--> 派蒙菜单 --ESC--> 世界`，`面板 --ESC--> 派蒙菜单`。盲按会让界面横跳。
- **3D 世界鼠标被游戏捕获**：指针钉在 (1280,720)，`ydotool mousemove` 只转相机（12 轮闭环 0 命中、帧差 91%）。
  **按住 Alt 释放捕获**后闭环第 5 轮命中。
- **派蒙菜单判据（两像素，零歧义）**：`px(467,556)≈(236,229,216)` 且 `px(600,900)≈(80,89,107)`。
