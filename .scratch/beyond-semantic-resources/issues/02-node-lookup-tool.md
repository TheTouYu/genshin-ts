# 02 — lookup 检索工具 + DSL 技能接入

**What to build:** 做“节点/定义一键检索”工具（lookup-node），输入中文名/英文名/方法名/genericId，
一次查遍 5 个本地语料源并输出**四态结论**；脚本必须放进 `.agents/skills/dsl-nodegraph-development/scripts/`
并在 `SKILL.md` 写明调用示例（技能是原始触发点，光写脚本不引用=不会用）。顺带产出能力矩阵
（编辑器有 / DSL 已暴露 / 缺失）轻量底稿。

**四态：**
- 一态 DSL 可用：给出 `nodes.ts`/`client_nodes.ts` 行号 + 签名摘要
- 二态 仅编辑器/官方有（未暴露 DSL）：给 genericId/中英名/侧别（server/client/unknown）
- 三态 不存在：明确说查不到，禁止臆造函数名
- 四态 配置目录未解析：如“移动速率调整率（动态）”——提示“这不是节点，属状态效果配置，
  目录未解析见票 01”，禁止假装能返回 1720001

**语料源（只读）：** `resources/mihoyo_editor_names.json`、`resources/node_definitions.json`、
`resources/server_node_static_metadata.json`、`src/definitions/zh_aliases.ts`、
`src/definitions/nodes.ts`、`src/definitions/client_nodes.ts`、第三方
`src/thirdparty/.../node_data/`（NODE_ID/NODE_PIN_RECORDS/client_node_metadata/client_enum_values）。

**可复用参考脚本：** `scripts/nodegraph/audit-mihoyo-editor-names.ts`（比对骨架）、
`scripts/nodegraph/extract-mihoyo-editor-names.ts`（生成）、
`scripts/nodegraph/sync-mihoyo-editor-display-names.ts`。

**Blocked by:** None — can start immediately（效果目录缺失已知，用四态承接）。

**Status:** ⏳ open

**验收 checkbox：**
- [ ] 脚本落位 `.agents/skills/dsl-nodegraph-development/scripts/` 且可从仓库根运行
- [ ] 5 断言样本通过：`添加单位状态/addUnitStatus` → 一态；`打印字符串` → 一/二态；
  一个 DSL 未暴露的官方节点 → 二态；`移动速率调整率（动态）/定时触发技能` → 四态；
  胡编词 → 三态（真实输出贴入票轮次）
- [ ] `SKILL.md` 新增“写节点前先查 lookup”节（命令示例 + 四态解读 + 真实输出）
- [ ] 能力矩阵轻量落盘（编辑器有/DSL 有/缺失）
- [ ] `git diff --check` + 只暂存本票文件精确提交
- [ ] 收轮三件套

## 轮次记录

- （票 00 规划：完整提示词已在本会话产出，执行者可自行参考对话；本票按上述验收执行）
