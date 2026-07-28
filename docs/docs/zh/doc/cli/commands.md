# CLI 命令

- `gsts build`
- `gsts dev`
- `gsts inject`
- `gsts maps`
- `gsts open map` / `gsts open backup`
- `gsts assets:custom-variables`
- `gsts assets:static-assemblies`

## 静态元件拼装

```bash
# 默认只预览，不修改地图
npm run assets:static-assemblies -- --map-id <id>

# 保存离线候选，不覆盖已有文件
npm run assets:static-assemblies -- --gil <source.gil> --output <candidate.gil>

# 显式备份并写回
npm run assets:static-assemblies -- --map-id <id> --write
```

preview 会先加载相对配置目录的 `structureFile`（如有），再打印来源/候选 SHA-256、主 ID、两侧辅助 ID、资源列表、item 数量和触及的顶层字段。结构文件诊断在读取 `.gil` 前失败，不会修改结构文件或源地图。`--write` 成功只证明文件已备份并写回，不证明编辑器加载或游戏行为正确。

静态元件拼装写入 `.gil` 资产结构；GIA injection 替换 NodeGraph；`createPrefab` 在运行时创生已有元件。三者不能互相替代。
