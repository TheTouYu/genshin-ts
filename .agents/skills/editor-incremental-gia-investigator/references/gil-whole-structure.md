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

调查当前受限自定义镜头 records 时，复用：

```bash
python .agents/skills/editor-incremental-gia-investigator/scripts/inspect-gil-custom-cameras.py \
  <before.gil> <after.gil> --output <experiment>/investigator/cameras.json
```

它只接受 root `18.1` 恰好一条 append 或同 identity rewrite，输出 identity/name 候选、record
hash 和非名称骨架 hash；差分不唯一时失败。root `18` 的正式消息名仍须由相邻实验和独立
Validator 裁决，不能由脚本名称或第三方 schema 直接确认。

定位未命名的新 root 容器（如“空 length-delimited → 非空”的首次创建）时，复用：

```bash
python .agents/skills/editor-incremental-gia-investigator/scripts/inspect-gil-root-container.py \
  <before.gil> <after.gil> <rootField>
```

它比较指定 root 的直接 field-1 子记录集合差，只接受唯一差分（append 一条 / 删除一条 /
一换一），并定点解码到 depth 2（varint / fixed32 / UTF-8 摘要）；差分不唯一、无变化或
root 缺失时失败。字段语义仍由后续单属性相邻实验和独立 Validator 闭合，脚本只缩短定位。
它不适用于 root `22` 的重复字符串/flags 或 root `27` 的 field 1/2 双 section。

静态元件材质、宿主 packed aux 列表、root `22/27/45` 联动使用：

```bash
python .agents/skills/editor-incremental-gia-investigator/scripts/inspect-gil-prefab-material.py \
  <before.gil> <after.gil> \
  --definition-id <definitionId> --instance-id <instanceId> \
  --output <experiment>/investigator/prefab-material.json
```

它要求目标 definition/instance ID 各唯一存在，保留 root occurrence 顺序，输出 root changed
set、definition/instance 材质 presence/raw hash、field 501 packed aux ID、root 22 名称/flags、
root 27 双 section 的唯一小型增删和 root 45 packed MRU。root presence/order/wire type 变化、
目标缺失或 aux 差分超过 `--max-aux-delta` 时 fail closed；它是定点 Investigator，不替代 L1
`compare-gil-root-wire.py`，也不替代从 raw 独立重算的 Validator。

相邻实验复制上一轮 validate.py 作为新 Validator 时，必须重新核对：`EXPECTED` 两个 SHA-256
与 `raw/*.gil.sha256` 逐字节一致、断言方向（before/after）与本轮唯一变化一致、删除不再
适用的旧断言；核对后再从原始快照运行。

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

## 解码纪律（2026-08-06 实体线教训）

- 读 varint 值必须从字段 `dataStart` 起 `readVarint`；项目 `parseMessage` 不输出 wire0
  字段，自写解析器对 wire0 的 dataStart 若留 -1，读越界会得到假 `v=0`
  （aux 记录 f1/f2 曾整批误判为 0）。解析器须给 wire0 记录值字节区间，或直接跳过。
- 未知 blob 先按 protobuf key（field<<3|wire）解析；平铺 varint 流解读要警惕
  “varint 值恰好等于 key 编码”的巧合：4010 = 501<<3|2、4016 = 502<<3|0，
  `[4010,len,id×N]` 实为嵌套 message `{f501: id列表}`（实体挂装饰物 f50）。
- 多版本/多位置交叉验证可暴露单点误读：v6 球体材质槽 f5 “0x07B5AED7 材质引用”
  是 5 字节 varint `d7 ae b5 07` 读反，实为颜色 RGB 0xED5757；f5 恒为 f3 的 RGB。
- root 45 类“恒定值”也要放到全快照链上验证起点（v0 无 → 空记录 → 首值），
  恒定不等于静态字段，可能是编辑器会话状态（如最近使用颜色 MRU）。

### 记录定位与 varint 的重复坑（2026-08-07 挂载选题教训）

- **5 字节 varint 是完整 32 位值**：`b7 80 80 82 04` = 55 + 2×128³ + 4×128⁴ =
  1077936183（全值），不是“低 22 位/掩码短号”。GIL 的 defID/实例 ID/图 GID 都用
  完整值；按短号或前缀猜测会整批错记（mount 选题曾把 root8 f2.f1 误记为
  “defID 低 22 位”，实为全值；图 GID 同理 = 1073741828 而非 1828）。
  算 varint 必须展开到末字节，位数不够时补 128^n，别只读前两字节。
- **diff 的 `encodedBytes` 含 tag+len 前缀**：directChildDelta 里记录大小比 value
  大 2–3B（如 601B encoded = 598B value）；按长度/hex 找记录时要减前缀，
  否则匹配不到（mount-case4 曾因此空手）。
- **多记录容器先列全部候选 ID 集合再定点**：root8 同时存在 f1=1077936183 与
  1077936187 两条记录，按 f1 过滤直接匹配会命中未变化的记录（结论碰巧一致但
  证据链错）。定位前先 dump 容器的 f1+长度清单，确认唯一性。
- **嵌套包装层数按真实 hex 逐层数**：type3 挂载槽是 `f13.f1.f1={1:1,2:GID,
  501:20000}` 两层 f1 包装；读盘点时按结构相似推断单层，写生产工具时构造出错，
  靠真实快照逐字节对比测试抓回。新容器的嵌套深度必须从真实记录 hex 数，
  不能凭“跟之前那个一样”。

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
