# 03 — 语义资源表地图盘点（Discover）

**What to build:** 成建制摸底“官方语义资源到底有哪些表”，为后续“哪个模块还有类似资源”提供底图：
1. 枚举 `BeyondAssistEditor/Resource/Json/` 全部子目录与 `.mihoyobin`（含 `Config/JsonConfig`
   内层 ShortCutKey/SynonymsLibrary 等）；
2. 有界扫描主游戏数据 `YuanShen_Data/StreamingAssets/` 中 Beyond/UGC 相关文件（blk 清单即可，
   不展开全量解析）；
3. 对每张表标注：解析状态（✅ 可解 / 🔶 未深入 / 🔒 加密 / ❌ 未挖）、疑似覆盖域、
   是否可能为“ID→配置”目录表、语言变体数量；
4. 标出**候选语义池**——哪些表最可能装状态效果/技能/其他模块的配置名（区别于已确认的
   节点 TextMap）。

**Blocked by:** None — 可在票 01/02 并行；产出物为 inventory 文档 + 看板资产速查更新。

**Status:** ⏳ open

**验收 checkbox：**
- [ ] 编辑器 Json 树全量枚举完成（含 Config 内层），产出表地图
- [ ] 主游戏 StreamingAssets 有界清单完成（beyond/ugc/blk 相关）
- [ ] 每表标注解析状态 + 疑似域 + 是否 ID→配置目录；候选语义池已标出
- [ ] 落盘 inventory（如 `docs/game-engine-knowledge/semantic-resource-inventory.md`）
- [ ] 回填 `semantic-resource-pipeline.md` 表盘点 + BOARD 资产速查
- [ ] `git diff --check` + 精确提交 + 收轮三件套

## 轮次记录

- （规划 2026-09-04：管线文档已建，见 `docs/game-engine-knowledge/semantic-resource-pipeline.md`）
