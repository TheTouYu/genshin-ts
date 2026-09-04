# UI 探针：UI 相关资产/控件 的 GIL/IPC 对照（2026-09-05）

## 操作

- 编辑器内执行 UI 相关变化（UI 控件/页面/布局等）。
- 地图：`1073741918.gil`

## 证据文件

- before：`.scratch/beyond-semantic-resources/evidence/2026-09-05-ui-probe/before/1073741918.gil`
  - SHA-256 `cb8fc7fc8eeecf9b8d9a51cbb626756e55e2e8e09370d06d9a27b2ef108d9933`
- after：`.scratch/beyond-semantic-resources/evidence/2026-09-05-ui-probe/after/1073741918.gil`
  - SHA-256 `2480480c24b6be053b2f88d2706b9da8084548b98ce4dba5032a79229b2efe27`
- pcap：`/mnt/c/beyond-ipc/ui_probe.pcap`（2.8MB）
- IPC：`ipc/ui_probe.generic.json` / `ipc/ui_probe.hablp-summary.json`

## GIL 差分

- root9：UI 记录 **22 → 135**（新增大量 UI 控件/页面/容器）
- root22：属性/组件登记新增多条（PropertyGadget/ModelDisplay/PropertyStat 等）
- root46：ID 登记变化
- 地图大小：`99781B → 167614B`（Δ+67833B）

## IPC 差分：UI 定义走 field17

- HAblp 类型：仅 `0 / 1016 / 1017`
- type1017：92 帧，available IDs 231，definitions 134
- **没有 field11 完整定义，也没有 field12 摘要**；
  UI 资产定义走 **field17**（对应 GIL root9 UI 记录形态）。

通用解析器已扩展支持 field17：

- `hasUi`：124/134 条定义为 UI
- `uiCount` 总 273（同一资产可在多个帧出现）
- 可提取名称：107 条有名字，例如：
  - 自定义布局 / 技能区 / 队伍信息 / 角色生命值条 / 摇杆
  - 文本框 / 图片 / 交互按钮 / 自定义开关 / 弹窗 / 悬浮交互页
  - 固有容器 / 交互页关闭按钮 / 单选项视窗 / 页签文本 / 页面容器 等

## 结论

1. **UI 资产在 type1017 中走 field17**，不是 field11/field12。
2. field17 结构直接对应 GIL root9 UI 记录，适合做 UI 资产 IPC ↔ GIL 交叉。
3. 通用解析器现在能识别 UI 定义并提取名称/数量；
   下一步可做 UI 记录级解析（f501 资产 ID、f502/f503/f505 布局/属性），
   并逐步支持 CLI 批量按 UI 类型创建/更新。

## 语义对齐实验（2026-09-05 后续）

- 结合 `ui-controls.md` / `ui/mappings.md` 已知规律，确认：
  - 资产 `1073741840` = **控件组容器（未入布局实例列表）**
  - 逐帧 diff 中高频路径 `[1][2][0][2][3][2]` = **容器 f503 packed 成员列表**
  - 每次“字节列表追加”解码为 varint 后 = 一个新 UI 实例 ID
- 示例帧序列解读：
  ```text
  container 1840 f503 追加 1073741877
  container 1840 f503 追加 1073741879(界面动效)
  container 1840 f503 追加 1073741881(全屏界面动效)
  ...
  ```
- 已把该规律写进 `annotate_frame_diff.py`：注释器现在能输出“控件组容器成员追加 + 名称”。
- 产出：`ui_steps.md`（自动语义步骤版）。

## 产物提交

- `ui_probe.generic.json`
- `ui_probe.hablp-summary.json`
- `ui_probe.report.md`

## 差分体系语义融合（票04 Round 3 收轮，2026-09-05）

目标：把“IPC 帧序列 + 已解析 UI 规律”融合为可复用差分体系（为 `assets:ui` 批量支持铺路）。

### 本轮回合产物（命令见 skill runbook §6）

| 资产 | 内容 | 验证 |
|---|---|---|
| `diff_type1017_frames.py` v1.1 | change 携带字段号链 chain（[fa,fb,idx] 逐消息层） | 资产 134/组 145 与 v1 一致；首叶链 [[17,17,1],[1,1,0],[503,503,3]] |
| `annotate_frame_diff.py` v2 | 默认模式=v1 逐字节；语义层=名称回填+成员追加解码+统计 | 基线 hash d9de9a99…回归 PASS ×2 |
| `build_ui_instance_name_table.py` | 名称改严格 raw wire 切片（修复 parse_message 宽松部分解析误判 '图片' 等文本为 msg） | 133 记录命名 93→124；与 wire-inspect.ts 归一化 0 差异 |
| `resources/ui_instance_name_table.json` | GIL root9 名称表（重生成） | 无名仅 9（1840/1841/1842/1896/1899/1957/1960/1962/1966） |
| `resources/ui_ipc_diff_rules.json` + skill references `ui-ipc-diff-rules.md` | 路径→动作规则账本 | r-ui-mem-append OBSERVED；其余 needs-sample |

### 量化对比（`ui_steps.baseline-v0.md` → `ui_steps.md`）

| 指标 | baseline | 语义版 |
|---|---|---|
| 位置路径 raw 叶子行 | 801 | **0**（回退行转字段号链面包屑） |
| 无名资产标题（资产去重） | 9 | 2（1841/1939：GIL+IPC 双源确无存储名） |
| 布局/容器 f503 成员追加（语义行） | 0 | 32 |
| 全量叶子 | — | 3188（CHANGE 2540/REMOVE 369/ADD 279）；71% 含 mix 错位步（结构重排信号） |

### 语义规则速记（本轮闭合）

- IPC UI 定义体 = **f17 → f1**（记录字段族 f501..f505）；成员列表 = **f503** packed bytes。
- 布局/容器成员追加链式签名 = `f17#1→f1→f503#3`，但**必须按角色门控**（1825/1840/1845）：
  1841 同链不同义（非成员语义），counter-example 实证。
- GIL root9 记录名位置 = `f505[f502=15].f12.f501`（type15 名称组件）；40 条“老解析无名”中 31 条
  是解析缺陷（漏名），真无名仅 9 条。

### open-items（fail-closed）

- 剩余叶子按链分 376 类；字段级动作（名称/文本/几何/素材引用/显隐）需编辑器单操作差分逐链闭合。
- 71% mix 步说明位置路径不可靠 → 下一轮先做“按字段号对齐后再 diff”消除重排噪音。
- 移除/替换/模板绑定/图片换源形态无样本；1841 的 f505 槽重排语义未解。

### 下一步

1. diff 改进：字段号对齐后再 diff（消除 71% mix 噪音），链式签名固化进规则 JSON。
2. 控件单操作差分（改名/字号/颜色/换图/几何）→ 闭合字段级链签名（1875/1877/1881 等现成样本资产）。
3. 官方技能/预制体/蓝图类 full field11 物化（票04 Round 2 遗留）。
