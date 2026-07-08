# 布局任务交接文档 · 第十四轮

> 状态：待继续 / 当前实现分析 / 历史记录
> 来源：当前代码实现 + 用户游戏内测试反馈 + 截图观察 + Round 13 已验证导出
> 最近校验：2026-07-08
> 适用范围：gsts 当前输出的主图布局与复合节点 impl 布局统一工作；不代表编辑器唯一布局规则

> **本轮目标**：承接 Round 13。复合 impl 已复用主图布局核心，且 Round 13 已完成并通过游戏内验证：复合边界输出虚拟消费者、数据区避开执行泳道、局部数据倒退/重叠修复。当前只剩 3.5：数据链局部压缩。下一轮应从主图同构 `step4-compact-chain` 开始，确认连续数据链更紧凑，再回归复合 impl `step6-compact-chain`。
> **上一轮文档**：[layout-handover-round-13.md](layout-handover-round-13.md)
> **通用工作规则**：[layout-working-rules.md](layout-working-rules.md)
> **当前权威设计文档**：[../layout-patterns.md](../layout-patterns.md)
> **当前推荐 API 文档**：[../../architecture/composite/raw-control-flow-dsl-quickstart.md](../../architecture/composite/raw-control-flow-dsl-quickstart.md)、[../../architecture/composite/dsl-api.md](../../architecture/composite/dsl-api.md)

---

## 一、Round 13 已验证基线

### 1.1 已提交代码

```text
08eb760 fix: anchor composite output layout
01532de fix: keep data layout out of exec lanes
353249b fix: prevent local data backflow in layout
bf1f6ad docs: update layout round 13 status
```

相关实现集中在：

```text
src/compiler/ir_to_gia_transform/layout.ts
src/compiler/ir_to_gia_transform/composite.ts
```

相关测试：

```text
tests/layout-r6-d-main-equivalent.ts
tests/layout-r6-d-composite-summary.ts
```

### 1.2 已通过游戏内验证的导出

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局r6-d-composite-summary-step3-output-anchor.gia
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局r6-d-composite-summary-step4-data-lane.gia
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局r6-d-main-equivalent-step3-no-backflow.gia
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局r6-d-composite-summary-step5-no-backflow.gia
```

图内 name 已按工作规则同步：

```text
_GSTS_R6-D主图同构-step3-no-backflow
_GSTS_R6-D复合摘要-step5-no-backflow
```

### 1.3 当前已解决或缓解的问题

1. 复合 impl 复用主图布局核心。
2. 复合 OutParam 边界输出有虚拟消费者锚点。
3. 根级执行泳道会按上一分支数据块高度预留空间，避免数据区插入泳道之间。
4. 多消费者数据节点不再被后续大执行消费者轻易抢走锚点。
5. 局部数据链中已约束明显倒退线和局部重叠。

---

## 二、当前剩余问题：数据链局部压缩

Round 13 剩余的核心问题是 3.5：连续数据链仍可能过于松散，横跨较大空白。下一轮目标不是全局压缩画布，而是只压缩同一局部消费者附近的连续数据链。

重点链路来自主图同构：

```text
get_local_variable#3 -> _3d_vector_modulo_operation#8 -> addition#10 -> _3d_vector_zoom#12
```

Round 13 step3 自动 dump 显示该链路已单调向右：

```text
#3 x≈618 -> #8 x≈998 -> #10 x≈1447 -> #12 x≈2414
```

下一轮可尝试把这类局部链路收得更紧，但必须保持：

- 不重新出现 `producer.x >= consumer.x` 的局部倒退。
- 不让 `addition` 等节点重新压到三维向量节点上。
- 不把普通参数栈横向摊开。
- 不把复合主图重新拉到异常宽度。

---

## 三、建议实施顺序

### Step 1：主图同构 compact-chain

先更新测试图名：

```text
R6-D主图同构-step4-compact-chain
```

建议导出：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局r6-d-main-equivalent-step4-compact-chain.gia
```

生成命令：

```bash
npm run build
node bin/gsts.mjs tests/layout-r6-d-main-equivalent.ts || true
export_dir='/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export'
rm -f "$export_dir/布局r6-d-main-equivalent-step4-compact-chain.gia"
cp dist/tests/layout-r6-d-main-equivalent.gia "$export_dir/布局r6-d-main-equivalent-step4-compact-chain.gia"
```

如果只改测试 name、不改布局实现，则不需要 `npm run build`。如果改 `layout.ts`，必须先 build。

### Step 2：复合 impl 回归 compact-chain

主图通过后，再更新复合测试图名：

```text
R6-D复合摘要-step6-compact-chain
```

建议导出：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局r6-d-composite-summary-step6-compact-chain.gia
```

生成命令：

```bash
node bin/gsts.mjs tests/layout-r6-d-composite-summary.ts || true
export_dir='/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export'
rm -f "$export_dir/布局r6-d-composite-summary-step6-compact-chain.gia"
cp dist/tests/layout-r6-d-composite-summary.gia "$export_dir/布局r6-d-composite-summary-step6-compact-chain.gia"
```

### Step 3：通过后提交

用户游戏内确认主图和复合回归都通过后，再提交。提交前运行：

```bash
git diff --check
npm run build
```

---

## 四、建议代码切入点

优先查看：

```text
src/compiler/ir_to_gia_transform/layout.ts
```

相关函数：

- `expandExecGapsForDataChains(...)`
- `resolveDataBackflowAndOverlap(...)`
- `computeDataDepths(...)`
- `collectDataAncestors(...)`
- `buildDataChildrenMap(...)`

可能方向：

1. 对同一局部数据链计算 span，限定额外横向间距上限。
2. 对同一消费者附近的 direct input 和其数据祖先做局部排序，而不是按全局深度拉开。
3. 保留 Round 13 的防倒退与避让约束，把压缩作为它之后或之前的局部 pass，但不要让两个 pass 反复把节点推远。

不要做：

- 不要全局缩小 `columnWidth` 或 `rowHeight`。
- 不要回退复合 impl 复用主图布局核心。
- 不要为了压缩主图而穿透上游复合调用去重排它的输入参数栈。
- 不要把没有直接数据关系的普通参数节点强制横向避让。

---

## 五、验证与观察重点

主图同构 `step4-compact-chain` 重点看：

- 左下数据链是否比 step3 更紧凑。
- 是否仍保持数据从左到右。
- `addition` 是否不再与三维向量节点重叠。
- `initiateAttack` 参数区是否没有重新吸走上游中间链。
- 整体是否比人工修复参考更接近。

复合 impl `step6-compact-chain` 重点看：

- 复合窗口内部是否同步改善。
- OutParam 边界输出是否仍有合理锚点。
- 三条执行泳道是否仍有足够垂直间距。
- 主图复合调用参数栈是否未被横向摊开。

可对照参考：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/复合节点-布局错误-step2-主图同构-修复.png
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/复合节点-布局错误-step2-主图同构-修复.gia
```

---

## 六、给下一位助手的一句话

> Round 13 已完成并提交：复合输出锚点、数据避开执行泳道、局部倒退/重叠修复都已游戏内通过。现在只剩数据链局部压缩。先做 `R6-D主图同构-step4-compact-chain`，再做 `R6-D复合摘要-step6-compact-chain` 回归；不要全局缩小布局参数，也不要破坏 Round 13 的防倒退和复合参数栈约束。
