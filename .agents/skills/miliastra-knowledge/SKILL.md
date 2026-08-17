---
name: miliastra-knowledge
description: 千星沙箱（原神千星奇域）知识库查询。当用户询问千星沙箱的节点用法、编辑器功能、FAQ、教程文档，或需要把玩法需求拆解为具体节点与文档时，使用本skill。
---

# 千星沙箱知识库查询

知识库覆盖：全部节点说明（含归属端与参数）、官方指南、教程、FAQ，300+ 篇文档。
API 端点：https://ugc.070077.xyz/（http 会 301 到 https；助手脚本已处理，手工 curl 必须加 -L）。

## 调用方式（首选：助手脚本，一条命令完成调用+解包+错误提示）

    bash <技能目录>/references/query.sh <tool> [参数...]

技能目录 = 本 SKILL.md 所在目录。常见位置：/home/h/genshin-ts/.agents/skills/miliastra-knowledge/
（以加载本技能时得到的资源路径为准；不确定时用 find ~ -path '*miliastra-knowledge/references/query.sh' 2>/dev/null 定位）。

| 工具 | 命令（多参数=批量，一次调用） |
|------|------------------------------|
| get_node_info | bash …/query.sh get_node_info 碰撞触发器 嘲讽目标 |
| list_documents | bash …/query.sh list_documents 运动器 触发器（不带参数=浏览全部） |
| get_document | bash …/query.sh get_document 仇恨配置 背包组件 |
| rag_search | bash …/query.sh rag_search 问题A 问题B（默认 top_k=5） |
| rag_search 带 top_k | bash …/query.sh rag_search '{"queries": ["嘲讽目标"], "top_k": 3}'（JSON 模式） |

参数表、返回结构、关键词表详见 references/tools.md（与 SKILL.md 同目录的 references 下）。
**多个独立查询合并为一次调用（批量），不要拆成多轮，也不要重复相同调用。**

【兜底】脚本不可用时手工 curl：POST https://ugc.070077.xyz/api/v1/skills/miliastra-knowledge/tools/<tool>
（Content-Type: application/json；curl 必须加 -L）。响应包裹 {"success":true,"data":{"result":...},"error":null}，取 data.result。
脚本在**大响应**下可能报 `Argument list too long`（`node -e` 把整段响应当 argv 传参），这是脚本传参限制不是 API 错误；此时改用「直接 curl + Python 解析」兜底，见 references/tools.md「已知坑」第 6 条。

## 什么时候用

- 用户询问千星沙箱某个节点的用法、参数、触发条件
- 用户询问系统/组件功能（战斗、仇恨、商店、背包、运动器、触发器……）
- 用户遇到"为什么不触发/不生效"等排障问题
- 用户想了解某系统的整体设计或配置步骤
- 需要把玩法需求拆解为具体节点名和参考文档

## 怎么选工具

1. **用户说了具体节点名** → get_node_info（批量传入效率更高）
2. **不确定文档名** → list_documents 先看有哪些（不传关键词可浏览全部）
3. **已知系统/文档名，要完整内容** → get_document
4. **用户用自然语言描述功能或问题** → rag_search（开放问题、排障、跨文档比较）
5. **查完节点要看完整配置说明** → 取返回的 source_doc_title，再调 get_document

**优先级：结构化工具优先，rag_search 兜底。** 能用节点名/文档名直接定位时不用 rag_search。

## 典型调用顺序

- **开放玩法需求**：rag_search([需求描述]) → get_node_info([命中的节点名]) → get_document([来源文档])
- **已知节点名**：get_node_info([节点名]) → 需深入时 get_document([source_doc_title])
- **学习某系统**（商店/仇恨/背包）：list_documents([关键词]) → get_document([精确标题])
- **排障**（"为什么不触发"）：rag_search([问题描述]) → get_document([相关系统文档])

领域示例——**造物/技能**：
list_documents(["造物状态"]) → get_document(["造物状态决策节点图", "复杂造物技能"]) → get_node_info(["复杂造物定点位移", "造物转向指定朝向"])

领域示例——**仇恨系统**：
rag_search(["嘲讽和仇恨系统配置", "怪物追击玩家行为"]) → get_node_info(["嘲讽目标", "增加指定实体的仇恨值", "获取指定实体的仇恨目标"]) → get_document(["仇恨配置"])

## 错误处理（按序执行，不要跳过）

1. 脚本输出**「无匹配结果」** → 换更短/更通用的关键词重试一次；仍无结果 → 走**本地回退**（下节），**不要反复重试远程 API**
2. get_document 返回 status="too_many" → 先用 list_documents 找精确标题；若已知官方文件 ID（文件名形如 `mhnapxrumtzy_界面控件.md` 的前缀），**直接传文件 ID 前缀**可精确命中唯一一篇（2026-08-17 实测，见 references/tools.md「已知坑」第 5 条）
3. get_document 返回 status="not_found" → 先 list_documents 找候选标题，再重查
4. rag_search 结果为空或不相关 → 换领域术语重写 query（如把"怪物追我"改为"仇恨 嘲讽 追击"）
5. 脚本报网络错误 → 重试一次；仍失败 → 明确告知用户知识库不可用

## 本地回退（重要，2026-08-12 实测：远程 API 对基础引擎节点不可用）

本知识库覆盖**千星沙箱**玩法内容。查询**基础引擎节点**（520 旋转运动器/668 实体重绑/365 激活/337 GetVar/323 SetVar 等）时远程 API 大概率查不到（get_node_info 中英文名都返回"未找到匹配"；rag_search 可能无输出），**不要反复重试**，直接本地查：

    # 节点语义/参数 → 本地打包数据（原神 miliastra 节点包）
    ls src/thirdparty/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/node_data/
    # 如 client_node_metadata.ts / client_enum_values.ts / client_graph_encoding.ts
    grep -rn "Add Basic Target-Oriented" src/thirdparty/ | head

引擎节点语义的权威来源是 docs/game-engine-knowledge/ 与 miliastra-knowledge/references/（节点语义表），远程 KB 查不到时先看这两处。
调用远程 API 前先 curl -sI https://ugc.070077.xyz/ 探活。

## 官方教程文档集（本地参考，2026-08-17 起）

`docs/ui-tutorial/` 已收录官方综合指南 207 页 + FAQ 12 篇的全文整理：

- `official-ui-tutorial.md`：UI/界面控件主文档 + 综合指南总览；
- `official-guide-editor-interface.md` / `official-guide-concepts.md`：界面介绍、概念介绍；
- `official-guide-nodes-server.md` / `official-guide-nodes-client.md`：节点介绍全文；
- `official-guide-auxiliary-appendix.md`：辅助功能 + 附录；
- `official-guide-faq.md`：官方 FAQ。

做 UI/节点规则验证时，可先查这套本地文档（含证据层级标记），再决定是否需要回远程 KB 取原文；远程查不到时优先走本地回退。

## 输出规范

- 节点类回答：说明用途、关键参数、**归属端（side：服务端/客户端/双端）**，注明来源文档
- 文档类回答：总结要点，必要时直接引用原文片段
- rag_search 结果：优先引用 similarity 最高的条目，注明来源文档
- **严格区分"文档原文已说明"与"基于资料的推测建议"**
- 不得编造节点名、参数名或官方结论；查不到就明确说查不到，并建议换个问法
