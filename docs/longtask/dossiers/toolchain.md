# 档案：仪器、门禁与回归（L3）

> 状态：当前实现（读数见 `../03-state.md`）
> 来源：`tools/failure-ledger.gates.tsv`、`tools/ys-editor/`、根 `AGENTS.md`「仪器优先」
> 最近校验：2026-10-22
> 读法：要跑门禁 / 改工具 / 判断"能不能信某个读数"时读本文件

---

## 一、五条准入门槛（GUI 模块未过门槛不进下游任务）

① 判定回归 ≥16 张（含 5 负样本），两条独立通道 100%；
② 假成功注入 3 类失败，执行器 ≤10s 停止并报"哪条断言为假 + 观测值"；
③ 性能：写盘轮 ≤90s / 纯试玩轮 ≤40s / 取帧 ≤12 次 / 取焦点 1 次 / 固定 `sleep` 0 条；
④ 证据：只给 `round.json` + 引用帧 + `.gia` 能重算出结论；
⑤ 可维护：界面态判定全仓只有一处实现。

## 二、四条纪律

- 状态判定单一源（新脚本向 `ysd` 查，不自己写判据）；
- 等待用 `wait_until`，不用 `sleep`；
- 每步有前置断言，为假即停并记账；
- 证据 = 能重推结论的最小集（截图不是证据）。

## 三、门禁怎么跑

```bash
./tools/failure-ledger check --fast   # 日常，69.9s，27 条
./tools/failure-ledger check          # 全量，空闲 550s / 游戏在跑 700s
./tools/ys-gates                      # GUI 六门槛
```

- `gates.tsv` 有 `requires` 列（`game` / `gpu`）：环境不满足时打印 `[ENV-SKIP]` 并跳过，**不算红**。
- **不要**用自证型 inject（inject 字段 = 门禁命令本身）——2026-10-22 清掉 15 条假注入。

## 四、屏幕契约（真机操作必读）

```bash
# 开租期（内置 grant；先手动 grant 会 GRANT_STILL_VALID）
ys-session begin --seconds N --task <名> --reason '<做什么>' --user-said '<用户当场原话>'
# …动作…
ys-session end            # 收尾必须：NO_GRANT + firefox ACTIVE
```

- 空闲 3s 自动交还；失败/超时也交还。
- `worldsvc act --expect` **必填**。
- 占用 >30s 先报时长。

## 五、时间监控

开工前与收轮前各读一次 `~/.dsh/cmdlog/last-coach.md`（`cmdmon` 每 5 分钟自动刷新）。
判据：单条命令 >5s 先优化；>20s 除非确需否则后台；长任务一律 background job。

## 六、技能三环（能力 = 工具 + 判据 + 技能）

新工具必须同时进技能，否则新代理"看不见它"。2026-10-22 实例：`ys-probe` 实测可用但技能里 0 处引用 ⇒ 等于不存在。
体检：`python3 scripts/skills-health.py`。
