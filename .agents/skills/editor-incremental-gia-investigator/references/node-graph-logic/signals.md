# 节点图逻辑模块：信号

只在调查信号注册、发送、监听、信号参数、信号数据连接或信号 GIA/GIL 时加载本模块。通用快照、安全确认和证据层级仍由主 `SKILL.md` 负责。

## 最小恢复字段

续作只需恢复：

```text
map path / mapId
nodeGraphId / graph name
previous snapshot path + SHA-256
用户约定的唯一变化
已确认覆盖矩阵 / 下一缺口
信号名 + sendId/monitorId/serverId（仅已从地图读取时）
```

当前领域 Authority：`docs/game-engine-knowledge/signals.md`。若该文件已覆盖问题，不再加载索引、编译管线、历史 handoff 或 PKC。

## 持久证据目录

默认根目录：

```text
${GTS_EVIDENCE_HOME:-$HOME/genshin-ts-evidence}/node-graph-logic/signals/
```

推荐按实验分组：

```text
<date>-<experiment>/
├── raw/       # 用户编辑器保存的不可变相邻 GIL
├── replay/    # 手工 GIA、临时注入 GIL、最小重放脚本
└── notes/     # 有界摘要或 manifest；不替代原始文件
```

作为规则证据的原始 GIL/GIA 不再只写 `/tmp`。使用：

```bash
python .agents/skills/editor-incremental-gia-investigator/scripts/capture-evidence.py \
  <source> \
  "$HOME/genshin-ts-evidence/node-graph-logic/signals/<experiment>/<kind>"
```

脚本拒绝覆盖，复制后校验 SHA-256，并生成同名 `.sha256`。临时解码输出可以留在 `/tmp`；被文档引用的原始快照、候选和重放结果必须持久化。

## 快速相邻比较

已锁定实验直接运行现有通用比较器，不先列地图或全图：

```bash
npx tsx tools/compare-gil-node-graph.ts \
  <before.gil> <after.gil> <nodeGraphId>
```

摘要确认只有约定节点变化后才加 `--full`，并定点提取：

```text
nodeIndex
genericId / concreteId / signalVersion
pin kind + index / type / compositePinIndex
value / connects
图 metadata 和节点数是否保持
```

## 修改信号与创建信号复用

“修改信号”不是全局文本替换，而是创建信号的原位替换变体。复用 `src/cli/gil_signal_registrations.ts` 的参数模板池、`buildIndexEntry()`、`buildDefinition()` 和严格结构回读：

```bash
npx tsx src/cli/assets_signals.ts update \
  --gil <map.gil> \
  --target-signal <existing-name> \
  --name <result-name> \
  --param <name:type> ... \
  --write
```

更新路径从当前地图自动读取目标 signal 的 send/monitor/server ID，原位替换注册表及三份定义；ID、类型编码结构、pinIndex 分配和其他信号保持约束。不能手填或推算 ID，也不能用一次性递归文本脚本替代共享编码器。写回前必须候选回读，写回时先备份并做源 hash 竞态检查；写回成功只证明文件替换和结构回读成功，不证明编辑器导入或游戏行为正确。

## 当前地图信号发现与监听切换

列出当前注册信号时，优先复用 `src/cli/gil_signals.ts` 的 `readRegisteredSignalsFromGil()`，只输出有界摘要：

```text
name / sendId / monitorId / serverId / 参数类型顺序
```

`tools/decode-gil-signals.ts` 和旧 accessory 扫描器只覆盖其历史 GraphUnit 布局；在当前 GIL 返回 0 不能证明地图没有注册信号，也不能作为监听切换入口。若保留该工具，应让它复用规范读取函数或明确标注适用范围。

可复用的监听替换工具只接收目标 `signalName`；其余字段必须从锁定的当前 GIL 自动解析，不让调用者手填或推算：

```text
monitorId
monitor CompositeDef 的 outflow / 固定输出 / 参数输出 pinIndex
信号名 pin 的 compositePinIndex
参数名称、类型和定义序号
```

信号名 pinIndex 必须由当前注册定义布局和至少一个同构真实监听样本共同闭合；不能把定义中的空号、相邻信号 ID 或历史样本 pinIndex 单独当成证据。切换时只覆盖已闭合的 `signalName`、`genericId/concreteId=monitorId` 和信号名 `compositePinIndex`，保留 `signalVersion`、节点坐标及其余结构；输出后严格回读。

同一次运行生成同源产物：

```text
replay/<candidate>.gia  # 正式编辑器导入包装
replay/<candidate>.gil  # 临时 injector 回读
```

正式 GIA 至少断言 header `fileType=3`、Entity root identity、有效 `filePath`、当前 `gameVersion`、Root/inner graph ID 一致；不要复用仅供 injector 单测解析的最小 fixture 包装。

### 监听切换 focused regression

保留一个最小回归，使用持久 donor/target fixture 或去标识化等价 fixture，至少覆盖：

- 仅给目标信号名即可解析 `monitorId` 和信号名 pinIndex；
- 目标监听节点 `genericId = concreteId = monitorId`、`signalVersion` 保持；
- 参数定义布局与信号名 pinIndex 可回溯到当前注册定义；
- 正式 GIA 包装字段存在且 header 合法；
- 临时 GIL 回读后的目标 NodeGraph 与候选严格一致；
- 未知信号、定义不完整或同构证据不足时 fail closed。

Skill/调查工具由 `tsx` 直接运行且不进入生产构建时，运行该 focused regression 和 `git diff --check` 即可；只有修改生产信号 lowering、公共 injector 或构建代码时才运行 `npm run build`。

## 信号专项断言

### 绑定发送节点

- 编辑器可能删除未绑定 `SysCall 300000` 并以新 `nodeIndex` 创建信号节点；
- `genericId`、`concreteId`、`signalVersion` 和信号名 pin 必须按真实注册定义检查；
- 未赋值参数不应因注册定义存在而自动编码实例 pin。

### 参数增量

每个新增参数至少检查：

```text
定义序号（0-based，不因中间参数缺失而压缩）
VarType
VarBase oneof/value 字段
alreadySetVal
compositePinIndex 是否来自该信号定义
直接值或 connects 的来源与方向
```

同一已确认固定值骨架可以批量填写并逐项断言；`entity` 数据连接、列表 Assembly、监听输出或客户端节点属于不同骨架，必须拆开。

编辑器/游戏验收分别记录：文件被扫描、编辑器显示候选、导入成功、目标监听信号正确、参数输出/消费正确、游戏行为正确；不得用前一层代替后一层。

## 当前覆盖与停止条件

当前已验证覆盖和待验证项只读 `docs/game-engine-knowledge/signals.md`，不在本模块复制具体 ID 或测试值。

出现以下情况停止本轮推广：

- 除目标图/节点外出现无法解释的结构变化；
- 参数类型和值 oneof 不匹配；
- `compositePinIndex` 无法回溯到当前注册定义；
- 需要区分 protobuf 缺失与默认值但尚无 wire/round-trip 证据；
- 用户切换信号、地图或图而未重新锁定恢复字段。
