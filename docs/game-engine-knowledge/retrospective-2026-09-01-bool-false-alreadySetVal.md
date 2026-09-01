# 完整复盘：set 族变量 bool false 被引擎回退 true（2026-09-01）

> 范围：rubik-3x3-client「R 面转修复后后续交互无响应」回归轮（含定时器引脚修复 c7c263a 的前置）
> 视角：编译器 Stage 3 wire 归一化缺陷 → 引擎回退默认值 → 游戏行为锁死
> 证据：提交 e7fe704（修复）/ c7c263a / af6a139 / a06cfa4；日志 3074 rec58；参照物 1899；
>      备份 1073741914.gil.before-boolfix-20260901-112208.bak；注入后 SHA 084afe5d
> 状态：已修复已注入已提交；游戏复测待用户确认

## 一、错误谱系总览

| # | 日期 | 根因层 | 具体错误 | 修复 | 提交 |
|---|------|--------|----------|------|------|
| 1 | 08-29 | 编译器 Stage3 | normalizeNodePinValuesEditorWire 把显式 bool false 当默认值零清 alreadySetVal | e7fe704 保留 set 族 value pin 的显式 false | e7fe704 |
| 2 | 08-31 | 编译器 Stage3 | 同函数 bArray/bDict 容器漏判已设值（分支 cases 丢失） | 44a18d8 补 entries/mapPairs 非空判据 | 44a18d8 |
| 3 | 08-29 | 编译器 Stage3 | 同函数内层 alreadySetVal 一律省略（Get/Set 与编辑器字节级一致误判） | 79a24a7 引入归一化 | 79a24a7 |

## 二、最近一次错误的完整调查链

### 现象
- rubik 3x3 R 面转修复（c7c263a）后，用户复测：R 转正常（9 块动画），但之后任何交互无响应。
- 日志 3074 帧级：rec62（第二次交互）flow_tab_lock 读 lock = true → doubleBranch 空分支吞掉输入。

### 分层定位（每层缩小范围）
1. 输入侧排除：rec29/rec59/rec67 game dispatch 记录都在，op3 信号确实发出 → 不是 tab/panel 输入问题。
2. turn 图定位：rec62 lock=true 直接吞掉；rec58 unlock 定时器确实触发，但 set lock 写入 IN2=1（true）。
3. unlock 分支是罪魁：源码 turn.ts:195 写 false，但运行时写 true。
4. 编译产物 vs 地图差分：新鲜 .gia root unlock = bEnum{val:0}（正确形态）；1899 参照物 = alreadySetVal:true + bEnum{}；1914 地图 = enum:1（引擎重写后）。
5. 编译器最小复现：setNodeGraphVariable('lock', false) → 产物 bConcreteValue 内层 alreadySetVal:false。
6. 根因行：normalizeNodePinValuesEditorWire hasNonDefault 的 bEnum 判定 val !== false && nonZero(val) 把显式 false 排除 → 清 alreadySetVal。

### 关键判据（为什么"注入没替换"是错的）
- rec58 是引擎真实执行记录：unlock 执行时读到的就是 true。若 .gil 里是引擎认的 false，日志不可能为 1。
- 所以是编译器写出的形态引擎不认（alreadySetVal:false = 未设置）→ 引擎回退默认 true。
- 用户判断「注入的逻辑游戏引擎不认」精确指向 alreadySetVal 语义。

### 修复
- 给 normalizePinInner 增加独立参数 explicitBoolFalse，仅对 set_node_graph_variable(323)/set_custom_variable(22) 的 R<T> value pin 触发，
  bEnum.val === false || 0 判为非默认，保留 alreadySetVal=true。
- 不影响 gid18/19 默认锚语义（独立参数，不混用 keepNonDefaultAlreadySetVal）。

### 验证
- 最小复现 case：alreadySetVal:false → true ✓
- rubik turn.gia/game.gia 完整构建：unlock/reset 的 lock=false 均 alreadySetVal:true ✓
- local_variable_editor_wire_test + bool composite x3 + quicktest 全绿 ✓
- 注入 10/10，回读 .gil：unlock enum:0 ✓、seq wire OUT3 ✓、复合引用 0 悬空 ✓、Temp md5 一致 ✓

## 三、为什么反复出问题——系统性根因

1. "默认值零"与"显式设置零"被混为一谈：归一化函数用"值是否为 0/空"判断"是否已设置"，
   但显式写 0/空 也是"已设置"。bool 尤其致命（引擎默认 true ≠ false），int/float/string 恰好无差异（默认=0/空）被掩盖。
2. 验证链盲区：注入后只核对"变化的 wire"（seq），没核对"本应不变的常量"：c7c263a 回读只验 seq wire，
   未验 unlock 值 → 老 bug 被新注入掩盖成"R 转后无响应"。
3. 归一化函数是"以编辑器样本为模板"的单点假设：79a24a7 按 v10 局部变量样本推断"内层一律无 alreadySetVal"，
   但 set 族显式赋值的语义被漏掉——编辑器样本覆盖不足。

## 四、流程与方法论教训

1. 三层差分方法论有效：源码 → 编译产物 → 地图（1899 参照 vs 1914 污染）→ 运行时日志，逐层收敛到编译器行。
2. 用户判断"引擎不认注入的逻辑"是正确方向：运行时日志是铁证，不能用"注入没替换"的静态推断替代。
3. 同族检查：int 0/float 0/string '' 显式设置不中招（引擎默认=0/空，行为等价）；bool 是唯一受害者。
   但 set_custom_variable 同族已一并修复（同一归一化路径）。
4. 注入后核验应包含"常量值"而不只是"连线"：补一个"关键常量断言"步骤（unlock 值、默认值等）。

## 五、风险探索与未闭合项

- 游戏复测待确认：注入后用户复测（R 转 + 后续交互）——这是最终验收。
- normalizeNodePinValuesEditorWire 的其它同族风险：get 族 OutParam 锚（gid18/19）已单独处理；
  assembly_list（169/170）元素规则已单独处理；其余 bConcreteValue 包裹节点族（math/vec）的显式零值
  是否受影响未逐一枚举（本次 bool 已覆盖，数值类行为等价可暂缓）。
- open-item O-2026-09-01-03 登记：normalize 函数后续若遇"显式零值需保留"的新类型，应统一走 explicit 参数模式。

## 六、产出清单

- 修复：e7fe704（compiler index.ts）
- 注入：10/10 + 回读核验（SHA 084afe5d）
- 文档：本复盘
- 技能迭代：debug-log-investigator（记录解锁后交互无响应的判读门）、dsl-nodegraph-development（set bool false 语义）、
  gil-node-graph-reading（注入后常量核验）——待执行
- PKC 录入：待（set 族 bool false alreadySetVal 规则）
