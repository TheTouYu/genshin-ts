# 27 · 客户端 `enum_list` 参数无法传值（射线检测的筛选参数编不过）

> doc-type: T · status: open · updated: 2026-10-24
> 报告人：football 线（v3 客户端计算）· 修复人：独立会话/用户
> 优先级：中（挡住"用引擎射线替代几何近似"的所有玩法判定：拦截/传球/门将/地面）

## 1. 现象（最小复现）

在 **20008 造物技能图**里调用射线检测：

```ts
import { RayFilterType } from 'genshin-ts/definitions/client_enums'
import { TargetType } from 'genshin-ts/definitions/enum'
// 在 g.creationSkill({id}).on('start', (e, f) => { ... }) 内
const hit = f.getRayDetectionResult(
  f.getSelfEntity(),
  origin, dir, 12.0,
  TargetType.None,
  f.getEntityTypeList(),                        // enum_list 参数 1
  f.getRayFilterTypeList([RayFilterType.Scene]) // enum_list 参数 2
)
```

编译命令（必须用 dist CLI，否则 IR 恒空）：

```bash
npm run build
cd examples/football && node ../../dist/src/cli/gsts.js --config ./gsts.kit3.config.ts --noinject
```

报错原文：

```
Error: Generic parameter not matched: {"type":"enum","value":"ray_filter_type_scene"}
[error] gs_to_ir_json failed: …/kit-loop.gs.ts
```

## 2. 已排除（不是用法问题）

节点**在 20008 可用**——`resources/client_node_metadata.json` 里 `get_ray_detection_result` 有 5 条，
其中 `graphType=20002 subType=creation_skill`（样例 `造物技能节点图\获取射线检测结果_连线.gia`），
所以白名单 `client_method_modes.ts` 的 `creation_skill` 列出它是**对的**。

四种写法全部同一错误：

| 写法 | 结果 |
|---|---|
| 裸数组 `[RayFilterType.Scene]` | 同错 |
| `f.assemblyList([RayFilterType.Scene], 'enum')` | 同错 |
| `f.getEntityTypeList()`（空 typed list） | 换成 `ray_filter_type_scene` 或空列表仍错 |
| `f.getRayFilterTypeList([RayFilterType.Scene])`（官方拼装助手） | 同错 |

⇒ 失败点在 **`enum_list` 类型参数**（metadata `connectionType: 17`），不在节点可用性。

## 3. 定位线索

- wrapper 解析：`src/definitions/client_nodes.ts:4073` `parseValue(entityTypeFilter, 'enum_list')`；
  `parseValue` 的 `enum_list` 分支（`src/definitions/nodes.ts:465`）只接受两种形态：
  ① `list` 且 `getConcreteType()==='enum'`；② `Array.isArray(v)` → 逐项 `parseValue(item,'enumeration')`。
- `parseValue(item,'enumeration')` 要求 `item instanceof enumeration`（`nodes.ts:365`）。
  报错发生在 `matchTypes`（`nodes.ts:600`）⇒ 走到的是**泛型匹配**路径，说明两种形态都没被采纳，
  枚举字面量最终以 `{type:'enum'}` 形态进入匹配并失败。
- 现有 `getRayFilterTypeList` / `getEntityTypeList` 助手内部用 `assertClientFixedSlotArray` + `parseValue(t,'enum')`，
  也就是它们**绕过了** `enum_list` 的校验但产出的列表不被节点参数接受。

## 3.5 已定位：根因是**类型解析失败**（2026-10-24 18:1x，本会话）

最小复现 `.scratch/enum-list-repro/`（20008 图 id 1082130499，调用带 `f.getRayFilterTypeList([RayFilterType.Scene])`）。

- 打点 `src/compiler/ts_to_gs_transform/expr.ts` 的「client 枚举数组保持字面量」分支（`GSTS_DEBUG_ENUM_LITERAL=1`）：
  **无 tsconfig 时** `checker.typeToString(RayFilterType.Scene)` = **`any`**、`flags=1` ⇒ `getEnumTypeInfo().isEnum=false`
  ⇒ 落到 `makeFCall('assemblyList', [...])` ⇒ `assemblyList`（`src/definitions/client_nodes.ts:19866` 起）
  的 `matchTypes(['float','int','bool','config_id','entity','faction','guid','prefab_id','str','vec3'])` 不含 enum ⇒ 报错。
- **补一份带 `paths: {"genshin-ts/*": ["../../src/*"]}` 的 tsconfig.json 后同一条命令 exit 0**，
  打点变成 `RayFilterType|flags=524288|isEnum=true`，`probe.gia` 正常产出（id=1082130499）。
- 机制：`src/compiler/ts_to_gs_pipeline.ts` 的 `loadTsConfig(cfgDir)` **只读 `<cfgDir>/tsconfig.json`，不存在就用
  `{target,module}` 裸兜底（无 paths/baseUrl，也不向上查找）**。`examples/football` 与 `.scratch` 项目都没有
  tsconfig.json ⇒ 所有 `genshin-ts/*` 导入在类型层是 any ⇒ 依赖类型的 client 变换全部降级。
  工单第 2 节四种写法之所以"同样失败"，是因为它们都在同一个 any 环境里：字面量永远被包成 `assemblyList`。

⇒ 修复方向（待用户差分确认 wire 后再定稿）：
① `loadTsConfig` 兜底应注入 `paths` 指向 CLI 自身包根（`dist/src/*`），或在 tsconfig 缺 `paths` 时补 genshin-ts 映射；
② `assemblyList` 增加 enum 支持（`assemblyList([e1,e2], 'enum')` → `list('enum')`），让类型丢失时 wire 仍正确；
③ 若无 tsconfig 且无法注入，至少给出明确诊断（本工单 §4-B）。

## 3.6 修复与验证（2026-10-24 19:0x，本会话）

**根因修复（方向 ①）**：`src/compiler/ts_to_gs_pipeline.ts` 的 `loadTsConfig` 现在始终保证
`genshin-ts` / `genshin-ts/*` 能解析到**运行中这份 CLI 包**的类型：

- 新模块 `src/compiler/genshin_ts_paths.ts`：`resolveGenshinTsPackageRoot` 从 `__dirname` 向上找
  `name: "genshin-ts"` 的 package.json，生成 `paths`（`src/*` 优先，其次 `types/gsts/index.d.ts` 与 `dist/src/*`，
  全是绝对路径，不需要 baseUrl）。
- **没有 tsconfig.json**：兜底 options 从裸 `{target,module}` 升级为
  `{target, module, moduleResolution: Bundler, paths}`。
- **有 tsconfig 但没声明 `genshin-ts*` 别名**：`mergeGenshinTsPaths` 只补缺失的键，用户显式映射优先。

**诊断改进（方向 ③，§4-B 保底）**：`src/definitions/nodes.ts` 的 `parseValue` `enum_list` 分支不再落进
`无效的值类型: enum_list`，改为 `err_enumListElementMismatch`（zh/en 两语言）：

```
参数类型不匹配：这个参数期望枚举列表（enum_list，元素只能是枚举值，例如 [RayFilterType.Scene]；
也可用 f.getRayFilterTypeList(...) / f.getEntityTypeList(...) 构造），实际收到 float_list
```

**验收读数**（全部真实命令，退出码 0）：

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 正例（**无 tsconfig.json**） | `npx tsx tests/client_raycast_args_test.ts` | `CLIENT-RAYCAST-ARGS-RESULT pass=2 fail=0 verdict=PASS`；IR `args[5]`/`args[6]` 为 conn（非空）、`.gia` 产出 |
| 负例 `[123]` | 同上 | 非零退出，文案含 `enum_list` + `枚举列表`，**不含** `Generic parameter not matched` |
| 客户端套件 | `npm run test:client-transform` | `rc=0`（含 `smoke-enum-match` 11 节点 IOC 全过） |
| 真实项目回归 | `examples/football` 无 tsconfig，`gsts.kit3.config.ts --noinject` | `rc=0`，17 个 `[ok]`，无 error |

新增回归：`tests/client_raycast_args_test.ts` + `package.json` 的 `test:client-raycast`。

**编辑器 wire 层（已闭合 2026-10-24）**：我们生成的形态与编辑器**同构**——同一对构造节点
`getEntityTypeList` gid 200050 / `getRayFilterTypeList` gid 200110（cid 均 1031）、pin0 数量 + pin1..10 枚举槽；
两个 enum_list 参数**只能靠构造节点连线提供**（参数面板不能直接勾值），连线形态
`{id: <构造节点>, kind: 4, index: 0}`，且**被连线的参数引脚仍保留空 `ArrayBase` 字面量**（字面量与连线共存）。
枚举数值映射**已确认无偏差**：用户选的「光标受击盒」=2606，「场景」=2602，「物件」=1402，与三方表逐条一致。
规则已落 `docs/game-engine-knowledge/node-graphs.md`「enum_list 参数的合法形态」节。

**注入层（结构证据，2026-10-24）**：往地图 1073741838 新建 placeholder 图 `1082130434`（20008 造物技能）后
单文件注入 `probe.gia` → 图名 `_GSTS_enumListProbe`、9 节点；回读真实 `.gil`：两构造节点 数量=1、槽=1402/2602，
射线节点 pin5/pin6 = `ArrayBase` + `connects→(5,4,0)/(6,4,0)`（与编辑器样本逐字段同形）；Temp 与 Save_Level 同步
同 md5 `c080e9ce…`，`check-gil-composite-refs --incoming` 0 悬空。用户重载地图后确认「没问题」（编辑器接受）。

## 4. 期望行为（二选一，任一可验收）

- **A（首选）**：给 `enum_list` 参数一条可用构造路径。建议两个方向：
  - a1. `getRayFilterTypeList` / `getEntityTypeList` 产出**被节点参数接受的 list 形态**（例如 `new list('enum')` 并 markPin 到正确的 concrete type），
  - a2. 或允许直接传 `RayFilterType[]` 字面量（wrapper 内自行拼装），`parseValue` 支持 `enumeration[]`。
- **B（保底）**：若确实不支持，在**可用性阶段**就报明确错误（`CLIENT_NODE_UNAVAILABLE` 风格 + 哪个参数），
  而不是在 IR 泛型匹配处报 `Generic parameter not matched`。

## 5. 验收（两条都要）

1. **正例**：最小 20008 图调用 `getRayDetectionResult`，两个筛选参数都给非空列表 → `--noinject` 编译 exit 0，
   且 IR 里该节点 7 个输入齐全、两个 `enum_list` 输入有具体元素（`jq` 断言 `args[5]`/`args[6]` 非空）。
2. **负例**：故意传非法值（如 `[123]`）→ 报错文案必须指出**哪个参数/期望类型**，不得是裸泛型不匹配。
3. 回归文件建议：`tests/client_raycast_args_test.ts`（正例编译 + 负例文案），并在 `package.json` 里挂 `test:*`。

## 6. 参考

- 节点元数据：`resources/client_node_metadata.json`（`get_ray_detection_result`，五条 graphType/subType 变体）
- 编辑器样例：`造物技能节点图\获取射线检测结果_连线.gia`（说明 20008 里确实能用）
- 受影响的实际需求：`examples/football/R3-FEASIBILITY.md`（拦截/传球可行性/门将/地面判定都计划用射线）
- 探针现状：E1/E3 探针**已回滚**，地图恢复到已知可用态；登记侧 `docs/longtask/05-open.md` O-2026-10-24-10
