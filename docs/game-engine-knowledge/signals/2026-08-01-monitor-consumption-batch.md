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

---

# 监听参数消费批次：2026-08-02（9 参数闭合与导入验证）

> 状态：已验证
> 来源：真实 GIL 相邻快照（12 轮连续差分）、同构重放（replay-listener-signal.ts）、用户编辑器导入
> 最近校验：2026-08-02
> 适用范围：地图 `1073741849`、NodeGraph `1073741842`、信号「信号测试全参数」9 种普通参数

本批次在 08-01 三参数（int/float/vec3）基础上补齐 str/bool/guid/entity/prefab_id/config_id
消费，并完成全部 9 种参数的同构重放与一份编辑器导入核验。通用规则见 [`../signals.md`](../signals.md)。

## 真实差分轮次（每轮一个新增消费节点 + 一条连接）

```text
v5-v6   str  → 获取局部变量 18/2656   OutParam[6]  VarType=6  StringBase    connect2=3（例外）
v6-v7   str  → 获取局部变量 18/2656   （connect2=3 复现，排除实例/顺序因素）
v7-v8   int  → 获取局部变量 18/20     OutParam[3]  VarType=3  IntBase       connect2=3
v8-v9   bool → 类型转换 180           OutParam[7]  VarType=4  EnumBase      connect2=7
v9-v10  bool → 获取局部变量 18/18     OutParam[7]  VarType=4  EnumBase      connect2=7（判别：connect2=源 index）
v10-v11 guid → 获取局部变量 18/2658   OutParam[8]  VarType=2  IdBase/GUID   connect2=8
v11-v12 prefab → 获取局部变量 18/2669 OutParam[10] VarType=21 IdBase/Prefab connect2=10
v12-v13 config → 获取局部变量 18/2668 OutParam[11] VarType=20 IdBase/Config connect2=11
v13-v14 entity → 获取局部变量 18/2657 OutParam[9]  VarType=1（无 base 类）  connect2=4（例外）
```

每轮独立 Validator `ACCEPT`（v5-v6/v9-v10/v13-v14 为 `ACCEPT_WITH_BOUNDARY`，边界均为
connect2 例外）。实验目录：

```text
/home/h/genshin-ts-evidence/node-graph-logic/signals/2026-08-01-monitor-signal/experiments/
  str-get-local-variable-consumer-v5-v6  ...  entity-get-local-variable-consumer-v13-v14
```

## 重放候选

`replay-listener-signal.ts` 扩展 consume-str/bool/guid/entity/prefab/config（genericId=18
donor，按 concreteId 精确筛选，connect2 含经验例外）并修复既有
`parameterDefinitionPinIndex` 断言（实际字段 `monitorPinIndex`）。8/9 模式严格回读 PASS：

```text
replay/consume-{int,float,str,bool,guid,entity,prefab,config}-replay-v1.gia
```

consume-vec3 未重放：当前图无 180+type=12 donor（nodeIndex 4 已被 vec3→entity 改接实验
占用），vec3 消费已由真实差分与 08-01 批次闭合。

## 编辑器导入验证

```text
候选: consume-str-replay-v1.gia  SHA-256 ea369ae2e3a1e592828126986eff43c50b2658a27127225d3928d509eed849af
用户: 导入核验「测试完美通过」
导入前真实地图: 3b8c4dd5...（380313）  导入后: f52046f2...（385482）
新图: 1073741847「信号调试-监听信号_1」16 节点（编辑器自动改名并新建，原图 1073741842 不变）
落盘: 与重放候选逐节点一致（含 connect2=3 例外），仅图名差异
```

## 证据边界

- 9 种普通参数输出序号/类型由真实相邻差分闭合，仅限当前地图、当前 monitor 定义和
  「信号测试全参数」；新 monitor 布局必须从当前 CompositeDef/注册定义解析。
- `connect2` 经验规则：= 源 `OutParam` index；例外 str→3、entity→4（多实例复现），
  语义未解释，保持 `INSUFFICIENT`。
- 其余 7 个 consume 候选未逐个导入核验（同一生成器 + 严格回读保证结构一致）。
- 监听触发与参数值的游戏行为验证未执行。
