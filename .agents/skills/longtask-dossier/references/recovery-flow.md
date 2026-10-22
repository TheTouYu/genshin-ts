# 复现：2026-10-22 的一次真实恢复 → 建档 → 成技能

这次任务的起点是「上下文压缩后接手一个已经跑了 5 天的长期任务」，终点是「分层档案 + 本技能」。
下面是可以照抄的完整流程，命令都实测过。

## 第 0 步：先列会话清单（看标题，不看 mtime）

```bash
python3 ~/genshin-ts/scripts/ys-sessions -n 40      # 时间 | 目录 | 标题 | 主会话/子代理 | ★当前
```

**为什么**：只按 mtime 取"最新"会把别的任务的子代理当成上一个会话。标题能一眼对上任务。

## 第 1 步：抽全量用户消息（不截断）

```python
# /tmp/extract_users.py <SINCE> <TRUNC>：只认 data.source.kind == 'user'，
# 跳过 system-reminder / skill-invocation，输出 "### 日期 目录 | 标题 | N 条" + "[seq] 时间 正文"
python3 /tmp/extract_users.py 10-14 500 > /tmp/users_early.txt
```

**教训**：第一次只从 10-18 开始抽，漏掉 10-17 的主线起点（三个游戏）。
**判据**：恢复报告里必须能回答"这个任务是**怎么来的**"，答不出说明范围起晚了。

## 第 2 步：找"起点"和"转折"

```bash
grep -n "心法\|准则\|起点\|总目标\|裁决" /tmp/users_early.txt
```

用户给的心法常常以 `心法：…` 直接标注；转折点则表现为"先做 X，别做 Y"的裁决。两者都进 `02-xinfa.md` 与 `04-timeline.md`。

## 第 3 步：只读核实现场（不猜）

```bash
git log --oneline -3
ps -o pid,etime,cmd -C YuanShen.exe            # 游戏在不在
tools/ys-editor/ys-wins --attrib               # 前台窗口
tools/ys-editor/ys-screen-grant status         # 屏幕授权
```

**判据**：档案里每一条"当前读数"都能追到一次命令输出。

## 第 4 步：把 `/tmp` 里的交接搬进仓库

```bash
cp -p /tmp/handoff-xxx.md .scratch/<主题>/HANDOFF-YYYY-MM-DD.md
sha256sum /tmp/handoff-xxx.md .scratch/<主题>/HANDOFF-YYYY-MM-DD.md   # 必须一致
```

## 第 5 步：建分层档案

```bash
python3 .agents/skills/longtask-dossier/scripts/longtask_new.py \
  --dir docs/longtask --title "<任务名>" --goal "<一句话>"
```

然后填：`01-charter`（用户原话）、`02-xinfa`（每条带出处）、`03-state`（读数）、`04-timeline`（决策链）、`05-open`（缺口）。

## 第 6 步：把档案接进注入入口（否则新会话不会读）

- 根 `CLAUDE.md`（12KB 预算，有余量）加一行：`长期任务入口：docs/longtask/INDEX.md（新会话先读）`。
- `docs/documentation-map.md` 加一行指针。
- 根 `AGENTS.md` 已满 16KB，**不往那里塞**；要加就先删等量内容。

## 第 7 步：体检 + 提交

```bash
python3 .agents/skills/longtask-dossier/scripts/longtask_check.py --dir docs/longtask
python3 scripts/doc_health.py --staged      # 提交前由 pre-commit 自动跑
git add docs/longtask/ && git commit -m "docs(longtask): …"
```

## 本次恢复暴露的三个系统性坑（写进档案就是为了不再犯）

1. **恢复范围起晚了**：从 10-18 起读，漏掉 10-17 的主线起点 → 报告把"先行条件"当成了"目标"。
2. **交接写进 `/tmp`**：重启即失 → 现在规矩是落仓库。
3. **档案没接进注入入口**：写完没人读，等于没写 → 第 6 步是必做项。
