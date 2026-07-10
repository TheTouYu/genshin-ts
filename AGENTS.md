# Genshin-TS Agent Instructions

- 遇到结构歧义、真实 GIA 结论、游戏状态、布局取舍、注入或破坏性操作时，先与用户确认，不要猜测。
- 遵循目标目录最近的 `AGENTS.md`；只按任务读取匹配的 `.agents/skills/` 和相关文档。
- `docs/composite-ir/handover/` 仅作历史背景；当前行为以源码、测试和真实 GIA 证据为准。
- 不要手改 `src/definitions/`（使用 `npm run gen`）或 `src/thirdparty/`。
- TypeScript 使用带 `.js` 后缀的相对导入；格式为无分号、单引号、100 字符宽。
- `create-genshin-ts/` 是独立 npm 包。
- 优先运行针对性验证；通用构建为 `npm run build`，完整测试为 `npm test`。
