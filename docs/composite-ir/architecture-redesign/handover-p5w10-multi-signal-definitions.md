# 临时交接：P5-W10 多信号 SignalDef 绑定错误

> 状态：历史记录 / 方案 A 已完成目标地图游戏验证
> 来源：当前代码实现 + 真实 GIA 对照 + 用户 2026-07-16 编辑器反馈
> 最近校验：2026-07-16
> 适用范围：记录 P5-W10 多信号绑定问题的失败链路；当前状态与实现以 `STATUS.md`、`game-regression-manifest.md` 和 `04-validation-signal.md` 为准
> 分支：`refactor/composite-stage3-architecture`
> HEAD（交接时）：`b440a88 fix(stage3): preserve composite special arg pins`

---

## 1. 用户当前反馈

用户在编辑器中打开最新候选后确认：

- 节点图内容已经变成两个发送信号节点；
- 但两个节点在编辑器中显示的信号名字都是 **`信号_1`**；
- 之前误以为是复制路径问题，已核对排除。

结论：问题不是候选复制位置，而是 **GIA 中多个信号节点与 SignalDef accessory 的定义绑定关系错误**。

---

## 2. 正确的最新地图信号定义

从最新地图 `.gil` 只读提取：

```text
源地图：
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741848.gil

playerId: 110170759
mapId: 1073741848
临时提取结果：/tmp/signals-1073741848.ts
```

提取到 3 个真实信号：

### `信号_1`（原版本，用户已确认候选游戏测试通过）

```text
参数_1 int
参数_2 float
参数_3 vec3
参数_4 entity
参数_5 entity_list
```

### `信号_全部参数测试`

```text
参数_1 int
参数_2 float
参数_3 vec3
参数_4 guid
参数_5 bool
参数_6 entity
参数_7 prefab_id
参数_8 config_id
参数_9 str
```

### `信号_全部列表参数测试`

```text
参数_1 config_id_list
参数_2 prefab_id_list
参数_3 entity_list
参数_4 guid_list
参数_5 bool_list
参数_6 vec3_list
参数_7 str_list
参数_8 float_list
参数_9 int_list
```

提取链路：

```text
src/cli/gil_signals.ts
  extractSignalsFromGil()
  parseSignalEntries()
  mapSignalParamType()
```

不要再从参考 `.gia` 猜 `信号_1` 的字段；必须使用上述最新 `.gil` 提取结果。

---

## 3. 当前测试文件状态

当前测试文件：

```text
tests/composite/test-stage3-p5w10-special-arg-shared-adapter.ts
```

当前 fixture 已改为使用两个真实信号名（源码中用 `defineSignal` 对齐提取结果）：

```ts
const OrdinarySignal = defineSignal('信号_全部参数测试', [...])
const ListSignal = defineSignal('信号_全部列表参数测试', [...])
```

主图和复合节点都发送两个信号：

```text
root:
  信号_全部参数测试
  信号_全部列表参数测试

composite impl:
  信号_全部参数测试
  信号_全部列表参数测试
```

监听侧分别注册两个 `onSignal`，目标是消费全部参数。

当前 focused 自动测试曾通过：

```text
P5-W10 special-arg shared adapter OK
family=5
static green=46 unknown=27
```

但该 PASS 只证明当前编码结构/节点字符串检查，不证明编辑器按正确 SignalDef 解析。

注意：本轮测试文件中仍有旧的单信号详细断言残留风险；新会话应先整理成按两个 signal case 参数化的断言，不要继续堆旧 `信号_1` 断言。

---

## 4. 已确认的 GIA 输出事实

候选：

```text
仓库 staging：
/home/h/genshin-ts/Beyond_Local_Export/P5W10-special-arg-shared-vendor.gia

游戏目录：
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/P5W10-special-arg-shared-vendor.gia
```

当前两者 SHA-256：

```text
049f40cd37b2d480a8372f367b8b7639c74c9924216a5a21737861490c219181
```

使用命令：

```bash
NODE_OPTIONS='--no-deprecation' npx tsx tools/decode-gia.ts --compact \
  /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/P5W10-special-arg-shared-vendor.gia
```

解码发现主图 ClientExec pin 字符串为：

```text
1610612738 node 12 → 信号_全部参数测试
1610612738 node 22 → 信号_全部列表参数测试
1610612739 node 25 → 信号_全部参数测试
1610612739 node 45 → 信号_全部列表参数测试
```

复合 impl 中也分别存在两个 send 节点，字符串为两个新名字。

因此：**二进制节点内的字符串已经正确，不是复制旧候选造成的。**

---

## 5. 已确认的根因

当前实现：

```text
src/compiler/ir_to_gia_transform/build_signal_definition.ts
```

`collectSignalUsages()` 会按 signal name 收集多份 usage，但：

```ts
buildSignalDefinitionAccessories(usages)
```

当前仍是 single-schema path：

```ts
// Merge params: take the longest list
let params: SignalParamSpec[] = []
for (const u of usages) {
  if (u.params.length > params.length) params = u.params
}

buildSendSignalDefGraphUnit(params)
buildMonitorSignalCompositeGraphUnit(params)
buildSendServerSignalDefGraphUnit(params)
```

也就是说：

```text
多个 signal name
  ↓
只生成一组 发送信号 SignalDef
只生成一组 监听信号 CompositeDef
只生成一组 向服务器节点图发送信号定义
```

并且 `patchEncodedSignalNodes()` 当前只把所有 placeholder 统一 patch 为：

```text
send    → 1610612738
monitor → 1610612739
```

这解释了用户反馈：

```text
两个发送节点的二进制 ClientExec 字符串不同
但编辑器都通过同一套 SignalDef 关系显示成信号_1
```

不要再把这类问题归因于候选复制路径。

---

## 6. 真实 GIA 多信号证据

参考真实文件：

```text
Beyond_Local_Export/test/ts_g_define_使用已有信号.gia
Beyond_Local_Export/test/ts_g_define_全类型发送.gia
```

解码命令模板：

```bash
NODE_OPTIONS='--no-deprecation' npx tsx tools/decode-gia.ts --compact <file.gia>
```

观察到不同 signal schema 使用不同的定义 ID：

### `ts_g_define_使用已有信号.gia`

```text
发送信号                  id=1610655353，1 input
监听信号                  id=1610655354，4 outputs（3 fixed + 1 param）
向服务器节点图发送信号     id=1610655355
```

### `ts_g_define_全类型发送.gia`

```text
发送信号                  id=1610655346，10 inputs
监听信号                  id=1610655347，13 outputs（3 fixed + 10 params）
向服务器节点图发送信号     id=1610655348
```

真实 GIA 说明：不同 signal schema 不是只靠 ClientExec 字符串区分，而是各自拥有独立的 SignalDef / monitor / server-send 定义关系。

具体 ID 不要直接硬编码推广；应研究其生成/分配规律或建立当前候选内稳定的独立定义 ID 方案，再与真实样本字段对齐。

---

## 7. 新会话必须修复的范围

### 目标

让每个 signal name 拥有独立 schema 和定义关系：

```text
信号_全部参数测试
  → 独立发送定义
  → 独立监听定义
  → 独立服务器发送定义

信号_全部列表参数测试
  → 独立发送定义
  → 独立监听定义
  → 独立服务器发送定义
```

### 必须核对

1. `collectSignalUsages()` 保留 signal name → params 映射；
2. 每个 signal 分配独立的 send / monitor / server definition identity；
3. 每个 signal 的 SignalDef inputs 使用自己的参数数量/类型；
4. 每个 signal 的 monitor outputs 使用自己的参数数量/类型；
5. `relatedIds` 与真实 GIA 的组织方式一致；
6. encoded send/monitor 节点的 ID / concrete identity / compositePinIndex 与所属 signal 绑定；
7. 主图与 composite impl 两条路径都使用相同的 signal-specific schema；
8. 不再让所有信号都落到 `1610612738 / 1610612739` 的单一 schema；
9. 自动测试必须断言每个 signal 的独立定义、参数数量、类型和节点绑定；
10. 用户编辑器核验必须分别观察两个 signal 名称和各自参数。

### 非目标

```text
不注入
不修改 mapId / nodeGraphId
不覆盖 user_edit 真实参考
不默认开启 vendor gate
不删除 handwritten backend
不把旧信号_1参考样本当作新信号 schema
```

---

## 8. 建议修复顺序

1. 读取当前 `build_signal_definition.ts` 全文和 `src/compiler/ir_to_gia_transform/AGENTS.md`；
2. 解析真实多信号 GIA 的 accessory / relatedIds / graphId / node identity；
3. 写一个最小多信号 definition contract（两个不同参数数量的 signal）；
4. 先调整 builder，使其按 usage 逐 signal 生成定义，而不是 longest params merge；
5. 调整 encoded node patch，使节点和 signal-specific definition 关联；
6. 更新原 `test-stage3-p5w10-special-arg-shared-adapter.ts` 的断言，删除旧单 SignalDef 假设；
7. 运行：

```bash
npm run build
npx tsx tests/composite/test-stage3-p5w10-special-arg-shared-adapter.ts \
  Beyond_Local_Export/P5W10-special-arg-shared-vendor.gia
npx tsx tests/composite/test-stage3-p5w6-ordinary-coverage-matrix.ts
git diff --check
```

8. 解码候选，确认两个 signal 的定义关系独立；
9. 生成新的明确命名候选；
10. 复制到**游戏导出根目录**，不是仓库 staging：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/
```

11. 报告源/目标实际路径和 SHA-256；
12. 请求用户重新打开候选并分别核验两个 signal。

---

## 9. 当前工作树注意事项

交接时工作树已有大量 P5-W10 预期 dirty 修改，不要 reset/clean/restore：

```text
src/compiler/ir_to_gia_transform/build_signal_definition.ts       # 未提交新增/当前单 schema 根因
src/compiler/ir_to_gia_transform/composite.ts                     # typed assembly 修复修改
src/compiler/ir_to_gia_transform/ordinary_graph_materializer.ts   # 当前有 P5 相关修改，先核对 diff
src/compiler/ir_to_gia_transform/AGENTS.md
 tests/composite/test-stage3-p5w10-special-arg-shared-adapter.ts
STATUS / game-regression-manifest / phase docs
```

另有：

```text
bin/gsts.mjs
```

当前仅 mode 变化/可能为既有工作树变化，新会话先核对，不要顺手纳入多信号修复。

不要 commit、切换分支、注入或覆盖真实参考文件。

---

## 10. 新会话首条消息（可复制）

```text
按 docs/composite-ir/architecture-redesign/handover-p5w10-multi-signal-definitions.md 恢复。
当前已确认：游戏目录候选中的两个 send 节点 ClientExec 字符串分别是
“信号_全部参数测试”和“信号_全部列表参数测试”，但编辑器都显示为“信号_1”。
根因是 build_signal_definition.ts 的 buildSignalDefinitionAccessories() 仍把多 signal usages
合并成一套 SignalDef/监听定义，并且 patchEncodedSignalNodes() 统一使用 1610612738/1610612739。
请先对照真实多信号 GIA（ts_g_define_使用已有信号.gia、ts_g_define_全类型发送.gia）解析
accessory/relatedIds/独立定义 ID，再修多信号 definition binding。不要再排查复制路径，
不要猜信号字段，不要 commit/注入。
```

---

## 11. 证据分层总结

```text
当前代码实现：
  build_signal_definition.ts 是 single-schema merge；已由源码确认。

真实 GIA：
  候选二进制 ClientExec 字符串分别是两个新信号；已由 decode-gia 确认。
  真实历史/编辑器 GIA 中不同 schema 使用独立 definition IDs；已由样本对照确认。

自动回归：
  当前 special-arg focused test PASS 只证明部分结构；不证明编辑器 signal binding。

用户游戏验证：
  原信号_1 五参数候选用户已报告测试通过。
  两个新信号候选用户报告编辑器仍显示信号_1，故多 signal binding 未通过。

待验证：
  新会话需要确定独立 SignalDef ID 的分配/关系字段，并完成新的编辑器核验。
```

**交接结束。**

## 12. 结案更新（2026-07-16）

方案 A 已实现并完成用户游戏验证：

```text
目标 .gil 注册表
  → RegisteredSignalDefinition(name, params, sendId, monitorId, serverId)
  → build_signal_definition.ts 使用真实 identity
  → 未注册 signal / schema mismatch 明确失败
```

已验证候选：

```text
P5W10-two-signal-param-matrix-registered.gia
SHA-256: f3e7ff15c0e84c2b9896bdce8d2ba8f4dbdbb93e4d14dd35b6029876759315e1
```

用户确认该候选在编辑器/游戏测试通过。旧的固定 ID、`+6` 分配和仅依赖 ClientExec 名称的路径均不再作为当前方案。
未注册新信号的创建仍是独立待办。