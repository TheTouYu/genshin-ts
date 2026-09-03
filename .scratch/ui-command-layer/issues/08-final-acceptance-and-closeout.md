# 08 — 游戏内总验收 + 关账沉淀

**What to build:** 四能力（List/改动识别、Create、Edit、Delete）在真实游戏流程里过一遍总验收：AI 创建按钮面板 → 玩家
细排 → AI 能列出玩家改了什么 → 继续编辑/删除不破坏玩家成果；用户按 03 设计稿的验收句式逐项在游戏内核验，发现问题开
修复轮直至通过。之后关账：复盘（task-retrospective）、规则入 PKC 知识树、差分技能 UI 模块与资产操作技能回灌、覆盖登记
更新、看板全部划掉、精确 commit。

**Blocked by:** 04, 05, 06, 07

**Status:** ✅ 完成（2026-09-03：总验收由票09 承担通过；复盘/PKC/技能回灌/覆盖登记/看板关账/commit 全部落地）

- [x] 端到端 dry-run 演练脚本 PASS 4/4（ui/tests/ticket08-e2e-dryrun-assert.ts + ui/verification/ticket08-e2e-dryrun.txt）
- [x] 总验收场景全部通过（由票09 承担：1073741917「UI核验09」A/B/C 全过 + 修复轮 R1-R5；报告 ui/verification/ticket09-verification-report.md）
- [x] 复盘/PKC/技能回灌完成（复盘 retro-2026-09-03-ticket09-game-verification.md；PKC bundle bnd_6c003c3b8f0cbf7194170aa1cf 已 apply+commit 952bb60；ui-controls.md/mappings.md 票09 节已回灌）
- [x] 知识书与覆盖登记同步（coverage log 追加 2026-09-03 票09 条）
- [x] 看板关账 + 精确 commit（BOARD 票09/票08 划掉、前沿→票10；commits 0044320/49d144c/888aaee/85535b9/179eea3/7cb7521/952bb60 等）

## 轮次记录
