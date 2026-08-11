# main 轮复盘 playbook（2026-08-12：主图六面重构 + 复合实例克隆 + 跨文件合并）

本文件沉淀魔方系列第 3 轮（turn-ctl 主图 1073741846 重构）实测经验。主 SKILL.md 的
ops 表/未闭合清单与此互补；两处若有出入以本文件较新结论为准（SKILL.md 并行落地后合并）。

## 1. 复合实例克隆流程（node-add 不可行的替代路径）

实测：5 Bind + 5 Hold + 6 状态复合实例全部用克隆，无一次 node-add 成功。

1. **node-add 只产 kind=22000（SysCall）**；复合实例 wire 须 kind=22001（CompositeGraph）。
   `node-add 1610700002 ...` 出来的节点引擎不认 → 一律克隆：
   - 同图克隆：`node-copy <src-idx> <x> <y>`（如 Bind 源 n46 → 5 face 克隆）
   - 跨文件克隆：`node-copy-from <src-gid> <idx> <x> <y>` 配 `--src-gil <文件>`
     （state-cand 主图的惰性零 pin 实例克隆即干净，最省事）
2. 克隆自带源 pin（如 n46 克隆带 pivot←n47、complete→n48）→ 克隆后先
   `unlink 0` + `flow-rm 0 <dst>` 清理，再按新链接线。
3. 接线时实例 pin **惰性重建**（cpi 由 def 经 instanceMeta 注入）——回读确认实例 pin
   带 `cpi=`（Bind/Hold：pivot=100、c1..c4=1975..1978、complete=4；状态复合：
   face=1976、direction=1977、complete=1975）。pin 形态 = 值/连线二选一，与真实图同构。

## 2. E<1016> 守卫线绕行（Get/Set Local Variable 身份线）

- `link` 无法解析 E<1016>（INPUT_TYPE 缺该类型码；nodeInputType(19,0) 返回 'E<1016>' 失败）
  → 用 `node-copy-from <src-gid> <43,44>` 成对克隆守卫（GetLocal+SetLocal 闭包内连线
  自动重映射，5 对一次到位）。读图侧语义见 gil-node-graph-reading（E<1016> 是局部变量
  类型码不是索引；局部变量 wire 无名）。

## 3. Equal+DB 分派模式（停止事件 → 多 face 分派）

- 每 face：`Equal(名称==ctl_x_turn)` 是**数据节点**，Bol 接 DB；DB true 分叉走该 face
  续链、**false 串到下一个 DB**（不是串 Equal！首版误把 false 接 Equal 报
  "OutFlow shell 1 has no connects to node 65"）。
- reset 分派同理：各 face reset 的 DB true 汇聚到同一解锁点（busy=false）。
- 续链形态：Hold(pivot+c1..c4) → 状态复合(face+direction) → 520 reset → 停止 → DB(true→解锁)。

## 4. op 生成器检查单（批量 ops 脚本，先自查再 patch）

- 值类型前缀**首字母大写**（Str:/Flt:/Bol:/Vec:；parseTypedValue 大小写敏感，
  小写报 `[error] 未知值类型 str`——本轮 sed 's/ str:/ Str:/g' 修复）
- 生成后断言：
  1. 删除索引 ⊆ 新增索引集合（node-del 后空洞被 node-add 复用，diff 显示 changed 而非 removed）
  2. **无两节点同坐标**（本轮重复克隆 63/73..76/82..86 因此漏检，靠 parse 回读坐标重叠才发现；
     先按 (x,y) 去重断言可一次抓到）
  3. 数据源与消费者 |dx| ≤ 1200（data-detached lint 上限）：900 行距下 4 节点数据簇只能
     与消费者同行环绕（c1..c3 在 SetVar 与 Bind 之间、c4 与 pivot 在 Bind 与 520 之间）
- patch 后先 `parse --json` 回读索引映射与生成器预期逐号核对，再接线下一个 stage。

## 5. 跨文件合并复合（def+impl 结构复制）

`npx tsx tools/merge-gil-composite.ts <src.gil> <dst.gil> <defId> <out.gil>`：

- 自动解析 implId（`compositeImplGraphId` 读 def field4.sub4；defId≠implId 可用，
  如 1610700002 → 1610710002）
- 原理（GIL root 布局实证）：root.field10 单大容器内按分组平铺（主图组 f1、def 组 f2、
  p1=3 组、impl 组 f4、p1=5 组）；每条记录 = `{1: 记录}` 子消息；合并 = 记录容器
  （tag+len+value 整条 wire）原样插到对应分组尾部 + field10 长度 varint + 文件头
  u32@0=payload+20 / u32@16=payload（尾 tag 不动）。
- 验证：`diff-gil-files dst out` 只新增 def+impl；`diff-gil-files src out` 无 def/impl 变化。
- 回归证据：state-cand(状态复合) → bind-hold-cand 合并结果与人工 merge_state3 输出
  **逐字节相同**（sha256 318e2825…）。

## 6. diff-gil-files JSON schema（管道解析别再猜键）

两段（graphs/composites）各：`{beforeCount, afterCount, added[], removed[], changed[],
unchanged}`——**`unchanged` 是 int 计数不是列表**（无 `unchangedCount` 键）。
本轮 4 次报错全因猜键（KeyError unchangedCount / len() on int）。
