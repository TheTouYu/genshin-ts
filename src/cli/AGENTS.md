# `src/cli/` 命令行与本机工作流

## 适用范围

这里实现 `gsts` 命令行、配置读取、Windows 游戏路径、GIL 资产命令、备份和开发模式。CLI 会连接编译、生成和注入流程，因此改动需要特别注意文件安全。

## 命令族速查

| 命令 | 作用 | 关键文件 |
| --- | --- | --- |
| `assets:entities` | 场景实体 export/import/patch | `assets_entities.ts`、`gil_entities.ts` |
| `assets:custom-variables` | 实体/元件/玩家/角色变量 | `assets_custom_variables.ts`、`gil_custom_variables.ts` |
| `assets:level-variables` | 关卡变量 | `assets_level_variables.ts`、`gil_level_variables.ts` |
| `assets:prefabs` / `assets:gadgets` | 自定义元件 / 静态元件 / 官方装饰物查询 | `assets_prefabs.ts`、`assets_gadgets.ts` |
| `assets:resources` | 列出/解析 元件资源（root4+root8）与摆放实体（root5） | `assets_resources.ts` |
| `assets:static-assemblies` | 静态模型拼装写回 | `assets_static_assemblies.ts` |
| `assets:skill-config` | 技能配置创建/列表（36/6/28 模板×普通/瞬发+绑定） | `assets_skill_config.ts` |
| `assets:unit-status` | 单位状态创建/列表/加效果（root15/16 双写 + root6 登记） | `assets_unit_status.ts`、`unit_status_data.ts` |
| `assets:global-timers` | 全局计时器定义/实体组件挂载（root12 + root5 type16） | `assets_global_timers.ts` |
| `assets:terrain` | 地形/草皮资产 | `assets_terrain.ts`、`gil_terrain.ts` |
| `assets:ui` / `assets:node-graphs` / `assets:mounts` / `assets:signals` | UI/图挂载/信号 | 对应 `assets_*.ts` |
| `assets:scripts` | Lua 脚本登记表 f50（list/register/update + external_lua_file + Temp 同步） | `assets_scripts.ts`、`gil_scripts.ts` |
| `client:sim` | 千星模拟器 headless 桥接（get/patch/playStart/playRun/playStop，spawn 模拟器 studio/cli.mjs） | `client_sim.ts` |
| `image:*` | 图片素材导入/导出（SVG/CSS/JSON ↔ GIA image） | `image_editor.ts` |
| `maps` | 地图创建/打开/同步 Temp | `maps.ts`、`gil_paths.ts` |
| `maps:create` / `maps:init` / `maps:resync` / `maps:rename` | 建图 / 补引擎骨架 root 3-49（首次保存门槛）/ 同步编辑器 Temp + gip 注册 / 改名 | `maps.ts` |
| `assets:creations` | 字节透传克隆编辑器模板创建复杂造物（造物）+ export-template | `assets_creations.ts` |
| `assets:aux` | 给实体/元件/模型宿主挂装饰物（root 27 aux） | `assets_aux.ts` |
| `assets:structs` | 地图级结构体 list/inspect/create/update（root6 注册 + root10 f6 定义，23 成员类型） | `assets_structs.ts` |
| `assets:library-inject` | 把 assets/images/*.css 资产注入 .gil 素材库 | `assets_library_inject.ts` |
| `variables:verify` | 按已闭合规律表逐字节核验变量 wire（只读，PASS/DIFF，退出码 0/1） | `variables_verify.ts` |

> ⚠ **子动作不在 `--help` 里**：全部注册为 commander **叶子命令**（`.command('assets:ui')`），子动作是**位置参数**
> ⇒ `gsts <族> --help` 只打印选项。查动作全集读 `src/cli/*.ts` 的 `usage()`（例外：`assets:node-graphs`、
> `assets:skill-config` 把动作表写进了 usage）。2026-10-17 实测。

## 修改前

- 先读 `src/compiler/AGENTS.md` 或 `src/injector/AGENTS.md` 中与任务相关的规则。
- 涉及地图、玩家、`mapId`、`nodeGraphId`、GIL 路径、备份或 reinject 时，先展示目标和计划，再向用户确认。
- 改变量/实体/元件编码时，先查 `docs/game-engine-knowledge/variables.md`、`gil-structure-semantics.md` 和 `.agents/skills/genshin-ts-asset-operations/`；未知 wire 先做编辑器最小差分，不要在代码里猜字节。

## 修改规则

- `gsts.ts` 是命令行入口；拆分或新增命令时保持现有参数、配置加载、i18n 和错误处理风格一致。
- `.ts`、`.gs.ts`、`.json`、`.gia` 入口有不同处理路径；修改时保持各阶段产物和自动识别语义一致。
- 保留 `_GSTS` 安全检查、注入前备份和用户配置的安全选项；任何绕过都必须显式、可见且经确认。
- 用户可见字符串使用现有 i18n 机制，不直接散落硬编码文本。
- Windows 路径、国服/国际服识别和状态文件属于环境相关逻辑；不能假定当前机器目录或游戏区服。
- **实体 GUID 动态分配**：新建实体由 CLI 自动分配下一个空闲 ID（≥1077936129），不要硬编码；更新已有实体时可用显式 ID 定位。
- 写回真实地图必须备份到 `.gsts/backups/`；涉及 Save_Level 写回的命令尽量同步 `Temp/`（`syncGilToTemp`/`resyncMap`），缺同步时在报告中明确提示。

## 验证

- 运行受影响命令的安全、只读或 `--noinject` 验证；不要把它称为注入或游戏验证。
- CLI-only 改动：`npm run build` + 直接 `npx tsx tests/<file>.ts` + `git diff --check`；不需要全量管线。
- 生成候选先用 `--output` 独立回读，确认只差目标字段后再 `--write`。

## 不要做

- 未经确认不要注入、覆盖、删除 GIL 或游戏目录文件，也不要启用自动 reinject。
- 不要绕过 `_GSTS`、备份或非空图保护来让单个测试通过。
- 不要用待修的生产生成链证明未知 wire 规则。
