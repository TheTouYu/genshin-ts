# 传球.gia — 复合 impl 图控制流

> 与主图同格式的树表示 · 仅含控制流

---

## 顺序执行 (n=30, id=1073741912)

```
复合:顺序执行

   入口 InFlow[0]
   │
   ├── OutFlow[0] "是"       → leaf(0) → 复合出口[0] "是"
   ├── OutFlow[1] "是"       → leaf(1) → 复合出口[1] "是"
   ├── OutFlow[2] "是"       → leaf(2) → 复合出口[2] "是"
   └── OutFlow[3] "是"       → leaf(3) → 复合出口[3] "是"

   impl 图: 5 节点, 4 exec 边
   n=1 Double Branch(入口) → 展平到 4 个 Double Branch(leaf)
   执行顺序: 依次触发 [0]→[1]→[2]→[3]
```

---

## 自身实体条件 (n=8, id=1610612834)

```
复合:自身实体条件

   入口 InFlow[0]
   │
   └── [条件: 自身实体 == 目标实体?]
        │
        ├── 成立 → OutFlow[0] "是"
        └── 不成立 → (停止, 无出口)

   impl 图: 3 节点 (纯数据)
   n=4 Double Branch(捕获)  n=5 Equal  n=7 Get Self Entity
```

---

## 职业branch (n=40/n=43, id=1610612908)

```
复合:职业branch

   入口 InFlow[0]
   │
   └── [查询玩家职业 → 匹配]
        │
        ├── 匹配前锋   → OutFlow[0] "前锋"
        ├── 匹配中锋   → OutFlow[1] "中锋"
        ├── 匹配后卫   → OutFlow[2] "后卫"
        ├── 匹配门将   → OutFlow[3] "门将"
        └── 以上都不匹 → OutFlow[4] "其他"

   impl 图: 8 节点 (纯数据)
   获取玩家实体 → 查询玩家职业 → 4×Equal + 条件branch
   仅一个出口被触发
```

---

## 蓄力时间 (n=29, id=1610612907)

```
复合:蓄力时间

   入口 InFlow[0]
   │
   └── [多项 ≥ 判断 + 自定义变量]
        │
        ├── 异常条件     → OutFlow[0] "异常"
        ├── 蓄力段 1     → OutFlow[1] "是"
        ├── 蓄力段 2     → OutFlow[2] "是"
        ├── 蓄力段 3     → OutFlow[3] "是"  (→ n=43)
        └── 无匹配       → OutFlow[4] "否"

   impl 图: 9 节点 (纯数据)
   多个 ≥ 节点 + Subtraction + 条件branch + GetCustomVariable
```

---

## e技能特效 (n=5, id=1610612956)

```
复合:e技能特效

   入口 InFlow[0] "前锋"
   │
   n=31  Mount Looping Special Effect (挂载特效)
   │
   └── OutFlow[0] → n=32  复合:定时器设置与触发
                        │
                        ├── OutFlow[0] "触发时动作" → n=44  Clear Looping Special Effect
                        │
                        └── OutFlow[1] "后续动作" (未连接)

   impl 图: 4 节点, 2 exec 边
   挂载特效 → 定时器 (到时间后清除特效)
```

---

## 标记e技能释放 (n=11/n=12, id=1610612909)

```
复合:标记e技能释放

   入口 InFlow[0] "开始计时"
   │
   └── [记录 e 技能释放时间 → 计算剩余 CD]
        │
        └── OutFlow[0] → (继续执行)

   OutParam[0] "获取cd" → 输出计算结果

   impl 图: 9 节点 (纯数据)
   SetVariable + GetVariable + Subtraction + TakeLargerValue + Addition
   嵌套: 获取关卡计时器时间 × 2
```

---

## 职业参数 (n=52, id=1610612936)

```
复合:职业参数

   [纯数据: 读取图变量"传球速度"]
   │
   └── OutParam[0] "传球速度" → n=20

   impl 图: 1 节点
   n=49  Get Node Graph Variable
```

---

## 条件branch (嵌套复合, id=1610612800)

```
复合:条件branch

   入口 InFlow[0]
   │
   n=32  Double Branch
   │
   ├── OutFlow[0] → n=34  Double Branch
   │                  │
   │                  └── OutFlow[0] → n=33  Double Branch
   │                                      │
   │                                      └── OutFlow[0] → n=2  Double Branch
   │
   └── (链式判断, 匹配任一条 → 对应出口)

   复合出口: [0]"是"  [1]"是"  [2]"是"  [3]"是"  [4]"否"
   逻辑: 4 个条件逐一尝试, 都不满足 → OutFlow[4] "否"
```

---

## 获取三实体 (n=4, id=1610612905)

```
复合:获取三实体

   [纯数据: 读取 3 个图变量]
   ├── 图变量"引擎实体" → OutParam[0] "物理引擎实体"
   ├── 图变量"挂载实体" → OutParam[1] "挂载实体"
   └── 图变量"运动实体" → OutParam[2] "运动实体"

   impl 图: 3 节点
   3× Get Node Graph Variable
```
