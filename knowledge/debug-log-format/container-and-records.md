# 容器与记录字段

调试日志 .gia 的容器结构、版本单元标识与 f21/f22 双通道记录字段

<!-- CLAIM:START clm_43C39823DA58DBAB7172840ABC -->

### 调试日志 .gia 容器结构与版本单元标识

Beyond_Debug_Log 调试日志文件为 GIA 容器（全部大端）：文件大小-4 的左 size 字段 = 其后内容总长（= protoSize + 20）；记录含版本单元 f11.1.1（structureId = 该版本单元自身 id），结构链接 40.50.502 指向所属版本单元 id。

#### 适用边界

容器结论来自真实导出样本（用户运行落盘）与第三方 proto 定义核对；不同版本/地区客户端需单独验证。不含帧内参数解码细节（见同专题 frame-encoding-rules）。

<!-- CLAIM:END clm_43C39823DA58DBAB7172840ABC -->

<!-- CLAIM:START clm_C6D426185B6125E4484CB8C948 -->

### 日志记录字段与 f21/f22 双通道

每条日志记录含进程号/会话/实体/图名/f21 大小等概览字段；f22 为文本打印通道（按记录序验证打印顺序），f21 为节点执行追踪帧表（head/负载/IN/OUT 参数，按 VarType+ENUM_VALUE 解码并标注节点名与图名）。

#### 适用边界

帧表完整解码依赖 debug-log-investigator 技能 scripts/gia_log.py；新类型码需先闭合再复用。

<!-- CLAIM:END clm_C6D426185B6125E4484CB8C948 -->
