# 监听参数消费批次：2026-08-01

> 状态：已验证
> 来源：真实 GIL 相邻快照、手工 GIA/GIL 重放、用户编辑器/游戏测试
> 最近校验：2026-08-01
> 适用范围：地图 `1073741849`、NodeGraph `1073741842`、信号「信号测试全参数」及本批次三份候选

本文件只保存本轮实验事实，不作为其他地图、信号、参数类型或节点变体的通用规则来源。通用规则见 [`../signals.md`](../signals.md)。

## 基线

```text
mapId=1073741849
nodeGraphId=1073741842
map path=/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741849.gil
source SHA-256=1d7413ab8a80b16a366df7596b211eaa65604907177387c359904cb92afb3de2
signal=信号测试全参数
monitorId=1610612754
signal-name compositePinIndex=99
```

## 候选

| 类型 | GIA | SHA-256 | 监听输出 | 消费节点 | 自动验证 | 用户验证 |
| --- | --- | --- | --- | --- | --- | --- |
| int | `Beyond_Local_Export/gsts-consume-int-v1-batch.gia` | `437e854d70462772bb031d75fdccc31c0763a46e9e3728e8f1cc7d8c77b4d8ad` | `OutParam[3]` | `genericId=180` | 严格回读、GIA header PASS | 通过 |
| float | `Beyond_Local_Export/gsts-consume-float-v1-batch.gia` | `3c88661e4f6e5c1d45b858083096c49ebaf195def38529bd94d1a6be87850865` | `OutParam[4]` | `genericId=180` | 严格回读、GIA header PASS | 通过 |
| vec3 | `Beyond_Local_Export/gsts-consume-vec3-v1-batch.gia` | `6119579dd2f77df5c712f1a864dffbbeb6eeb2704061f71e1a53cd01c2a8894e` | `OutParam[5]` | `genericId=180`, `concreteId=189` | 严格回读、GIA header PASS | 通过 |

三份候选都将连接写在消费节点 `InParam[0]`，`connect` 与 `connect2` 一致。`int` 和 `float` donor 的 `concreteId`、`i1.index`、`i2.index` 保持 protobuf wire 缺失；`vec3` donor 保留真实 `concreteId=189` 和 `indexOfConcrete=5`。本批次没有写回真实 `.gil`。

临时回读文件：

```text
/home/h/genshin-ts-evidence/node-graph-logic/signals/2026-08-01-monitor-signal/replay/gsts-consume-int-v1-batch.gil
/home/h/genshin-ts-evidence/node-graph-logic/signals/2026-08-01-monitor-signal/replay/gsts-consume-float-v1-batch.gil
/home/h/genshin-ts-evidence/node-graph-logic/signals/2026-08-01-monitor-signal/replay/gsts-consume-vec3-v1-batch.gil
```

## 证据边界

- 自动回读证明候选 NodeGraph 与手工构造结构一致，不证明生产 lowering 已修复。
- 用户测试证明上述三份具体候选在编辑器/游戏中通过，不推广到 `str`、`bool`、`guid`、`entity`、列表参数或其他 signal concrete variant。
- `readRegisteredSignalsFromGil()` 仍是当前 GIL 注册定义的读取入口。
- 注册定义的 `parameterDefinitionPinIndex` 不能直接当作监听实例 `OutParam` index；实例 index 必须由真实 donor/实验确认。
