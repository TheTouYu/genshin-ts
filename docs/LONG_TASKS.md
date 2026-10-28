# 长期任务登记表（跨任务入口）

> 状态：当前实现（2026-10-28 建立：一条长期任务一个档案目录，本表是**唯一**的跨任务索引）
> 来源：`longtask-dossier` 技能多任务扩展（用户 2026-10-28 原话「这个技能也需要优化来支持多个任务同时推进」）
> 最近校验：2026-10-28

---

## 一、什么时候用

- **新会话接手**：先读本表 → 找到用户说的任务 → 进该任务的 `INDEX.md` → 再进它的 `LINES.md`。
- **开新任务**：`longtask_new.py --dir docs/longtask-<task> --line <line>` → 本表加一行。
- **任务收尾**：只改本任务档案，本表更新「状态 / 断点 / 上次读数」三列。

> 与 `docs/longtask/LINES.md` 的分工：**本表管"有哪些任务"，各任务内的 `LINES.md` 管"任务内有哪几条线"**。

## 二、任务表（唯一权威）

| 任务 id | 名称 | 档案目录 | 状态 | 当前断点（一句话） | 恢复入口 | 上次读数 |
|---|---|---|---|---|---|---|
| `genshin-ts` | 千星三游戏主线（足球 / 2D 产线 / GUI-AGI） | `docs/longtask/` | 活跃 | 三条并行线，断点见其线表（football / sim-2d / gui-agi） | [longtask/INDEX.md](longtask/INDEX.md) | 2026-10-28 |
| `defender3` | 守墙者（Defender III 3D 重制） | `docs/longtask-defender3/` | 活跃 | 前 5 关设计稿 v0 已出，等用户拍板（镜头/成长/元素/范围） | [longtask-defender3/INDEX.md](longtask-defender3/INDEX.md) | 2026-10-28 |

**状态词表**：活跃 / 等用户 / 暂停 / 待裁决 / 已闭环 / 已废弃（与线表同一套词，语义相同）。

## 三、规则

1. **一个任务一个目录**：`docs/longtask-<task-id>/`，内含 `INDEX.md` + `LINES.md` + 五件套 + `dossiers/`。
2. **本表只记指针，不记细节**：细节去任务目录，避免本表变成第二个"大文档"。
3. **开/关任务必须改本表**：新任务加行；闭环改状态并保留行（删了会重开）。
4. **跨任务的资源冲突**（真机/屏幕/存档）写进各任务 `LINES.md` §三，不写这里。

## 四、体检

```bash
python3 .agents/skills/longtask-dossier/scripts/longtask_tasks.py --registry docs/LONG_TASKS.md --check
python3 .agents/skills/longtask-dossier/scripts/longtask_tasks.py --selftest   # 判定器自证
```
