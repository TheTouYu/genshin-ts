# GIL 整体语义树增量调查

只在任务从 GIL payload 根层定位未知容器、建立整体字段语义树，或调查自由新建/自由修改对象时加载。本模块补充主 `SKILL.md` 的通用安全、快照和 Validator 规则，不保存地图 ID 或局部结论。

## 最小恢复字段

```text
Authority / validation workflow / manifest
锁定 map path
当前前快照 path + SHA-256 + size
当前已闭合的根字段路径
下一项根层缺口
```

若这些字段已由 handoff 给出，不运行 `gsts maps`、全图列表或 PKC。

## 每轮比较层级

按顺序执行，不能跳过 L1：

```text
L0：文件大小、SHA-256、root occurrence、presence、wire type
L1：每个 root occurrence 的完整 raw encoded bytes 比较
L2：只对变化 root 字段做直接子记录集合差
L3：只对唯一目标记录做 schema 或 raw-wire 定点解码
```

L0 的大小摘要不能发现等长内容变化。L1 使用：

```bash
python .agents/skills/editor-incremental-gia-investigator/scripts/compare-gil-root-wire.py \
  <before.gil> <after.gil> \
  --output <experiment>/coordinator/root-wire-diff.json
```

脚本默认只展开变化根字段的直接子记录，每侧最多 20 条；需要更小输出时用
`--max-records`。递归可解析性、记录位置和相邻 ID 都不证明语义。

调查当前已闭合的受限关卡变量列表时，复用只读提取器，不再为每轮复制 protobuf 解析器：

```bash
python .agents/skills/editor-incremental-gia-investigator/scripts/inspect-gil-level-variables.py \
  <before.gil> <after.gil> --output <experiment>/investigator/variables.json
```

它只接受 root `5` 中恰好一个直接 field `1` record 被重写的相邻快照，输出变量 entry 的
名称、类型 discriminator、字段摘要和 raw hash。路径与 discriminator 都是当前证据边界，
不是正式 schema；不满足唯一差分时脚本应失败，不放宽匹配。

## 自由新建与自由修改

整体调查优先采用：

```text
基线
→ 执行编辑器可实现的最小默认创建操作 A
→ 若有自动子对象、同步记录或 ID 歧义，执行同构最小操作 B
→ 只修改 A 的一个可独立控制属性
→ 必要时把同一属性改为短值、长值、清空或边界值
```

不要把“最小对象”预设成理想空结构。若编辑器创建 UI 控件组时必然带出默认布局和文本框，
先把整套自动结果作为一个原子操作记录；第二个同构样本用于确认稳定骨架。只有用户额外手工
添加的对象才算约定外变化。

保存前锁定完整操作：

```text
对象：类型 + 当前名称或已确认 identity
唯一变化：旧值 → 新值
明确不做：新增/删除/移动/连接/参数/挂载中的其他项
```

用户只说“又修改了”且对象或旧值不明确时，先问一个澄清问题。用户声明与 raw-wire
不一致时，以文件事实为准并标记 `CONFLICT`；不要用用户意图覆盖新增 identity 或新增
记录。用户同时报告属性面板的多个值时，记录哪些是本轮实际修改、哪些只是读取到的当前值；
只读值不能凭一次快照命名字段。

对于编辑器不可拆分的联合属性操作，先确认联合子树，再用负证据拆分：

```text
大小 + 位置联合变化
→ 大小不变的位置-only
→ 纵向不变的 X-only
→ 穷尽叶子集合差，确认子组与轴向
```

类似地，optional 文本属性应覆盖“缺失 → 短值 → 长值 → 清空”，严格区分 missing、显式空
和显式非空；清空后若 raw record 精确恢复，记录为额外可逆性证据。

## 同步字段隔离

业务目标之外的 root 字段可能同步变化：

- 只确认 raw-byte 变化和 presence；
- 等长变化也必须记录；
- 不按“每次保存都变化”命名为时间戳、校验值、缓存或编辑器状态；
- 同步字段无法与目标值形成稳定引用时保持 `INSUFFICIENT`；
- 后续业务调查继续隔离该字段，不用重复保存强行命名。

## Validator 与知识合并

独立 Validator 必须直接读取原始快照并重新计算：

```text
SHA-256 / 相邻链
root occurrence / presence
全部 root raw-byte 变化字段
目标容器记录集合差
稳定 identity / 显式字段 presence
```

Validator 只能写自己的 `validation.json`。Coordinator 只合并 `ACCEPT` 的受限 claim；
`CONFLICT` 实验作为负证据保留。

稳定批次完成后按顺序更新：

1. 实验 README 与 Validator；
2. 机器总图、字段语义、未知字段和总 validation；
3. 总 README 与恢复 manifest；
4. 先提交证据仓库；
5. Authority 引用证据提交后，再提交项目文档。

自动差分、round-trip、临时重放、真实写回、编辑器导入和游戏行为继续分层记录。
