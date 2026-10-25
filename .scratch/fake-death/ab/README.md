# ab/ —— 假死 A/B 取证结果目录（2026-10-25 起）

工具：`tools/ys-editor/ys-fakedeath-ab`（默认只观察；加 `--flip` 由脚本自动翻转修法 A 再还原）

## 文件

| 文件 | 内容 |
|---|---|
| `ab-<ts>.log` | 主日志：检测/判定/基线线程读数/perf 摘要/翻转后的 CPU 曲线 |
| `perf-before-<ts>.{data,txt}` | 自旋**当时**的 perf 热点（`-e cpu_core/cycles/u -F 199`，报前 28 行） |
| `perf-after-<ts>.{data,txt}` | 翻转修法 A **之后**的热点（对照：XCheckIfEvent 是否掉下去） |
| `driver*.out` | 脱离终端跑时的 stdout |

## 怎么读

1. **先看进程是不是本轮构建**：日志里出现 `inode=… ≠ 当前 …` = 那轮跑的是旧 .so，读数不能用来评价本补丁。
2. **看自旋签名**：`cpu=NN% syscall=running` 连击 ≥5 次（约 10s）才判自旋；渲染线程高 CPU 不在此列（脚本只测 wine 主线程 tid==pid）。
3. **看探针**（`/tmp/wine11-proc.log`，每 250ms 一行；**计数是进程级 static，按整进程读**）：
   - `scans/calls` = 平均每次 `X11DRV_ProcessEvents` 扫过多少 X 事件 —— 原件路径下队列积压时这个数会持续很大（O(N²) 的直接读数）；
   - `matched` vs `events` = 有多少事件「按原 mask 本不该处理、但被排空处理掉」；
   - `itermax` = 单次调用最多取出多少条（>=256 说明撞了安全阀，那一轮在紧循环里推进，说明队列比消费快）；
   - `drain=1` = 修法 A 生效中。
4. **成立判据**：翻转后主线程 CPU 落回 <15%，且 `scans/calls` 从几十~几百掉到 0~几条、`events` 不再堆积。
   **不成立**：CPU 不降 ⇒ 自旋不在 `XCheckIfEvent`（或在事件处理器内部），转设计 B（按 mask 分桶）。
5. **perf 无样本**（`has no samples`）= 那 4 秒里进程没在用户态烧 CPU（通常已恢复或本来就空闲），不是采样失败。

## 手动 A/B（人肉版）

```bash
tools/ys-editor/ys-fakedeath-fix status              # 装没装、markers
tools/ys-editor/ys-fakedeath-fix log-clear           # 清探针（重新计数）
tools/ys-editor/ys-fakedeath-fix drain-on            # 运行中即时生效，不用重启编辑器
tools/ys-editor/ys-fakedeath-fix probe 20            # 看探针
tools/ys-editor/ys-fakedeath-fix drain-off           # 还原
tools/ys-editor/ys-fakedeath-fix revert              # 整只 .so 回原件（470816B）
```
