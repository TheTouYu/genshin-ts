---
name: 复合节点 GIA 差异分析
description: 对比游戏参考文件与生成文件的结构差异，列出所有需要修复的问题
type: project
---

# 复合节点 GIA 差异分析（2026-06-09）

## 修复状态

| 优先级 | 问题 | 状态 |
|--------|------|------|
| P0 | 主图 composite call 节点 (kind=22001) + relatedIds | ✅ 已修复 |
| P1 | impl graph 节点真实 pin 数据 + concreteId | ✅ 已修复 |
| P2 | compositePins 映射 (outer→inner) | ✅ 已修复 |
| P3 | accessories 过滤（仅输出调用的复合） | ✅ 已修复 |
| P4 | 杂项字段 (xxx=6, inflows, name, 坐标) | ✅ 已修复 |
| - | 纯数据复合 (type='data', 无 exec flow) | ✅ 已修复 |
| - | 复合间数据连线 (compositeDataEdges) | ✅ 已修复 |
| - | impl data_type_conversion 节点 pin 编码 | ✅ 已修复 |
| - | exec flow 路由（event→exec 复合, 跳过 data 复合） | ✅ 已修复 |

测试结果：Part3 42/42, basic_call ✅ 游戏验证通过, basic_call_param ✅ 游戏验证通过.

## 关键突破

### 1. 纯数据复合与 exec flow 分离
纯数据复合 (isPureData=true) 的 marker 注册为 type='data'，不参与 exec flow 链。
exec flow 只走 exec 复合。Post-encoding 清除纯数据复合的 OutFlow pin，并确保 event OutFlow 指向 exec 复合。

### 2. 复合间数据连线
在 `runCompositeCall` 中检测输入值的 `markPin` metadata，记录 data edges 到 `compositeDataEdges`。
在 irToGia 中通过 `graph.connect()` 建立数据连接。

### 3. data_type_conversion impl 节点修复
- resolveImplNodeId: 支持 `data_type_conversion_<outType>` 格式，从 args 推断 inType 拼接完整 key
- buildLiteralPin: 添加 IdBase(entity/guid/faction/prefab_id/config_id) 处理
- bConcreteValue 包裹: data_type_conversion 节点的 pin value 需要用 ConcreteBase(class=10000) 包裹
- OutParam pin: data_type_conversion 节点需要额外的输出 pin

### 4. createTypedValue 修复
entity/guid 等类型不再使用 generic() 占位，改用 entity()/guid() 等真实类型构造。
避免 capture 时 `matchTypes` 失败导致 "Generic parameter not matched" 错误。

### 5. removeUnusedNodes 兼容
纯数据流（无 exec node 但有 __composite_call__ data node）不再被过滤为 null。

## 已知遗留问题
- event 节点多余 OutParam pins (entity/guid 输出) — 参考 GIA 无此 pin
- nodeIndex 偏移（从 2 开始而非 1）— bootstrap flow 导致
- 纯数据复合 impl 节点 genericId/concreteId 区分（如 data_type_conversion 应该 genericId=180, concreteId=183）

## 参考文件
- `/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/真-测试通过/basic_call.gia` — 简单 exec-only 复合
- `/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/真-测试通过/basic_call_param.gia` — 带参数复合
- `/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/user_edit/两个复合节点.gia` — 两个复合(exec+data)
- `/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/user_edit/类型转化.gia` — 纯类型转化(非复合)
