# 客户端全节点导入用例

这组真实 TypeScript 节点图覆盖客户端 API 当前可生成的全部固定节点：

- 超限模式：角色技能、角色操控技能、造物技能、造物状态、造物状态决策、布尔过滤器、整数过滤器。
- 经典模式：造物技能、造物状态、造物状态决策、布尔过滤器、整数过滤器。
- 固定随机种子为每个可连接输入选择字面量或节点连线；编辑器只允许字面量的输入始终使用字面量或空占位。
- `assemblyList`、枚举列表和多分支节点填满 10 个可变槽位。
- 每种带输出的客户端节点都至少保留一个完整消费所有输出引脚的实例；供线用的
  `getCustomVariable` 也会强制连接，确保关闭未使用节点裁剪时仍可确定具体类型。

## 生成与校验

在仓库根目录运行：

```powershell
npm run gen:client:manual
npm run test:client:manual
```

也可以分别生成两种模式：

```powershell
node ./bin/gsts.mjs tests/manual/client-nodes/beyond.ts -c ./gsts.test.config.ts --noinject
node ./bin/gsts.mjs tests/manual/client-nodes/classic.ts -c ./gsts.test.config.ts --noinject
```

这里会固定关闭未使用节点裁剪，确保未连接节点不会被自动隐藏。生成结果位于
`dist/tests/manual/client-nodes`。导入前请在地图中创建信号
`gsts_all_client_pin_probe`，参数顺序如下：

```text
boolValue: bool
intValue: int
floatValue: float
stringValue: str
vectorValue: vec3
guidValue: guid
entityValue: entity
prefabValue: prefab_id
configValue: config_id
```

内部输出保活还会使用信号 `gsts_all_client_pin_anchor(enabled: bool)`。

> 这些图会实际调用技能、碰撞盒、移动、状态切换等全部客户端节点，只用于导入和引脚检查。
> 不要把它们绑定到正式玩法中的可触发入口；如需运行验收，请在隔离测试地图中执行。

## 图 ID 与 GIA 文件

直接复用 `tests/manual/features` 中已创建的对应客户端节点图 ID：

| GIA 文件        |      图 ID | 模式 | 类别         |
| --------------- | ---------: | ---- | ------------ |
| `beyond_0.gia`  | 1082130435 | 超限 | 角色技能     |
| `beyond_1.gia`  | 1082130436 | 超限 | 角色操控技能 |
| `beyond_2.gia`  | 1082130437 | 超限 | 造物技能     |
| `beyond_3.gia`  | 1082130438 | 超限 | 造物状态     |
| `beyond_4.gia`  | 1082130439 | 超限 | 造物状态决策 |
| `beyond_5.gia`  | 1082130440 | 超限 | 布尔过滤器   |
| `beyond_6.gia`  | 1082130441 | 超限 | 整数过滤器   |
| `classic_0.gia` | 1082130444 | 经典 | 造物技能     |
| `classic_1.gia` | 1082130445 | 经典 | 造物状态     |
| `classic_2.gia` | 1082130446 | 经典 | 造物状态决策 |
| `classic_3.gia` | 1082130449 | 经典 | 布尔过滤器   |
| `classic_4.gia` | 1082130448 | 经典 | 整数过滤器   |

## 结构体节点边界

资源能力表中的 `assemble_structure` / `split_structure` 依赖地图内具体结构体声明来确定
`concreteId` 和动态字段引脚，当前通用 API 没有可安全生成的无模式结构体类型。这两个节点在七类图中
形成 14 条既有 `_generation_gaps.json` 记录，因此不会伪造不可导入的空结构体节点。
`_coverage.json` 会逐类列出这两个显式缺口；除此之外，校验脚本要求所有模式可用节点的 generic ID、
输入/输出引脚形状和输出连线都出现在生成的 GIA 中。
