# 迁移不变量与停止条件

> 状态：当前推荐 / 迁移约束
> 来源：当前代码实现 + 已有自动回归 + 已确认真实 GIA/游戏验证记录
> 最近校验：2026-07-11
> 适用范围：architecture-redesign 全部阶段

## 1. 普通节点不变量

- 同一 ordinary IR node 在 root 与 impl 的类型决策不能由两套节点名特例完成。
- 类型未解析时不得默认编码为 int、`VarType=0` 或 generic variant 后继续。
- literal 和 connection 只能改变值来源，不能改变目标 pin schema。
- hidden pin 的 logical→physical index 映射只执行一次。
- 普通节点 concrete wrapper 不由 composite boundary 代码手写。
- 变量 getter/setter 必须使用同一声明类型，并校验值类型。

## 2. Composite 边界不变量

迁移不得破坏：

- nested composite 保持嵌套，不能展开；
- `__composite_capture__` 的边重定向语义；
- capture input 不错误生成普通 physical input pin；
- 非 capture 的 literal/connection input 保留 physical pin；
- sparse named input 使用 `compositeInputIndex`，不能因数组压缩改变 pin；
- `compositePinIndex` 与 definition pinIndex 对齐；
- pure-data 与 exec composite 的 output/outflow 规则保持；
- 多 inflow/outflow 的 source/target index 保持；
- impl node index remap 后所有 `compositePins` 和 connects 指向同一 encoded index。

## 3. 已通过行为基线

物理运动迁移期间特别锁定：

- `更新v、w` 外层执行拓扑；
- bool concrete metadata；
- sparse named input；
- capture 路由；
- Local Variable 编码；
- 布局参数；
- vec3 literal `new vec3([0, 1, 0])` 的 `VectorBase`、`alreadySetVal=true` 与 `bVector`；
- 独立嵌套复合 `与` 和 `can fly`。

这些基线并不宣称所有内部路由均已真实验证；只表示迁移不能无证据改动已确认部分。

## 4. 证据不变量

- `npm run build` 只证明类型构建。
- GIA 生成成功只证明 protobuf 可生成。
- trace/inspect 只证明对应观察字段。
- decode defaults 不证明 wire field presence。
- 注入成功不证明游戏行为。
- 游戏内验证必须由用户或明确日志确认。
- 单一真实 float 样本不能自动证明全部 reflective 类型。

## 5. Source boundary

- 不手改 `src/definitions/`；需要变化时运行 `npm run gen`。
- 不手改 `src/thirdparty/`。Vendor gap 在项目 adapter 中记录；如确需 vendor 更新，单独走维护流程。
- 已确认 vendor schema/生成器缺口时，先在 editor-pack compat 分支以最小测试补丁，再以明确 commit 同步；不得复制 vendor 数据或在 Composite 中做专属补丁。
- 短期共享 adapter 只可在有诊断、自动回归、TODO、关联 vendor 补丁/同步事项与删除条件时存在；不得静默 fallback。
- Stage 3 保持为 `IR.d.ts` consumer；不要为了规避 resolution 随意导入生成 definitions。
- TypeScript 相对导入使用 `.js`，无分号、单引号、100 字符宽。

## 6. 失败归因与证据不足

失败按最早偏差依次归类，不能跳过前层直接指责 vendor 或 boundary：

0. 用户 DSL/源程序约束；
1. root/impl ordinary IR；
2. 共享 identity/type/pin 决策；
3. shared node/edge materialization；
4. Composite boundary（call、capture、binding、`compositePins`、nested/index remap）；
5. vendor/schema；
6. 编辑器或游戏行为。

没有真实证据的 root/impl 结构或行为差异只能保留为待验证假设与最小自动契约，并记录适用范围；不改变已验证行为，
不得宣称等价。只有它阻塞阶段退出、manifest、beta/default 切换、legacy 删除或代表性游戏回归失败时，才升级为必须取得
真实证据的阻塞项。

## 7. 阶段停止条件

出现任一情况立即停止推广：

- root 输出发生非预期结构变化；
- nested/capture/sparse regression 失败；
- concrete ID 正确但 pin schema 与真实 GIA 不一致；
- vendor Graph 连接改变 source/target kind/index；
- 同一变量 getter/setter resolved type 不一致；
- fallback 数量无法解释；
- encoded round-trip 丢字段；
- 需要猜测真实 GIA、mapId、nodeGraphId 或游戏状态。

停止后动作：

1. 保存最小失败样本和 decoded/wire 输出；
2. 标明失败处于 resolution、lowering、materialization 或 boundary；
3. 回滚该切片开关，不回滚观察测试；
4. 更新 `decision-log.md` 的 rejected/unknown；
5. 在没有用户确认时不注入。

## 8. Legacy 删除闸门

只有同时满足以下条件才能删除对应 legacy helper：

- shared backend 已默认运行，并完成至少一轮真实项目/使用场景反馈审计；
- 仍可 opt-out 到 legacy 的稳定回退窗口已经完成；
- 当前 manifest 的代表性候选已在默认 shared backend 下由用户重新确认可观察执行；
- 所有调用者已迁移，且 root ordinary 能力清单已分类为共享路径、具名共享 adapter/vendor 补丁、boundary 或 root 未支持能力；
- 新路径有 root/impl parity；
- 至少有一个真实 GIA 对照或明确 vendor schema 证据；
- focused tests 覆盖 literal 与 connection；
- 不再有兼容 fallback、未解释 vendor gap 或仍依赖 legacy 的 ordinary family；
- `rg` 证明无普通节点调用；
- 删除后 build、完整自动回归、代表性游戏回归和 `git diff --check` 通过；
- 历史测试、manifest 条目、失败样本和决策记录保留。
