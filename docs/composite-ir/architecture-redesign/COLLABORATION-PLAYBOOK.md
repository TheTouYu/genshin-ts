# Stage 3 协作经验手册

> 状态：当前推荐 / 持续维护
> 来源：经真实 GIA 对照和用户编辑器核验确认的可复用协作经验
> 最近校验：2026-07-16
> 适用范围：需要用户参与 GIA reference、候选编辑器核验或 Windows `Beyond_Local_Export` 协作的 Stage 3 工作包

本文件只记录**高频、可复用、能改变下一轮行动且已有证据支持**的经验。
维护规则见 [COLLABORATION-PLAYBOOK-MAINTENANCE.md](COLLABORATION-PLAYBOOK-MAINTENANCE.md)。
工作包的具体路径、SHA-256、节点 ID、失败过程和测试命令留在当前 `STATUS.md`、focused test、真实文件或
`work-packages/` 归档中；Phase 文档只保留当前 checklist 和摘要。

## 已验证协作经验

### 1. 两阶段核验不可合并

任何改变 Stage 3 生产编码行为的工作包，自动回归完成后都必须生成**新的** candidate 并请求用户编辑器/游戏核验；传统路径已确认的 DSL candidate 只能成为 real-GIA reference，不能替代新 candidate 的核验。除非工作包明确限定为仅自动观察/不可核验实验，否则未取得用户反馈前不得标记验证完成或建议提交。自动 diff 或拓扑一致不能替代编辑器/游戏核验。

### 2. typed ordinary node 不只比较拓扑

重构 typed getter/setter 时，除节点和边外，至少检查 concrete variant、实际 typed value pin 与 literal/wrapper；自动语义比较通过但编辑器异常时，优先检查这些字段并补 focused regression。

### 3. 候选文件使用固定生命周期

**游戏目录**（唯一编辑器可见路径，不是仓库内目录）：

```text
C:\Users\touyu\AppData\LocalLow\miHoYo\原神\BeyondLocal\Beyond_Local_Export\
# WSL：/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export
归档：...\Beyond_Local_Export\真-测试通过\复合节点\
```

仓库内 `genshin-ts/Beyond_Local_Export/` 只可作本地 staging，**不能**当作游戏目录；交付用户核验前必须把本轮候选复制到上述游戏导出根目录。

生命周期：
1. 生成名称明确的 Stage 3 候选 `.gia`；
2. **自动复制/覆盖到游戏导出根目录**（见下授权）；
3. 完成报告必须给出“需游戏测试清单”：路径、SHA-256、覆盖点；
4. 用户确认通过后移入 `真-测试通过/复合节点/`；
5. 真实 `user_edit` reference 永远单独保留且不可覆盖。
Windows 文件一律经 `/mnt/c` 操作，并记录实际路径与 SHA-256。

用户授权（2026-07-13，2026-07-16 澄清路径）：对于 Stage 3 重构生成的、名称明确的候选 `.gia`，可直接复制到或覆盖
**游戏导出根目录** `.../BeyondLocal/Beyond_Local_Export/`，无需每次再次确认。此授权不包含 `user_edit/`、
地图/注入目录、未知同名文件、删除/清理、移动真实参考或任何注入操作；遇到这些操作仍须先确认。

用户授权（2026-07-14）：当用户在新回合明确说“测试通过了 / 测试通过”时，代理必须立即自动执行归档，
不再要求用户手动移动：
1. 定位本轮交付、仍在**游戏导出根目录**、名称明确的 Stage 3 候选 `.gia`；
2. 移入游戏目录下 `真-测试通过/复合节点/`（同名覆盖仅限同一工作包刚通过的候选）；
3. 记录归档后路径与 SHA-256；
4. 更新 `STATUS.md` 与 `game-regression-manifest.md` 的用户结论与归档状态。
仅限本轮刚确认通过的候选；不得移动 `user_edit/`、其他工作包残留、未知同名文件或真实参考，也不得注入。

用户要求（2026-07-16）：触及生产编码、需编辑器核验的工作包，完成报告中必须自动给出“需游戏测试清单”，
并已完成向游戏导出根目录的复制；不要让用户从仓库 staging 目录自己找文件。

### 4. Boundary 扩展先做最小变量实验

从 closed ordinary vendor graph 推进到 capture、connection、custom target 或 synthetic call 时，一次只改变一种边界变量，并在自动断言中分开检查 ordinary edge、`compositePins` route 和 synthetic metadata。若 vendor gate 对 synthetic node 或 schema 无法表达而失败，先保留失败基线、调查 vendor 与当前 backend 的职责；不要为了产出候选静默 fallback 或把该节点伪装成 ordinary node。

### 5. 多出口控制流按 DSL 顺序逐层核验

当一个 OutFlow 连向多个下游、或嵌套复合引用子复合特定 OutFlow 时，先核对 DSL 的 `f.link` / `f.outflow` 顺序，再核对解码 GIA 的 `connects` 顺序、`compositePins` 和物理 OutFlow pin，最后才检查 materializer。候选必须验证声明的 child OutFlow 已物理存在；不要只因定义或 `compositePins` 存在就认为编辑器连线正确。

### 6. 提交前收束工作包语义状态（不记 commit SHA）

用户编辑器核验与 focused 回归完成后、**用户下令提交之前**，同步 `STATUS.md` 的当前/最近工作包、证据、下一包与恢复指引，以及相关 ADR/checkpoint。已完成或已验证的事项不得继续标为待核验/未证明；尚未覆盖的边界必须精确保留。

`STATUS.md` **不要**记录 git commit SHA，也不要维护“工作树预期: clean/dirty”这类随提交瞬间过期的字段。提交身份以 `git log` 为准。一次 commit 应包含本包代码与上述 STATUS 更新；禁止为补写 SHA 或把“未提交”改成“已提交”而 amend / 追加空文档提交。
