# Signal registration and extraction (assets:signals tool + GIL encoding)



<!-- CLAIM:START clm_747B855B2F15D8CF565A95D92D -->

### Signal registration tool chain: cloning pool, auto-assigned IDs, safe writeback, extraction linkage

gsts assets:signals 向地图 GIL 注册新信号：从模板信号按参数类型克隆条目（每类型一次、<=9 参数、类型池来自目标地图现有信号，缺失类型报错提示先在编辑器注册）；省略 send/monitor/server 节点 ID 时自动从当前最大占用 +1 连续分配（信号 ID 段 0x60000000，内置定义占用 1610612738..1610612740）；--write 前校验源 SHA、自动备份到同级 .gsts/backups/、写入前做结构回读验证；写回成功后自动提取 src/resources/signals.ts（与 inject 流程共享 readRegisteredSignalsFromGil 解析器）。

#### 适用边界

工具当前行为，证据为自动回归测试 + 真实地图写入 + 用户游戏内验证；不包含修改已有信号（未实现）；不包含编辑器 pin 分配细节（编辑器私有）。

<!-- CLAIM:END clm_747B855B2F15D8CF565A95D92D -->

<!-- CLAIM:START clm_EB98A0BAEA640B8ECB6577B16C -->

### Signal registration encoding: index entry plus three GraphUnit definitions

地图 GIL 信号注册编码 = field5 注册索引条目（f1 send 身份 / f2 monitor 身份 / f3 名称 / f4 参数 / f6 计数 / f7 server 身份）+ field2 三份 GraphUnit 定义（send/monitor/sendServer；编辑器插在图1定义之后，工具追加末尾，protobuf 顺序无语义影响）；注册索引 f4/f5/f6 引用定义参数条目的 f8 pin 编号；f8 pin 每定义局部（全图重复属正常）；每信号 <=9 参数、18 种合法类型（9 普通 + 9 _list 变体，PARAM_TYPE_CODES 完整映射）；同类型参数每信号只能一次（克隆条目复制相同 f8，工具防御性报错）。

#### 适用边界

证据为真实 GIL 观察 + 编辑器保存字节对比 + 游戏内验证；不解释定义侧 f3/f4 类型编码细节（含列表嵌套 102 字段，工具克隆条目无需理解）。

<!-- CLAIM:END clm_EB98A0BAEA640B8ECB6577B16C -->
