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

### 静态拼装公开配置类型的当前边界

`assets:static-assemblies` 通过动态导入读取默认导出的配置对象，并从 `assets.staticAssemblies` 选择组件。当前公开 `GstsAssetsConfig` 仅声明 `customVariables`，尚未声明 `staticAssemblies`，因此已验证的生产配置使用 `.mjs` 且不添加 `GstsConfig` 类型注解；这不是对 CLI 只支持 `.mjs` 的声明。

#### 适用边界

这是易变的公开类型表面状态，必须同时复核 `src/compiler/gsts_config.ts`、`src/index.ts` 和 CLI 配置加载实现。任一依赖变化都进入待复核；本 Claim 不说明 Transform 语义，也不授权地图操作。

<!-- CLAIM:END clm_01KYGSK9PHX67KFENCBF7MAY2E -->
