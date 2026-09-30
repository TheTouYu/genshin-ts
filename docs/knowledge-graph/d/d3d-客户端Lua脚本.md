# D3d 客户端 Lua 脚本

> 状态：**已验证**（2026-09-29 建，初版；**正式服已上线**——用户 2026-09-29 确认，创体服→正式服遗留差异复核项见 §八）
> 最近校验：2026-09-29
> 官方权威：《客户端控件API文档》**官方 web 版已镜像到手**（`research/千星知识图谱/learn-lua71/官方API文档-客户端控件.md`，48.5K 全文，源 https://act.mihoyo.com/ys/ugc/tutorial/detail/mhtakr07vej4）+ 官方教程《客户端控件和客户端脚本》（同目录）+ 7.1 开发前瞻 BV1nUYL6hEga（已学）
> 语料：12 源视频学习（`research/千星知识图谱/learn-lua71/`）+ 沙箱模拟器源码研究（`/home/h/miliastra-beyond-simulator`，GitHub 1475505/miliastra-beyond-simulator）
> 证据分级：硬规则（官方）> **第三方真机回传**（模拟器 observed-contract）> 实测 > 经验共识 > 个人经验；ASR 听写结论一律标「待验证」
> 上游：`research/千星知识图谱/learn-lua71/知识提炼.md`（40+ 条术语校正表）、`沙箱模拟器研究.md`

## 一、领域定位与命名

- **官方背景**：2026-09-16 千星奇域 7.1 创体服官宣开放客户端 Lua 脚本编程（时间线证据：官方号「原神千星奇域」开发前瞻 BV1nUYL6hEga，27.8 万播放；社区爆发期 09-23~28）。**Lua 与节点图的关系是并存互补，不是替代**（用户裁决 2026-09-29：7.1 Lua 是额外能力，与 genshin-ts 的客户端/服务端节点图+完整游戏资产互补）。
- **7.1 官方前瞻口径**（BV1nUYL6hEga `[05:16]`-`[06:20]`，硬规则）：
  - 「首先在**界面编辑**中，**新增一类可挂载客户端脚本的控件**」——官方证实客户端脚本挂载点=UI 控件类（与模拟器三类资产模型交叉印证）
  - 「新版本将上线**协作模式**功能，奇匠们可以邀请伙伴一起编辑存档」（12 源社区教学均未覆盖的官方新功能）
  - 一批新场景素材进入千星奇域
  - **未来预告**：「超限人数上限扩充、对**射击玩法**以及**异步交互玩法**的功能支持，都在稳步开发中」+ 新手/专业开发者专项扶持计划 + 流量分配围绕玩家真实体验优化
  - 生态数据：全球超 **9 万名奇匠**参与创作、累计 **12 万+ 奇遇关卡**；7.1 = 玩法发布一周年里程碑；首届启星盛会评选 20 个年度奇遇关卡
- **三类资产模型**（模拟器 AGENTS.md 实现约束，与官方编辑器对齐）：**服务端 UI（客户端控件容器）→ 客户端 UI 模板 → Lua 脚本**。仅客户端控件/模板可挂脚本；模板脚本随实例化运行；**没有「服务端 Lua」**。
- **脚本如何进资产**：GIA `GraphUnit.script=35` → `ScriptMapping{id, name, file_path, source}`——**Lua 源码直接写进 GIA**（模拟器 `studio/gia/codec.js` proto3 schema，第三方逆向实证）。挂载关系不进 GIA wire（导出时需在编辑器重挂或走「整合包」并排写入）。
- **边界**：本篇讲客户端 Lua 的 API 面/生命周期/沙箱/层序画布，不讲控件编辑操作细节（D2b）与生态叙事（K6）。

## 二、源绑定

| 源 | 分级 | 类型 | 覆盖 | 证据等级 |
|---|---|---|---|---|
| **官方《客户端控件API文档》web 版**（mhtakr07vej4，48.5K 全文镜像） | **官方权威**（本篇准绳） | 官方 wiki（SPA 渲染抓取，2026-09-29） | 生命周期/全局函数/颜色/Script/game/服务器信号/补间动画/输入事件/手柄导航/全部控件类型及枚举的**精确签名** | **硬规则** |
| **官方教程《客户端控件和客户端脚本》**（mhbgxf0nynww） | 官方权威 | 同上 | 服务器控件 vs 客户端控件定义/入口/挂载模型/上传规则/模板索引与运行时ID | **硬规则** |
| 模拟器 `client/lua-runtime/docs/observed-contract.md` | **契约权威**（本篇主源） | 第三方工程文档（官方API文档表面+三轮真机探针 7.0.50+用户真机回传） | 20 条编号契约：生命周期/沙箱裁剪/字段标识/层序/字号校验 | **第三方真机回传** |
| 模拟器 `client/lua-runtime/docs/architecture.md` | 契约权威 | 同上 | 已观察契约表（真机 7.0.50）+ 模拟器策略声明 | 第三方真机回传 |
| `BV1qYeF6nEiq`（戀祈 9:28 综述） | S 级 | 视频（ASR） | 7.1 能力全景：Lua 客户端脚本+控件+AnimationClip | 待验证（听写） |
| `BV1Zten6VEeD`（官方速览） | S 级 | 视频（字幕） | 官方口径新功能清单 | 实测（官方口径） |
| `BV1dqeF62EbP`（和裕茶客 官方示范） | S 级 | 视频（ASR，UP烧录字幕版） | 官方示范关演示 | 待验证（听写） |
| `BV1uBaP61Ekj`（夜芊瑶 完整 2D 玩法） | A 级 | 视频（字幕） | 完整 2D 小游戏开发实战+API 文档网盘（提取码 7im3） | 实测 |
| `BV1DieU6rEiQ`（和裕茶客 动画教程） | A 级 | 视频（字幕） | 补间动画/AnimationClip | 实测 |
| `BV1BYeF6JEPg`（小猪之最 官方解读） | S 级 | 视频（ASR） | 官方规则逐条解读 | 待验证（听写） |
| `BV1oGaa6KEfW` / `BV1uXag68Edh`（AI 系列） | A 级 | 视频（字幕） | AI 问题集/辅助控件；两奇域 AI 成本 40 美元数据 | 实测 |
| `BV1dVau6TE2q`（miliastra-lua-types） | B 级 | 视频（字幕） | 社区类型注解仓库生态位 | 实测 |
| `BV1rxhf6EEHb`（神奇嘟嘟可 沙箱模拟器） | B 级→**升 S**（源码已入手） | 视频+源码 | 完整模拟器工程（本篇主源之上游） | 源码实证 |
| `BV1nUYL6hEga`（官方 7.1 开发前瞻，6:49，2026-09-12） | **官方口径** | 视频（ai-zh 字幕） | 7.1 官方更新清单：客户端脚本控件/协作模式/未来玩法方向；生态数据 9 万奇匠/12 万关卡 | **硬规则**（官方口径，字幕听写术语已校正） |
| `research/千星知识图谱/learn-lua71/知识提炼.md` | 汇编 | 我方学习产出 | 九大主题+术语校正表 40+ 条 | 混合（逐条标） |

## 三、生命周期与挂载（模拟器契约 §1/2，第三方真机回传）

- **HR-01｜顺序铁律**：`OnInit → OnEnable → OnStart`；EnableUpdate 前无 OnUpdate；退出 `OnDisable → OnDestroy`。
- **HR-02｜SetActive 不重入**：`SetActive(false)` 立刻 OnDisable；再 `SetActive(true)` 只跑 OnEnable，**不重跑 OnStart**（2026-08-29 真机）。
- **HR-03｜实例化窗口**：`InstantiateClientUIControl` **仅在 OnStart（及 running 状态）成功**；在 OnInit/OnDestroy 里调用返回 nil。实例的 active/visible 继承模板定义，运行时不强制打开。
- **HR-04｜require 语义**：映射路径 `子目录/文件名`（无 `.lua` 后缀，`\` 归一）；独立 `_ENV`；有缓存；**不跑 OnInit/OnStart**；失败报 `failed to load script '…'`。每个挂载脚本一台 Lua VM，模块在同一 VM 内共享 registry。
- **HR-05｜GetParam 保型**：string/integer/float/boolean 保编辑器类型；未配置为 nil。

## 四、API 语义（模拟器契约+architecture，第三方真机回传）

- **HR-06｜调用形式三分**（官方 API 文档签名原文证实）：`game` 全局表函数用**点号**（`game.GetClientUIRoots()`、`game.Tween(object, tweenDataTable, duration) → Tween`、`game.InstantiateClientUIControl(controlPrefabIndex: integer, parent: ClientUIBaseControl)`）；`script` 对象方法用**冒号**（`script:GetParam(paramName: string)`）；控件方法冒号。真机回传 `game:GetClientUIRoots()` 报 `bad argument count ... (0 expected, got 1)`（2026-09-25）——冒号给 game 传了隐式 self 即错。
- **HR-07｜控件标识字段名**（首字母大写）：`Id` / `prefabIndex`；脚本字段 `scriptMappingId`（GetScript 参数同名）；grid `itemPrefabIndex`；reference `referencedPrefabIndex`。旧 probe 的 `control.id`/`prefabId` 是旧版接口，不作兼容口径。
- **HR-08｜控件 userdata 按类型封死**：当前类型没有的字段读 nil、写报 `cannot set <field>, no such field`。光标监听只挂预设按钮/光标检测区。`imageType` 虽文档标读写，但 Instantiate 后赋值真机被拒——保守跟拒绝路径。
- **HR-09｜Tween 默认绝对**；`SetRelative(true)` 才增量；Linear 按时间线性（对照过真机）。非 Linear Ease 为模拟器 Penner 公式（策略，非官方证明）。
- **HR-10｜fontSize/minimumFontSize 必须 integer**：真机日志 `38 * .62 = 23.56` 被拒 `integer expected, got number`（七圣脚本，2026-09-27）。`20.0` 整数值浮点输入允许是模拟器策略，真机子类型行为未确定。
- **HR-11｜script.path 保留目录**：真机返回 `default_import_file/levelScript` 而非 `levelScript`（正式服 PC，2026-09-27）。
- **HR-12｜FindChild 支持 `A/B` 路径**；GetChild 仅一层直接子节点。
- **HR-13｜时停粒度**：`PauseLevelTime` 只停 `OnLevelUpdate`，**不停 OnUpdate**。
- **HR-14｜按键监听 `return true` 中断后续**（`return false` 穿透是模拟器策略，官方未定）。
- **HR-15｜Color 是打包整数 AARRGGBB**；`Color()`/`FromRGB()`/`ToRGBA()`。Enum 是 userdata，`==` 比身份，有 Name/FullName/EnumType。

## 五、Lua 沙箱裁剪（真机 7.0.50，第三方真机回传）

- **HR-16｜`_VERSION` = nil**（不能用来探测环境）。
- **HR-17｜无**：`io` / `package` / `loadfile` / `load` / `dofile` / `coroutine` / `collectgarbage` / `string.dump`/`pack`/`unpack`；全局 `getmetatable` 对字符串隐藏。
- **HR-18｜保留**：`utf8`、`os.time/date/clock/difftime`、`debug.traceback`、`math.modf/ult/isnan/isinf`。文档异常行提到的 `math.isnaf` 无处记载——**反编造：不提供**。
- **HR-19｜typeof 返回**：`Script`、控件类名、`EnumItem`、`CursorEventData`；普通 table 返回 `table`。

## 六、层序与画布（模拟器契约 §13，第三方真机回传+策略）

- **HR-20｜同级层序**：显式层级数值**大的在上**；Lua sibling 大索引置顶，First 置底、Last 置顶（官方原始快照 rev223 + 2026-09-06 用户真机反馈）。编辑器同级列表先出现的在上；运行时索引在 scene 边界反向映射——**不要把编辑器树/GIA wire/运行时索引混成一个方向**。
- **HR-21｜动态实例默认置顶**：`InstantiateClientUIControl` 新根默认在已有同父兄弟上方（2026-09-28，用户要求的兼容性规则，`provided_unverified/device`——非官方文档声明）；模板内部静态子列表保持原序。
- **HR-22｜图片不把指针传给子级光标区**；绘制与命中共享同一树。
- **HR-23｜画布五档**（与 `GetUICanvasSize` 同源）：PC KEYBOARD 1600×900、2100×900；手机 TOUCHSCREEN 1280×720、1560×720、1280×960。**原点左下、Y 向上**，锚点相对父矩形——不能直接搬 HTML/CSS 坐标。布局保存 GIA 四平台 `transformByPlatform`。

## 七、与我方工程的关系（战略定位）

- **与 genshin-ts 互补而非竞争**（用户裁决 2026-09-29）：模拟器作者自认边界——服务端只模拟变量+信号，**不执行官方节点图**；genshin-ts 的节点图编译/注入主航道、完整游戏资产（地图/实体/技能配置）能力不受影响。反过来模拟器提供 7.1 UI 控件 GIA wire（`UiControlGroup` proto schema，genshin-ts injector 未覆盖的 2000x 域）与 Lua API 契约表，是 A2 战略（TS→Lua 生成器预研）的现成测试床。
- **生态位**（K6 侧补充）：7.1 后社区分层——通用 Lua 教程（VSCode/零基础）不属本域；领域内生态=官方前瞻、社区类型注解（miliastra-lua-types）、沙箱模拟器（DSH 插件+MCP+Web 三形态）、AI 辅助教程。AI 成本数据：两奇域 AI 制作全程约 40 美元（BV1oGaa6KEfW，实测自述）。
- **沙箱模拟器的工程范式值得我方借鉴**：证据分级 `runtime=html|simulator|device`（与我方三栏门禁同构）、expectedRevision 乐观并发、runCase 回放断言、双截图分工（编辑器静态 vs Runtime 帧）、「未知语义标策略或明确失败，不伪造」的反编造政策、按需读取的七步 Skill 设计。

## 八、知识缺口与待验证

| 缺口 | 状态 | 补齐路径 |
|---|---|---|
| 《Lua客户端UI脚本API》官方文档原件 | ✅ **已闭合**（2026-09-29）：官方 wiki《客户端控件API文档》web 版 48.5K 全文镜像到手（`learn-lua71/官方API文档-客户端控件.md`），HR 清单可逐条升格硬规则；夜芊瑶网盘版弃用 | 待办：对照镜像把 HR-01~23 逐条核签并标注官方行号 |
| 官方前瞻 BV1nUYL6hEga 内容 | ✅ 已补学（2026-09-29，ai-zh 字幕，官方口径入 §一） | —— |
| 正式服 vs 创体服差异 | 正式服已上线（用户 2026-09-29 确认）；模拟器契约含 2026-09-27 正式服 PC 真机回传（script.path/fontSize）——**主体已正式服口径**；遗留：具体客户端版本号未登记、web 版 API 文档的更新节奏未跟踪 | 复核点集中登记 |
| ASR 听写的 API 名（onStart 大小写等） | 已被模拟器契约交叉校正（§3-6） | —— |
| 旧月之六视频口径 | 已过时 | 不再引用（降维打击叙事见 K6） |

## 九、引用本篇时注意

- 本篇 HR-01~HR-23 的证据等级是**第三方真机回传**（模拟器工程的可信度高于普通社区视频、低于官方文档原文）——引用时注明「经 miliastra-beyond-simulator 契约表」，不要写成「官方文档规定」。
- 模拟器契约表本身在持续更新（其文内日期 2026-08-29~09-28），引用时以 `/home/h/miliastra-beyond-simulator/client/lua-runtime/docs/observed-contract.md` 最新版为准。
