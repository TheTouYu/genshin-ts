# 模板项目使用规则

## 适用范围

本文件会被 `create-genshin-ts` 复制到最终用户项目。它指导用户项目的开发，不适用于 Genshin-TS 仓库内部维护。

## 开始前

- 使用前先读 `README.md`；中文场景同时读 `README_ZH.md` 和 `docs/EDITOR_BOUNDARIES_ZH.md`。
- 先区分“代码可以完成的部分”和“必须在编辑器中完成的资源或配置”。缺少编辑器资源时，明确说明阻塞点，不要猜测资源已存在。
- 用户要求从官方基础模型拼装、缩放或旋转并生成新元件时，先走只读 `maps JSON → inspect → --asset-config → plan`，再查模板/ID/验证边界；复杂结构可使用版本化 JSON `structureFile`，但不要把它当作从 `.gil` 自动提取。`inspect`/`plan` 不授权写回，`closureStatus=complete` 不代表游戏兼容；运行时生成实体查 `createPrefab`，节点图替换查 GIA injection，不要混为一谈。

## 编写规则

- 图逻辑优先写在代码中；新增入口文件时同步更新 `gsts.config.ts` 的 `entries`。
- 使用 `g.server({ id }).on(...)` 定义入口；相同 ID 的入口会合并。
- `gstsServer*` 必须在顶层，且只能有一个位于末尾的 `return`。
- 图作用域内避免 Promise、async、递归、JSON 和普通对象；条件必须是 `boolean`，整数运算优先使用 `bigint`。
- 变量通过 `g.server({ variables: ... })` 声明，并用 `f.get` / `f.set` 读写；类型必须保持一致。

## 调试与验证

- 按顺序检查 `.gs.ts`、`.json`、`.gia`，分别定位编译、IR 连接和最终输出问题。
- 常用命令：`npm run dev`、`npm run build`、`npm run maps`、`npm run backup`。
- 当需要编辑器操作、地图选择或注入时，先说明目标、前提和风险；不要把生成成功当作游戏行为已经验证。
- 真实 `.gil` 写回前展示目标、来源/候选哈希、全部 ID、影响字段、备份与回滚方式，并取得明确确认。
