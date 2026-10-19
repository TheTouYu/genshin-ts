# ys-docops —— 千星编辑器操作面「分母 A（文档面）」抽取器

把官方文档机器解析成**操作点清单**，供覆盖率分母使用。只读 `docs/`，只写
`.scratch/gui-stack/ops-inventory-doc.tsv` 与 `.scratch/gui-stack/OPS-INVENTORY-DOC.md`。

设计契约：`.scratch/gui-stack/EDITOR-COVERAGE-PLAN.md`（「一、什么叫一个操作点」「二、分母从哪来」）。

## 用法

```bash
python3 tools/ys-docops/ys_docops.py extract              # 写 ops-inventory-doc.tsv
python3 tools/ys-docops/ys_docops.py report               # 写 OPS-INVENTORY-DOC.md（统计+规则+证伪）
python3 tools/ys-docops/ys_docops.py check                # 自检（列数/id 连续/行号范围/重复键）
python3 tools/ys-docops/ys_docops.py stats                # 终端看分布
python3 tools/ys-docops/ys_docops.py trace D042           # 看某条由哪条规则、原文哪一行产出
python3 tools/ys-docops/ys_docops.py extract --include-ui-widgets   # 额外把 19 种界面控件的属性面板计入
```

纯标准库，无第三方依赖；一次运行约 0.2s。

## 输入（三个源，边界不同）

| 源 | 取的范围 |
|---|---|
| `docs/ui-tutorial/official-guide-editor-interface.md` | 全篇（主源，2576 行） |
| `docs/ui-tutorial/official-guide-auxiliary-appendix.md` | 只取编辑器面板相关章节：负载计算/风险检查/节点图变量/复合节点/节点图日志×3/信号 |
| `docs/ui-tutorial/official-ui-tutorial.md` | 只取界面控件组管理/界面布局/界面控件组/界面控件（完整）——**不取** 19 种控件详解（被 authored 的对象，不是编辑器控件） |

## 输出

`ops-inventory-doc.tsv`，TSV，首行表头：`id  path  control  action  kind  doc_ref  note`

- `id`：`D001` 起（D=document 通道，与爬取通道 C 分开）
- `path`：界面路径，由标题栈生成（丢弃文档大标题与「功能简介/操作流程」这类纯容器标题），最多 3 段
- `action`：`click|toggle|set|drag|scroll|shortcut`
- `kind`：`nav|setting|create|destructive|scene`
- `doc_ref`：`文件名:行号`，行号指向产出该条的那一行原文
- `note`：口径说明；`待界面确认` = 文档写法看不出是否真可交互，保留待对账

## 抽取规则（R1–R11，代码里逐条有名字）

| 规则 | 判据 |
|---|---|
| R1-bullet-kv / R1-paren / R1-bullet-title | 项目符号块：`控件：说明` / `控件（点击按钮…）- 说明` / 短标题+后文 |
| R2-plain-kv / R2-italic | 无符号的 `控件：说明` 行、`_控件_：说明`（快捷设置与属性面板的主要写法） |
| R3-bracket | 正文 `【按钮名】` |
| R4-prose-noun / R4-prose-verb | 散文「点击 XX 按钮/开关/页签/图标」「点击XX可…」 |
| R5-shortcut | 快捷键叙述（Ctrl+/ESC/Delete/空格/鼠标键） |
| R6-bold | 辅源用 `**粗体**` 标的界面元素 |
| R7-table-config / R7-table-key | `配置参数\|说明` 表行；`动作\|按键` 表行 |
| R8-nav-path | `系统菜单——X` / `右键菜单 → X` 这类导航叙述 |
| R9-heading | 标题即控件（详情面板属性卡、关卡设置设置项） |
| R11-list | 顿号并列枚举拆点（系统菜单 30+ 项就是这样拿到的） |

**不是控件**：`功能/打开方式/操作逻辑/使用条件/注意事项` 这类叙述元信息键（`META_KEYS`）；
含 `的/了/是/为/并/包含/如下/主要功能/可以/然后/直接` 等叙述标记的候选；`[图]`、视频播放器噪声、
文档头信息。全部在 `looks_like_control()` 里，改它就是改分母。

## 人工裁量（要改分母就改这些表，不要手改 TSV）

| 表 | 作用 |
|---|---|
| `curated_extra()` | 规则识别不到但判定是操作点的补充（顶栏图标、模式页签、散文里的按钮…），每条带 `doc_ref` |
| `EXCLUDE_CONTROLS` / `EXCLUDE_RE` | 规则命中但不是操作点（对象名词、节点引脚、举例、叙述句） |
| `RENAME` | 同义控件归并（`菜单图标`→`系统菜单图标`…） |
| `KIND_OVERRIDE` | 少数控件的 kind 词面分类会误导（`试玩`=nav 不是 setting） |
| `EXCLUDE_SECTIONS` | 整节排除（界面规范参考/锚点建议/手柄设计示例等设计建议章节） |

去重键 = `(源, path, control, action)`；同路径同动作下「X按钮 / X」只留一条；
人工补充与规则条目同义时，规则的**确定**条目胜出，规则的「待界面确认」条目让位给人工条目。

## 验证

```bash
python3 tools/ys-docops/ys_docops.py check    # exit 0 才算通过
```

`check` 校验：TSV 行数 = 抽取结果、列数 7、`id` 连续、`action`/`kind` 取值合法、
`doc_ref` 文件在源清单内且行号不越界、无重复键。

## 边界（写报告时要照抄）

- A 通道只回答「官方文档写了哪些可独立触发的交互元素」。**文档没写 ≠ 界面上没有**。
- 文档里的 `[图]` 占位处，控件名只在截图里 → A 通道补不了，靠 B 通道（爬取面）。
- 快捷键是同一控件的另一个入口，本清单按「可观测差异不同」单独计点；口径变化时要合并。
