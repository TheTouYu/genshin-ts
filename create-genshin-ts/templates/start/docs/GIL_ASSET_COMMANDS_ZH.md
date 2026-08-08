# GIL 资产命令参考（gsts assets:*）

`assets:*` 系列命令把从**真实编辑器保存产物**逆向出的 GIL 写入规则封装成 CLI，
让代码可以直接创建/修改关卡资产，而不用在编辑器里手工操作。

重要边界（所有 `assets:*` 命令通用）：

- 它们直接修改 `.gil` 资产结构，**不是** GIA 节点图注入，也不是运行时
  `createPrefab`，更不代表任意编辑器资产都能由代码生成。
- 默认只预览，不改文件：`--write` = 备份到 `.gsts/backups/` 后写回真实地图；
  `--output <file>` = 生成候选文件（不覆盖已有文件）；`--gil <file.gil>` = 处理
  离线 GIL；`--map-id <id>` = 按项目配置定位地图（与 `--gil` 互斥）。
- 编辑器内存会忽略磁盘写入：写回后必须**重新加载地图**再保存，否则编辑器保存
  会把你注入的内容覆盖掉。
- 元件/实例/实体 ID 从同一计数器分配，撞 ID 会导致编辑器报“存档损坏”。
- root 46 等编辑器自维护字段不模拟；每次写回都重建文件头部，不手工拼接字节。

证据分级：每个命令背后都有**真实编辑器相邻快照**（编辑器保存前后逐字节差分）、
**自动回归测试**与**受限写回**；标注“用户编辑器/游戏核验”的规则另经用户在
编辑器或游戏内确认。完整权威知识见 genshin-ts 仓库
`docs/game-engine-knowledge/`（npm 包不携带 docs，可在线查看）：
<https://github.com/josStorer/genshin-ts/tree/main/docs/game-engine-knowledge>

## assets:node-graphs —— 创建空节点图容器

在目标地图里创建一个空 NodeGraph（root 10 双层包装记录 + root 6 目录条目），
供注入器作为目标占位。图 ID 自动分配 = 地图当前最大图 ID + 1（真实编辑器证据：
10+ 张地图样本，删除后不复用空洞）。

```bash
npm run assets:node-graphs -- create --name 我的图 --map-id <id>   # 预览
npm run assets:node-graphs -- create --name 我的图 --map-id <id> --write
```

## assets:node-graphs read —— 精准读取节点图现状

读取任意节点图/节点/引脚/连线/复合定义的当前 wire 状态，供人机协同
（先展示现状，再给出候选 diff）：

```bash
npm run assets:node-graphs -- read --gil <文件.gil>                        # 全部图 + 复合定义
npm run assets:node-graphs -- read --gil <文件.gil> --graph <id|名称>      # 图内节点/引脚/连线
npm run assets:node-graphs -- read --gil <文件.gil> --graph <id|名称> --node 24
npm run assets:node-graphs -- read --gil <文件.gil> --composite <id|名称>  # 复合接口（pinIndex/类型）
npm run assets:node-graphs -- read --gil <文件.gil> --graph 样本-01 --json  # 机器可读
```

## assets:node-graphs patch —— 节点图精准修改（读-改-写）

全部操作走记录级局部替换（只改目标 NodeGraph / CompositeDef 记录字节，
文件其余部分原样保留）。默认只预览；`--write` 先备份再写回真实地图。
操作按顺序依次应用：

```bash
# 节点位置
npm run assets:node-graphs -- patch --gil <文件.gil> --graph <id|名称> node 24 pos 1200 1500 --write

# InParam 固定值（类型：int flt str bool vec gid pfb cfg）
npm run assets:node-graphs -- patch --gil <文件.gil> --graph <id|名称> node 4 param 0 pfb:1234
npm run assets:node-graphs -- patch --gil <文件.gil> --graph <id|名称> node 7 param 1 str:你好

# 数据连线：InParam[shell] ← 源节点 OutParam[源shell]
npm run assets:node-graphs -- patch --gil <文件.gil> --graph <id|名称> node 24 link 1 12
npm run assets:node-graphs -- patch --gil <文件.gil> --graph <id|名称> node 24 unlink 1

# 控制流连线：OutFlow[shell] → 目标 InFlow[目标shell]
npm run assets:node-graphs -- patch --gil <文件.gil> --graph <id|名称> node 11 flow 1 24
npm run assets:node-graphs -- patch --gil <文件.gil> --graph <id|名称> node 11 flow-rm 1

# 复合定义（全局操作，不需要 --graph）
npm run assets:node-graphs -- patch --gil <文件.gil> composite 1610612744 rename 我的复合
npm run assets:node-graphs -- patch --gil <文件.gil> composite 1610612744 param input 1 rename 目标实体

# 复合接口：加/删/换输入
# add-input：把 impl 图内 InParam 提升为复合输入（def 参数流 + compositePin + 实例 pin；实例重编号除非已在最小空闲位）
npm run assets:node-graphs -- patch --gil <文件.gil> --graph <id|名称> composite 1610612744 add-input 2 控制表达式 int 3 0
# del-input：删除复合输入（def 参数流 + compositePin + 实例 pin；实例重编号）
npm run assets:node-graphs -- patch --gil <文件.gil> --graph <id|名称> composite 1610612744 del-input 2
# swap-input：交换两个复合输入（def 参数流 + compositePins + 实例 pins；实例重编号）
npm run assets:node-graphs -- patch --gil <文件.gil> --graph <id|名称> composite 1610612744 swap-input 0 1

# 把选中节点打包成新复合（需要 --graph）：
#   锚点节点原位变实例（坐标=选中中心），其余选中节点搬进新 impl 图（坐标相对化）；
#   控制流 OutFlow 自动提升为复合出口（按原出口号命名），数据输入留在内部；
#   nodeId = 0x6000000N 最小空闲；pinIndex = 全文件 max+1（编辑器用回收池，有删除史时可能不同）
npm run assets:node-graphs -- patch --gil <文件.gil> --graph <id|名称> composite create 我的复合 1 1 11
```

一条命令可串联多个操作。新建 pin 遵循已闭合的编辑器规则（pin 数组排序、
默认 index 省略、非默认 ShellIndex 显式、数据连线挂目标侧/控制流挂源侧）。
未闭合的编辑器规则（Variant 自动实例化、entity 固定值、打包复合的锚点选择、
范围外连线自动注册为复合输入、选中复合实例打包）一律 fail closed 报错，
不猜测编码。del/swap-input 的实例重编号 = 排除当前位取最小空闲；编辑器还会
跳过跨轮墓碑号，所以在编辑器里手动删过参数后，工具可能选到比编辑器更小的号。

## assets:entities —— 创建/导出/修改场景实体与装饰物

- `export`：把 root 5 场景实体导出为 JSON（盘点/备份）。
- `import`：从元件 definition 重建实体记录（`--entities <file>`），组件槽、
  装饰槽逐字节继承，transform 独立为场景放置位置；编辑器新建实体即此行为。
- `patch <entity-id>`：记录级局部替换（只改目标记录字节）：
  - `--color <#RRGGBB>`：实体/装饰物自定义颜色（f3 与 f5 同步写，编辑器保存的
    规范化规则，只写 f3 会在编辑器再保存时漂移）；
  - `--position/--rotation/--scale`：transform（稀疏编码，scale 三轴全写）；
  - `--attach-aux <aux-id>` / `--detach-aux <aux-id>`：装饰物挂接，**双向引用
    一次写完**（实体侧 f5{t=40}.f50.f501 列表 + aux 侧 f4{t=40}.f50.f502 归属）；
  - `--aux <aux-id>`：把颜色/transform 目标切到装饰物。

```bash
npm run assets:entities -- export --gil <file.gil> --format json
npm run assets:entities -- import --entities entities.json --map-id <id>        # 预览
npm run assets:entities -- patch 1077936180 --color #FF0000 --map-id <id> --write
npm run assets:entities -- patch 1077936180 --attach-aux 123 --map-id <id> --write
```

证据：create-entity-v5~v14 真实快照逐字节同构、v21 颜色 patch 与编辑器保存
逐字节一致、用户游戏核验（红色方块/魔方抬高）。

## assets:mounts —— 节点图挂载（type 3 槽）

把生效节点图挂到元件定义或场景实体上（编辑器“属性 → 挂载节点图”的 wire 等价）：

- `attach <target-id> --graph <gid>` / `detach <target-id> --graph <gid>`；
- `--def` = 元件定义（双写 root 4 + root 8 全部引用实例）；`--entity` = 场景实体
  （只写 root 5，默认）；幂等；图必须存在于 root 10（存在性校验）。
- `list`（不带 target-id）= **全量盘点**：所有节点图（GID+名称）、所有元件定义、
  所有场景实体及其挂载图、未被挂载的图——新项目先跑它确认地图现状；
  `list --graph <gid>` = 反向查询该图挂在哪些目标上；`list <target-id>` = 单目标。

```bash
npm run assets:mounts -- list --map-id <id>                    # 盘点全图
npm run assets:mounts -- attach 1077936180 --graph 1073741828 --entity --map-id <id>
npm run assets:mounts -- attach 1077936183 --graph 1073741829 --def --map-id <id> --write
```

挂载形态（真实快照）：槽列表 `{1:3}` 槽的 f13.f1 每条 =
`{1:{1:1, 2:图GID, 501:20000}}`（两层 f1 包装）；多图按挂载顺序追加；
解除最后一个图 → 空槽 `08036a00`；图 GID 用完整值（如 1073741828），不是短号。
证据：mount-case1/2/3/4 真实相邻快照逐字节一致 + 用户游戏核验。

## assets:signals —— 信号注册与检查

- `inspect`：读地图信号注册表（root 10 信号索引）。
- `register`：注册新信号（信号名 + 参数列表 + 发送/监听/身份节点 ID 自动分配）；
  `--param <name:type>` 可重复（≤9 个）；`--template-gil/--template-signal` 可从
  已有信号克隆参数布局。
- `repair`：修复畸形信号注册；`update`：原地更新已有信号的参数条目。

```bash
npm run assets:signals -- inspect --gil <file.gil>
npm run assets:signals -- register --name 我的信号 --param hp:int --param pos:vec3 --map-id <id>
npm run assets:signals -- register --name 我的信号 --map-id <id> --write
```

证据：真实相邻快照 + 用户编辑器/游戏验证（发送固定值、监听骨架、参数消费、
跨地图导入/注入均已验证）。

## assets:static-assemblies / assets:custom-variables

- `assets:static-assemblies`：基于目标地图已有模板闭包生成静态拼装自定义元件
  （见 README 的 `assets.staticAssemblies` 配置说明）。
- `assets:custom-variables`：按配置预览/写回关卡变量（见 README）。

两者用法与边界详见 README `## Scripts` 段落。
