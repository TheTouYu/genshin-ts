# 2026-10-16 客户端控件模板差分实验（地图 1073741829 lua-sync-test）

## 恢复块
```
MAP=/home/h/.local/share/anime-game-launcher/prefix/drive_c/users/h/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741829/1073741829.gil
MAP_ID=1073741829
LOCKED_BEFORE=evidence/2026-10-16-clientui-templates/raw/update-template-v1.gil
LOCKED_HASH=f95b72907f52493ae3e43caea1b5d1e9a442674e3cf2a8679ebea14416b33ca3
```

## 轮次记录

### v1 更新模板（15:24 保存，用户口述「完成了更新了模板」）
- before t-v0-before.gil 0f2aab0b29d5 (24265B=15:07 版) → after t-v1 24276B
- **唯一增量**：root9 r9[2] 首个大 info 块 f502 692→703B，内部容器模板（id 1073741847, parent f504→1847）子节点的**挂载槽 f74 11B→22B**（挂载集 {main=1073741825} → {main, main2=1073741826}）；同步 f505 48→59B / f503 36→47B（同 11B 模式内嵌镜像）。root46 审计时间戳 20B 替换。
- 规则状态：**CONFIRMED**（与 D268 挂载 wire 模式一致：11B=`b21f080a0608 08<guid>`；挂载槽可追加多条）
- 语义：容器模板内节点挂载 main2
- 下一轮：等用户下一操作

## 已知背景（本轮实验前）
- 地图含：主屏布局（默认布局+官方预制+Lua测试文本框 1073741843）、容器节点模板 1073741847（挂 main+main2）、f50 登记表（main/main2 源码 59B 占位）、1828 图有光标检测区域模板（10-13 建）
- 目标：文本框/按钮/光标检测区域三模板 + 容器实例化到主屏 → 探针 lua 部署

### v2 修改容器节点尺寸（15:34 保存）
- before v1(f95b7290) → after v2(e379e1f1, 24372B, +96B)
- 增量：1073741847(模板)+1073741846(素材组) 各 +48B 同步替换；f13 内每平台 float 对 150.0×150.0 → 用户值 + 每平台新增一档尺寸组
- 规则状态：CONFIRMED-同构（模拟器 codec transformByPlatform 已支持，按用户指示不再差分深挖）
- LOCKED_BEFORE=evidence/2026-10-16-clientui-templates/raw/resize-container-v2.gil
- LOCKED_HASH=e379e1f1a067571be2d4be19d0420e6cca60205596f42c6ee7141612bef45099

### v3 容器下新增子容器（16:24 保存）
- before v2(e379e1f1) → after v3(b51d2128, 24953B, +581B)
- 新增 2 条记录：**1073741867 子容器节点**(655B, f504=1868 父引用, 名字「容器节点」, 自带四平台 transform 默认值 84B float 区) + **1073741868**(687B, f503 回指 1867, f504=1845) ——形态对照 15:00 轮的「素材组 1846」(f503 引用模板+f504 挂层级根)
- 替换 3 条：1847 容器模板(751→743B, f502{f14{}} 引用清空=children 区变化) / 1845 层级根(f503: 1846→**1868**=层级根改挂新记录) / 1846 素材组(757→?)
- root46 审计戳
- LOCKED_BEFORE=evidence/2026-10-16-clientui-templates/raw/add-subcontainer-v3.gil
- LOCKED_HASH=b51d212836d7db84d50f16ee0e31b727c44fc0f57211b4bcb891cf26052f6732
- 待办：1867 transform 区 vs 模拟器 codec make_node('container') 字段共性对齐

### v4 导入整合包 probe-combined.gia（17:05 保存，用户实证导入成功）
- before v3(b51d2128) → after v4(6575cb5f, 40762B, +15809B)
- **GIA→.gil guid 重编号铁证**：GIA{tx=2301,btn=2302,cursor=2304,容器=1850,探针层=1851,main=2400} → .gil{**tx=1871, btn=1872, cursor=1873, 容器=1869, 探针层=1870, main→1827(main_1)**}
- root9 五条新记录（26→31）：tx 695B(含 textConfig 特有段)/btn 675B/cursor 670B/容器 511B/探针层 566B + 顶层 guid 索引 35B→60B 重写
- **wire 与模拟器 codec commonData 完全互认**：server-container 用 isGroup marker(f502=23,f14{f15{}},f501=5)，其余控件 f502=86,f14{f17{}},f501=7；data 三件套=name(f502=15)/field14/transform(f502=12,f13 平台数组)；模板序号槽 f502{f12{f501=N}}（容器2/tx3/btn4/cursor5）
- root50：main_1 条目{f1=1073741827, f2="main_1", f3="default_import_file/main.lua", f5=12550B 源码}——脚本导入带去重（main 已占 1825）
- **探针 lua 必改**：T_TXT/T_BTN/T_AREA 常量 2301/2302/2304 → 1871/1872/1873（InstantiateClientUIControl 索引=真机 .gil guid）
- LOCKED_BEFORE=evidence/2026-10-16-clientui-templates/raw/import-probe-bundle-v4.gil
- LOCKED_HASH=6575cb5f71293e31555144a278bfa328d5544108221e54f6cf78cba4b822e7c5

### v5 模板放进布局（17:15 保存，用户操作「使用」环节）
- before v4(6575cb5f) → after v5(709261cd, 42996B, +2234B)
- root9 +8/-1：**「默认布局」1073741825**（221B，f503=packed 子实例 guid 列表）；**容器实例×2（1874/1876 各 525B）**：f502{f13{f501=1869} f501=3}（**type3 引用模板 1869**）+f504=布局 id（1825 默认布局/1840 已有容器）；**探针层实例×3（1877/1878/1879 各 566B）**挂容器下；1869 模板 related 更新（524B 版）；顶层 guid 索引 60B→70B
- **与 docs/game-engine-knowledge/ui-controls.md 老体系布局 wire 逐字段同构**：模板 f502[type4] 无 f504 / 实例 f502[type3] 引用模板+f504=布局 / 布局 f503=子实例列表——新客户端控件体系的布局段沿用老语法
- 布局与脚本共用 guid 段（「默认布局」=1073741825 与脚本 main 同段）
- LOCKED_BEFORE=evidence/2026-10-16-clientui-templates/raw/template-to-layout-v5.gil
- LOCKED_HASH=709261cd6b94c574721650357c7e2e1450a5ac0587831331d0883c93b6d760d2
