# `create-genshin-ts/` 独立脚手架包

## 适用范围

这是独立发布的 npm 包 `create-genshin-ts`，用于 `npm create genshin-ts@latest`。
它与根包共享仓库，但有独立的 `package.json`、版本和用户文档。

## 修改前

- 先读本目录的 `README.md`；改模板时还要读 `templates/start/README.md`、`README_ZH.md` 和最近的模板规则。
- 区分仓库维护规则与模板最终用户规则：`templates/start/AGENTS.md`、`CLAUDE.md` 面向脚手架生成后的项目，不能直接替换为本仓库规则。

## 修改规则

- 脚手架入口是 `bin/create-genshin-ts.mjs`；模板位于 `templates/start/`。
- 保持 `__PROJECT_NAME__`、`__PACKAGE_NAME__` 占位符以及 `_gitignore` 复制后改名为 `.gitignore` 的行为。
- 保持脚手架零依赖和同步实现；不要无故加入构建步骤、运行时依赖或 Promise/async 流程。
- 修改模板配置、依赖或公开文档时，检查生成后的项目是否仍可安装、编译和使用。

## 验证

- 至少检查脚手架复制路径和受影响模板文件；必要时在临时空目录实际运行脚手架。
- 修改 JavaScript、模板 TypeScript 或包配置后，运行对应的最小命令；最后运行 `git diff --check`。

## 不要做

- 不要把 `dist/` 或编译产物加入此包。
- 不要破坏非空目录保护或 `--force` 的既有语义。
