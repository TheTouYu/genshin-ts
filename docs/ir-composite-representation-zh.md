# IR JSON 中间过程中复合节点的完整表示

> ⚠️ **本文档已拆分为独立文件**，参见 [`docs/composite-ir/`](composite-ir/index.md) 目录。

本文档原始内容（840 行）已按主题拆分为多个独立文件，便于阅读和维护：

| 文件 | 内容 |
|------|------|
| [`index.md`](composite-ir/index.md) | 文档索引与总览 |
| [`01-ir-types.md`](composite-ir/01-ir-types.md) | 类型定义（CompositeDefIR/PinEntry/CallMeta/compositeDataEdges/Capture） |
| [`02-ir-examples.md`](composite-ir/02-ir-examples.md) | 完整 IR JSON 示例 |
| [`03-validation-basics.md`](composite-ir/03-validation-basics.md) | 01.gia 校验 + 跨文件对比（8 文件，11 条规律） |
| [`04-validation-signal.md`](composite-ir/04-validation-signal.md) | 信号型复合验证（6 文件，ClientExec pin, 重复条目） |
| [`05-gia-encoding.md`](composite-ir/05-gia-encoding.md) | GIA 编码数据流 + 代码位置速查 + 工具说明 |
