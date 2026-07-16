# 临时交接：P5-W10 信号 entity / entity_list 参数未正常收发

> 状态：临时交接 / 待新会话修复
> 来源：P5-W10 special-arg 整族共享收口进行中 + 用户 2026-07-16 编辑器反馈
> 最近校验：2026-07-16
> 适用范围：仅本轮未完成的信号参数问题；**不是**权威 STATUS 替代品
> 分支：`refactor/composite-stage3-architecture`
> HEAD（交接时）：`0593877` P5-W9 已提交；**P5-W10 全部改动未提交**

---

## 1. 新会话启动方式

按固定入口恢复：

```text
docs/composite-ir/architecture-redesign/EXECUTION.md
```

先读精简 `STATUS.md`。当前 STATUS 仍把 **P5-W10** 标为唯一工作包（自动通过、待用户核验）。
本文件记录的是 **用户核验中发现的信号 entity 参数失败**，应优先作为 P5-W10 修复切片，不要另开无关包。

恢复后建议直接读：

1. 本文件全文
2. `src/compiler/ir_to_gia_transform/build_signal_definition.ts`
3. `src/compiler/ir_to_gia_transform/special_arg_adapter.ts`（`applySignalSpecialArgs`）
4. `src/compiler/ir_to_gia_transform/pins.ts`（entity 字面量策略）
5. `tests/composite/test-stage3-p5w10-special-arg-shared-adapter.ts`
6. 参考 GIA：`test/信号使用-带参数版本.gia`（游戏导出目录）

未经用户指示不要 `git commit` / 切换分支 / 注入。

---

## 2. 工作树与产物

### 分支 / Git

```text
Branch: refactor/composite-stage3-architecture
HEAD:   0593877 refactor(stage3): share pin-hole adapter for all 9 nodes (P5-W9)
Working tree: dirty（P5-W10 全部未提交）
```

### 本包新增文件

```text
src/compiler/ir_to_gia_transform/special_arg_adapter.ts      # special-arg 整族共享
src/compiler/ir_to_gia_transform/build_signal_definition.ts  # SignalDef which=14 + SysGraph 修补
tests/composite/test-stage3-p5w10-special-arg-shared-adapter.ts
```

### 本包主要修改

```text
index.ts                 # applySpecialArgs 委托 special-arg；finalizeSignalEncoding
composite.ts             # special-arg remap；assembly_list typed identity；signal patch
ordinary_node_factory.ts # special-arg 全族走 shared apply
root_impl_ordinary_coverage_matrix.ts  # special-arg green=5
root_ordinary_capability_inventory.ts
pins 相关 / layout 注释
STATUS / phase-5 / game-regression-manifest / EXECUTION / NEW-SESSION-PROMPT / AGENTS.md
tests p5w3 / p5w6 / p5w9 契约 phase 跟进
```

另：`bin/gsts.mjs` 有修改——**请新会话核对是否属于本包**；若无关勿顺手提交。

### 当前主候选（已复制到游戏导出根）

游戏目录：

```text
C:\Users\touyu\AppData\LocalLow\miHoYo\原神\BeyondLocal\Beyond_Local_Export\
WSL: /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/
```

| 文件 | SHA-256 | 说明 |
|---|---|---|
| **P5W10-special-arg-shared-vendor.gia** | `e484ee5ed41e323eeaa86a9a54ccc9862a77091cec64825b98ca8eab3795a946` | 主候选；用户反馈 entity 参数异常 |
| P5W10-capture-vendor.gia | `2715f8f79adb78ee8d487a69a34168a91d2a6565f8834cbd0da3e3cbc016301e` | boundary 哨兵 |
| P5W10-nested-capture-vendor.gia | `40ecf34c1c4d13fbb0251954213d64916f805af69108f3186546f5e3b17313c6` | 同上 |
| P5W10-nested-sparse-vendor.gia | `7d1f94fc26d1b2a96c2cee31c77cfdd9aabacb0166112f0f68d93be46c516389` | 同上 |
| P5W10-multi-inflow-outflow-vendor.gia | `1b157c08b5a20b193a4c27aa54ca9f9185b4f2e83ff7138f3646f3a613bbd098` | 同上 |
| P5W10-nested-call-vendor.gia | `97a89628991f28f593de8167f3316c46171d097a15fe60c1a9d60f01974853e7` | 同上 |

仓库 staging：`genshin-ts/Beyond_Local_Export/`（编辑器不看这里；交付前必须 `cp` 到游戏导出根）。

---

## 3. 用户反馈（当前阻塞）

> **信号相关的实体 / 实体列表 两个参数没有正常被发送和监听。**

含义（按用户表述 + 当前 fixture）：

1. **entity 标量参数**（fixture 中 `参数_8: entity`）收发不正常
2. **entity_list 参数** 也有问题——**当前 fixture 尚未包含 `entity_list` 槽位**，需扩 schema 或单独最小复现

其它 special-arg（assembly / multiple_branches / 非 entity 信号参）用户未在本条中点名失败；修复时勿扩大到 typed-identity 全清或 default gate。

---

## 4. 已完成且可依赖的事实

### 架构 / special-arg

- P5-W10 目标：5 个 special-arg 节点整族共享
  `send_signal` / `monitor_signal` / `assembly_list` / `assembly_dictionary` / `multiple_branches`
- 矩阵：shared beta **special-arg green=5**；total≈73 green=47 unknown=26
- 默认 gate **仍 false**；未注入

### 信号编码（已做，编辑器已能“看到”参数脚位）

相对真实 GIA（`user_edit/信号/001.gia`、`test/信号使用-带参数版本.gia`）：

| 项 | 实现 |
|---|---|
| 占位 id | IR 仍用 `300000`/`300001` |
| 编码后 id | 修补为 SysGraph `1610612738`（send）/ `1610612739`（monitor） |
| SignalDef | accessory `which=14` 名称「发送信号」 |
| 监听定义 | CompositeDef `which=12` 名称「监听信号」graphId=0 |
| signalVersion | 2 |
| ClientExec cpi | send=7；monitor=14 |
| 数据脚 cpi | send InParam i → `12+i` |
| 模块 | `build_signal_definition.ts` + `index.ts:finalizeSignalEncoding` |

### 当前 fixture 8 参 schema

对齐样本槽位数；**参数_4 用 bool 代替样本 enum**（enum signal 仍 root-unsupported）：

```text
参数_1 int
参数_2 float
参数_3 vec3
参数_4 bool      ← 样本为 enum，本包 bool
参数_5 prefab_id
参数_6 str_list  ← assemblyList 接线
参数_7 str
参数_8 entity    ← 用户反馈失败点之一
```

**没有** `entity_list` 槽——用户提到的「实体列表」需新会话补测。

### 自动回归（交接时）

```bash
npm run build                                          # PASS
npx tsx tests/composite/test-stage3-p5w10-special-arg-shared-adapter.ts ...  # PASS
npx tsx tests/composite/test-stage3-p5w6-ordinary-coverage-matrix.ts       # PASS
npx tsx tests/composite/test-stage3-p5w9-pin-hole-shared-adapter.ts ...    # PASS
```

自动 PASS **不等于** entity 游戏行为正确。

---

## 5. 高度可疑根因（待验证，勿当定论）

### 5.1 entity 字面量在 pins 层被拒绝 / 跳过

`pins.ts:setLiteralArgValue`：

- `entity && value === null` → **直接 return（不建 pin）**
- 非 null entity 字面量 → **throw unsupported literal**

因此 **send_signal 的 entity 参数只能走 conn**，不能当字面量。

### 5.2 root 路径：`getSelfEntity()` 是否变成 conn

fixture：

```ts
sendFullSignal(f, self, 'root', 42n)  // self = f.getSelfEntity()
```

若 IR 把 entity 写成 `{type:'entity', value:null}` 字面量而非 conn，则 `applySignalSpecialArgs` 调 `setValueArg` → `setLiteralArgValue` 可能 **丢 pin 或抛错**。
解码观察（交接前）：root send 有 InParam index=7 且 cpi=19，但 **value 形态是否被编辑器接受未证明**。

### 5.3 composite 路径：entity capture 滤掉物理 pin

impl send 物理 InParam **只有 7 个**（缺参数_8 entity），因 `skipCapturedInputs` + capture 路由。
用户测「复合内发送」时，entity 应出现在 **compositePins**，不是节点物理 InParam。若 capture→信号参数路由缺失/脚位错，会表现为「实体参数没带上」。

### 5.4 entity_list 未覆盖

- `applySignalSpecialArgs` 已支持 `*_list` **conn** 建 list 型 pin
- fixture **没有** entity_list 参数
- 需最小：`assemblyList([...entities], 'entity')` → `sendSignal(..., entityList)` + monitor 消费

### 5.5 IdBase / bId 编码

entity 在 ParameterFlow 用 `VarBase_Class.IdBase`；真实 send 数据 pin 的 VarBase 是否与 editor 一致，应用 001/002 或带 entity 的真实样本对照 **value.class / alreadySetVal / bId**，不要只看 type tag。

---

## 6. 建议修复顺序（单切片，仍属 P5-W10）

1. **最小失败复现**
   - 解码当前 `P5W10-special-arg-shared-vendor.gia`
   - 打印 root/impl send InParam[7] 与 monitor OutParam 对应 entity 的 **完整 value JSON**
   - 对照 `test/信号使用-带参数版本.gia` 中 entity 类脚位（样本参数_8 class=0 t1=1 ≈ entity）

2. **修 send entity 编码**
   - 保证 IR 为 conn（来自 getSelfEntity / 上游 entity 节点）
   - 若必须占位：在 `applySignalSpecialArgs` 对 entity 建 **有类型的空 InParam**（Ety / IdBase），**不要**走 `setLiteralArgValue` 的 throw/early-return
   - composite：核对 capture entity → send 物理脚 / compositePins 是否与 cpi `12+7=19` 一致

3. **补 entity_list**
   - fixture 增加一参或单独信号
   - assembly_list entity 变体 + send conn + monitor 消费
   - 注意 composite 下 assembly_list typed identity（generic 169 + concrete 变体；双 typed id 会导致 0 pins——已踩坑）

4. **自动契约**
   - root send 8 个 data pin，其中 entity pin type=Ety 且 connects 或合法 value
   - monitor entity / entity_list OutParam 被下游连接
   - SignalDef inputs 含 entity / entity_list 类型元数据

5. **重生候选 → 复制游戏目录 → 用户核验**
   - 禁止只写仓库 staging
   - 完成报告必须含「需游戏测试清单」+ SHA-256

---

## 7. 关键代码锚点

```text
special_arg_adapter.ts
  applySignalSpecialArgs     # send 字面量/conn；list conn
  remapSpecialArgInputIndex  # send: ir>0 → ir-1

build_signal_definition.ts
  collectSignalUsages / buildSendSignalDefGraphUnit / buildMonitorSignalCompositeGraphUnit
  patchEncodedSignalNodes / finalizeSignalEncoding
  SEND_SIGNAL_PIN_INDEX.firstParam = 12
  BUILTIN_SEND=1610612738  BUILTIN_MONITOR=1610612739

pins.ts
  setLiteralArgValue         # entity null skip / non-null throw

composite.ts
  resolveImplNodeId          # assembly_list typed suffix
  assemblyGenericId          # 169 generic + typed concrete
  patchEncodedSignalNodes    # vendor/legacy 编码后
  skipCapturedInputs + capture filter on send entity

index.ts
  finalizeSignalEncoding after composite accessories

tests/composite/test-stage3-p5w10-special-arg-shared-adapter.ts
  SignalP5W10 8 params / sendFullSignal / onSignal consumers
```

参考真实 GIA：

```text
.../Beyond_Local_Export/test/信号使用-带参数版本.gia
.../Beyond_Local_Export/user_edit/信号/001.gia
.../Beyond_Local_Export/user_edit/信号/002.gia
```

历史实现线索（非当前权威）：

```text
git show 44a9c23  # 初版 send 参数 pin
git show 0fa3e1d  # monitor OutParam 3+ / signals 提取
src/injector/signal_nodes.ts  # 注入时 300000→地图内真实 id（编辑器直载不走此路径）
```

---

## 8. 明确非目标

- 默认开启 vendor gate
- 删除 handwritten backend
- typed-identity 字典/query 全族（query_dictionary_s_length 与 assembly_dictionary typed 冲突已知，勿顺手扩）
- enum signal 参数
- 注入 / 操作 mapId
- 把「仅自动观察」标成游戏验证完成

---

## 9. 验证命令模板

```bash
npm run build
npx tsx tests/composite/test-stage3-p5w10-special-arg-shared-adapter.ts \
  Beyond_Local_Export/P5W10-special-arg-shared-vendor.gia
npx tsx tests/composite/test-stage3-p5w6-ordinary-coverage-matrix.ts
git diff --check

# 通过后复制到游戏导出根并 sha256sum 对齐
cp -f Beyond_Local_Export/P5W10-special-arg-shared-vendor.gia \
  "/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/"
```

用户确认通过后：按 `COLLABORATION-PLAYBOOK.md` 归档到 `真-测试通过/复合节点/`，更新 STATUS + game-regression-manifest。

---

## 10. 协作路径规则（易漏）

- 仓库 `Beyond_Local_Export/` = staging only
- 编辑器只看游戏导出根（上表 WSL 路径）
- 名称明确的 Stage 3 候选可直接复制到游戏导出根（长期授权）；禁止注入 / 动 user_edit / 删真实参考
- 完成报告必须含「需游戏测试清单」

---

## 11. 新会话首条建议消息（可复制）

```text
按 EXECUTION.md 恢复 Composite Stage 3。当前修 P5-W10 残留：
信号 entity / entity_list 参数发送与监听不正常。
先读 docs/composite-ir/architecture-redesign/handover-p5w10-signal-entity-params.md，
再读 build_signal_definition.ts / special_arg_adapter.ts / pins.ts / p5w10 测试。
修改前给恢复报告；不要 commit；候选必须复制到游戏导出根。
```

---

## 12. 规则反馈（局部，勿盲目升 AGENTS）

- 已写入 `ir_to_gia_transform/AGENTS.md`：信号必须 SignalDef + SysGraph 修补
- **未升格**：entity 字面量策略、entity_list 全参矩阵、assembly_dictionary 与 query length typed 冲突——仍属局部/待验证

---

**交接结束。** 新会话应从「解码 entity pin 完整 value + 对照真实 GIA」开始，不要重做 special-arg 整族共享。
