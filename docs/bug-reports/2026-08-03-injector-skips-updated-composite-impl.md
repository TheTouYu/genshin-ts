# Bug 汇报：注入器按 id 去重合并 accessories，复合节点内部实现更新永不生效

- 日期：2026-08-03
- 来源项目：star-cube-nexus（星序方枢，2×2 魔方核心操作 MVP，Phase 2 选项卡信号驱动）
- 严重程度：高（复合节点内部改动无法注入生效，且无任何报错，表现为"改了没生效"的隐蔽行为）
- 状态：已修复（2026-08-03，注入器层；游戏内复验待 owner）

## 修复记录（2026-08-03）

- `src/injector/index.ts`：`mergeWrappedFieldMessages` 增加 `overwriteExisting` 参数（默认 `false`，保留原"同 id 跳过"语义）；compositeDef（field 2）与 impl graph（field 4）两个调用点显式传 `true`，同 id 时**原地替换** gil 侧 wrapper（保持顺序、不重复追加）。
- 信号定义保护不受影响：`incomingCompositeDefBytes`/`incomingImplGraphBytes` 在调用点已通过 `isSignalDefinitionAccessory` 过滤，游戏内注册的信号定义永远不会进入覆盖路径（2026-07-31 真实故障的语义保留在过滤层 + 默认参数）。
- 新增红灯回归 `tests/injector/composite-reinjection.test.ts`：构造 gil 含旧复合定义（9 节点实现）+ gia 含同 id 新定义（13 节点实现），断言二次注入后 field 2/4 为新版本且不重复追加。修复前红灯（`'旧实现' !== '新实现'`），修复后绿灯。
- 已注册进 `npm run test:injector`（连同原有 client-graph / signal-boundary 测试）。
- 验证：`npm run build` 通过、`git diff --check` 通过、test:injector 三个文件全部通过。**未运行**：star-cube-nexus 真实注入重验证（workaround 可移除）与游戏内行为验证，待 owner 复验。

## 现象

修改 `g.defineComposite` 复合节点的内部实现（例如新增 `getEntityLocationAndRotation` 节点）后，`npm run build` 正常完成、注入日志全部 `[ok]`，但**游戏内行为不变**：读取注入后的 `.gil`，该复合节点的实现图仍是旧版本（节点数不变），新实现从未写入。

主图（server/entity graph）的修改可以正常注入生效——只有复合实现（accessories）更新失效，且全程无任何错误提示。

## 最小复现

1. 定义复合节点 `BindUFaceToPivot`（内部 4 个 switch + 4 个 activate，共 9 节点），编译注入。
2. 修改其内部实现：新增 4 个 `getEntityLocationAndRotation` 节点（共 13 节点），重新 `gsts build` 注入。
3. 解码注入后的 `.gil`：`compositeDef`（id 1610700002）对应的实现图（impl graph id 1610710002）仍是 **9 节点**；而新编译的 `.gia` 中为 **13 节点**。

复现源码：star-cube-nexus `src/cube2/experiment.ts`（BindUFaceToPivot / BindRFaceToPivot / BindFFaceToPivot）与 `src/cube2/param-turn.ts`（makeFaceComposites 生成的 BindDFaceToPivot 等），id 区间 1610700000-1610700019。

## 根因分析

- `src/runtime/composite_registry.ts`：复合节点 id 为编译期全局自增计数器（`nextCompositeId = 1610700000`，每次 `define` +1），**与名字无关、跨编译稳定**。同一套复合定义每次编译生成完全相同的 id 序列。
- `src/injector/index.js` 的 `mergeWrappedFieldMessages`：合并 accessories（compositeDef 与 impl graph）时按 id 去重——`if (existingIndex !== undefined) continue`，**保留 gil 侧旧定义，跳过新定义**。该 skip 语义是为"信号定义 accessories 携带已注册的 signal id，覆盖会破坏游戏内信号路由"（2026-07-31 真实故障修复）设计的，但被不加区分地用于全部 accessories，包括普通复合节点。
- 主图走另一条路径（field 1 wrapper 直接替换），因此主图总能更新——造成"复合改了不生效、主图改了生效"的隐蔽分裂。

## 证据边界

- 已确认：注入前 `.gil` 与注入后 `.gil` 的 BindUFaceToPivot 实现均为 9 节点（旧）；新编译 `.gia` 为 13 节点；用 `tools/prune-gil-composites.ts` 删除旧 accessories 后重新注入，`.gil` 变为 13 节点（新），游戏内待验证。
- 已确认：`mergeWrappedFieldMessages` 对 `compositeDef`（field 2）与 impl graph（field 4）均按 id 去重；`CompositeRegistry` 的 id 为全局自增、跨编译稳定。
- 未确认：其他项目/场景下是否也受影响（只要复合 id 与 gil 中已有 id 重叠即受影响，普遍成立）。
- 未涉及：GIA 编码、编辑器加载。游戏内行为验证（连续旋转无自旋）待 owner 复验后补充。

## Workaround（当前采用）

新增脚本 `tools/prune-gil-composites.ts`：从 `.gil` 的 NodeGraph 容器（payload 顶层 field 10）中按 id 区间删除旧 compositeDef（field 2）与 impl graph（field 4）wrapper，再重新 `gsts build` 注入（id 不存在 → append 新版）。已验证注入后 6 个 bind 复合实现均由 9 → 13 节点。

## 期望行为 / 建议修复方向

- `mergeWrappedFieldMessages` 增加分类处理：仅对**信号定义** accessories 保留"同 id 跳过"语义（防止覆盖游戏内注册），对普通复合节点的 compositeDef / impl graph 采用"同 id 覆盖"；
- 或对普通复合节点的实现采用版本化 id（如内容哈希），使变更自然产生新 id 并追加；
- 或注入时输出 warning：检测到同 id 旧定义被跳过时提示用户，避免静默失效。

## 附注

- owner 反馈的另一可能根因：游戏编辑器发现同名复合节点时会自动给当前版本加 `_1` 后缀，导致原始名字的实现未生效，建议换新名字重注入。本次场景中在 `.gil` 内**未观察到** `_1` 后缀定义（重复定义仅存在于信号类 发送/监听/向服务器节点图发送信号），且复合 id 与名字无关（见根因分析），换名不改变 id，因此该机制不适用于本 bug 的注入器路径；但"编辑器同名重命名"现象本身值得记录，若在编辑器内打开图后复现，可单独跟进。
- 编译器仓库内最小复现测试已补：`tests/injector/composite-reinjection.test.ts`（同一复合 id 二次注入，验证实现图被替换、不重复追加）。
