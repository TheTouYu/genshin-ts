# 定位通道矩阵（gui grounding channels）

> 状态：**已验证读数**（2026-10-17 实测）｜统一入口：`tools/ys-find`
> 原则：**任何单通道都不许单独下结论**，一致才判"找到"。历史实证：裸单模板 NCC 在 60 负样本对里 3 笔 ≥0.9 假命中（D339）。

| 通道 | 实现 | 实测读数（2026-10-17） | 局限（要先知道） |
|---|---|---|---|
| `text` 文本 | RapidOCR（`.scratch/gui-grounding/venv-rapidocr`，离线 CPU），`tools/ys-editor/ys_ocr.py ocr` | pause 帧 3/3 按钮标签定位成功，框中心距真机实测点击点 **21 / 23px**；全帧 14 框；冷启 **2.56s**（含模型 init）。云端 PaddleOCR-VL-1.6 对照：同帧三标签 100% 精确，**4.08s**（无坐标输出，裁剪图文件名带框坐标） | 目标必须有可读文字；小裁片（≤300×60）本地 75%、云端 100% |
| `icon` 图标 | `ys_look._ncc_np` 纯文件 NCC（与 daemon 同式），`tools/ys-editor/ys_ocr.py match` | 同帧模板 round-trip：score **1.0000**，中心 = 裁剪原点 + patch/2（锚点 `pause_25` 裁剪于 (256,1280) → 命中中心 (304,1328)，**精确复现**） | **跨帧/跨版本会假命中**（0.9 阈值挡不住）；单模板只用于同帧/锚图 RANSAC 的输入 |
| `struct` 结构 | `cu find <app> <关键词>`（AT-SPI） | 本机仅 3 个 GTK 应用有树；**千星（Wine）侧 0 覆盖** | 对千星不可用；只作通用性佐证（第二个应用） |
| `geom` 几何 | 布局先验（"右上角/工具栏/侧栏"） | 尚未实现为独立通道；多锚点 RANSAC 已在实验里验证（10 异态帧 **0 假接受**、±10% 缩放 ≤1.2px、1.4s/帧） | ±25% 缩放仍失败（锚点裁片固定尺度） |

## 一次调用的形态

```bash
# 离线（不碰屏幕）：文本 + 图标两通道并列，一致才 agree
tools/ys-find --frame 帧.png --text 中断挑战 --icon 模板.png --expect 1280,877
# 结构通道（仅桌面应用）
tools/ys-find --struct 文件管理器 --text 名称
```

退出码：`0` 全部通道有候选且一致 / `3` 通道间不一致 / `4` 某通道无候选 / `5` 后端缺失。

## 已登记的两条实测（catalog `measurements.tsv`）

| catalog 行 | 通道 | 读数 | 证据命令 |
|---|---|---|---|
| EC-227 继续挑战 | text+icon | text(1301,558) 距实测点 21px；icon(1280,558) score 1.0000 距 1px | `tools/ys-find --frame tools/ys-editor/calib/regress/pause.png --text 继续挑战 --icon <crop 240x64+1160+526> --expect 1280,557` |
| EC-229 中断挑战 | text+icon | text(1303,878) 距实测点 23px；icon(1280,877) score 1.0000 距 0px | 同上，`--text 中断挑战`、crop `240x64+1160+845`、`--expect 1280,877` |
