# 接力说明：GUI 能力层（2026-10-17 收尾）

> **给新会话的第一屏**。读完这份就能接着干，不需要翻历史。
> 详细复盘：[retrospective-2026-10-17-gui-capability-layer.md](retrospective-2026-10-17-gui-capability-layer.md)
> 设计演进：[design-2026-10-17-gui-operation-assets.md](design-2026-10-17-gui-operation-assets.md)（v1–v12）

## 目标（2026-10-17 用户纠正后的正确口径）

**终局目标：完成三个高质量 3D 游戏开发，并在这个过程中自我递归进化，抵达 AGI 门槛。**
GUI 能力层**不是目标**，它是「视觉短板工程化」这一**前置条件**的实现——`PROMPT-next-round.md` §0.3 原话：
「达不到，游戏做得再多也算这轮失败——因为你只是把同一个短板又用了一天。」

⚠ **本会话的漂移（必须记住）**：一整天 18 个提交全在仪器上，**游戏一行没动**，
正是任务书里写明的反模式「用写工具/写文档/做复盘替代做游戏」。
⇒ 新会话的判据：每小时自查「过去 60 分钟改 `examples/` 的行数」，为 0 就停手回到游戏。
完整修正见仓库根 **`PROMPT-next-round-v2.md`**。

## 现在能用的东西（都跑通过）

```bash
tools/gui state .scratch/gui-profiles/qianxing.json      # 视觉判态 ~270ms（含抓帧），6 态
tools/gui run <skill.json> --profile <profile.json>      # 执行技能（动作+断言+run.json 证据）
tools/gui run <skill.json> --dry-run                     # 只解析不动作
tools/gui lint <skill.json>                              # 拒收「没有效果断言」的技能
tools/gui-anchor-mine --per-state 30 --top 6 --margin 0.2  # 从标注帧自动挖锚点（worst-case 判据）
tools/ys-lookd（systemd 常驻）+ tools/ys-editor/ys_lookd.py batch   # GPU 批量匹配
tools/cmdmon report|alerts|audit                          # 命令遥测（全项目）
tools/round-report --since 30m                            # 轮末一页账 + 教练卡 + round.json
tools/ys-editor/ys-wait --until '<cmd>' --expect V --timeout N   # 谓词等待（禁裸 sleep）
tools/ys-editor/ys-sample grab SETTLE "说明"               # 用户纠错 → 永久回归样本
```

**关键实测数字**（都是本机量出来的，别再重测）：
- 抓帧：`import -window <窗口> -crop … rgb:-` 管道 **130~170ms**；写 PNG 文件 **2944ms**；`-window root` 写文件**直接失败**（0 字节）
- GPU 匹配：单次全帧 31ms；`ys-lookd batch` 10 锚点单尺度 **60ms**、×5 尺度 **441ms**
- 判态：快路径（6 锚点 ROI）**266~296ms** 端到端；慢路径（32 锚点全帧）~1s
- AT-SPI：`cu state` 800~900ms（热遍历 ~650ms 是大头，不是进程启动）；本机仅 3 个应用有树，Wine 零覆盖
- 云端 OCR（优化后）：裁区 **0.28~0.31s**、全帧 2560×1440 **0.97s**；本地 RapidOCR 0.65s

## 资产（可直接复用）

- **profile**：`.scratch/gui-profiles/qianxing.json`（32 锚点 / 6 态：EDITOR/MENU/PAUSE/PLAYTEST/SAVELIST/SETTLE）
- **锚点库**：`.scratch/gui-anchors/anchors.json`（含 margin / home_min / foreign）
- **技能样例**：`.scratch/gui-skills/`（沙箱 pick-green、千星 savelist→editor）
- **回归帧**：`tools/ys-editor/calib/regress/`（11 张标注帧 + manifest.tsv）
- **实验**：`.scratch/gui-grounding/`（A/B/C 三实验可重跑）

## 下一步（按优先级）

1. **G2 收尾**：把 8 个高频操作写成技能（开菜单 / 存档页 / 切图 / 试玩起停 / 暂停 / 结算离开），
   用 `--dry-run` 先验证目标解析，再在真实编辑器上跑**一个**可逆操作（ESC 类）。
2. **首次真实目标验证**：本会话所有验证都在回归帧和自建 GTK 沙箱上，**真实编辑器一次没跑过技能**。
3. 判态降到 200ms 以下（抓帧 140ms 是主要项；可考虑复用帧或只抓关键区域）。
4. 锚点库扩样（换分辨率/换语言），worst-case 判据已就位，缺样本。

## 踩过的坑（别重蹈）

- **`import -window root` 在本机失败**（0 字节）；"很快"可能是"失败得很快"。**耗时要带产物校验**。
- **`os.environ.setdefault('XAUTHORITY', …)` 会被空字符串挡住** → `import` 报 Authorization required。
  一律**覆盖**，不要 setdefault。
- **python 子进程缺 DISPLAY/XAUTHORITY 时 `import` 静默返回 0 字节**；`ys_look.grab()` 现在会自愈+抛错。
- **profile 缺 x/y/patch 时 ROI 全落 (0,0)** → 静默走慢路径，不报错。
- **单模板分数阈值判态不可靠**（CPU 0.9371 / GPU 0.8997 跨阈值）；用几何一致性（锚图 inlier）。
- **锚点按 best-case 挖会过拟合单帧**；必须 worst-case（`min(同态) − max(异态)`）。
- 用户桌面是**共享的**：跑 GUI 测试用自建沙箱（`.scratch/gui-sandbox/app.py`），别动他的应用。

## 心跳检查（新会话开工前跑一遍）

```bash
systemctl --user is-active ys-lookd.service        # GPU 匹配服务
tools/gui state .scratch/gui-profiles/qianxing.json # 判态是否仍准（当前应为 SAVELIST 或 EDITOR）
tools/cmdmon report --since 1h                      # 上一小时花在哪
```
