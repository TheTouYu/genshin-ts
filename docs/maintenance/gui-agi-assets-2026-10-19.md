# GUI AGI 资产盘点与关键决策（2026-10-19）

> 状态：**当前实现 + 实测读数**（截至 2026-10-19 03:0x）
> 用途：接手者只看这一份就能知道**有什么资产、为什么这么做、哪些路已经堵死**。
> 路线与愿景见 `.scratch/gui-stack/AGI-BAR.md §九`；票据看板 `.scratch/gui-stack/BOARD.md`。

## 一、资产清单

### 1.1 工具（`tools/`）

| 工具 | 作用 | 关键读数 / 用法 |
|---|---|---|
| `ys-editor/ys-capture` | 抓帧（常驻 + 单次） | 最新帧 **12–13ms**（内部 4–5ms）；`--source window` 能抓后台/最小化窗口（游戏最小化仍是活帧） |
| `ys-editor/ys_lookd.py` | 常驻感知服务 | `cmd=world/ocr/ocr_objects/ocr_blocks(实验)/ocr_plate(实验)`；OCR 冷 **333ms**、热 **15–45ms** |
| `ys-screen` | 容器/文本/角标检测 | `containers[]`（kind/skin/text/clipped）；`CONTAINER_RULESET=flatrect-v1` |
| `ys-snap` | 素材快收（薄客户端） | `--list / --snap --window <class\|idx:N> / --gui`；抓游戏走 KWin SS2（~540ms），非游戏 16ms |
| `ys-review` | 标注审阅页（只读点评） | 静态 HTML，悬停联动，导出 `feedback-*.json` |
| `ys-annotate` | 标注修复编辑器 | 层级配色、拖拽/缩放/新建/删除、**等距补全**、导出 `patch-*.json` |
| `ys-annotate-serve` | 自动保存服务 | `http://127.0.0.1:8765/`，页面改动 800ms 落盘到 `review/saved/` |
| `ys-annotate-apply` | 把人工补丁写回真值 | 删除/更新/新增 + 备份 + 写 `_human_edits` |
| `ys-gallery` | 全部标注总览页 | 缩略图+框+批次/族/kind 统计 |
| `ys-coverage` / `ys-gates` | 覆盖率记分 / 五门槛验收 | 见各工具头注 |

### 1.2 语料与数据

| 资产 | 规模 | 说明 |
|---|---|---|
| `.scratch/gui-corpus/truth*/` | **44 帧 / 1664 实例**（8 类） | v1–v8；v8 是"按技能+规则系统标注"的版本 |
| 质检报告 | A 15 / B 31 / C 5 → C 已剔 | `.scratch/gui-corpus/quality-report.md` |
| `.scratch/gui-corpus/inbox/raw` | 91 张连拍（52 个界面） | 用户用 ys-snap 采集 |
| `~/Pictures` 历史截图 | 275 张（已入 inbox） | 待分族 |
| `.scratch/gui-detect/dataset` | COCO 风格 `annotations.json` | 按界面族切分；`has_region` 标记 |
| `.scratch/gui-detect/train-v4` | 训练中 | CenterNet-lite，val 0.29–0.36 |
| `.scratch/gui-corpus/video-20261018/` | **559 帧 / 110 代表帧**（用户录的 9 分钟操作视频，1fps） | 前段原神本体、中段千星编辑器（用户口述，实测编辑器占 ~24% 去重界面） |
| `.scratch/gui-corpus/inbox/` | 91 张连拍（52 个界面）+ 275 张历史截图 | 由 `ys-snap` / `gui-frames-ingest.py` 收入 |
| 采集工作流约定 | GSR 快捷键 → `~/Pictures/Screenshot_*.jpg`；`ys-snap` 弹窗 → `inbox/raw/`；两者都按 sha256 去重 | 用户 2026-10-18 定 |

### 1.3 技能与文档

| 资产 | 位置 |
|---|---|
| 标注技能（切块法 + R1–R10 + 三类 bbox 陷阱） | `.agents/skills/gui-annotation/SKILL.md` |
| AGI 基准与路线 | `.scratch/gui-stack/AGI-BAR.md`（§九 为最新路线） |
| 世界状态服务设计 | `docs/architecture/gui-world-state.md` |
| 需求/现状/复盘 | `docs/maintenance/design-2026-10-18-gui-agi-system.md`、`design-2026-10-18-gui-structure.md`、`retrospective-2026-10-18-gui-structure.md` |
| 本盘点 | 本文件 |

## 二、关键决策（时间序，含理由）

| # | 决策 | 理由 / 证据 |
|---|---|---|
| 1 | **形态 A**：常驻世界状态服务 + 单 schema + 三动词（look/act/wait_until） | 用户裁决；旧工具退化为内部实现 |
| 2 | **抓帧改常驻 XShm + /dev/shm 环** | 1493ms → 13ms；瓶颈是进程启动+PNG 编码，不是抓屏 |
| 3 | **禁止对游戏窗口持续抓帧** | 10fps 抓 15 分钟（≈9000 次）把 DXVK presentation 拖死（GPU 0%、画面冻结） |
| 4 | **归属权威 = KWin** | EWMH `_NET_WM_DESKTOP` 报 0 而 KWin 报 desktop 3，按 EWMH 判会 fail-open |
| 5 | **后台帧必须显式声明** | 否则上层以为拿的是可见画面（票 34 同类风险）；改后 exit 12 + 不落像素 |
| 6 | **OCR 主路径 = 按对象 + 帧缓存** | 冷 333ms / 热 15–45ms；全帧 371–630ms |
| 7 | **rec batch 8→16** | rec 190.8→143.2ms，召回不变，显存峰值 4545/6144 |
| 8 | **多帧共识底板**（用户方案） | 同页微变 **96ms**；动态像素仅 0.03–1%；需页面覆盖与一致性闸门 |
| 9 | **标注按切块法 + R1–R10** | r003 切块法 vs 老师版 IoU≥0.5 匹配 40/44=91% |
| 10 | **质检分级 A/B/C，C 剔除** | 质量差会起负作用；C 5 帧剔除后 43→44 帧 |
| 11 | **生成器加覆盖守卫** | `truth/_build_truth.py` 重生成会抹掉人工修复（已加 SKIP，需 --force） |
| 12 | **训练损失改 BCE + pos_weight=200** | CenterNet focal 在小数据上被背景淹没（heatmax 0.98→0.23），换后 0.97 |

## 三、已证伪路线（别重走）

| 路线 | 结论 | 证据 |
|---|---|---|
| spectacle / grim / import 抓帧 | 慢且会抓错窗口 | 546–1493ms；grim rc=0 但无输出 |
| 网格块差量 OCR | 不成立 | 真实小变化散布 3–9 块；召回崩到 71% |
| 单帧基线差量 OCR | 不成立 | 动画抖动使大部分框"变了" |
| ROI det（只跑内容区） | 无收益 | 对象框并集占屏 100%（编辑器满屏） |
| rec 按行宽分桶 | 默认关 | 召回 min 94.06→91.51%；RapidOCR 内部已排序 |
| det 降分辨率提速 | 不可用 | 1600→95.8%、1280→84% 召回 |
| 端到端"一次做完分层+关系" | 现在不做 | 关系标注成本 3–5 倍，且失败不可归因 |

## 四、文档更新清单（本轮已做 / 待做）

已更新：
- `.scratch/gui-stack/AGI-BAR.md` §九（愿景 + D1–D7/E/F 路线 + 四条硬证据 + 反馈轮）
- `.scratch/gui-stack/BOARD.md` 当前前沿
- 本文件

待更新（下一轮）：
- `docs/architecture/gui-world-state.md`：补 OCR 三段读数（冷/热/底板）与 `ocr_plate` 实验命令
- `docs/maintenance/design-2026-10-18-gui-agi-system.md` §9：指向 AGI-BAR §九（避免两处口径）
- `.scratch/gui-corpus/README.md`：帧数从"约 48"更正为 44（QC 勘误）

## 五、未决事项（需要人拍板）

1. **D3 结构层 vs D4 状态层**谁先做（用户操作编辑器时更缺哪个）；
2. `card`/`avatar` 样本极少（53/14），是否先用几何兜底、不硬训；
3. 每页 5–10 帧补采（20 页 ≈ 3 分钟）以建满底板；
4. 训练到多少类召回才进真机闭环（阈值待定）。


## 六、用户诉求与约束（逐条核对，★=未满足）

> 由 `ys-memcheck` 抽本会话 47 条真实用户消息逐条判。**数字好补、指路难补**——用户的指路与未答诉求单列在此。

### 6.1 已满足（有落盘证据）

| 用户原话（节选） | 落点 |
|---|---|
| "我们是基于通用的模型+我们自己的数据微调对吗？" | 愿景 §9.2：预训练底座 + 少量微调补短板 |
| "我刚刚录制了操作视频…提供给你" | 559 帧视频语料已抽帧、去重为 110 代表界面 |
| "推荐创建队友来专门优化"（OCR/抓帧） | 已建 perf / perception / orchestrator 三条队友线 |
| "抓后台画面这个能力是需要的" | `ys-capture --source window`（XShm 打在窗口上 + KWin 兜底） |
| "为什么不一次性把分层和元素关系一次都做了" | 决策：先分层做（关系标注 3–5 倍成本、失败不可归因），路线 D3 |
| "app 只需要负责绑定按键+选择窗口就行了" | `ys-snap` 薄客户端设计（抓帧归抓帧层） |
| "不同层级做颜色区分 / 大层级移动 / 缺失新建 / 列表补一部分剩下的代理外推" | `ys-annotate` 层级配色 + 拖拽新建 + 等距补全 + 补丁-apply 闭环 |
| "把图片按照大致的对象切分…最后汇总回来微调" | 切块标注法（写进 `gui-annotation` 技能；r003 91% 匹配） |
| "额外交付一个技能出来" | `.agents/skills/gui-annotation/SKILL.md` |
| "我希望编辑器至少要有30%的标注数据" | 现 **36%**（11 帧 / 510 实例） |
| "写个网页，给我看一下现在全部的标注情况" | `tools/ys-gallery` + `http://127.0.0.1:8765/gallery.html` |
| "派遣多个代理，严格按照标准来标注，可以加载那个技能" | 三个代理按 `gui-annotation` 重标/返工（16 帧 B→A、6+6 帧重标） |
| "都话这么时间打分了…让它们顺手修复到A级" | 已改派修复任务，三批全部 A 级 |
| "gpu现在可以把资源全部释放出来给我用" / "本地嵌入服务停了也有远端兜底" | 已停 `ys-lookd`、`cd-exp/gpu`、`dsh-embed` → 空闲 **5685 MiB** |
| "让它训练，我们来巩固路线图和 agi 愿景" | `AGI-BAR.md §九` + 本文件 |
| "不要扫盘…用日志证明" | 工具诊断改走 journal/日志（不再全盘 find） |

### 6.2 ★ 未满足（需要裁决或后续补）

| 用户原话（逐字） | 状态 | 说明 |
|---|---|---|
| **"代理模型用d1的deepseek 思考max"** | ★ 未满足 | 本会话子代理只暴露 `deepseek-official/deepseek-flash`（已用 `reasoning_effort=max`）与 `zai-coding-cn/glm-5.3`；**没有 D1 路由**。要用 D1 需先在配置里注册 |
| "同一页面的连续帧不够。这个不是必须，应该之后可以让代理自己基于我们的gui 的agi实现模型，去做这个事情" | 记为**不做前置条件** | 当前不补采；后续由 GUI AGI 自己做采集/建底板 |
| "全部的大页面，不会超过20" | 待验证 | 目前只采到 52 个去重界面；"≤20 个大页面"这一说法尚未用完整语料核对 |

### 6.3 用户给的硬约束（写进判据，别忘）

1. **标注质量优先于数量**：质量差会起负作用 ⇒ A/B/C 分级、C 剔除、A 级才进训练集；
2. **编辑器占比 ≥30%**：现 36%，不再补采也达标；
3. **训练可用全部 GPU**：原神可关、嵌入服务可停（有远端兜底）；
4. **工具设计**：素材工具只做"选窗口+触发+落盘"，**抓帧归抓帧层**；
5. **反馈轮**：难/不确定的点停下来把用户引入，不要自己拍板。

## 七、教训清单（本轮踩过，写下来防复发）

| 教训 | 证据 |
|---|---|
| 前端页面必须验证"浏览器能加载"，不是"文件存在" | 黑图两次：一次 `file://` 用相对路径、一次 http 页面读 `file://` 被浏览器拦 |
| 关键词分类不可靠 | 用"设置/编辑器"关键词判族，把编辑器帧全判成游戏；真相是编辑器占 24% |
| 看到指标不动先做 overfit 测试 | 训练 val=0 三轮，根因是 focal loss 被背景淹没，不是数据/切分 |
| 生成器与人手修复并存 → 必须加覆盖守卫 | `truth/_build_truth.py` 重生成会抹掉 22 个区域框 |
| 「常驻」≠「已热」 | lookd 重启后首个 OCR 5.998s；预热后 596ms |
| 持续抓帧会拖死游戏 | 10fps×15min≈9000 次 → GPU 0%、画面冻结 |
| 不要把"上限"降级成"下限" | 早期把"≤200ms"当"够用"，被用户点破 |
