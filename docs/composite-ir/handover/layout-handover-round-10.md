# 布局任务交接文档 · 第十轮

> 状态：已验证 / 历史记录
> 来源：当前代码实现 + 真实 GIA 参考文件 + 用户游戏内测试反馈
> 最近校验：2026-07-07
> 适用范围：gsts 当前输出的 `布局c` 类多执行泳道与数据链布局；不代表编辑器唯一布局

> **本轮目标**：严格复刻 `布局c.gia` 的节点结构，按用户游戏内反馈分小步修复布局问题，并记录已通过的布局参数和剩余风险。
> **上一轮文档**：[layout-handover-round-9.md](layout-handover-round-9.md)
> **当前权威设计文档**：[../layout-patterns.md](../layout-patterns.md)
> **本轮结论**：`布局c` 复刻结构已确认一致；step2a/2b/2c/2e/2f 与 long-input step2 均经用户游戏内测试通过，并已分阶段提交。

---

## 一、本轮参考与复刻范围

参考文件与截图：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/布局c.gia
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/布局c-多条连线-50%缩放.png
```

复刻测试：

```text
tests/layout-r6-c-reference-repro.ts
tests/layout-r6-c-reference-repro-long-input.ts
```

结构已由用户确认一致。基础复刻拓扑：

```text
n1 When Entity Is Created
├─ n2 Print String
│  ├─ n7/n5 Initiate Attack
│  └─ n8/n11 Print String（上方参数多，所以距离下移）
└─ n9/n3 Print String
   └─ n10/n12 Print String（上方线路占位，所以继续下移）
      └─ n11/n13 Print String（保持同一 Y 平移）
```

`Initiate Attack` 数据输入复刻为：

```text
InParam[0] entity <- event entity
InParam[1] float  = 999
InParam[2] float  = 1.2
InParam[3] vec3   <- Get Node Graph Variable / long-input 中为 vec3 addition
InParam[4] vec3   <- Get Node Graph Variable
InParam[5] str    <- Data Type Conversion(event GUID)
InParam[6] bool   <- Get Node Graph Variable
InParam[7] entity <- event entity
```

---

## 二、本轮已通过的游戏内验证步骤

每一步都导出独立 GIA，并由用户游戏内反馈确认。

| 步骤             | 导出文件                                           | 修复点                                                              | 游戏内反馈 |
| ---------------- | -------------------------------------------------- | ------------------------------------------------------------------- | ---------- |
| step2a           | `layout-r6-c-reference-repro-step2a.gia`           | 数据链重排不再移动 event/exec root                                  | 通过       |
| step2b           | `layout-r6-c-reference-repro-step2b.gia`           | root 直接分支独立泳道，不被上一条 root 分支整棵子树推远             | 通过       |
| step2c           | `layout-r6-c-reference-repro-step2c.gia`           | 攻击节点横向距离按数据链深度和 capped 多输入估算                    | 通过       |
| step2e           | `layout-r6-c-reference-repro-step2e.gia`           | 数据输入节点垂直间距从 230 调为 190，并保留 nested sibling 下移修正 | 通过       |
| step2f           | `layout-r6-c-reference-repro-step2f.gia`           | 第二条 root 线路的后续节点继承占位后的最低 lane offset              | 通过       |
| long-input step2 | `layout-r6-c-reference-repro-long-input-step2.gia` | 更长输入链增加 nested sibling 下移 padding                          | 通过       |

注意：step2d 生成过，但 step2e 在其基础上修正数据节点间距后通过；最终以 step2e/step2f/long-input step2 为准。

---

## 三、已提交的代码节点

```text
9d0b369 test: add layout c reference repro
c52881e fix: stabilize layout c lane spacing
fcd93af fix: tune layout c nested branch spacing
ed1a3ef fix: offset child lane after occupied root branch
6009cb8 test: cover layout c long input chain
5f77137 chore: add layout c debug helpers
```

涉及的主要文件：

```text
src/compiler/ir_to_gia_transform/layout.ts
tests/layout-r6-c-reference-repro.ts
tests/layout-r6-c-reference-repro-long-input.ts
tests/composite/calibrate-layout-lanes.ts
tests/variables_definition_test.ts
```

---

## 四、当前实现要点

当前 `layout.ts` 中对 `布局c` 类场景有效的经验规则：

1. **event/exec root 不参与数据节点重排**
   - 数据链可从 event 输出取值，但 event 节点必须保持左侧入口锚点。
   - `expandExecGapsForDataChains(...)` 重排数据祖先时排除 `execNodes`。

2. **root 直接分支独立成基础泳道**
   - event 的直接 child 使用基础 root swimlane spacing。
   - 不把上一条 root child 的完整 nested subtree bottom 直接加到下一条 root child 上。

3. **nested sibling 仍按上方区块下推**
   - 非 root sibling 使用 previous subtree bottom + spacing + data padding。
   - `dataLanePadding = min(520, round(extraDataHeight * 0.35))`。
   - 这样基础复刻与 long-input 场景都能避开多输入/长输入链占位。

4. **数据节点贴近消费者，垂直间距 190px**
   - 当前 `dataYBelowConsumer = 190` 已经通过 `布局c` 基础和 long-input 变体游戏内测试。

5. **执行横向 gap 避免多输入节点爆炸**
   - 执行节点右移主要按数据链深度 `maxDepth`，直接输入数量只 capped 到 2 档。
   - 解决 `Print String -> Initiate Attack` 横向距离过大问题。

6. **root 后续链继承占位后的最低 lane offset**
   - 第二条 root lane 的入口保持基础位置。
   - 它的后续节点可被上一条 root 分支的下方占位推到更低 lane，并保持同一 Y 平移。

---

## 五、自动验证命令

本轮常用命令：

```bash
npm run build
node bin/gsts.mjs tests/layout-r6-c-reference-repro.ts
node bin/gsts.mjs tests/layout-r6-c-reference-repro-long-input.ts
npx tsx tests/composite/analyze-exec-lanes.ts dist/tests/layout-r6-c-reference-repro.gia
npx tsx tests/composite/dump-nodes.ts dist/tests/layout-r6-c-reference-repro.gia
npx tsx tests/composite/trace-dataflow.ts dist/tests/layout-r6-c-reference-repro-long-input.gia 9 --all-params
npx tsx tests/composite/calibrate-layout-lanes.ts <file.gia>
```

WSL 环境下 `node bin/gsts.mjs ...` 在 `.gia` 生成后仍可能因为注入阶段找不到 `Beyond_Local_Save_Level` 报错；这不影响 `dist/tests/*.gia` 产出。

---

## 六、剩余风险与下一步

1. 当前参数是由 `布局c` 和 long-input 变体验证出来的经验值，不保证覆盖所有复杂图。
2. `dataLanePadding` 仍是估算，不是最终数据节点真实 `maxY` 的二次回流；更复杂数据 DAG 可能仍需按实际 data block bottom 做二阶段修正。
3. long-input step2 通过说明长输入链需要更高 padding，但如果基础短链被反馈偏低，后续应改为“长链额外 padding”，而不是统一提高。
4. raw control-flow `f.node(..., raw([...]))` 在普通 `.ts` 编译路径中仍暴露 Stage 1 对 array literal 的提前处理问题；本轮最终回到高层 DSL 复刻，未修该编译器问题。
5. `vec3` 图变量应使用 `vec3([1, 2, 3])` 明确声明；裸 `[1, 2, 3]` 与 float list 有歧义。

---

## 七、给下一位助手的简短交接语

> `布局c` 复刻结构已确认一致，step2a/2b/2c/2e/2f 和 long-input step2 均经用户游戏内测试通过并提交。当前关键规则是：event/exec root 不参与数据重排；root direct children 使用独立基础泳道；nested siblings 仍按 previous block + data padding 下推；数据节点贴近消费者且垂直间距 190；长输入链需要更大的 `dataLanePadding = min(520, extraDataHeight*0.35)`。后续如继续调参，每次只改一个小点、导出独立 step 文件，用户通过后再提交。
