# uncertainty[] —— 感知层输出"我拿不准的地方"（2026-10-19）

> 用户裁定（AGI 判据）：**AGI 的门槛不是"什么都能识别"，而是"知道自己的把握度，并在把握度不够时主动获取信息"。**
> 现状问题：所有输出都是确定的——`clickable: unknown` 是占位符不是不确定性；`containers=0` 也不报警。
> **不知道自己不知道 ⇒ 永远不会主动去看 ⇒ 只能事后发现错。**

## 一 接口（新增字段，不动现有字段）

```json
"uncertainty": [{"region":[x,y,w,h], "kind":"possible_miss|possible_false_positive|ambiguous_kind",
                 "score":0.0..1.0, "reasons":[...], "hint":"一句话"}]
```
全部**单帧可算**（模块是单帧的，未引入任何时序判据）。

## 二 三条生成规则与公式（写死在 `tools/ys-screen`）

### 规则① `possible_miss`
输入：未被无底图标通道接住的 `free_glyph`，且**最短边 ≥20px**（小到 20px 以下基本是纹理噪声）。
```
score = 0.20 + 0.35*min(1, 最短边/80) + 0.25*min(1, contrast/120)      ∈ [0.20, 0.80]
reasons: below_size_gate（未过 80×52）/ no_text / low_flatness / clipped_edge(距边<340 时)
```

### 规则② `possible_false_positive`
输入：已提升的 `glyph_icon`；**仅在 HUD 类画面启用**（判据：该帧"规整平坦矩形(rect≥0.8)数量 <4"——
菜单 19 个 tile 属界面类，世界 HUD 只有 2 个不规则雪块属 HUD 类）。
```
条件：中心距最近画面边 > 200px
score = 0.85 + 0.15*min(1, 距离/800)                                   ∈ [0.85, 1.00]
reasons: background_like
```
**两段分数区间不重叠**（miss ≤0.80 < fp ≥0.85）——排序恒为"已输出但可疑"优先于"可能漏了"，
这样排序判据不依赖两个框是否重叠。

### 规则③ `ambiguous_kind`
输入：`kind == 'unknown'` 的容器。`score = 0.5`，`reasons: ['unknown_kind']`。

### 校准披露（如实）
- 边缘阈值最初按经验取 **340px**，实测真图标"距边"最大 **169px**、背景最小 **253px** ⇒ 改为 **200px**（两侧余量 31/53px）。
- 曾加"大面积(>4000) + 低填充(<0.55) ⇒ 背景"一条，实测**误伤 11 个真图标**（真图标 fill 也低，0.31~0.52）⇒ **已删**。
  这两条都是**在验收数据上调的**，写在这里避免被当成先验。

## 三 验收（两条，都给数字）

### A 排名测试（`world/w01` 的 30 个 glyph_icon：18 真 / 4 背景 / 2 框错 / 6 缺真值）
| 项 | 读数 |
|---|---|
| `possible_false_positive` 条数 | **4**（正好是那 4 个背景：`[1392,690,40,34] [1392,770,64,48] [1428,374,26,28] [1044,230,68,46]`） |
| 4 个背景的 score | 0.983 / 0.971 / 0.923 / 0.897（最低 **0.897**） |
| 18 个真命中的最高 score | **0.00**（无一被标） |
| 判据 | 背景最低 0.897 > 真命中最高 0.00 |
| **结果** | **PASS 4/4** |

### B 干净界面不误标（`menu/m01`，containers P=1.000）
| 项 | 读数 |
|---|---|
| `possible_false_positive` | **0** |
| `possible_miss` / `ambiguous_kind` | 0 / 1（左侧图标栏 `[0,0,120,1440]` 被记 unknown 容器） |
| **结果** | **PASS**（要求 =0） |

## 四 before / after 与 gates

| 项 | before（`_ys-screen.bak-*`） | after |
|---|---|---|
| menu containers / tiles / glyph_icons | 19 / 18 / 13 | **19 / 18 / 13（不变）** |
| world containers / glyph_icons | 2 / 30 | **2 / 30（不变）** |
| `uncertainty` | 无此字段 | menu 1 条 / world 6 条 |
| `tools/ys-gates --only 1` | — | **PASS**（`{"total":24,"negatives":8,"channels":{"full":100.0,"fast":100.0},"rc":0}`，exit 0） |

**`CONTAINER_RULESET` 未再 +1**：本次只加**派生输出字段**，`containers/glyph_icons` 两组输出逐项不变（19/13、2/30），
不改变任何检测判据 ⇒ 不需要让缓存失效。（若后续用 uncertainty 反改检测，则必须 +1。）

## 五 缓存白名单（上次踩过的同一个坑）
`containers_cached()` 的写盘白名单**已同步加入 `uncertainty`**；读盘命中条件也要求该键存在
（缺键视为 miss，避免旧缓存让新字段静默消失）。实测：连跑两次，第二次命中缓存仍带 `uncertainty`。

## 六 已知局限
- `possible_miss` 在 world 只有 **1 条**：因为 43 个 free_glyph 里绝大多数 <20px 或已被 glyph_icon 通道接住；
  这条通道主要价值在"大而无底的块"，不是"很多条提示"。
- 规则②的"HUD 类画面"判据（规整矩形 <4）是单帧近似：编辑器这类画面可能被误判成 hud 类（未测）。
- 背景过滤（glyph-v1 的 340px 硬编码）**未动**，等这个 score 接进过滤器后统一改。
