---
name: gui-world-state
description: GUI 世界状态模块（感知层）的入口——用 `.scratch/gui-service/worldsvc.py` 的 look/act/wait 三动词与 `ys-lookd cmd=world` 读「状态 / 对象 / 结构 / 文本」，在真机里完成「看清在哪 → 找到对象 → 动作 → 复验」。当任务涉及：读界面状态、判断当前在哪个界面（含原神本体的派蒙菜单/好友/角色/活动页）、按文字找可点对象、验证动作是否真的生效、黑屏或空白帧、窗口在别的虚拟桌面、或要给 GUI 自动化加判据与防线时使用。区别于 `device-playtest-loop`（负责把真机实验跑起来：开试玩、注入、取日志、焦点归还）：本技能只管**感知与判断**这一层，不复制任何判据。
---

# GUI 世界状态（感知层）

## 0. 一句话

**「我以为」必须有模块读数支撑。** 读不到就说读不到，判不出就报 UNKNOWN，绝不用手工像素试探代替模块判断。

## 0.1 这个模块的立场（为什么它不是「点点看」）

每次判断都要能回答三个问题，缺一个就不许动：

| 问题 | 读哪里 | 答不上来时 |
|---|---|---|
| **在哪** | `state.state` + `confidence` | `UNKNOWN` / `AMBIGUOUS`（**不猜**） |
| **看到什么** | `objects.containers[] / free_text[]` | 说"没找到"，别说"没有" |
| **有多确定** | `confidence` / `ambiguous` / `degraded[]` / `settled.same_as_prev` | 降级或停手 |

- 动作返回值只说明**注入成功**，不说明**世界变了**——复验必须落在独立观测上（重读 `world` 或 `expect`）。
- 前置断言为假就停：`settled=false` 不动、`attribution` 不过不动、`degraded` 含致命项不动。

## 1. 三条命令（唯一入口）

**先跑这一条**——它 1 次调用给全能力自述（verbs / 字段 / 退出码 / 不变量 / **已知缺口**），
别再去 ls/sed/grep 读源码猜（实测有会话为此花了 20 次调用）：

```bash
python3 .scratch/gui-service/worldsvc.py capabilities
```

```bash
# 看：状态 + 对象 + 结构 + 文本（常驻服务，热路径 ~1.1s）
python3 .scratch/gui-service/worldsvc.py look --backend daemon-world --summary
python3 .scratch/gui-service/worldsvc.py look --backend daemon-world      # 全量回执

# 动：按文字/对象解析后注入（默认 dry-run，真动要 --live + 焦点授权）
python3 .scratch/gui-service/worldsvc.py act --text 好友 --action '{"type":"click"}'

# 等：谓词等待（禁裸 sleep）
python3 .scratch/gui-service/worldsvc.py wait --predicate '{"state_in":["GAME_PAIMON"]}' --timeout 10

# 自述 + 辅助动词（先跑 capabilities，别读源码猜能力）
python3 .scratch/gui-service/worldsvc.py capabilities      # verbs / 退出码 / 不变量 / known_gaps / skills
python3 .scratch/gui-service/worldsvc.py drill --at 900,600 # 对 uncertainty 下钻局部（不重处理整帧）
python3 .scratch/gui-service/worldsvc.py vocab              # 13 态词表（单一源 ys-state）
python3 .scratch/gui-service/worldsvc.py intents            # 列出 ys-do 意图（actions/*.json）
python3 .scratch/gui-service/worldsvc.py cache --clear      # 帧级缓存
```

底层就是 `ys-lookd` 的 `cmd=world`（socket 一行 JSON）：

```python
req = {"cmd": "world", "ocr": True, "objects": True, "cache": False, "structure": True}
```

## 2. 回执怎么读

| 字段 | 含义 | 纪律 |
|---|---|---|
| `state.state` | 13 态之一（见 §3） | **唯一判据实现**在 `tools/ys-editor/ys-state`，别自己写 |
| `state.readings` | 每条判据的 value/passed | 判不出时看这里，别猜 |
| `objects.containers[]` | `kind` + `bbox` + `text[]` | `tile/row/button/panel/chip`；**离线好友可能不在 containers，只在 free_text** |
| `objects.free_text[]` | 扁平文本序列（含 OCR 漏组的行） | 只扫 `containers` 会**系统性漏掉一类对象** |
| `structure` | 层级/遮挡 | — |
| `settled.same_as_prev` | 与上一帧是否在**同一布局**上 | **动作前必须 true**。判据是**容差**不是相等：数量一致 + 中心位移 ≤6px + 文本相似度 ≥0.80（唯一实现在 `tools/ys-editor/ys_settle.py`）。不稳时看 `reason`（`shift`/`count`/`unmatched`/`no_prev`）与 `max_shift_px`；首帧必 false，静止画面 **2 帧内**到 true |
| `frame_id` | `sha256:...` | 证据引用用这个，不要用截图 |
| `daemon.handled_ms` | 服务端处理耗时 | 冒烟用 |

## 3. 状态词表（13 态，`PRECEDENCE` 消歧）

编辑器侧：`EDITOR / MENU / SAVELIST / PLAYTEST / PAUSE / SETTLE / LOADING`
原神本体：`GAME_WORLD / GAME_PAIMON / GAME_ACTIVITY / GAME_FRIENDS / GAME_CHARACTER`
兜底：`UNKNOWN`

- 同层多态同时成立时按 `PRECEDENCE`（面板 3 > 派蒙/活动 2 > 世界 1）取**唯一最高**；
  仍并列就报 `AMBIGUOUS`（**不猜**）。
- 本体判据靠 OCR 文本：派蒙菜单 = 「冒险等阶 / 世界等级 / 左 UID」；世界 = 「右下 UID + 底部数字 + 无派蒙面板」；
  好友 = 「好友标题 + `x/200` 计数」；角色 = 「命之座 + 圣遗物」。
- **黑屏/无内容帧必须判 UNKNOWN**（当前尚未落地，见账本 F-20261021-48）。

**屏幕占用契约（用户令 2026-10-21，已做成设计）**：这个桌面不是只有我们在用。**每次长时间占用前**：
① 先看**当前活动窗口**（KWin 权威，`ys-lease kwin-state` 的 `active`；`xdotool getactivewindow` 会给 1×1 幽灵窗）；
② 在对话里**申请时长**，拿到同意后再 `tools/ys-editor/ys-screen-grant grant --seconds N --reason '做什么'`；
③ **一次授权 = 一段连续租期**：租期内 `ys-gui-slot` **不归还**（画面留在目标窗，这样紧接着的 `look --live` 才不会 `NOT_ATOP`）；到期或 `revoke` 时**统一交还** firefox 一次。多步任务只申请一次，别再"每个动作一小段"。
④ 凭据**单次 ≤120s**、必须带 `--user-said "<用户原话>"`、**有效期内不许覆盖续期**（要续必须 revoke 再重新问）；④ **切虚拟桌面是更重的动作**：`ys-follow-win` 额外要 `YS_ALLOW_DESKTOP_SWITCH=1`，只探测加 `--dry`；⑤ 没有有效凭据时 `ys-gui-slot` 以 **rc=6 NO_GRANT** 拒绝执行（自测走 `YS_SLOT_TEST=1`）。
**反模式（2026-10-21 真机复盘）**：不要自授——那天代理 64s 处 `grant --seconds 1200` 没问用户，65s 就切走了桌面；之后每次到期又自己续。发现「自己在给自己发凭据」= 立刻停下问用户。
缺这一步的代价：用户同时在操作屏幕 ⇒ 焦点/画面被夺 ⇒ 出现"莫名其妙的 bug"（已记 F-20261021-50）。

## 4. 仪器健康（先看这两个，再谈判据）

| 东西 | 怎么查 | 判据 |
|---|---|---|
| `ys-lookd`（GPU 常驻判态） | `systemctl --user status ys-lookd` | 单请求有界：`YS_LOOKD_RECV_TIMEOUT=10s` / `YS_LOOKD_HANDLER_TIMEOUT=90s`，超时回 `RECV_TIMEOUT`/`HANDLER_TIMEOUT`——**不再允许静默挂住** |
| `ys-capture`（XShm 常驻抓帧） | `tools/ys-editor/ys-capture status` | `daemon_alive && seq>0 && last_err==""`——**进程活着 ≠ 在产帧** |
| 一键拉起 | `tools/ys-editor/ys-eyes-up` | exit 0 就绪 / 2 没窗口 / 3 守护不产帧 / **5 在产帧但窗不在当前桌面** |
| 跨桌面 | `tools/ys-editor/ys-follow-win` | 只读探测不加 `--switch`；KWin 报 `desktop=all` 就是「在所有桌面」 |

## 4.5 回归测试默认不许碰屏幕（2026-10-21 用户反馈「说完成了却还有操作音」）

任何走 `ys-gui-slot` 的测试 = **真的抬窗、真的抢焦点、用户会听到声音**。
所以「动真屏」的测试必须显式开门：`YS_ALLOW_SCREEN_TEST=1`，否则 SKIP。
已加闸门：`tests/focus-default.selftest.sh`、`tests/screen-grant.selftest.sh` 的 T6。

**为什么这条重要**：`failure-ledger check --fast` 每次都会跑这些测试。那天代理跑完门禁说"已完成"，
用户却又听到操作音——因为 T6 传的是 `true`（空命令）却照样占屏。
**判据：测试里的 `ys-gui-slot` 只允许出现在 `YS_ALLOW_SCREEN_TEST=1` 分支里。**

## 4.6 听到「提示音」先查 X11 铃（2026-10-21 三次复盘）

**判据**：`pactl list sink-inputs` 看到 `application.name=KWin` 且 `media.name=bell` ⇒ 是 X11 响铃，
不是窗口操作、也不是游戏音效。**最常见来源 = ImageMagick `import` 抓帧**（每次抓帧敲一次铃）。
本仓所有 `import` 调用必须带 `-silent`；闸门 `no-xbell` 静态扫描裸调用。
抓帧后的旧守护进程不会自动加载新代码——改完要 `systemctl --user restart ys-lookd`。

## 5. 五条实测坑（都交过学费）

1. **坐标会漂**：菜单刚打开时布局还在动（tile 网格 y 从 478/668/856/1046 漂到 452/572/760/950，≈94px）。
   照首读 bbox 点击会落到**相邻格子**。⇒ 用 `settled.same_as_prev==true` 当动作门。
   ⚠️ 但**别把「稳定」实现成「逐字相等」**：2026-10-21 实测那样连续 12.5s 都等不到 true（OCR 抖一个字符就废），
   而点击其实是对的。容差判据见 §2，唯一实现 `ys_settle.py`。
2. **滚动会假成功**：`ys-scroll` 旧版画面逐像素一致仍 `rc=0`。现在有 `frame_diff` + `moved_confirmed` 三态，
   没动即 **`rc=6 NO_MOVEMENT`**；`--no-verify` 时不回答「动没动」，别拿它当成功。
3. **跨仪器会打架**：`ys-capture`（XShm 直读窗口）能拿到**全黑帧**，同一刻 `ys-lookd`（`import -window`）
   可能拿**旧缓冲**并照旧判态。⇒ 状态异常先问「这一帧是哪台仪器、多老」（F-20261021-48）。
4. **对话框会吞 ESC**：游戏内对话/选项打开时 ESC 先关对话、不开派蒙菜单。判据：`free_text` 出现
   「临时 / 1 / 2 / 3」这类选项文本 ⇒ 别连续空按 ESC。
5. **服务卡死时客户端要出声**：`daemon_rpc` 默认 60s、超时单列 `DAEMON_TIMEOUT`，消息里直接给
   `systemctl --user restart ys-lookd`；看到 `DAEMON_DOWN` 但服务 active ⇒ 去看守护自己的 `stage=grab` 日志。

## 6. 证据与防线（改这个模块时必须一起动）

- **证据最小集**：`evidence/<case>/` 里的 `s*.json`（模块原始回执）+ `round.json`，**不是截图**。
  实例：`.scratch/gui-service/evidence/friends-run/`（s0_world → s3_boundary，能重推出「第一个 30 天未上线好友 = 匿叶龙」）。
- **失败账本**：新踩的坑登记到 `tools/failure-ledger`，`prevented` 必须绑一条**可跑闸门**且带**注入用例**
  （`tools/ys-editor/tests/ledger-inject.sh`），否则全量 `check` 会报 `UNPROVEN` 并判 FAIL。
- **门禁**：`./tools/ys-gates --only 2`（含 lookd-wedge / scroll-movement / state-precedence 三个套件）、
  `--only 5`（单一源：判据不许复制）、`tools/ys-guards`（白名单投影等）。
- **架构真相**：`docs/architecture/gui-world-state.md`（schema、三动词、成本口径、§6 单一源表）。

## 6.5 能力边界：我们**没有**的东西（写清楚，防止假装有）

| 没有 | 现状 | 后果 / 应对 |
|---|---|---|
| `clickable` 置信度 | 只有占位符 `unknown` | 不能回答"这个能不能点"；靠 `kind` + 经验，别声称有把握 |
| 容器置信度分级 | 无 | 假阳性与真对象同权；跨帧比对（settled）只能事后发现不稳定 |
| 界面全集 | **单帧只看得见 65–71%** | 「这个界面有 N 个操作点」必须乘 1.4–1.5，且要滚动枚举（`ys-states`） |
| 黑屏/空白帧判别 | **没有**（账本 F-20261021-48，open） | 帧全黑时仍可能沿用旧判定；异常时先看帧亮度/来源 |
| 跨帧对象追踪 | 无稳定 id | 只能比"前后两帧一致"，不能追踪"那个按钮去哪了" |
| 字体/分辨率鲁棒性 | 判据靠 OCR 文本 | 换字体/缩放会掉字 → 掉判据 → 掉态 |
| 后台帧用于动作 | 明令禁止 | `--allow-background` 只给离线分析，拿它做动作会点到别处 |

**写新判据前先看这张表**：表里"没有"的东西，不要在技能/汇报里写成"有"。

## 6.6 与 `computer-use`（全局技能）的分工

| 目标 | 用哪个 | 判据 |
|---|---|---|
| 原生 GTK/Qt 应用（有 AT-SPI 语义树） | `computer-use` 的 `cu` | `cu apps` 里能看到它 |
| **Wine 应用（原神/千星编辑器）** | **本技能** | `cu apps` 里没有它；`cu state` 空文本 |
| 「这个界面一共有几个操作点」 | 本技能 + 滚动枚举 | 单帧 × 1.4–1.5，且必须滚动 |
| 「这个词在屏幕上哪里」 | 本技能（对象级 OCR）/ `paddle-vl-ocr` | 需要精确文字时 |

> `computer-use` 的 Wine 那一节已经改成"转本技能"——两条路不要各写一份判据。

## 7. 什么时候转别的技能

| 要去哪 | 转给 |
|---|---|
| 开试玩、注入键鼠、取节点图日志、焦点归还 | `device-playtest-loop` |
| 给界面帧标 bbox 真值、造检测训练集 | `gui-annotation` |
| 解析 `.gia` 日志、还原节点执行 | `debug-log-investigator` |
| 改被感知的界面本身（编辑器/UI 资产） | `genshin-ts-asset-operations` / `ui/AGENTS.md` |

## 8. 技能缺口与能力缺口同账（用户令 2026-10-21）

**能力 = 工具 + 判据 + 技能。** 只把能力做进代码，下一个会话就没有它——技能是生效载体，不是文档。
所以：新增 verb / 新判据 / 新退出码 / 新 known_gap ⇒ **同一轮写进本文件**，否则等于没做。

机械校验：`python3 tools/ys-editor/tests/skill-coverage.selftest.py`
（`capabilities` 里列出的每个 verb 必须能在本技能里 grep 到；三个技能文件必须存在；
本段规则本身也在检查范围内）。闸门名 `skill-coverage`，接在 `failure-ledger check` 里。

**触发条件→动作**：写完任何新能力 → 立刻在 `capabilities` 里登记 verb 与 skills 指针 →
跑 skill-coverage；红了说明"代码有、技能没有"，别交付。
