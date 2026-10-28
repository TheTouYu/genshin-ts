# 守墙者（Defender III 3D 重制）· 长期任务入口（L0 · 3 分钟读完）

> 状态：当前推荐（立项 2026-10-28，进度 1%）
> 来源：用户 2026-10-27~28 会话原话 + 原作 APK 逆向实测（`~/re-targets/defender3/`）
> 最近校验：2026-10-28

---

## 一、这是什么任务（三句话）

1. **目标**：把 DroidHen《Defender III》（v2.7.1，Cocos2d-x 2D 弓箭塔防）的精华机制，重做成**千星沙箱里的真 3D 动作塔防**——真角色、真城墙、真怪物、提瓦特元素，玩家站在城墙前"感到自己很渺小"。
2. **为什么做**：原作是 2D（玩家只看得见一张弓和城墙），但它被验证过的三支柱（即时反馈 / 分支选择 / 节奏）值得用 3D 重讲一遍——"原来 2D 的东西全部 3D 化"本身就是卖点。
3. **不做什么**：不复刻原作素材（用千星/原神资产自造）；不做实时 PvP（千星做不到，改排行榜）；不做内购（改游戏内货币）。

## 二、现在在哪

| 项 | 读数 |
|---|---|
| 并行线 | [`LINES.md`](LINES.md) §二 是唯一权威（本任务目前只有 `defender3` 一条线） |
| 本会话在哪条线 | `defender3`（用户 2026-10-28 首句指定） |
| 断点 | [`dossiers/defender3.md`](dossiers/defender3.md) §五：前 5 关设计稿 v0 已出，等用户拍板 |
| 设计稿 | [`design/01-first-5-levels.md`](design/01-first-5-levels.md)（出怪/血量/攻击手段/加点成长） |
| 原作资料 | [`references/original-data-map.md`](references/original-data-map.md)（67 表 → 语义 → 怎么用） |
| 共享读数 | [`03-state.md`](03-state.md)（工具链 + 原作资产清单） |
| 阻塞 | 无（等用户对前 5 关设计稿的取舍） |

## 三、按你要做的事选读

| 你要做的事 | 读这份 | 预算 |
|---|---|---|
| 认领本线 / 看断点 | [`LINES.md`](LINES.md) | ≤150 行 |
| 第一次接手 | [`01-charter.md`](01-charter.md) | ≤200 行 |
| 开一轮活（设计律 + 纪律） | [`02-xinfa.md`](02-xinfa.md) | ≤300 行 |
| 接手现场（机器/工具/资产读数） | [`03-state.md`](03-state.md) | ≤200 行 |
| 搞清为什么这么定 | [`04-timeline.md`](04-timeline.md) | 按需 |
| 看还剩什么 | [`05-open.md`](05-open.md) | ≤200 行 |
| 做本线 | [`dossiers/defender3.md`](dossiers/defender3.md) | ≤200 行 |

## 四、四条硬规矩

1. **落盘先于压缩**：设计决策、数值表、判据先写进本目录，再压上下文。
2. **数值必须有出处**：要么来自原作表（写明表/字段），要么来自我方实测，要么明确标"待验证"。
3. **交接落仓库**：不落 `/tmp`；关键结论带日期与用户原话。
4. **收尾四件套**：`LINES.md` 本线行 → 本线 dossier → `03-state.md` 本线分节 → `05-open.md`。

## 五、上游资料（不在本仓，重读用）

| 资料 | 位置 | 说明 |
|---|---|---|
| 原作 APK | `~/re-targets/defender3/apk/defender3-2.7.1-base.apk` | sha256 `a958332c3b…`，55,005,460 B |
| 解包 | `~/re-targets/defender3/extracted/` | `assets/` + `lib/` |
| 数值表导出 | `~/re-targets/defender3/out/tables/*.tsv` | 67 表 / 5802 行，带中文列（`tools/extract_assets.py`） |
| 素材导出 | `~/re-targets/defender3/out/{images,atlas,animations,sounds}` | 1160 图 / 1010 帧 / 82 动画文件 / 58 音效 |
| 机制全景 | `~/re-targets/defender3/analysis/mechanics-inventory.md` | 15 节，本任务设计的原始依据 |
| 设计对照 | `~/re-targets/defender3/analysis/design-comparison.md` | 三支柱拆解 + 千星可行性 |
