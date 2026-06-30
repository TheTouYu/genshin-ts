# IR JSON 完整示例

纯数据复合、执行型复合、主图调用的完整 JSON 示例。

## 1. 纯数据复合：整数加法

```json
{
  "name": "整数加法",
  "id": 1610700000,
  "type": "composite",
  "inflows": [],
  "outflows": [],
  "inputs": [
    { "name": "a", "visible": true, "index": 0, "type": "int", "pinIndex": 100 },
    { "name": "b", "visible": true, "index": 1, "type": "int", "pinIndex": 101 }
  ],
  "outputs": [
    { "name": "sum", "visible": true, "index": 0, "type": "int", "pinIndex": 200 }
  ],
  "implNodes": [
    { "id": 2, "type": "__composite_capture__", "args": [] },
    {
      "id": 3,
      "type": "addition",
      "args": [
        { "type": "conn", "value": { "node_id": 2, "index": 0, "type": "int" } },
        { "type": "conn", "value": { "node_id": 2, "index": 0, "type": "int" } }
      ]
    }
  ],
  "implEdges": {},
  "compositePins": [
    { "outerPinKind": 3, "outerPinIndex": 0, "innerNodeId": 3, "innerPinKind": 3, "innerPinIndex": 0 },
    { "outerPinKind": 3, "outerPinIndex": 1, "innerNodeId": 3, "innerPinKind": 3, "innerPinIndex": 1 },
    { "outerPinKind": 4, "outerPinIndex": 0, "innerNodeId": 3, "innerPinKind": 4, "innerPinIndex": 0 }
  ]
}
```

- `__composite_capture__`（id=2）是输入占位符，通过 compositePins 映射到外部
- 同一输入 `input a` 被 addition 使用两次（fanout）

## 2. 执行型复合：条件分支（多 OutFlow）

```json
{
  "name": "条件分支",
  "id": 1610700001,
  "type": "composite",
  "inflows": [
    { "name": "", "visible": true, "index": 0, "pinIndex": 1974 }
  ],
  "outflows": [
    { "name": "", "visible": true, "index": 0, "pinIndex": 8 },
    { "name": "", "visible": true, "index": 1, "pinIndex": 9 }
  ],
  "inputs": [
    { "name": "条件", "visible": true, "index": 0, "type": "bool", "pinIndex": 100 }
  ],
  "outputs": [],
  "implNodes": [
    { "id": 2, "type": "__composite_capture__", "args": [] },
    {
      "id": 3,
      "type": "double_branch",
      "args": [
        { "type": "conn", "value": { "node_id": 2, "index": 0, "type": "bool" } }
      ]
    }
  ],
  "implEdges": {
    "3": [
      { "node_id": 2, "source_index": 0 },
      { "node_id": 2, "source_index": 1 }
    ]
  },
  "compositePins": [
    { "outerPinKind": 1, "outerPinIndex": 0, "innerNodeId": 3, "innerPinKind": 1, "innerPinIndex": 0 },
    { "outerPinKind": 2, "outerPinIndex": 0, "innerNodeId": 3, "innerPinKind": 2, "innerPinIndex": 0 },
    { "outerPinKind": 2, "outerPinIndex": 1, "innerNodeId": 3, "innerPinKind": 2, "innerPinIndex": 1 },
    { "outerPinKind": 3, "outerPinIndex": 0, "innerNodeId": 3, "innerPinKind": 3, "innerPinIndex": 0 }
  ]
}
```

## 3. 主图中对复合的调用

主图中复合调用表现为 `__composite_call__` 类型的标记节点：

```json
{
  "id": 5,
  "type": "__composite_call__",
  "args": [
    { "type": "int", "value": 1610700000 },
    { "type": "conn", "value": { "node_id": 3, "index": 0, "type": "int" } },
    { "type": "int", "value": 42 }
  ],
  "next": [{ "node_id": 6, "source_index": 0 }]
}
```

**参数规则**：
- `args[0]`：compositeId（int 字面量，引用 compositeDefs 中的定义）
- `args[1..N]`：复合的输入参数（数据连接或字面量）
