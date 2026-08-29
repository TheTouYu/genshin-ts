# Game Engine Rules Context

> 生命周期：active
> 恢复角色：current recovery
> 状态：当前推荐
> 来源：知识树 game-engine-knowledge / gia-wire-analysis / debug-log-format 节点 + 真实编辑器/GIA/游戏实证
> 最近校验：2026-08-29
> 适用范围：游戏引擎实测规则查询（信号、节点图、GIA wire、调试日志格式等）；查询与恢复不授权源码修改、GIA 写入或游戏文件操作

## 目标

为引擎规则类查询提供专门入口：信号注册表与编码（signalVersion 一致性、发送/监听节点骨架、固定值参数映射、导入改名语义）、节点图创建与挂载、GIA object model、调试日志格式等。此前这类查询在 compiler-diagnostics / static-gil-assembly-production 两个 context 下都命中不到（coverage gap），被迫降级 `query --level 2`——本 context 是 2026-08-16 A/B 评估（R9）指出的入口缺口的修复。

## 查询姿势

```bash
python tools/pkc.py progressive-query --context game-engine-rules --intent "signalVersion 一致性"
python tools/pkc.py progressive-query --context game-engine-rules --intent "导入改名语义"
```

未命中时按 wrapper 自动降级到 `query --level 2`，或直接：

```bash
python tools/pkc.py query "<意图全文>" --level 2
```

## 当前检查点

- signalVersion 一致性：注册表条目 f6 必须与三份 CompositeDef #4 最后 field5 相同（灯阵差分实证）；知识树 claim 在 signal-production-encoding / signal-node-instance-encoding topic。
- 复合重名改名产生 `(1)` 版本并存（足球复合实证，产生路径未锁定）——claim 在 composite-identity-and-related-ids topic。
- 知识树持续演进；稳定结论以 `python tools/pkc.py query --status current` 与各 topic 文件为准。

## 维护注意

- 本 context 覆盖节点若新增 topic/claim，无需改本文件；若检索意图词命中不到，优先用 `update-topic --keyword` 做官方检索调优（2026-08-29 已为 signal-production-encoding 补 signalVersion 关键词）。
