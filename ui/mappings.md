# ui/ 规则→命令映射表（mappings）

> 配套：`ui/DESIGN.md`（命令面/验收）；知识权威：`.agents/skills/editor-incremental-gia-investigator/references/ui-controls.md`（节号见各条目）
> 约定：wire 路径用节内记号；「角色」= official(官方单条) | instance(布局/库实例) | template(模板定义) | group(素材组/容器) | member(组内成员)。
> 实现约束：编辑默认 surgical patch（未知字节保留）；克隆用统一内核（ID 重映射表 + 引用更新 + 索引登记）；ID 分配禁止 max+1 直推（须避让扫描 + 用户可指定区间）。

## 0. 通用属性（所有含 t12 载体/文本的控件）

| 属性 | 参数 | wire 语义 | 证据节 |
|---|---|---|---|
| 位置（中心绝对坐标） | `--position X,Y` | t12 每设备槽位置对 fixed32（无则插入 4×12B）；wire = C−(800,450)；中心语义；**编辑器坐标 y 向上（0=屏幕底/900=顶；视觉越靠上 y 越大，轮18 贴边公式同口径）** | 轮11/13/18/31/52 |
| 尺寸 | `--size W,H` | t12 每槽 W/H f32 对（常驻） | 轮7/31/52 |
| 贴边快捷 | `--position left-top --margin m` | 换算 C=(w/2+m, 900−h/2−m) 等四角/四边 | 轮18 |
| 名字 | `--name` | name 组件 UTF-8（注意：部分容器名字不在 comp15 路径，如固有/页面容器名在记录内其它结构——按控件表定位） | 轮48 |
| 文本 | `--text` | f19.f505.f501 UTF-8（富文本语法 `<color>`/`<b>`/`{1:ps.var}`/`{5:img_N}` 原文透传；无文本时编辑器=升序插入 f505{f501:text}——轮19→20 已字节级重放） | 轮6/20/任务栏；票06 v2 |
| 字号 | `--font-size` | f19.f502 varint（默认 20；编辑器上限 512；512=2B varint 0x8004 已采样 补充2-15） | 轮54/任务栏；补充2-14/15 |
| 对齐 | `--align left\|center\|right` | 文本对齐（文本框 t25 / 图文输入框 type45 共用 f19.f503）：**左=无字段（默认）/ 居中=1 / 右=2**；队列内容对齐=f68.f506 同构（左=无字段/居中=1/右=2）。右对齐已闭合 | 轮58-60；补充2-11/12/13/16/17 |
| 颜色 | `--color #RRGGBB` | f19.f510 varint ARGB（0xFFRRGGBB）；f511 第二色按体系联动与否各异。⚠️ 编辑器改字色会同步更新**全局颜色历史段（root field45）**（新色条目置顶 +10B）——规则单样本 open-item，CLI 暂只写 f19 | 轮6/9/20；票06 v2 登记 |
| 素材引用 | （按控件表） | t38 图片源三池：素材库 f6.f4 / 官方基础图形 f31.f2(100006 类) / 官方静态资源 f31.f2=101078 | 轮7/8/22 |

## 0.1 放置面（Surface）与 placement 规则（V2 领域模型；用户 2026-09-03 指点）

| kind | 合法放置面 | 证据 |
|---|---|---|
| 普通控件（button/textbox/input-box/message-queue/image…） | **三面通用：layout / 悬浮页容器面**（用户权威；按钮轮26/28 + 文本框/图片/图文输入框轮64） | 轮4/19/51/26/64；用户 2026-09-03 |
| floating-page | **library ✅（库管理页添加）；layout ❌（用户权威：悬浮页内部自带容器面，不进布局）** | 轮24；用户 2026-09-03 |
| tab（页签） | **仅悬浮页容器面（固有/页面容器）；layout ❌** | 轮29/34；用户 V2 |
| container（页面容器） | 仅属悬浮页（实体 t42 列表） | 轮33 |
| 悬浮页自动子件（固有容器/关闭按钮） | 创建时自动，不单独放置 | 轮24 |

`--on` 参数语义 = 放置面寻址（layout:名称 / library / 悬浮页:容器名）。create/clone 执行前先做 placement 校验。

## 1. 布局族（layout）

| 操作 | 命令 | wire / 语义 | 证据 |
|---|---|---|---|
| 列出布局与成员 | `list --tree` | layout f503 packed=成员；官方克隆/实例 parent=f504=布局 | 布局创建节 |
| 创建布局 | `create --type layout --name` | 克隆默认布局 14 官方预置全集（当前版本行为）；新 layout 入索引；名字自动去重 | 轮1+2 |
| 布局内添加官方控件 | `create --type <t> --on layout:<id>` | 官方单条记录 + layout f503 追加（成员位末尾）；tab 会被 placement 拒绝 | 轮4/19/51 |
| 删除布局 | （无样本） | 整树递归 + f503/索引清理（参照删除模板节模型，先差分轮） | 轮3/14 类推 |

## 2. 按钮族（判别：comps 含 t50/52/54；布局官方版无 t37/t62-64，悬浮页版有）

| 操作 | 命令 | wire / 语义 | 证据 |
|---|---|---|---|
| 创建（官方单条） | `create --type custom-button --on layout:<id>` | 官方 type5 单条 963B（全默认）；无素材组伴随 | 轮4 |
| 创建后直接配置常态文本 | `create --text ... --color ...` | member 树按需建：组+member 一步到位 | 轮8/16 |
| 保存为模板 | `template create <id>` | 官方单条（type5-only）：new template(type4 f14=backref) + 原记录升格 instance(+subtype+type3) + 布局成员位不变；**实例源（type3）：模板+实例重绑 f13+旧模板 f14 清实例+（有样式树时）模板侧整树克隆**，源树保留无删除 | 轮5/23/63；补充2-2/6/10 |
| 库保存模板→详情实例 | `template instantiate <tpl> --into library` | 新 instance 挂库容器 1840 + 容器 f503 追加 + 模板 f14 back-ref 追加 | 轮6 |
| subtype 槽序数 | （内部） | subtype6 槽 f12 内序数=**家族标识**：同家族模板/实例共享；官方首次模板化=文件可见最大+1；实例源再存=继承源家族（非 kind 常量——v1/v2/v3 实为按钮/输入框/队列的家族序数） | 补充2-2/6/10 解码 |
| 模板化命名 | （内部） | 队列官方存模板时若存在同名其它队列：实例+模板同取「原名_1」；实例源每次再存：实例+新模板同取「原名_1」（迭代后缀） | 补充2-2/6/10 |
| 实例化到布局 | `create-from-template <tpl> --layout <id>` | 同三步联动但容器=布局（样本=轮5 原地升格路径，新实例入布局样本=图片控件模板 08 月） | 08月/轮5 |
| 编辑实例（不广播） | `update --target <instance> ...` | 只变实例及其私有素材树（不同步对照） | 轮9/11/13 |
| 玩家直接拖 | （diff 检测，见 §7） | 布局实例 t12 原地改（等长）；模板/库实例零动 | 轮13 |
| 同步广播 | `sync --target <instance>` | 源实例 → 模板+全部实例：整树删除重建克隆（组树新 ID）+ t12 几何复制 + t50 引用更新；源不动 | 轮7/10/12/17 |
| 状态块读写 | `state --state normal\|hover\|press --scale <x>` | t50.f43.f503 块1/2/3 = 尺寸对 f32 + 缩放对 f32（缩放 X/Y 同值） | 轮7 |
| 切状态 tab 自动建空组 | （副作用观察） | 打开悬浮 tab → 空素材组+块引用（CLI 不需要模拟 UI 副作用，但 diff 报告需识别） | 轮9 确证 |
| 素材组操作 | `material add --member text\|image --state ...` | type55 组+官方内联 member（t25 文本框/t38 图片）；member f504=组；组 parent=None 入索引 | 轮8/15/16 |

## 3. 图文输入框（判别：type45）

| 操作 | 命令 | wire / 语义 | 证据 |
|---|---|---|---|
| 创建 | `create --type input-box --on layout:<id>` | 官方单条 622B 挂布局 | 轮19 |
| 文本/颜色 | `update --text/--color` | type45.f503.f19（文本框同款：f502 字号/f503 对齐/f505 文本/f510 颜色） | 轮20/59 |
| 富文本插图 | `update --text '{5:img_1}...'` + `--rich-image <资源ID>` | 文本插值 + f19.f62 数据块（f501 内层 f1=宿主/f3=资源 ID/f8=0/f9=1.0f/f10=1, f502=1.0f） | 轮21 |
| 换图 | `--rich-image <id>` | f62 内层 f3 单点 varint | 轮22 |
| 存模板 | `template create <id>` | 三合一（含自动库实例）——比按钮多"自动建库实例"步（触发差异待查，实现默认对齐三合一语义） | 轮23 |

## 4. 悬浮页族（实体判别：t44=330001；挂库容器 1840 官方单条）

> 新版链路：纯添加=3 条单条族（实体 2083+固有容器 2084+关闭按钮 2085）；同步=拆双份树（模板 2086+2087+2088）。
> 层级模型（用户权威）：悬浮页 → 容器列表(t42 引用) → 控件(容器成员；页签=普通控件) → 页面项(t47) → 容器/控件显隐配置。

| 操作 | 命令 | wire / 语义 | 证据 |
|---|---|---|---|
| 添加悬浮页 | `create --type floating-page --on library` | 3 条单条族 + 库容器 f503 追加 + 索引（布局内悬浮页=A7 待差分） | 轮24 |
| 同步生成模板 | `sync --target <实体>` | 拆双份：模板树克隆 + 实例侧补 subtype 槽（实体+14B 类）；t42/t44 两侧一致 | 轮25 |
| 详情添加元素 | `create --type button\|tab\|... --on <悬浮页>:<容器名\|id>` | 新记录挂**实例侧容器**（f503 追加）；未同步不动模板侧；tab 仅此面合法 | 轮26/29 |
| 按钮素材/状态 | 同 §2 素材命令（跨体系同构） | type55 组树/t50 块引用/member t25 | 轮28 |
| 新增页面容器 | `container add --page <实体>` | 顶层容器记录（comps 11/43）+ 实体 t42 引用列表追加 | 轮33 |
| 复制控件到容器 | `clone <源> --into <悬浮页容器>` | 基础记录副本（内容保留；不带 subtype 槽）+ 容器 f503 追加 | 轮34 |
| 悬浮页同步（增量补齐） | `sync --target <实体>` | 模板侧补齐：新增项=模板侧对应副本/树；实例侧新增对象补 subtype 槽；素材树=克隆新树换引用（旧树移索引留孤儿——**不物理清理**，重复同步膨胀可提示） | 轮27/32b/35/47/50 |
| 容器初始生效 | `container active --container <id> on\|off` | 容器名字后 b01f01 增删（f502=1；有=生效） | 轮48-50 |

### 4.1 页签/页面项（t47 浏览器式多页面）

| 操作 | 命令 | wire / 语义 | 证据 |
|---|---|---|---|
| 添加页签 | `create --type tab --on <悬浮页>:<容器>` | 页签记录（t15/23/12/46/47/48/49/58/37；kind 320001）挂容器；**不允许 layout 面** | 轮29 + 用户 V2 |
| 页面项改名/文本 | `tab page set --tab <id> --page <n> --name/--text` | t47 条目内 name/text UTF-8（含 group 编码区，walker 需支持或字节定位） | 轮30 |
| 添加页面 | `tab page add --tab <id> [--name]` | t47 条目内联追加（无新记录） | 轮30/43 |
| 默认选择 | `tab page default --tab <id> --page <n>` | t47 区 9B 哨兵重写（ff×9 01 → 紧凑编码）；**语义未全闭合→先读后写** | 轮36 |
| 返回服务器事件开关 | `tab page server-event --tab <id> --page <n> on\|off` | 条目名称后 f504=1（c0 1f 01）增删 ±3B | 轮37/38 |
| 容器状态设置 | `tab page container-state ...` | f502(w2) 块：entry 列表（每容器 {aa1f len a81f id [b01f01=隐藏]}）+ 尾部启用标记；关闭=删启用标记（entry 保留为配置记忆）；控件状态设置=f504(w2) 块同构（entry 引用容器内控件 ID，含页签自身） | 轮39-46 |
| 显隐配置读写 | `tab page show --tab <id> --page <n> --container <id> show\|hide` | entry 内 b01f01 增删 + 长度前缀联动 | 轮40-41/43 |
| 几何 | `update --target <tab> --position/--size` | 同 §0（详情画布同坐标系） | 轮31 |

### 4.2 事件/服务端 API 对照（whenFloatingInteractionPageIsTriggered）

- payload：floatingInteractionPageIndex / interactiveItemIndex / listIndex[] / selectedListItem[]（页签切换读取）
- 关节点：`list --page` 输出即 `listIndex` 依据；CLI 读回选中项需事件帧验证（行为层，票08）
- 证据：src/definitions/events-payload.ts L872-909；server_on_overloads.d.ts L384-389；官方教程 official-ui-tutorial L2129/2313

## 5. 消息队列（判别：comps 76/77/78/79；默认几何 150×150）

| 操作 | 命令 | wire / 语义 | 证据 |
|---|---|---|---|
| 创建 | `create --type message-queue --on layout:<id>` | 官方单条 859B 挂布局 | 轮51 |
| type76 显示配置 | `update --target <队列> --max-items N` | type76.f503.f68.f513 varint（默认 5） | 轮55 |
| 限时显示 | `queue timed-show on --seconds <s>` | f68.f511=1 开关 + f68.f512 fixed32 秒（默认 5.0） | 轮56 |
| 插入位置 | `queue insert head\|tail` | f68.f510=1 存在=尾（默认）；删除=头 | 轮57 |
| 内容对齐 | `update --align center` | f68.f506=1=居中（无=左） | 轮58 |
| type77 样式列表 | `queue style add --material text\|image [--font-size N --text S]` | type77 内追加样式项 + 私有 type55 组树（member t25/t38）；字号 f19.f502 | 轮53/54 |
| 消息项 | `queue message add [--name]` / `queue message style --message <n> --style <n>` | type79 条目内联追加（默认名 消息项_N）；条目内 f502=样式序号（引用 type77 顺序，非组 ID） | 轮61/62 |
| 存模板 | `template create <id>` | 三合一 + 每侧私有样式树克隆（模板/库实例/布局实例各一套）+ 旧树物理删除 + 内部引用重映射 | 轮63 |
| type78 | — | 37B 未解码；克隆随内容完整复制；编辑命令对含 type78 记录先标记 | 轮51-63 |

## 6. 删除与清理（统一内核）

| 场景 | 命令 | 清理清单 | 证据 |
|---|---|---|---|
| 布局实例删除 | `delete --target <实例>` | ①实例记录 ②私有素材组树整树 ③宿主布局 f503 packed ④模板 type4 back-ref f14 ⑤顶层索引（parent=None 组） | 轮14 |
| 库容器整组删除（模板族） | `delete --target <模板>` | 递归模板完整记录树 + 库容器 f503 + 索引；布局官方预置不受影响 | 轮3 |
| **悬浮页整族删除（2026-09-11 已实现）** | `delete <悬浮页实体ID>`（t44 自动路由） | 实体 + t42 引用的全部容器树（成员控件递归+控件私有素材组）+ 宿主容器收缩（清空且 parentless 且非真库 1840 → 连带删除）+ 索引重建；t42 悬空引用只报告 | rubik-game 12 条清理实证（live==Temp==候选逐字节） |
| **孤儿记录删除（无宿主）** | `delete <id> --orphan-ok` | 记录 + 索引（显式确认；无宿主收缩） | rubik-game 2026-09-11（2164/2165 残件） |
| 孤儿处理（检测） | （报告不清理） | 悬浮页同步孤儿（索引外残留记录）可检测并报告；清理与否待用户决策 | 轮35 |

## 7. 玩家改动识别（票04 核心；对锚点差异）

| 特征 | 判定 | 证据 |
|---|---|---|
| 布局实例几何/属性直接变化 | 玩家细排（创作者路径=库实例编辑+同步广播，两侧形态不同） | 轮13 |
| 未同步的实例侧变化 | "玩家/创作者已改，尚未广播"——报告 + 提示 sync | 轮9/11/13 |
| 素材树孤儿/重复克隆 | 报告（编辑器行为，勿当玩家改动） | 轮35 |
| ID 全量换新 | 同步/模板化结果，按角色/路径重锚后再 diff | 轮10/12/63 |

锚点：`assets:ui anchor save --label <名>`（sidecar `.gsts/ui-anchors/<mapId>.json`，存语义视图+记录集 hash，不存 wire 副本——.gil 即真相）。diff 输出三栏：新增/删除（记录级+语义级）/属性变更（字段级：geometry/text/color/font-size/align/素材组/状态块/开关/显隐）。

## 8. ID 分配策略（所有 create/clone 生效）

- 禁止 max+1 直推（编辑器计数器跳变 +14/+22/连续皆有实证）；候选 = 扫描 root9 已用 ID 后取缺口（如 2031）或高位预留区间；
- 克隆模板化路径的 ID 序列由内核一次分配（组树成员连续、预留空洞）；
- 新 ID 须满足：不与任何记录/索引/引用冲突；分配后回读断言（引用计数一致）。
- 证据：轮4/23/29/51（跳变），轮1-2/34/53（连续段）。


## 票09 实测追加（2026-09-03）：对齐右码 + 命令层缺口
- 对齐：f19.f503/f68.f506 居中=1/右=2/缺省=左（第12步 输入框右对齐 样本铁证）。
- create 默认形态=空素材/空文本；素材组/模板化坑与成员编辑见 ui-controls.md 票09 节 + 票10。
