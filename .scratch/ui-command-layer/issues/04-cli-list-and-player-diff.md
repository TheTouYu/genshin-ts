# 04 — CLI：语义化 List + 玩家改动识别 v1

**What to build:** `assets:ui list` 从「列出记录」升级到「回答玩家视角问题」：这张地图里玩家加了哪些按钮？每个按钮在哪个
布局/悬浮页、文本是什么、摆在哪、多大、几态素材？读命令只读不改图。另加玩家改动识别 v1：给定「上次快照/脚本产物」与
「玩家保存后」，输出差异报告——新增/删除的按钮、每个按钮改了哪些属性（位置/文本/颜色/尺寸/状态素材引用）。字节级核验：
对 01/02 留存真实样本回读断言 PASS（判别、属性提取、差异定位三项与人工差分结论一致）。

**Blocked by:** 03（并消费 01/02 的判别规则与细排特征）

**Status:** ready-for-agent

- [x] List 语义层：按钮/组件类型判别、布局与容器归属、属性摘要输出
- [x] 玩家改动识别 v1：快照对差异报告（新增/删除/属性变化，复用仓库 compare 工具思路）
- [x] 真实样本回读断言 PASS（与人工差分结论逐项一致）
- [x] 收轮三件套

## 轮次记录

- 2026-09-03 · 实现（ui/src 独立模块 + assets:ui 接线）：
  - 语义树/平面视图 buildSemanticView（类型注册表：谱系 f502 槽 + 内容组件 f505 + kind 常量 320001/330001；
    parent 上下文判别 member vs 独立控件；placement 表；几何/文本/队列/页签/素材属性提取 fail-closed unknown[]）
  - anchor save/list + diff --anchor（记录集 hash；JSON schema；重锚=同 path+kind 且 ID 换新；
    playerChanges 判定 = 布局/悬浮页实例侧 + 玩家可编辑字段；孤儿素材组仅报告）
  - 真实样本断言 9/9 PASS：轮4/19/26/29/51/54/64 判别/属性 + 轮13 玩家拖动 diff（仅 2032 geometry + playerChanges）
    + anchor 往返；`npm run build` PASS；CLI 冒烟 list/anchor/diff 只读（hash 不变）

## 轮次记录
