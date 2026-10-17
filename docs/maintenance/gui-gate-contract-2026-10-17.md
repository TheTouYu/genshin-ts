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

## 9. 附则：ys-state 完整对外 CLI 面（2026-10-17 增补，写回时照此对齐）

```bash
ys-state --json [--fast] [--channel fast|full|both] [--frame PNG] [--profile P]   # 判态
ys-state --print-state [--fast] [--compat ys-fast]                               # 只打状态名给脚本
ys-state --regress [--channel fast|full|both] [--json]                           # 回归集（19 帧含 8 负样本）
ys-state --probe <名字> [--frame PNG] [--json]      # {probe,visible,readings,criteria,passed_criteria,ms,desc,rule,validated}
ys-state --probes [--json]                          # 每探针 {probe,desc,rule,criteria,validated}；判据<2 条 → exit 1
ys-state --wait <名字> --expect visible|hidden --timeout N --poll P [--frame PNG] [--json]  # 0 达成/1 超时/3 错
ys-state --pixel X Y [--frame PNG]                  # "r g b"（_ys-ui.sh 的 judge 转发它）
ys-state --pred light|dark X Y [--frame PNG]        # 1/0（is_light/is_dark 转发它）
```

- 退出码：判态 0 / 2 参数或 profile 错 / 3 取数失败 / 4 回归不达标 / 5 样本清单不达标；探针 0 可见 / 1 不可见 / 3 取数失败；wait 0 达成 / 1 超时 / 3 错。
- 探针别名：`settle_leave_btn` → `settle_leave`（旧名兼容）。
- 环境变量：`YS_STATE_LOCAL=1`（强制本地，不走常驻）、`YS_PROFILE`、`YS_LOOKD_SOCK`、`YS_PROBE_FRAME`（`_ys-ui.sh` 给探针传离线帧）。
- JSON 新增：`via:"daemon"|"local"`（判态与探针都有）、`load_ms`/`judge_ms`（成本分解）。

### 两条硬约束（2026-10-17 活体实测踩到）

1. **抓帧必须用窗口真实 geometry**：原神窗是 **2561×1440**（不是 2560）。daemon 按 2560 建缓冲会抛
   `RuntimeError: 截取失败 (11059200 != 11063520)`（11059200=2560×1440×3、11063520=2561×1440×3），
   随后 CLI 静默回退本地（581~618ms，慢 4 倍）。
2. **回退必须出声**：`via:"local"` 只是字段，脚本不会看；daemon 不可用/报错时**必须往 stderr 打一行**
   带 daemon 错误原文的警告（铁律「仪器出错要出声」，见 D310）。`ms=0` 这类读数也要标明来源
   （缓存命中 / 未真判），不能拿 0 冒充"很快"。

## 10. 附则：延迟口径裁决 + 抓帧方式实测（2026-10-17 活体裁决）

**150ms 属于哪个口径**（不要再混用）：

| 口径 | 目标 | 实测 | 说明 |
|---|---|---|---|
| fast 通道**离线 replay**（给定 PNG） | p95 ≤150ms | 142ms（同帧 warm，daemon 内部 71ms） | 用于回归/审计/等待 |
| fast 通道**活体**（每次真抓帧） | p95 ≤300ms（临时预算） | 259ms（抓帧 138 + 判据 66 + 进程 ~55） | 大头是抓帧 I/O，不是判据 |
| 单轮性能（真正的门禁） | 见门槛③：写盘轮 ≤90s / 试玩轮 ≤40s / 帧≤12 / 焦点 1 / sleep 0 | 待真实轮 | **单次判态延迟不是验收指标** |

**抓帧方式实测（2026-10-17 受控槽，只读）**：
- `import -window root -depth 8 rgb:-` → **0 字节（失败）**，17ms。⇒ D342 里 root 9~18ms 的读数在本环境**复现不了**，此路关闭，别再投入。
- `import -window 0x01400001 -depth 8 rgb:-` → 11059200 字节（= 2560×1440×3，正确），**91ms**。
- 结论：**抓帧只能走窗口，且必须用判据坐标系 2560×1440**（窗口 geometry 是 2561×1440，按它申请会少回 1 列 → 尺寸断言失败）。
- 下一步优化方向：fast 通道只需要锚点/探针的 ROI，**按 ROI 并集裁剪抓取**（`-crop WxH+X+Y`），目标活体 p95 ≤150ms。

**阈值变更的纪律**：任何判据阈值调整必须同时给出**标定三件套**（本态最差命中 / 异态最高命中 / 余量）并跑回归；
2026-10-17 实例：`save-card-title` 模板 0.90→0.85，本态最差 0.861、异态最高 0.805、余量 0.056，
且异态帧的 `SAVELIST/A` 像素判据同时不过（AND 双保险）。四个数字必须用注释钉在阈值旁。

## 11. 附则：注入原语实测 + 抓帧成本曲线 + 帧复用（2026-10-17 受控槽实录）

### 注入原语（占槽内实测，每次 ≤3s，全部用 `timeout` 包裹）

| 原语 | 读数 | 结论 |
|---|---|---|
| `timeout 3 xdotool key --clearmodifiers Escape` | rc=0，`EDITOR → MENU`（ys-state 观测到） | **首选**：动作与状态变化都被观测到，端到端可用 |
| `timeout 3 ydotool key 1:1` + `1:0` | rc=0，`MENU → EDITOR` | 有效，但需 daemon/环境；**不要裸调不包 timeout** |
| `ys-esc`（封装：裸 ydotool + `sleep 0.12` + `sleep 2`） | **在槽内挂住**，把整步拖到 15s 上限，无任何后置读数 | **脚本禁用**：无硬超时的复合封装 = 小步验证的头号杀手 |
| 状态导航事实 | `SAVELIST` 态按一次 ESC → **EDITOR**（不是 MENU） | 导航用它，别拿它当"开菜单" |
| `ys-state --wait menu_open --expect visible` | 菜单已关时 rc=1（超时） | 语义正确：不可见就报超时，不假绿 |

**纪律**：受控槽里每一步的每个外部命令都必须 `timeout N` 包裹，并且**每步只测一个变量**；复合封装要么自带硬超时，要么不进槽。

### 抓帧成本-面积曲线（`import -window <win> -depth 8 rgb:-`，各 5 次中位）

| 区域 | 尺寸 | 字节 | 耗时 |
|---|---|---|---|
| 全帧 | 2560×1440 | 11,059,200 | 104ms |
| fast ROI 并集 | 1401×1440（54.7%） | 6,052,320 | 88ms |
| 锚点 bbox | 880×1440 | 3,801,600 | 83ms |
| 单锚点 | 496×496 | 738,048 | 67ms |
| 探针 | 213×80 | 51,120 | 62ms |

⇒ **固定开销约 60ms**（进程 + X11 往返），面积只解释剩下 ~40ms。故 `150 − 60(抓帧地板) − 51(判据) − ~45(CLI 启动) < 0`：
**150ms 活体不可达，除非换常驻 X 连接（需新依赖，已否决）**。活体预算维持 p95 ≤300ms（实测 ROI 裁剪后 209ms）。
降低"判态总成本"的正道是**减少次数**：`--max-age-ms` 帧复用窗口（同一动作后的连续判态复用最近一帧），JSON 必须给 `reused`/`frame_age_ms`。

### 读数的可信度信号

`judge_ms == 0` = 判据被跳过（几何校验把你判成缩放帧之类），**不是"判得很快"**。加任何新裁剪/新坐标系后第一件事就是看这个字段。

## 12. 附则：受控槽内的环境边界与输入通道实测（2026-10-17 亲测，会反复踩）

### 槽内文件系统：**绝对路径不存在，必须用 `./` 相对路径**
在 `ys-gui-slot` 内执行 `stat /home/genshin-ts` → **ENOENT**（`ls /home` 只有 `h`、`h2`），
而 `pwd` 显示 `/home/genshin-ts`、`stat .` 正常 ⇒ **cwd 可用，绝对路径不可用**。
后果：槽内用绝对路径调 venv python `/home/genshin-ts/.scratch/...` → `timeout: 无法运行命令` **rc=127 静默失败**（我因此白跑了两轮）。
⇒ **槽内一切路径写 `./tools/...`、`./.scratch/...`**。槽外再切回绝对路径无所谓。

### 剪贴板（中文输入的唯一可靠通道）
- `xdotool type --clearmodifiers '云阶'` → 输入框出现 **`??`**（Unicode keysym 不被 Wine/XWayland 接受）。
- `printf '云阶' | xclip -selection clipboard -loops 1 &` → **粘贴拿不到数据**（`-loops 1` 在第一次读取请求后就退出）。
- **可用做法**：`( printf '云阶' | xclip -selection clipboard >/dev/null 2>&1 & )` 常驻后台 → `xdotool key --clearmodifiers ctrl+v` → 粘贴成功（OCR score 1.00）；用完 `pkill -x xclip`。
- 反面教材：在**槽外**设剪贴板（无 DISPLAY/XAUTHORITY）会静默失败，粘贴进去的是**原有剪贴板内容**（实测粘进了我自己的聊天文本）。

### 进程清理
`pkill -f "xclip -selection clipboard"` 会**匹配到发起它的那条 bash 命令行自身**（自匹配误杀，AGENTS 早有记载）；用 `pkill -x xclip`。

### 界面事实
- 窗口标题是 `原神`（`xprop _NET_WM_NAME`），**不是**存档名 —— 身份不能从窗口标题读。
- EDITOR 页左上角被 **DXVK 性能叠加层**（DXVK v3.0 / FPS / GPU）遮住，本地 OCR 与云端 OCR 都读不到存档名。
- 存档名 + **圆形铅笔图标**在 **ESC 后的系统菜单页**左上角（2026-10-17 实测中心 **(523,96)**）；点击后是**内联输入框且文字全选**（不是弹窗）；Enter 提交，ESC 取消并还原。
- 写操作协议：**动作前身份断言（OCR 标题/确认框原文）→ 动作 → 动作后在同一对象上读回**（存档列表卡片名 + 菜单标题双证据）。
