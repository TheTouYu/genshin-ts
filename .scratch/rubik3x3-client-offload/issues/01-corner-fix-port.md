# 01 角块 16-case MB 修复回流客户端分支

## What to build
把服务端主线 3207ca5 的角块宏两段查表修复同步到 examples/rubik-3x3-client/src/solverPlan.ts
（客户端分支仍是 16 命名 case 旧写法，1914 图上 solverPlan=259 节点=修复前）。
只同步源码并编译验证；**注入合并到 #04**，不单独注入。

## Blocked by
- 无

## 验收项
- [x] solverPlan.ts pStep4 角块分支 = 两段 MB（case 0..9 直取 + default 内嵌 Subtraction(Get(mIdx),10) 第二段查 C10..C15）
- [x] 与服务端版 diff 仅剩已知分支差异（solverPlan.ts 仅差 1 行出处注释；分支既有差异=表文件头注释/探针信号/op99/clientProbe，均良性）
- [x] 客户端分支全量编译 --noinject 0 错（10 GIA）
- [x] 结构核验：节点数 259→262（+3=二段 MB，对位服务端口径）；**IR .json 与服务端分支编译产物字节级一致**（结构等价铁证）；.gia 差 1146 字节=mapId 头+两图信号注册表 ID（按图编码，预期内）。真实 .gil 回读核验按计划落在 #04 注入轮
- [x] 精确 commit（只含本票文件）
