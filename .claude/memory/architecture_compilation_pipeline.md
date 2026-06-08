---
name: 编译管线架构与复合节点支持
description: gsts 编译器的完整四阶段管线架构 + GIA 二进制格式解析/编码 + 复合节点(CompositeNode)支持的实现状态
type: project
keywords: [编译管线, pipeline, gsts, ir, gia, protobuf, 节点图, node_graph, 四阶段, ts_to_gs, gs_to_ir, ir_to_gia, 注入, injector, gil, 解码, 编码, 对比, diff, hidden_pin, assembly_list, assembly_dictionary, 类型系统, nodetype, varbase, composite, 复合节点, defineComposite, callComposite, CompositeRegistry, CompositeDefIR, compositePins, accessories]
---

搜索关键词指南：使用 `search_graph` 搜索以下关键词可找到对应内容：

- **编译管线整体**：搜索 "gsts"、"pipeline"、"编译阶段"
- **特定阶段**：搜索 "ts_to_gs"、"gs_to_ir"、"ir_to_gia"、"injector"
- **GIA 格式**：搜索 "gia.proto"、"protobuf"、"decode_gia_file"
- **节点定义**：搜索 "node_pin_records"、"NODE_ID"、"concrete_map"
- **类型系统**：搜索 "NodeType"、"VarBase"、"VarType"、"reflects_records"
- **特殊处理**：搜索 "hiddenPin"、"filterUnkPins"、"assembly_list"、"send_signal"
- **对比工具**：搜索 "compare-gia"、"gia diff"、"往返测试"
- **复合节点**：搜索 "composite"、"defineComposite"、"callComposite"、"CompositeRegistry"

完整文档存储在 codebase-memory-mcp 的 ADR 系统中：
- ADR-001: TS→GIA 编译管线架构
- ADR-002: GIA 二进制格式解析与对比能力分析

## 复合节点实现状态（2026-06-08）

### 已完成
- IR 类型扩展：CompositeDefIR、ParamFlowDef、CompositeCallMeta、CompositePinEntry
- CompositeRegistry 注册中心（src/runtime/composite_registry.ts）
- DSL API：g.defineComposite() / f.callComposite()
- 供应商层支持：composite_pin_body() / graph_affiliation_body() / Graph 类扩展
- irToGia() accessories 生成
- 导出新 API（src/index.ts）
- 编译零错误，端到端测试通过

### 待完成（按优先级）
1. **impl 节点捕获**：创建临时 MetaCallRegistry 运行 build()，捕获内部节点和 edges
2. **调用连线**：callComposite() 时将 build 内节点复制（带 ID 重映射）到当前 flow
3. **复合接口映射**：从输入/输出推断 CompositePin 映射关系
