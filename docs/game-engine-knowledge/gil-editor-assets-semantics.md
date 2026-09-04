# GIL 编辑器资产结构语义（UI/变量/镜头/计时器）

> 状态：部分已验证
> 来源：真实 GIL 相邻快照 + 用户编辑器说明（各节自带证据标签与样本）
> 拆分自：`gil-structure-semantics.md`（2026-09-04 按域拆分，内容原样迁移未改写）

## 最小默认屏幕 UI 控件组与文本框

`CONFIRMED`，但仅限当前锁定地图、编辑器版本和文本框 identity `1073741843`：编辑器不能
创建真正的空屏幕 UI 控件组；用户可执行的最小创建操作会自动生成“默认布局”和一个
“文本框”。连续执行两次该最小操作时，两轮 root occurrence 与 presence 都保持稳定，
root `9` 均新增一个同构的直接 field `502` record，并重写包含“默认布局”的既有 record。
新增文本框 identity 分别为 `1073741843/1073741844`。第二轮业务差分只落在 root `9`；
root `46` 仍是等长未知同步变化。

第一轮还伴随 root `10/21` 变化，但第二个同构样本没有复现，因此只保留为首次操作伴随
变化，不并入 root `9` 业务规则。第三方草案中的 `UIControlGroup` 只能解释为候选消息名，
不能作为正式 GIL schema 名称。

对 identity `1073741843` 连续修改后，独立 Validator 接受以下受限 raw-wire 映射：

| raw 路径（省略 `GIL.payload`） | wire | 当前限定语义 | presence/值证据 |
| --- | --- | --- | --- |
| `9.502.505.12.501` | length-delimited | 控件对象名称 | `文本框 → A`；identity 稳定 |
| `9.502.505.503.19.505.501` | length-delimited | 显示内容 | 缺失 → `B` → CRLF 长文本 → 缺失 |
| `9.502.505.503.13.12.501.502.504.501` | fixed32 | 水平中心位置 | X-only 样本中唯一几何分量变化 |
| `9.502.505.503.13.12.501.502.504.502` | fixed32 | 纵向中心位置 | 位置移动时变化，X-only 时不变 |
| `9.502.505.503.13.12.501.502.505.501` | fixed32 | 展示宽度 | 位置-only 样本中保持不变 |
| `9.502.505.503.13.12.501.502.505.502` | fixed32 | 展示高度 | 位置-only 样本中保持不变 |
| `9.502.505.503.19.502` | varint | 字号 | `20 → 30` 是目标记录唯一叶子变化 |
| `9.502.505.503.19.510` | varint | 文本颜色 | packed `0xAARRGGBB` |
| `9.502.505.503.19.511` | varint | 背景颜色 | packed `0xAARRGGBB` |

`CONFIRMED`：未设置显示内容时目标字段缺失，不是显式空 length-delimited。显示内容可保存
UTF-8 与 CRLF；从长文本清空后，目标 record raw bytes 精确恢复为首次设置显示内容前的
record。

`CONFIRMED`：文本颜色 `FFFFFF/100% → D51717/80%` 对应
`0xFFFFFFFF → 0xCCD51717`。背景颜色 `FFFFFF/0% → 1E1313/UI 22%` 对应
`0x00FFFFFF → 0x391E1313`，即 raw alpha 为 `57`。

`INSUFFICIENT`：UI 透明度百分比与 alpha byte 的通用量化/舍入规则。`57/255` 在界面显示
为 `22%`，不能据此写成 `round(255 × 22%)`。root `45` 在两轮颜色修改时同步变化，root
`46` 在多轮保存时等长变化；两者都没有稳定业务引用，继续保持未知。

本批真实相邻快照、机器总图和 11 个 `ACCEPT` Validator 由证据提交
`65a86e2a3f3118c92dd65028258d88d713dc10d3` 锁定。未执行 round-trip、临时重放、真实
写回、编辑器导入或游戏行为验证。

## 关卡变量：默认创建、名称、bool/int 类型与默认值

`CONFIRMED`，但只限当前锁定地图、编辑器版本、两个默认 bool 关卡变量和一个默认 integer
关卡变量。连续 9 个最小编辑器操作形成 10 个不可变快照；9 个独立 Validator 均
`ACCEPT`。各轮 root occurrence 均为 41，presence 稳定。第一轮改变 root `5/21/46`，
其余八轮只改变 root `5/46`。

稳定业务变化不新增 root `5.1` record，而是重写同一个既有 record，并在以下受限路径维护
变量 entries：

| raw 路径（省略 `GIL.payload`） | wire | 当前限定语义 |
| --- | --- | --- |
| `5.1[changed].7[0].11.1[*]` | length-delimited | 关卡变量 entries |
| `...1[*].2` | length-delimited | 显式 UTF-8 名称 |
| `...1[*].3` | varint | 类型关联 discriminator；当前 bool=`4`、integer=`3` |
| `...1[type=integer].4.13` | length-delimited | 当前 integer 默认值分支 |
| `...1[type=bool].4.14` | length-delimited | 当前 bool 默认值分支 |

`CONFIRMED`：连续创建两个默认 bool 变量时，每轮追加一个 39-byte 同构 field `1` entry；
除默认名称末尾 `1/2` 外，两条 entry 字节一致。随后创建默认 integer 变量时，已有两条 bool
entry 逐字节不变。bool 与 integer entry 的顶层字段形状一致；fields `3/4/6` 随用户所选
类型共同变化，field `5 = 1` 保持不变。这里的 `4/3` 只是在当前样本中与 bool/integer
关联，不能升级为正式 enum 或其他作用域的通用类型码。

`CONFIRMED`：当前 integer 变量中，值 `0` 对应显式存在的空 field `13`；值 `123456`
对应 `13.1 = explicit varint 123456`。当前 bool 变量中，`false` 对应显式存在的空 field
`14`；`true` 对应 `14.1 = explicit varint 1`。两组值恢复后，目标 entry 与所属 root
`5.1` record 均精确恢复为修改前 raw bytes；整个 GIL hash 不恢复，因为 root `46` 仍独立
等长变化。

`CONFIRMED`：名称 `新增变量2 → A → 新增变量2` 只重写显式 UTF-8 entry field `2`；
其他 entry 字段、其他变量 entry 与最终所属 root `5.1` record 均精确恢复。

`INSUFFICIENT`：root `5` 与嵌套消息的正式名称、完整 schema、其他变量作用域/类型、负整数
与范围、空名/重名规则及跨版本普适性。root `21` 只在首次创建变量时伴随变化，第二个同构
创建样本未复现；root `46` 在九轮均等长变化，两者都不并入稳定变量骨架。

本批真实相邻快照、机器总图和 9 个 `ACCEPT` Validator 由证据提交
`d7bd151f9b8e914ca4ad3a1873021983e08c4f0f` 锁定。未执行 round-trip、临时重放、真实
写回、编辑器导入或游戏行为验证。

## 变量全类型通用规则（2026-08-18 多样本 CONFIRMED）

> 来源：`~/.genshin-ts-evidence/toolchain-gaps/1073741894/`（`after-dict*.gil` 多样本，
> 2026-08-18 编辑器逐步创建，CLI 逐项解码 + round-trip 验证）。
> 状态：`CONFIRMED`（多样本互相印证），但仅限该锁定地图/编辑器版本；游戏内运行时行为
> 未验证。属 `d7bd151f...` 之后新增的独立证据批次。

前述 bool/int 限定观察的“`4/3` 不能升级为通用类型码”在此被推翻：编辑器连续创建
str_list/vec3/dict 等变量后，**类型码是正式 enum**，entry 顶层形状一致，默认值字段
严格等于 `类型码 + 10`。

| 类型码 | 类型 | 默认值字段 | 值编码（f<type+10> 内容） |
| --- | --- | --- | --- |
| 3 | int | f13 | `{f1: varint}`（0 为空 field） |
| 4 | bool | f14 | `{f1: varint 0/1}`（false 为空 field） |
| 5 | float | f15 | `{f1: fixed32}` |
| 6 | str | f16 | `{f1: UTF-8}` |
| 12 | vec3 | f22 | `{f1,f2,f3: fixed32}`（可稀疏） |
| 1/2/17/20/21 | entity/guid/faction/config_id/prefab_id | f13 | varint，与 int 同构 |
| 7/8/9/10/11/13/15/22/23/24 | 十种列表 | f<type+10> | 原始标量列表 packed（guid/int/bool/float/entity/faction/config_id/prefab_id→`{field1(len), 值=元素原始字节拼接}`；entity 元素为完整 `{field1(varint)}`）；str_list/vec3_list 保持重复 field1 len 包裹 |
| 27 | dict | f37 | parallel f501/f502 + f503/f504（新建无 Map25 层） |

entry 结构：`11.1[*]`（关卡实体 root5.1.7.11；元件 root4.1.8.11 同构）→ `f2` 名称、
`f3` 类型码、`f4` 默认值 `{f1=类型码, f2=类型包裹, f<type+10>=值}`、`f5=1`、`f6` 类型
包裹。**新建 dict 的 `f37` 不含 Map25 实体映射层**（与编辑器新增变量5-10 真实样本一致）；
Map25 层仅出现在编辑器多对历史样本（新增变量1 等），非新建必需，CLI 不再分配 Map25 场景
实体 ID。dict marker 按 `(keyType, valueType)` 枚举，实测表见
[`variables.md`](variables.md)（str/int key × 标量/列表）。

容器路径：元件定义 = `root4.1[prefabId].8.11`（field8）；场景实体 =
`root5.1[entity].7.11`（field7，type1 组件槽）。CLI：
`assets:level-variables --entity <id>` / `assets:custom-variables --entity <id> --vars`
/ `assets:custom-variables`（config，target prefab/player/character，declarations 含
dict）。新实体由 `assets:entities import` 创建时继承定义 f8→f7 的变量容器。

> 编码细节修正（对照真实样本）：str 列表元素是单层 `field1(len){字符串}`（非双层
> `{f1:字符串}`）；str dict 值 `f16` 需解包 `f16.f1`；原始标量列表使用 packed
> `{field1(len), 值=元素原始字节拼接}`（entity 元素为完整 `{field1(varint)}`）；
> dict marker 按 `(keyType,valueType)` 枚举、int key 用 f13 编码、新建 dict 无 Map25 层
> （2026-08-19 真实样本修正）。2026-08-19 用户游戏核验通过：基于修复后元件新建实体
> 完整继承原始列表与 dict 变量。

## 自定义镜头：创建、名称、物件镜头联合变化与视野检测

`CONFIRMED_BOUNDED`，但仅限当前锁定地图、编辑器版本和本批自定义镜头样本。连续创建两个
默认自定义镜头时，root `18.1[*]` records 按 `1→2→3` append-only 增加；既有 records
逐字节保持。当前 identity 候选为 `1073741825/26/27`，不能推广为通用 ID 分配器。

> 修正（component-investigation exp17，2026-08-05）：镜头 record **可删除**——删除
> “自定义镜头_1”后 root 18 从 208B 回到 83B（对应 record 整体消失），其余 root 全部
> 不动。“append-only”仅适用于创建序列，不适用于删除；删除不回退任何其他 root。
> 另确认（exp14/16）：物件镜头绑定在组件 type 13 槽 f23.f4（f1=镜头槽名、f2=镜头名、
> f502=镜头ID，双重引用 root 18）；移除绑定只清空槽配置，root 18 镜头定义保留。

受限路径如下：

| raw 路径（省略 `GIL.payload`） | 当前限定语义 | 状态 |
| --- | --- | --- |
| `18.1[*]` | 自定义镜头 records | `CONFIRMED_BOUNDED` |
| `18.1[*].1` | identity candidate | `CONFIRMED_BOUNDED` |
| `18.1[*].2.1` | 显式 UTF-8 名称 candidate | `CONFIRMED_BOUNDED` |
| `18.1[target].2.3` | UI “镜头视野检测”对应的 fixed32 candidate | `CONFIRMED_BOUNDED` |
| `18.1[target].2.{4,6,12,21,23,24,32,33}` | 切换为“物件镜头”时的联合变化 | `INSUFFICIENT` |

名称从 `自定义镜头_2→A→自定义镜头_2` 时，identity 保持且只重写名称字段。一次用户故意
加入前导 ASCII 空格的样本，raw Validator 正确裁为 `CONFLICT`；随后删除一个空格后，目标
record 精确恢复历史 raw bytes。这证明流程能发现“声明操作”和文件事实的偏离，不证明名称
边界规则。

在物件镜头类型下，用户修改“镜头视野检测”得到以下 bounded raw observations：

```text
显示 45    → fixed32 45.000030517578125 / 08003442
显示 60    → fixed32 60.0                 / 00007042
显示 33.83 → fixed32 33.82655715942383   / 654e0742
```

三轮均只改变目标 record 的 field `3`，其他 sibling fields、identity、名称和其他镜头保持。
因此当前地图/版本/物件镜头类型中，`18.1[target].2.3` 可作为“镜头视野检测”候选路径；UI
显示值到 raw float 的量化、范围边界、其他镜头类型/地图/版本仍为 `INSUFFICIENT`。切换
“物件镜头”本身同时改变 fields `4/6/12/21/23/24/32/33`，不能单独命名其中任何字段。
root `21/46` 继续隔离；root `46` 多轮等长变化不能命名。

本批 camera 实验、机器汇总和独立 Validator 由证据提交
`b553021b9c578e6b342ab79f8b72fcb3a501002f` 锁定。未执行 round-trip、临时重放、真实写回、
编辑器导入或游戏行为验证。

## 全局计时器：创建、名字、时长与正/负计时类型

`CONFIRMED_BOUNDED`，但仅限当前锁定地图、编辑器版本和本批单个默认全局计时器样本。
默认创建全局计时器时 root `12` 从空 length-delimited 变非空，唯一新增一条 `12.1`
record；编辑器同步在 root `6` 聚合索引追加一条记录（identity `65`，field2 为
`未分类页签` category），root `21` 一条 5B 记录增长到 8B（field10=24 保持），root `46`
等长变化。root `6/21` 只随创建轮变化，改名/改时长/改类型轮不再变化。

受限路径如下：

| raw 路径（省略 `GIL.payload`） | 当前限定语义 | 状态 |
| --- | --- | --- |
| `12.1[*]` | 全局计时器 records（root 12 默认创建时从空变非空） | `CONFIRMED_BOUNDED` |
| `12.1[*].1` | 显式 UTF-8 名字 | `CONFIRMED_BOUNDED` |
| `12.1[*].2` | fixed32 float 时长 | `CONFIRMED_BOUNDED` |
| `12.1[*].3` | presence 类型：显式 `1` = 负计时（默认）；missing = 正计时 | `CONFIRMED_BOUNDED` |
| `12.1[*].501` | varint `1`，始终存在 | `INSUFFICIENT` |

单属性相邻差分观察（每轮只改变所列字段，root `46` 仍每轮等长变化）：

```text
默认创建  → 12.1 record: f1=全局计时器1 f2=5.0 f3=1 f501=1；root 6 追加、root 21 增长
改名      → 全局计时器1 → A：只改 12.1.1
时长      → 5.0 → 10.0：只改 12.1.2（fixed32 0000a040 → 00002041，等长）
类型→正计时 → 12.1.3 整字段消失（missing）；编辑器隐藏时长输入，但 wire 时长值保留
类型→负计时 → 12.1.3 重新出现且 =1，record 逐字节恢复为切换前，完全可逆
```

用户界面观察“正计时不显示时长（可无限增加）”与 wire 上 `12.1.3` missing 一致，但 UI
隐藏不等于 wire 删除：时长字段在正计时下仍保留上次写入的值。

root `12` 正式消息名、`12.1.501` 语义、多计时器共存、启停/运行状态编码、UI 显示值到
raw float 的量化（本轮 5.0/10.0 均为精确值）和跨版本普适性仍为 `INSUFFICIENT`。本批
实验、机器汇总和独立 Validator 由证据提交 `08953d91fa71cdfdc995d72176bec1d2d930e3f7`
锁定。未执行 round-trip、临时重放、真实写回、编辑器导入或游戏行为验证。


