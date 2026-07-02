# 传球.gia — 主图控制流拓扑

> 设计参考图 · 只含 exec 控制流及分支命名

---

## 第 1/3 页 · 事件根 & 职业初始化

```
┌─ 传球.gia ─────────────────────────────────────────────────────────────────────

  n=3   When Entity Is Created (nid=71)           OutFlow[0] ──┐
                                                                 │
  n=39  When Player Class Changes (nid=385)        OutFlow[0] ──┤
                                                                 │
                                                                 v
                                                           n=40  复合:职业branch
                                                           ├── [0] "前锋" → n=41  Set Node Graph Variable
                                                           ├── [1] "中锋" → n=45  Set Node Graph Variable
                                                           ├── [2] "后卫" → n=46  Set Node Graph Variable
                                                           ├── [3] "门将" → n=47  Set Node Graph Variable
                                                           └── [4] "其他" → n=48  Set Node Graph Variable

  ── 续第 2 页: 复合:监听信号 ──

└─────────────────────────────────────────────────────────────────────────────────
```

---

## 第 2/3 页 · 监听信号 → 多重分支

```
┌─ 传球.gia (续) ────────────────────────────────────────────────────────────────

  n=2  复合:监听信号 → OutFlow[0] → n=8  复合:自身实体条件
                                             │
                                            "是" [0]
                                             │
                                             v
                                       n=7  Multiple Branches
                                       分支条件 (InParam[1] 数组):
                                       ├── [1] "短传球-自动方向"  → n=9  Set Character Skill CD
                                       ├── [2] "短传球-朝向方向"  → n=9  Set Character Skill CD
                                       ├── [3] "e技能"            → n=29 复合:蓄力时间
                                       │      （续第 3 页）
                                       ├── [4] "传球特效"         (未连接)
                                       ├── [5] "接球重置传球cd"   (未连接)
                                       └── [6] "恢复e技能cd"      → n=9  Set Character Skill CD

  ── 续第 1 页: 事件根 → 职业branch
  ── 续第 3 页: 蓄力时间 → 职业branch → 顺序执行

└─────────────────────────────────────────────────────────────────────────────────
```

---

## 第 3/3 页 · 蓄力时间 → 职业branch → 顺序执行

```
┌─ 传球.gia (续) ────────────────────────────────────────────────────────────────

  n=29  复合:蓄力时间  (入口: n=7[3] "e技能")
  │
  ├── [0] "异常"  (未连接)
  ├── [1] "是"    (未连接)
  ├── [2] "是"    (未连接)
  ├── [3] "是"    → n=43  复合:职业branch
  │                    │
  │                    ├── [0] "前锋" → n=30  复合:顺序执行
  │                    │              │
  │                    │              ├── [0] "是" → n=5   复合:e技能特效
  │                    │              ├── [1] "是" → n=11  复合:标记e技能释放
  │                    │              ├── [2] "是"  (未连接)
  │                    │              └── [3] "是"  (未连接)
  │                    │
  │                    ├── [1] "中锋"  (未连接)
  │                    ├── [2] "后卫"  (未连接)
  │                    ├── [3] "门将"  (未连接)
  │                    └── [4] "其他"  (未连接)
  │
  └── [4] "否"    (未连接)

  ── 返回第 1 页: 事件根 → 职业branch

└─────────────────────────────────────────────────────────────────────────────────
```

---

## 数据流追溯

> 统一格式: `InParam[X] "参数名" (类型)  <- 源节点  OutParam[Y] "输出名"`
>             `InParam[X] "参数名" (类型)  = 字面值`

### n=7  Multiple Branches

```
n=7   Multiple Branches (nid=3)

  InParam[0] "待匹配值" (R<T>)      <- n=2  复合:监听信号  OutParam[0] "事件源实体"
  InParam[1] "条件列表" (L<R<Str>>) = ["短传球-自动方向", "短传球-朝向方向", "e技能",
                                      "传球特效", "接球重置传球cd", "恢复e技能cd"]
```

### n=8  复合:自身实体条件

```
n=8   复合:自身实体条件 (nid=1610612834)

  InParam[0] "自身实体" (Entity)   <- n=2  复合:监听信号  OutParam[0] "事件源实体"
```

### n=9  Set Character Skill CD

```
n=9   Set Character Skill CD (nid=739)

  InParam[0] "技能所有者" (Entity)    <- n=1   Get Self Entity
  InParam[1] "技能插槽"   (SkillSlot) = SkillSlot_1E  (E 技能, enum=3111)
  InParam[2] "冷却时间"   (Float)     <- n=12  复合:标记e技能释放  OutParam[0] "获取cd"
  InParam[3] "是否重置"   (Bool)      = true  (enum=1)
```

### n=11 / n=12  复合:标记e技能释放

```
n=11  复合:标记e技能释放 (nid=1610612909)
n=12  复合:标记e技能释放 (nid=1610612909)

  InParam[0] "cd" (Float)  = 12.0
```

### n=19 / n=23  Get Node Graph Variable

```
n=19  Get Node Graph Variable (nid=337)
n=23  Get Node Graph Variable (nid=337)

  InParam[0] "变量名" (Str)  = "传球实体"

  OutParam[0] → (无下游节点, 疑似遗留)
```

### n=20  3D Vector Zoom

```
n=20  3D Vector Zoom (nid=12)

  InParam[0] "源向量"   (Vector)  <- n=2   复合:监听信号  OutParam[4] "位置"
  InParam[1] "缩放倍数" (Float)   <- n=52  复合:职业参数  OutParam[0] "传球速度"
```

### n=29  复合:蓄力时间

```
n=29  复合:蓄力时间 (nid=1610612907)

  InParam[0] "异常" (Float)  = 2.0
  InParam[1] "右值" (Float)  = 0.8
  InParam[2] "右值" (Float)  = 0.3
  InParam[3] "右值" (Float)  = 0.0
```

### n=41 / n=45 / n=46 / n=47 / n=48  Set Node Graph Variable

```
n=41  Set Node Graph Variable (nid=323)  ← "前锋"  (  56, -1841)
n=45  Set Node Graph Variable (nid=323)  ← "中锋"  ( 312, -1791)
n=46  Set Node Graph Variable (nid=323)  ← "后卫"  ( 559, -1701)
n=47  Set Node Graph Variable (nid=323)  ← "门将"  ( -19, -1525)
n=48  Set Node Graph Variable (nid=323)  ← "其他"  (-347, -1377)

  均写入变量 "基础传球速度":

  InParam[0] "变量名"     (Str)      = "基础传球速度"  (统一)
  InParam[1] "变量值"     (Float)    = 9   (前锋)
                                     = 8   (中锋)
                                     = 10  (后卫)
                                     = 12  (门将)
                                     = 8   (其他)
  InParam[2] "是否触发事件" (Bool)   = false  (enum=0, 不触发变量变化事件)
```

---

## 复合 OutFlow 命名一览

```
职业branch:     [0] "前锋"   [1] "中锋"   [2] "后卫"   [3] "门将"   [4] "其他"
顺序执行:       [0] "是"     [1] "是"     [2] "是"     [3] "是"
蓄力时间:       [0] "异常"   [1] "是"     [2] "是"     [3] "是"     [4] "否"
自身实体条件:   [0] "是"
条件branch:     [0] "是"     [1] "是"     [2] "是"     [3] "是"     [4] "否"
定时器设置:     [0] "触发时动作"   [1] "后续动作"
```

### Multiple Branches 条件值

```
n=7  InParam[1] (L<R<Str>>) = [
  [1] "短传球-自动方向"       → OutFlow[1] 连 n=9
  [2] "短传球-朝向方向"       → OutFlow[2] 连 n=9
  [3] "e技能"                 → OutFlow[3] 连 n=29
  [4] "传球特效"              → (未连接)
  [5] "接球重置传球cd"        → (未连接)
  [6] "恢复e技能cd"           → OutFlow[6] 连 n=9
]
```
