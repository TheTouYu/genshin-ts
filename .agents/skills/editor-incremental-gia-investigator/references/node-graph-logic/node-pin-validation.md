# 节点图逻辑模块：节点实例 pin 快速回验（第三方优先）

只在任务涉及“编辑器配置节点参数/连线后，验证 GIL 中节点实例 pin 是否符合预期定义”
时加载本模块。核心思路：**第三方仓库 data.json 提供 95% 可信的节点定义，先用它快速回验
实例编码；冲突或异常时再回退到自有相邻差分规则**（真实 GIL 证据永远优先于第三方）。

## 最小恢复字段

```text
目标 GIL 路径 / nodeGraphId
用户声明的唯一变化（配置了哪些参数、值）
第三方 data.json 路径（默认 /home/h/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack/utils/node_data/data.json）
已有相邻快照（before）与 SHA-256
```

## 快速回验流程（两脚本闭环）

```bash
# 1. 第三方定义（节点名/属性/引脚 Shell/Kernel/类型/Label）
python .agents/skills/editor-incremental-gia-investigator/scripts/extract-node-defs.py <data.json> <id...>
python .agents/skills/editor-incremental-gia-investigator/scripts/extract-node-defs.py <data.json> --list

# 2. 真实实例 pin 解码（i1/i2 kind+index、type VarType、value 全字段）
python .agents/skills/editor-incremental-gia-investigator/scripts/inspect-graph-nodes.py <map.gil> <graphId> --pins
```

对照判定（2026-08-05 v5/v6 已闭合）：

| 检查项 | 规则 | 状态 |
|---|---|---|
| 节点身份 | genericId=concreteId=NodeProperty{1:10001,2:20000,3:22000,5:ID}；ID 与 data.json ID 一致 | CONFIRMED |
| i1.index | = data.json ShellIndex（0 时 wire 缺失）；252 实测 0,1,2,5,6 全对齐 | CONFIRMED |
| type | = VarType 数字（21=Pfb/12=Vec/4=Bol/3=Int/6=Str/2=Gid/1=Ety...，见 parameter-types.md） | CONFIRMED |
| value.class | 1=IdBase/2=IntBase/4=FloatBase/5=StringBase/6=EnumBase/7=VectorBase | CONFIRMED |
| value oneof | 101=bId/102=bInt/104=bFloat/105=bString/106=bEnum/107=bVector{1:{1:x,2:y,3:z}} | CONFIRMED |
| bool | false=bEnum 空消息；true=bEnum{1:1}（signals.md） | CONFIRMED |
| i2.index | **语义未闭合**（v6 实测 5/7 与 data.json KernelIndex 不对齐） | INSUFFICIENT |
| SysCall InParam CPI | 无 compositePinIndex（仅 SysGraph 有） | CONFIRMED |

## 95% 信任原则与冲突回退

- 第三方 data.json（v2.2.10, GameVersion 6.3.0）是快速参照，**不是权威**：
  - 名字/引脚方向/类型基本可信（98%）；内部版本可能有分歧（如 252 的 data.json 8 参数 vs
    game_nodes.ts md 注释 7 参数——已由真实 i1.index 裁决 data.json 正确）
  - 遇第三方内部矛盾：不做价值判断，用真实相邻差分裁决
- 回退顺序（冲突时）：真实相邻差分 > vendor gia.proto 字段号 > data.json 定义 > md 注释
- 真实 GIL 与第三方不一致时，以文件事实为准并标记 `CONFLICT`，不静默采纳第三方
- 只把真实增量 + Validator 接受的结论写入 Authority；第三方单独提供的命名/枚举只作
  语义标签，不命名 wire 字段

## 工具

- `scripts/extract-node-defs.py`：第三方节点定义提取（--list / 按 ID）
- `scripts/inspect-graph-nodes.py`：目标图全部节点摘要；--pins 输出实例 pin 详细解码
- `tools/compare-gil-node-graph.ts`：图级相邻差分（added/removed/changed + pinCount）
- `scripts/compare-gil-root-wire.py`：全 root raw-bytes 差分（捕获图记录外变化）

## 停止条件

- 实例 pin 与定义出现无法解释的错位（index/type/oneof 不匹配）；
- 第三方两版本冲突且真实样本不足以裁决（保持 INSUFFICIENT，不猜）；
- 出现图记录之外的结构变化（先记录，回退对照轮验证）。
