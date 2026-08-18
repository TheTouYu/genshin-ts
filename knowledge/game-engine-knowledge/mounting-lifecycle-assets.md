# 节点图挂载、生命周期与资产文件

图挂实体/元件、多人重复执行、生命周期阶段、GIL vs GIA 与正式 GIA 导入包装

<!-- CLAIM:START clm_D8AE4A86F79755B92C2FEB7E0C -->

### 节点图必须挂载在实体/元件上；多人下按玩家重复执行（用户说明）

节点图不能脱离游戏对象独立运行，必须挂载在实体或元件上，由挂载对象的创建、销毁、组件事件和其他事件驱动。一个元件可以挂载多个节点图；元件尚未被游戏创建时其挂载的节点图不生效。判断图是否执行需确认：挂载在哪里、挂载对象是否已创建、对应事件是否会在该对象生命周期中发生。特殊实体：玩家实体一定会被创建且至少存在一个（多人中每个玩家都有自己的玩家实体）；角色实体也一定会被创建，且是玩家屏幕控件 UI 事件的接收对象。多人联机：挂载在玩家实体上的节点图针对每个玩家分别执行（4 个玩家则执行 4 次）；全局只应执行一次的逻辑需增加去重、主控玩家判断或全局状态门控。

#### 适用边界

来自用户对节点图挂载/生命周期/多人执行的说明（graph-mounting.md 状态=框架草案，2026-08-01），无真实 GIL 证据；玩家/角色实体数量、所有权、生命周期关系，服务端/客户端/每玩家执行边界，全局一次性逻辑的去重方式均待验证；真实挂载 wire 规则（type 3 槽）见 gil-structure-closed-paths topic

<!-- CLAIM:END clm_D8AE4A86F79755B92C2FEB7E0C -->

<!-- CLAIM:START clm_CF2DBEA9639E2430744636FDDE -->

### 游戏运行生命周期阶段（用户说明）

游戏不是从任意节点直接开始：点击“开始游戏”→初始化内置且不可更改的内容（当前关卡、玩家、玩家对应的角色等，玩家和角色一定会被创建）→创建关卡、玩家和角色→加载并逐个创建预设实体（触发各自创建生命周期）→启动配置为创建时运行的组件（组件可绕过节点图直接按配置产生行为）→触发创建和组件事件→进入等待玩家操作的运行状态→玩家、组件或 UI 持续产生事件→节点图处理事件并改变游戏状态→循环等待和处理→玩家退出或满足结束条件→触发结算事件→标记游戏结束并退出。运行期间持续循环：等待事件→事件发生→找到事件所属对象和节点图→从事件节点执行控制流→读取或计算数据参数→修改实体/组件/变量/UI/镜头状态→执行结束。

#### 适用边界

来自用户对完整游戏执行流程的说明（game-lifecycle.md 状态=框架草案，2026-08-01），无真实 GIL 证据；内置对象完整清单与先后顺序、初始实体创建顺序是否稳定、组件初始化与创建事件先后、多事件调度规则、结算/销毁/退出先后、多人下各阶段执行次数均待验证

<!-- CLAIM:END clm_CF2DBEA9639E2430744636FDDE -->

<!-- CLAIM:START clm_6489492EFA850D495B4AE86A95 -->

### GIL 完整关卡包 vs GIA 部分资产包；正式 GIA 导入包装要求（部分验证）

GIL 保存完整关卡（资产、初始状态和相互引用），验证完整关卡行为时写回 GIL 再重新打开关卡检查；覆盖范围完整但写回和重新加载成本较高。GIA 是可导入游戏的部分资产包，只包含本次需要复用或验证的资产（节点图/复合节点、模型元件、屏幕控件、数据定义），验证成本较低可直接导入。正式 GIA 导入包装（2026-08-01 监听信号实验验证）：仅供 injector 单元测试使用的最小 GIA 包装会被编辑器忽略；正式可导入 GIA 至少需要与当前正式包装规则一致的文件头和 Root 元数据，包括 header fileType=3、与图类型匹配的 Root graph identity、有效 filePath、当前 gameVersion、Root graph ID 与 inner NodeGraph ID 一致。“protobuf 能解码”或“injector 能解析”不等于编辑器能检测并导入；“文件从导出目录消失/被扫描/被移动”也不能单独证明导入成功。

#### 适用边界

GIL/GIA 用途划分来自用户说明；正式 GIA 导入包装字段来自 2026-08-01 监听信号真实实验（负证据：最小包装被忽略）+ 用户确认可导入样本；“编辑器可检测并导入”仍需用户编辑器验证；每类资产在 GIL/GIA 的登记结构、依赖闭包计算、导入身份分配规则未验证

<!-- CLAIM:END clm_6489492EFA850D495B4AE86A95 -->

<!-- CLAIM:START clm_6AD25A9E855663EA2CCACF78DC -->

### 选项卡选中事件链路与 tabId 值域

whenTabIsSelected（选项卡选中）事件在挂载选项卡组件的实体节点图上触发（assets:mounts attach --entity 路径）；payload 含 eventSourceEntity/eventSourceGuid/tabId/selectorEntity；tabId 从 1 开始（1~6 对应选项配置顺序，魔方 R/L/U/D/F/B=1-6）。验证：用户游戏核验 + Beyond_Debug_Log 逐帧（7 次点击 4 帧链完整执行，OUT2:Integer=tabId）。

#### 适用边界

仅实体选项卡（3D 组件 type 17）；不覆盖屏幕 UI 按钮（ui-controls）事件路径；tabId 值域以选项顺序为准

<!-- CLAIM:END clm_6AD25A9E855663EA2CCACF78DC -->

<!-- CLAIM:START clm_6BE48E8DC77BF0D1636506D8D9 -->

### Data Type Conversion 的 Int→Str 枚举为 802

节点 Data Type Conversion（id=180）的转换目标类型由 EnumItem（类型14）操作码决定：Int→Str=802、Bool→Str=806、Float→Str=808。验证：2026-08-13 魔方 P4 真实 Beyond_Debug_Log 逐帧（whenTabIsSelected 事件 tabId Integer→String 转换帧 IN1=802），与既有 806/808 样本同源一致。

#### 适用边界

仅服务端 Data Type Conversion 节点；不覆盖其他类型转换节点（如 Flt→Int 四舍五入）的目标枚举

<!-- CLAIM:END clm_6BE48E8DC77BF0D1636506D8D9 -->

<!-- CLAIM:START clm_8509374E5A139C10B4B0CCCB44 -->

### 匀速旋转型基础运动器 90° 配方行为

Add Uniform Basic Rotation-Based Motion Device（节点 id=85）参数配方：mover_name 标识、duration=1、angular_velocity=90、axis=(1,0,0) 时绕世界 X 轴连续累积旋转（每次触发 +90°，再触发继续 +90°，不会回退或局部轴错乱）；target_entity 可传事件源实体。验证：2026-08-13 魔方 P4 用户游戏核验（连续累积）+ 真实日志逐帧（IN2:Float=1.0、IN3:Float=90.0、IN4:Vector=(1,0,0)、IN0:Entity=事件源）。

#### 适用边界

仅匀速旋转型（node 85）；不覆盖朝向目标/直线/定点运动器；axis 语义为实体局部坐标系方向（相对朝向，M_new=M·R_local，见 motion-device-runtime）；本配方 (1,0,0) 在局部轴与世界轴对齐的验证场景中等价绕世界 X 轴，绕世界轴的一般转换需按 motion-device-runtime 公式。

<!-- CLAIM:END clm_8509374E5A139C10B4B0CCCB44 -->
