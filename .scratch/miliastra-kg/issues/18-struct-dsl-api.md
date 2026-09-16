# 18 — 结构体 DSL API：拼装 / 拆分 / 修改 + 成员访问

**What to build:** 在 TS DSL 里能真正用结构体——现在 `struct` 类是**空占位**，
写 `new struct()` 得不到任何成员，节点定义虽在库（`nodes.ts:8260/11911/11925`）却没有运行时封装。

**Blocked by:** 16（需要知道成员在 IR/GIA 里怎么表达）。**不依赖 17**（17 是资产侧，18 是图侧）。

**Status:** ⬜ 待开工

---

## 起点（写票时实测）

```ts
// src/runtime/value.ts:458-467 —— 全部实现就这些
export class struct extends value {
  declare private readonly __brandStruct: 'struct'
  constructor() { super() }
  override toIRLiteral(): Argument { return { type: 'struct', value: null } }
}
```
`grep -rn "assembleStructure|splitStructure|modifyStructure" src/runtime/*.ts` = **0 命中** —— 节点在库、API 缺。

## 验收项

- [ ] 设计并实现 `struct` 的成员表达（对齐 16 的 wire 结论，不另造一套）
- [ ] `f.assembleStructure(...)` / `f.splitStructure(...)` / `f.modifyStructure(...)` 运行时封装
- [ ] 成员读写（至少按名取/按名改）可编译过 IR 阶段
- [ ] 编译产出 `.gia`，**读图核验**执行流与数据流对上源码意图（读 `api` 字段，不是 `kind`）
- [ ] 节点预算核对（结构体嵌套多则获取负载高，见南航课程 P3 提醒）
- [ ] 若发现"必须用结构体"的场景（局内存档 / 消息队列）能跑通最小样例，作为 20 的前置证据
- [ ] 收轮三件套

## 备注

南航课程 P3 讲师的实测提醒：**结构体嵌套多则获取负载高**，先拆到「节点图变量」缓存
（局部变量不支持结构体和字典）。本票实现时须核对这条。
