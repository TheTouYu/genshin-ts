# docs/ui-tutorial · 官方教程整理文档集

> 状态：当前推荐（官方教程学习 / UI 与节点解析用）
> 整理日期：2026-08-17
> 来源：act.mihoyo.com 原神千星奇域·综合指南 + miliastra 知识库官方镜像
> 适用范围：学习原神千星奇域（Miliastra Wonderland）的 UI、节点图、编辑器功能与完整官方指南。

## 文件地图

| 文件 | 覆盖章节 | 状态 |
| --- | --- | --- |
| `official-ui-tutorial.md` | 综合指南总览 + **UI（界面控件）完整** + UI 专项整合 | ✅ 完整 |
| `official-guide-editor-interface.md` | 界面介绍（编辑器功能界面） | ✅ 完整 |
| `official-guide-concepts.md` | 概念介绍（非 UI：实体/功能/节点图基础/外围系统/资源系统/技能/其它概念） | ✅ 完整 |
| `official-guide-nodes-server.md` | 节点介绍·服务器节点（执行/事件/流程控制/查询/运算） | ✅ 完整 |
| `official-guide-nodes-client.md` | 节点介绍·客户端节点（六类节点图） | ✅ 完整 |
| `official-guide-auxiliary-appendix.md` | 辅助功能 + 附录 | ✅ 完整 |
| `official-guide-faq.md` | 官方 FAQ（12 篇） | ✅ 完整 |

## 证据层级

- `[官方原文]`：act.mihoyo.com 综合指南页面（browser-harness 抓取，正文与知识库逐字一致）。
- `[知识库]`：miliastra 知识库镜像，文档 id 与官方页 id 一致。
- `[本地]`：项目 `docs/` 本地文档（多为框架草案/待验证，仅参考）。
- `[待验证]`：无官方结论或需编辑器/游戏核验的推测，均明确标注。

## 覆盖情况

- 官方综合指南 207 个详情页：**全部收录**（23 个 UI 页在主文档，182 个非 UI 页在子文档，读前须知/更新日志在主文档）。
- 官方 FAQ 12 篇：全部收录于 `official-guide-faq.md`。
- 官方课程（tutorial/course）多为视频页；有文字讲义的 UI 课程已嵌入主文档 §3.4，纯视频课程暂以索引/占位标注。

## 维护说明

- 只读研究/文档任务产物；不修改生产代码，不含未验证 wire 结论。
- 图片在原文中无法以文本呈现的位置以 `[图]` 占位。
- 子文档按官方章节结构组织，标题与顺序与官方导航一致。
