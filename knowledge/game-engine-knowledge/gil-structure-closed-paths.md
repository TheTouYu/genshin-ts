# GIL 结构已闭合路径

主图 root10.1.1、复合 impl root10.4.1、挂载 type3 槽、root10 容器 field1/2/4 划分

<!-- CLAIM:START clm_F008D0E6E613365A09C857B504 -->

### GIL root10 容器划分：field1 主图、field2 CompositeDef、field4 impl 图

GIL payload 根 field 10 是当前复合容器（正式消息名未闭合），已闭合三个子路径：10.1[*] 默认节点图注册 records（10.1[*].1.1.5=稳定节点图 ID、10.1[*].1.2=显式 UTF-8 节点图名称）；10.1.1[*] 是可由 gia.NodeGraph schema 解码的 NodeGraph blob（当前 collector 在锁定快照找到 13 个 blob，类型聚合均为 20000，共 301 个节点；该路径是操作路径，不是 GIA Root 声明的路径）；10.2[*] 是 gia.CompositeDef（id/inflows/outflows/inputs/outputs/type/name 及 ParameterFlow.name/index/type/pinIndex 由 gia.proto 映射）；10.5.3[*] 是信号注册索引条目（含 send/monitor/server identity、名称和参数条目）。注入器合并路径（源码确认）：CompositeDef 写入 root 10 field 2、impl 图写 field 4，按 ID 合并去重（冲突保留 GIL 侧）。

#### 适用边界

root field 10 正式消息名未知；10.1 之外子容器未闭合；10.1.1 的 13-blob/301 节点来自当前锁定地图 snapshot；NodeGraph 解码支持是当前源码 reader 加成功 schema 解码支持，不称为 round-trip；跨地图/版本普适性未验证

<!-- CLAIM:END clm_F008D0E6E613365A09C857B504 -->

<!-- CLAIM:START clm_98EF365F97BE61A3874676F66A -->

### 节点图挂载 type 3 槽规则（mount-case1-4 真实快照 + 用户游戏核验，CONFIRMED）

挂载生效节点图=实体槽 type 3：槽列表（def root4 f7 / 元件实例 root8 f6 / 场景实体 root5 f6）中 {1:3} 的槽，恒为槽列表第 3 条（15 条槽按 type 升序 [1,2,3,4,5,6,7,8,11,12,16,17,19,20,22]）。空槽形态=08036a00（{1:3, 13:空}）；挂载后 f13.f1 每条={1:{1:1, 2:图GID, 501:20000}}（两层 f1 包装，501:20000 为 varint）；多图=f13.f1 repeated 按挂载顺序追加（+17B/图）；解除最后一个图→f13 回空。图 GID 用完整值（1073741828，与 root10 Id.f5 同空间），不是短号。三个容器各自独立记录：def 挂载双写 root4（f1=defID）+ root8 全部引用实例（f2.f1=defID 全值，含多实例）；场景实体挂载只写 root5（f1=场景实体 ID）。root6 分类聚合登记新 def ID 一次性，与挂载/解除生命周期无关（解除不回退）；root10/root9/root27 与挂载无关；挂载已有图不改图本体。

#### 适用边界

mount-case1/2/3/4 真实相邻快照 + 用户游戏核验（2026-08-08）；attach/detach 输出与真实快照记录逐字节一致（tests/gil_graph_mounts.ts）；真实注入 entity 与 def 两路径 attach/detach 各一轮用户游戏核验全部通过，地图恢复原始 hash；未覆盖：挂载记录的完整 schema 之外字段、其他槽类型语义

<!-- CLAIM:END clm_98EF365F97BE61A3874676F66A -->

<!-- CLAIM:START clm_C9B4B93B4DBE45BABAE487EC44 -->

### instance-side aux 的 f12={f1:宿主ID}（definition 与实体各持一套）

root27.f2 instance-side aux 的 f12={f1:宿主ID}，宿主为 definition ID 或场景实体 ID；definition-side aux（root27.f1）无 f12。真实样本（1073741862 足球）：definition 与场景实体各持有 132 条 instance-side aux，除 f1/f502/f12 外逐字节一致；definition 记录本身不带 f5{t=40} 挂接槽。该结构是 assets:entities import 自动挂接（复制 definition 的 instance-side aux 到实体）的编码依据。

#### 适用边界

2026-08-10 前文档标记 INSUFFICIENT；现由 1073741862 真实地图解码 + 1073741878 游戏核验闭合；覆盖当前编辑器版本（v21 产物），不证明其他版本。

<!-- CLAIM:END clm_C9B4B93B4DBE45BABAE487EC44 -->

<!-- CLAIM:START clm_BEF0A24D1A5CA2F3D2CA1906BC -->

### 装饰物（root27 aux）wire 与挂载

root27 = def-side（f1 字段，f3=1）与 inst-side（f2 字段，f12 回链 def）aux；宿主 f5/f6 槽40.f50.f501 packed 引用挂载（定义挂 def aux、模型/实体挂 inst aux）；aux f4 槽40.f50.f502 = 宿主 ID（关键引用）。静态装饰物只有 inst 且 f12 空（资源性质差异，wire 无标记）。

#### 适用边界

样本 after-user-aux-both/after-prefab-with-aux/after-entity-aux-user；CLI assets:aux attach。

<!-- CLAIM:END clm_BEF0A24D1A5CA2F3D2CA1906BC -->

<!-- CLAIM:START clm_AA837C8B1FAB3232BFA7E14F3F -->

### 元件三层独立副本与差异化保留（批量更新）

元件在 GIL 里是三层独立副本：root4 定义 f8（元件本体）、root8 实例 f7（页面模型/编辑辅助）、root5 场景实体 f7（游戏实际读取的摆放实例，f2 引用 prefabId）。编辑器操作只改目标层、不自动同步：改元件面板写 root8、改场景实体写 root5、root4 定义在编辑器里不被直接编辑。差异化保留 = 字段级差异（无 override 标记）：实体独属修改 = 实体 f7/f6 与定义 f8 的差异（加组件=实体 f7 多一个组件槽；改属性=实体 f7 内容变；移动=实体 f6 变）。transform（f6）是实体独属坐标层，永不参与继承同步。批量更新命令 assets:prefabs update --id <defId> [--force]：改 root4 定义 → 同步 root8 实例 + 所有引用实体，默认差异化保留、--force 强制覆盖。

#### 适用边界

2026-08-22 五轮编辑器差分闭合（移动实体/加铭牌组件/改 tabBar 选项/改元件面板/删元件实例）；证据快照 ~/genshin-ts-evidence/prefab-inheritance-diff/；实现见 ADR-0006 与 src/cli/gil_prefabs.ts updatePrefabDefinition。

<!-- CLAIM:END clm_AA837C8B1FAB3232BFA7E14F3F -->
