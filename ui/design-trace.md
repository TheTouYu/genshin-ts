# ui/ 设计推演表（V2 验证：50+ 规则逐条映射）

> 方法（用户 2026-09-03 定）：假装命令已实现，把每条差分规律（=编辑器真实操作）映射为具体命令调用；
> 映射不出或麻烦 = 设计缺口。本表同时是票 04-07 的验收对照与命令面修正驱动。
> 记号：`⟶` 期望 wire 结果（引用知识权威节）；`⚠` 映射困难或证据缺口（驱动 V2 修正/待差分）。

## A. 布局与官方控件创建

| # | 编辑器操作（规则源） | V2 命令调用（假装已实现） | 判定 |
|---|---|---|---|
| A1 | 新建自定义布局（轮1/2：克隆默认 14 官方） | `assets:ui create --type layout --name 自定义布局`（布局面根创建；克隆 14 官方预置） | ✅ |
| A2 | 布局添加官方自定义按钮（轮4，全默认 963B） | `assets:ui create --type custom-button --on layout:默认布局` | ✅ placement=layout |
| A3 | 布局添加官方图文输入框（轮19） | `assets:ui create --type input-box --on layout:自定义布局` | ✅ |
| A4 | 布局添加官方消息队列（轮51） | `assets:ui create --type message-queue --on layout:默认布局` | ✅ |
| A5 | 布局里放页签 | `assets:ui create --type tab --on layout:默认布局` ⟶ **拒绝**：tab 仅可放悬浮页容器（用户 V2 指点） | ✅ 由 placement 校验拦截 |
| A6 | 库管理页添加官方悬浮页（轮24，3 条单条族挂 1840） | `assets:ui create --type floating-page --on library` | ✅ 新结构（3 条单条族） |
| A7 | 布局添加悬浮页 | **布局内不可添加悬浮交互页（用户权威：悬浮页内部自带容器面，特殊控件不进布局）；普通控件三面通用** | ✅ 用户结论 |

## B. 模板化 / 实例化 / 克隆

| # | 编辑器操作 | V2 命令调用 | 判定 |
|---|---|---|---|
| B1 | 布局官方按钮存为自定义模板（轮5：模板+原地升格） | `assets:ui template create --target <按钮实例>`（三合一内核：按钮路径=模板+升格；自动库实例差异见 B3） | ✅ |
| B2 | 图文输入框存模板（轮23：三合一**含自动库实例**） | 同 B1 命令；family=official-with-library-auto → 自动建库实例 | ✅ 内核按 family 参数化 |
| B3 | 消息队列存模板+同步（轮63：三合一+私有样式树克隆） | `assets:ui template create --target <队列> && assets:ui sync` | ✅ |
| B4 | 库页保存模板→详情实例（轮6） | `assets:ui create-from-template --target <模板> --on library` | ✅ |
| B5 | 复制页签到新页面容器（轮34，基础记录副本） | `assets:ui clone --target <页签> --into <页面容器>` | ✅ 副本不带 subtype 槽（克隆内核参数） |
| B6 | 旧图片控件模板+实例（08月：两步联动） | 同 B1/B4（内核同构） | ✅ |

## C. 按钮素材 / 状态 / 文本 / 几何（布局与悬浮页同构）

| # | 编辑器操作 | V2 命令调用 | 判定 |
|---|---|---|---|
| C1 | 常态素材=文本框+图片（官方静态资源 101078，缩放 0.5）（轮8） | `assets:ui state --target <按钮> --state normal material add --member text --text … --member image --resource official:101078 --scale 0.5` | ✅ 可接受；长参数建议拆 `--member text` 两步（见 ⚠1） |
| C2 | 素材文本+颜色（轮9：实例侧，不同步） | `assets:ui update --target <实例>.<素材树>:文本框 --text 大力射门! --color #F45D5D` | ✅ path 到 member |
| C3 | 悬浮状态加文本框素材（轮15） | `assets:ui state --target <按钮> --state hover material add --member text` | ✅ |
| C4 | 按下状态直接加图片素材（轮16，无组自动建组+member） | `assets:ui state --target <按钮> --state press material add --member image` | ✅ 组不存在=一步建（知识闭合） |
| C5 | 悬浮缩放 1.1 / 按下 0.9（轮7 三记录广播=实例+同步） | `assets:ui update --target <库实例> state scale --state hover --scale 1.1` + `sync` | ✅ |
| C6 | 悬浮 1.2（悬浮页按钮，轮28 未同步） | 同 C5（target=悬浮页容器内按钮） | ✅ |
| C7 | 移动按钮 (92.63,448.71)（轮11 实例侧） | `assets:ui update --target <按钮> --position 92.63,448.71`（中心语义换算） | ✅ |
| C8 | 玩家直接拖布局实例 (93.70,868.71)（轮13） | （不通过 CLI 写）→ `assets:ui diff --anchor` 报告位置变更 | ✅ |
| C9 | 同步广播几何+组树（轮10/12/17） | `assets:ui sync --target <实例>` | ✅ |
| C10 | 切悬浮 tab 自动建空组（轮9 确证副作用） | CLI 不模拟；diff 需识别"空组+引用"为编辑器副作用 | ✅ 报告层 |

⚠1：C1 参数过多 → V2 支持 `material add` 子命令逐步执行（`state material add text` / `state material add image`），与编辑器"添加素材"操作一一对应，比大参数更贴操作。

## D. 悬浮页体系（核心域，V2 重点修正）

| # | 编辑器操作 | V2 命令调用 | 判定 |
|---|---|---|---|
| D1 | 悬浮页同步生成模板=拆双份树（轮25） | `assets:ui sync --target <悬浮页实体>`（family=floating-page：模板树克隆+实例侧补槽） | ✅ |
| D2 | 详情添加自定义按钮（轮26，挂实例侧固有容器） | `assets:ui create --type custom-button --on <悬浮页>:固有容器`（placement=floating-page 容器面） | ✅ |
| D3 | 悬浮页按钮素材（轮28） | 同 C 族命令（target 悬浮页容器内按钮） | ✅ |
| D4 | 详情添加页签（轮29，挂实例侧固有容器 2084） | `assets:ui create --type tab --on <悬浮页>:固有容器` | ✅ 与 A5 呼应：tab 唯一合法面 |
| D5 | 新增页面容器（轮33，实体 t42 列表追加） | `assets:ui container add --page <悬浮页>`（固有容器随创建自动；页面容器=显式添加） | ✅ |
| D6 | 复制页签到页面容器（轮34） | B5 同 | ✅ |
| D7 | 容器初始生效（轮48-49：名字后 b01f01） | `assets:ui container active --target <容器> --enable on|off` | ✅ |
| D8 | 同步补齐容器+页签（轮35/32b/47/50） | `assets:ui sync --target <悬浮页>`（增量补齐内核） | ✅ |
| D9 | 悬浮页全量同步含素材树孤儿（轮35 观察） | sync 后 diff 报告孤儿（索引外记录）→ 提示；不自动清理（待决策） | ✅ 报告层 |
| D10 | 层级模型（用户权威）：页→容器列表→控件→页签→页面项 | `list --tree --path <悬浮页>` 输出该树 | ✅ 概念树 schema 驱动 |

⚠2：固有容器/页面容器是悬浮页面内子面；页面容器内可再放页签（轮34 副本在页面容器 2107）——placement 表：tab/buttons ∈ {固有容器, 页面容器}；容器 ∈ {悬浮页}；悬浮页 ∈ {布局?, library}（A7 待差分）。

## E. 页签页面项与显隐配置

| # | 编辑器操作 | V2 命令调用 | 判定 |
|---|---|---|---|
| E1 | 页签加第二页面+改名（轮30：t47 内联） | `assets:ui tab page add --tab <页签> --name 页签2`；`tab page rename --tab --page 2 --name …` | ✅ |
| E2 | 页面文本修改（轮30） | `assets:ui tab page text --tab <页签> --page 1 --text …` | ✅ |
| E3 | 默认选择配置（轮36：哨兵重写，语义未全闭合） | `assets:ui tab page default --tab <页签> --page <n>` ⚠ 哨兵编码未闭合 → 写前必须补反向差分；V2 = 只读回显 + 写 fail-closed | ⚠ |
| E4 | 返回服务器事件开关（轮37/38：f504=1 c01f01） | `assets:ui tab page server-event --tab <页签> --page <n> --enable on|off` | ✅ |
| E5 | 容器状态设置：两容器显隐（轮39-43：f502 块 entry+标记） | `assets:ui tab page container-state --tab <页签> --page <n> --enable on` `… --container <容器> --show|--hide` `… --remove <容器>` | ✅ 与编辑器"添加页面容器/配置显隐"对应 |
| E6 | 控件状态设置：容器内控件显隐（轮44-46：f504 块，含页签自身） | `assets:ui tab page control-state --tab <页签> --page <n> --enable on` `… --control <控件> --show|--hide` | ✅ |
| E7 | 双页签互补配置（轮43 经典模式） | E5/E6 对 page1/page2 各执行一次 | ✅ |
| E8 | 关闭容器状态开关保留 entry 记忆（轮42） | `container-state --enable off`（仅删启用标记） | ✅ |

⚠3：E5/E6 命令较长 → V2 增加 `tab page preset-tab-switch --tab <页签> --containerA --containerB` 一键互补配置（轮43 标准模式）为便捷宏（宏=多次 surgical patch，非新 wire）。

## F. 消息队列

| # | 编辑器操作 | V2 命令调用 | 判定 |
|---|---|---|---|
| F1 | 布局添加队列（轮51） | A4 同 | ✅ |
| F2 | 队列几何（轮52） | `assets:ui update --target <队列> --position --size` | ✅ |
| F3 | 项样式=图片素材（轮53） | `assets:ui queue style add --target <队列> --material image` | ✅ |
| F4 | 样式二=文本框，字号 30，文本「样式二」（轮54） | `assets:ui queue style add --material text --text 样式二 --font-size 30` | ✅ |
| F5 | 最大显示项目 5→4（轮55） | `assets:ui queue props --target <队列> --max-items 4` | ✅ |
| F6 | 限时显示 5s（轮56） | `assets:ui queue props --timed-show on --seconds 5` | ✅ |
| F7 | 插入位置 结尾→开头（轮57） | `assets:ui queue props --insert-position head` | ✅ |
| F8 | 内容对齐居中（轮58） | `assets:ui queue props --align center` | ✅ |
| F9 | 新增消息项（轮61：type79 默认名） | `assets:ui queue message add --target <队列>` | ✅ |
| F10 | 消息项配样式（轮62：f502=样式序号） | `assets:ui queue message style --message <n> --style <n>` | ✅ |
| F11 | 队列存模板（轮63 三合一+私有树） | B3 同 | ✅ |
| F12 | type78 未解码 | 任何含 type78 记录的编辑先 dry-run 标记未解码区段 | ✅ fail-closed |

## G. 删除与清理

| # | 编辑器操作 | V2 命令调用 | 判定 |
|---|---|---|---|
| G1 | 删除布局实例按钮（轮14 五件套） | `assets:ui delete --target <布局实例>`（五件套：记录/私有树/布局 f503/模板 back-ref/索引） | ✅ |
| G2 | 删除库容器整组（轮3 递归） | `assets:ui delete --target <模板>` --cascade | ✅ |
| G3 | 悬浮页元素/容器删除（未样本） | ⚠ 命令存在但实现前补差分（实体 t42 收缩/容器成员） | ⚠ |

## H. 08 月遗留与事件 API

| # | 编辑器操作 | V2 命令调用 | 判定 |
|---|---|---|---|
| H1 | 形式变量添加 4 类型（08月轮3） | `assets:ui floating-page variable add --page <实体> --type int\|float\|string\|dynamic-text --name`（t41 双写模板/实例） | ✅ 需 V2 补入命令面（原 DESIGN 遗漏） |
| H2 | variables list（既有） | 兼容映射新 schema | ✅ |
| H3 | 事件 API 对照（whenFloatingInteractionPageIsTriggered） | `list --page <悬浮页>` 输出 = listIndex 依据；服务端事件帧验证=票08 行为层 | ✅ 不属命令面 |
| H4 | 任务栏/经典模板（08月实读，旧体系素材直挂模板） | 知识索引保留；CLI 模板化内核已覆盖（素材 member=控件记录） | ✅ |

## I. 推演结论（V2 修正驱动）

1. **领域模型修正（用户指点落实）**：引入「放置面 Surface」——布局面（老体系）/ 悬浮页容器面（新体系，含固有容器与页面容器）；
   placement 规则由类型注册表声明（页签 ∈ 悬浮页容器面；容器 ∈ 悬浮页；官方控件 ∈ 布局面，容器面按样本逐步登记）。
2. **命令面缺口补入**：floating-page variable add（H1）；tab page 便捷宏（⚠3）；container/state 子命令族统一为 `assets:ui <surface>/<control> …` 风格。
3. **缺口清零（2026-09-03）**：A7=用户权威结论（悬浮页不进布局；普通控件三面通用）；E3=轮66 序号 varint 闭合；G3=轮65 官方单条两件套闭合（带素材树/模板副本元素删除=非阻塞增强项）；容器面样本=轮64 三控件。
4. **推演通过率**：56 条规则 → 51 条直接映射 ✅；5 条 ⚠（其中 2 条=证据缺口待差分，3 条=命令面已修正/宏已设计）。
