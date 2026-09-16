# 实验 struct16 — 结构体 wire 取证（票 16）

> 状态：⏸ **等用户编辑器变化**（基线已锁定 2026-09-16）
> 技能：`editor-incremental-gia-investigator`（快速启动流程）

## 恢复块（续作直接粘这一段）

```text
MAP=/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741918.gil
MAPID=1073741918           # 编辑器显示名「差分实验」
LOCKED_BEFORE=/home/h/genshin-ts/.scratch/editor-incremental-evidence/2026-09-16-struct16/before/1073741918.gil
LOCKED_HASH=3ce595fa9c3fbc98129a059552f24847e07c5ed991990e33ec2c615fa9933af6
EXPDIR=/home/h/genshin-ts/.scratch/editor-incremental-evidence/2026-09-16-struct16
```

## 为什么选这张图

`1073741918`「差分实验」是专用实验图（不做真实内容），且它的 before hash 正好等于上次
20005 差分的 after hash → **基线连续，没有中间态丢失**。不使用 `1073741921`「T12迷宫复现」，
避免污染复现工程。

## 为什么必须用户差分（已穷尽工件，不是偷懒）

按根 `AGENTS.md`「卡住三问」第①条先查存量，第③条看能否天然实验：

1. **权威文档自认缺口**：`docs/game-engine-knowledge/parameter-types.md:45-48` 逐字写着
   「未覆盖：**全部类型在 GIL 各作用域（关卡/元件/节点图变量）的逐个 wire 样本**」——
   类型码已知（25=struct / 26=struct_list，与 GIA proto VarType 逐值一致），
   但**该类型在 GIL 里的编码没有样本**。
2. **穷尽 40 张真实地图**：`assets:custom-variables --list` 与 `assets:level-variables --list`
   逐图扫描，**没有一张图存在 struct/struct_list 变量**。
3. → 无天然实验可做，只能请用户做一次 ≤2 分钟的最小差分。

## 本轮唯一变化（请用户执行）

**在编辑器里创建一个结构体**（高级数据管理 → 创建结构体），建议：
- 2 个成员，类型取 `int` + `str`（好认）
- 命名 `T16_probe`
- **只做这一件事就保存**

> 不要同一次同时加变量——`变量引用结构体定义` 的编码是**下一轮**的独立变化
> （技能纪律：默认每轮一个可唯一归因的变化）。

## 差分命令（用户说「好了」之后跑）

```bash
python .agents/skills/editor-incremental-gia-investigator/scripts/gil-quick-diff.py \
  $LOCKED_BEFORE $MAP --capture-dir $EXPDIR/raw --snap struct-def-v1
```

## 本轮目标字段（差分后定点看这些）

- 结构体**定义**落在哪个 root？（候选：新 root 或多 root 同步）
- 成员（名称/类型码/默认值）怎么编码？
- 结构体的 **id 空间**是什么？（自定义元件是 ≥1077936129；结构体待测）
- 是否同步登记到某个 registry？

## 下一轮（本轮闭合后再发指令）

给某实体加一个**该结构体类型的自定义变量**（命名 `T16_struct_probe`）→
闭合「变量如何引用结构体定义」。
