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

## 产物提交

- `ui_probe.generic.json`
- `ui_probe.hablp-summary.json`
- `ui_probe.report.md`
