# Static assembly closure and ID integrity

Navigation for main definition/instance, auxiliary records, packed lists, owner/backlink, registry, and collision constraints.

No claims are created by this Blueprint structure Bundle.

<!-- CLAIM:START clm_01KYF24E81AEA72Z0W72RVEHX1 -->

### 创建必须提供无冲突的完整 ID 闭包

当前创建模式要求显式提供新 prefabId、与 items 等长的 definition/instance 两侧辅助 ID，工具不自动分配下一 ID，并扫描 root 4/8/27 拒绝已占用或包内重复 ID。本地模板复制路径还必须确认模板 definition/instance 唯一存在、名称可重写且闭包完整，再同步主记录、两侧 packed field 501、逐件辅助资源/Transform、owner/backlink 和 root 6 登记；仅复制主记录或复用旧辅助闭包不完整。官方 resID 模板没有本地 donor 闭包，改由已验证官方骨架程序化生成 root 4 definition、root 8 instance、root 27 双侧 aux 与 root 6 分类登记，但仍受相同显式 ID 冲突门约束。

#### 适用边界

这是当前 applyStaticAssembly() 本地模板与已支持官方 resID 两条创建路径及 focused regression 的约束，不是正式 GIL schema，也不证明 ID 连续。官方资源集合受 official_prefabs 当前验证表限制；update/delete、自动 ID 分配和其它地图可用 ID 范围未实现或未验证。

<!-- CLAIM:END clm_01KYF24E81AEA72Z0W72RVEHX1 -->

<!-- CLAIM:START clm_C86C803AF4C0869C6B0936196D -->

### 本地模板 definition ID 与 instance ID 分离时的闭包同步

本地模板复制路径中的真实 GIL 不保证模板 definition ID 与 instance ID 相同，因此配置必须分别提供 templatePrefabId 和 templateInstanceId，不能从其中一个猜另一个。复制主实例时既要替换记录自身 ID，也要把 instance field 2 的 definition 引用替换为新 prefabId；definition packed 列表引用 definition aux ID，instance packed 列表引用 instance aux ID，每对辅助记录同步资源、Transform、owner、instance→definition backlink 和颜色快照，并拒绝 source 已占用或包内重复 ID。

#### 适用边界

该约束来自异号本地模板真实样本、focused red/green、候选/写后独立闭包回读及用户游戏通过，只适用于存在 root 4/8 donor 的本地模板复制路径。官方 resID 程序化骨架路径不依赖 templateInstanceId donor，不在本 Claim 内；本 Claim 不要求所有地图异号或 ID 连续，update/delete 和自动 ID 分配仍未实现或验证。

<!-- CLAIM:END clm_C86C803AF4C0869C6B0936196D -->

<!-- CLAIM:START clm_D43A6E214D6B1F20B8EF995757 -->

### 空模型实体（root5 res=10005018）可作无可见资源宿主，创建需 root6 组登记

编辑器“空物体/空模型” = root5 场景实体记录：f2={f1:10005018, f2:1}（资源 ID 直接作定义引用，无 root4 定义配对）、f8=10005018、f5 槽 11 个（含 t=40 挂接槽）、f6 槽 14 个（transform + 默认色材质 f3=0xFFFFFFFF）、f7 组件 6 个；可作无可见资源宿主挂装饰物（宿主 scale 建议保持 [1,1,1]）。创建新实体时 root6 大记录（组ID=3）f3.f5 列表末尾追加 {f1:200, f2:新实体ID}；root46 等长保存副作用；无 root22 新条目。

#### 适用边界

用户样本 1077936172（目标地图内编辑器创建，571B）+ 1849 备份三空模型实体（1077936176/6180/6182）交叉；区别于 aux 删除占位（aux f2=10005018 + f4{t=20} 槽）；root6 登记仅实测实体创建路径；跨地图 ID 空间独立。

<!-- CLAIM:END clm_D43A6E214D6B1F20B8EF995757 -->

<!-- CLAIM:START clm_184E301A2C7323E818C606720A -->

### 元件级装饰物创建形成 definition/instance 双侧闭包

真实编辑器在自定义元件上新增一个装饰物时，root 27 同步新增 definition-side 与 instance-side aux：两侧保存同一资源、名称、Transform 和材质快照，definition aux 归属 root 4 definition，instance aux 归属 root 8 instance 且通过 f12 回指 definition aux；宿主 root 4/8 的 t=40.f50.f501 分别记录对应 aux ID，root 22 首次登记 ModelDisplay 与 PropertyAttachArchetypeModel。当前相邻样本中新建默认 aux 材质字段严格为 f3/f4/f5/f6，不显式写 f1。

#### 适用边界

结论来自地图 1073741862 的一次真实编辑器 v1→v2 单变化、全 root raw 比较和独立 Validator；确认的是元件级装饰物最终闭包及该样本的默认材质 presence，不证明实体级挂载、其他编辑器版本、ID 分配顺序或 aux 自身启用自定义颜色后的形态。

<!-- CLAIM:END clm_184E301A2C7323E818C606720A -->

<!-- CLAIM:START clm_3319B38030FCF6DDD38C57147C -->

### 宿主启用自定义颜色写入启用标记且不传播到装饰物

真实编辑器把自定义元件宿主材质从默认状态改为自定义颜色时，root 4 definition 与 root 8 instance 的同构材质槽同步从字段 f3/f4/f5/f6 变为 f1/f3/f4/f5/f6，其中 f1=1，f3 保存 0xAARRGGBB，f5 保存对应 RGB；root 22 追加 PropertyModelColorMaterial，root 45 MRU 记录同一 ARGB。该轮 root 27 definition/instance aux raw bytes 完全不变，因此宿主颜色修改不传播到已引用装饰物。

#### 适用边界

结论来自地图 1073741862 的真实编辑器 v2→v3 单材质操作、全 root raw 比较和独立 Validator；确认宿主 definition/instance 同步、当前颜色值与引用 aux 不传播，不证明 aux 自身启用自定义颜色的 transition、所有材质族或跨版本行为。

<!-- CLAIM:END clm_3319B38030FCF6DDD38C57147C -->

<!-- CLAIM:START clm_E4F7263D5D1B51415F6EA85DE1 -->

### 实体 import 自动挂接 definition 的 instance-side aux（场景实体装饰物修复）

assets:entities import（applyEntities）从已有 definition 生成场景实体时，自动复制 definition 的 instance-side aux（root27.f2 中 f4{t=40}.f50.f502=definitionId 的记录）并重挂到实体：实体 f5{t=40}.f50.f501 写新 aux ID 列表；每条副本分配新 aux ID（root27 全部记录最大 ID+1 起递增），f502 与 f12{f1} 改为实体 ID，其余字段 byte-for-byte 保留；更新既有实体时保留旧 f5{t=40} 槽（覆盖 definition 自带空槽），重复 import 幂等。根因：definition 记录本身无 f5{t=40} 挂接槽，import 若不复制 root27 记录，实体只剩主体无装饰物（2026-08-09 四张评测图用户核验确认）。

#### 适用边界

覆盖 applyEntities 新建与更新路径；definition 无 instance-side aux（含官方直引无本地 definition）时为空操作；aux ID 分配仅保证 root27 内唯一；游戏渲染已核验（1073741878），但不覆盖其它编辑器版本的 aux 结构差异。

<!-- CLAIM:END clm_E4F7263D5D1B51415F6EA85DE1 -->
