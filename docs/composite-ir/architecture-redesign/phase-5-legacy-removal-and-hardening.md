# Phase 5：删除 Legacy Backend 与架构硬化

> 状态：进行中；P5-W1..P5-W4、P5-W6..P5-W8 完成（P5-W8 用户核验通过已归档、待提交）；当前唯一工作包 P5-W9
> 来源：目标架构设计 + Phase 4 checkpoint + P5-W1..W8 源码观察 + grilling 共享理解
> 最近校验：2026-07-16
> 适用范围：前四阶段完成后的清理和长期防回归；当前唯一工作包见 STATUS `P5-W9`

## 目标

删除 composite ordinary-node 模拟器，建立静态和动态守卫，防止未来再次出现 root/impl 双实现。

## 待删除/缩减候选

权威 inventory 见 `src/compiler/ir_to_gia_transform/legacy_ordinary_inventory.ts`
（`LEGACY_ORDINARY_CALL_SITES` / `LEGACY_ORDINARY_HELPER_SYMBOLS`）。以实际调用者为准逐项删除：

- `resolveImplNodeId()`；
- `resolveImplOrdinaryConcreteNodeId()`（P5-W8 后无 residual identity 调用者；13 residual scalar + enumerations_equal 已走 shared identity；helper 仍可能被 pin 路径引用）；
- ~~`resolveLegacyImplTypedNodeId()` / `usesLegacyImplTypedIdentityAdapter()` / `legacyImplValueTypeSuffix()`~~（P5-W4 已删；adapter set 本已为空）；
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
- [x] P5-W2：正式 opt-in beta 配置/CLI/诊断入口（`options.stage3.vendorImplGraphBeta` /
  `--stage3-shared-impl-beta` / env 兼容）；默认仍为 handwritten，不删 legacy；
- [ ] 未解析 type/variant 编译失败（后续 hardening）；
- [ ] feature gate/fallback 数量归零（须 default 切换 + legacy 删除后）。

### 5.2 Root ordinary 能力清单与例外审计

- [x] P5-W3：可机读能力清单 `root_ordinary_capability_inventory.ts`（19 项已分类：
  shared-path / named-shared-adapter / boundary / root-unsupported）；focused contract 通过；
  不构成全 API 游戏验证声明。
- [x] P5-W4：删除空的 legacy typed-identity adapter 表面；inventory 12 call-sites / 19 helpers；
  用户 2026-07-15 确认编辑器加载与可观察执行通过；已提交。
- [x] P5-W6：root→shared-beta ordinary 覆盖矩阵骨架（grilling W1/E3）；
  `root_impl_ordinary_coverage_matrix.ts` + encode probe；total=73 green=32 red=0 unknown=41；
  不改生产编码 / default gate；旧 P5-W5 residual 清单并入矩阵调度。
- [x] P5-W7：residual scalar ordinary 身份迁 shared resolver（13 族 shared-path green；
  residual-concrete 仅 `enumerations_equal`）；生产 ordinary concrete identity 接线已改；
  自动 focused 通过；用户 2026-07-16 确认编辑器加载与可观察执行通过并归档；已提交。
- [x] P5-W8：`enumerations_equal` residual 身份迁 shared resolver（矩阵 residual-concrete 清空；
  enumerations-equal green）；生产 ordinary concrete identity 接线已改；自动 focused 通过；
  用户 2026-07-16 确认编辑器加载与可观察执行通过并归档；待提交。
- [ ] P5-W9：pin-hole named adapter 最小共享收口（矩阵 pin-hole unknown 族）。

从当前 root compiler 实际可生成的 ordinary node/API 出发，建立并审计能力清单。每项必须分类为：

- shared resolver → vendor factory → shared materializer 默认路径；
- 具名的共享 adapter 或待同步 vendor 补丁（含诊断、测试和删除条件）；
- Composite boundary，而非 ordinary 能力；
- 编辑器可用但当前 root 尚未支持的独立功能扩展。

清单是删除 legacy 的架构覆盖审计，不是“所有 API 已游戏验证”的声明。基础 scalar、vec3、entity/guid/config/prefab/faction
和 list/dict 仍按 vendor family、实际失败与真实证据分批处理。后续分项删除以清单中的
`compositeLegacyRisk` / named adapter 行为准。

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
- [x] 当前 root ordinary 能力清单已建立并分类（P5-W3；自动审计，非全 API 游戏验证）；
- [ ] 全部共享 adapter/vendor gap 已收敛或具名删除条件满足，未保留 Composite 专属 ordinary backend；
- [x] opt-in beta 配置/CLI/诊断入口已建立（P5-W2；默认仍 handwritten）；
- [ ] shared backend 默认切换前已完成可回退稳定使用窗口和用户明确批准。

## 长期维护规则

新增 reflective node family 时必须同时提交：

1. resolved type/variant test；
2. root/impl parity fixture；
3. literal 或 connection contract；
4. vendor/真实 GIA 证据分类；
5. 如果需要 normalization，唯一 adapter rule 与退出条件。
