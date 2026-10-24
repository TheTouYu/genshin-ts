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
