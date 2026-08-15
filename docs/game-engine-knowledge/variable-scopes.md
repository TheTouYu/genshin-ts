
## 实体自定义变量类型变体（2026-08-15 灯阵胜利 bug 实证）

`Set Custom Variable`（节点 22）按值类型选择**变体存储**：写 number 走 float 变体（cid=26）、
写 bigint（0n）走 int 变体（cid=22）。`Get Custom Variable` 的 `asType('int')` 只读 int 变体
（cid=22）——若写入用 number（float 变体）、读取用 asType('int')，会**类型分裂**：
Get 恒读空 → 计数恒为 1 → 判定永不触发（灯阵 winCount ==9 失败的根因，日志 2712 铁证）。

**规则**：实体自定义变量存整数必须用 bigint 字面量（0n/1n...）初始化与写入，读取用
asType('int')；float 变体与 int 变体互不可见。probe 验证：0→float(cid=26)、0n→int(cid=22)。
