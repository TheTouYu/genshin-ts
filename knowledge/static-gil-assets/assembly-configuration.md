# Static assembly configuration and transforms

Navigation for reusable configuration, transform, template, resource, and explicit-ID constraints.

No claims are created by this Blueprint structure Bundle.

<!-- CLAIM:START clm_01KYF24E5RX2APB1GZ2KZGYBFX -->

### 当前生产配置与两层 Transform

`assets:static-assemblies` 通过动态导入读取默认导出的配置对象，并从 `assets.staticAssemblies` 选择组件。当前公开 `GstsConfig` 尚未声明该字段，因此已验证的生产配置使用 `.mjs` 且不添加 `GstsConfig` 类型注解；这不是对 CLI 只支持 `.mjs` 的声明。组件 `position/rotation/scale` 描述场景中的主 Transform，每个 item 的同名字段描述相对组件原点的局部 Transform；缺省旋转为 `[0,0,0]`，缺省缩放为 `[1,1,1]`，所有向量必须有三个有限数值。

#### 适用边界

坐标层级和缺省值来自当前实现，长方体资源 `10009001` 的 `scale: [1,1,1]` 对应游戏原始 `1×1×1` 尺寸来自当前地图的用户游戏验证。其它资源的原始尺寸、其它模板和其它地图必须单独验证。

<!-- CLAIM:END clm_01KYF24E5RX2APB1GZ2KZGYBFX -->
