# 17 — 结构体在 CLI 落地：变量类型 + 读写回环核验

**What to build:** `assets:level-variables` / `assets:custom-variables` 能创建、列出、更新
**结构体类型**与**结构体列表类型**的变量，写回后回读一致。

**Blocked by:** 16（wire 结论）。没有 16 的编码结论就无法写回。

**Status:** ⬜ 待开工

---

## 起点（写票时实测）

- `src/cli/gil_level_variables.ts:505-526` `UiVarType` 21 个类型**无 `struct`**；
  同文件 `:14` 注释显示 typeCode 空间是 **1..27**（25/26 = Struct/StructList）→ 缺口在类型映射面，不在 wire 空间。
- `UiDictValueType`（`:527-529`）只覆盖 str/int/float 及其 list。

## 验收项

- [ ] `UiVarType` 增加 `struct` / `struct_list`（若 16 证明有更多变体，一并加）
- [ ] 解析侧（读变量）能识别结构与结构体列表，不报未知类型
- [ ] 创建侧能写回，且**必须能指定结构体定义引用**（16 的结论决定怎么指）
- [ ] `variables:verify` 的 wire 照规律表（`tests/fixtures/variables-wire-rules.json`）覆盖新增类型
- [ ] 回环核验：创建 → 回读 → 与输入逐字段比对（**读回数字，不只看命令无红字**）
- [ ] 读回真实 `.gil` 核验（读图核验红线），在**夹具副本**上做非破坏验证
- [ ] 未闭合语义登记 open-items，不虚构
- [ ] 收轮三件套

## 备注

写入真实地图需用户确认 mapId；本票验证走夹具副本 + `--output` 非破坏路径（2026-09-15 已跑通的模式）。
