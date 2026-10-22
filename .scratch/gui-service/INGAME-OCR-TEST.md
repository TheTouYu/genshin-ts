# 游戏内 OCR 实测协议（2026-10-22，用户要求：进游戏测速度与准确性）

> 状态：待执行（用户开游戏后跑）
> 原则：**用户是验收上限**（AGI-BAR 口径④）；工具只负责把结果做成可核对的表，不自己判"准确率"。
> 前置：两个 AI 服务（dsh-embed/dsh-decision）+ `dsh-game-mode.timer` **保持停止**（用户明确不恢复）。

## 一、绝对纪律

- **不抢屏**：全程只读后台帧；不调 `ys-session` / `ys-pointer-click` / `ys-gui-slot`。
- 需要活帧时用 `cmd=ocr` 不带 frame（守护自己抓），不抬窗。
- 每次测量记**三元组**：`nvidia-smi` 的 used/free、`clocks.sm`、邻居是否 active。
- A 段（游戏在跑）与 B 段（游戏退出）**分开列**，禁止混报。

## 二、测什么（四组）

### A. 显存（A 段首次实测，之前一直缺）
1. `nvidia-smi --query-gpu=memory.used,memory.free,clocks.sm --format=csv,noheader`
2. `nvidia-smi --query-compute-apps=pid,process_name,used_memory`（记 YuanShen.exe 与守护各多少）
3. 守护进程：`ps -o rss,etime -p <ys_lookd pid>`、swap、线程数
- 对照：改前 A 段实测 **2588 MiB**（旧进程跑 4h26）。

### B. 固定帧热态（基线，不随画面漂移）
- f06 固定帧，`cache=off`，`pipeline=plain`，n=20
- 输出 p50/p95 + 分段 `timing`（load/det/cls/rec）
- 对照：B 段（游戏退出）**529ms**；A 段改前 **929ms**。

### C. 活体帧（游戏里的真实成本）
- `cmd=ocr` 不带 frame，间隔 ≥0.5s，n=10，`cache=off`
- 同时记"同一帧连打"（cache=on，n=5）——两者必须分开报
- 期望：活体帧必 miss，成本接近 B/C 档的真推理时间

### D. 准确性（用户核对）
1. 取 3 个不同界面（如：世界 HUD / 派蒙菜单 / 角色页），各保存一帧 png + OCR 结果 json
2. 表格列：`序号 | 位置(x,y,w,h) | 文本 | 置信度`
3. 用户逐条对照屏幕，标"对 / 错 / 漏 / 多"
4. 汇总：中文行、英文数字行**分开**统计（用户强调中文场景多）
5. **明确标注**：小字号 HUD（FPS/坐标/等级）是否读对——这是 det 降分辨率最先伤的地方

## 三、产出

- 证据目录：`.scratch/gui-service/evidence/ingame-ocr-<YYYYmmdd-HHMMSS>/`
  - `frame-<n>.png`、`ocr-<n>.json`、`bench.json`（A/B/C 三组读数）、`README.md`（用户核对结果）
- 报告：`docs/maintenance/ocr-ingame-2026-10-22.md`（状态头 + 四组表 + 未闭合项）

## 四、判据（什么算"通过了"）

| 维度 | 判据 |
|---|---|
| 速度 | 活体帧 p50 如实报，**不设"必须 <250ms"的假门槛**（硬件地板 529ms 已确证） |
| 准确性 | 用户核对的中文行正确率 ≥ 95%（未达标就如实写，不调参掩盖） |
| 显存 | 游戏在跑时守护显存如实报；若 >2000 MiB，说明 512/会话 的天花板在 A 段仍会被叠满，需记 open item |
| 可复算 | 同一命令重跑得到同量级数字；证据目录能重推结论 |
