# 语义资源管线（Semantic Resource Pipeline）规划

> 状态：当前规划（2026-09-04 用户定调，尚未执行）
> 来源：2026-09-04 探索——`.mihoyobin` 容器破解 + 多语言 TextMap 发现 + 编译器现有接入链路分析
> 适用范围：Beyond 编辑器/主游戏的“数字 ID → 语义名/配置”官方资源表

## 问题与背景

- GIL/GIA wire 只存数字 ID；官方语义名在编辑器/游戏本地资源表，按语言分表（用户定论：
  为减少文件体积、便于网络传输，wire 不含名字）。
- 已破解：`.mihoyobin` = 逐字节 XOR 0xE5 + protobuf；`TextMap` / `Node` / `BeyondGlobal`
  三类可解（格式 Authority：`beyond-editor-semantics.md`）。
- 现有接入已覆盖“节点/枚举域”：extract → `resources/mihoyo_editor_names.json` →
  `src/definitions/`、`zh_aliases`、客户端模块生成（799 节点/102 枚举）。
- **冰山判断**：状态/效果配置目录只是第一个未解析域；其他模块很可能也有类似资源表
  （技能、UI、玩法配置等），只是尚未发现/解析/编译。

## 目标

建一条可复用管线：**发现（Discover）→ 解码（Decode）→ 接入（Integrate）**，
把官方多语言语义资源成建制变成可机读、可检索、可编译的知识层，替代“逐条差分 + 口口相传”。

## 三阶段

### 1. Discover（发现层）
- 盘点 `BeyondAssistEditor/Resource/Json/` 全部表族；有界扫描主游戏数据中的 Beyond/UGC 表。
- 判断每张表属于：`哈希→多语言文案`（TextMap 类）还是 `ID→配置`（配置目录类）。
- 产物：**语义资源表地图**（inventory 文档 + 看板资产速查）。

### 2. Decode（解码层）
- 把 XOR+protobuf 通用解码器资产化（不再每脚本抄一遍），支持新表族快速接入。
- 每表族登记 protobuf schema/结构速查 + source SHA。
- 产物：统一语义 JSON（沿用 `mihoyo_editor_names.json` 规范：`encoding`/source 哈希）。

### 3. Integrate（接入层）
- 节点/枚举名 → `src/definitions/` + `zh_aliases`（已有链路，继续）。
- 配置目录 → 常量表/类型补全（例：`unitStatusConfigId` 从裸 `ConfigIdValue` 升级为可补全枚举）。
- 检索入口 `lookup-node` → 接入 `dsl-nodegraph-development` 技能（AI 写节点先查再用）。
- 能力矩阵：编辑器有 / DSL 已暴露 / 缺失，全覆盖登记。

## 当前已知表族盘点

| 表族 | 路径 | 状态 | 覆盖域 |
| --- | --- | --- | --- |
| TextMap | `Resource/Json/TextMap/<语言>/*.mihoyobin` | ✅ 可解（CHS 7743 条） | 节点/pin/枚举/UI 文案（**非效果配置名**） |
| Node | `Resource/Json/Beyond/Node/*.mihoyobin` | ✅ 可解（799） | 节点定义（genericId/pins/名 hash） |
| BeyondGlobal | `Resource/Json/Beyond/BeyondGlobal/*.mihoyobin` | ✅ 可解 | 枚举（102，含 Skill Slot 等） |
| Config/JsonConfig | `ShortCutKey` / `SynonymsLibrary` | 🔶 未深入 | 快捷键/同义词？ |
| assets.bin | `Resource/BeyondAssets/assets.bin` | 🔒 ZIP + 加密内层 | 未知（编辑器剩余资源候选） |
| 主游戏数据 | `YuanShen_Data/StreamingAssets/*.blk` | ❌ 未挖 | 效果/配置目录候选（票 01） |

## 票映射（工程推进入口 `.scratch/beyond-semantic-resources/BOARD.md`）

| 票 | 名称 | 阶段 |
| --- | --- | --- |
| 01 | 定位并解析状态效果语义目录源 | Decode 试点 |
| 02 | lookup 检索工具 + DSL 技能接入 | Integrate 试点 |
| 03 | 语义资源表地图盘点 | Discover 起点 |

## 关联

- `beyond-editor-semantics.md`：格式 Authority（本规划的执行细节归它或对应表族文档）。
- `unit-status.md`：wire 侧 ID 语义（效果 ID 1720001 等）。
- `dsl-nodegraph-development` 技能：检索接入点（票 02）。
- `resources/mihoyo_editor_names.json`、`node_definitions.json`：已解析语料。
