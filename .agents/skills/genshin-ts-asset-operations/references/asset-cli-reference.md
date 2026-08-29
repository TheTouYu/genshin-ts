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

## 1.5 元件/实体资源列出与静态/动态元件

```text
# 列出/解析用户地图资源
gsts assets:resources list [--gil <map>] [--format json]

# 创建动态/自定义元件（root4 定义）
gsts assets:prefabs create --base <官方ID> --id <newId> [--name <n>] [--gil <map>] [--write|--output]

# 创建静态元件（root8 实例 + root6 type400 登记）
gsts assets:prefabs create --static --base <官方ID> --id <newId> [--name <n>] [--gil <map>] [--write|--output]

# 动态 ↔ 静态切换已有元件（定义/实例/引用实体联动 + 名字槽标记；root46 fail-closed 不写）
gsts assets:prefabs convert --id <prefabId> --static|--dynamic [--gil <map>] [--write|--output]

# 挂装饰物（root 27 aux）：实体/定义/页面模型宿主；定义宿主 f501 挂 def aux，实体/模型挂 inst aux
gsts assets:aux attach --host <entityId|prefabId> --resource <decoResourceId> [--name <n>] [--gil <map>] [--write|--output]
```

- **装饰物（2026-08-20 实证）**：root27 = def-side（f1 字段，f3=1）+ inst-side（f2 字段，f12 回链 def）。宿主 f5/f6 槽40.f50.f501 packed 引用：**定义挂 def aux、模型/实体挂 inst aux**；aux f4 槽40.f50.f502 = 宿主 ID（关键引用，勿漏）。静态装饰物只有 inst 且 f12 空（资源性质差异）。

- `assets:resources list` 的 `prefabs` = root4 自定义定义（`custom-definition`）+ root8 官方/静态实例（`official-instance`）；`entities` = root5 摆放实体。切换静态的元件带 `static=true` 标记（判据 = 定义 f8 / 实例 f7 组件槽数为 0；纯静态类型保留组件槽不标记）。
- **静态 vs 动态（2026-08-20 实证）**：静态资源只支持基础 缩放/位置/旋转，**不支持组件/变量/高级功能**；动态资源可转静态。切换静态 = 删组件槽（定义 f8/实例 f7/引用实体 f7）+ 名字槽 f11 加 `{f2:1}`；切回动态 = 恢复 6 个官方默认组件槽 + 删名字槽标记。root6 登记 type 400（场景实体 type 200）。**静态资源实体不要设变量/组件。**
- ⚠️ `assets:gadgets` 的 `list_id` **不是** GIL 元件 ID（如 `1000218 → 20001219`、`1000026 → 20001026`），直接当 `definitionId` 写实体会导致实体不显示/存档损坏；需用映射表（样本见 `~/genshin-ts-evidence/toolchain-gaps/1073741896/raw/gadget-mapping.md`）。

## 2. 节点图挂载命令

### assets:node-graphs（建空图占位 / 删除图）

```text
gsts assets:node-graphs create --gil <map> --name <name> [--output <candidate> | --write]
gsts assets:node-graphs delete --gil <map> --graph <id|name> [--output <candidate> | --write]
```

- 图 ID 自动分配（空图从 1073741825 起）；用于“目标 NodeGraph not found”前的占位。
- 删除 wire（2026-08-29 编辑器删除差分实证）：root10 图记录 + folder 条目（field6 记录内
  f3 内部 f5={1:typeValue,2:图ID}）一起删；**只删图记录漏 folder 条目 → 存档损坏**。
  delete 默认 dry-run；--write 自动备份 .gsts/backups/ + Temp 同步。
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
gsts assets:ui create --type textbox|interactive-button|custom-button|image|floating-page --id <new-id> [--name <n>] [--content <text>] [--position <x,y>] [--size <w,h>] [--gil <map>] --write
gsts assets:ui create --type image --id <new-id> --asset <素材索引ID> [--layout <布局ID>] [--name <n>] [--position <x,y>] [--size <w,h>] [--gil <map>] --write
gsts assets:ui update <control-id> [--name <n>] [--content <text>] [--position <x,y>] [--size <w,h>] [--asset <素材ID>] [--color <#RRGGBB>] [--gil <map>] --write
gsts assets:ui delete <control-id> [--gil <map>] --write
gsts assets:ui template list [--gil <map>] [--format json]
gsts assets:ui template clone <source-id> --id <new-id> [--name <n>]
gsts assets:ui template create --id <模板ID> --asset <素材索引ID> [--name <n>] [--position <x,y>] [--size <w,h>] [--gil <map>] --write
gsts assets:ui variables list [--page <悬浮交互页ID>] [--gil <map>] [--format json]
gsts assets:ui states --id <自定义按钮|页签|关闭按钮ID> [--gil <map>] [--format json]
```

### UI 三层概念（2026-08-23 差分闭合）

root9 502 记录按 f502 子记录的 type 码分三层：

| 层 | type 码 | 说明 |
| --- | --- | --- |
| 素材 | type55（容器）+ type5+6（组） | 素材库：容器+分类副本+组（图元），容器 ID = 素材索引 ID |
| 控件模板 | type4（模板）+ type3（实例） | 模板 f14=实例列表 back-ref；实例 f13→模板，f504=控件组容器 1840 |
| 布局控件 | type5 单条（官方预制）或 type3（模板实例） | f504=布局 ID，玩家运行时看到 |

- `list` 按三层分类输出（布局/素材/素材组/控件模板/控件实例/官方预制控件）。
- `delete` 按种类级联删除：素材删容器+分类副本+全部组+num501+1841 分类树；模板删模板+所有实例；
  官方预制/实例删记录+从父容器 f503 移除+实例从模板 f14 移除。
- `update --asset` 改素材引用（f6.f4）；目标是模板时同步改所有实例。
- `update --color <#RRGGBB>` 改素材容器（含分类副本）所有图元组颜色 f505.f503.f31.f4（ARGB）。
- `template create` 创建控件模板（type4 + type3 两条，实例挂控件组容器 1840，与布局解耦）。

#### 悬浮交互页创建（2026-08-27 实读，含用户修复版规范）

- `create --type floating-page --id <模板ID>` 创建悬浮交互页：模板 + 实例 + 实例侧固有容器组 + 关闭按钮（4 条记录）。
  模板 t42 → 地图级共享模板侧固有容器组（首个创建时一并建，后续复用）；实例 t42 → 各自实例侧组。
- ID 派生：实例=模板-3、组=模板-2、关闭按钮=模板-1；6 个派生 ID 冲突校验（真实地图重复 ID 会损坏记录）。
- ⚠️ 编辑器保存时会自动补全控件组（删外部实例/组/关，按自己规范重建 + 模板 t4 追加实例 ID）——这是预期行为，不是 bug。
- ⚠️ 关闭按钮 t52.f44 含 max-uint64 varint（`ff×9 01`），禁止 parse→emit 往返（JS 精度丢失损坏）——必须原始字节级重映射。

#### 列出命令（List 优先原则，2026-08-27 用户定义）

- `variables list`：形式变量（t41.f503.f34），输出名字/类型（整数/浮点/字符串/动态文本域）/序号。`--page` 指定悬浮交互页。
- `states --id <控件>`：状态块（按钮 t50 或页签 t58）+ 素材组引用。状态名类型化：按钮第 4 块=**禁用**，页签第 4 块=**选中**。
  - t50 双布局：打包式（f43.f503）+ 展开式（f43 顶层）；t58 页签状态在 f503.f48.f501。
  - 块结构：`{f501: {f2:1, f3:8, f4: 素材组ID}, f502: 空, f503: 尺寸对, f504: 缩放对, f505: 空}`。

- root9 屏幕空间控件；position 是屏幕中心偏移、size 是宽高。
- ⚠️ `--position <x,y>` 是**编辑器绝对坐标，原点在左下角**（1600×900 设计分辨率，x 向右 y 向上），
  wire 里存的是屏幕中心相对偏移 `(x-800, y-450)`。因此 (300,200)=左下、(1300,700)=右上、(800,450)=中心，
  **不要按左上角原点理解**（2026-08-23 游戏核验实测）。
- 控件运行时显示/隐藏/禁用、按钮事件进角色图等属节点图/运行时逻辑，不是静态资产写回。
- `--type image` 创建官方预制「图片控件」引用素材：`--asset` 是素材索引 ID（= 素材库容器 ID，
  0x40000000+ 段，见 `assets:library-inject` 返回的 containerId）；`--layout` 默认 1073741825 默认布局。
  单条记录（f502[type5]），图片源引用素材路径 f505[f502=38].f503.f31.f6.f4 = 素材 ID。
- **未覆盖**：素材图元的位置/尺寸/形状编辑（已覆盖颜色）；模板 name/position/size 编辑只改单条记录不自动同步实例。

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
| int(3) | str_list(11) | 16 | 56 |
| int(3) | vec3_list(15) | 18 | 58 |

- 新建 dict 的 f37 = parallel `f501`(keys) + `f502`(values) + `f503`(keyType) + `f504`(valueType)，**无 Map25 层**。
- **int key 已支持（2026-08-29 证据复核）**：`--vars`/config 声明里纯数字键（`/^-?\d+$/`）自动解析为
  int key（f13 编码，marker keyBase=int=40）；`name:dict=1=[A,B]&2=[C]` 即 int→str_list（marker 56）。
  marker (3,11)=56 已由编辑器样本 after-dict-keytypes「新增变量11」字节级确认（2026-08-18）。
- **一个字典 = 一种键类型 + 一种值类型（fail closed，2026-08-29）**：混合键/混合值类型会被
  `assertUniformDictPairs` 拒绝，不再静默生成 f503/f504 与个别 pair 不一致的畸形 wire
  （回归：`tests/gil_level_variables_full.ts` 第 5/7 节）。

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
