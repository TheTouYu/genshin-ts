# Tetris v6 重构 · 交接（2026-10-31 22:00 更新）

> 读者：接手下一轮重构的代理。规范见 `docs/ARCH.md`（含 §10–§14 的硬约束），这里是**当前状态与断点**。
> 上一版留档：`refactor-progress.prev.md`。

## 0. 一句话

分层骨架已完成并在真实引擎验证；**6 个屏全部纯描述化**；`main.lua` 6859 → **5705 行**；headless 26 文件 / ~1400 断言 0.01s；模拟器全量 **72/72**。

## 1. 当前读数（2026-10-31 22:00，可复算）

| 项 | 值 | 命令 |
|---|---|---|
| `main.lua` | **5705 行**，locals **145/200** | `wc -l`；`node qxqy/build.mjs` 输出 |
| `roster.lua` | 332 行（原 581） | — |
| Lua 模块数 | **38** 个（`lua/tetris/*.lua`） | `ls lua/tetris/*.lua \| wc -l` |
| headless 单测 | **26 文件全绿 / 0.01s** | `lua5.3 tests-lua/run_all.lua` |
| 用例重放 | **71/72 · ~6s**（唯一红=既有 57，Lua 整数位宽） | `lua5.3 tests-lua/run_cases.lua` |
| 模拟器全量 | **72/72 · 300–480s** | `node qxqy/runner.mjs` |
| 出图 | 30 张 · 0 阻塞 · `fits=false` 0 · 覆盖屏透出 0 | `node qxqy/shots-v5.mjs --all --out <dir>` |
| 框架副本一致性 | OK（7 模块逐字节相同） | `bash frameworks/qxqy-ui/sync-check.sh` |

## 2. 已完成的架构分层

| 层 | 模块 | 状态 |
|---|---|---|
| 纯逻辑 | `core_rng/pieces/board/state/ai/skills/skills_catalog/progress/roster/takeover/effects`（11 个） | ✅ 与生产实现对拍到 1400+ 断言 |
| 平台 | `platform`（real/mock 双后端 + 全工程实例台账 `P.liveCount`） | ✅ |
| 视图 | `view_layers/view_node(L1–L6 lint)/render/scenes/app/view_kit` + 屏描述 `view_board/kit/hud/pad/preview/settle/help/title/roster` | ✅ 6 屏纯描述 |
| 输入 | `input_map`（22 动作/47 键/1 份注册源） | ✅ |
| 模板 | `templates`（探测 + `M.DEGRADE` 降级契约，19 断言） | ✅ |

## 3. 剩余工作（按摸底报告顺序，`main.lua` 内）

| # | 内容 | 规模 | 风险 | 判据 |
|---|---|---|---|---|
| 1 | `act()` 穿参，并掉最后 1 处键名字面量（`main.lua:4920`） | 小 | 中（3 个调用点） | `grep -c Keyboard main.lua` → 5（全是注释） |
| 2 | 44 处 `TPL_*` → `TEMPLATES.*`，删 3 别名 | 中（20+ 函数） | 中 | locals **145 → 142** |
| 3 | `OnUpdate`（~247 行）抽纯计算 | 大 | **高**（每帧路径） | 必须先做**逐帧快照对拍** |
| 4 | `OnStart` 其余段（动作体/结算动作/设备适配/背景池） | 大 | 高 | 见 `onstart-map.md` 的"不能抽"六条 |
| 5 | **场景栈进生产**：6 屏目前各自持独立 render 实例，未走 `scenes`/`app` | 中 | 中 | 覆盖屏开关行为不变 + 出图 0 回归 |
| 6 | 真机核验（`SetImage` 圆角 / 悬停音效 / 层序） | — | — | 需用户确认后跑 `device-playtest-loop` |

## 4. 每次收尾的固定动作

```bash
cd workspace/tetris
node qxqy/build.mjs            # exit 0 + locals 读数
lua5.3 tests-lua/run_all.lua   # 26/26
lua5.3 tests-lua/run_cases.lua # 71/72（红 57 是既定）
node qxqy/runner.mjs           # 72/72（约 5–8 分钟，后台跑）
node qxqy/shots-v5.mjs --all --out .scratch/lead/shots/<tag>   # 30 张 + 人眼看
bash frameworks/qxqy-ui/sync-check.sh                          # 框架副本一致
```

**透出扫描（必须用 text 判，不能用 visible——帧里没有 visible）**：
```python
import json,glob
for p in glob.glob('.scratch/lead/shots/<tag>/*/*.frame.json'):
    scr=p.split('/')[-1].split('.')[0]
    if scr not in ('settle','roster','help','title'): continue
    n=json.load(open(p)).get('nodes') or []
    for x in n:
        if str(x.get('name') or '').startswith('sk') and x.get('text') in ('纳西妲','刻晴','甘雨','少女'):
            print('LEAK', p, x.get('name'))
```

## 5. 六条"不能抽"（来自 `onstart-map.md`，别硬来）

`TPL_*` 探测（已抽成模块，但别名暂留）、背景池+wash（**创建顺序即层序**）、`act/routePlayer/coopAllowed`（三闭包互调）、`SETTLE_ACT.*`、`UI4.*` 导航回调（输入派发契约面）、`OnUpdate` 渲染驱动段（与 tickInstance 同帧耦合）。

## 6. 硬约束速查（踩过的，别再犯）

- 日志字面量是测试契约（154 条去重 `contains`）；改文案=改契约。
- **不 build 跑 runner = 假绿**（runner 读存档里的 Lua 副本）。
- **删表前按表名全量 grep**，别按用法模式（漏过字符串拼接里的一处）。
- **删整段实现要复查函数出口值**（`M.new` 的 `return true` 被一起删过）。
- 服务端 textbox **压在运行时实例之上**（ARCH §12）；文字两套载体（§13）；遮罩期间靠"实例可见 / textbox 隐藏"，不是每帧清空。
- 名单必须单源（§14）：新增文字控件只改 `HUD_TEXT` 一行。
- 同一函数别并列两条同义 guard（§12）；探针打在 guard 内部。
- 覆盖屏用**独立 render 实例** + 先 `clear()` 再 `apply()`（§10）。
- 加临时的单节点用 `R.spawn/despawn`，**不要重 apply 整屏**（会重置没写进描述的状态）。
