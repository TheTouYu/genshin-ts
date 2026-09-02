# ui/ HANDOFF — 票 03 → 票 04（2026-09-03）

> 目的：冻结票 03 设计，为票 04（语义化 List + 玩家改动识别 v1）提供完整交接。
> 交接人：主代理；承接方：新会话/子代理（按本文件可直接开工，无需回溯对话）。

## 1. 状态快照

- **设计冻结**：`ui/DESIGN.md` v0.2 FROZEN（用户 2026-09-03 确认）；推演 `ui/design-trace.md` 56/56 全绿。
- **关键提交**（feat/composite-and-project-knowledge 分支）：
  - bf40f9e ui/ 模块建立（AGENTS/README/DESIGN 骨架）
  - d7a4ee9 设计 v0.1；58f8a5f 设计 V2（Surface 模型+推演）；c8095f5 A7 闭合（trace 全绿）
  - 5bde95d / 6baadb5 / 4021f09 = 缺口补齐轮 64/65/66；4422af8/d706a74 判别器补丁
  - ccc12b8 / 82d5211 / d0f4250 = 复盘 + 技能回灌 + 根路由登记
- **学习基线**：重启轮 66 快照 `.gsts/diff-exp/ui学习/1073741909.after-重启66-默认页签2-7468eadd.gil`
  （SHA 7468eadd…）；manifest LOCKED 同值。知识权威 = `.agents/skills/editor-incremental-gia-investigator/references/ui-controls.md`（82+ 节）。

## 2. 设计文件（冻结版，票 04 唯一实现依据）

| 文件 | 作用 |
|---|---|
| `ui/AGENTS.md` | 常驻约束（8 铁律：未知字节透传/surgical patch/身份寻址分离/玩家协作第一公民/克隆内核/作用域/写回红线/fail-closed） |
| `ui/DESIGN.md` | 领域模型（Surface 放置面/placement/判别器 parent 上下文）+ 命令面 L1-L4 + 验收四层 + 风险清单 |
| `ui/mappings.md` | 规则→命令映射 §0-8（wire 路径+轮次证据；delete 清理件数按 family；ID 分配禁 max+1） |
| `ui/design-trace.md` | 56 条规则推演表（命令面改动必须重跑受影响行） |

## 3. 票 04 启动器（一句话）

> 实现 `assets:ui list`（概念树/平面两视图：布局面与悬浮页面并列、容器展开、kind=签名+parent 上下文判别、
> 节点输出 id/path/role/geometry/refs/props/unknown）与 `assets:ui diff --anchor`（对语义锚点输出
> 新增/删除/字段级变更 + playerChanges 判定），用真实快照（重启轮 4/19/26/29/51/64 + 轮 13 玩家拖动）
> 断言「判别、属性提取、差异定位」与人工差分结论逐项一致（PASS 才收票）。

## 4. 票 04 验收（摘自 issue 04 + DESIGN 第四章）

1. List 语义层：按钮/组件类型判别（签名+parent）、布局与容器归属（Surface 树）、属性摘要（几何中心绝对坐标/文本/尺寸/素材状态）。
2. 玩家改动识别 v1：`diff --anchor`（锚点=语义视图+记录集 hash → `.gsts/ui-anchors/<mapId>.json`）；playerChanges 判定特征见 mappings §7（布局实例直接改=玩家细排；实例侧未同步=提示 sync；孤儿/ID 换新=编辑器行为不误报）。
3. 真实样本断言 PASS：与人工差分结论逐项一致。
4. 只读命令不写盘；`--json` schema `{schemaVersion,mapId,sha256,kind,data}`。

## 5. 实现顺序建议（L1 骨架）

1. 概念树节点/schema 类型（TS 接口，与 DESIGN 3.2 一致）
2. 类型注册表初版：已学 kind（layout/custom-button/textbox/image/input-box/floating-page/tab/close-button/container/message-queue/style-group…）+ 判别函数（comps 签名 + parent role + kind 常量：tab=320001/悬浮页=330001）
3. 树构建：root9 记录 → 面（布局 f503/库容器 1840/悬浮页 t42 容器列表/容器 f503）→ 控件 → 子项（t47 页面/type55 成员/type77 样式/type79 消息项）
4. list 两视图输出 + 未知标记（unknown[] 长度+hash 摘要，fail-closed）
5. anchor save/list + diff（新增/删除/字段级 changed + playerChanges）
6. 真实样本断言脚本（读快照 → 判别/属性/差异 → 与知识权威节对照）

## 6. 风险与未闭合（开工前已知，遇到即 fail-closed 或差分）

- type78（消息队列 37B）、t47 group 编码细节、素材相对坐标、root45/46 语义、2090 计数器字段——只读标记不猜；
- 旧 CLI 悬浮页创建 4 条规范与新版不一致——**实现 create/sync 前**以干净 donor 重验（本轮只做 list/diff，不受影响）；
- 容器内"带素材树/模板副本元素"删除联动（票 07 前补差分即可）；
- 悬浮页能否嵌套（fail-closed：未知 kind 标记）。

## 7. 环境与红线提醒

- 写回红线：任何写命令 SHA 锁定→候选→diff 断言→确认→写回→回读→提醒重载（票 04 全只读，仍遵守）；
- 读图/证据纪律：规则冲突以最新差分轮为准并回写知识权威 + 设计 trace；
- 命令面改动（哪怕加参数）必须重跑 design-trace 受影响行。
