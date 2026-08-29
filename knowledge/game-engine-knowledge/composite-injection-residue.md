# 复合/注入器残留族（composite & injection residue）

复合 exec 边完整性与注入残留变体：悬空 exec、重复入边、物理 InFlow pin、ID 前移残留类型错位、数据引脚+分支赋值、输出 pin 映射错连；检测器与校验工具防线。

<!-- CLAIM:START clm_449F516AB0A6F79B5A42901B4C -->

### 复合/注入器残留族：exec 边完整性（悬空/双入边/物理 InFlow pin）+ 注入残留变体（08-14~08-28）

复合与注入的物理完整性缺陷谱系：①f.node() detached 注册→悬空 exec（08-21 检测器对 2×2 一跑命中 4 个真悬空，与 3×3 同源）；②registerExecNode auto-chain 与显式 connect 叠加→重复入边（日志 2777 Start Timer 同节点两帧、定时器不触发）；③复合 impl 内 exec 边目标必须物理 InFlow pin（08-14 #11/#12/#20，体检工具 C3/C3b 自动查）；④注入器 merge 只覆盖同 ID 不删除残留+复合 ID 按定义顺序前移→残留引用类型错位→游戏拒载无日志（08-20 orbit_scheduler 0034→0030、gsts_in_layer 0032 错位）；⑤复合数据引脚+分支赋值→GIL 数据边错乱（2956 黑块回归，nextOut 在 doubleBranch 分支内赋值）；⑥编译器输出 pin 映射错连（08-27 predDist 输出连到缺输入的减法，功能路径不受影响但外部消费坏）。防线：GSTS-DANGLING-EXEC-NODE 检测器+check-gil-composite-refs 注入后必跑+复合引脚禁令+exec 链铁律。

#### 适用边界

复合目录多版本残留拒载已有 clm_3EC5CF42（08-26 足球）；本 claim 覆盖其余残留变体与 exec 边完整性，不含复合身份重映射（clm_01KYH4ZH）。

<!-- CLAIM:END clm_449F516AB0A6F79B5A42901B4C -->
