# ui/ 设计全稿 V2（UI 编辑器命令层 DESIGN）

> 票 03 主产出 · 状态：**v0.2 待用户裁决**（2026-09-03；V2 = 领域模型修正 + 推演验证法）
> 配套：`ui/mappings.md`（规则→命令映射）；`ui/design-trace.md`（56 条规则推演表）；`ui/AGENTS.md`（常驻约束）
> V2 变更：①引入「放置面 Surface」领域模型（用户指点：页签不能进布局；悬浮页=容器面宿主）②推演验证法正式化（每条规则→命令，trace 表驱动命令面）
> 一切 wire 细节以知识权威为准（`.agents/skills/editor-incremental-gia-investigator/references/ui-controls.md`），冲突以最新差分轮为准。

## 第一章 领域模型（V2 修正，用户 2026-09-03 权威指点）

### 1.1 两代体系与放置面

```text
【老体系】布局 Layout（页面级放置面）
   布局内可直接放置官方控件（文本框/图文输入框/消息队列/图片/自定义按钮/悬浮交互页…）
   ⚠ 页签不是官方布局控件——tab 不能放在布局里（用户 V2 明确）

【新体系】悬浮交互页 FloatingPage（=官方控件之一，但特殊且常用：网页式大浏览器）
   悬浮页实体内部持有「容器」列表（实体 t42 引用；随创建自动带固有容器，可显式添加页面容器）
   容器（固有容器/页面容器）= 与布局类似的子放置面：容器内可直接放控件
   页签 = 特殊控件：只能放在悬浮页的具体容器中；功能=控制容器的开/关(显隐)
          与控制悬浮页内所有容器中具体控件的显隐（无需节点图）
```

### 1.2 放置面（Surface）与父子约束表

- Surface 类型：`layout`（布局面）/ `floating-page`（悬浮页实体面，子面=容器）/ `container`（悬浮页内容器：固有/页面）/ `library`（界面控件组库容器 1840，官方单条暂存面）。
- **placement 规则（类型注册表声明）**：

| 控件 kind | 可放置面 | 证据 |
|---|---|---|
| custom-button / textbox / image / input-box / message-queue 等官方控件 | layout ✅；floating-page 容器面 ✅（按钮轮26/28 实证；输入框/队列进容器面待样本） | 轮4/19/51/26 |
| floating-page | library ✅；layout（老版本 ✅；**新版布局内形态待差分**） | 轮24；A7 |
| tab（页签） | **仅 floating-page 容器面**（固有容器/页面容器）；layout ❌ | 轮29/34；用户 V2 |
| container（页面容器） | 仅属 floating-page（实体 t42 列表）；layout ❌ | 轮33 |
| 关闭按钮/固有容器 | 悬浮页创建时自动（体系内部），不单独放置 | 轮24 |
| type55 素材组 / 样式树 / 消息项 / 页签页面项 | 面内控件的内部子树（非 Surface 概念） | 轮8/53/61 |

- **判别器必须带 parent 上下文**（轮64 实证）：独立文本框/图片控件与素材 member（t25/t38）组件签名相同——
  判 kind 时 parent=type55 素材组 → member 素材；parent=容器/布局 → 独立控件。类型注册表 discriminator = 签名 + parent role。
- 树视图并列展示两体系：`布局面(多布局)` 与 `悬浮页面(多实体 → 容器列表)`，容器内控件树与布局内控件树同构渲染（schema 驱动递归，不硬编码深度）。

### 1.3 页签语义（用户权威）

- 页签 = 浏览器式多页面控件：内部页面项列表（t47 条目；默认 1 空白页，可加页、改名、设默认、开返回服务端事件）。
- 页面项可配置：①容器状态设置（控制悬浮页容器显隐，f502 块）②控件状态设置（控制容器内控件显隐——**含页签自身**，f504 块）。
- 价值定位：布局里的显隐控制要节点图；悬浮页内页签直接完成（点击"开始游戏"→显示特定容器内容；设置页多选项=页签切换）。

## 第二章 设计约束（12 条，用户 2026-09-03 认可；条文见 AGENTS.md 铁律）

双模型+未知字节透传 / 身份寻址分离 / 类型注册表(含 placement) / 坐标系作用域 / 规则版本化 /
玩家协作第一公民 / 克隆引擎统一 / 作用域参数 / list 三视图 / dry-run+快照即 undo / 写回纪律 / fail-closed。

## 第三章 命令面定义（V2）

### 3.1 总则

- `gsts assets:ui <cmd>`；通用参数 `--gil/--json/--dry-run`；写命令默认 dry-run→确认→写回（`--yes` 脚本化）。
- 寻址 `--target`：ID | path | role（path 按 Surface 树：`悬浮页名:容器名:控件kind#序号`；页签页面用 `页签id:page#n`）。
- 输出 schema `{schemaVersion, mapId, sha256, kind, data}`。

### 3.2 L1 list / diff（玩家视角共识层）

```
assets:ui list [--tree|--flat] [--path] [--kind] [--format]
assets:ui diff --anchor <label|file>          # 新增/删除/字段级变更/playerChanges
assets:ui anchor save|list                    # 语义视图+记录集 hash → .gsts/ui-anchors/<mapId>.json
```
- 树视图按 Surface 模型渲染（布局面/悬浮页面并列；悬浮页展开 t42 容器列表 → 控件 → 子项）。
- list --json 每节点 `{id,path,role,kind,name,geometry?,children[],refs[],props{},unknown[]}`。

### 3.3 L2 create（含 placement 校验）

```
assets:ui create --type <kind> --on <layout|library|悬浮页>:<容器> [--name --position --size --text --color …]
assets:ui container add --page <悬浮页>                      # 新增页面容器（实体 t42 追加）
assets:ui template create --target <官方控件|实例>            # 三合一（family 参数化：是否自动建库实例）
assets:ui create-from-template --target <模板> --on layout|library|悬浮页:<容器>
assets:ui clone --target <控件> --into <容器|页面容器>
assets:ui floating-page variable add --page <悬浮页> --type int|float|string|dynamic-text --name <n>
```
- placement 校验失败示例：`create --type tab --on layout:默认布局` → 报错「tab 仅可放置于悬浮页容器」（A5 推演）。
- create 默认值=类型注册表 defaultGeometry（按钮 180×52 / 页签 500×100 / 队列 150×150）；ID 由分配器一次发号（mappings §8）。

### 3.4 L3 edit（surgical patch，默认实例侧作用域）

```
assets:ui update --target <寻址> --position/--size/--name/--text/--color/--font-size/--align/--rich-image …
assets:ui state --target <按钮> --state normal|hover|press [--scale] material add|remove …
assets:ui material --target <组> …             # type55 组树操作
assets:ui sync --target <实例|悬浮页实体>        # family 分派：layout-instance=整树替换广播；floating-page=增量补齐+拆双份
assets:ui delete --target <寻址> [--cascade]
```

### 3.5 L4 props（精确属性；含便捷宏）

```
assets:ui tab page add|rename|text|default|server-event --tab <页签> --page <n> …
assets:ui tab page container-state|control-state --tab --page --enable/--container/--show/--hide/--remove …
assets:ui tab page preset-tab-switch --tab <页签> --on <容器A> --off <容器B>   # 便捷宏：互补显隐（轮43 模式）
assets:ui queue style add|message add|message style|props --target <队列> …   # style/message/timed-show/max-items/insert/align
assets:ui container active --target <容器> --enable on|off                     # 初始生效
```
- 未闭合语义（页签默认选择哨兵）：只读回显 + 写 fail-closed（E3）。

## 第四章 规则→命令映射

`ui/mappings.md`（§0-8；V2 已按 Surface 模型修正放置面与悬浮页/页签行）。

## 第五章 设计验证（推演法，用户定）

`ui/design-trace.md`：56 条规则逐条→命令调用，51 ✅ / 5 ⚠（2 证据缺口待差分：A7 布局内悬浮页新版形态、G3 悬浮页删除链；3 已修正：placement 校验、variable add 补入、tab 宏）。
**验收规则：任何新命令/参数改动必须重跑推演表受影响行；设计冻结以推演全绿为准。**

## 第六章 验收与风险

（沿用 V1：分层证据结构层/行为层/回归层；命令级样本对照见 mappings 各节；安全门 SHA→dry-run→确认→写回→回读→提醒重载。）
风险清单追加：
- placement 表中"容器面可放 kind"目前仅按钮/页签样本——输入框/队列/悬浮页入容器面待差分登记；
- 布局内悬浮页（A7）与悬浮页删除链（G3）实现前必须补差分轮；
- 老 CLI 悬浮页 4 条规范（gil_ui BUILTIN）与新 3 条单条族不一致——create/sync 实现以干净 donor 重验。
