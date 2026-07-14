# Phase 5：删除 Legacy Backend 与架构硬化

> 状态：进行中；P5-W1 完成（自动 inventory/assert，2026-07-14）
> 来源：目标架构设计 + Phase 4 checkpoint + P5-W1 源码观察
> 最近校验：2026-07-14
> 适用范围：前四阶段完成后的清理和长期防回归；当前唯一工作包见 STATUS `P5-W2`

## 目标

删除 composite ordinary-node 模拟器，建立静态和动态守卫，防止未来再次出现 root/impl 双实现。

## 待删除/缩减候选

权威 inventory 见 `src/compiler/ir_to_gia_transform/legacy_ordinary_inventory.ts`
（`LEGACY_ORDINARY_CALL_SITES` / `LEGACY_ORDINARY_HELPER_SYMBOLS`）。以实际调用者为准逐项删除：

- `resolveImplNodeId()`；
- `resolveImplOrdinaryConcreteNodeId()` / `resolveLegacyImplTypedNodeId()`；
- impl `legacyImplValueTypeSuffix()` 副本；
- ordinary `argVarBaseClass()` / `argVarType()` / `makeVarBaseValue()`；
- `concreteInputIndex()` / `concreteOutputIndex()`；
- `needsConcreteWrapping()` / `wrapConcreteValue*()`；
- ordinary `buildConnPin()` / `buildLiteralPin()` / `buildPlaceholderPin()`；
- `buildImplNodePins()` / `materializeLegacyImplGraphNode()`；
- ordinary manual `connects` assembly；
- 按 getter/local/custom 散落的临时 Graph 特例。

Synthetic composite pins 所需的低层 builder 可以保留，但名称和模块必须明确标示 boundary-only
（call lowerer：`buildCallConnPin` / `buildCallLiteralPin`）。

## 工作项

### 5.1 No-legacy assertions

- [x] P5-W1：ordinary system node 不允许从 composite boundary 模块直接创建 protobuf ordinary pin
  helpers（`buildConnPin` / `buildLiteralPin` / `buildPlaceholderPin` / `buildImplNodePins`）；
- [x] P5-W1：boundary 模块不允许手写 ordinary `bConcreteValue`；
- [x] P5-W1：可复用 legacy call-site inventory（13 families / 22 helper symbols）；
- [ ] 未解析 type/variant 编译失败（后续 hardening）；
- [ ] feature gate/fallback 数量归零（须 default 切换 + legacy 删除后）。

### 5.2 Root ordinary 能力清单与例外审计

从当前 root compiler 实际可生成的 ordinary node/API 出发，建立并审计能力清单。每项必须分类为：

- shared resolver → vendor factory → shared materializer 默认路径；
- 具名的共享 adapter 或待同步 vendor 补丁（含诊断、测试和删除条件）；
- Composite boundary，而非 ordinary 能力；
- 编辑器可用但当前 root 尚未支持的独立功能扩展。

清单是删除 legacy 的架构覆盖审计，不是“所有 API 已游戏验证”的声明。基础 scalar、vec3、entity/guid/config/prefab/faction
和 list/dict 仍按 vendor family、实际失败与真实证据分批处理。

### 5.3 性能与确定性

比较重构前后：

- 大型物理运动生成时间；
- node/edge 数量；
- deterministic output；
- accessory order；
- memory/temporary Graph overhead。

性能优化不得绕过 contract。

### 5.4 文档切换

实现完成后才更新当前权威文档：

- `docs/architecture/stage3-ir-to-gia.md`；
- `docs/architecture/composite/gia-encoding.md`；
- `docs/architecture/composite/testing.md`；
- `docs/composite-ir/05-gia-encoding.md` 中当前实现对照；
- 本目录状态从“规划中”改为“当前实现/已验证”的相应层级。

历史 handover 不重写，只增加 supersession 链接（如确有需要）。

### 5.5 完整验证

```bash
npm run build
npm test
bash tests/composite/test-composite-runner.sh
node bin/gsts.mjs -c gsts.physics-motion.config.ts --noinject
git diff --check
```

真实 GIA diff 与 raw-wire tests 按矩阵执行。注入和游戏验证单独确认。

## 退出条件

- [ ] legacy ordinary backend 调用者为零；
- [ ] fallback telemetry 为零；
- [ ] root/impl parity 覆盖目标矩阵；
- [ ] composite boundary matrix 通过；
- [ ] 全部 focused + project tests 通过；
- [ ] 当前权威文档反映新实现；
- [ ] remaining unsupported families 明确列出，不隐藏；
- [ ] 当前 root ordinary 能力清单和全部共享 adapter/vendor gap 已审计，未保留 Composite 专属 ordinary backend；
- [ ] shared backend 默认切换前已完成 opt-in beta、可回退稳定使用窗口和用户明确批准。

## 长期维护规则

新增 reflective node family 时必须同时提交：

1. resolved type/variant test；
2. root/impl parity fixture；
3. literal 或 connection contract；
4. vendor/真实 GIA 证据分类；
5. 如果需要 normalization，唯一 adapter rule 与退出条件。
