# AnimeGameData CN 7.0.0 语料切片

> 来源：`https://github.com/DimbreathBot/AnimeGameData`
> 提交：`26df1df CNRELWin7.0.0_R47482070_S47579390_D47579390`
> 由 `/tmp` 迁入仓库，作为票 01「Beyond 状态效果语义目录」研究的稳定参考语料。

## 内容

- `TextMapCHS.json`（47 MB，605,937 条）
  - 完整简体中文 TextMap：`hash(十进制字符串) -> 中文文案`
  - 已确认含 Beyond/千星相关文本，例如：
    - `1842178763` / `1272094579` -> 造物不可见
    - `3678006995` -> 定时触发技能
    - `1475323595` / `2039318347` -> 移动速度调整率（动态）【1720001 候选】
    - 大量「单位状态」「特殊功能」「监听移动速率」等 UI/规则文案
- `TextMapEN.json`（52 MB，585,531 条）
  - 完整英文 TextMap，用于票 01 的英文名
  - 已确认：Creation Invisible / Trigger Skill on Timer / Movement SPD Adjustment Rate (Dynamic)
- `ManualTextMapConfigData.json`（8.0 MB，40,468 条）
  - `textMapId -> textMapContentTextMapHash + paramTypes`
  - 含 `BeyondAssistantEditorConfigGlobal_*` 与 `BeyondEditorInstructionNodeConfig_*`
  - 可把编辑器符号名解析成 TextMap hash；但已知三个效果名（造物不可见等）**不在此表**
- `beyond_excel/`：AnimeGameData `ExcelBinOutput/Beyond*.json` 全量 106 个
- `beyond_candidates/`：上一轮人工筛出的候选（State/UgcBuff 等）

## 证据层级

- 结构层（脚本运行）：本目录 JSON 来自官方数据镜像，哈希与文件字节一致
- 语义层：`TextMapCHS` 能给出 hash→中文；`effectID→hash` 的桥仍未闭合

## 研究入口

- 用 `TextMapCHS.json` 验证任何候选 TextMapHash 的中文/英文名
- 用 `ManualTextMapConfigData.json` 解析编辑器符号名/参数占位符
- 用 `beyond_excel/` 排除 Beyond* Excel 表内直接含效果 ID 的可能（已 0 命中）
- 下一跳仍是当前游戏 `Blb\x03` 块内的效果配置表，或 AnimeGameData 中未命名/未列入 Beyond* 的表
