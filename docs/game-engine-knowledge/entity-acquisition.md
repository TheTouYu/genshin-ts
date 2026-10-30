# 实体获取配方（千星沙箱 · 玩家 / 角色 / 关卡 / 子实体）

> 状态：**已验证**（2026-10-30，地图 1073741827 足球 v3）
> 证据层级：①官方查询节点文档（`docs/ui-tutorial/official-guide-nodes-*.md`）；
> ②社区复合节点反解（`玩家，角色，关卡（复合节点资产）.gia`，10 节点）；③本仓真机日志 3416/3418。
> 适用：任何玩法要问「玩家在哪 / 角色是谁 / 关卡实体是谁」。**先读这份，别自己拼链。**

## 0. 一句话结论

**玩家序号 → 玩家 GUID → 玩家实体 → 角色列表 → 角色实体 → 位置**，
第一步用专门的节点 `Get_Player_GUID_by_Player_ID`（`f.getPlayerGuidByPlayerId(n)`）。
**漏掉这一步是本文档存在的原因**（我们曾连续 4 轮用错通道）。

## 1. 已验证的四步链（服务端图可用，客户端创造物图不可用）

| 步 | DSL | 底层节点 | 说明 |
|---|---|---|---|
| ① | `f.getPlayerGuidByPlayerId(1n)` | `get_player_guid_by_player_id`（nodeId 750） | 玩家序号从 **1** 开始；返回 guid |
| ② | `f.queryEntityByGuid(guid)` | `query_entity_by_guid`（nodeId 75） | guid → 玩家实体 |
| ③ | `f.getAllCharacterEntitiesOfSpecifiedPlayer(playerE)` | `get_all_character_entities_of_specified_player`（nodeId 258） | 玩家实体 → 角色**列表**（beyond 模式可用） |
| ④ | `f.getCorrespondingValueFromList(chars, 0n)` | `get_corresponding_value_from_list__entity`（nodeId 130） | 列表 + 序号 → 角色实体 |
| ⑤ | `f.getEntityLocationAndRotation(char).location` | — | 取位置（`getEntityLocation` 只给位置） |

关卡实体：`f.queryEntityByGuid(1094713345n)`（关卡实体 GUID 每图固定）。
社区复合节点就是这么做的，其节点默认值里残留 `1086324738` = 作者地图 1 号玩家槽，印证「槽位 GUID 固定、按序号取」。

## 2. 四条死路（都实测过，别再走）

| 通道 | 现象 | 证据 |
|---|---|---|
| `getListOfPlayerEntitiesOnTheField()[0]` 当玩家 | 它是**玩家控制器实体**，`getEntityLocation*` 只返回 y（x/z 恒 0） | 日志 3416：`IN0:Vector=(0.0, 0.472, 0.0)` |
| 直接 `getAllCharacterEntitiesOfSpecifiedPlayer(控制器)` | 返回的实体不是玩家：与球距离中位 **26.5 m**、球在其 3 m 内仅 7.9% | 日志 3414，1469 样本全量统计 |
| `dataTypeConversion(序号, 'guid')` | 平台**不支持** int→guid | 编译报 `unsupported conversion int -> guid` |
| 拿「角色实体」的固定 GUID | 官方语义：角色实体按模板动态初始化，**无固定 GUID**；固定的是角色模板/玩家槽 | PKC「玩家模板与复苏规则」 |

## 3. 客户端（创造物技能图 20008）能用什么

- ❌ `getCurrentCharacter` / `getCharacterEntityOfSpecifiedPlayer` / `getActiveCharacterOfSpecifiedPlayer`：
  编译期拒收（`not available in creation_skill` / `not available in beyond mode`）。
- ✅ 可读**实体类型**的自定义变量 + `getEntityLocation` / `getEntityLocationAndRotation` / `queryEntityByGuid` /
  `getSubEntityList` / `filterEntityListWithinSphericalRange`。
- ⇒ 客户端算物理时，**角色位置由服务端图算好写进实体变量**，客户端每拍读（本仓 football 的做法：
  `kitListen` 四步链写 `fbvx/fbvz/fbvy`，内核 `kitLoop` 读）。

## 4. 备选通道（验证过但不如四步链）

- **选项卡事件**：`whenTabIsSelected` 载荷 `selectorEntity` = 触发选项卡的**角色实体**（真坐标）。适合「玩家主动交互一次后锁存」；
  不适合每拍取位置（要用户操作）。
- **玩家模板槽 GUID**：本图 9 个「默认模版」`1086324737..745` + 「默认模版(角色编辑)」`1090519041`，全在 `(0,2000,0)`；
  它们是**槽位锚点**，`getSubEntityList(槽)` 在真机返回空（不要指望子实体链）。

## 5. 排障判据

1. 先确认**实体句柄非空**：日志帧里 `OUT0:Entity=` 后面有没有值（本仓 3414 共 23660 个 Entity 输出，空值 0 —— 句柄一般不是问题）。
2. 再确认**值**：位置是否恒 0 / 列表长度是否 0 —— **空的是值和长度，不是句柄**。
3. 最后确认**图挂在哪**：拿角色的图必须能拿到「玩家实体」；挂在造物/球上的 20000 图能跑这四步链，
   挂在客户端 20008 图上不行（节点被拒）。

## 6. 参考

- 官方节点文档：`docs/ui-tutorial/official-guide-nodes-server.md` §「获取指定玩家所有角色实体」、`official-guide-nodes-client.md` §「六、玩家与角色相关」。
- 社区复合节点原文件：`.gsts/evidence/fb-1430/player-role-level.gia`（1.5 KB）——用
  `npx tsx tools/decode-gia.ts <file>` 可复现反解；节点 id 用 `src/thirdparty/.../node_data/node_id.ts` 查名。
- B 站教程：《千星奇域：从入门到入土 EP08 在玩家节点图寻找当前角色的方法》BV189CuBJEkp
  ——「对于寻找玩家和寻找角色，需要完全对应的实体，不然很多节点无法使用」。
