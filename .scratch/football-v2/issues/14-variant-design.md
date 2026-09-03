# 票 14 · 最小原型变体设计稿 v4（2026-09-03，待用户确认）

> 依据：`14-candidate-research.md`（含 §8 全节点分类）+ `14-latency-account.md` + 用户口径（2026-09-03）：
> ① 锁步真凶=读方向（客户端读服务端 ~10/s 硬上限）；信号回传方向快（几十/s）。
> ② 路线一=客户端自写自读（零延迟）→计算→信号回传；路线二=客户端写→服务端读。
> ③ 手段优先、载体不限；**用户点名瞬移通道**（全节点枚举后确认为最优：双端全通+6 float/拍+语义即物理状态）。

## 实验总览：一轮三探针（一个主推+两个对照）

| 探针 | 载体 | 路线 | 验证什么 |
|---|---|---|---|
| **T · 瞬移通道（主推）** | complexCreationTeleport(造物, pos vec3, rot vec3) | **一+二同体** | 客户端写 transform→客户端自读（路线一存储：位置天然跨施放持久）+服务端读回（路线二：读回率/延迟）——**一个通道两路数据** |
| A · 技能变量（对照） | set/increase+query（float） | 一 | 跨施放保持性（唯一备选 float 存储，若瞬移通道受限时备胎）+信号回传 |
| C · 生命值（对照） | recoverCreationSHp(球, 0.5, true) | 二 | 结算型写入读回（写任意实体的能力验证——瞬移只作用造物自身，HP 是唯一"写球"通道） |

**为什么瞬移是主推**：双端可读（客户端 getEntityLocation/服务端获取实体位置与旋转都在）；带宽 6 float/拍；
映射零成本（位置/旋转=物理状态本体，无需编码）；跨拍持久是实体属性天性（无技能变量的保持性风险）。

## 载体图与注入物

### fb-loop（新建 20008 客户端实验图，~30 节点，零 print）

```
on('start'):
  n = 探针A的累计计数（querySkillVariableValue(cfg_x)+1，一鱼两吃：既当计数器又测保持性）
  探针T: complexCreationTeleport(
           pos = vec3((n mod 40) * 0.05, 0, 0),   // 0~2m 锯齿往返，限制活动范围
           rot = vec3(0, (n mod 360), 0))          // 旋转编码计数（度）
         loc = getEntityLocation(getSelfEntity())   // 客户端自读（零延迟验证点）
         rot2 = getEntityRotation(getSelfEntity())
         → sendSignalToServerNodeGraph(fb_sv_echo,'SVT', int(loc.x*100))  // 回传自读值（与服务端读值对照）
  探针A: setSkillVariable(cfg_x, n)
         rb = querySkillVariableValue(cfg_x)        // 零延迟+跨施放保持验证点
         → sendSignal(fb_sv_echo,'SVA', rb)
  探针C: recoverCreationSHp(entity(1077936135), 0.5, true)
```

- 造物自身寻址 `getSelfEntity()`（图挂造物技能=施放者即自身）；球寻址 entity 字面量（物件可）
- 每施放一拍全跑（常开，负载预算见下）

### fb-svlisten（新建服务端图，~45 节点，挂球实体 1077936135）

```
① on(fb_sv_echo): tag 分发 → SVT:fb_tp_self_x=e / SVA:fb_sv_last_a=e, fb_sv_count_a+=1
② whenHpIsRecovered（挂球=收球恢复事件）→ fb_hp_evt_count+=1, fb_hp_evt_amt=实际恢复量
③ 轮询定时器 fb_sv_poll 0.06s:
   造物实体 entity(1082130437) 的位置/旋转 → fb_tp_seen_x/y/z, fb_tp_seen_ry   // 路线二·T 读回
   getObjectAttribute(球).当前生命值 → fb_hp_seen                                  // 路线二·C 读回
④ 扣血维持: 定时器 fb_hp_drain 每 2s → 损失生命(球, 0.1×上限HP, 非致命)
⑤ 判据A锚: 首拍 whenEntityIsCreated → recoverHpDirectly(球, 1.0)
```

- **服务端 fb_tp_self_x（客户端自读）与 fb_tp_seen_x（服务端读）逐拍对照 = 复制延迟直读**（两读数差的分布）

## 资产清单（全部新增，现网五图零接触）

| 资产 | 明细 | 创建方式 |
|---|---|---|
| 图 ×2 | fb-loop（20008）/ fb-svlisten（服务端） | assets:node-graphs create + GIA 注入 |
| 信号 ×1 | fb_sv_echo（tag:str, e:int，str+int 免 donor） | assets:signals register |
| 变量 ×10（挂球实体） | fb_sv_count_a/fb_sv_last_a/fb_tp_self_x（int）+ fb_tp_seen_x/y/z/fb_tp_seen_ry/fb_hp_seen/fb_hp_evt_amt（float）+ fb_hp_evt_count（int） | assets:custom-variables |
| 技能配置 ×1 | 28 模板瞬发绑 fb-loop，CD 0.01s+忽略公共冷却 | assets:skill-config create |
| 技能变量 ×1 | cfg_x（float） | **用户编辑器【技能变量管理】创建，回填配置 ID** |
| 造物引用 | 1 号造物（实体 1082130437）技能管理加引用新技能配置 | **用户编辑器操作** |

## 判据阈值预注册

| 判据 | 阈值 | 解读 |
|---|---|---|
| A 送达/复制延迟 | SVT 自读值 vs 服务端 fb_tp_seen 滞后拍数分布（+信号发送→onSignal 秒桶错位）：≥0.06s=共享网络层；≤0.03s=更直；中间如实报。锚=⑤服务端自写→事件同秒 | 共享≠失败（吞吐可管道化） |
| B 到达率阶梯（三路分别判读） | **>8Hz=打破锁步**；≥15Hz=单造物节流顶；≥20Hz=达标（需 2 造物） | ①SVT/SVA 信号到达率（路线一）②fb_tp_seen 变化率（路线二·瞬移）③fb_hp_seen/事件率（路线二·HP） |
| 跨施放保持 | SVA 严格递增=技能变量保持；fb_tp_seen 持续跟随=位置保持（预期必然） | 技能变量不保持→路线一备胎失效，瞬移位置成唯一存储 |
| 自写自读零延迟 | 同拍 loc.x 与写入 pos.x 一致（帧级） | 不一致→瞬移异步（转定点位移评估） |

## 失败解读表

| 观测 | 结论 | 下一步 |
|---|---|---|
| fb_tp_seen 变化率 ≈15-16/s 且滞后 ≤0.03s | **瞬移通道成立（双端）**：路线一+路线二同时通 | 票 16：位置直写集成（状态=位置本体）+N 造物堆率 |
| fb_tp_seen 变化率 >8Hz 但滞后 ≥0.06s | 通道通但共享网络层延迟 | 频率达标即可用（20Hz 目标重延迟轻） |
| fb_tp_seen 变化率被钳 ~8Hz | 位置同步受引擎节拍钳制（客户端写本地、位置权威在服务端→退化为读方向限速） | **关键判别数据**：转路线一（信号回传）为主 |
| SVT 信号到达 ≈15-16/s | 路线一信号快线成立（自持+回传） | 票 16 编码方案 |
| SVA 恒 1 | 技能变量不保持 | 备胎失效（登记引擎语义） |
| HP 全零 | 球 HP 语义不通 | 第二轮写目标换造物 |
| 造物瞬移视觉干扰过大 | 表现层副作用 | 复测轮确认；正式集成时可用隐形造物/幅度限制 |

## 日志体积预算（先预算后开详情）

| 项 | 估算 | 依据 |
|---|---|---|
| fb-loop 客户端详情 | ~2.5KB/拍 ×16/s=**~40KB/s** | 30 节点线性估 |
| fb-svlisten 服务端详情 | 轮询 16/s×2 目标+事件+信号 ≈ **~30KB/s** | 服务端小记录实测 |
| 峰值合计 | **<80KB/s**（E2 踢出线 2MB/s 的 4%） | 安全 |
| 详情分级 | 只开 fb-loop+fb-svlisten | — |

## 复测协议（用户侧）

1. 进真实足球图，站 1 号造物近距
2. 常开自动跑 30~60s——**预期表现：1 号造物在 2m 范围内锯齿往返移动+旋转（属正常，非 bug）；球血条可能波动**
3. **完全退出游戏才落盘**，告知"跑完了"+会话感受（造物移动是否流畅/有无卡顿）

## 回退方案

全部新增资产：标准 detach/备份恢复链；地图回退锚=写前双 SHA `416bd420…b086`。

## 待用户确认项

1. 三探针（**瞬移=主推**+技能变量对照+HP 对照）——OK？
2. 1 号造物会 2m 锯齿移动+旋转（视觉可见）——可接受？
3. 服务端每 2s 扣球 10% maxHP——可接受？
4. 编辑器两步（创建 1 个 float 技能变量+1 号造物加技能引用）——可操作？
5. 常开无任务门（预算 <80KB/s）——OK？
