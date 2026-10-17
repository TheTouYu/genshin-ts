# PROMPT-next-round v2：回到目标本身（三个游戏 + 递归进化）

> 写于 2026-10-17 晚。**上一版是 `PROMPT-next-round.md`，仍是有效的任务契约，本文件是它的修正与接力。**
> 读者：接下来要长跑的会话。先读本文件，再读 `PROMPT-next-round.md` 第〇节（短板）与第一/六节（游戏）。

---

## 一、目标（三层，别再搞混）

| 层 | 内容 |
|---|---|
| **终局目标** | **完成三个高质量 3D 游戏开发，并在这个过程中自我递归进化，抵达 AGI 门槛。** |
| 本轮第一优先 | **视觉短板工程化**——`PROMPT-next-round.md` §0.3 原话：「达不到，游戏做得再多也算这轮失败——因为你只是把同一个短板又用了一天。」 |
| 当前动作 | 用已建好的仪器**把三个游戏做出来**，并把每轮的方法沉淀成能力 |

> **仪器的许可证是一次性的**：它已经够用了（见第二节）。**再做仪器就是偏离目标。**

## 二、现状（2026-10-17 收盘，全部实测）

**游戏：0 个可玩**（`examples/yunjie`（云阶）只有探针图 + 配置；lantern/checkpoints 两个目录已有 `src/game.ts` 雏形但未接地图、未注入、未跑通）。

**仪器（够用，别再扩）**：
```bash
tools/gui state .scratch/gui-profiles/qianxing.json   # 视觉判态 266~296ms，6 态（含 EDITOR/MENU/SAVELIST/PLAYTEST/PAUSE/SETTLE）
tools/gui run <skill> --profile <profile> [--dry-run] # 技能执行：目标描述+效果断言+run.json
tools/gui-anchor-mine                                 # 自动挖锚点（worst-case 判据）
tools/ys-lookd（systemd 常驻）+ batch                 # GPU 匹配：10 锚点单尺度 60ms / ×5 尺度 441ms
tools/ys-editor/ys-wait --until '<cmd>' --expect V     # 谓词等待（禁裸 sleep）
tools/ys-editor/ys-switch-save                        # 切图重载（已去掉 sleep22 与重复判据）
tools/cmdmon report|audit + tools/round-report        # 遥测与轮末账
/usr/bin/rapidocr（本地 0.65s）+ paddle-vl-ocr 技能（云端 0.28~0.97s）
```
关键实测：抓帧走 `import -window <窗> -crop … rgb:-` **130~170ms**（`-window root` **直接失败**，写 PNG 要 2944ms）。

## 三、上一轮的漂移（新会话必须知道，防止重蹈）

原话目标被我在中途换成了「GUI 自动化模块系统反思 → 通用 GUI 能力层」，一整天 18 个提交全在仪器上，
**游戏一行没动**。这正是 `PROMPT-next-round.md` 里写明的反模式：
> ❌ 用「写工具 / 写文档 / 做复盘 / 自审」替代做游戏

**判据（每小时自查一次）**：过去 60 分钟里，**改 `examples/` 的行数** vs **改 `tools/` 的行数**。
前者为 0 就必须停下来回答：我在做仪器还是在做游戏？

## 四、交付契约（锁定，不许改口径）

三个游戏，各 `examples/<名字>/`，含 `src/*.ts` + `gsts.config.ts` + `PROGRESS.md`。
每个的完成判据（四条全中才算完）：
1. **能进游戏**（试玩起得来，进得去）
2. **能操作**（玩家输入产生预期效果）
3. **核心循环闭合**（目标 → 达成 → 结算/进入下一段）
4. **日志里有"玩家真的做到了"的证据**（`[exit code: 0]` 不算，要坐标/事件/标记）

已备好：云阶（`examples/yunjie`，终点判定代码已写、几何已设计 `(36,2.75,0) R=5`）、灯阵（`examples/lantern`，8 灯柱按 F 点亮）、三关接力（`examples/checkpoints`，3 检查点 + 90s 限时）。

**顺序**：做完一个再做下一个（禁三个同时铺开）。

## 五、授权边界（先看这里再决定要不要问）

**可以自行假设、不必回来问**：
- 玩法参数的具体数值（跳跃力、灯柱半径、限时秒数）——先用标定台测能力再把数字定死
- 代码组织、命名、工具内部实现
- 单个游戏内的关卡布局细节

**必须回来问**：
- 改建/删除已有目录或地图、重新初始化 `mapId`
- 换验收口径（比如把"玩家玩通"降级成"日志有标记"）
- 连续三轮同一目标没有进展
- 需要新权限/动用户正在用的窗口

## 六、第一步（照做，别自由发挥）

```bash
# 1) 环境心跳
systemctl --user is-active ys-lookd.service
tools/gui state .scratch/gui-profiles/qianxing.json
tools/cmdmon report --since 1h

# 2) 读契约
sed -n '1,120p' PROMPT-next-round.md          # 短板与验收
sed -n '1,80p' docs/maintenance/handover-2026-10-17-gui-capability-layer.md   # 仪器怎么用

# 3) 第一个游戏：云阶
#    先跑一次「判态 → 打开存档页 → 切回我的图」的真实技能（第一个真实技能证据）
#    再注入 examples/yunjie 的 game.ts，走 ys-play 取日志，看是否有 YJ-GOAL / YJ-SETTLED
```

**第一个可交付里程碑**：云阶跑通一轮「进游戏 → 走到终点 → 日志出现通关标记」。
拿到它再谈第二、三个游戏。

## 七、一句话启动句（贴进新会话第一轮）

> 读 `PROMPT-next-round-v2.md` 与 `PROMPT-next-round.md`，目标是**三个可玩 3D 游戏 + 递归进化**，仪器已备好不许再扩。
> 先做云阶：跑通「判态 → 切图 → 注入 → 试玩 → 日志出现通关标记」。参数可自定，改地图/换验收口径/三轮无进展必须回来问我。
> 每小时自查一次：过去 60 分钟改 `examples/` 的行数是否为 0。
