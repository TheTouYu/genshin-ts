# 票02：新地图骨架与目录（G2 前半）

**Status**: ⬜ Open（前沿）
**Blocked by**: 01

## What

创建游戏新地图（用户裁决①：新地图+新目录，不污染主线）：

- [ ] `examples/rubik-game/` 目录 + 独立 gsts 配置 + PROGRESS.md 初始化
- [ ] maps:create 新地图（mapId 落档 BOARD 资产速查节）+ maps:resync
- [ ] maps:init --map-id <id> --write 自动补 root3-49 骨架（免用户首次保存）
- [ ] 地形：20×20 平整场地（竞技场基座预留位），世界坐标按格子公式落位
- [ ] MAP_ID 写入 BOARD.md「资产速查」；新图变量命名空间规划（避免与 donor 冲突）

## 验收

- [ ] CLI inspect/export 回读确认新地图结构合法（root 骨架在位）
- [ ] `examples/rubik-game/` 编译配置可用（空图编译通过）
- [ ] BOARD.md 资产速查含新 MAP_ID
