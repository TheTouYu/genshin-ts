# W3 客户端优化栈移植设计（1899/1914 栈 → 1920）

> 状态：执行中（2026-09-09）。反馈3 修复设计权威。
> 原则：**rubik-3x3-client src = canonical**（已跑通的分载栈整体移植），G3 玩法补丁在源码层重放；
> 与 1919 已核验结构态保持 1:1 对齐（17/17 注入那一代）。

## 1. 目标图态（1920 合并后）

保留：rgState(1835)/rgHint(1836)/rgInput(1837)/rgWin(1838)/切换镜头(1834 空) + donor 挂载矩阵 + G3 机制（op11 打乱/op12 提示/星级）。
替换：9 张迁移旧代服务端图 → 客户端优化代（game 458/turn 1305/ballvisual 73/rbRenderSkill 415 等）。
新增：6 张客户端图（1082130435/438/439/443/444/445）+ 27 中心球 + 块 prefab 组件升级。

## 2. 图 ID 映射（源码声明改写，升序替换防串扰）

| 文件 | 1914 声明 | → 1920 | 备注 |
| --- | --- | --- | --- |
| game.ts | 1073741830 | **1073741825** | |
| relay.ts | 1073741831 | **1073741826** | |
| visual.ts | 1073741832 | **1073741827** | 编译保留，卸挂不删（旧渲染回切能力） |
| solver.ts | 1073741833 | **1073741828** | |
| solverPlan.ts | 1073741834 | **1073741829** | |
| turn.ts | 1073741835 | **1073741830** | + 重放 G3 op11 分支 |
| solverEPlan.ts | 1073741836 | **1073741831** | + 重放 seq-ready 门 |
| testPanel.ts | 1073741837 | **1073741832** | |
| solverLPlan.ts | 1073741838 | **1073741833** | + 重放 seq-ready 门 |
| ballvisual.ts | 1073741840 | **1073741839**（新建槽） | 挂 6203 取代 visual 挂载 |
| rbCrossSkill/rbStatus/rbDecision | 1082130435/438/439 | 不变 | 1920 客户端段全空闲 |
| rbRenderSkill/rbVStatus/rbVDecision | 1082130443/444/445 | 不变 | |

实体引用（10779362xx）全部是 donor 保留 ID，1920 同址 ✓ 零重映射。
技能配置：zaowu 路线代码只用 `executeSkill(true, 1n)` 序号，**源码零配置 ID 字面量** ✓；
配置绑定落编辑器侧（见 BLOCKERS B2）。
信号：DSL 用名字，编译期从 1920 真实注册表解析 → 先注册后编译。

## 3. 源码合并步骤

1. 拷贝 client src 全套服务端图源+客户端图源+composites+tables 覆盖 rubik-game/src 同名文件
   （clientProbe.ts 不移植；rg*.ts/signals.ts 保留 rubik-game 版）。
2. signals.ts 合并：rubik-game 版 9 信号 + client 版 rbx_echo/rbv_echo/rbv_go（client_probe 不迁）。
3. 图 ID 按上表改写（升序替换）。
4. G3 补丁重放（取 self diff：rubik-game 现版 vs donor 原版 = G3 增量）：
   - turn.ts：op11→flowScrambleN 分支 + flow.ts flowScrambleN 复合；
   - solverPlan/EPlan/LPlan：seq-ready 门（截 solve_len=1+phase=0 熄火）+ op12 链；
   - rgState/rgHint 对 op 码的依赖不变（donor 谱系 op5/6/7/13/14 客户端版仍发）。
5. 编译（inject→1920）→ decode-gia 断言（图 ID 落位/枚举槽/信号 wire/常量）。

## 4. 1920 资产重建清单（编译前）

| 资产 | 明细 | 通道 |
| --- | --- | --- |
| 信号 ×3 | rbx_echo(tag:str,e:int)、rbv_echo(str,int,int,int,vec3,vec3,vec3)、rbv_go(e:int) | assets:signals register --write |
| solver 实体变量 | 6230：solver_cp/co/ep/eo/ct（实例级声明=客户端可读） | assets:custom-variables --entity |
| 玩家寄存器 | 模板 def 1086324737+九副本 737..745：rbx_/rbv_ 前缀 epoch/ack/sum+任务字段 | 同上（清单照 1914 实测导出） |
| 技能配置 ×2 | 28+瞬发，body-f5 分别绑 1082130435/1082130443 | assets:skill-config create |
| 27 中心球 | def+inst，官方球体 10009002 直作 templatePrefabId，spawn(3,3,3) scale0.01 | CLI（b7bc385 能力） |
| 块组件升级 | 26 块 root4/root8 双侧组件 4→9（以 1919 实际字节为 donor 参照） | static-assemblies/entities |

挂载变更：6203 卸 visual(1827) → 挂 ballvisual(1839)；其余挂载不动；客户端图不经 mounts。

## 5. 执行顺序

signals → vars → 源码合并+编译(noinject) → decode 断言 → 球/块/技能配置 → 全量注入（**用户确认门**）→ 游戏核验清单交用户。

## 6. 验收口径

- 结构层：decode 断言全绿（ID/枚举/wire）+ 1919 对拍（graph 族/预算量级一致）。
- 行为层（用户游戏核验，三栏报告）：球跟随公转+自转 90° 落位、打乱→闯关→提示→星级全链、
  负载对比（turn+visual 记录字节 ↓≥60% 口径）、createPrefab type 9 裁决（B3）。
