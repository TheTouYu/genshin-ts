# 物理运动复刻 Round 12 交接

> 状态：当前推荐 / 待执行
> 来源：用户游戏内验证 + 当前代码实现 + 真实 `物理运动.gia` 初步解码
> 最近校验：2026-07-11
> 适用范围：下一轮排查并修复 composite bool 输入参数在游戏编辑器中的 true/false 显示/选择问题

---

## 一、下一轮目标

### 唯一目标

> 按真实 `.gia` 对照修复所有复合节点 `bool` 输入参数在游戏内显示异常、玩家不能正常选择 `true/false` 的问题，并生成可供游戏核验的最小 GIA/物理整图。

### 范围

1. 只处理 composite 输入参数类型为 `bool` 时的 GIA 编码/物理 pin 显示问题；不要顺手改普通系统节点 bool literal、信号参数或布局，除非真实对比证明它们共用同一编码路径。
2. 先从真实 GIA 中找 `bool` composite 输入样本，逐字段比较 `CompositeDef.inputs`、复合调用节点 `InParam` pin、literal value wrapper、`compositePinIndex` 和 connects；不要只凭源码里的 `type: 'bool'` 映射猜根因。
3. 优先修通用编码路径，避免在某个业务复合或某个 pinIndex 上打补丁。
4. 保留 Round 10/11 已通过的 sparse named input、空字符串 inputName capture、Local Variable 和 `更新v、w` 拓扑修复。
5. 如果发现真实 GIA 与当前实现差异涉及 API 设计或多类型族编码，先停下来和用户确认范围，不要扩散到全类型重构。

### 完成标准

1. 真实对照：至少选 2 个真实 `bool` composite 输入样本完成结构化比较，其中优先包含 `复杂gia/物理运动.gia` 的 `更新v、w.接触地面`，另选 `条件branch.条件`、`与.输入*` 或 `[时间]定时器设置与触发.是否循环` 之一。
2. 自动回归：新增或更新最小 bool composite 测试，断言 decoded GIA 的 `CompositeDef.inputs`、调用节点 `InParam` pin type、literal wrapper 与真实样本一致。
3. 生成结果：`npm run build`、新增回归、相关旧回归通过；生成一个最小 bool 复合核验 GIA，必要时重新生成 `dist/tests/layout/physics-motion/main.gia`。
4. 游戏验证：用户明确要求后再注入；用户在游戏内确认 bool 输入能正常显示并选择 `true/false` 后，才写成“游戏内通过”。
5. 文档同步：更新 `physics-motion-recreate-guide.md` 中 bool 输入状态；如修复了通用编码规则，再同步当前实现文档或相关回归说明。

---

## 二、可用资源与执行边界

### 已验证基线

- `游戏内通过`：Round 11 已修复 `向量缩放除法` 内部 `Division.InParam[1]` 空名输入路由；用户游戏内确认通过。
- `自动验证通过`：`tests/composite/test-composite-empty-name-input.ts` 覆盖空字符串输入名 capture/compositePins；`tests/composite/test-composite-sparse-named-input.ts` 覆盖稀疏命名输入声明 index。
- `真实 GIA 初步解码`：`复杂gia/物理运动.gia` 中存在多个 bool composite 输入，decoded `CompositeDef.inputs` 常见形态为 `type.class=6`、`type1=4`、`type2=4`，例如 `更新v、w.接触地面 pinIndex=1422`。
- `当前实现初步观察`：当前生成的 `更新v、w.接触地面` 的 `CompositeDef.inputs` 已显示 `class=6,type1=4,type2=4`，因此下一轮不要只查 composite 定义类型；重点比较复合调用节点的 `InParam` pin type/value wrapper 和默认 literal 是否导致编辑器不能显示选择器。
- `待验证`：用户报告“当前所有复合节点 bool 输入参数在游戏显示存在问题，不能正常选择 true/false”；尚未完成真实/生成逐字段差异定位。

### 本轮复盘：阻碍、帮助、可复用知识

- 最大阻碍：最容易在截图问题上先猜业务层或接口声明；Round 11 证明“接口定义正确、impl 内部/调用物理 pin 错”是常见模式。
- 最大帮助：用户游戏内截图和即时核验能直接区分“自动 trace 通过”与“编辑器真的可用”。下一轮 bool 显示问题也必须依赖游戏内最终确认。
- 可复用知识 1：先找真实 GIA 的同类最小样本，再写同构测试；不要用抽象测试替代真实字段比较。
- 可复用知识 2：`CompositeDef.inputs`、调用节点物理 `InParam` pin、impl `compositePins` 是三层不同结构，任一层看起来正确都不能推出编辑器显示正常。
- 可复用知识 3：对于 UI 显示/选择器问题，`type` 字段正确还不够，必须比较 literal value wrapper（例如 `bConcreteValue`、`EnumBase`/`Bool` 值、`alreadySetVal`）和 pin 是否保留。
- 可复用知识 4：不要把自动验证写成游戏内通过；bool 选择器属于编辑器交互问题，最终标准是用户能在游戏内选择 `true/false`。

### 文档资源索引

#### P0：工作细节准则

- [`layout-working-rules.md`](layout-working-rules.md)
  - 用途：协作边界、游戏目录、生成/注入/归档命令、小步验证规则。
  - 何时读：生成 GIA、注入、等待用户游戏反馈、归档或清理导入目录前。
  - 读取范围：第一节、1.1、路径速查、3.1/3.2/3.3/3.6/3.9/3.10/3.13；不要默认加载全文。

#### P1：当前任务权威资料

- [../physics-motion-recreate-guide.md](../physics-motion-recreate-guide.md)
  - 用途：确认当前物理复刻状态、Round 10/11 已通过修复、真实样本路径。
  - 何时读：开始修改前和更新文档时。
  - 范围：第 2 节命令、第 5.5/5.6 节，搜索 `bool`、`更新v、w`、`向量缩放除法`。
- [../../architecture/composite/dsl-api.md](../../architecture/composite/dsl-api.md)
  - 用途：确认 `defineComposite`/`callComposite` bool 输入声明和调用语义。
  - 何时读：需要判断 bool 输入属于 API 用法问题还是编码问题时。
  - 范围：`defineComposite` inputs、`f.callComposite`、嵌套复合调用。
- [../../architecture/composite/gia-encoding.md](../../architecture/composite/gia-encoding.md)
  - 用途：确认 Stage 3 复合接口和物理 pin 编码规则。
  - 何时读：定位到 GIA 字段差异或需要修改 `ir_to_gia_transform` 时。
  - 范围：CompositeDef、compositePins、InParam/OutParam pin 编码。
- [../../gia-tools-reference.md](../../gia-tools-reference.md)
  - 用途：选择 `decode-gia`、`gia-inspect`、`trace-dataflow` 和 jq 比较命令。
  - 何时读：需要结构化核对真实和生成 GIA 时。
  - 范围：`decode-gia`、`trace-dataflow`、`gia-inspect`。

#### P2：升级调查入口

- [../../documentation-map.md](../../documentation-map.md)：任务扩展到多文档路由或新 API 设计时读取。
- [../../documentation-governance.md](../../documentation-governance.md)：真实 GIA、当前实现、历史记录或推测冲突时读取。
- [layout-handover-physics-motion-round-11.md](layout-handover-physics-motion-round-11.md)：只追溯空名输入修复的经验和回归，不能当 bool 编码结论使用。

### 代码与测试入口

```text
src/compiler/ir_to_gia_transform/composite.ts
  CompositeDef inputs/outputs 类型编码：typeClassFromValueType / typeIdFromValueType。

src/compiler/ir_to_gia_transform/index.ts
  主图 composite call 节点 InParam pin 生成：compositeTypeToBaseTag、setLiteralArgValue 调用点。

src/compiler/ir_to_gia_transform/pins.ts
  literal pin value wrapper 编码；bool true/false 显示问题很可能需要逐字段比较这里。

src/runtime/composite_registry.ts
  capture/compositePins 路由；下一轮避免回退空名输入和 sparse named input 修复。

tests/composite/test-composite-empty-name-input.ts
  Round 11 空名输入回归。

tests/composite/test-composite-sparse-named-input.ts
  Round 10 稀疏命名输入回归。

tests/composite/test-composite-all.ts / test-phase2-normal-nodes.ts / replicate-full-dtc-v2.ts
  已有 bool composite 输入、DTC 或多类型覆盖素材，可作为回归参考；写新测试前先确认是否可复用。
```

### 真实样本与比较字段

```text
真实文件：/home/h/genshin-ts/复杂gia/物理运动.gia
备用路径：/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/复杂gia/物理运动.gia
优先样本：更新v、w.接触地面（bool input，pinIndex=1422）
候选样本：条件branch.条件、与.输入*、[时间]定时器设置与触发.是否循环
比较字段：CompositeDef.inputs type(class/type1/type2/valueId)、pinIndex、调用节点 InParam pin kind/index/type/compositePinIndex、literal value wrapper、connects
```

推荐起手命令：

```bash
npx tsx tools/decode-gia.ts 复杂gia/物理运动.gia > /tmp/physics-real.decoded.json
npx tsx tools/decode-gia.ts dist/tests/layout/physics-motion/main.gia > /tmp/physics-gen.decoded.json
jq -r '.accessories[]? | select(.compositeDef) | .name as $n | (.compositeDef.inner.def.inputs // [])[]? | select(.type.type1==4 or .type.type2==4 or .type.class==6) | [$n,.name,(.index.index|tostring),(.pinIndex|tostring),(.type|tojson)] | @tsv' /tmp/physics-real.decoded.json
```

若 `dist/` 被 `npm run build` 清空，先重新生成：

```bash
node bin/gsts.mjs -c gsts.physics-motion.config.ts --noinject
```

### 易错点与禁止事项

1. 不要只比较 `CompositeDef.inputs.type`；当前初步观察该层可能已经与真实一致。
2. 不要把 bool 当普通 `int` 或 `enum` 随意替代；必须按真实 GIA 的 `VarBase_Class`、`VarType.Boolean` 和 literal wrapper 对齐。
3. 不要回退 Round 10/11 的 `compositeInputIndex`、空字符串 inputName capture 和 nested capture pin 修复。
4. 不要把“decoded 字段一致”直接写成“玩家可选择 true/false”；UI 选择器必须等用户游戏内确认。
5. 不要手改 `src/definitions/` 或 `src/thirdparty/`。
6. 注入、覆盖游戏文件或清理导入目录前必须先获得用户确认。

### 推荐工作流

1. 读取本 handover 的目标和 P0/P1 指定小节；复述 bool 输入显示问题的核验目标。
2. 解码真实 `复杂gia/物理运动.gia`，列出所有 `bool` composite 输入，选 2 个样本做逐字段记录。
3. 生成/解码当前 gsts 输出或最小 bool composite GIA，对比 `CompositeDef.inputs`、调用节点 `InParam` pin、literal wrapper。
4. 写最小自动回归：bool composite 输入在调用节点上应保留真实一致的 pin type/value wrapper，且可覆盖 true/false 两种默认值。
5. 定位并修改通用编码路径，优先看 `index.ts` 的 composite call pin 生成和 `pins.ts` 的 literal wrapper；只有证据指向接口定义时才改 `composite.ts`。
6. 运行 `npm run build`、新增回归、Round 10/11 回归和针对性生成/trace。
7. 生成候选 GIA；用户确认后注入并等待游戏内反馈。
8. 通过后更新 `physics-motion-recreate-guide.md` 和 handover README，必要时归档并提交。
