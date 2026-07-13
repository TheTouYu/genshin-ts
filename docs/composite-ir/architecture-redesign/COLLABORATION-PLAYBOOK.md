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

### 4. Boundary 扩展先做最小变量实验

从 closed ordinary vendor graph 推进到 capture、connection、custom target 或 synthetic call 时，一次只改变一种边界变量，并在自动断言中分开检查 ordinary edge、`compositePins` route 和 synthetic metadata。若 vendor gate 对 synthetic node 或 schema 无法表达而失败，先保留失败基线、调查 vendor 与当前 backend 的职责；不要为了产出候选静默 fallback 或把该节点伪装成 ordinary node。
