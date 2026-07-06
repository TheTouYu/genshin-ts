# 复合节点 Worktree 操作手册

> 状态：部分过期 / 历史记录
> 来源：开发过程工作流记录
> 最近校验：2026-07-06
> 适用范围：记录旧版 worktree 隔离工作流。当前 raw control-flow DSL 已改变 API 形态，本文不作为新会话当前任务入口。
>
> 当前权威入口：[documentation-map.md](../documentation-map.md)、[raw-control-flow-dsl-quickstart.md](../architecture/composite/raw-control-flow-dsl-quickstart.md)、[dsl-api.md](../architecture/composite/dsl-api.md)

## 给新会话的进入指引

每次新会话开始时，按以下步骤进入：

1. 读本文件，找到第一个 `[ ]` 状态的任务
2. 读该任务的「参考文件」和「改动范围」
3. 用 `EnterWorktree` 创建隔离工作区
4. 告知用户你需要什么参考 GIA 文件
5. 获得参考文件后，反复「改代码 → build → 生成 → `gia-diff -c` 比对」直到 0 实质差异
6. 返回主工作区，勾选任务，提交

---

## 工作流模板

```
会话开始:
  你: "当前任务: [任务名]。我需要你提供 [参考GIA路径] 的参考文件。"

用户提供参考文件后:
  你: "已收到。开始 worktree → 改代码 → 生成 → diff 比对。"

每个修改周期:
  1. 改 src/ 代码
  2. npm run build
  3. npx tsx tests/composite/<test>.ts   # 生成 GIA
  4. npx tsx tests/composite/gia-diff.ts <ref> <gen> -c   # 比对
  5. 分析差异 → 继续修改或报告完成

任务完成:
  你: "0 实质差异。请游戏验证。验证通过后我会勾选任务并提交。"
```

---

## 关键命令速查

```bash
# 生成 two_simple
npx tsx tests/composite/test-two-composites-simple.ts

# 生成 two_exec
npx tsx tests/composite/test-two-exec.ts

# 生成 mixed_composite_and_normal
npx tsx tests/composite/test-mixed-composite-normal.ts

# 生成 basic_call_param
npx tsx tests/composite/test-basic-call-param.ts

# 生成 两个复合节点
npx tsx tests/composite/test-two-composites.ts

# 生成 game-demo (A/B/C)
npx tsx tests/composite/test-composite-game-demo.ts

# 比对工具
npx tsx tests/composite/gia-diff.ts <ref.gia> <gen.gia>       # 完整对比
npx tsx tests/composite/gia-diff.ts <ref.gia> <gen.gia> -c    # 紧凑模式(忽略cosmetic)
npx tsx tests/composite/gia-diff.ts <ref.gia> <gen.gia> -c -q # 安静模式(仅退出码)

# 回归测试
npx tsx tests/composite/test-two-exec.ts      # 双exec串行
npx tsx tests/composite/test-basic-call-param.ts  # 带参数
npx tsx tests/composite/test-two-composites.ts    # 两个复合
```

**GIA 输出目录**: `/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/`
**参考文件目录**: `.../user_edit/`（用户手动放置）
**验证通过目录**: `.../真-测试通过/`（mv 进去即表示通过）

---

## diff 工具已知局限

主图节点对比是**按位置**而非**按语义**。当 REF 和 GEN 使用不同的复合定义时（如 REF="加法"、GEN="翻倍"），diff 会产生 false positive。

**规避方法**: 确保测试脚本生成的复合定义与参考文件一致（同名、同输入输出数、同类型）。如果参考用了新定义，同步更新测试脚本。

Accessories 对比已支持语义匹配（按 CompositeDef 名称配对），准确可靠。

---

## 任务列表

### ✅ T01: 单 exec 复合
- **状态**: 已完成
- **参考**: `user_edit/基本调用节点.gia` → `真-测试通过/basic_call.gia`
- **测试**: `test-simple-basic-call.ts`

### ✅ T02: 带参数 exec 复合
- **状态**: 已完成
- **参考**: `user_edit/带参数打印复合节点.gia` → `真-测试通过/basic_call_param.gia`
- **测试**: `test-basic-call-param.ts`
- **关键修复**: ① marker 节点 args 包含输入值 ② InParam 字面量值通过 setLiteralArgValue 填充

### ✅ T03: 双 exec 串行 (终端+非终端)
- **状态**: 已完成
- **参考**: `user_edit/two_exec.gia` / `user_edit/two_exec2.gia` → `真-测试通过/two_exec.gia`
- **测试**: `test-two-exec.ts`
- **关键修复**: ① 非终端复合保留 OutFlow ② 终端复合移除 OutFlow ③ compositePins 含 InFlow+OutFlow

### ✅ T04: 混合链 (双复合 + 普通节点)
- **状态**: 已完成
- **参考**: `user_edit/复杂2_exec.gia` → `真-测试通过/mixed_composite_and_normal.gia`
- **测试**: `test-mixed-composite-normal.ts`

### ✅ T05: 纯数据复合基础 (翻倍 + 加一)
- **状态**: 已完成 (待游戏重新验证)
- **参考**: `user_edit/two_simple.gia`
- **测试**: `test-two-composites-simple.ts`
- **关键修复**: 
  ① impl 数据节点 bConcreteValue 包裹
  ② impl 数据节点 OutParam pin
  ③ compositePins OutParam 映射 (outputValues metadata)
  ④ 同一输入多次使用→多条 compositePin (__captureInputName)
  ⑤ 主图 connected InParam value=null
  ⑥ buildPlaceholderPin 类型推断

### ✅ T06: 数据节点类型覆盖 (float/bool/vec3)
- **状态**: 已完成 ✅ (2026-06-11)
- **游戏验证**: ✅ `两个复合节点.gia` 通过
- **参考**: 用户提供 vec3 复合（向量加法 + 求模）
- **改动**: `core.ts` — createTypedValue 修复（vec3/str 占位符不创建 literal 元数据）；`composite.ts` — vec3NodeTypes/vec3ToFloatNodeTypes 集合, buildPlaceholderPin/makeVarBaseValue/wrapConcreteValue 支持 VectorBase, isDataProducerNode 识别 vec3 节点, 自动 OutParam 对 vec3→float 节点修正输出类型
- **文档**: `composite-full-scenario-gaps.md` 问题 2/3/4

### [ ] T07: local_variable + *_list 类型支持
- **状态**: 待开始
- **参考**: 需要用户提供含 local_variable 或 _list 类型 input/output 的复合 GIA
- **改动**: `index.ts` — compositeTypeToBaseTag 扩展
- **文档**: `composite-connection-boundary-matrix.md` 第 1 节
- **工作量**: 小（单函数）
- **需要用户提供**: 含 local_variable 或 _list 的复合 GIA 参考

### [ ] T08: 嵌套复合
- **状态**: 调研完成（三文件交叉验证 ✅），待实现
- **参考**: `嵌套.gia`（2层嵌套）、弹球/传球/物理运动（共 90 个嵌套节点）
- **改动**: `composite.ts` buildImplGraphNodes + buildImplNodePins + resolveImplNodeId；`composite_registry.ts` compositePins 不再跳过 `__composite_call__`
- **文档**: `composite-nested-composite-guide.md`（完整编码规则 + 三文件统计）
- **工具**: `analyze-nested-composites.ts`（统计 pin 模式）
- **工作量**: 中

### [ ] T09: impl 特殊节点 pin 布局
- **状态**: 待开始
- **参考**: 需要用户提供含 assembly_list / assembly_dictionary / multiple_branches / 信号节点 的复合 GIA
- **改动**: `composite.ts` buildImplNodePins
- **文档**: `composite-connection-boundary-matrix.md` 第 5 节
- **工作量**: 中（每个节点类型需特殊处理）
- **需要用户提供**: 含此类节点的复合 GIA 参考

### [ ] T10: 遗留修整 (event pins / nodeIndex / Normal→Composite)
- **状态**: 待开始
- **改动**: `index.ts` post-encoding
- **文档**: `composite-full-scenario-gaps.md` 问题 5, `.claude/memory/composite_gia_diff_analysis.md`
- **工作量**: 小
- **需要用户提供**: 待 T06-T09 完成后统一修

### ✅ T11: 多 OutFlow 复合节点
- **状态**: Phase 1 + Phase 2 完成
- **Phase 1**: 系统节点包装（double_branch / finite_loop / 顺序执行）— 已对齐参考文件
- **Phase 2**: 普通节点组合 + 混合执行数据 + 纯数据算术链 + 输入扇出
- **参考**: `user_edit/顺序执行-比对.gia`, `complex_gia/弹球.gia`, `传球.gia`, `物理运动.gia`
- **改动文件**: `composite.ts`（重写 buildImplNodePins）、`composite_registry.ts`（toIRLiteral 修复）、`core.ts`、`nodes.ts`、`layout.ts`、`index.ts`
- **关键修复（本轮）**:
  1. 移除 `noPinSystemNodes` → 所有节点统一按捕获数据编码 pin
  2. OutFlow 按 source_index 拆分、connects 对全部节点生效
  3. `toIRLiteral()` pin metadata → conn 序列化（数据连线修复）
  4. branchExec sourceIndex 校正（无条件分叉全部 sourceIndex=0）
  5. double_branch 无参默认走 OutFlow[1]（false），显式 true 走 OutFlow[0]
  6. finite_loop 分支语义区分（body vs complete）
  7. impl 图节点布局：exec BFS + 数据拓扑网格
- **新工具**: `tests/composite/gia-inspect.ts`（模块化 GIA 检查）、`tests/composite/gia-compare.ts`（8 维度语义对比）
- **Phase 3 待做**: 嵌套复合、vec3 类型、游戏验证未通过的边缘 case

### [ ] T12: GIA 定义文件格式 (which=12)
- **状态**: 待开始
- **依赖**: T11 游戏验证通过后
- **改动**: `index.ts` irToGia 模式切换
- **文档**: `multi-outflow-composite-guide.md`

---

## 依赖关系

```
T06 (类型覆盖) ──┐
T07 (list类型)  ──┤  可并行
T08 (嵌套复合)  ──┤
T09 (特殊节点)  ──┘
       │
       ▼
T10 (遗留修整) ──► T11 (多OutFlow) ──► T12 (which=12)
```

T06-T09 互不依赖，可并行在 4 个 worktree 中开展。

---

## 操作清单（每次任务）

- [ ] 用户提供参考 GIA 到 `user_edit/` 目录
- [ ] `EnterWorktree` 创建隔离工作区
- [ ] 编写/更新测试脚本以匹配参考文件的复合定义
- [ ] 改代码
- [ ] `npm run build`
- [ ] 运行测试脚本生成 GIA
- [ ] `gia-diff -c` 比对，差异数 → 0
- [ ] 回归测试（其他测试脚本全部通过）
- [ ] 用户游戏验证
- [ ] `mv <file>.gia 真-测试通过/`
- [ ] 返回主工作区，勾选任务
- [ ] 提交代码
