# 物理运动.gia 复刻工程

目标：用接近真实开发 App 的多文件结构，逐步复刻 `复杂gia/物理运动.gia` 的控制流、数据流、复合节点结构，用于布局压力测试。

当前入口：

```text
tests/layout/physics-motion/main.ts
```

当前复合：

```text
tests/layout/physics-motion/composites/set-physics-params.ts
```

推荐编译：

```bash
node bin/gsts.mjs -c gsts.physics-motion.config.ts
```

不要优先使用单文件命令编译这个目录；多文件结构需要 config 让 helper/composite 一起 emit。

游戏内注入应显式传入生成文件，并指定已确认的 LocalLow：

```bash
GSTS_LOCALLOW_DIR=/mnt/c/Users/touyu/AppData/LocalLow \
node bin/gsts.mjs -c gsts.physics-motion.config.ts dist/tests/layout/physics-motion/main.gia
```

仅运行 config 的批量注入路径可能按生成 GIA 的 graph id 查找并报 `target NodeGraph not found`。注入过程自动更新 `src/resources/prefabs.ts`、`src/resources/signals.ts` 属于预期资源提取结果，应保留。
