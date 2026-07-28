# CLI 命令

- `gsts build`
- `gsts dev`
- `gsts inject`
- `gsts maps`
- `gsts open map` / `gsts open backup`
- `gsts assets:custom-variables`
- `gsts assets:static-assemblies`

## 地图发现与静态元件拼装

```bash
# 稳定、默认脱敏的地图 JSON；仅显式要求时计算文件哈希
gsts -c gsts.config.ts maps --format json --include-hash

# 直接检查一个 GIL，不需要项目配置
gsts assets:static-assemblies inspect --gil source.gil --format json

# 项目配置只负责地图定位；资产配置独立声明拼装内容
gsts -c gsts.config.ts assets:static-assemblies plan \
  --asset-config assemblies.config.ts --map-id <id> --output plan.json

# 旧 preview/output/write 入口继续兼容
npm run assets:static-assemblies -- --asset-config assemblies.config.ts --gil source.gil
```

`maps` JSON 按修改时间降序、再按 mapId 排序，默认不包含玩家目录或绝对路径；`recent` 只表示 30 分钟窗口，不代表选中或授权。`inspect` 输出定义、实例、两侧辅助闭包、Transform、占用 ID、候选模板和源 SHA-256。`plan` 绑定源 GIL、资产配置、结构文件和规范化拼装语义，生成确定性 `planHash`；冲突或闭包不完整时状态为 `blocked` 并以非零退出。

`inspect` 和 `plan` 始终只读，`--output` 只新建、不覆盖。`closureStatus=complete` 只证明当前已知结构完整，`compatibility=unknown`；自动检查不等于编辑器或游戏验证。旧子命令 `--config` 暂作为 `--asset-config` 的 deprecated alias，根 `-c/--config` 只表示项目配置。

静态元件拼装写入 `.gil` 资产结构；GIA injection 替换 NodeGraph；`createPrefab` 在运行时创生已有元件。三者不能互相替代。
