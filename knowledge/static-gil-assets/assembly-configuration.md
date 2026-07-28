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

### 静态拼装公开配置、结构文件与发布消费边界

`assets:static-assemblies` 动态导入默认配置并从 `assets.staticAssemblies` 选择组件。公开 `GstsStaticAssembly` 现在是互斥联合：内联分支提供主体 `color` 与 `items`，文件分支只提供 `structureFile`；地图相关名称、模板定义/实例 ID、新 prefab ID、两侧辅助 ID 和场景 Transform 始终留在目标配置。`structureFile` 相对配置文件目录解析，只接受严格 JSON `schemaVersion: 1`，文件可携带主体颜色和逐 item 的资源、局部 Transform、颜色；未知字段、非法版本、空 items、非法颜色和非有限 Transform 均在编码前拒绝。根入口公开 `GstsConfig`、`GstsStaticAssembly`、`GstsStaticAssemblyItem`、`GstsStaticAssemblyStructure` 与 `GstsStaticColor`，发布包同时提供 `schemas/static-assembly.schema.json`。自动消费回归会构建并打包主包与 `create-genshin-ts`，从安装后的脚手架生成全新 starter、安装主包 tarball、按包名完成上述类型检查，并运行安装后的 `assets:static-assemblies --help`。

#### 适用边界

这是 commit b09390c 的当前公开类型、结构加载和发布消费边界。结构文件加载器不读写 `.gil`，也不从已有 `.gil` 提取结构；自动构建、解析测试和 tarball/starter 消费只证明当前代码与离线发布链路，不证明真实地图写回、编辑器加载或游戏行为。颜色 wire、闭包、ID 安全与既有受限游戏验证仍由各自 Claim 管辖；任何真实地图操作都需重新确认。`src/compiler/gsts_config.ts`、`src/index.ts`、`src/cli/assets_static_assemblies.ts`、`src/cli/static_assembly_structure.ts`、`package.json` 或对应消费测试变化时必须复核。

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
