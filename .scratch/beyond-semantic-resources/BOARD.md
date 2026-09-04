# Beyond 语义资源 · 推进看板（beyond-semantic-resources）

> **工程推进唯一入口**：新会话先读本板 → 找「当前前沿」→ 读 `issues/` 对应票文件干活。
> 规则：一票一文件；完成 = 勾 checkbox + 票移入已完成划掉区 + 记轮次 + 精确 commit；禁止板外另立进度。
> 目标（2026-09-04 用户定调）：**打通「GIL 数字 ID → 语义名」的机器可读解析通道**——
> 已发现 `.mihoyobin` = XOR 0xE5 + protobuf，但状态/效果名目录源尚未定位。用工程化票据推进，
> 不再靠口口相传。

## 资产速查

- 知识 Authority：`docs/game-engine-knowledge/beyond-editor-semantics.md`
- 本地语义资源根（编辑器）：
  `/mnt/e/ys/Genshin Impact Game/BeyondAssets/BeyondAssistEditor/Resource/Json/`
  - `TextMap/<语言>/<hash>.mihoyobin`：每语言一个；CHS 实测 7743 条节点/枚举名，**不含状态效果名**
  - `Beyond/Node/<hash>.mihoyobin`：每节点一个（genericId=4.1.5；名 hash=206）
  - `Beyond/BeyondGlobal/<hash>.mihoyobin`：枚举容器
  - `Config/JsonConfig/`：ShortCutKey / SynonymsLibrary（未深入）
- 容器格式：`.mihoyobin` = 逐字节 XOR 0xE5 → protobuf。
  解析参照：`scripts/nodegraph/extract-mihoyo-editor-names.ts`（XOR_KEY=0xe5）
- 已知缺口：
  - 状态效果名（1720001=移动速率调整率（动态）/2110001=定时触发技能/2010001=造物不可见）
    不在编辑器 Json 树（CHS TextMap 0 命中）
  - `Resource/BeyondAssets/assets.bin` = ZIP，内层加密（密码未知）
  - 候选来源：① BeyondEditor.dll 反编译 ② 游戏主进程（YuanShen_Data/*.blk）③ assets.bin 内层
- GIL wire 侧 ID 语义：`docs/game-engine-knowledge/unit-status.md`

## 当前前沿

**→ 票 01 定位并解析状态效果语义目录源**（OPEN，可开工）。

## 票据清单

| # | 票名 | blocked by | 状态 |
| --- | --- | --- | --- |
| 01 | 定位并解析状态效果语义目录源 | None | OPEN |

## 已完成（划掉区）

- ~~**00 · 知识落盘 + 建票（票外，2026-09-04）**~~（`docs/game-engine-knowledge/beyond-editor-semantics.md` 落盘；
  知识书索引/关系图登记；本看板 + 票 01 建立；差分实验快照锁定 v21 不变）
