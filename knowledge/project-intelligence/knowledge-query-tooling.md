# 知识库查询工具经验（miliastra-knowledge）

官方文件 ID 精确查询、query.sh ARG_MAX 兜底、docs/ui-tutorial 本地官方教程文档集

<!-- CLAIM:START clm_FE16BC7E172B8A5BC2845AFC59 -->

### 官方文件 ID 前缀可精确命中 miliastra 知识库单篇文档

miliastra-knowledge 的 list_documents/get_document 对 title 与文件名做子串/子序列匹配；当宽泛标题（如“界面控件”）触发 too_many 时，直接使用官方文件 ID 前缀（如 mhnapxrumtzy）作为 get_document 入参可精确命中唯一一篇（2026-08-17 实测）。

#### 适用边界

仅适用于官方文档镜像（文件 id 与官方页 id 一致）；不替代语义去重；已记录在技能 references/tools.md 已知坑第 5 条。

<!-- CLAIM:END clm_FE16BC7E172B8A5BC2845AFC59 -->

<!-- CLAIM:START clm_296F35890557584DE18051A244 -->

### query.sh 大响应会 ARG_MAX，直接 curl+Python 解析为兜底

miliastra-knowledge query.sh 用 node -e 将整段 RAW 响应作为 argv 传参，批量返回大文档（如执行节点全文）时会报 Argument list too long；绕过脚本用 curl POST + Python json.load 解析可继续读取，不改变 API 契约（2026-08-17 实测）。

#### 适用边界

这是脚本传参限制而非 API 错误；兜底仍走同一只读端点；已记录在技能 references/tools.md 已知坑第 6 条。

<!-- CLAIM:END clm_296F35890557584DE18051A244 -->

<!-- CLAIM:START clm_B0F0948E1BBDE7F814AA5177C3 -->

### docs/ui-tutorial 为官方综合指南本地镜像，做 UI/节点规则验证可先查

docs/ui-tutorial 已收录官方综合指南 207 页 + FAQ 12 篇全文（UI 主文档 + 概念/节点/辅助/附录/FAQ 子文档），带证据层级标记；做 UI/节点规则验证时可先查本地，再决定是否回远程 KB；它不是真实 GIA/wire 证据。

#### 适用边界

证据层=官方文档契约本地镜像；不替代真实 wire 验证；已记录在技能 SKILL.md 官方教程文档集节。

<!-- CLAIM:END clm_B0F0948E1BBDE7F814AA5177C3 -->
