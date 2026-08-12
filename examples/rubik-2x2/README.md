# 2×2 魔方（Rubik 2×2 Demo）

Genshin-TS 玩法示例：在千星沙箱地图中实现一个可交互的 2×2 魔方小游戏。

## 玩法

- 魔方由 8 个独立方块实体组成（标准魔方配色）。
- 魔方实体上配置 6 个选项卡（R/L/U/D/F/B），对应绕 X/Y/Z 轴 ±90° 的六种标准旋转。
- 玩家选中选项卡后，对应旋转层的 4 个方块绕轴旋转 90°。
- 旋转语义见 `docs/adr/0002`；3×3 及以上按 WCA 符号体系扩展。

## 构建与注入

```bash
# 从仓库根执行（示例目录自带独立配置）
npx gsts -c examples/rubik-2x2/gsts.config.ts
```

编译产物注入到游戏加载目录（Beyond_Local_Export），地图：`1073741882 魔方2x2`。

## 目录结构

```
examples/rubik-2x2/
├── README.md         # 本文件：游戏介绍与构建方式
├── PROGRESS.md       # 进度记录：做了什么、哪些节点图、验证状态
├── gsts.config.ts    # 独立编译配置（地图/节点图 ID）
├── src/              # 玩法节点图源码（TS DSL）
└── assets/plans/     # 元件/实体 CLI 计划与候选（可追溯）
```

## 领域模型

术语表见仓库根 `CONTEXT.md`；决策记录见 `docs/adr/0001`（方块为独立实体）、`docs/adr/0002`（旋转语义）。
