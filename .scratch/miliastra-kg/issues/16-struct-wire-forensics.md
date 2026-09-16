# 16 — 结构体 wire 取证：闭合「结构体定义」与「struct 类型变量」的 GIL 编码

**What to build:** 让我方能**创建**一个结构体（而非只能读）。当前状态是**知识在、API 缺**：
节点定义已在库（`src/definitions/nodes.ts:8260 modifyStructure()` / `:11911 splitStructure()` / `:11925 assembleStructure()`），
但没有人知道「结构体定义」这个资产在 GIL 里怎么编码、struct 类型变量怎么引用它。

**本票只做取证，不做实现。** 产出 = 一份可复现的 wire 结论 + 相邻快照，供 17/18 落地。

**Blocked by:** **需要用户在编辑器里做一次 ≤2 分钟的最小差分**（这是唯一的取证通道，
静态推断在 AGENTS.md「卡住三问」里被明确禁止）。请用户做两件事并各保存一次：
1. 高级数据管理 → **创建一个结构体**（建议 2 个成员，类型取 `int` + `str`，好认）
2. 给某个实体加一个**该结构体类型的自定义变量**（命名 `T16_struct_probe`）
→ 两次保存之间**不要做任何其它改动**。

**Status:** ⬜ 待开工（等用户差分）

---

## 已核实的起点证据（本票写票时实测，非记忆）

| 事实 | 位置 | 说明 |
|---|---|---|
| `UiVarType` **无** `struct` | `src/cli/gil_level_variables.ts:505-526` | 21 个类型，止于 `dict` |
| 但类型码空间**含** struct | 同文件 `:14` 注释「原始类型码（**1..27**，含具体列表码）」 | 25/26 按 PKC 已闭合为 Struct/StructList → **wire 空间有、CLI 未暴露** |
| `struct` 类是空占位 | `src/runtime/value.ts:458-467` | `toIRLiteral()` 恒返回 `{type:'struct', value:null}`，无字段、无成员访问 |
| 三个节点定义已在库 | `src/definitions/nodes.ts:8260/11911/11925` | 拼装/拆分/修改，官方中文名齐备 |
| PKC 已知类型码 | claim `clm_9FA1660915D1832D0763A499E4` | Struct=25 / StructList=26 / Dictionary=27 / VariableSnapshot=28 |

## 验收项

- [ ] 用户在编辑器完成上述两步最小差分，给出前后两份 `.gil` 路径
- [ ] 全 root raw-byte 比较，**定位结构体定义**落在哪个 root / 字段（用 `gil_wire_lib.walk` 而非肉眼）
- [ ] 闭合：结构体定义的成员怎么存（顺序/名字/类型码/默认值）
- [ ] 闭合：struct 类型变量的 `typeCode` 实际取值（验证 25 是否为 Definition 引用型而非值型）
- [ ] 闭合：变量如何引用结构体定义（内联 ID / 索引 / 名称）
- [ ] 产出可复现结论：写进 `docs/game-engine-knowledge/` 对应文档（最小适用范围文件）
- [ ] 未闭合项如实登记（fail closed，不猜字节）
- [ ] 收轮三件套

## 备注

本票**不写任何游戏文件**，只在用户给的快照上做只读差分。目标是让 17/18 有地基，
避免"先写代码再猜 wire"——那是本项目 2026-08-20 铁证原则明令禁止的路径。
