#!/usr/bin/env bash
# miliastra-knowledge 知识库查询助手 —— 统一封装 HTTP 调用、信封解包与错误提示。
#
# 用法（两种模式任选其一）：
#   模式A（推荐，免 JSON 转义）：bash query.sh <tool> <参数...>
#     bash query.sh get_node_info 碰撞触发器 嘲讽目标
#     bash query.sh list_documents 运动器
#     bash query.sh get_document 仇恨配置
#     bash query.sh rag_search 角色受击后播放特效 怪物追击玩家
#   （rag_search 需要 top_k 时用模式B；list_documents 不带参数 = 浏览全部文档）
#   模式B（完整 JSON）：bash query.sh <tool> '<json>'
#     bash query.sh rag_search '{"queries": ["嘲讽目标"], "top_k": 3}'
# 工具：get_node_info | list_documents | get_document | rag_search
set -u

TOOL="${1:-}"
shift || true

case "$TOOL" in
  get_node_info|list_documents|get_document|rag_search) ;;
  "")
    echo "用法: bash query.sh <tool> [参数...] | '<JSON>'" >&2
    echo "工具: get_node_info | list_documents | get_document | rag_search" >&2
    exit 2 ;;
  *)
    echo "未知工具: $TOOL（可选 get_node_info | list_documents | get_document | rag_search）" >&2
    exit 2 ;;
esac

# ---- 构造请求体：模式B（首参是 {）直接用 JSON；模式A 用 node 安全转义拼装 ----
if [ "$#" -ge 1 ] && [ "${1:0:1}" = "{" ]; then
  BODY="$1"
else
  case "$TOOL" in
    get_node_info)
      BODY="{\"names\": $(node -e 'console.log(JSON.stringify(process.argv.slice(1)))' "$@")}" ;;
    list_documents)
      if [ "$#" -eq 0 ]; then BODY='{"keywords": []}'
      else BODY="{\"keywords\": $(node -e 'console.log(JSON.stringify(process.argv.slice(1)))' "$@")}"; fi ;;
    get_document)
      BODY="{\"titles\": $(node -e 'console.log(JSON.stringify(process.argv.slice(1)))' "$@")}" ;;
    rag_search)
      BODY="{\"queries\": $(node -e 'console.log(JSON.stringify(process.argv.slice(1)))' "$@")}" ;;
  esac
fi

# ---- 发起请求（-L 跟随 301，-m 30 超时，-sS 仅错误时输出）----
BASE="https://ugc.070077.xyz/api/v1/skills/miliastra-knowledge/tools"
RAW="$(curl -sS -m 30 -L -X POST "$BASE/$TOOL" -H "Content-Type: application/json" -d "$BODY" 2>&1)"
RC=$?
if [ "$RC" -ne 0 ]; then
  echo "网络请求失败（curl 退出码 $RC）：$RAW" >&2
  echo "提示：先确认可达（curl -sI https://ugc.070077.xyz/），重试一次；仍失败则明确告知用户知识库不可用。" >&2
  exit 1
fi

# ---- 信封解包与结果输出（node 负责 JSON 解析，宿主必有 node）----
node -e '
const raw = process.argv[1]
let payload
try { payload = JSON.parse(raw) } catch {
  console.error("响应不是合法 JSON（服务器异常？）原文前 500 字符：")
  console.error(raw.slice(0, 500))
  process.exit(1)
}
if (payload.success !== true) {
  console.error("API 返回错误：" + (payload.error ?? JSON.stringify(payload)))
  process.exit(1)
}
const result = payload.data && payload.data.result !== undefined ? payload.data.result : payload.data
console.log(JSON.stringify(result, null, 2))
if (Array.isArray(result) && result.length === 0) {
  console.error("（无匹配结果 —— 不要盲目重试；按 SKILL.md「本地回退」节的指引处理）")
}
' "$RAW"
