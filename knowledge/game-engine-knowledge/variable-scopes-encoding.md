# 变量作用域与局部变量编码

变量三种作用域（实体/图/局部）、局部变量 wire 无名 E<1016> 身份沿连线传递、关卡变量受限编码

<!-- CLAIM:START clm_6D652403251D3F18F6983A6205 -->

### 变量三种作用域：实体级/节点图级/局部

变量按可见范围分三类：实体级变量属于一个实体及其可访问接口，其他节点图只要能引用目标实体即可经接口读写；节点图级变量只属于一个指定节点图，不同图之间不共享（同名也是独立状态）；局部变量范围最小，在画布中创建后只能通过数据连线传递给控制流或数据流节点消费/设置，不能按名称从其他位置获取。三者即使名称相同也不是同一存储位置。

#### 适用边界

作用域划分来自用户对变量作用域的说明 + 真实 GIL 不可变相邻快照（2026-08-02 校验）；实体实例间共享/复制/初始值重置规则、节点图多实例运行时变量隔离、多人同步规则均未验证；局部变量 GIL 编码单独见本 topic 下一条 claim（2026-08-07 真实 GIL 解析）

<!-- CLAIM:END clm_6D652403251D3F18F6983A6205 -->

<!-- CLAIM:START clm_A154340AA0EAEA30107AB18040 -->

### 局部变量 GIL 编码：wire 无名、E<1016> 类型码、身份沿连线引用链传递

真实图 _GSTS_param-turn（265 节点，star-cube-nexus 备份，2026-08-07 真实 GIL 解析）确认：局部变量在 wire 中无名，只有类型码与连线引用。Get Local Variable（vendor id 18）inputs=[R<T>]（类型选择）、outputs=[E<1016>, R<T>]；E<1016> 输出是局部值身份起点（编辑器里的“创建局部值”）。Set Local Variable（vendor id 19）inputs=[E<1016>, R<T>]；E<1016> 输入沿数据连线接收局部值身份（通常直接来自某 Get Local Variable.E<1016> 输出），R<T> 是要写入的值。E<1016> 是 Local Variable 类型码（vendor enum_id.ts: LocalVariable=1016），不是索引或名字；局部变量没有名字字段，身份只能靠 E<1016> 连线引用链追溯（例：n=35 Set Local Variable ← n=34 Get Local Variable.E<1016>）。因此“局部变量按名映射”不可行——名称在任何位置都不存在；explain-gil-node-graph 对局部变量节点显示其 E<1016> 输入的连线来源作为身份摘要。

#### 适用边界

验证层级：真实 GIL 解析（备份图）+ vendor 节点 pin 记录；未做编辑器单变化实验，未写回；复合节点多次调用时每个调用实例的外部连线可能不同，同一局部参数位置收到的实际值可能不同（共享的是复合内部定义不是数据值）

<!-- CLAIM:END clm_A154340AA0EAEA30107AB18040 -->

<!-- CLAIM:START clm_47B704E1F571822F6E9171FEBE -->

### 关卡变量受限 GIL 观察（CONFIRMED_BOUNDED）

CONFIRMED_BOUNDED：在当前锁定地图和编辑器版本中，连续创建两个默认 bool 关卡变量和一个默认 integer 关卡变量时，编辑器在同一个既有 root 5.1 record 内追加同构变量 entry。当前样本中：entry 的显式 UTF-8 名称可单独修改并精确恢复；bool 与 discriminator 4 关联、integer 与 3 关联（这不是正式 enum）；integer 0↔123456、bool false↔true 的默认值修改均能精确恢复目标 entry。

#### 适用边界

不推广到实体变量、节点图变量、其他类型或游戏运行时作用域；完整 raw-wire 路径、presence 边界、Validator 见 gil-structure-semantics.md；9 轮相邻实验由证据提交 d7bd151f9b8e914ca4ad3a1873021983e08c4f0f 锁定；未执行 round-trip、真实写回、编辑器导入或游戏行为验证

<!-- CLAIM:END clm_47B704E1F571822F6E9171FEBE -->
