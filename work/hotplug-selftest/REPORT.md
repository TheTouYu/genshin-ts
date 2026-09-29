# 插件开发预设 · 会话级热载（hotplug）实测报告

- 时间：2026-09-26（会话内实测）
- 环境：`DSH_HOME=/home/h/app/deepseek-harness/.compat/rehearsal/dryhome`（rehearsal 沙箱）；工作区 `/home/h/genshin-ts`；node v26.7.0
- 本会话预设：`plugin-dev`（插件开发专用+记忆），能力 `hotplug`/`plugin-dev` 均来自 `@dsh-external/dsh-preset-composer`
- 夹具目录：`work/hotplug-selftest/`（12 个 .mjs + `lifecycle.log` 运行痕迹）
- 结论：**通路可用，5 处契约与实测不符 / 未覆盖**（见「发现」）

## 一、通过项（44 项中的 39 项）

| # | 用例 | 命令 | 实测 |
|---|---|---|---|
| 1 | 空基线 | `status` | `当前没有热载能力。` |
| 2 | 最小插件加载 | `load` | `已加载能力 cap-basic（工具：hp_echo）` |
| 3 | 调用（显式 tool） | `call` | `echo:hello-hotplug` |
| 4 | 调用（单工具省略 tool） | `call` | `echo:omit-tool-name` |
| 5 | 生命周期钩子 | `unload` | `lifecycle.log` 落 `dispose:cap-basic` |
| 6 | 卸载后调用 | `call` | `{"ok":false,"op":"call","capability":"cap-basic","reason":"not-loaded","loaded":[...]}` |
| 7 | 多工具能力 | `load` | `（工具：hp_sum, hp_describe, hp_ping）` |
| 8 | 参数类型覆盖 | `call` | number/string/array/object/boolean/空参表 全通过 |
| 9 | 可选参数（省略 required） | `call` | 通过（`note` 缺省为 `(none)`） |
| 10 | 缺必填 | `call` | `invalid arguments: missing required property "a"` |
| 11 | 类型不符 | `call` | `invalid arguments: "a" must be a number` |
| 12 | 未知工具名 | `call` | 报错并列出可用工具 |
| 13 | 多工具未指定 tool | `call` | `能力 cap-multi 有多个工具（…），请用 tool 指定其一` |
| 14 | 未加载能力 | `call` | 结构化 JSON，`reason:"not-loaded"` + `loaded` 列表 |
| 15 | execute 抛错 | `call` | `Error: deliberate-explosion`（会话不崩，能力仍在位） |
| 16 | reload 生效 | `reload`+`path` | 返回 `新代码已生效，旧代已收口`，返回值出现 `V2-` 前缀 |
| 17 | reload 失败保护 | `reload`（坏语法） | `更新失败，**已保留旧代**`；随后调用仍返回 V2 正确值 |
| 18 | 参数方言闸门 | `load`（根 type:'object'） | 拒绝：`unsupported JSON schema: parameters.type must be a value schema object` |
| 19 | output schema 闸门 | `load`（schema 级 required） | 拒绝：`unsupported JSON schema: schema.required is not supported by the value schema DSL` |
| 20 | 0 工具能力 | `load` | 拒绝：`没有注册任何工具（无可热载能力）` |
| 21 | 同名能力重复 load | `load` | 幂等：`它此前已加载，本次未重复注册` |
| 22 | 跨能力工具重名 | `load`+`call` | 允许；**按能力隔离**（各自执行自己的实现），卸载互不影响 |
| 23 | 卸载未加载能力 | `unload` | `能力 cap-never-existed 当前未加载`（非错误） |
| 24 | 路径不存在 | `load` | `Cannot find module '…/does_not_exist.mjs' imported from …/lib/hotplug.js` |
| 25 | agent/pre-step 事件 | 注册后观测全回合 | **从未触发**（仅 `prestep:handler-registered`，0 次 FIRED）→ 与文档一致 |
| 26 | 能力目录 | `preset_catalog_get` | 返回 22 项能力 + 6 个预设；`missingBundles` 2 项 |
| 27 | 组合器 dryRun | `preset_compose{dryRun:true}` | 6 阶段 lint 全跑、0 error、不落盘、id 自动推断且 `identity.sources` 标注 `inferred/declared` |

注册表语义补充：`ctx.tools.register` 返回 disposer；`unload` 后该能力所有工具在会话内消失，`status` 为空。

## 二、发现（按严重度）

### F1 ❌ `reload` 不能只给 capability（与契约示例不符）
- 契约写 `hotplug_call({ op:'reload', capability:'my-cap' })`。
- 实测：`hotplug: spec 必须给 package / packagePath / handler 之一` → 必须**再传一次 `path`**。
- 影响：按文档照抄的代码会失败（虽然报错明确、且旧代安全保留）。
- 定性：文档/实现不一致（非数据损坏风险）。

### F2 ⚠️ "不能 import 裸包名"表述过宽（边界测错）
- 实测 A：`import ts from 'typescript'`（存在于 `/home/h/genshin-ts/node_modules`）→ **加载成功且可执行**（返回 `typeof ts.version` = `string`）。
- 实测 B：`import { TokenUsage } from 'dsh-llm'` → `Cannot find package 'dsh-llm' imported from …`。
- 真实规则：**harness 内部包不在插件解析链上**；工作区 `node_modules` 里能解析到的包是可用的。
- 影响：把"不能 import 任何裸包名"当铁律会白白放弃正常依赖；反之以为 harness 包能用会在 load 时才炸。

### F3 ⚠️ `render` 在热载转发路径上不生效
- 夹具 `hp_render_probe` 在 `render()` 内写标记 + 返回 `RENDERED<…>` 文本；经 `hotplug_call` 调用后：
  - 标记文件**没有** render 记录 → `render` 未被调用；
  - 返回给调用方的是**原始返回值对象** `{"tag":"probe-1"}`。
- 含义：`render` 是给"真正进入模型工具面"的调用路径用的；热载 `call` 转发走的是原始值。

### F4 ⚠️ `output.schema` 不做返回值校验
- `hp_bad_return` 声明 `{type:'string'}` 却返回 `42` → 原样透出 `42`，无任何告警。
- 含义：`output.schema` 目前只用于声明/渲染，**不是**运行时约束。想在插件里保证契约得自己校验。

### F5 ⚠️ 两个报错信息不友好 / 未在契约里写
- `required: false` 会被拒：`unsupported JSON schema: parameters.note.required must be true when present`。→ 可选参数的正确写法是**省略 required**，契约没写这一条（我按常识写 `false` 直接踩中）。
- 缺 `output` 的报错是内部 TypeError：`Cannot read properties of undefined (reading 'render')` —— 闸门有效（fail closed）但不是给人看的。

### F6 ℹ️ `ctx` 是服务容器，自有属性枚举不全（取证纪律）
- `Object.getOwnPropertyNames` 链上只能看到：`baseUrl, events, extend, fiber, intercept, isolate, logger, reflect, registry, root`。
- 但 `ctx.tools` / `ctx.on` / `ctx.effect` **都可用**（已跑通）。
- `config` 实测含：`capability`(string)、`defineTool`(function)、`hotplug`(true)、**`inject`(function)**。
- 教训：**"枚举不到" ≠ "不存在"**——与仓库既有的取证纪律一致；别用属性枚举去断言 API 面。

### F7 ℹ️ 未观测到「⟨preset-composer·热载⟩」通知
- `hotplug_call` 工具描述称"各能力的参数结构见对话中最近一条通知"；本次共加载 6 个能力，上下文中**未出现**该通知段。
- 待确认（可能是本 build 未实现，或仅在特定条件下注入）。

## 三、明确未验证（不做才安全）

- **`config.inject(text)` 未测**：文档明确警告——在 assistant 消息的多个 tool_call 之间插入消息会触发 provider 拒绝整轮（`INVALID_ASSISTANT_MESSAGE` 类硬形状），**拒绝在活会话里做破坏性验证**。要说它"能用"必须换一个可弃会话专门测。
- **UI 半边 / 构建期客户端半边**未测（需要页面 fiber，超出会话级热载）。
- **卸载后 agent 事件处理器是否真的被摘掉**：因 F25（pre-step 根本不触发），无法观测，只能验到"注册返回 disposer"。

## 四、复现方式

```bash
# 夹具在 work/hotplug-selftest/，逐个用 hotplug_call 加载即可：
#   op=load   { capability, path }
#   op=call   { capability, tool?, args }
#   op=reload { capability, path }
#   op=unload { capability }
#   op=status
cat work/hotplug-selftest/lifecycle.log   # 观察 apply/call/render/dispose 各钩子是否触发
```
