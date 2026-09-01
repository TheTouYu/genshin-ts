# Context: collaboration（人机协作纪律）

> 状态：当前推荐（2026-09-01 用户裁决建立；来源：双样本协作复盘 R0-R5，`docs/collab-retro-2026-09/`）

## 目标

人机协作纪律的查询入口：让"怎么和用户协作"的规则像引擎规则一样可检索、可回灌、可验收。

## 覆盖的规则域（claims 见 `knowledge/project-evolution/collaboration-discipline.md`）

1. **注入授权边界**：口头宽授权仅当轮有效；注入前标注授权来源（AGENTS.md 一次性授权边界）。
2. **重写前置**：examples/ 玩法重写前必读目录 AGENTS.md 不变量清单，退役纪律逐条裁决。
3. **修复报告门禁**：三栏 + 行为预期句式（第三栏给用户复测的尺子）。
4. **排查规程**：分层推演（输入→逻辑→渲染）+ 先穷尽工件再问人。

## 恢复入口

- 复盘全档：`docs/collab-retro-2026-09/`（STATUS.md 索引各轮产物与提交）
- 落地映射：`docs/collab-retro-2026-09/optimization-plan-R4.md`（F/D/H 三系 + 依赖图）
- 七问风险表：`docs/collab-retro-2026-09/findings-R3-seven-questions.md`

## 验证门

`pkc validate && pkc knowledge-check && git diff --check`
