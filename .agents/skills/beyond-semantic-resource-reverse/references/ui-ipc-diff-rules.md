# UI IPC 逐帧 diff：路径 → 语义动作规则表（票04 Round 3 · 差分体系第 1 轮收轮）

> 状态标签：**单样本 OBSERVED**（map 1073741918，evidence/2026-09-05-ui-probe）· 跨地图待复验
> 机器可读版（同内容）：`resources/ui_ipc_diff_rules.json`
> 数据来源：`ui_probe.frame-diff.json`（v1.1，change 带字段号链）+ `ui_probe.generic.json`（IPC 目录）
> + after `1073741918.gil` root9（名称表 `resources/ui_instance_name_table.json`）
> 规则写入纪律：每条附 路径特征/链式签名 / UI 规律依据（文档节·轮次）/ 验证样本 / 置信度；
> 无样本形态一律 `needs-sample`，不写成已确认规则。

## 可复现命令

```bash
# 差分重放（缓存帧 → frame-diff；v1.1 起 change 附带字段号链 chain，格式 [fa,fb,idx] 逐消息层）
python3 .agents/skills/beyond-semantic-resource-reverse/scripts/diff_type1017_frames.py \
  .scratch/beyond-semantic-resources/evidence/2026-09-05-ui-probe/ipc/ui_probe_1017 \
  --output .scratch/beyond-semantic-resources/evidence/2026-09-05-ui-probe/ipc/ui_probe.frame-diff.json

# 名称表（GIL root9 记录 id/name/types/parent/size；名称走严格 raw wire 切片）
python3 .agents/skills/beyond-semantic-resource-reverse/scripts/build_ui_instance_name_table.py \
  .scratch/beyond-semantic-resources/evidence/2026-09-05-ui-probe/after/1073741918.gil \
  --output resources/ui_instance_name_table.json

# 语义注释（不带 --names/--rules = v1 基线回归模式）
python3 .agents/skills/beyond-semantic-resource-reverse/scripts/annotate_frame_diff.py \
  --diff .scratch/beyond-semantic-resources/evidence/2026-09-05-ui-probe/ipc/ui_probe.frame-diff.json \
  --catalog .scratch/beyond-semantic-resources/evidence/2026-09-05-ui-probe/ipc/ui_probe.generic.json \
  --names resources/ui_instance_name_table.json \
  --rules resources/ui_ipc_diff_rules.json \
  --output .scratch/beyond-semantic-resources/evidence/2026-09-05-ui-probe/ipc/ui_steps.md
```

## 规则行（与 JSON 账本逐行对应）

| id | 路径特征 / 链式签名 | 变化形态 | 语义动作 | UI 规律依据（节/轮次） | 样本 | 置信度 |
| --- | --- | --- | --- | --- | --- | --- |
| r-ui-role-header | 任意（变更组标题）；id → 名称/角色 | 标题 | `## id 名称`（角色→GIL 名→IPC 名→`<id>`） | ui-controls.md root9 三段；wire-inspect parseRec（f501/f504/f505→f12→f501） | 1841/1939 双源无存储名 | OBSERVED |
| r-ui-mem-append | 布局/容器角色（1825/1840/1845）；链签名 `f17#1→f1→f503#3` | CHANGE，f503 packed varint 差集（old 为 new 前缀） | `{role} f503 成员追加: +{id(名称)}` | ui/mappings.md §1；editor skill ref「布局引用规律」L35-44；ui-probe PROGRESS 语义对齐实验 | 35 个成员链叶子（2026-09-05 重放），32 前缀追加可解码：1840 017→019 `+1877(图片)`、019→021 `+1879(界面动效)`；1845 000→001 `+1860(文本框)` | OBSERVED（单样本地图；role 门控） |
| r-ui-mem-remove | 同上链签名；new 为 old 前缀（尾部收缩） | CHANGE | `{role} f503 成员移除: -{id(名称)}` | ui/mappings.md §6 删除清理 | 无 | needs-sample |
| r-ui-mem-replace | 同上链签名；非追加/移除重写 | CHANGE | 前后差异明细 | — | 无 | needs-sample |
| r-ui-text-name | IPC 文本叶子（链含 f505→f12→f501 型） | CHANGE str↔str/var/bytes | 待定（对照 t25/type45 f19 知识后闭合） | ui/mappings.md §0；editor skill ref t25.f19（轮6/20/54/59） | 无 | needs-sample（字段级链需单操作差分） |
| r-ui-img-source | f505[f502=38] 图片源区 | CHANGE | 待定 | docs/game-engine-knowledge/ui-controls.md 图片源引用 wire 路径 | 无 | needs-sample |

## 2026-09-05 实测量化（Round 3 收轮）

- 全量叶子 3188：CHANGE 2540 / REMOVE 369 / ADD 279；**71% 含 mix 错位步**
  （两侧字段号不同 = 前位插入/结构重排）→ 位置路径不可靠的量化证据。
- ui_steps：位置路径 raw 行 **801 → 0**（回退行全部输出字段号链面包屑）；
  无名资产标题 9 → 2；成员追加语义化 0 → 32 行。
- 名称表：命名 93 → **124/133**（修复 parse_message 把可伪解析文本如 '图片' 误判为 msg 子树的缺陷；
  与 `wire-inspect.ts --list --json` 归一化比较 **0 差异**）；真无名 9 条。

## counter-example（门控必要性）

资产 **1841** 的叶子链同为 `f17→f1→f503#3` 但**不是**成员列表语义
（其 f503 packed 内容 msg↔bytes 翻转/整体重写，非布局成员追加）。
⇒ 链签名不能单独判义，必须与资产角色门控（KNOWN_ROLES 1825/1840/1845）组合。

## open-items（fail-closed）

- 剩余叶子按链签名分 **376 类**；字段级动作（名称/文本/几何/素材引用/显隐/状态块）需对每个
  控件类型做编辑器单操作差分后逐链闭合（1875/1877/1881 等现成样本资产）。
- 模板-实例绑定（type3.f13 / type4.f14）与同步广播形态：ui-controls.md 已文档闭合（轮5/23/63 等），
  本 probe 无对应操作样本 → 待“模板化/同步”探针后补行。
- 1841 的 f505 槽 ADD/REMOVE 大重排语义未解（369 REMOVE/279 ADD 主体）。
- 1841/1939 等无存储名资产若编辑器有显示名，来源待查官方模板/TextMap 族。
- 本表样本全部来自单次探针；跨地图/跨版本复验前不扩大适用范围。
