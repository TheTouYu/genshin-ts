# 完整复盘：3×3 魔方朝向表欧拉约定错误导致黑面（2026-08-21）

> 范围：3×3 魔方性能优化引入的 `orientIndexByEuler` / `localAxisTable` 生成器
> 视角：真实日志逐帧差分 + 引擎文档闭合结论
> 证据：日志 `Beyond_Debug_Log/2026-08-21_18-00-07_2795_110170759.gia`、`examples/rubik-3x3/tools/gen-orient-tables.mjs`、`docs/game-engine-knowledge/motion-devices.md`
> 状态：已修复并用户游戏验证通过

## 一、错误谱系总览

| # | 日期 | 根因层 | 具体错误 | 修复 | 状态 |
|---|---|---|---|---|---|
| 1 | 2026-08-21 | 旋转约定 | 生成器把 `rotate` 欧拉当成 `(y,x,z)`，矩阵用 `Rz*Rx*Ry` | 改为 `(x,y,z)` + `R=Ry*Rx*Rz` | ✅ 已闭环 |
| 2 | 2026-08-21 | 性能 | 误删 `math_spin_axis_triple` 导致面轴错误 | 恢复原实现 | ✅ 已回滚 |
| 3 | 2026-08-21 | 编译器 | 复合 `*_list` 参数被编码成标量类型 | 修复 `build_composite_definition.ts` | ✅ 已闭环 |

## 二、最近一次错误的完整调查链

现象：按 R→L→U→D→F 转动后出现黑面（块在正确位置但朝向错误）。

调查链：
1. 提取日志操作序列：moveId = 1,2,3,4,5。
2. 对比 26 块实际位置与 cornerPos/edgePos 逻辑位置 → **全部一致**，排除位置错误。
3. 检查 `flow_update_orient` 写入的 `blockOrient` 与 `GetEntityLocationAndRotation` 实际欧拉。
4. 发现 key 计算（qy*16+qx*4+qz）得到的朝向索引与生成器表一致，但黑面仍出现 → 怀疑表本身错误。
5. 查询引擎文档 `motion-devices.md` §3.2/3.3：`rotate` 输出是 `(x,y,z)`，矩阵 `R=Ry(y)·Rx(x)·Rz(z)`。
6. 对照生成器：`eulerToMat(y,x,z)=Rz·Rx·Ry`，且把欧拉当 `(y,x,z)` → **约定错误**。
7. 修正生成器，重新生成表，注入后用户验证通过。

## 三、为什么反复出问题——系统性根因

1. **生成数学代码前没有先读权威文档**：motion-devices.md 早已闭合欧拉约定，但生成器按旧假设写。
2. **只验证“位置一致”不够**：黑面是朝向错误，位置差分不会暴露；必须同时验证朝向/欧拉。
3. **自洽不等于正确**：`orientIndexByEuler` 与 `localAxisTable` 内部自洽，但对外部真实约定不自洽。

## 四、流程与方法论教训

- 涉及旋转/欧拉/轴语义时，**先查 `motion-devices.md` §3**，再写生成器。
- 日志差分要分层：位置一致 ≠ 朝向一致；黑面优先怀疑朝向/贴纸。
- 生成表类工具应自带“已知样本断言”（如 (x=90,y=270,z=0) → 期望索引），防止回归。

## 五、风险探索与未闭合项

- `orientAfterMove` 表仍保留在生成器输出中但运行时未使用；未来若改用“转动后朝向表”需按同一约定验证。
- 打乱自动多步、重置删旧模型仍待日志验证（见 open-items）。

## 六、产出清单

- 修复：`examples/rubik-3x3/tools/gen-orient-tables.mjs`、`examples/rubik-3x3/src/orientTables.ts`
- 回归测试：`tests/composite/test-list-type-composite-input.ts`（列表类型编码，非本 bug 直接回归）
- 技能：`dsl-nodegraph-development`、`debug-log-investigator`、`genshin-ts-asset-operations` 已更新
- 文档：本复盘 + `motion-devices.md` 交叉引用
