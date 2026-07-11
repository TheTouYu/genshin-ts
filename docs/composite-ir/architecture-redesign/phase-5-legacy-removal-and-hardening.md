# Phase 5：删除 Legacy Backend 与架构硬化

> 状态：待执行
> 来源：目标架构设计
> 最近校验：2026-07-11
> 适用范围：前四阶段完成后的清理和长期防回归

## 目标

删除 composite ordinary-node 模拟器，建立静态和动态守卫，防止未来再次出现 root/impl 双实现。

## 待删除/缩减候选

以实际调用者为准逐项删除：

- `resolveImplNodeId()`；
- `resolveTypedImplNodeId()`；
- impl `valueTypeSuffix()` 副本；
- `argVarBaseClass()` / `argVarType()`；
- `concreteInputIndex()` / `concreteOutputIndex()`；
- `needsConcreteWrapping()`；
- ordinary `buildConnPin()`；
- ordinary `buildLiteralPin()`；
- `wrapConcreteValueForNodeInput()`；
- ordinary manual `connects` assembly；
- 按 getter/local/custom 散落的临时 Graph 特例。

Synthetic composite pins 所需的低层 builder 可以保留，但名称和模块必须明确标示 boundary-only。

## 工作项

### 5.1 No-legacy assertions

- ordinary system node 不允许从 composite boundary 模块直接创建 protobuf `NodePin`；
- ordinary system node 不允许手写 `bConcreteValue`；
- 未解析 type/variant 编译失败；
- feature gate/fallback 数量归零。

### 5.2 完成类型矩阵

至少基础 scalar、vec3、entity/guid/config/prefab/faction；list/dict 按 vendor family 和真实证据分批完成。未完成 family
不得声称“全类型支持”。

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
- [ ] remaining unsupported families 明确列出，不隐藏。

## 长期维护规则

新增 reflective node family 时必须同时提交：

1. resolved type/variant test；
2. root/impl parity fixture；
3. literal 或 connection contract；
4. vendor/真实 GIA 证据分类；
5. 如果需要 normalization，唯一 adapter rule 与退出条件。
