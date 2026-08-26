# 复合节点内部参数不匹配（游戏拒载）差分基线

- 2026-08-26 锁定：游戏报"复合节点内部参数不匹配"（phys_fly_tick(1) 内部 dbg_tag tag 参数）拒载
- baseline-rejected.gil = 拒载版本地图快照（SHA 12e1fdafe87c...）
- 差分目标：找出 Stage3 生成的复合 impl 图与游戏校验模型不一致的 wire 字段
- 方法：编辑器最小复合样本 vs 注入 wire 逐字节比对
