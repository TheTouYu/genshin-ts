# 复合节点待办优先级汇总

聚合以下文档中所有未完成项，去重排序：
- `composite-connection-boundary-matrix.md`
- `composite-full-scenario-gaps.md`
- `multi-outflow-composite-guide.md`
- `composite-outflow-impl-guide.md`
- `.claude/memory/composite_gia_diff_analysis.md`

---

## P0 — 阻塞基本功能

### 1. 数据节点 bConcreteValue 类型覆盖（部分完成）
**文档**: `composite-full-scenario-gaps.md` 问题 2, 3, 4
**已完成**: VectorBase/vec3 (10 节点) — 2026-06-11 游戏验证通过 ✅
**仍缺失**: FloatBase (15 节点), EnumBase/bool (18 节点), StringBase (3 节点), IdBase
**改动**: `composite.ts` — 扩展 `concreteWrappedNodeTypes`, `buildPlaceholderPin` 类型推断, `makeVarBaseValue` 值构建

### 2. `local_variable` + `*_list` 类型 InParam/OutParam 支持
**文档**: `composite-connection-boundary-matrix.md` 第 1 节
**现状**: `compositeTypeToBaseTag` 对 `local_variable` 和所有 `_list` 类型返回 null → pin 被 filterUnkPins 移除
**影响**: 复合中输入/输出 `local_variable` 或 list 类型时 pin 丢失
**改动**: `index.ts` — `compositeTypeToBaseTag` 扩展

---

## P1 — 核心功能缺失

### 3. 嵌套复合 (nested composite)
**文档**: `composite-full-scenario-gaps.md` 问题 1
**现状**: `__composite_call__` 在 impl graph 中无处理，nodeId=0
**改动**: `composite.ts` `buildImplGraphNodes` — 处理 `__composite_call__` 类型，创建 SysGraph node

### 4. impl 图特殊节点 pin 布局
**文档**: `composite-connection-boundary-matrix.md` 第 5 节
**现状**: `buildImplNodePins` 对 `assembly_list`/`assembly_dictionary`/`multiple_branches`/信号节点 直接按普通 arg 编码
**改动**: `composite.ts` `buildImplNodePins` — 为这些节点类型添加特殊 pin 布局

---

## P2 — 已验证场景的遗留修整

### 5. event 节点多余 OutParam pins
**文档**: `.claude/memory/composite_gia_diff_analysis.md` 已知遗留问题
**现状**: event 节点上有多余的 entity/guid OutParam pins，参考文件中 event 仅 OutFlow
**改动**: `index.ts` post-encoding — 已添加 filter 但需验证所有场景

### 6. Normal → Composite 数据流验证
**文档**: `composite-full-scenario-gaps.md` 问题 5
**现状**: `layout.ts` 已修正 toIndex，但未实测
**改动**: 编写测试用例验证，可能无需代码改动

### 7. nodeIndex 偏移
**文档**: `.claude/memory/composite_gia_diff_analysis.md` 已知遗留问题
**现状**: nodeIndex 从 2 开始（bootstrap flow 导致），参考从 1 开始
**改动**: 调查 bootstrap 影响，可能调整 ID 分配

---

## P3 — 重大新功能

### 8. 多 OutFlow 复合节点 ✅ Phase 1+2 完成
**文档**: `multi-outflow-composite-guide.md`, `composite-phase1-api-guide.md`
**改动**: `composite.ts`（重写 buildImplNodePins）、`composite_registry.ts`（toIRLiteral 修复）、测试文件 × 3
**关键修复**: 移除 noPinSystemNodes、OutFlow 按 source_index 拆分、数据连线修复、branchExec 校正、impl 布局
**参考**: `复杂gia/弹球.gia`, `传球.gia`, `物理运动.gia`

### 9. GIA 定义文件格式 (which=12)
**文档**: `multi-outflow-composite-guide.md` 两种文件格式
**现状**: 当前只生成 usage 格式 (which=9)
**改动**: `index.ts` — 支持 `mode: 'definition'` 导出

---

## P4 — 边缘 / 远期

### 10. `struct`/`dict`/`enum` 通用类型支持
**文档**: `composite-connection-boundary-matrix.md` 第 1 节
**改动**: 全链路类型系统扩展

### 11. 空复合 / 无输入无输出复合
**文档**: `composite-full-scenario-gaps.md` 问题 6

---

## 已验证通过的场景

| 场景 | 文件 |
|------|------|
| 单 exec 复合 | `basic_call.gia` |
| 带参数 exec 复合 | `basic_call_param.gia` |
| 双 exec 串行 (终端+非终端) | `two_exec.gia` |
| 双复合+普通节点混合 | `mixed_composite_and_normal.gia` |
| 纯数据复合 (1 input used twice) | `two_simple.gia` |
| 多 OutFlow 系统节点 | `phase1_system_nodes.gia` |
| 多 OutFlow 普通节点 | `phase2_normal_nodes.gia` |
| 参考模式（5 种） | `phase2_reference_patterns.gia` |
| mul3 vs 参考完全一致 | `replicate_mul3.gia` |
| 双复合(vec3加法+带参打印) | `两个复合节点.gia` |
