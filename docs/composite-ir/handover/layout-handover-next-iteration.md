# 布局任务下一轮交接 · 小步游戏内验证流程

> 状态：当前推荐 / 待继续
> 来源：当前代码实现 + 用户游戏内测试反馈 + 第十轮 handover
> 最近校验：2026-07-07
> 适用范围：下一轮继续推进 gsts 布局调参，尤其是 `布局c` 系列与数据链复杂度扩展测试

> **当前基线**：`布局c` 基础复刻与 long-input step2 已游戏内测试通过，并已提交。
> **核心要求**：下一轮必须保持“小步迭代 → 导出独立 GIA → 用户游戏内测试 → 通过后提交”的节奏。遇到问题、阻碍或不确定点时，先停下来和用户确认，不要自行大范围推断或连续改多处。
> **上一轮完整记录**：[layout-handover-round-10.md](layout-handover-round-10.md)
> **当前权威布局设计**：[../layout-patterns.md](../layout-patterns.md)

---

## 一、下一轮必须遵守的工作节奏

每一个布局改动都按以下流程执行：

1. **只选择一个小问题**
   - 例如只调一个参数、只新增一个测试场景、只改变一个局部算法。
   - 不要在同一步同时修改横向距离、纵向下移、数据节点间距和 root lane 规则。

2. **修改测试文件内部图名**
   - 每次导出前必须更新 `g.server({ name })`，例如：

```text
R6-C参考复刻-long-input-step3
R6-C参考复刻-long-input-2chain-step1
```

- 目的是让用户在游戏里能明确区分当前测试版本。

3. **生成独立 GIA 文件名**
   - 导出到 Windows 游戏目录，文件名带 step：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/layout-r6-c-reference-repro-long-input-step3.gia
```

4. **报告自动分析，但不替代游戏反馈**
   - 至少跑：

```bash
npx tsx tests/composite/dump-nodes.ts <generated.gia>
npx tsx tests/composite/analyze-exec-lanes.ts <generated.gia>
```

- 如果涉及数据链，补跑：

```bash
npx tsx tests/composite/trace-dataflow.ts <generated.gia> <attack-node-id> --all-params
```

5. **等待用户游戏内反馈**
   - 用户说“通过”后再提交。
   - 用户指出截图问题时，先读取截图并复述问题，再选择一个小点修复。

6. **通过后立即提交**
   - 每个通过的小步单独提交，便于追踪：

```bash
git add <changed-files>
git commit -m "fix: ..."
```

---

## 二、当前已验证基线

已通过并提交的关键节点：

```text
9d0b369 test: add layout c reference repro
c52881e fix: stabilize layout c lane spacing
fcd93af fix: tune layout c nested branch spacing
ed1a3ef fix: offset child lane after occupied root branch
6009cb8 test: cover layout c long input chain
5f77137 chore: add layout c debug helpers
ca9e259 docs: record layout c validation
```

已通过的游戏内验证：

| 场景              | 文件                                              | 结论                              |
| ----------------- | ------------------------------------------------- | --------------------------------- |
| 基础 `布局c` 复刻 | `tests/layout-r6-c-reference-repro.ts`            | 结构一致，step2a/2b/2c/2e/2f 通过 |
| 长输入链一层      | `tests/layout-r6-c-reference-repro-long-input.ts` | long-input step2 通过             |

当前主要布局实现点：

```text
src/compiler/ir_to_gia_transform/layout.ts
```

已验证规则：

1. event/exec root 不参与数据节点重排，必须保持入口锚点。
2. root 直接分支使用基础泳道，不被上一条 root 分支完整子树推到最底部。
3. nested sibling 需要按上方数据重的局部区块下推。
4. 数据节点贴近消费者；`布局c` 类多输入节点当前数据节点垂直间距约 190。
5. 执行横向距离主要按数据链深度增加，多输入直接输入数量只 capped 增加。
6. 第二条 root lane 的后续节点可继承已下移 lane，并保持同一 Y 水平平移。
7. 长输入链需要更大的 bounded data padding：当前为 `min(520, round(extraDataHeight * 0.35))`。

---

## 三、下一轮推荐第一个小步

推荐继续做：**long-input 数据链复杂度阶梯测试 Step A：一个输入参数增加到两层计算链。**

当前已通过 long-input step2：

```text
Get Node Graph Variable(locationOffset)
Get Node Graph Variable(locationOffsetDelta)
        ↓
3D Vector Addition
        ↓
Initiate Attack.locationOffset
```

下一步建议扩展为两层：

```text
Get Node Graph Variable(locationOffset)
Get Node Graph Variable(locationOffsetDeltaA)
        ↓
3D Vector Addition A
Get Node Graph Variable(locationOffsetDeltaB)
        ↓
3D Vector Addition B
        ↓
Initiate Attack.locationOffset
```

建议新增或修改测试为：

```text
tests/layout-r6-c-reference-repro-long-input.ts
```

测试图名：

```text
R6-C参考复刻-long-input-step3
```

导出文件：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/layout-r6-c-reference-repro-long-input-step3.gia
```

验收重点：

1. 攻击节点不要被推得过远。
2. 两层数据链能读出从左到右的数据依赖。
3. 下方 sibling 不与数据节点重叠。
4. 第二条 root lane 和后续下移链不被破坏。
5. 如果出现问题，只修一个小点；不要顺手调整基础 `布局c` 参数。

---

## 四、如果 step3 暴露问题，优先判断原因

### 4.1 下方 sibling 与数据链重叠

可能原因：`dataLanePadding` 仍没有覆盖更深数据 DAG。

优先小修：只提高长链场景敏感度，或者把 padding 从纯数量估算改为更接近实际 data block bottom 的估算。

不要直接大改 root lane。

### 4.2 攻击节点横向过远

可能原因：执行节点 horizontal gap 对 `maxDepth` 或直接输入 capped 仍偏大。

优先小修：只调 `desiredGap` 的深度增量或 cap。

不要同时改数据节点 Y 间距。

### 4.3 数据节点之间重叠或太拥挤

可能原因：`dataYBelowConsumer = 190` 对更复杂链过小。

优先小修：只在多层链场景增加局部 row spacing，或根据同一 data depth 的节点数增加行距。

不要直接回退基础场景通过的 190。

### 4.4 root 第二条线被再次影响

可能原因：`minFirstChildLaneOffset` 传递过强或过弱。

优先小修：只调 root child 后续链继承规则。

---

## 五、不要重复踩的坑

1. **不要用未复刻结构的抽象测试判断布局参数**
   - 第九轮的抽象三分支测试不能覆盖 `布局c` 的真实问题。
   - 先保证节点类型和数据来源尽量一致。

2. **不要把 event 当普通数据节点重排**
   - event 可以连蓝色数据线，但必须留在左侧入口。

3. **不要一次改多个参数**
   - 用户希望每一步都能在游戏内看出单一变化。

4. **不要让自动工具替代游戏截图反馈**
   - `dump-nodes` / `analyze-exec-lanes` 只能辅助定位。
   - 游戏内截图仍是最终裁判。

5. **raw control-flow DSL 复刻仍有 Stage 1 阻碍**
   - `f.node(..., raw([...]))` 在普通 `.ts` 编译路径中会被 array literal 推断拦住。
   - 本轮最终采用高层 DSL 复刻；除非用户明确要求，否则下一轮不要先修 raw DSL。

6. **vec3 图变量要显式写 `vec3([1,2,3])`**
   - 裸 `[1,2,3]` 与 float list 有歧义。

---

## 六、常用命令

```bash
# 构建
npm run build

# 生成基础复刻
node bin/gsts.mjs tests/layout-r6-c-reference-repro.ts || true

# 生成 long-input 复刻
node bin/gsts.mjs tests/layout-r6-c-reference-repro-long-input.ts || true

# 导出到游戏目录示例
cp dist/tests/layout-r6-c-reference-repro-long-input.gia \
  /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/layout-r6-c-reference-repro-long-input-step3.gia

# 坐标和 lane 分析
npx tsx tests/composite/dump-nodes.ts dist/tests/layout-r6-c-reference-repro-long-input.gia
npx tsx tests/composite/analyze-exec-lanes.ts dist/tests/layout-r6-c-reference-repro-long-input.gia

# 数据流追踪，节点号按 dump-nodes 输出选择
npx tsx tests/composite/trace-dataflow.ts dist/tests/layout-r6-c-reference-repro-long-input.gia <attack-node-id> --all-params

# 布局校准分析
npx tsx tests/composite/calibrate-layout-lanes.ts dist/tests/layout-r6-c-reference-repro-long-input.gia
```

WSL 下生成 `.gia` 后可能仍因注入阶段找不到 `Beyond_Local_Save_Level` 报错；只要 `dist/tests/*.gia` 已产出即可复制给用户测试。

---

## 七、给下一轮助手的一句话

> 当前 `布局c` 基础复刻和一层 long-input 已通过游戏内测试并提交。下一轮从 long-input 两层数据链开始，每次只改一个小点，更新测试图名和导出文件名，等用户游戏内反馈；通过后立即提交。如果截图暴露问题，先复述问题并确认只修一个点，不要连续深入改多个算法。
