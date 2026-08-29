# 复盘：速度场带球注入后游戏拒载——旧冲量踢球复合残留链类型错位

> 状态：已验证（真实地图清理实证）
> 来源：真实 GIA/GIL 验证（足球地图 1073741908 拒载排查 + def-clean 清理）
> 最近校验：2026-08-30
> 适用范围：游戏引擎规则（注入残留拒载）

## 现象

2026-08-28 把足球带球从「冲量踢球」切换为「速度场吸附」（新图 dribble-field 1073741828），
注入后**游戏启动不了（拒载，无日志）**。用户查到 `dribble_decide` 复合节点"问题很大"。

## 根因（铁证链）

1. **旧版复合残留未删**：旧版 game.gia（冲量踢球版）含 6 个冲量复合
   （`kick_apply`/`push_get_role`/`push_compute`/`push_auto_check`/`dribble_decide`/`auto_check_tick`），
   注入器 merge 只覆盖同 ID、**不删除地图残留旧 def**（2026-08-20 orbit_scheduler 同款事故模式）。

2. **新版复合 ID 前移**：新版 game.gia 删了这 6 个复合后，其余复合 ID 按定义顺序前移
   （phys_goal_collide=1610700005…kick_reset=1610700020），与旧版残留 ID 段重叠。

3. **残留引用链类型错位**：残留 `auto_check_tick`(def 1610700022, impl 1610710022) 的 impl
   内部 n17 调用残留 `dribble_decide`(1610700021)；而残留 `dribble_decide` 的 impl 内部
   引用的 `phys_slide_tick`/`kick_reset`/`kick_apply_force` 已经是**新版复合**（ID 被新占用）
   ——exec 复合被当数据复合引用，接口完全错位。

4. **游戏校验全部复合（含零引用残留）** → 类型错位 → 拒载无日志
   （与 2026-08-26 足球地图"复合目录多版本残留拒载"同族）。

## 排查命令（可复用）

```bash
# 1. 全量复合目录（看多版本/残留）
npx tsx tools/parse-gil-node-graph.ts <map.gil> --list

# 2. 找残留 def 的调用者（复用 CLI compositeCallerMap 逻辑）
npx tsx src/cli/gsts.ts assets:node-graphs def-clean --gil <map.gil> <def-id> --dry-run
#    → 报错 "still referenced by N node(s): graph <impl-gid> n<idx>" 即暴露残留引用链

# 3. 读残留复合 impl 内容（看内部引用了什么）
npx tsx tools/explain-gil-node-graph.ts <map.gil> --composite <残留名>

# 4. 清理（候选 → 回读 → 写回）
npx tsx src/cli/gsts.ts assets:node-graphs def-clean --gil <map.gil> <def-id...> --force --output <候选>
npx tsx src/cli/gsts.ts assets:node-graphs def-clean --gil <map.gil> <def-id...> --force --write
```

## 修复要点

- `def-clean --all-unused` 一轮只删"无调用者"的 def；**残留互相引用时需显式列出全部 + `--force`**
  （本次：dribble_decide 被 auto_check_tick 引用 → --all-unused 删不掉，必须显式列 7 个 + --force）。
- `--force` 的 "will leave dangling nodes" 警告在**残留链整体删除**时是安全的：
  auto_check_tick impl 引用 dribble_decide 的节点随 impl 一起删，不会留下悬空调用。
- 清理前先 `--output` 候选回读验证（复合目录干净 + check-gil-composite-refs 0 悬空 + 主图引用完好），
  再 `--write`（自动备份 + SHA 校验）。

## 效果

- 地图 SHA 0ae6f5d1 → 7130d60d（463303 → 409957 字节，删 7 def + 7 impl）
- 复合目录：24 个正确复合 + 9 个信号 def 保留，0 残留
- check-gil-composite-refs：0 悬空；变量 pin：180 节点全完整
- 挂载：球实体 1077936135 → 1073741825(game) + 1073741828(dribble-field) 不变
- implTotal 1686 < 3000，主图展开 2549

## 待办

- [ ] 用户重载地图进游戏，验证可启动 + 带球手感
