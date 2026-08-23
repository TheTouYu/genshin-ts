# 灯阵 v6 注入运行手册（待用户确认后执行）

> 状态：**待执行**（2026-08-22）
> 目标地图：1073741890「灯阵-最小图」
> 当前源 SHA-256：`6d9e56407143d49dc79cd1a8a2e5a08e27693d329374ef3a20c5b385e37e4ee9`
> 前置：游戏已关闭、编辑器未打开该地图（否则旧内存保存会覆盖磁盘写回）

## 执行顺序（不可颠倒，每条都是真实踩坑换来的）

```text
1 信号注册（6 个新信号，每条 --write；全部注册后 inspect 核验版本一致性）
2 新建 3 个灯柱 prefab（灯柱L4/L5/L6，assets:static-assemblies 写回）
3 玩法图注入（6 张关卡图 + 管理图，逐图建占位 + 注入前改 config nodeGraphId）
4 挂载（灯柱L4/L5/L6 def 挂载对应图 1830/1831/1832）
5 提醒用户重新加载编辑器 → 保存 → 游戏测试
```

## 1. 信号注册（已 dry-run 验证，2026-08-22）

> ✅ 已用 `--output` 候选模式 dry-run 验证：6 个新信号全部注册成功，ID 自动分配无冲突。
> 实际写回时用 `--write`（自动备份），或先 `--output` 生成候选再 `--write`。

```bash
GIL=/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741890.gil

# 注意：--param 逐个传（不是 --params），每个参数一个 --param name:type
node ./bin/gsts.mjs assets:signals register --name win_wave --param level:int --gil "$GIL" --write
node ./bin/gsts.mjs assets:signals register --name lamp_wipe --param level:int --gil "$GIL" --write
node ./bin/gsts.mjs assets:signals register --name lamp_hint --param level:int --param seq:int --gil "$GIL" --write
node ./bin/gsts.mjs assets:signals register --name level_restart --param level:int --gil "$GIL" --write
node ./bin/gsts.mjs assets:signals register --name level_back --param level:int --gil "$GIL" --write
node ./bin/gsts.mjs assets:signals register --name level_hint_ask --param level:int --gil "$GIL" --write

# 核验：inspect 应显示 11 个信号（原 5 + 新 6）
node ./bin/gsts.mjs assets:signals inspect --gil "$GIL"
```

**dry-run 验证结果（信号 ID 自动分配，无冲突）**：

| 信号 | sendId | monitorId | serverId | params |
|------|--------|-----------|----------|--------|
| win_wave | 1610612756 | 1610612757 | 1610612758 | level:int |
| lamp_wipe | 1610612759 | 1610612760 | 1610612761 | level:int |
| lamp_hint | 1610612762 | 1610612763 | 1610612764 | level:int, seq:int |
| level_restart | 1610612765 | 1610612766 | 1610612767 | level:int |
| level_back | 1610612768 | 1610612769 | 1610612770 | level:int |
| level_hint_ask | 1610612771 | 1610612772 | 1610612773 | level:int |

## 2. 新建灯柱 prefab（灯柱L4/L5/L6）

```bash
# 用 lamp-l4-l6-assets.mjs 计划写回（含 tabBar + basicMotion 组件）
# 具体命令按 static-gil-model-builder 技能的候选→回读→写回流程执行
# prefabId: 1077936200(L4) / 1077936201(L5) / 1077936202(L6)
```

## 2b. 管理台 tabBar 四选项（2026-08-23 v7 交互扩展）

```bash
# 更新既有 管理台 prefab 1077936131 的 tabBar → 四选项
# （dry-run 已验证：candidate 读回含 开始游戏/重开本关/返回上一关/提示，
#   touchedTopLevelFields=4,8；entity 1077936191 读回同步生效）
node ./bin/gsts.mjs assets:static-assemblies \
  --asset-config examples/lights-out/assets/plans/lamp-manager-tabbar-assets.mjs \
  --gil "$GIL" --write
```

## 3. 玩法图注入（6 关卡图 + 管理图）

```bash
# 每张图：先建占位图 → 注入前改 config nodeGraphId → 注入 → 回读节点数
# 图 ID 映射：
#   L1=1825(复用) L2=1826(复用) L3=1827(复用)
#   L4=1830(新建) L5=1831(新建) L6=1832(新建)
#   管理图=1828(复用)
# 注入后回读：关卡图各 155 节点，管理图 214 节点
```

## 4. 挂载

```bash
# 灯柱L4/L5/L6 def 挂载对应图（灯柱L1/L2/L3 已挂载，无需重复）
node ./bin/gsts.mjs assets:mounts attach 1077936200 --graph 1073741830 --gil "$GIL" --write
node ./bin/gsts.mjs assets:mounts attach 1077936201 --graph 1073741831 --gil "$GIL" --write
node ./bin/gsts.mjs assets:mounts attach 1077936202 --graph 1073741832 --gil "$GIL" --write
```

## 5. 编辑器重载 + 游戏测试

- 用户重新加载编辑器 → 保存 → 进游戏测试。
- 预期日志标记（v7）：`manager-ready` → `game-start-clicked` → `level1-building` →
  `lamp-created`(L1×2/L2×3/L3×4/L4×6/L5×9/L6×9) → `start-tab-disabled`（开始后禁用「开始游戏」）→
  `lamp-toggle` → `lamp-win` → `win-wave` → `wipe{n}-sent` → `level{n+1}-building` →
  … → `game-clear` → `start-tab-enabled`（全通后重新启用）→ `win-auto-30s`。
- **验证点**：`game-start-clicked` 应恰好出现 **1 次**（修复前是 12 次重复建关）。

## 回滚

- 每步写回前自动备份到 `.gsts/backups/1073741890.gil.<ts>.bak`。
- 回滚 = 恢复备份 + `maps:resync`。

## 待用户配合的组件（批次 4/5，非本轮）

- 文本气泡 `textBubble`：编辑器为灯头 prefab 1077936130 手动添加一次 → 差分实验闭合。
- 光源 `lightSource`：同上。


## 隔离环境端到端验证（2026-08-22，非破坏性）

已用 `GSTS_BEYOND_LOCAL_ROOT` 指向隔离目录 + `APPDATA` 重定向，在**地图副本**上完成
Stage 1→2→3→注入 全链路验证，未触碰真实地图 1073741890：

| 验证项 | 结果 |
|--------|------|
| Stage 3 GIA 生成 | ✅ 7 张 `.gia` 全部生成（id 1825/1826/1827/1829/1830/1831/1828） |
| 注入 | ✅ `ok 7, fail 0`（7 图全部注入成功） |
| 回读图列表 | ✅ 关卡图各 152 节点、管理图 286 节点 |
| 回读信号 | ✅ 11 个信号（5 原 + 6 新），ID 无冲突 |

**关键发现（已修正）**：
1. **占位图 ID 自动分配**：`assets:node-graphs create` 自动分配下一个空闲 ID。
   真实地图现有图 1825-1828（无 1829），故 L4/L5/L6 占位图 = **1829/1830/1831**（非 1830/1831/1832）。
   已修正 `levels.ts` 与 `gen-levels.mjs` 的 graphId。
2. **批量注入忽略 config.nodeGraphId**：多 entry 时注入器用 `.gia` 内 `g.server({id})` 推断目标图，
   无需逐图改 config。
3. **注入环境坑**：备份目录 `~/.genshin-ts/backups` 只读 → 需 `APPDATA=<可写目录>` 重定向；
   `dist/` 缺 `gia.proto` → 需 `node scripts/postbuild.mjs` 复制。

**真实地图写回命令（确认后执行）**：
```bash
export APPDATA=/home/h/genshin-ts/.gsts-appdata   # 备份目录重定向
node ./bin/gsts.mjs -c examples/lights-out/gsts.minimal.config.ts   # 批量注入（含信号已注册前提）
```
