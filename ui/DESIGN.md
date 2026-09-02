# ui/ 设计全稿（UI 编辑器命令层 DESIGN）

> 票 03 主产出 · 状态：**v0.1 草稿待用户裁决**（2026-09-03）
> 配套：`ui/mappings.md`（规则→命令映射大表，实现唯一依据之一）；`ui/AGENTS.md`（常驻约束）；`ui/README.md`（知识索引）
> 知识权威：`.agents/skills/editor-incremental-gia-investigator/references/ui-controls.md`（63+ 轮，覆盖约 1/3 wire 面）
> 本稿服务于票 04-07（CLI 实现）与票 08（游戏内验收）；一切 wire 细节以 mappings.md + 知识权威为准，冲突时以最新差分轮为准并回写本稿。

## 第一章 设计约束（定稿，用户 2026-09-03 认可）

（12 条：双模型+未知字节透传 / 身份寻址分离 / 类型注册表 / 坐标系作用域 / 规则版本化 /
玩家协作第一公民 / 克隆引擎统一 / 作用域参数 / list 三视图 / dry-run+快照即 undo / 写回纪律 / fail-closed。
完整条文见 `ui/AGENTS.md` 铁律与早期 DESIGN 版本记录——本节为压缩引用，实施逐条对照 AGENTS.md。）

## 第二章 命令面定义

### 2.1 总则

- 命名空间沿用 `gsts assets:ui <cmd>`（向后兼容既有 list/clone/create/update/delete/template/variables/states）。
- 所有命令支持：`--gil <file>`（缺省=当前活动地图）、`--json`（机器输出）、`--dry-run`（展示将产生的 wire diff，不写盘）。
- **写命令默认不落盘**：输出候选 diff + 等待 `--apply`/确认（写回纪律内建；交互会话默认提示确认，脚本可 `--yes`）。
- 寻址统一 `--target`：`<ID>` | `<path>` | `<role>`（见 2.2）。
- 输出 schema：`{schemaVersion, mapId, sha256, kind, data}`，data 随命令；list/diff 的 JSON 是 AI 决策入口，字段稳定、不加装饰。

### 2.2 寻址（身份与寻址分离）

```
path   := 段('/' 分隔)
段     := <layout 名|id> | <容器名|id> | <控件 kind|名|id>['#'<序号>] | <子项 kind>['#'<序号>]
例：assets:ui list --path "自定义布局:页签#2"            # 布局内第二个页签控件
例：assets:ui update --path "悬浮交互页:固有容器:自定义按钮" --position 90,26
role   := --role-of <instance-id> template|library-instance   # 角色寻址（同步后重锚）
```

- 名字可能重名/为空/含序号默认名 → `#序号` 消歧（序号=同级 children 顺序，与 wire 成员序一致）；
- 同步/模板化后 ID 换新：命令层优先 path/role，ID 仅用于脚本幂等场景；`list --json` 每个节点同时给出 id/path/role。

### 2.3 概念树与类型注册表（数据模型）

- 概念树节点：`{ id, role, kind, name, geometry?, parentId?, children[], refs[], props{}, unknown[] }`
  - `kind` 来自类型注册表判别（组件签名匹配），未知签名 → `kind:"unknown"` + `unknown[]` 标记（fail-closed，不猜）；
  - `refs` = 非父子引用（模板 back-ref、实体 t42 容器列表、状态块素材组、消息项样式序号、控件状态设置条目…）；
  - `props` = schema 已解码属性；`unknown` = 命中记录但未解码区段（长度+hash 摘要，供后续学习轮）。
- 类型注册表条目（元数据驱动）：`{ kind, discriminator(签名/type 码/kind 常量), schema[], defaultGeometry, family(体系), materialSupport, templateSupport }`。
  已登记 kind：layout / custom-button / system-button / textbox(member) / image(member) / input-box /
  floating-page / floating-close-button / tab / page-container(固有/页面) / message-queue /
  style-group(type55 素材组) / official-resource 引用类…（扩展=加条目）。
- 递归关系由 schema 声明：layout→controls；container→controls；control→(状态素材组树|样式树|消息项|页面项)；悬浮页实体→容器列表(t42)。树渲染按声明递归，不硬编码深度。

### 2.4 L1 list（最关键——先交付）

```
assets:ui list [--tree|--flat] [--path <寻址>] [--kind <kind>] [--format text|json]
```
- 树视图：页面/悬浮页/布局 → 容器 → 控件 → 子项（页签页面/素材成员/样式/消息项），带几何/文本摘要；
- 平面视图：记录级（role/kind/name/id/parent/未知标记），用于对账；
- `--page <悬浮页ID>` 兼容既有 variables list 语义；既有 list/variables/states 输出映射到新 schema（不破坏脚本）。

```
assets:ui diff --anchor <label|file> [--gil <file>]   # 玩家改动识别（锚点=上次 AI/脚本状态）
assets:ui anchor save --label <名> [--gil <file>]     # 语义视图+记录集 hash → .gsts/ui-anchors/<mapId>.json
assets:ui anchor list
```
- diff 输出：`{ added[], removed[], changed:[{target, fields:{field:[before,after]}}], playerChanges:[] }`；
- playerChanges 判定特征（§mappings 7）：布局实例直接变化=玩家细排；实例侧未同步变化=提示 sync；孤儿/ID 换新=编辑器行为（报告不误报玩家）。

### 2.5 L2 create（很关键）

```
assets:ui create --type <kind> --into <layout|容器|悬浮页|页面容器> [--name] [--position] [--size]
                 [--text] [--color] [--font-size] [--align] ...
assets:ui template create <target>          # 保存为模板 = 三合一（模板+原地升格+自动库实例）——按钮族/输入框/队列共用内核
assets:ui create-from-template <模板> --into layout|library [--position] [--size]
assets:ui clone <源> --into <容器|页面容器> [--name]
assets:ui container add --page <悬浮页>      # 新增页面容器（实体 t42 追加）
```
- create 默认值 = 类型注册表 defaultGeometry + 编辑器同款默认（按钮 180×52、页签 500×100、队列 150×150…）；
- 官方控件=官方单条记录；库容器挂载/布局挂载=实例化语义（f503 追加 + back-ref 由内核处理）；
- ID 由分配器一次发号（§mappings 8），dry-run 展示完整新增记录集。

### 2.6 L3 edit（通用编辑，surgical patch）

```
assets:ui update --target <寻址> --position/--size/--name/--text/--color/--font-size/--align/--rich-image <资源ID> ...
assets:ui state --target <按钮> --state normal|hover|press [--scale X,Y] [--material-add text|image ...] [--material-remove <n>]
assets:ui material --target <组> add|remove --member ...      # type55 组树操作
assets:ui sync --target <实例|悬浮页实体> [--scope template|all]  # 广播：按钮族=整树替换；悬浮页=增量补齐
assets:ui delete --target <寻址> [--cascade]
```
- 默认作用域 = 实例侧（不广播）；`sync` 是显式广播命令（机制语义按 family 分派，mappings §2/§4）；
- 字节级定点修改：所有写操作在候选字节上做最小 diff，未解码区段零触碰；dry-run diff 作为兜底断言。

### 2.7 L4 props（精确属性，按控件表路由）

```
assets:ui tab ...            # 页签/页面项：page add/rename/set-text/set-default/server-event/container-state/control-state
assets:ui queue ...          # 消息队列：style add/message add/message style/timed-show/insert/max-items/align
assets:ui page-container ... # 悬浮页容器：active(初始生效)/show-hide
```
- 每个子命令参数与 wire 路径一一对应 mappings §4.1/§5 表；未闭合语义（如默认选择哨兵）→ 命令只读+回显，写先 fail-closed。

### 2.8 分派表（操作→族→内核）

| 内核 | 覆盖命令 |
|---|---|
| 克隆+ID 重映射+引用更新 | template create / create-from-template / clone / sync(各体系) |
| 私有树管理（type55） | state --material-add / material / queue style add / template create 伴随 |
| 成员注册 | create --into（布局 f503 / 容器 f503 / 实体 t42 / 模板 f14 back-ref） |
| 删除清理（五件套） | delete（按 family 清理清单） |
| surgical patch | update / props（L4） |

## 第三章 规则→命令映射

见 `ui/mappings.md`（§0 通用属性 / §1 布局 / §2 按钮族 / §3 图文输入框 / §4 悬浮页+页签 / §5 消息队列 / §6 删除 / §7 玩家改动 / §8 ID 分配；每条含 wire 路径与轮次证据）。

## 第四章 验收

### 4.1 分层证据（沿用仓库约定）

| 层级 | 方法 | 判定 |
|---|---|---|
| 结构层 | dry-run/写回后 `compare-gil-root-wire` + 逐字节 ranges + 回读断言 | 与编辑器人工执行同操作的结果**逐字节一致**（记录集/字段/引用/索引） |
| 行为层 | 游戏内执行（编辑器打开地图→控件可见可交互） | 用户确认句式：「按钮出现在 XX 布局 (x,y)，点击有 XX 效果」 |
| 回归层 | 留存真实样本（重启轮快照）断言 PASS | 判别/属性提取/差异定位与人工差分结论一致（票 04 checklist） |

### 4.2 命令级验收样例（每实现一个命令对照一个样本）

- create custom-button ↔ 重启轮4 快照对；create input-box ↔ 轮19；create message-queue ↔ 轮51；
- template create ↔ 轮5(按钮)/轮23(输入框)/轮63(队列三合一+私有树)；
- sync ↔ 轮10/12/17（按钮族整树替换）、轮25/32b/35/47/50（悬浮页增量补齐+孤儿）；
- delete ↔ 轮14（五件套）、轮3（整组递归）；
- tab page/container-state ↔ 轮30/36-46 快照链；queue props ↔ 轮53-62 快照链。
- 验收方式：CLI dry-run 输出 diff 与知识权威节内记录的字节变化一致 → --apply → 回读断言 →（必要时）编辑器人工打开核对。

### 4.3 游戏内验收句式（票 08 用）

- 创建：「创建后默认布局出现自定义按钮 180×52 于 (x,y)，文本为 X」
- 玩家细排识别：「玩家把按钮拖到 (a,b) 后 diff 报告位置变更（实例侧），模板侧无变化」
- 悬浮页：「悬浮页可唤起，页签1 选中时容器1 显示/容器2 隐藏，点击页签2 切换」
- 服务端事件：「点击页签项后服务端收到 whenFloatingInteractionPageIsTriggered，listIndex/selectedListItem 帧值与配置一致」

### 4.4 安全门（写命令执行前）

①SHA 锁定当前 map 与预期一致 → ②dry-run 展示记录级 diff → ③用户确认（或 --yes）→ ④原子写回+唯一备份 → ⑤回读断言 → ⑥通知用户重新加载地图（旧编辑器内存覆盖防护）。

## 第五章 风险与未覆盖区（fail-closed 清单）

1. wire 覆盖率约 1/3：type78、t47 group 编码细节、页签默认选择哨兵语义、第 4 状态块、f509/f510、素材相对坐标、root45/46 语义、2090 计数器字段——涉及区段命令只读/标记，写前先差分轮。
2. 旧 CLI 悬浮页创建（gil_ui 4 条规范）与新版 3 条单条族+双份树不一致 → 实现 create/sync 前以干净 donor 重验（轮24-25）。
3. 悬浮页素材树同步孤儿（文件膨胀）与"删除布局/删除模板/悬浮页元素删除"无样本 → delete 前补差分轮。
4. 官方图形/静态资源 ID 池（100006/100101/100102/101078）显示名与类别未闭合 → create/换图命令接受 ID，名称解析返回未知。
5. 多设备槽（4 槽）同步写策略：编辑器实测几何四槽同步；个别只改单槽场景未样本 → 默认四槽同步，schema 留 per-slot 扩展位。
6. 类型注册表初始集 = 已学 9 kind；新控件（交互按钮/自定义开关/弹窗/进度条等 12+ 官方控件）= 加 schema + 差分轮，命令面不变。
7. 锚点 sidecar 存于 .gsts（gitignored）：多机协作需重新锚定（文档提示）。
