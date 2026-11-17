# 力输入套件设计（FORCE-KIT）· 足球 v3 地图 1073741827

> doc-type: D · status: 设计定稿（结构层已实施前基准）· updated: 2026-11-17
> 作者=力输入套件子代理 · 读者=接手者/用户复测
> 判据来源：任务书（先设计后实施）+ D818/D820 力通道语义 + D623 Lua 桥 + lintPlan 真跑结果

## 0. 一句话

四个数值组件（x/y/z/s）+ 击球预设 + 全按键按钮化：UI 收 (x,y,z,s) → 服务端新图 `zz-force-kit`
按「连线单位向量」语义换算世界系力 → 写载体 `fb_fx/fb_fy/fb_fz` + `fb_f_seq` 自增 → 物理内核
kitLoop 既有 3 拍脉冲窗口施力。**不改 kit-loop/kit-render/kit-listen 任何一行。**

## 1. 信号流（端到端）

```
[屏幕按钮 cursor-area / 键盘 7·8·9]      [键盘 1-6（既有）]
        │ game.ServerSignal('fb_input')        │
        │ AddInt(key);AddInt(1);SendSignal()   │
        ▼                                      ▼
  服务端 zz-force-kit（新图 1073741835，挂载体 1082130445）   kitListen（既有，键 1-6 踢球）
        │ 键 31-39/41-45：维护镜像变量 fb_kx/ky/kz/ks/fb_kstep（clamp）
        │ 键 7：读 fbvx/fbvz（玩家位）+ 球实体 1077936163 的 fb_rpx/fb_rp z（球位）
        │      û=normalize(球-玩家)水平单位向量；ŝ=垂直侧向单位向量
        │      fb_fx = 83.33·s·(x·ûx + z·ŝx)   fb_fz = 83.33·s·(x·ûz + z·ŝz)
        │      fb_fy = G + 41.67·s·y           fb_f_seq += 1（触发脉冲窗口）
        │ 键 8：fb_fx/fb_fy/fb_fz = 0（急停）
        │ 键 9：镜像复位 (1,0,0,1) 步进×1
        ▼
  物理内核 kitLoop（既有 1082130436，不改）：seq 变化后 PULSE_TICKS=3 拍内
  acc = extF − G（y 轴）/ 水平 acc = F；dt=0.04 ⇒ Δv ≈ 0.12·F_net
```

**量纲换算（设计核心，用户口径的数值化）**：
- 1 单位 x（s=1）⇒ Δv = 0.12 × 83.33 = **10 m/s 沿连线**（= K1 推射速度）
- 1 单位 y（s=1）⇒ 净上加速度 41.67 ⇒ Δvy = **5 m/s**（fb_fy 写 G+净值，内核减 G）
- 1 单位 z（s=1）⇒ **10 m/s 侧向**（û 的水平垂直方向，弧线的侧力近似）
- s 全局倍率 0.1~10

**预设（对齐 kit-loop.ts:146-157 的 K1-K5 语义）**：

| 预设 | (x, y, z, s) | 折算 Δv | 对应内核常量 |
|---|---|---|---|
| P1 推射 | (1, 0, 0, 1) | 10 m/s 沿线 | K1=10 |
| P2 抽射 | (1, 0.5, 0, 1.6) | 16 前 + 4 上 | K2=16 |
| P3 吊射 | (0.5, 1.2, 0, 1) | 5 前 + 6 上 | K3=7@~50° |
| P4 短传 | (1, 0.1, 0, 1.2) | 12 前 + 0.6 上 | K4=12 |
| P5 弧线 | (1, 0.25, 0.7, 1.4) | 14 前 + 1.75 上 + 9.8 侧 | K5=14+旋 14 的侧力近似 |

## 2. 键位分配（fb_input key 参数，全链无冲突）

| 键 | 语义 | 消费图 |
|---|---|---|
| 1-6 | 踢球（既有） | kitListen（不动） |
| 7 | **施力**（读镜像算力向量） | zz-force-kit |
| 8 | 清力（三力分量清零） | zz-force-kit |
| 9 | 镜像复位 | zz-force-kit |
| 10, 23-28 | 调参面板（既有） | aimPanel（不动） |
| 31/32 | x −/+ | zz-force-kit |
| 33/34 | y −/+ | zz-force-kit |
| 35/36 | z −/+ | zz-force-kit |
| 37/38 | s −/+ | zz-force-kit |
| 39 | 步进循环 ×0.1→×1→×10 | zz-force-kit |
| 41-45 | 预设 P1-P5 | zz-force-kit |

旧 zz-force-test（1073741832，未挂载）的 7/8/9 探针语义由本套件取代；键盘 7/8/9 标签同步更新。

## 3. 组件清单（.gil 新增 46 条记录，全部挂容器节点 1073741863）

坐标=编辑器绝对坐标（1600×900 中心系，y 向上）。热区=client-cursor-area（无视觉，叠在
textbox 上，内缩避 P2）；按钮视觉=client-textbox。**布局已过 qxqy-ui `V.lintPlan` P1-P5
真跑（46 控件 0 issue），判据脚本 `.scratch/football-v2/fk-plan.lua`。**

| 区块 | 控件 | 坐标/尺寸 | 说明 |
|---|---|---|---|
| 标题 | fk_title | 240,640 320×40 fs22 | 「力输入试验台 · 7=施力」 |
| 数值行×4 | fk_vx/fk_vy/fk_vz/fk_vs | 170,{596,552,508,464} 200×44 fs20 | 显示「x 前后 +1.0」 |
| 行按钮 | fk_xm/fk_xp…（8 个 textbox+8 热区） | 310/374,同行 56×44 fs20 | 「−」「+」 |
| 预设 | fk_p1..p5（5 textbox+5 热区） | 104+i·92,404 84×44 fs20 | 推/抽/吊/传/弧 |
| 动作 | fk_apply/fk_clear/fk_reset | 134/262/390,352 116×44 fs20 | 施力7/清力8/复位9 |
| 步进 | fk_step | 505,352 100×44 fs18 | 「步进×1」循环 |
| 状态 | fk_status | 280,306 400×36 fs18 | 最近操作回显 |
| 踢球热区 | fk_kick1..6（6 热区） | 1380,636−(i−1)·48 376×40 | 叠既有 hud_k1..k6 上=按钮化 |

按钮=「textbox 视觉 + cursor-area 命中」二件套（cursor-area 无视觉无文本，官方字段表只有
raycastTarget；CursorEventData 无坐标字段 ⇒ 离散热区是唯一稳妥形态）。raycastTarget=true 由
Lua 运行时置（霜华纪先例 `UI.fieldArea.raycastTarget = true`，pcall 包裹）。

**配色（淡雅，复用 HUD-v1 令牌）**：面板文字 `#E2E9F4` 浅灰 / 标题 `#E8C88A` 描金 /
按钮字 `#FFFDF8` / 预设键 `#B9C3D4` / 施力键描金加粗。禁纯白底纯饱和。

## 4. 新增载体变量（1082130445，5 个 float/int）

`fb_kx`(默认1) `fb_ky`(0) `fb_kz`(0) `fb_ks`(1) `fb_kstep`(int，0=×0.1/1=×1/2=×10，默认1)。
clamp：x/y/z ∈ [−100,100]，s ∈ [0.1,10]——**服务端图与 Lua 镜像双端一致**（aimPanel 漂移教训）。

## 5. Lua 变更（examples/football/lua/fb-input.lua v2→v3）

1. FK 本地镜像 + 渲染：值框文案「x 前后 +1.0」格式化；步进/施力/清力按钮文案；
2. 23 个热区接线：getCtl 缓存 → raycastTarget=true（pcall）→ AddCursorEventListener
   ('CursorClick') → send(key,1) + 本地镜像同步 + 重渲染（不等服务端往返）；
3. 踢球热区 fk_kick1..6 → send(1..6,1)（键盘 1-6 按钮化，移动端可用）；
4. 键盘 7/8/9 标签更新（施力/清力/复位）；OnStart 心跳计数更新；
5. 全部监听 pcall 包裹（真机枚举先行，D561 纪律）。

## 6. 服务端图（examples/football/src-fb3/zz-force-kit.ts，新文件）

- 图 ID **1073741835**（v3 现无主，实施时 `assets:node-graphs` 实核后定），名 `_GSTS_forceKit`；
- 结构复刻 zz-aim-panel：`g.server({id, name}).onSignal(KitSignal.fb_input, …)` + f.* 低层节点；
- multipleBranches 键位分发：31-39 镜像 bump（clampSet 模式）/ 41-45 预设直写 / 7 施力 /
  8 清力 / 9 复位；default 空分支（不吞 1-6/10/23-28）；
- 施力数学：dx=fb_rpx−fbvx, dz=fb_rpz−fbvz, len=√(dx²+dz²)；len<0.05 防御性跳过；
  û=(dx,dz)/len，ŝ=(−dz,dx)/len（z>0 = 面向连线方向的左侧，复测确认手感方向）；
- sqrt 用内核同款节点写法（kit-loop 有先例）；节点预算估算 ~350，远低于 2000 红线；
- 挂载：`assets:mounts attach 1073741835 → 1082130445`（与 kitListen 同宿主）。

## 7. 部署链（D633 铁律：UI → 图 → 变量 → 最后 Lua 挂载）

1. SHA 锁定现图 → 46 条 create+update（每条 --write 自动备份）→ ui list 回读树+坐标；
2. 5 个镜像变量 create → 回读清单；
3. zz-force-kit.ts + `gsts.kit3-forcekit-inject.config.ts` → 编译 → node-graphs 确认 1835 在图 →
   注入（dist CLI，--noinject 不适用，走 football 注入链）；
4. mounts attach → mounts list 回读；
5. **最后**：`assets:scripts update` fb-input.lua v3 → 注册表回读 + 容器挂载完整性检查；
6. maps:resync + 双址 SHA 核对；
7. `gil-node-graph-reading` 回读 1835 真图核验执行流/数据流（读图核验红线）。

## 8. 验证计划（三栏预告）

- **已验证（结构层）**：lintPlan 布局判据；编译通过；.gil 回读（ui 树/变量/挂载/信号/脚本）；
  1835 图回读执行流与源码意图一致。
- **未验证**：真机点击热区是否命中（层序/raycastTarget 真机行为）；施力数值手感。
- **待用户复测**：见 §9。

## 9. 待用户裁决/复测项（实施后不改架构可调）

1. **数值手感**：83.33/41.67 两档换算系数与五预设折算（改 zz-force-kit.ts 常量重注入即可）；
2. **z 轴方向直觉**：z>0 是否=直观的「左弧」（ŝ 方向定义，可翻符号）；
3. **面板位置**：左侧中部（240,~500 中心）与摇杆/小地图实际不重叠需真机确认；
4. 踢球热区无按下视觉反馈（当前仅球动+状态行，可后补颜色闪烁）。
