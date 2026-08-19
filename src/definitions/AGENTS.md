# `src/definitions/`：自动生成的定义

## 适用范围

本目录由定义资源和生成脚本产出，提供节点、事件、枚举、实体 helper、中文别名和 mode 类型。除明确标注的例外外，文件均视为生成物。

## 来源与生成

- 节点、事件、枚举和实体定义通常来自 `resources/node_definitions.json`；生成入口是 `npm run gen`（脚本 `scripts/generate-definitions.ts`）。
- 中文别名生成入口：`scripts/generate-zh-aliases.mjs`。
- `node_modes.ts` 如需手工维护，必须说明它与生成流程的关系，并检查 classic/beyond 两种模式。

## 修改前

- 先确认所需变化属于节点/事件/枚举/实体/prefab/别名/mode 的哪一类，并找到真正来源；不要直接改生成物。
- 新增或调整节点定义时，同时检查编译器映射、vendor 一致性和测试生成是否需要同步。

## 修改规则

- 不手改自动生成文件；修改来源后运行 `npm run gen`，让生成器和 Prettier 共同产出结果。
- 中文别名走对应来源或生成脚本，不直接修改生成后的别名表。
- 生成 diff 只应包含来源变化对应的产物变化；夹带手改视为错误。

## 验证

- 运行 `npm run gen`，检查生成 diff 是否只包含预期变化。
- 视改动范围运行 `npm run build`、定义一致性或针对性测试；最后运行 `git diff --check`。

## 不要做

- 不要为临时修复直接改 `nodes.ts`、`enum.ts`、`events*.ts`、`entity_helpers.ts` 等生成物。
- 不要把 vendor 缺口伪装成 definitions 修改；应在项目映射层处理或走 vendor 更新流程。
