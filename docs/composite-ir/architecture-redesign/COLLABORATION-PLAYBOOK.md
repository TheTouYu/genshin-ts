# Stage 3 协作经验手册

> 状态：当前推荐 / 持续维护
> 来源：经真实 GIA 对照和用户编辑器核验确认的可复用协作经验
> 最近校验：2026-07-12
> 适用范围：需要用户参与 GIA reference、候选编辑器核验或 Windows `Beyond_Local_Export` 协作的 Stage 3 工作包

本文件只记录**高频、可复用、能改变下一轮行动且已有证据支持**的经验。
维护规则见 [COLLABORATION-PLAYBOOK-MAINTENANCE.md](COLLABORATION-PLAYBOOK-MAINTENANCE.md)。
工作包的具体路径、SHA-256、节点 ID、失败过程和测试命令留在 `STATUS.md`、phase 文档、focused test 与真实文件中。

## 已验证协作经验

### 1. 两阶段核验不可合并

传统路径的 DSL candidate 经编辑器确认，只能成为 real-GIA reference；重构后必须生成**新的** candidate 并再次经编辑器确认。自动 diff 或拓扑一致不能替代第二次编辑器核验。

### 2. typed ordinary node 不只比较拓扑

重构 typed getter/setter 时，除节点和边外，至少检查 concrete variant、实际 typed value pin 与 literal/wrapper；自动语义比较通过但编辑器异常时，优先检查这些字段并补 focused regression。

### 3. 候选文件使用固定生命周期

候选放 `Beyond_Local_Export` 根目录；同一工作包修复时覆盖上一次失败候选；用户确认通过后移入 `真-测试通过/复合节点/`；真实 `user_edit` reference 永远单独保留且不可覆盖。Windows 文件一律经 `/mnt/c` 操作，并记录实际路径与 SHA-256。

用户授权（2026-07-13）：对于 Stage 3 重构生成的、名称明确的候选 `.gia`，可直接复制到或覆盖
`Beyond_Local_Export` 根目录，无需每次再次确认，以提高编辑器核验效率。此授权不包含 `user_edit/`、
`真-测试通过/`、地图/注入目录、未知同名文件、删除/清理、移动真实参考或任何注入操作；遇到这些操作仍须先确认。

### 4. Boundary 扩展先做最小变量实验

从 closed ordinary vendor graph 推进到 capture、connection、custom target 或 synthetic call 时，一次只改变一种边界变量，并在自动断言中分开检查 ordinary edge、`compositePins` route 和 synthetic metadata。若 vendor gate 对 synthetic node 或 schema 无法表达而失败，先保留失败基线、调查 vendor 与当前 backend 的职责；不要为了产出候选静默 fallback 或把该节点伪装成 ordinary node。

### 5. 多出口控制流按 DSL 顺序逐层核验

当一个 OutFlow 连向多个下游、或嵌套复合引用子复合特定 OutFlow 时，先核对 DSL 的 `f.link` / `f.outflow` 顺序，再核对解码 GIA 的 `connects` 顺序、`compositePins` 和物理 OutFlow pin，最后才检查 materializer。候选必须验证声明的 child OutFlow 已物理存在；不要只因定义或 `compositePins` 存在就认为编辑器连线正确。
