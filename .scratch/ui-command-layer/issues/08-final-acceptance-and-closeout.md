# 08 — 游戏内总验收 + 关账沉淀

**What to build:** 四能力（List/改动识别、Create、Edit、Delete）在真实游戏流程里过一遍总验收：AI 创建按钮面板 → 玩家
细排 → AI 能列出玩家改了什么 → 继续编辑/删除不破坏玩家成果；用户按 03 设计稿的验收句式逐项在游戏内核验，发现问题开
修复轮直至通过。之后关账：复盘（task-retrospective）、规则入 PKC 知识树、差分技能 UI 模块与资产操作技能回灌、覆盖登记
更新、看板全部划掉、精确 commit。

**Blocked by:** 04, 05, 06, 07

**Status:** 09 已承担总验收并完成（2026-09-03）→ 本票剩统一关账（复盘/PKC/技能回灌/知识书/看板/commit）

- [x] 端到端 dry-run 演练脚本 PASS 4/4（ui/tests/ticket08-e2e-dryrun-assert.ts + ui/verification/ticket08-e2e-dryrun.txt）
- [x] 总验收场景全部通过（由票09 承担：1073741917「UI核验09」A/B/C 全过 + 修复轮 R1-R5；报告 ui/verification/ticket09-verification-report.md）
- [ ] 复盘/PKC/技能回灌完成（复盘文档已落 ui/verification/retro-2026-09-03-ticket09-game-verification.md；PKC/技能回灌待执行）
- [ ] 知识书与覆盖登记同步
- [ ] 看板关账 + 精确 commit

## 轮次记录
