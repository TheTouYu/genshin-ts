# GUI 能力层验收契约 v1（2026-10-17 定稿）

> 状态：**当前实现**（本文件是并行开发的接口契约，不是设计愿景）。
> 依据：`PROMPT-next-round-v2.md` §4 + 根 `AGENTS.md`「仪器优先」五条门槛。
> 任何与本文冲突的旧口径作废。改契约定稿前必须 Lead 确认。

## 0. 五条门槛（判据不可自创）

| # | 门槛 | 通过判据（可执行） |
|---|---|---|
| ① | 判定回归 | 总样本 **≥16**，其中 **≥5 负样本**（期望 `UNKNOWN`）；两条独立通道各自 **100%** |
| ② | 假成功 | 注入 **3 类失败**，执行器 **≤10s** 停止并报「哪条断言为假 + 观测值」，退出码非 0 |
| ③ | 性能 | 写盘轮 **≤90s** / 纯试玩轮 **≤40s** / 取帧 **≤12 次** / 取焦点 **1 次** / 固定 `sleep` **0 条** |
| ④ | 证据 | 只给 `round.json` + 引用帧 + `.gia` 就能重算出结论（不需要再跑一次 GUI） |
| ⑤ | 可维护 | 界面态判定**全仓只有一处实现**（判据/阈值/状态名/投票/LOADING 只在 `ys-state`） |

## 1. 门槛⑤：`ys-state` 是唯一判定实现

- **唯一实现**：`tools/ys-editor/ys-state`。状态名、阈值、像素坐标、模板名、投票规则、
  `LOADING`/`UNKNOWN` 语义**只允许**出现在这个文件里。
- **两个测量通道**（独立取数、共用判定函数 —— 门槛①的两条通道就是这两条）：
  - `fast`：ROI 像素判据 + GPU 锚点（`ys-lookd`，unix socket `/run/user/1000/ys-lookd.sock`），目标 **<150ms**
  - `full`：全帧模板匹配 + 多判据投票（现状实现），正确性基准
- **下游只许调用**（CLI 契约，改它要 Lead 确认）：

```bash
ys-state --json                    # 活体（经 ys-observe，带新鲜度证明；不新鲜=报错不给旧值）
ys-state --json --frame PNG        # 离线帧（回归用）
ys-state --json --fast             # fast 通道（ROI 像素 + GPU 锚点，<150ms）
ys-state --json --fast --profile P # 指定锚点 profile（缺省 .scratch/gui-profiles/qianxing.json）
ys-state --json --channel full     # full 通道（缺省）
ys-state --print-state [--fast]    # 只打印态名（shell 调用方用）
ys-state --regress [--channel fast|full|both] [--json]
```

```jsonc
// --json 输出（新增字段只增不改）
{"state":"SAVELIST","channel":"fast","confidence":0.94,"ambiguous":false,"margin":0.63,
 "readings":{"<判据名>":{"value":"...","passed":true,"kind":"pixel|template|anchor"}},
 "verdicts":{"LOADING":false},"ms":353,"frame":"/tmp/...","fresh":{"atop":true,"ts":0,"sha":"..."}}
```
- 状态全集：`EDITOR MENU SAVELIST PLAYTEST PAUSE SETTLE LOADING UNKNOWN`
- 向后兼容：`--print-state --compat ys-fast` 输出 `MENU|SAVE|EDITOR`（`SAVE`=`SAVELIST`）
- 退出码：`0` 判定成功 / `2` AMBIGUOUS / `3` 取帧失败 / `4` UNKNOWN / `5` 回归有失败项

## 2. 门槛①：回归集格式

`tools/ys-editor/calib/regress/manifest.tsv`（TAB 分隔，`#` 注释）：

```
文件名<TAB>期望态<TAB>说明
```
- 期望态 ∈ 8 个状态全集；**`UNKNOWN` = 负样本**（该帧不属于任何已知态，判成任何态都算失败）
- 负样本三类来源（必须真实出处，不许造）：① 过渡态（LOADING/半透明/黑屏）；② 抓帧失败态
  （`import -window root` 的缩放帧 780×439、0 字节黑帧）；③ 非目标应用（浏览器/终端/桌面）
- 计数口径：`ys-state --regress` 必须打印 `总数 / 负样本数 / 每通道通过率`；
  低于 16 或负样本 <5 → 退出码 5 并明说差多少

## 3. 门槛②：假成功注入（执行器侧）

执行器 = `tools/gui run`（技能执行）与 `tools/ys-editor/ys-round`（轮执行）。三类注入失败：

| 类 | 注入方式 | 期望 |
|---|---|---|
| F1 断言为假 | 期望 `state=PLAYTEST`，实际 `SAVELIST` | ≤10s 停，`ASSERT-FALSE step#N expected=… observed=…`，退出码 3 |
| F2 目标解析失败 | click `{role:button,name:不存在}` | ≤10s 停，`RESOLVE-FAIL step#N target=… 候选=0`，退出码 4 |
| F3 动作无效果 | 动作成功但后置断言恒假 | ≤10s 停，`NO-EFFECT step#N post=… observed序列=…`，退出码 3 |

共同硬约束：**单步等待上限 ≤10s**（缺省 8s）；**报告必须含步骤号 + 断言原文 + 观测值**；
**任何失败不得以退出码 0 结束**；**证据写进 `run.json`**（每步 `{act, target, ok, observed, ms}`）。

## 4. 门槛③④：一轮的产物与预算

- `round.json`（唯一证据入口）：`{round_id, started_at, budget:{frames,focus,sleeps}, steps:[…],
  readings:{…}, log:{path,markers:[…]}, gil:{path,sha_before,sha_after}, frames:[…]}`。
- **引用帧**：每步引用 ≤1 张 PNG（路径写进 `round.json`），不重复存。
- **重算**：`tools/round-report --replay <round.json目录>` 只用落盘物重算结论（不许再抓帧）。
- 预算计数由执行器自己统计并写进 `round.json.budget`，超预算即算门槛③失败。

## 5. 环境事实（别再重新发现）

- `DISPLAY=:1`；`XAUTHORITY` 每次会话随机名 → **一律覆盖**读自 `tools/ys-editor/ys-env.sh`
  （`setdefault` 会被空字符串挡住，`import` 静默返回 0 字节）。
- 游戏窗 `0x01400001`（十进制 20971521），2561×1440 @ (0,0)。
- 共享桌面：任何注入/焦点/截图轮询**必须**经 `tools/ys-editor/ys-gui-slot <win> <max秒> <cmd…>`。
- 只在离线帧/离线测试里跑判据的工具**不需要**占槽；**碰活体桌面的都要占槽**。

## 6. 附则：具名探针注册表（门槛⑤的收敛落点，2026-10-17 增补）

现状实测：除 `ys-state` 外，`tools/` 下还有 **10 个文件**内联着像素/控件判据字面量
（`_ys-ui.sh`、`ys-playtest-start`、`ys-playtest-stop`、`ys-round`、`ys-nav`、`ys-switch-save`、
`ys-ui-state`、`ys-fast`、`ys-where`、`ys-where2`）。收敛办法 = **把判据升级成"具名探针"，
坐标与阈值只留在 `ys-state` 里**，调用方只写探针名。

```bash
ys-state --probe <名字> --json        # {probe, visible:bool, readings:{…}, ms}
ys-state --probes                     # 列出全部具名探针 + 每条判据数（每探针 ≥2 判据）
ys-state --wait <名字> --expect visible|hidden --timeout N --poll 0.2   # 谓词等待：0 成立 / 1 超时
```

| 探针名 | 语义 | 现状出处（要被替换掉的判据） |
|---|---|---|
| `menu_open` | 编辑器系统菜单打开 | `ys-round` 的 `M()`：`judge 300 300` 三通道 >200 |
| `save_page` | 存档选择页 | `ys-fast`/`ys-ui-state` 的 `px(300,300)` 暗 + `px(100,400)` 暗 |
| `editor` | 编辑器主界面 | `ys-fast` 的「其余」分支（草绿 72,92,60） |
| `tile_visible` | 试玩磁贴可见 | `ys-playtest-start` 的 `is_light 185 320` |
| `bake_dialog` | 烘焙网格体弹窗 | `ys-playtest-start` 的 `is_dark 1000 600` |
| `playtest_options` | 试玩选项弹窗 | `ys-playtest-start` 的 `is_dark 900 400` |
| `pause_menu` | 试玩暂停菜单 | `ys-playtest-stop` 的 `wait_light 1280 880` |
| `settle_leave` | 结算页「离开」按钮 | `ys-playtest-stop` 的 `wait_light 1833 1365` |

**判据数越少越危险**：单像素判据在动效/加载页上会误判（历史实证：加载页浅蓝 70,164,229 被判成 MENU）。
每个探针至少两条独立判据（像素块 + 锚点/形状），`--probes` 必须打印每条探针的判据数。

## 7. 附则：自测脚本给机器的结果行（门禁②④的取数契约）

`ys-gates` 只认**一行**机读结果，自测脚本末尾必须打印它（人读部分照旧）：

```
GATE2-RESULT f1=<ms>:<exit> f2=<ms>:<exit> f3=<ms>:<exit> verdict=PASS|FAIL
GATE4-RESULT pass=<n> diff=<n> error=<n> verdict=PASS|FAIL
```

缺这一行 → `ys-gates` 该门槛判 BLOCKED 并写「自测未给机读结果行」。

## 8. 附则：门槛⑥（操作目录）与三通道定位（2026-10-17 增补）

AGI 标准下"能完成编辑器全部操作"需要**分母**，否则只能按踩过的坑长技能。故新增两条基建：

1. **catalog**（`docs/maintenance/gui-catalog/`，生成器 `tools/gui-catalog`）：把指南散文机械抽成
   一条一个操作、带**逐字原文引用 + 行号**（`verify` 逐行 grep -F 验真，352/352 命中）。
   状态机 `待测 → 可定位 → 可执行 → 可验证`（另一终态 `非操作`），**只有实测能升档**，
   证据进 `measurements.tsv`；`tools/ys-gates --only 6` 强制"有状态必须有台账、台账状态必须一致"。
2. **三通道定位**（`tools/ys-find` + `tools/ys-editor/ys_ocr.py`）：`text`(RapidOCR/云端 VL) /
   `icon`(NCC 模板) / `struct`(AT-SPI `cu find`) 并列给候选，**一致才判找到**（阈值 `--tol`，缺省 30px）。
   实测：pause 帧两通道对同一控件分别落到 (1301,558)/(1280,558) 与 (1303,878)/(1280,877)，
   与真机实测点击点差 21/23px → `agree`；通道读数与局限见 `docs/maintenance/gui-catalog/channels.md`。

门槛⑥的 PASS 判据（机械）：catalog 存在且 ≥100 条、quote 原文验真 100%、必填字段无缺失、
小节台账行数 = 指南 `### ` 小节数且 0 操作小节都有原因；**覆盖率百分比只报数字，阈值由用户定**。
