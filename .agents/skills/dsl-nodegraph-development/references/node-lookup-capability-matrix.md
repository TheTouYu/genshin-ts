# 编辑器节点 vs DSL 暴露能力矩阵（轻量）

> 自动生成：`npx tsx .agents/skills/dsl-nodegraph-development/scripts/lookup-node.ts --matrix`
> 口径：`resources/mihoyo_editor_names.json` 的 799 个编辑器节点；server < 200000，client >= 200000。
> DSL 已暴露 = 命中 `src/definitions/nodes.ts` / `src/definitions/client_nodes.ts` / `src/definitions/zh_aliases.ts` 对应方法或事件别名。

| 侧 | 编辑器节点数 | DSL 已暴露 | 仅编辑器/未暴露 | 缺失率 |
| --- | ---: | ---: | ---: | ---: |
| server | 493 | 450 | 43 | 8.7% |
| client | 306 | 289 | 17 | 5.6% |

## Server 未暴露清单（二态候选）

- genericId=160 对列表设置值 / Set List Value
- genericId=250 设置实体阵营 / Set Entity Faction
- genericId=262 激活实体镜头 / Activate Entity Camera
- genericId=263 停用实体镜头 / Disable Entity Camera
- genericId=264 激活注目镜头 / Activate Focus Camera
- genericId=265 停止注目镜头 / Disable Focus Camera
- genericId=266 激活屏幕震动 / Activate Screen Shake
- genericId=288 传送玩家(超限) / Teleport Player (Beyond Mode)
- genericId=302 设置角色扰动装置 / Set Character Disruptor Device
- genericId=314 增加全局计时器的值 / Increase Global Timer Value
- genericId=366 激活/关闭角色扰动装置 / Activate/Disable Character Disruptor Device
- genericId=384 设置界面控件(组)状态 / Set UI Control (Group) Status
- genericId=393 增加技能资源量 / Increase Skill Resource Amount
- genericId=428 原生CustomValue变化时 / When Native Custom Value Changes
- genericId=445 原生设置CustomValue / Native Settings Custom Value
- genericId=459 原生查询CustomValue / Native Query Custom Value
- genericId=597 设置玩家背景音乐 / Set Player Background Music
- genericId=615 添加实体生效铭牌 / Add Entity Active Nameplate
- genericId=616 删除实体生效铭牌 / Delete Entity Active Nameplate
- genericId=634 设置小地图缩放 / Set Mini-Map Zoom
- genericId=635 设置小地图标识生效状态 / Set Mini-Map Marker Activation Status
- genericId=636 设置可见小地图标识的玩家列表 / Set Player List for Visible Mini-Map Markers
- genericId=637 设置追踪小地图标识的玩家列表 / Set Player List for Tracking Mini-Map Markers
- genericId=640 设置小地图标识的玩家标记 / Set Player Markers on the Mini-Map
- genericId=646 增加成就进度计数 / Increase Achievement Progress Tally
- genericId=674 设置装备词条值 / Set Equipment Affix Value
- genericId=678 更新玩家排行榜分数 / Update Player Leaderboard Score
- genericId=686 增加背包道具数量 / Increase Inventory Item Quantity
- genericId=687 设置背包掉落道具/货币数量 / Set Inventory Loot Item/Currency Quantity
- genericId=688 增加背包货币数量 / Increase Inventory Currency Quantity
- genericId=704 设置自定义商店商品出售信息 / Set Custom Shop Item Sales Info
- genericId=706 设置背包商店商品出售信息 / Set Inventory Shop Item Sales Info
- genericId=707 设置物品收购表中道具收购信息 / Set Item Purchase Info in the Purchase List
- genericId=726 增加掉落物组件道具数量 / Increase Loot Component Item Quantity
- genericId=727 增加掉落物组件货币数量 / Increase Loot Component Currency Quantity
- genericId=740 增加角色技能冷却 / Increase Character Skill CD
- genericId=741 按最大冷却时间比例设置技能冷却 / Set Skill CD Based on Maximum CD Percentage
- genericId=763 设置环境配置 / Set Environment Configuration
- genericId=770 设置玩家频道权限 / Set Player Channel Permissions
- genericId=789 激活/关闭寻路阻挡功能 / Enable/Disable Pathfinding Obstacle Feature
- genericId=790 激活/关闭寻路阻挡 / Enable/Disable Pathfinding Obstacle
- genericId=805 传送玩家(经典) / Teleport Player (Classic Mode)
- genericId=100000 调用GM时（此节点不外放） / When Calling GM (This Node Is Hidden Externally)

## Client 未暴露清单（二态候选）

- genericId=200000 节点图结束(布尔型) / Node Graph End (Boolean)
- genericId=200036 获取当前镜头模板 / Get Current Camera Template
- genericId=200042 节点图开始 / Node Graph Starts
- genericId=200046 获取镜头朝向 / Get Camera Orientation
- genericId=200104 节点图结束 / Node Graph Ends
- genericId=200117 （测试）发送客户端信号 / (Test) Send Client Signal
- genericId=200122 节点图结束(整数) / Node Graph End (Integer)
- genericId=200126 按顺序唯一执行 / Execute only by sequence
- genericId=200160 拼装结构体 / Assemble Structure
- genericId=200161 拆分结构体 / Split Structure
- genericId=200236 拼装结构体 / Assemble Structure
- genericId=200237 拆分结构体 / Split Structure
- genericId=300000 发送信号 / Send Signal
- genericId=300001 监听信号 / Monitor Signal
- genericId=300002 拼装结构体 / Assemble Structure
- genericId=300003 拆分结构体 / Split Structure
- genericId=300004 修改结构体 / Modify Structure

## 使用

写 DSL 前对拿不准的节点/术语先跑：
```bash
npx tsx .agents/skills/dsl-nodegraph-development/scripts/lookup-node.ts "<中文名/英文名/方法名/genericId>"
```
