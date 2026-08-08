# 节点图「读-改-写」精准修改工具（gsts assets:node-graphs read/patch）

> 状态：当前实现（CLI + 自动回归，未做真实地图写回与游戏核验）
> 来源：真实相邻快照同构重放测试（`tests/gil_nodegraph_edit_test.ts`，30 项全绿）
> 最近校验：2026-08-08（round3：composite create / del-input / swap-input）
> 适用范围：普通节点图（root10.field1）与复合定义/impl 图（root10.field2/4）的
> 记录级精准修改；未闭合规则一律 fail closed

## 定位

`gsts assets:node-graphs read|patch` 是对地图里**任意节点图具体逻辑**做精准
读-改-写的 CLI。与 `assets:entities`/`assets:mounts` 同一套记录级局部替换管线：
只替换目标 NodeGraph / CompositeDef 记录字节，其余 root 原样保留，祖先长度前缀
由 `applyReplacement` 自动修复。

- 读侧：图/节点/引脚/连线/复合接口的当前 wire 状态（含 pinIndex、类型、值、连线）。
- 写侧：位置、参数固定值、数据连线（增/改/断）、控制流连线（增/删）、复合改名、
  复合参数改名。
- 复合实例（SysGraph 节点）与普通节点共用同一套原语，仅多 field7=pinIndex
  （从 CompositeDef 参数流解析，不需要用户手填）。

## 命令

```bash
# 读
gsts assets:node-graphs read --gil <file.gil>                          # 全部图 + 复合定义
gsts assets:node-graphs read --gil <file.gil> --graph <id|name>        # 图内节点/引脚/连线
gsts assets:node-graphs read --gil <file.gil> --graph <id|name> --node 24
gsts assets:node-graphs read --gil <file.gil> --composite <id|name>    # 复合接口
gsts assets:node-graphs read --gil <file.gil> --graph 样本-01 --json   # 机器可读

# 写（默认预览；--output 候选文件；--write 备份后写真实地图）
gsts assets:node-graphs patch --gil <file.gil> --graph <id|name> node 24 pos 1200 1500
gsts assets:node-graphs patch --gil <file.gil> --graph <id|name> node 4 param 0 pfb:1234
gsts assets:node-graphs patch --gil <file.gil> --graph <id|name> node 24 link 1 12
gsts assets:node-graphs patch --gil <file.gil> --graph <id|name> node 24 unlink 1
gsts assets:node-graphs patch --gil <file.gil> --graph <id|name> node 11 flow 1 24

gsts assets:node-graphs patch --gil <file.gil> --graph <id|name> node 11 flow-rm 1 24
gsts assets:node-graphs patch --gil <file.gil> --graph <id|name> node-add 83 -908 1274
gsts assets:node-graphs patch --gil <file.gil> --graph <id|name> node-del 3
gsts assets:node-graphs patch --gil <file.gil> composite 1610612744 rename 我的复合
gsts assets:node-graphs patch --gil <file.gil> composite 1610612744 param input 1 rename 目标实体
gsts assets:node-graphs patch --gil <file.gil> --graph <id|name> composite 1610612744 add-input 2 控制表达式 int 3 0
# add-input = 提升 impl 内部节点 pin 为复合输入：<shell> <name> <type> <inner-node> <inner-shell>
gsts assets:node-graphs patch --gil <file.gil> --graph <id|name> composite 1610612744 del-input 2
gsts assets:node-graphs patch --gil <file.gil> --graph <id|name> composite 1610612744 swap-input 0 1
gsts assets:node-graphs patch --gil <file.gil> --graph <id|name> composite create 我的复合 1 1 11
# create = 打包选中节点：<name> <anchor-idx> <node-idx...>（锚点原位变实例；
# 控制流出口自动提升；数据输入留在内部；defId=0x6000000N 最小空闲）
```

参数固定值类型前缀：`int:` `flt:` `str:` `bool:` `vec:x,y,z` `gid:` `pfb:` `cfg:`。
`link` 新建 pin 的类型从**目标定义**解析（普通节点 = data.json 输入类型名；
复合实例 = CompositeDef ParameterFlow.type1）；解析不到则报错不猜测。
`unlink` 按目标 pin 形态决定行为（见下表）。

## 已闭合操作与证据

每个操作都有真实相邻快照同构重放测试，断言与编辑器产物**逐字节一致**：

| 操作 | 证据 | 测试 |
|---|---|---|
| 节点位置 f5/f6 | fixed32 编码（结构自洽 + 幂等） | pos 回读/幂等 |
| InParam 固定值（新建/替换） | node-graph-systematic v4→v5（Pfb 1234） | v4→v5 全图 blob 一致 |
| 数据连线（新建 pin） | dataflow-case1（shell1 ← n12） | 全图 blob 一致 |
| 数据连线（非默认源 Shell 显式 index） | dataflow-case2（n13 OutParam[1]） | 全图 blob 一致 |
| 数据连线（多 pin 目标升序插入） | dataflow-case4（shell0 插头部） | 全图 blob 一致 |
| 数据连线（替换语义：改写 connects.id） | dataflow-case3（n24 shell1: 12→23） | case3 在 case2 基础上重接一致 |
| 断数据线（Fixed 目标整 pin 移除） | v21→v22 / case17/18 断线行为 | unlink∘link = identity（整文件） |
| 控制流连线 OutFlow[1/2/3] + 默认/非默认目标 InFlow | control-flow-case1/2/3、dataflow-case5 | 全图 blob 一致（case3 节点级） |
| 断控制流线（多 connects 删一条） | flowrm-case1（v53→v54） | 全图 blob 一致 |
| 断控制流线（删到空 = 整 pin 移除） | flowrm-case2（v54→v55） | 全图 blob 一致 |
| 新增节点（最小空闲空洞 + 无 pin + 引用构造） | node-add-case1（v55→v56） | 全图 blob 一致 |
| 删除节点（移除记录，def 保留） | node-del-case1（v56→v57） | 全图 blob 一致 + del∘add=identity |
| 新增有参数节点（无默认 pin 落盘） | node-add-case2（v57→v58） | 全图 blob 一致 |
| Ety 参数连线（与普通数据线同构） | ety-wire-case1（v58→v59） | 全图 blob 一致 |
| 复合加输入参数（def 参数流 + impl 嵌套 pin + 实例重编号/原位判定） | composite-add-param-case1/2、promote-input-case6（v59→v67） | case1 def/图 blob 一致、case6 impl blob 一致 || 复合改名 def.name(200) | composite-case2 | def blob 一致 |
| 复合参数改名 flows[].name(1) | composite-case5 | def blob 一致 |
| 复合实例填值（f7=pinIndex） | composite-case6 | 全图 blob 一致 |
| 复合实例连线（f7=pinIndex） | composite-case7 | 全图 blob 一致 |
| 复合创建（锚点原位变实例 + 出口提升 + 内部搬入 + 新 def/impl 图） | composite-create-multinode-case8（v67→v68） | 宿主/def/impl 三 blob 一致（pinStart 显式） |
| 复合删输入（def flow 删 + compositePins 整删 + 实例 pin 删/前移 + 重编号） | del-param-case4（v62→v63） | 三 blob 一致；case5 重编号跨轮墓碑=边界 |
| 复合换输入（def 内容互换 + compositePins inner 互换 + 实例 pins 互换 + 重编号） | swap-inputs-case8（v29→v30） | def/impl 一致 + 实例 pins 一致；重编号=边界 |

## 已闭合编码规则要点（wire 级，详见 game-engine-knowledge/）

- pin 数组排序：OutFlow（kind=2）按 ShellIndex 升序在前，InParam（kind=3）升序随后，
  其余 pin 保持原相对顺序（node 11 多分支 / 复合实例 node 7 实测）。
- 默认 Shell（0）的 i1/i2 index 与 connects 对端 index 省略；非默认显式。
- 数据连线挂**目标侧** InParam（connects={1:源 nodeIndex, 2/3:{kind=4, 源 Shell}}），
  源侧不落盘；控制流挂**源侧** OutFlow（connects={1:目标 nodeIndex, 2/3:{kind=1, 目标 Shell}}）。
- 目标 InParam 已有线 = 替换（改写 connects，不新增 pin/connects）；已有 value 保留
  （Variant 实例 pin 形态，value 与 connects 并存）。
- 值编码 VarBase：f1=class、f2=alreadySetVal=1、f4=itemType{f1:1, f100:{f1:VarType}}、
  101=bId / 102=bInt / 104=bFloat / 105=bString / 106=bEnum(false=空消息) / 107=bVector。
- 复合实例（SysGraph 22001）pin 多 field7=pinIndex，来自 CompositeDef 参数流
  （inputs/outputs=102/103，inflows/outflows=100/101，pinIndex=f8）。

## 未闭合（fail closed，需快照实验补齐）

- **节点增删**：**已闭合**（add/del 记录形态 + 最小空洞 + 删除号会话墓碑 + 无默认 pin）；
  剩余缺口：**Variant 节点新增**（concreteId 选择未闭合，工具 fail closed）；跨命令序列的
  删除空洞（编辑器会话内墓碑，工具仅在同一 patch 命令序列内跟踪）
- **复合接口结构变更**：**加输入参数已闭合（接口部分）**（composite-add-param-case1/2 +
  promote-input-case6：def 参数流追加 + impl compositePins 升序插入 + 实例重编号最小空闲
  + 原位判定；命令 `composite <def-id> add-input <shell> <name> <type> <inner-node> <inner-shell>`）；
  **删输入已闭合（接口部分）**（del-param-case4：def flow 删 + 后续 ShellIndex 前移、
  compositePins 整删、实例 pin 删/前移、实例重编号排除原位；命令 `composite <def-id> del-input <shell>`；
  compositePins **outer 前移**（删中间参数）无样本=推断）；
  **换输入已闭合（接口部分）**（swap-inputs-case8：def 内容互换 + field3 重写、
  compositePins outer 不动 inner 互换、实例 pins 互换 + 身份重写；命令 `composite <def-id> swap-input <a> <b>`）；
  **创建复合已闭合（骨架）**（composite-create-multinode-case8：锚点原位变实例、出口自动提升、
  内部搬入/坐标相对化/OutFlow 剥落/节点级旧式 connects 并入 InParam[0]、新 def+impl 图双注册；
  命令 `composite create <name> <anchor> <nodes...>`；锚点选择默认最小 nodeIndex、
  数据输入自动注册为复合输入、锚点自带 OutFlow 提升均未闭合）。
  - **innerNode == 实例 nodeIndex 时重编号 fail closed**（case7 v66→v67 单样本：编辑器排除
    原位 3→5，与 case2 原位 3→3 矛盾的唯一可观测差异；规则 INSUFFICIENT，工具拒绝）
  - **实例零 pins 时提升 fail closed**（case3/4 v24-v26 两样本：编辑器排除墓碑移动）
  - **pinIndex 回收池 fail closed**：编辑器有删除史时回收池取最小（case6=51/case7=52，
    删除史不可从单快照推断）；工具用 def 内 max+1（case1 无删除史时与编辑器一致=60），
    有删除史时与编辑器不一致（文档边界，生成结构仍合法）
  - **全局 pinIndex 分配**：case2=89（61-88 被其他 def 占用/墓碑），工具 def 内 max+1=61
    无法重放全局史（边界）；create 用全文件 max+1 且跳过已占用，仍非回收池语义
  - **del/swap 实例重编号跨轮墓碑**：工具排除原位取最小空闲（总是移动）；编辑器另跳过
    跨轮墓碑号（case5：3/5 墓碑取 6；swap-case8：取 8），无会话史时工具可能取更小号
    （文档边界，case4 无跨轮史时逐字节一致）
- **Variant 自动实例化**：连线触发目标变体选型（concreteId=KernelID + R<T> pin 全量
  实例化）需要 data.json Variants 表联动，未实现；目标 pin 已存在时可正常连线
  （改写 connects 不触实例化）。
- **entity 固定值**：**编辑器不支持**（Ety 是动态值，游戏未启动时无值，只能由其他节点
  输出获取，用户 2026-08-08 编辑器实测）；`ety:` 前缀保持报错是正确设计。
  Ety 参数**连线**已闭合（ety-wire-case1：与普通数据线完全同构，type=1，工具 `link` 直接支持）。
- **i2.index 语义**：252 创建元件样本 i1≠i2，未闭合；工具按闭合规则写 i1=i2=shell。
- 复合实例 nodeIndex 重编号、pinIndex 全局分配器位置。

## 人机协同工作流

```text
用户描述意图（改什么逻辑）
  → read 展示现状（图/节点/引脚/连线/复合接口 + JSON）
  → 工具生成候选 diff（patch 默认预览，打印 applied 摘要 + candidateSha256）
  → 用户确认（--output 落候选文件，读回比对）
  → 写回真实地图（--write，自动备份到 .gsts/backups/）
  → 编辑器/游戏核验（必须重新加载地图再保存，否则编辑器保存会覆盖写回）
```

## 验证

```bash
npm run build
npx tsx tests/gil_nodegraph_edit_test.ts     # 30 项同构重放，全绿
git diff --check
```

自动回归证明与编辑器快照逐字节一致（记录级）；真实地图写回、注入、编辑器/游戏
核验是更高级别的证据，本轮未执行（工具开发完成后由用户按需核验）。
