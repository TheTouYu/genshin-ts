# resolve-click：按名字解析后点击 + 回读断言（离线自测）

状态标签：**当前实现 + 离线已验证**（2026-10-17）。来源：两帧真机抓帧的 OCR 实测 + PATH 桩端到端。
自测入口：`bash tools/ys-editor/tests/resolve-click.selftest.sh [-v]`（退出码 0 全绿 / 1 有失败 / 2 环境不全）。

## 为什么有这个工具（用户当场发现的错）

同一块屏、同一批存档，列表顺序一变，同一个物理点 `(1681,387)` 在两帧上属于**不同对象**：

| 帧 | 文件 | `输入探针v2` | `未分类页签_存档_1` | (1681,387) 是谁的【编辑】 |
| --- | --- | --- | --- | --- |
| A（去程 19:54） | `tools/ys-editor/calib/regress/live-savelist-20261017.png` | (1440,192) | (857,192) | 输入探针v2 |
| B（回程 20:19） | `tools/ys-editor/tests/fixtures/savelist-orderB.png` | (816,192) | (1481,192) | 未分类页签_存档_1 |

沿用上一帧的坐标去点 ⇒ **静默点错存档**（不报错）。结论：**坐标是位置，名字才是身份**；
解析必须发生在动作那一刻，动作后要回读同一位置。

两帧 sha256（防止夹具被悄悄替换）：
`A=01ad878d12ef1c2dbf4815fc5ed46a233f3ae86d1c1443ae9d2c13bc5c7323e3`、
`B=703f7ec71d3f2cc4f49428402c6f1bde520401c1949eb67cd3d08d5b41bea454`（B 的源：`/tmp/back2.png`，2026-10-17 20:19 真机抓帧）。

## 契约

`tools/ys-find --frame 帧.png --resolve --text <名字>` → 一行 JSON：

```json
{"ok":true,"x":1440,"y":192,"resolved_by":"text","matched_text":"输入探针v2","score":0.9966,
 "candidates":1,"frame":"…","roi_texts":[],"ocr":{"cache":"hit","n_total":39},"error":null}
```

`resolved_by` ∈ `text`（文字中心）/ `text+offset`（`--anchor` + `--offset` 行内相对几何，点【编辑】这类按钮）/
`text+icon`（文字与模板两通道一致）。

| 情形 | 退出码 | 诊断行（stderr） |
| --- | --- | --- |
| 已解析 | 0 | — |
| 候选=0 | 4 | `RESOLVE-FAIL 候选=0（…n_total=…）` |
| 候选不唯一 | 4 | `RESOLVE-FAIL 候选不唯一：N 个「名字」 (x,y)…` |
| 通道不一致（给了 `--icon`） | 3（动作层映射为 4） | `RESOLVE-FAIL 通道不一致：…` |
| 用法错 / OCR 后端缺 | 2 / 5 | 明说缺什么 |

`tools/ys-editor/ys-pointer-click`：0 成功 / 2 用法或环境 / 4 解析失败（候选=0、候选不唯一、通道不一致）/
5 步进过小、超过迭代上限、**回读断言不符**（`ASSERT-FALSE 期望=… 实测=…`）。

## 口径（为什么这样选）

- **名字匹配不做模糊**：NFKC + 去空白 + casefold 后全等。「输入探针」与「输入探针v2」是两张不同存档；
  包含匹配要显式 `--match contains`。
- **歧义只承认两种语义消歧**：`--scope`（区域先验）/ `--anchor`+`--offset`（身份 + 行内相对几何）。
  **不用「离谁最近」这类隐式启发式**——它会把错误藏起来。
- **`--frame` ⇒ 隐含 `--dry-run`**：给离线帧就绝不注入、不抓屏、不进槽（⇒ 不可能抢焦点）。
- **断言默认锚在点击点**（`--assert-pad`，缺省 120px；或 `--assert-roi` 指定探针），不是整帧：
  整帧搜同名会让「名字在别处」冒充「点对了」。`--assert-anywhere` 是显式弱断言，会打 warning。
- **`--assert-strict`** 要求「点前该区域没有这个名字」，否则断言只证明「名字在位」，不证明「动作生效」。
- **OCR 缓存**内容寻址（`sha256(帧字节)+后端签名`，落 `.gsts/ys-find-cache/`，gitignored）：
  同字节必同结果，后端换了自动失效；缓存异常一律退回真跑。

## 离线怎么证明（不碰活体桌面）

- 解析只吃 PNG（`--frame`）；`DISPLAY=:99`（不存在的显示）+ PATH 桩 ⇒ 真碰桌面会当场失败；
- 旧坐标用法用桩 `xdotool`/`ydotool` 跑**真循环**，A/B 对比改动前后：6 个坐标场景 + 12 轮未命中 +
  缺参数，`rc`/`stdout`/`stderr` 全部逐字节一致（唯一差异是缺参数时 bash 自带的行号前缀）；
- 离线用例每轮断言 `ydotool` 桩日志为空——**一条注入都没有**（不是「应该没点」，是没调用）。

## 与 `tools/gui` 的退出码关系（读之前先看这条）

`tools/gui`（动作级身份协议）用 **4 = `OBJECT-MISMATCH` 对象不符**；本工具的
**4 = 目标解析失败**（候选=0 / 候选不唯一 / 通道不一致），**5 = 回读断言不符**（任务契约指定的码）。
两者是不同基座：`tools/gui` 走 AT-SPI / 桩树 + 判据通道，`ys-pointer-click` 走 OCR 文本通道 + 指针闭环。
**调用方切换工具时不要按码表跨界解释**——认 token：`RESOLVE-FAIL` / `ASSERT-FALSE` / `OBJECT-MISMATCH`。
要不要统一码表属跨工具契约决策（Lead / 用户裁决），本轮按任务契约实现。

## 未覆盖（诚实边界）

- 新分支的**真点击**未做桩端到端：它直接复用旧用法 e2e 验证过的 `click_loop`（同一函数），
  接缝由 dry-run 计划 JSON 的 `click:{x,y}` + 单行调用证明。
- 活体取帧路径（`ys-observe frame`）在离线自测里没跑过；活体断言需在有窗口的真实会话里验。
