# T03 · 命令面补全：3 个零命中命令 + 7 个缺失命令族

**What to build**：让技能层的"能做什么"与 CLI 真实能力对齐（现状：三个命令零文档面）。

- Blocked by：无
- Status：✅ 2026-10-17

## 验收
- [x] `client:sim`（**全仓 0 命中**）落进技能：用途（spawn 模拟器 studio/cli.mjs，get/patch/playStart/playRun/playStop）、与 `qxqy-simulator` 的关系、`--sim-root` 默认值
- [x] `assets:structs`（命令名 12 技能 0 命中）落进 `genshin-ts-asset-operations`
- [x] `assets:scripts update` 落进 `genshin-ts-asset-operations`（f50 登记表 + `external_lua_file` + Temp 同步 + BOM）
- [x] `src/cli/AGENTS.md` 命令表补 7 族：`assets:creations` / `assets:aux` / `assets:structs` / `assets:library-inject` / `maps:init` / `maps:resync` / `variables:verify`
- [x] **机制坑写进技能**：`gsts <族> --help` 不列子命令 ⇒ 查动作要读 `src/cli/*.ts` 的 `usage()`
- [x] 验收：命令表与 `src/cli/gsts.ts:1750-2270` 注册点逐条对齐（35 条全覆盖）
