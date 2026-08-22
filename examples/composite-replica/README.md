# 复合节点复刻实战报告（composite-replica）

> 状态：当前推荐
> 来源：真实 GIA 复刻 + 编译比对（2026-08-22）
> 最近校验：2026-08-22
> 适用范围：验证「DSL 复刻社区复合节点」的可行性 + 编译器正确性

## 目的

用 Genshin-TS DSL 复刻「常用复合节点大全 v1.7」资源包里的复合节点，编译生成 GIA 后与原版逐项比对，
验证两点：

1. **DSL 复刻逻辑是否合法**（是否真学会）；
2. **编译器是否有 bug**（编译产物与预期不符）。

## 复刻范围与结果

| 批次 | 资源包 | 复刻节点数 | 比对结果 |
|---|---|---|---|
| batch1 | 变量运算包（8）+ 逻辑运算包（6） | 14 | **14/14 PASS** |
| batch2 | 随机工具包（2）+ 矩阵运算包（4） | 6 | **4/4 PASS + 2 复刻差异** |

**总计：20 个复合节点，18 个完全一致（节点集合 + pin 数量 + 节点数），2 个复刻设计差异（非 bug）。**

### 比对方法

`examples/composite-replica/tools/compare.py` 对每个复合节点比对：
1. 节点类型 multiset（忽略存储顺序，判断逻辑等价）；
2. 输入/输出/inflow/outflow pin 数量；
3. 节点数量。

## 关键发现

### 1. 编译器 bug（已记录，未改）

**复合节点 enum 类型输入无法用于 `enumerationsEqual`**（O-2026-08-22-1）：

- 现象：`inputs: { status: { type: 'enumeration' } }` + `f.enumerationsEqual(status, ...)` 报
  `Invalid value type: enum`。
- 根因：`createTypedValue` 缺 enum 分支，enum 输入落到 `new generic()`。
- 影响：枚举转换类复合节点（原版 1610612755/1610612759/1610612757/1610612758）暂无法复刻。

### 2. 复刻差异（非 bug，是设计选择）

| 节点 | 原版 | 复刻 | 差异 |
|---|---|---|---|
| 随机判定 | 随机整数 + 随机浮点（浮点是死节点备用） | 随机浮点 | 精度不同（整数离散 vs 浮点连续） |
| 加权随机 | Weighted Random + Assembly List（5 个独立权重输入） | weightedRandom(int_list)（1 个列表输入） | 接口设计不同 |

### 3. 复刻踩坑（已回灌技能）

- **`split3dVector` 返回字段是 `xComponent/yComponent/zComponent`，不是 `.x/.y/.z`**（`.x` 是 vec3 的
  getter）。写 `s.x` 得到 `undefined` → `create3dVector` 报 `Invalid value type: float`。
- **未被调用的复合节点会被编译器裁剪**（不进 GIA），除非 `forceFull: true`。

## 复刻方法论（沉淀）

1. **先逆向原版结构**：用 `decode-gia.ts` 提取每个复合节点的「节点类型序列 + compositePins 输入/输出数量」，
   作为复刻的精确参照（`tools/compare.py` 的 ID2NAME 映射就是逆向产物）。
2. **纯数据流优先**：变量运算、逻辑运算、矩阵运算都是纯数据流，最能验证编译器；调用流（含 exec 节点）
   和事件流（含事件节点）更复杂，留到后续批次。
3. **forceFull 保证全量输出**：复刻的复合节点加 `forceFull: true`，确保即使未被宿主调用也进 GIA，
   便于完整比对。
4. **比对用 multiset 而非序列**：原版（编辑器手写）和复刻版（编译器生成）的节点存储顺序不同，
   但逻辑连线等价；比对节点类型 multiset 才是判断「逻辑是否等价」的正确维度。

## 后续批次（待做）

- batch3：定时器/延时包（调用流 + 事件流，更复杂）
- batch4：实体查询/销毁包（含列表迭代、动态列表转静态）
- batch5：排名/结算包（字典排序）
- 枚举转换包：**受 O-2026-08-22-1 阻塞**，等编译器修复 enum 输入后再复刻。

## 文件清单

- `examples/composite-replica/src/batch1-variable-logic.ts`：变量运算 + 逻辑运算（14 个复合）
- `examples/composite-replica/src/batch2-random-enum-matrix.ts`：随机 + 矩阵（6 个复合）
- `examples/composite-replica/tools/compare.py`：自动化比对脚本
- `examples/composite-replica/gsts.config.ts`：编译配置
