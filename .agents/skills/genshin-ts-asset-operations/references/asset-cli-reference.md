# assets:* 资源操作 CLI 速查与已闭合编码

> 状态：当前实现 + 真实 GIL 回读；命令签名以 `src/cli/` 源码与 `gsts assets:*` 输出为准。
> 适用范围：关卡变量 / 实体变量 / 初始变量、节点图挂载、屏幕 UI 控件、信号。

## 1. 变量命令

### assets:level-variables（关卡变量，root5 关卡实体 f7[11].11）

```text
gsts assets:level-variables list   [--entity <id>] [--gil <map>] [--format json]
gsts assets:level-variables create --name <name> --type <type> [--value <v>] [--entity <id>]
gsts assets:level-variables update --name <current> [--value <v>] [--new-name <n>] [--entity <id>]
```

- 默认 `--entity 1094713345`（关卡实体）。`--value` 按变量现有类型解析；dict 语法见 §4。
- `--write` 备份并写回；`--output` 只新建不覆盖。

### assets:custom-variables（实体变量 / 初始变量）

```text
# 任意场景实体（root5.1[entity].7.11）
gsts assets:custom-variables --entity <id> --vars "name:type=value;name2:type=value" --gil <map> --write
gsts assets:custom-variables --entity <id> --list --gil <map> --format json

# 配置路径（CustomPrefab / 玩家 / 角色初始变量，来自 gsts.config.ts 的 assets.customVariables）
gsts assets:custom-variables --gil <map> --write
```

- `--vars` 是 upsert：同名同类型更新、缺失追加；`--entity` 与 `--vars`/`--list` 必须配对使用。
- `--vars` 显式类型 `name:type=value`；省略类型时按值推断（`[..]` → 列表，数字/布尔/字符串）。
- dict 值类型支持：str / int / float / str_list / int_list / bool_list / float_list / vec3_list。
- 配置路径支持 `operation.target`（prefab 等）与 `syncInstances`（把缺失声明同步到明确引用模板的实例容器；玩家模板通常需要“顶层定义 + 实例容器同步”才在编辑器可见）。
- 全 21 种类型：entity / guid / int / bool / float / str / vec3 / faction / config_id / prefab_id 及对应 10 种列表 + dict。

## 2. 节点图挂载命令

### assets:node-graphs（建空图占位）

```text
gsts assets:node-graphs create --gil <map> --name <name> [--output <candidate> | --write]
```

- 图 ID 自动分配（空图从 1073741825 起）；用于“目标 NodeGraph not found”前的占位。
- 节点图**内部**读-改-写走 `assets:node-graphs read|patch`，属 `gil-node-graph-editing` 技能。

### assets:mounts（挂载 / 卸下 / 查看）

```text
gsts assets:mounts attach <target-id> --graph <gid> [--entity|--def] --gil <map> --write
gsts assets:mounts detach <target-id> --graph <gid> [--entity|--def] --gil <map> --write
gsts assets:mounts list [<target-id>] [--graph <gid>] --gil <map>
```

- 默认目标是场景实体（root5）；`--def` 挂到元件定义（root4 + root8 实例）。
- attach 幂等、按顺序追加；detach 移除，最后一条卸完保留空 `08036a00` 槽。
- `list` 不带 target 打印全量（每个图/定义/实体及其挂载、未挂载图）；`list --graph <gid>` 反查谁挂这张图。

## 3. 屏幕 UI 控件命令

```text
gsts assets:ui list [--gil <map>] [--format json]
gsts assets:ui clone <source-id> --id <new-id> [--name <n>] [--donor-gil <file>] [--gil <map>] --write
gsts assets:ui create --type textbox|interactive-button|custom-button --id <new-id> [--name <n>] [--content <text>] [--position <x,y>] [--size <w,h>] [--gil <map>] --write
gsts assets:ui update <control-id> [--name <n>] [--content <text>] [--position <x,y>] [--size <w,h>] [--gil <map>] --write
gsts assets:ui template list [--gil <map>] [--format json]
gsts assets:ui template clone <source-id> --id <new-id> [--name <n>]
```

- root9 屏幕空间控件；position 是屏幕中心偏移、size 是宽高。
- 控件运行时显示/隐藏/禁用、按钮事件进角色图等属节点图/运行时逻辑，不是静态资产写回。

## 4. 信号命令

```text
gsts assets:signals inspect [--gil <map>]
gsts assets:signals register --name <n> --param <name:type> [--template-gil <donor>] [--template-signal <name>] [--send-id <id>] [--monitor-id <id>] [--server-id <id>] [--gil <map> | --map-id <id>] [--write]
gsts assets:signals update --target-signal <name> [--name <new>] [--param ...] ...
gsts assets:signals repair --target-signal <name> --template-gil <verified-donor> --template-signal <name>
```

- 参数类型限 18 种（str/int/float/bool/vec3/entity/guid/prefab_id/config_id 及对应列表，不含 faction）。
- 省略 donor 用内置参数布局；重复的非 str 类型必须提供 donor（fail-closed）。
- 直接写 GIL 时先 `register` 再注入 GIA；注入后 `inspect` 确认注册定义逐项不变。

## 5. dict 语法与 marker

`--vars` / `--value` 的 dict 文本：

```text
k1=abc&k2=x                  # str 值
k1=3&k2=7                    # int 值
k1=[a,b]&k2=[x,y,z]          # str_list
k1=[true,false]              # bool_list
k1=[1.5,2.5]                 # float_list
k1=[1,2,3]|4,5,6             # vec3_list（| 分隔多个三元组）
```

**marker 公式**：`marker = keyBase + valueBase`；keyBase：int=40、str=60；valueBase：标量=类型码，列表=第三方 concrete_map M3 下标。

| keyType | valueType | valueBase | marker |
| --- | --- | --- | --- |
| str(6) | str(6) | 6 | 66 |
| str(6) | int(3) | 3 | 63 |
| str(6) | float(5) | 5 | 65 |
| str(6) | str_list(11) | 16 | 76 |
| str(6) | bool_list(9) | 14 | 74 |
| str(6) | float_list(10) | 15 | 75 |
| str(6) | vec3_list(15) | 18 | 78 |
| int(3) | int(3) | 3 | 43 |
| int(3) | vec3_list(15) | 18 | 58 |

- 新建 dict 的 f37 = parallel `f501`(keys) + `f502`(values) + `f503`(keyType) + `f504`(valueType)，**无 Map25 层**。
- ⚠️ **int key 目前无法经 CLI `--vars` 表达**：`assets_custom_variables.ts#parseDictValue` 恒把 key 解析为 `keyType:'str'`。需要 int key 时按未覆盖项说明并跳过，不要硬造。

## 6. 变量类型码（默认值字段 = 类型码 + 10）

| 类型码 | 类型 | 默认值字段 |
| --- | --- | --- |
| 3 | int | f13（varint；0 为空 field） |
| 4 | bool | f14（false 为空 field） |
| 5 | float | f15（fixed32） |
| 6 | str | f16（UTF-8） |
| 12 | vec3 | f22（f1/f2/f3 fixed32，可稀疏） |
| 1/2/17/20/21 | entity/guid/faction/config_id/prefab_id | f13（与 int 同构） |
| 7..24 | 各列表类型 | f<type+10>（原始标量列表 packed：`{field1(len), 值=元素原始字节拼接}`；entity 元素为完整 `{field1(varint)}`；str/vec3 保持重复） |
| 27 | dict | f37（并行 f501/f502 + f503/f504） |

## 7. 已知坑（先看再动手）

- **关卡实体禁止手动 import**：`assets:entities import` 添加关卡实体（1094713345，defId=10003004）→ 游戏启动“地图异常”（已实证两次作废）。挂载/变量目标一律用普通场景实体。
- **`assets:entities import` 的 definitionId 必须在目标 root4 存在**：缺失会被 CLI 误判为官方 res 直引（relation 带 `{f2:1}`）→ 编辑器加载时实体被丢弃。自定义定义实体 relation 应为 `{definitionId}` 无 `f2:1`。
- **新元件/实体 ID ≥1077936129**（0x40400000 区间），0x4000xxxx 区间的元件被游戏/编辑器整体丢弃；ID 分配前 root4/5/6 双查。
- **新建实体 `id` 可省略**：`assets:entities import` 会自动分配下一个空闲系统 GUID（≥1077936129）；显式 `id` 只用于更新已有实体。
- **gadget 联动**：`assets:gadgets search|get` 返回的 `list_id` 是元件 ID，可直接作 `assets:prefabs create --base` 或 `assets:entities import` 的 `definitionId`；`assets:gadgets create-entity --id <list_id> --gil <map> [--output|--write]` 会按该元件 ID 自动建实体（GUID 自动分配）。
- **玩家初始变量要两处同步**：仅写顶层玩家资源定义，编辑器可能不可见；需把缺失声明同步到明确引用模板的实例容器（`syncInstances` 或 `sync*` API）。
- **注入前目标图必须存在**：`target NodeGraph not found` → 先 `assets:node-graphs create` 空图占位再注入。
- **写回后变更消失**：先核对当前 hash 是否等于写回后 hash；相等则请用户重新加载编辑器再保存，不要重做写回。
- **CLI 成功 ≠ 编辑器可见 ≠ 游戏行为**：写回、回读、编辑器显示、游戏运行时行为是四层独立证据。

## 8. Authority 与进一步阅读

- `docs/game-engine-knowledge/variables.md` — 变量作用域、全类型编码、dict marker 实测表。
- `docs/game-engine-knowledge/graph-mounting.md` — 挂载生命周期、type3 槽、关卡实体红线。
- `docs/game-engine-knowledge/gia-generation-chain.md` — 空图占位、GIA 注入链路、坑位清单。
- `docs/game-engine-knowledge/ui-controls.md` — 屏幕空间 UI、按钮事件进角色。
- `docs/game-engine-knowledge/signals.md` — 信号注册/注入/修复与参数布局。
- `docs/architecture/gil-custom-variables.md` — 自定义变量读写 API 与玩家/角色/CustomPrefab 路径。
- `docs/architecture/gil-node-graph-edit.md` — 节点图内部读-改-写（配合 `gil-node-graph-editing`）。
- CLI 实现：`src/cli/assets_custom_variables.ts`、`assets_level_variables.ts`、`gil_graph_mounts.ts`、`assets_node_graphs.ts`、`assets_ui.ts`、`assets_signals.ts`。

### 实体/元件变量链路（2026-08-19 验证）
- `assets:entities import` 建实体（正确带变量容器 root5.1.7.11，含 f7[11]）→ `assets:custom-variables --entity <id> --vars` 写变量 → `--list` 回读，完整可用
- 注意：`assets:entities` 必须带 `import` 子命令，否则走 export
- 之前「实体写 dict 崩溃」= 旧 dict 编码 bug（marker/Map25），非实体创建；dict 修复后链路正常
- 实体继承元件变量（definitionId 指向元件，变量复制到实体），元件加变量/改值会同步到未主动改的实体（override 语义）
