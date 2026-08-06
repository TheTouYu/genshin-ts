# Static assembly configuration and transforms

Navigation for reusable configuration, transform, template, resource, and explicit-ID constraints.

No claims are created by this Blueprint structure Bundle.

<!-- CLAIM:START clm_01KYF24E5RX2APB1GZ2KZGYBFX -->

### 两层 Transform 的配置语义

组件 `position/rotation/scale` 描述场景中的主 Transform，每个 item 的同名字段描述相对组件原点的局部 Transform；缺省旋转为 `[0,0,0]`，缺省缩放为 `[1,1,1]`，所有向量必须有三个有限数值。

#### 适用边界

坐标层级和缺省值来自当前实现，长方体资源 `10009001` 的 `scale: [1,1,1]` 对应游戏原始 `1×1×1` 尺寸来自当前地图的用户游戏验证。其它资源的原始尺寸、其它模板和其它地图必须单独验证。该 Claim 不声明公开配置类型当前包含哪些字段。

<!-- CLAIM:END clm_01KYF24E5RX2APB1GZ2KZGYBFX -->

<!-- CLAIM:START clm_01KYGRKG2DEAER66EX9B1607M0 -->

### 透视截图的位置验证边界

单张透视截图可以定性观察同一静态拼装中装饰物的相对排列、是否明显脱离，以及模型缩放时局部间距是否随整体同步变化；它不能单独证明精确局部坐标、轴向分量、数值比例、中心对齐或世界/局部 Transform 的数学关系。需要精确结论时，应以配置或真实 GIL Transform 回读为数值证据，并使用同机位正交视图、网格或已知基准做视觉对照。

#### 适用边界

该规则限定截图证据的可声明范围，不判断任何具体截图必然正确，也不授权地图读取、候选生成或写回。透视、遮挡、景深、阴影和不同画面位置会影响像素距离；只有用户提供的具体截图可作为该次定性游戏观察。

<!-- CLAIM:END clm_01KYGRKG2DEAER66EX9B1607M0 -->


<!-- CLAIM:START clm_01KYGSK9PHX67KFENCBF7MAY2E -->

### 静态拼装公开配置、只读发现、确定性计划与发布消费边界

根 `-c/--config` 只提供项目上下文，静态拼装声明由 `--asset-config` 加载；旧子命令 `--config` 仅为 deprecated alias，冲突路径失败关闭。共享 `src/cli/static_assembly/` 以受限 wire reader 一次建立定义、实例、两侧辅助、owner registry 和占用 ID 索引；公开 `inspectStaticAssemblyMap()`/`inspect` 返回 Inspection V1，公开 `createStaticAssemblyPlan()`/`plan` 将源 GIL、资产配置、结构文件、规范化 assembly、模板闭包与 ID 冲突绑定到 canonical JSON SHA-256。`maps --format json` 默认脱敏并只在 `--include-hash` 时读取内容。根入口导出 Inspection/Plan V1 类型和纯函数，发布包提供 inspection/plan schema。tarball 消费回归从安装后的 starter 实际解析带 `.js` 的 cli/injector 子路径，并以最小无私人数据 GIL 运行模板工具。

#### 适用边界

这是 commit 8fb0e52 的当前只读发现、计划和离线发布消费契约。合成 fixture 与 focused 回归只证明 parser/index/closure、稳定 JSON、冲突/漂移和源文件只读，不证明真实编辑器 GIL 的所有布局、模板/资源兼容、候选编码、真实写回或游戏行为；closureStatus=complete 仍保持 compatibility=unknown。plan 不授权 write，后续 plan-gated output、独立 verify、source-hash-gated write、receipt/rollback 需另行实现和确认。相关 CLI、loader、static_assembly 模块、公开类型/schema、exports 或 focused 测试变化时必须复核。

<!-- CLAIM:END clm_01KYGSK9PHX67KFENCBF7MAY2E -->

<!-- CLAIM:START clm_5CA329CCBED7E15CB53C785F6B -->

### 静态拼装颜色配置与 wire 编码契约

当前公开静态拼装配置允许在 assembly.color 设置主体颜色，并在 item.color 设置逐装饰物颜色；GstsStaticColor 的启用分支包含 enabled=true、0xRRGGBB 的 rgb、0–100 的 opacity 和 overwrite/multiply 的 overlay，关闭分支为 enabled=false。编码时 opacity 先经 round(percent/100*255) 量化到 8-bit Alpha，再写 field 3=0xAARRGGBB、field 4=量化后 Alpha 换算的 float32 百分比、field 5=0xRRGGBB、field 6=6700/6701。enabled=false 时省略 field 1 并写默认白色快照；省略 color 时保留模板颜色快照。主定义/实例以及每件辅助定义/实例的颜色快照必须分别同步，且只替换已知 field 1/3/4/5/6，保留 field 9 等未知字段。

#### 适用边界

这是 commit 453560f 的公开类型、applyStaticAssembly() 实现、focused raw-wire 回归和 2026-07-28 受限真实地图验证共同支持的契约。field 9=6710 的材质语义未验证，材质不属于当前颜色 API；其它资源、模板和地图仍需单独验证。任何真实地图写回仍需单独授权。

<!-- CLAIM:END clm_5CA329CCBED7E15CB53C785F6B -->

<!-- CLAIM:START clm_7395AFE937DC8FD43786AA5B34 -->

### 声明式结构加载 seam 与发布消费验证契约

静态拼装声明文件由 `loadStaticAssemblyStructure()` 读取并验证，再由 `resolveStaticAssemblyStructure()` 与地图目标配置合成为必含 items 的规范化 assembly；解析器本身不读取或写入 `.gil`。格式固定为严格 JSON `schemaVersion: 1`，可携带主体颜色和逐 item 的资源、局部 Transform、颜色，并拒绝未知字段、空 items、非法颜色和非有限 Transform。发布包提供对应 JSON Schema。`tests/static_assembly_package_consumer.ts` 通过分别打包主包和 `create-genshin-ts`、安装脚手架 tarball、从安装后的 bin 生成 starter、安装主包 tarball、按包名类型检查并运行已安装 CLI help，验证该能力不依赖主仓库源码布局。

#### 适用边界

这是 commit b09390c 的模块 seam 与自动发布消费证据。它不证明 npm registry 已发布该提交，不证明任何真实 `.gil` 候选、写回、编辑器加载或游戏行为，也不实现从 `.gil` 提取结构。结构加载器、Schema、包导出、脚手架模板或消费回归变化时必须重新验证。

<!-- CLAIM:END clm_7395AFE937DC8FD43786AA5B34 -->

<!-- CLAIM:START clm_CFC2CA7A47D98ED4C1C40B081E -->

### 静态拼装只读发现与确定性计划安全契约

公开只读路径按 `maps JSON → inspect → --asset-config → plan` 分层：maps 只负责稳定脱敏的地图元数据，inspect 从源 bytes 建立定义、实例、两侧辅助、owner registry、Transform 和占用 ID 索引，plan 再将源 GIL、资产配置文件、结构文件和规范化 assembly 语义绑定到 canonical JSON SHA-256。只有模板定义/实例精确匹配、当前已知闭包完整且所有显式 ID 无冲突时状态为 ready；否则生成机器可读 blocked 计划并非零退出。inspect/plan 的 `--output` 只新建，源 hash/mtime 保持不变且不创建地图备份。

#### 适用边界

这是 commit 8fb0e52 的当前实现和确定性合成 fixture 自动回归契约，不是新的真实地图、编辑器或游戏证据。closureStatus=complete 只说明当前已知 field 4/6/8/27 闭包检查通过，兼容性仍为 unknown；freeRuns 仅是绑定源哈希的 proposal，不是编辑器全局 ID 分配协议。plan 不生成候选、不授权 write，也不实现 verify、receipt 或 rollback。

<!-- CLAIM:END clm_CFC2CA7A47D98ED4C1C40B081E -->

<!-- CLAIM:START clm_A1E15CA57DDF9464638BB97C44 -->

### 编辑器多轴旋转 = YXZ 内旋（R = Ry·Rx·Rz），面板值 = wire 值

编辑器 rotation 编码为 YXZ 内旋欧拉角：矩阵 R = Ry(β)·Rx(α)·Rz(γ)；旋转面板显示值 = wire 存储值（直写）；分步旋转 = 矩阵级累积后按 YXZ 重新分解显示（绕 Z 25° 后 X 分量 45→44.10 即重分解证据）；单轴旋转只写对应分量。football_geometry.ts 的 basisToEuler 默认 EULER_ORDER='yxz' 按此提取。

#### 适用边界

真实用户样本 entities/football-empty-model-sample*/raw（分步 X45→Z25→Y30→X-45，面板值 44.10,0,23.44→28.78,29.33,41.26→-7.49,1.09,35.67 与 wire 逐值一致；YXZ 三步矩阵一致性误差≈0，其他 5 种顺序 0.3+）。适用 aux/实体 transform；gimbal lock 附近分解未实测；旧脚本 eulerToNormal 的 x 符号 bug 已作废（飞散方板根因）。

<!-- CLAIM:END clm_A1E15CA57DDF9464638BB97C44 -->

<!-- CLAIM:START clm_EDCA91A83DB521C90679872ED1 -->

### 截角二十面体足球几何模块（football_geometry.ts）可复用

src/cli/static_assembly/football_geometry.ts 提供确定性截角二十面体构造（60 顶点 / 12 五边形 + 20 六边形 / 90 边，外接半径可调、全部共球面、面共面正多边形）、面片条带覆盖（面平面局部基、跨度较小方向等分、中心线求交、无缝隙；预算 192 条）、边线（弦中点 + 长轴对齐边方向 + 截面参数；90 条）；配套 tests/football_geometry_test.ts 红绿断言全过；282 aux 预算（192 面片 + 90 边线）+ 1 宿主 = 283 新记录；候选生成 .local/tmp/generate-football-v2.ts 已写回 1073741853 并经用户游戏核验（大致正确，正方形条带拟合五边形偏粗糙）。

#### 适用边界

纯数学模块不触碰 GIL；面片/边线 transform 经 buildAuxRecord + attachAux（patch.ts）注入；欧拉角顺序依赖 yxz 规则 Claim；条带宽度/厚度/表面偏移/边线截面等参数可调；用户游戏核验为一轮证据，高精度拟合（五棱柱/三棱柱压扁做面片）待下一轮。

<!-- CLAIM:END clm_EDCA91A83DB521C90679872ED1 -->
