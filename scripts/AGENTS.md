# `scripts/` 自动化、生成与发布脚本

## 适用范围

这里放 CI、构建、定义生成、测试生成、文档索引和发布脚本。交互式、只读的 GIA 分析工具应放在 `tools/`，不要混入本目录。

## 关键入口

- 定义生成：`generate-definitions.ts`（入口 `npm run gen`，来源 `resources/node_definitions.json`）。
- 测试生成/清理：`testgen/`、`clean-tests.mjs`（`pretest` 清理，保留文件列表必须同步维护）。
- 文档检索/索引：`docs-search.ts`、`docs-index.ts`（对应 `npm run docs:search`、`npm run docs:index`）。
- 发布：`release.mjs`、`postbuild.mjs`；高影响，未经确认不得发布或改版本。

## 修改前

- 先确认脚本是生成、测试、维护还是发布用途，并检查 `package.json` 是否实际调用它。
- 生成 definitions 时，先确认真实来源；生成测试时，确认输出目录会被 `pretest` 清理。
- 修改会删除/移动生成文件的脚本前，先查看 `clean-tests.mjs` 保留列表和 git 状态，避免误删手工回归。

## 修改规则

- 脚本使用 `tsx` 运行，不依赖预先构建的 `dist/`。
- 生成文件只写入既定的 generated 目录；不要把临时输出或分析产物提交到源码目录。
- 修改定义生成流程后使用 `npm run gen`，不要手改 `src/definitions/`。
- 发布脚本和版本流程属于高影响操作；不要在未确认时发布、改版本或触发网络副作用。

## 验证

- 运行受影响脚本的最小命令，检查生成结果和失败信息。
- 改动会影响构建或测试入口时，运行 `npm run build` 或对应测试；最后运行 `git diff --check`。
- 修改文档索引/搜索后，用 `npm run docs:index` / `npm run docs:search` 做冒烟验证。

## 不要做

- 不要在这里添加会修改游戏文件的脚本。
- 不要让 CI/生成脚本依赖本机私有路径、现有 `dist/` 或未记录的手工前置步骤。
