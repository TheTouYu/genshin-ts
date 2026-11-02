# tetris 生产可玩级交付计划（v6.16）— 修订版

> 目标（用户 2026-11-02）：**达到生产可玩级别，回来自己测试**。角色技能（UI/逻辑/文案）保持现状不动，其余按生产级交付。
> 本文件 = 执行计划 + 验收证据。**已过一轮独立评审**（评审提出 7 条，6 条经命令验证成立并已吸收，1 条部分成立，见 §5）。

## 0. 基线（本轮实测）

| 项 | 读数 | 命令 |
|---|---|---|
| L0 | 27/27 文件绿 | `lua5.3 tests-lua/run_all.lua` |
| L0.5 | 74/75（红=必须留模拟器的 `57`） | `lua5.3 tests-lua/run_cases.lua --jobs=8` |
| L1 全量 | 75/75 · 308.6s exit 0 | `node qxqy/runner.mjs` |
| 运行时错误扫描 | 75 用例 / 12 条命中 / **全部同一行** `settle signal FAILED :: main.lua:706` | `node qxqy/scan-runtime-errors.mjs` |
| 浮层暂停 | 角色页/说明页各 3s 内 0 次游戏 tick（正确） | `node qxqy/probe-freeze.mjs` |

## 1. 根因（有证据）

**唯一主轴：同一份逻辑，两个可见面 —— 手机端的信息通道被布局层 park 掉了。**

- 教学提示 `setText(hint, …)` 两端都执行（日志 `guide clear-tip` 两端各 1 条），
  但 `ui.lua:394` 手机双盘把 `hint` 停在 `y=-4000` ⇒ **写了但看不见**。
  PC 双盘可见文字 10 条含 `ihint [570,772]`；手机双盘改前 10 条**无** `ihint`，改后 **11 条含 `ihint [200,18]`**（已修，见 Step 1）。
- 同类：双盘手机 `best/hudNext/keyA/keyB` 也全 park ⇒ 对应信息在手机上不可达。

## 2. 计划（6 步，每步一个验收读数）

| # | 动作 | 验收（可机检） | 状态 |
|---|---|---|---|
| 1 | **手机双盘恢复 hint 通道**：`ui.lua` 双盘分支给 hint 一条底部中带（实测该带无可见件），并让 `layoutDual` 不再把它写回 `-4000` | 手机双盘可见文字 10→11 且含 `ihint`；PC 侧一字不变 | ✅ 完成（`ihint x[200,1080] y[2,54]`；layoutDual 已单源） |
| 2 | **设备文案收敛**：`:1732`/`:4888` 两处 `IS_MOBILE and …` 文案改为查 `CFG.COPY_DEV`（键=语义位，值={pc,mobile}）；**不碰** `device = IS_MOBILE and 'mobile' or 'pc'` 那 4 处（它们是设备判据本身，不是文案） | 两处字面量 `grep` 消失；`tests/60`、`tests/42`、`tests/29` 仍绿 | ✅ 完成（6 处三元→COPY_DEV；`tests 07/25/29/42/60` 5/5） |
| 3 | **结算信号探测降到一次**：OnStart 探一次可用形态落表，结算时直走；保留双形态兜底 | `node qxqy/scan-runtime-errors.mjs` 异常行 12 → 0；`tests/06/37/38/72` 仍绿 | ✅ 完成（异常行 12 → 0） |
| 4 | **验收脚本入库**：`qxqy/scan-runtime-errors.mjs`、`qxqy/probe-freeze.mjs`、`qxqy/visible-text.mjs`（从 /tmp 搬进来，可复现） | `node qxqy/scan-runtime-errors.mjs` 可独立跑出同一个数字 | ✅ 完成（4 个脚本入库，均可独立跑） |
| 5 | **出图回归（按实际可进入组合）**：桌面 4 模式 + 手机 casual/ai-battle + 手机「请回 PC」浮层 ×2 = **6 张**；手机 pvp/coop **不是缺陷**（v5.0 设计：手机拦 3/4 并给引导浮层） | 6 张图 + 每张的可见文字清单；`tests/26/27` 保桌面 pvp/coop 行为 | ✅ 完成（8 张图 / 0 处 Lua 错误；多出 2 张是 note×2） |
| 6 | **部署 + 收尾**：`node qxqy/build.mjs` → `node qxqy/deploy.mjs` → 校验两份 save 的 sha 一致 → 精确提交 | `sha256sum ~/qxqy-workspace/tetris.save.json tetris.save.json` 相等；`bash qxqy/tetris-guard.sh --fast` 通过 | ✅ 完成（commit 238f7287；guard PASS；sha 04db4d28 一致） |

## 3. 不做（有理由）

- **最高分跨会话持久化**：官方客户端 API 无任何玩家侧存储接口（唯一持久化手段是"技能变量"，属点名的技能域）⇒ 平台限制，不臆造。
- **日志瘦身开关**：`M.VERBOSE=true` 有 7 处守卫，且 `tests/02/50/62/64` **断言这些行**；无模拟器/真机探测器（`grep IS_SIM` = 0）⇒ 改常量必红。真要瘦身得改用例口径，不属本轮。
- **角色技能 UI/逻辑/文案**：用户点名保持现状。

## 4. 反模式提醒

- 改 Lua 后**必须** `node qxqy/build.mjs` 再跑 runner（runner 读存档内嵌副本）。
- 新断言先做变异测试（人为破坏 → 必须红）。
- 层序/可见性只用语义层号与坐标，不靠 `SetVisible`。
- 服务端 textbox 永远在运行时实例**之下**。

## 5. 评审吸收记录

| 评审意见 | 判定 | 处置 |
|---|---|---|
| 缺部署步 | ✅ 成立 | 新增 Step 6 |
| 缺脚本入库 | ✅ 成立 | 新增 Step 4 |
| Step 1「中缝空带」是推测 | ⚠️ 部分成立 | 中缝确实被技能列占满；但我另测出**底部中带**（y≈18..74）无可见件 ⇒ 改用底部带 |
| Step 2 grep 计数会假绿 | ✅ 成立 | 验收改成"两处字面量消失 + 三个用例绿" |
| Step 4 对象不存在 | ✅ 成立 | 整步删除，理由写进 §3 |
| Step 5 矩阵产不出 | ✅ 成立 | 8 图 → 6 图，手机 pvp/coop 标为设计而非缺陷 |
