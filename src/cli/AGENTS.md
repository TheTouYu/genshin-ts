# `src/cli/` 命令行与本机工作流

## 适用范围

这里实现 `gsts` 命令行、配置读取、Windows 游戏路径、GIL 资产命令、备份和开发模式。CLI 会连接编译、生成和注入流程，因此改动需要特别注意文件安全。

## 命令族速查

| 命令 | 作用 | 关键文件 |
| --- | --- | --- |
| `assets:entities` | 场景实体 export/import/patch | `assets_entities.ts`、`gil_entities.ts` |
| `assets:custom-variables` | 实体/元件/玩家/角色变量 | `assets_custom_variables.ts`、`gil_custom_variables.ts` |
| `assets:level-variables` | 关卡变量 | `assets_level_variables.ts`、`gil_level_variables.ts` |
| `assets:prefabs` / `assets:gadgets` | 自定义元件/官方装饰物查询 | `assets_prefabs.ts`、`assets_gadgets.ts` |
| `assets:static-assemblies` | 静态模型拼装写回 | `assets_static_assemblies.ts` |
| `assets:ui` / `assets:node-graphs` / `assets:mounts` / `assets:signals` | UI/图挂载/信号 | 对应 `assets_*.ts` |
| `maps` | 地图创建/打开/同步 Temp | `maps.ts`、`gil_paths.ts` |

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
