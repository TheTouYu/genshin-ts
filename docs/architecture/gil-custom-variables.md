# GIL 初始自定义变量：读取与变量注入

> 状态：部分验证
> 来源：当前代码实现 + 真实 GIL 观察 + 自动回读 + 用户编辑器/游戏反馈
> 最近校验：2026-07-23
> 适用范围：gsts 当前 `str` / `str_list` 初始变量读取与增量写回；真实编辑器/游戏结论仅覆盖
> 玩家 `110170759` 的地图 `1073741847.gil`、该地图的玩家模板结构和 `变量专用` CustomPrefab

本文记录 GIL 中玩家模板和 CustomPrefab 的初始自定义变量资产，以及与 NodeGraph 注入不同的“变量注入”流程。

## 1. 术语与安全边界

| 概念 | 变量注入 / 资产写回 | 节点图注入 |
| --- | --- | --- |
| 输入 | 变量声明与目标资产 | `.gia` |
| 修改对象 | `.gil` 中的初始自定义变量资产字段 | `.gil` 中的 NodeGraph |
| 是否生成 `.gia` | 否 | 是 |
| 是否需要 `nodeGraphId` | 否 | 是 |
| 是否需要图挂载 | 否 | 是 |

变量注入会直接覆盖真实游戏目录下的 `.gil`，因此每次都必须：

1. 明确玩家、地图、资产 ID、变量名、类型与初始值；
2. 在写入前保留可定位的备份；
3. 只修改已确认的变量容器，不重编码无关资产；
4. 写后重新解析；
5. 将“写后回读成功”和“用户编辑器/游戏核验”分开报告。

当前实现不会自动接入普通编译、资源抽取、dev watcher 或 NodeGraph 注入。调用方必须显式调用写回 API。

## 2. 当前实现入口

源文件：`src/cli/gil_custom_variables.ts`

包入口：`src/index.ts`

```ts
readCustomPrefabInitialCustomVariables({ gilPath, prefabId })
readPlayerInitialCustomVariables({ gilPath, playerPrefabId })
applyCustomPrefabInitialCustomVariableUpdates({ gilPath, prefabId, updates })
applyCustomPrefabInitialCustomVariableDeclarations({ gilPath, prefabId, declarations })
syncPlayerCustomVariableDeclarations({ gilPath, playerPrefabId, declarations })
```

### 2.1 API 语义

- `read*`：只读返回变量名、类型、类型码和原始初始值 wire bytes。
- `Updates`：只更新同名且同类型的现有变量；缺失变量或类型不匹配即失败。
- `Declarations`：对顶层 CustomPrefab 资源定义执行 upsert；同名同类型时更新，缺失时追加。
- `syncPlayerCustomVariableDeclarations`：只将**缺失**声明追加到明确引用 `playerPrefabId` 的玩家实例变量容器；它不推测玩家资产，也不修改其它实例。

当前可安全写入并经过回读/幂等自动验证的类型：

```text
str
str_list
```

读取层已识别更多类型码，但它们没有本轮写回与编辑器验证，不能据此开放写入。

## 3. 真实 GIL 容器观察

在受控样本中，单个变量定义包含：

```text
field 2: 原始变量名
field 3: 类型码
field 4: 类型包装与编辑器初始值
field 5: 当前观察为 1，语义未确认
field 6: 同类型空包装；当前不作为初始值来源
```

`field 4` 内部包含类型专属字段。例如：

```text
str       typeCode 6  -> field 16
str_list  typeCode 11 -> field 21
vec3      typeCode 12 -> field 22
```

这只是当前样本的真实观察；其它类型的编码、空值、实体引用和结构体不可由该表推断。

## 4. 玩家与 CustomPrefab 的不同路径

### 4.1 CustomPrefab

真实样本 `1073741847.gil` 的 `变量专用` CustomPrefab：

```text
prefabId: 1077936129
```

对顶层资源定义追加 `str` / `str_list` 后，用户确认编辑器/游戏可见新增变量和初始值。该路径可视为本轮的已验证 CustomPrefab 路径。

### 4.2 玩家模板

同一地图中，顶层资源定义：

```text
playerPrefabId: 1086324737
basePrefabId: 1000000
```

首次仅对该顶层定义追加玩家变量后，用户反馈编辑器不可见。扫描发现地图中还存在 1 个明确引用
`1086324737` 的玩家实例变量容器，路径族为：

```text
5.1.7.11
```

将新增玩家变量同步到该实例容器后，用户确认变量注入成功。因此，在当前已验证地图结构中：

```text
玩家变量写回 = 顶层玩家资源定义 + 明确关联的玩家实例容器同步
```

这个结论只适用于该地图。未来地图可能有零个、一个或多个玩家实例；实现必须扫描并明确报告命中数，不能硬编码路径数量或将 CustomPrefab 路径外推给玩家。

## 5. 已验证案例

用户确认通过的玩家实例新增：

```text
gsts_player_injected_label: str = 玩家变量注入-新增
gsts_player_injected_tags: str_list = [玩家, 变量注入, 新增]
```

同一轮中，`变量专用` CustomPrefab 的新增与修改也由用户确认可见且有值。

证据必须区分：

1. 当前代码实现：`gil_custom_variables.ts`；
2. 自动回读：写入后从同一 GIL 解析变量名、类型与 wire 值；
3. 用户编辑器/游戏确认：仅覆盖本节资产、地图、类型和写入样例；
4. 未验证项：其它地图、玩家结构、类型、运行时节点读写语义和编辑器再次保存后的保留行为。

## 6. 调试工具

| 工具 | 用途 |
| --- | --- |
| `tools/inspect-gil-custom-variables.ts` | 检查指定变量名的容器与祖先 wire 摘要。 |
| `tools/scan-gil-custom-variable-candidates.ts` | 批量枚举候选变量、类型码、初始值 wire 摘要和可识别的 CustomPrefab 所有者。 |

两个工具均为只读工具。使用真实样本前先记录文件路径、大小和 SHA-256；不得将工具输出等同于编辑器或游戏验证。

## 7. 后续工作

1. 为读取、更新、追加、玩家实例同步建立不依赖真实游戏目录的最小二进制 fixture 回归；
2. 用受控编辑器差分逐项验证 `bool`、`int`、`float`、`vec3`、引用值和其列表的写回；
3. 在至少一个不同地图/玩家模板结构上验证玩家实例发现规则；
4. 设计显式 CLI/config 的 dry-run、变更计划和备份报告面，禁止把资产写回隐式绑定到普通构建。
