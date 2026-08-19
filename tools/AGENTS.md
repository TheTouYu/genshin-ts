# `tools/`：交互式只读 GIA/GIL 分析工具

## 适用范围

这里放开发者手动运行的 GIA/GIL 解码、分析、拓扑和布局工具。它们不属于 CI 或发布流程；自动化脚本应放在 `scripts/`。

## 关键入口

- GIA 解码/追踪：`decode-gia.ts`、`analyze-composite-gia.ts`、`trace-gia-exec-flow.ts`、`trace-gia-dataflow.ts`。
- GIL 节点图/信号/变量：`parse-gil-node-graph.ts`、`explain-gil-node-graph.ts`、`decode-gil-raw.ts`、`scan-gil-signals.ts`、`inspect-gil-custom-variables.ts`。
- 差分/布局：`diff-gil-files.ts`、`dump-layout.ts`、`topology.ts`。
- PKC：`pkc.py`、`evaluate_pkc_retrieval.py`、`validate_pkc_bundle.py`（知识树操作，不是游戏分析工具）。

## 修改前

- 先确认工具是解码、结构分析、Composite 分析、拓扑、coverage、layout、PKC 还是 Markdown 预览用途。
- 涉及真实 GIA/GIL 结论时，先确定具体样本、命令、观察字段和结论范围；工具输出只是证据的一部分。
- 新工具以 argv 接收样本路径；不要硬编码用户本机路径或游戏目录。

## 修改规则

- 工具默认通过 `npx tsx tools/<tool>.ts <file>` 运行，应保持参数可见、失败信息清楚和输出适合人工检查。
- 工具必须保持只读，不修改 `.gia`、`.gil`、游戏目录或真实样本；PKC 工具按自身命令语义操作知识库，不碰游戏文件。
- 解码 JSON 默认值、结构统计和 coverage 分类不能单独证明 wire presence 或游戏行为；报告时要说明边界。

## 验证

- 使用仓库内或用户明确提供的最小样本运行工具，检查帮助、错误路径和正常输出。
- 改动 TypeScript 后运行 `npm run build`（若适用）和 `git diff --check`。
- 修改 PKC 工具后按 `tools/pkc.py --help` 或对应 `validate_pkc_bundle.py` 做冒烟验证。

## 不要做

- 不要把注入、批量修改、CI/发布任务放入这里。
- 不要把工具的成功输出写成“已在游戏内验证”。
