# Tetris v6 重构 · 交接（2026-11-02 14:10 更新）

> 读者：接手下一轮重构的代理。规范见 `docs/ARCH.md`（§10–§14 是硬约束）。
> 上一版留档：`refactor-progress.prev.md`。

## 0. 一句话

分层骨架已完成并在真实引擎验证；**6 个屏全部纯描述化**；`main.lua` 6859 → **5700 行**；
**一条命令可验收**：`bash qxqy/tetris-guard.sh`。

## 1. 最重要的：怎么验收（别手工跑一堆命令）

```bash
cd workspace/tetris
bash qxqy/tetris-guard.sh            # 完整（约 6 分钟，含模拟器全量）
bash qxqy/tetris-guard.sh --fast     # 快（约 1 分钟，跳过模拟器）
bash qxqy/tetris-guard.sh --selftest # 验证闸门自己不是空转（注入故障必须红）
```
**退出码 0 = 可交付。** 9 条闸门各自对应一次真实事故，别删（见脚本内注释）。
闸门 9（2026-11-02 新增）= **网页工作区存档必须与仓库逐字节相同 + 版本号单一真源**，
对应两次真实事故：①只重建没同步 `~/qxqy-workspace`（用户在网页核验的是旧版）；
②`deploy.mjs:83` 把标题写死成 `v4.0`（网页下拉一直显示旧版本，用户问「它是最新版本吗」）。
**发布流程（改完 lua 想让用户在网页看到）**：
改 `lua/main.lua` 的 `BUILD_TAG` → `node qxqy/deploy.mjs` → `bash qxqy/tetris-guard.sh --fast`。

## 2. 当前读数（2026-11-02 14:10，全部可真跑复算）

| 项 | 值 | 命令 |
|---|---|---|
| `main.lua` | **5700 行**，locals **142/200** | `wc -l`；`node qxqy/build.mjs` |
| `roster.lua` | 332 行（原 581） | — |
| `app.lua` | **203 行**（原 317，删了空转 API） | — |
| Lua 模块 | **39 个**（`lua/tetris/*.lua`） | `ls lua/tetris/*.lua \| wc -l` |
| headless 单测 | **26 文件全绿**，实测 **1824ms** | `date +%s%N` 包住 `run_all.lua` |
| 用例重放 | **73/74 · 6.5s**（红的是 57，Lua 整数位宽） | `lua5.3 tests-lua/run_cases.lua` |
| 模拟器全量 | **74/74 · ~300s** | `node qxqy/runner.mjs` |
| 出图 | 30 张 · 0 阻塞 · 透出 0 | `node qxqy/shots-v5.mjs --all --out <dir>` |

⚠️ **别再说 headless 是 0.01s**——那是 run_all 逐文件报告的各文件耗时，Wall clock 是 1.8s。

## 3. 架构分层（现状）

| 层 | 模块 | 状态 |
|---|---|---|
| 纯逻辑 | `core_rng/pieces/board/state/ai/skills/skills_catalog/progress/roster/takeover/effects` | ✅ 与生产对拍 1400+ 断言 |
| 平台 | `platform`（real/mock 双后端 + 全工程实例台账 `P.liveCount`） | ✅ |
| 视图 | `view_layers` / `view_node`(L1–L6) / `render`(apply/spawn/despawn) / `view_kit` | ✅ |
| 屏描述 | `view_board/kit/hud/pad/preview/settle/help/title/roster` | ✅ 6 屏纯描述 |
| 场景栈 | `scenes` + `app`（覆盖屏记账 + 基础层注册表） | ✅ 3 个覆盖屏在生产（help/roster/settle） |
| 输入 | `input_map`（22 动作/47 键/1 份注册源） | ✅ |
| 模板 | `templates`（探测 + `M.DEGRADE` 降级契约） | ✅ |

**`app` 的定位（重要，别搞错）**：它**不驱动渲染**。生产里 OnUpdate 的渲染调用是"状态写入的
即时观察者"，散在条件分支里，无法归口到一个 tick（详见 `app.lua` 文件头）。`app` 只负责
"谁开着"的记账与实例隔离。**别再给它加 render/tick/frame**——加过，全删了。

## 4. 剩余工作

| # | 内容 | 规模 | 风险 | 判据 |
|---|---|---|---|---|
| 1 | **真机核验**（`SetImage` 圆角 / 悬停音效 / 层序） | — | — | **需用户确认破坏性写 `.gil`**；从未跑过 |
| 2 | `OnStart` 骨架（1048 行 = 全文件 18%） | 大 | 高 | 见 `onstart-map.md` 六条"不能抽" |
| 3 | 预览/pad/标题接 `app` 记账 | 小 | 低 | 收益小（它们各自有正确的独立实例） |

## 5. 硬约束速查（踩过的，别再犯）

- 日志字面量是测试契约；改文案=改契约。
- **不 build 跑 runner = 假绿**（runner 读存档里的 Lua 副本）。
- **删表前按表名全量 grep**，别按用法模式。
- **删整段实现要复查函数出口值**。
- 服务端 textbox **压在运行时实例之上**（ARCH §12）；文字两套载体（§13）；名单必须单源（§14）。
- 同一函数别并列两条同义 guard；探针打在 guard 内部。
- 覆盖屏用**独立 render 实例** + 先 `clear()` 再 `apply()`。
- 加临时节点用 `R.spawn/despawn`，**不要重 apply 整屏**。
- **新增 API 同轮必须给出"生产在调用它"的读数**（`grep -c`），否则标 EXPERIMENTAL 或删。
- **写断言后必须做变异测试**：人为破坏被测对象，断言必须红。

## 6. 已废弃/被推翻的判断（别再走回头路）

| 曾经的判断 | 真相 |
|---|---|
| "渲染归口到 app.tick" | OnUpdate 的渲染是行内副作用，不是 phase；归口不成立 |
| "棋盘不丢有 baseStatic 保护" | baseStatic 从未被调用；真正原因是覆盖屏用独立实例 |
| "headless 0.01s" | 实测 1824ms，0.01s 是单文件耗时 |
| "第 6 份键位真源" | 收表那轮就没了，只剩 5 个键名字面量 |
| "app 有 15 个 API" | 生产只用 5 个；其余 10 个已删 |
