# 帧负载编码规则

参数类型码、枚举操作码、节点 ID 对照与两级帧/负载规则

<!-- CLAIM:START clm_8A72C10C71952438959C200669 -->

### 参数类型码与操作码枚举来源

帧内参数类型码 = VarType 枚举（第三方定义 protobuf/gia.proto 确认）；枚举操作码 = ENUM_VALUE（enum_id.ts）；节点 ID 与日志帧对照依据 node_pin_records.ts 的 reflectMap（含变体 concreteId 与 indexOfConcrete）。

#### 适用边界

枚举定义来自第三方资源包；新增节点族需先查 reflectMap 再解码。

<!-- CLAIM:END clm_8A72C10C71952438959C200669 -->

<!-- CLAIM:START clm_8D210530744937ADB0BA9B1A0F -->

### 两级帧 ID 规律与负载 f6 规则

帧 ID 存在两级规律（frame/sub-frame）；负载 f6 规则经用户面板逐节点核对确认；finite_loop（0d 系列）完整帧模式在实验 4（for i=0;i<3）闭合。

#### 适用边界

已确认规则见 docs/game-engine-knowledge/debug-log-format.md「已确认规则」节；该文档「待解问题」不构成结论。

<!-- CLAIM:END clm_8D210530744937ADB0BA9B1A0F -->
