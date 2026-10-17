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

## 3bis. 身份协议与 F4（2026-10-17 identity-gate 落地）

写动作（`click`/`key`）三件套，缺一即拒：
```json
{"act":"click",
 "target":{"desc":"…人读描述…","must_assert":{"text":"存档卡 fighting"},"role":"button","name":"开始游戏"},
 "evidence":{"fresh":true}}
```
- 执行顺序**固定**：身份 → 定位 → 动作 → 同一对象读回 → 证据新鲜度 ⇒ 「没有身份的动作」在结构上到不了桌面。
- `must_assert` 两条通道：`{"text":…}`（文字）/ `{"state":…}`（判据·模板）。**会改屏的动作必须用文字通道**，模板通道只用于「动作不该换屏」。
- 退出码：lint 缺字段 **2**；执行期缺字段/`must_assert` 不可解析 `IDENTITY-MISSING` **3**；对象不符 `OBJECT-MISMATCH step#N 期望对象「X」/实测对象「Y」（desc/must_assert/通道/时点）` **4**；证据拿不出 sha `EVIDENCE-STALE` **3**（不执行）。
- **≤10s 是结构保证**：动作前后两次身份读**共用** `ctx.max_wait_ms` 一个预算（实测 4000ms 夹取 + 3s 慢判据 ⇒ 4002ms 停）。

## 3ter. 退出码的跨工具政策（Lead 裁决 2026-10-17）

**认 token，不认码表**：不同工具的基座不同（AT-SPI/桩树 vs OCR+指针闭环），码表无法统一；
契约只要求**每个失败都打一行可 grep 的 token**：
- `tools/gui`：`IDENTITY-MISSING` / `OBJECT-MISMATCH`(4) / `EVIDENCE-STALE`
- `ys-pointer-click`/`ys-find --resolve`：`RESOLVE-FAIL`(4，候选=0 或候选不唯一) / `ASSERT-FALSE`(5，回读不符)
- `ys-slot-check`：`LINT-RESULT`(rc=3)、`ABS-STALE`/`CLIP-NO-DISPLAY`/`SELFKILL`
- `failure-ledger`：`LEDGER-RESULT`；注入用例：`INJECT-PASS`/`INJECT-FAIL`

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

### 路径：**必须写对**（2026-10-17 22:0x 更正，原结论作废）

**原结论（作废）**：「槽内文件系统与槽外不同，绝对路径不存在，槽内必须用 `./`」。
**真因**：命令里写的 `/home/genshin-ts` **漏了 `/h`**（仓库实际在 `/home/h/genshin-ts`）——
该路径在**槽内外都** ENOENT；`stat /home/h/genshin-ts` 与 `stat .` 在槽内外 dev:inode **完全相同**（`49:2794949`）。

**证据（可复现）**：
```bash
stat -c '%d:%i' /home/genshin-ts        # 槽内外都：没有那个文件或目录
stat -c '%d:%i' /home/h/genshin-ts      # 槽内外都：49:2794949（= cwd 的 dev:inode）
```
**教训（比结论更重要）**：rc=127 的报错文本 `timeout: 无法运行命令 "/home/genshin-ts/.../python"` **当场就写着错误路径**，
我只看了退出码没读消息，就把它归因成"环境差异"并写进契约与技能——这是典型的 **归因错误**（失败账本 F-2-09）。

**现行口径**：
- 绝对路径**可用**，但**用前必须解析**（`ys-slot-check --lint '<cmd>'` 会做 ABS-STALE 检查：路径不存在 / 过期写法）。
- 槽内**优先** `./` 相对路径（不是必须）：少一次解析、且不受 cwd 变更影响。
- 任何 rc≠0 先读**消息文本**再归因；消息里出现的路径要逐字核对。

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

### 4bis. 证据重算第 ⑥ 项：帧新鲜度（identity-gate 落地）

`--replay` 除原有五项外新增 ⑥：**无 sha / 无 captured_at / sha 与落盘文件不符 ⇒ ERROR(2)**（既不是 PASS 也不是 DIFF）。
- `tools/gui` 写 run.json：每张帧旁 `frame_meta{path,sha256,bytes,captured_at}`，顶层 `frames_meta`；文字证据 `artifact{kind:text,sha256,captured_at}`。
- `round-report --emit-round`：给引用帧补 `frames_meta`（执行器给了真 `captured_at` 就保留，只补缺的）。
- 成因追溯：`judge_state` 原本在活体（`frame=None`）时把 ys-state 回报的**实际帧路径丢掉** —— 正是复盘 §7 #7「旧帧当验证帧」的成因，已修。

### 4ter. 动作时解析（action-resolver 落地，2026-10-17）

`ys-pointer-click --text/--target/--anchor + --offset/--dry-run/--assert-name/--assert-roi`；解析实现**只此一处**（`ys-find --resolve`），OCR 缓存内容寻址。
- 名字匹配 = **NFKC + 去空白 + casefold 全等**，不做模糊（「输入探针」≠「输入探针v2」）。
- 消歧只认语义：`--scope`（区域先验）/ `--anchor + --offset`（身份 + 行内相对几何）——**拒绝"离谁最近"这类隐式启发式**。
- `--frame` **隐含 --dry-run**：给离线帧就绝不注入/抓屏/进槽/抢焦点。
- 回读断言**默认锚在点击点**（±120px 或 `--assert-roi`），`--assert-strict` 还要求"点前该区域没有同名"。
- **不提供 `--click-at x,y`（裸坐标+校验）**——那等于鼓励"先点后查"，Lead 裁决不开口子；旧坐标用法保留仅为向后兼容。
