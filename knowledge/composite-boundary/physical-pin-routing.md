# Physical pins and compositePins routing

Stable Composite boundary routing constraints after deletion tests.

No claims are created by the Blueprint structure Bundle.

<!-- CLAIM:START clm_01K13DM5F1F1F1F1F1F1F1F1F1 -->

### 复合边界路由不物化物理引脚（Composite boundary routes do not materialize pins）

复合边界路由（compositePins）只是把外部接口引脚路由到内部节点引脚的路由，本身不创建物理内引脚；因此需要物理 InParam/OutParam 的节点族必须单独物化该引脚，并在节点索引重映射后保持 kind/index 对齐。

A `compositePins` entry is a route from an outer interface pin to an encoded inner node pin; it does not create that physical inner pin. Therefore any node family whose boundary route requires a physical InParam or OutParam must materialize that pin separately and keep kind/index alignment after node-index remapping.

#### 适用边界

不可泛化为“每条 compositePins 路由都必须有物理引脚”；生产完整性默认允许有意的引脚空洞，严格的物理引脚校验仅对要求完整引脚集的契约启用。

Do not generalize this into “every compositePins route requires a physical pin.” Production integrity defaults allow intentional holes; strict physical-pin checks are enabled only for contracts that require complete pin sets.

<!-- CLAIM:END clm_01K13DM5F1F1F1F1F1F1F1F1F1 -->
