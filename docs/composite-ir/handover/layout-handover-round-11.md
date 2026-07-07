# 布局任务交接文档 · 第十一轮

> 状态：已验证 / 历史记录 / 待继续
> 来源：当前代码实现 + 用户游戏内测试反馈 + 自动解码核验
> 最近校验：2026-07-07
> 适用范围：gsts 当前输出的 `布局c` long-input 多数据流、复合节点数据流编码与后续小步布局调参；不代表编辑器唯一布局

> **本轮目标**：在第十轮 `布局c` long-input 基线之上，继续扩展攻击节点输入数据流，修复由更复杂数据链和复合节点暴露出的布局与复合 GIA 编码问题，并保留下一轮继续调布局所需的交互细节。
> **上一轮文档**：[layout-handover-round-10.md](layout-handover-round-10.md)
> **当前权威设计文档**：[../layout-patterns.md](../layout-patterns.md)
> **本轮结论**：long-input step3/4/6/7 经用户游戏内反馈推进；step4 布局重叠问题已通过提高 data lane padding 修复；step6/step7 复合节点内部 concrete 类型断线问题已定位为编译器编码 bug 并修复提交。下一轮用户会继续提供 step7 的少量布局调整反馈。

---

## 一、本轮基线与最终测试文件

主要测试文件：

```text
tests/layout-r6-c-reference-repro-long-input.ts
```

最终图名：

```text
_GSTS_R6-C参考复刻-long-input-step7
```

最终导出给用户游戏内测试的文件：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局c-long-input-step7.gia
```

> **重要交互约定**：游戏导入目录是 `Beyond_Local_Export/` 根目录，不是 `Beyond_Local_Export/布局/` 等子目录。子目录通常由用户自己管理，助手不要动。每次覆盖同名测试文件前，先 `rm -f` 删除旧 `.gia`，再复制新产物。

推荐复制命令模板：

```bash
export_dir='/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export'
rm -f "$export_dir/布局c-long-input-step7.gia"
node bin/gsts.mjs tests/layout-r6-c-reference-repro-long-input.ts || true
cp dist/tests/layout-r6-c-reference-repro-long-input.gia "$export_dir/布局c-long-input-step7.gia"
```

WSL 下 `node bin/gsts.mjs ...` 在 `.gia` 生成后仍可能因为注入阶段找不到 `Beyond_Local_Save_Level` 报错；这不影响 `dist/tests/*.gia` 产出。

---

## 二、本轮游戏内验证步骤与结果

| 步骤 | 导出文件 | 重点变化 | 用户反馈 / 结论 |
|---|---|---|---|
| long-input step3 | `布局c-long-input-step3.gia` | 在 step2 基础上扩展更多数据流节点：vec3 subtraction、modulo、addition、zoom、cross product、logical OR 等 | 暴露布局问题：第一条线的第二个分支点下移距离不够，与数据流节点/连线重叠 |
| long-input step4 | `布局c-long-input-step4.gia` | 将 `dataLanePadding` 上限从 520 提高到 1100；同步更新测试 `name` | 用户游戏内测试通过，已提交 |
| long-input step5 | `布局c-long-input-step5.gia` | 把攻击节点输入参数计算抽成纯数据复合节点 `R6-C攻击参数数据流` | 用户反馈复合内部数据类型问题，疑似 int/float 导致连线断开 |
| long-input step6 | `布局c-long-input-step6.gia` | 修复复合 impl connected InParam 类型编码，conn 输入按 IR 真实类型生成 pin | 用户游戏内测试通过，已提交 |
| long-input step7 | `布局c-long-input-step7.gia` | 将缩放基数与逻辑或右侧参数作为复合输入；修复复合 impl OutParam concrete index | 用户确认“问题修复”，已提交；下一轮会继续给 step7 的少量布局调整反馈 |
| long-input step8 | `布局c-long-input-step8.gia` | 按复合调用节点输入/输出 pin 数估算额外视觉高度，避免大复合数据节点与下方分支重叠 | 用户游戏内测试通过；另用无复合的小输入回归文件验证普通布局未回退 |
| small-input regression step8 | `布局c-small-input-regression-step8.gia` | 新增不含复合节点、仅少量普通数据流输入的 R6-C 回归测试 | 用户游戏内测试通过 |
| long-input step9 | `布局c-long-input-step9.gia` | 给大 pin 数复合数据节点增加水平避让：右侧系统节点右移，但数据流节点保持原锚点不随额外间距整体右移 | 用户游戏内测试通过 |
| data-count step12 | `布局c-data-count-regression-step12-count-height.gia` | 新增不同普通数据流数量的两个攻击分支；普通数据行距调为 175，随数据节点数量增长的整体高度估算系数调为 150 | 用户游戏内测试通过；`布局c-long-input-step9.gia` 复合回归也重新生成并通过 |

本轮截图问题来源：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/布局c-多条连线-错误布局3-多数据流-step3-50%缩放.png
```

截图观察：第一条执行线内第二个分支（`Print String(上面一个节点图有比较多的参数，所以距离下移)`）仍太靠上，和上方数据流区域重叠/过近。对应修复是提高 nested sibling 的 data padding cap。

---

## 三、已提交的代码节点

本轮新增提交：

```text
a0eaee8 fix: widen layout padding for dense data branches
8190d21 fix: preserve concrete input types in composites
3c9c2db fix: encode composite concrete output types
```

相关历史基线仍包括第十轮提交：

```text
9d0b369 test: add layout c reference repro
c52881e fix: stabilize layout c lane spacing
fcd93af fix: tune layout c nested branch spacing
ed1a3ef fix: offset child lane after occupied root branch
6009cb8 test: cover layout c long input chain
5f77137 chore: add layout c debug helpers
ca9e259 docs: record layout c validation
```

涉及主要文件：

```text
src/compiler/ir_to_gia_transform/layout.ts
src/compiler/ir_to_gia_transform/composite.ts
tests/layout-r6-c-reference-repro-long-input.ts
```

---

## 四、当前最终代码行为

### 4.1 布局参数变化

`src/compiler/ir_to_gia_transform/layout.ts`：

```ts
const dataLanePadding = Math.min(1100, Math.round(extraDataHeight * 0.35))
```

第十轮文档中记录的旧值是：

```ts
min(520, round(extraDataHeight * 0.35))
```

本轮 step3 暴露“长/多数据流下 nested sibling 下移不足”，step4 通过用户游戏内测试后提交为 1100。注意这仍是 `布局c` long-input 经验值，不是最终通用最优参数。

### 4.2 当前复合节点结构

测试文件中新增纯数据复合节点：

```ts
const attackParams = g.defineComposite('R6-C攻击参数数据流', {
  inputs: {
    eventSourceGuid: { type: 'guid' },
    locationOffset: { type: 'vec3' },
    locationOffsetDelta: { type: 'vec3' },
    locationOffsetDeltaB: { type: 'vec3' },
    rotationOffset: { type: 'vec3' },
    rotationOffsetDelta: { type: 'vec3' },
    locationOffsetScaleBase: { type: 'float' },
    overwriteAbilityUnitConfig: { type: 'bool' },
    overwriteAbilityUnitConfigFallback: { type: 'bool' }
  },
  outputs: {
    abilityUnit: { type: 'str' },
    computedLocationOffset: { type: 'vec3' },
    computedRotationOffset: { type: 'vec3' },
    overwriteAbilityUnitConfig: { type: 'bool' }
  },
  build(args, f) {
    const abilityUnit = f.dataTypeConversion(args.eventSourceGuid, 'str')
    const locationOffsetA = f._3dVectorAddition(args.locationOffset, args.locationOffsetDelta)
    const locationOffsetB = f._3dVectorSubtraction(locationOffsetA, args.locationOffsetDeltaB)
    const locationOffsetLength = f._3dVectorModuloOperation(locationOffsetB)
    const locationOffsetScale = f.addition(locationOffsetLength, args.locationOffsetScaleBase)
    const computedLocationOffset = f._3dVectorZoom(locationOffsetB, locationOffsetScale)
    const rotationOffsetA = f._3dVectorAddition(args.rotationOffset, args.rotationOffsetDelta)
    const computedRotationOffset = f._3dVectorCrossProduct(rotationOffsetA, computedLocationOffset)
    const computedOverwriteAbilityUnitConfig = f.logicalOrOperation(
      args.overwriteAbilityUnitConfig,
      args.overwriteAbilityUnitConfigFallback
    )

    return {
      abilityUnit,
      computedLocationOffset,
      computedRotationOffset,
      overwriteAbilityUnitConfig: computedOverwriteAbilityUnitConfig
    }
  }
})
```

重要：本轮曾短暂改成 `_3dVectorZoom(locationOffsetB, args.locationOffsetZoomMultiplier)`，但用户指出需要保留“模长 + 输入参数作为缩放输入”的结构。最终 step7 已恢复为：

```text
_3d_vector_modulo_operation -> addition(float + float) -> _3d_vector_zoom.zoomMultiplier
```

### 4.3 复合 impl GIA 编码修复

`src/compiler/ir_to_gia_transform/composite.ts` 修复了两个具体 bug：

1. **connected InParam 类型**
   - 问题：复合 impl 中 `addition` / `greater_than` 等 concrete-wrapped 节点的 conn 输入原先用 `buildPlaceholderPin(pinIndex, node.type)`，默认按 `int` 编码。
   - 影响：IR 明明是 `float`，GIA 中被编码成 `int`，游戏内复合内部连线断开。
   - 修复：conn arg 使用连接携带的真实类型构建 pin，并按类型设置 concrete input index。

2. **OutParam concrete index**
   - 问题：显式 OutParam 映射时用了 `op.pinIndex` 作为 `bConcreteValue.indexOfConcrete`。`op.pinIndex` 是内部 OutParam pin index，不是 concrete map 类型索引；float 输出因此可能被编码成 bool/int 类错误类型。
   - 影响：`addition(float, float)` 的 OutParam 被下游 `_3dVectorZoom` 当作错误类型，导致缩放输入断开。
   - 修复：新增 `concreteOutputIndex(typeName)`，按输出类型映射：

```text
bool  -> 0
float -> 1
str   -> 2
int   -> 3
```

自动解码验证过：

```text
node 6 addition
  InParam[0] type=float cidx=1
  OutParam[0] type=float cidx=1
```

---

## 五、本轮自动验证命令

常用命令：

```bash
npm run build
node bin/gsts.mjs tests/layout-r6-c-reference-repro-long-input.ts || true
npx tsx tools/decode-gia.ts dist/tests/layout-r6-c-reference-repro-long-input.gia > /tmp/step7.decoded.json
npx tsx tests/composite/dump-nodes.ts dist/tests/layout-r6-c-reference-repro-long-input.gia
npx tsx tests/composite/analyze-exec-lanes.ts dist/tests/layout-r6-c-reference-repro-long-input.gia
npx tsx tests/composite/trace-dataflow.ts dist/tests/layout-r6-c-reference-repro-long-input.gia <node-id> --all-params
```

本轮排查复合类型时，直接查看 Stage 2 IR：

```bash
node - <<'NODE'
const fs = require('fs')
const doc = JSON.parse(fs.readFileSync('dist/tests/layout-r6-c-reference-repro-long-input.json', 'utf8'))[0]
const def = doc.compositeDefs[0]
for (const n of def.implNodes) {
  if (['addition', '_3d_vector_zoom'].includes(n.type)) console.log(n.id, n.type, JSON.stringify(n.args))
}
NODE
```

预期关键输出：

```text
addition [{ conn type=float }, { capture type=float }]
_3d_vector_zoom [..., { conn type=float }]
```

---

## 六、交互细节与下一轮必须记住的规则

1. **每步只改一个小点**
   - 用户明确希望继续第十轮的小步节奏：修改一个点、导出一个 step 文件、游戏内反馈通过后再提交。

2. **文件名和图内 name 必须同步**
   - 例如导出 `布局c-long-input-step7.gia` 时，测试文件中也要是：

```ts
name: 'R6-C参考复刻-long-input-step7'
```

- 不要出现文件名 step4 但图内 `_GSTS_...step3` 的情况。

3. **导出目录必须是 `Beyond_Local_Export/` 根目录**
   - 不要复制到 `Beyond_Local_Export/布局/`。
   - 如果误复制到子目录，应立即移动/删除错误位置文件，并向用户确认。

4. **覆盖前先删除旧 GIA**
   - 用户要求覆盖前移除已经复制到游戏目录的同名 `.gia`。

5. **用户截图是最终裁判**
   - 自动工具只能辅助。读取截图后先复述问题，再做一个小修。

6. **判断 API 写法 vs 编译器 bug 时先看 IR**
   - 如果 Stage 2 IR 类型正确但游戏断线，优先怀疑 Stage 3 GIA 编码。
   - 本轮两个复合断线问题就是这样定位的。

7. **不要把 handover 当当前 API 教程**
   - 当前复合 API 以 `docs/architecture/composite/dsl-api.md`、`raw-control-flow-dsl-quickstart.md`、`gia-encoding.md` 为准；本文件只记录本轮历史与下一轮注意事项。

---

## 七、下一轮建议处理顺序

用户下一轮会读取本文件后，继续提供 step7 的反馈。预计反馈是“少量布局调整点”，不是复合类型断线。

建议下一轮：

1. 先询问/接收用户对 `布局c-long-input-step7.gia` 的具体截图或描述。
2. 如果有截图，先用 `read` 打开截图并复述：哪个分支、哪个节点、是横向过近/纵向重叠/连线穿插/后续链没有保持同一 Y。
3. 只改一个布局点。优先候选：
   - nested sibling 的 `dataLanePadding` 是否仍不足或过大；
   - 复合节点作为数据生产者后，主图 data block 高度估算是否和普通数据节点不同；
   - long-input step7 中 composite call 的主图布局是否需要纳入 dataBlockHeightMap 的更精确估算。
4. 更新测试图名到 step8（除非用户明确要求覆盖 step7）：

```text
R6-C参考复刻-long-input-step8
```

5. 导出到：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局c-long-input-step8.gia
```

6. 等用户游戏内反馈；通过后提交。

---

## 八、剩余风险

1. `dataLanePadding = min(1100, extraDataHeight*0.35)` 是通过 step4 验证的经验值，可能对其它复杂图偏大或偏小。
2. 主图布局已在 step8 纳入纯数据复合调用节点的输入/输出 pin 数视觉高度估算，并在 step9 纳入水平避让，经用户游戏内验证；但这仍是经验估算，后续如果出现更宽/更多 pin 的复合节点，可能还需要继续校准。
3. 普通数据流布局已在 data-count step12 中完成本轮校准：数据节点堆叠行距为 175；随 `dataAncestorCount` 增长的整体高度估算系数为 150。该参数已通过用户游戏内测试，但仍是 `布局c` 数据流数量回归样例的经验值。
4. 复合 impl concrete 编码修复已由 step6/step7 游戏内反馈验证，但建议未来补自动回归测试，至少覆盖：`float addition -> vec3 zoom`、`float comparison -> logical OR`、显式 OutParam 映射。
4. 真实编辑器的复合 pinIndex 分配与 gsts 默认值不同；本轮只保证 gsts 当前输出可被游戏接受，不代表编辑器导出结构完全等价。

---

## 九、给下一位助手的一句话

> 当前已到 `布局c-long-input-step7`：step4 修复了多数据流下第一条线第二个分支下移不足，step6/step7 修复了纯数据复合内部 float concrete InParam/OutParam 编码断线，并已提交。下一轮用户会继续给 step7 的少量布局反馈；务必先读截图/描述，只改一个小布局点，测试文件 `name` 与导出文件 step 同步，导出前删除旧文件，只复制到 `Beyond_Local_Export/` 根目录，用户通过后再提交。
