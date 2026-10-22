# 归档规则

> 状态：当前推荐
> 来源：本套文档的反膨胀规则
> 最近校验：2026-10-22

## 什么时候归档

- `04-timeline.md` 超过 120 行 → 把最老的一半移到 `archive/timeline-YYYY.md`，正文只留最近 ~60 行 + 一行指针。
- `05-open.md` 里"已关闭"超过 20 条 → 移到 `archive/closed-YYYY.md`。
- 某个 dossier 讲完了（该子主题收口）→ 整篇移到 `archive/<主题>-YYYY-MM-DD.md`，并在 `INDEX.md` 的指针表里删掉那一行。
- 上下文要压缩之前，**先把变化写进 L1 层**，再压。

## 怎么命名

`archive/<文件主名>-<YYYY-MM-DD>.md`，例：`timeline-2026-10.md`、`gui-agi-2026-11-03.md`。

## 归档件不改内容

归档件是历史记录：只允许加一行 `> 归档于 YYYY-MM-DD`，其余保持原样。结论若已过期，在 `05-open.md` 或当前 L1 文件里写新结论并指向归档件。

## 归档后必须做

1. 检查 `INDEX.md` 的指针表没有指向归档件的"当前"入口。
2. 运行 `python3 <skill>/scripts/longtask_check.py --dir docs/longtask` 通过。
