# 半自动标注流水线（票 23/24 的数据前置）

> 目标（Lead 2026-10-18 定）：**60–90s/帧**。手段：让 `tools/ys-screen` 预标，人只做**删/补/改边**。
> 工具：`.scratch/gui-corpus/tools/prelabel.py`（只读帧、不装包、不碰共享工具）。
> 真值口径：`../truth/_rules.md`；分数器：`tools/ys-coverage`。

## 为什么标注面是「行文本」而不是 GUI 编辑器

改 JSON 要处理括号/嵌套；看点图要鼠标点点。**行文本**是最便宜的修正面：

- 删对象 = 删一行（或行首加 `#`）
- 加对象 = 抄一行把 id 写 `new`（apply 时自动编号）
- 改框 = 改 4 个数字
- 改类别/文字 = 改对应字段
- 整份文件可 `diff`、可 `grep`、可脚本批量改（例如"所有 kind=row 且宽>1700 的改成 settings-row"）

## 四步

```bash
# ① 预标（每帧 ~2–4s；产出 .json / .lines.txt / .overlay.png）
python3 .scratch/gui-corpus/tools/prelabel.py frames <帧目录> \
        --out .scratch/gui-corpus/label --split-rows --glyphs

# ② 修正：看 <stem>.overlay.png（框上有编号）→ 改 <stem>.lines.txt（不是改 JSON）

# ③ 回写（校验 bbox/kind/越界，review 置 done）
python3 .scratch/gui-corpus/tools/prelabel.py apply \
        .scratch/gui-corpus/label/<stem>.lines.txt \
        --out .scratch/gui-corpus/label/<stem>.json --reviewed-by perception

# ④ 复核：schema → 记分器自证 → 用真值给任何检测器打分
python3 .scratch/gui-corpus/tools/prelabel.py check .scratch/gui-corpus/label
tools/ys-coverage --truth .scratch/gui-corpus/label --selftest
tools/ys-coverage --truth .scratch/gui-corpus/truth --pred <某检测器输出> --pred-format xywh
```

## 预标的四个候选源（决定了人工还剩多少活）

| 源 | 开关 | 覆盖什么 | 备注 |
|---|---|---|---|
| `containers[]` | 默认开 | 面板/格子/行/按钮 | cv 在**不透明纯色**界面最准（派蒙网格 19/19） |
| 多行块按 OCR 文本行拆行 | `--split-rows` | 被并成一块的 6 行列表 | 只在"高度 ≥ 2.2×文本行高"的多行块上拆，避免把设置行切碎 |
| **容器外文本行 → row** | `--no-loose-text` 关掉它 | 左导航 9 项、按钮、页签 | 设置页/存档页的召回主力（cv 在这两类页面上几乎全漏） |
| `free_glyphs[]` → icon | `--glyphs` | 头像、奖励图标、纯图标列 | 已过滤"贴文字/长宽比失衡/边长<28px"的碎片 |

另外自动丢掉**半屏以上**的大 blob（cv 在设置页的典型失败形态，`_rules.md` 里整屏底板永不算单元），
所以人工不需要去删那种"整屏当 panel"的假对象。

## 实测读数（2026-10-18，14 帧语料，cv 后端）

- 预标耗时：**14 帧 60.7s（含 overlay 渲染）= 4.3s/帧**（`evidence/prelabel-corpus14.log`）。
- 候选数：f00 35 / f01 37 / f02 37 / f03 27 / f04 34 / f05 39 / f06 49 / f07 48 / f08 50 /
  f09 30 / f10 29 / f11 33 / f12 21 / f13 37。
- **预标召回（对 `truth/`，IoU≥0.5）= 40.7%（94/231）**，同批假候选 325 个
  （`label/_recall.json`）⇒ 人工每帧大致"删 20 个、补 3–5 个、改几个 kind"。
- 估算人工：按每个判定 ~1.5–2s + 整体复核 20s ⇒ **55–90s/帧**，与 60–90s 目标同量级；
  **但这是估算，没有真人计时**（登记为未闭合项）。

## 已知未闭合（别当成已解决）

1. **没有真人计时**：60–90s/帧目前是"候选数 × 单点判定耗时"的推算。
2. **小图标/头像的召回靠 glyph，噪声也来自 glyph**：装饰光效会被当候选（人工删）。
3. **`kind` 不做语义识别**：`卡内"…"`、`输入探针卡` 这类需要人判；apply 只校验合法值。
4. **裁切行**：`split-rows` 只拆"能看见的文本行"，被切掉一半的行要靠 `clipped` 字段补（人工写）。
5. **无人值守跑批时的 fail-closed**：`ys-screen` 退出码非 0 时本工具整体退出 4，不产半成品。
