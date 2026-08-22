# 素材库（Library）注入 wire 规则速查

> 状态：已验证（真实 .gil 相邻快照差分，2026-08-22）
> 来源：`Beyond_Local_Save_Level/`（编辑器活动目录 `Temp/`）；快照序列
> before-init → after-save → after-lib1 → after-lib2 → 用户实验。
> 适用：`gsts image:*` 资产直接注入素材库；image_mode 形状→素材库资产映射见
> `src/image-editor/image_mode.ts`。
> 配套：本技能 SKILL.md「素材库注入差分实战（2026-08-22）」；
> 知识书章节 `docs/game-engine-knowledge/library-injection.md`。

## 骨架（一个素材库 = 1 顶层 container + 1 group + 每分类 1 copy）

- 顶层容器 `502.14{501 = 分类副本 ID}` ↔ 分类副本 `502.13{501 = 顶层容器 ID}`（互指）。
- 分类副本额外带 `504 = parent`。
- `503` raw = group ID 列表（packed varint，用 readVarint 流式读，不要用消息解析器）。
- 第二个素材库结构相同：root9 append num501 ID + 注册 + 8 个连续子资产（0x40000026 起）+ root46 噪声。

## 记录级规则

- num501 注册表含全部容器 ID（含分类链 1840/1841/1842），**非升序、非仅顶层**。
- root46 = 编辑器保存记录：新条目 PREPEND 到头部，满 4 条替换头部——**CLI 注入不得触碰**。
- `502{13}`：w0 裸 varint；`502{14}`：w2 包裹裸 varint（不对称，逐字节读）。
- 504/505 内部字段号 = 501/502；508 内部 = 3。
- 504/505 内浮点子字段 = wire5 fixed32（不是 wire2）。
- buildContainerRecord 需处理 502(42B) 内 `503{...504{4: self-ID}}` 自引用。

## 图元规则

- 元素位置 `f504` = (x, y)，画布原点在中心；编辑器 (100.0, 100.0) ↔ wire (0.0729, 0.0001) 逐字节验证。
- 形状类型 `505.31.503.31.2`；颜色 `505.31.503.31.4` = -65536（0xFFFF0000 红 ARGB，int32 有符号）。
- 形状号段 100001=矩形 … 100006=圆环（详见 image_mode.ts 映射表）。
- GIA wire 层：图像模式 class=15，装饰物模式 class=28。

## 命名

- 游戏对重名自动追加 `_1` 后缀（"20260821" → "20260821_1"）——注入时先查重避免冲突。

## 未闭合（OBSERVED，勿当规则用）

- 真实 .gil 素材段**记录顺序非升序**（新块在前、旧记录在后）——来源/结构待查，插入位置规则未定。
- 多分类素材库的完整"分类副本 ↔ 分组"关系（当前样本为单分类）。
- 素材库规则尚未入 PKC 知识树（knowledge/game-engine-knowledge/）。
