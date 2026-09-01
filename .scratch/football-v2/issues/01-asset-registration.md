# 01 — 资产注册：fb_ball_state 信号 + 33 变量落图

**What to build:** R2 物理通道的全部通信资产在地图 1073741908 上注册到位——回传信号
fb_ball_state 可被编译器引用、状态镜像与拍门寄存器可被两端图读写、19 个物理参数以
PORTING-MAP 定稿值挂在球实体上（用户编辑器边测边调的通道）。做完本票，R2.2/R2.3
图扩建即可开写，无需再碰注册表。

**Blocked by:** None — can start immediately.

**Status:** ✅ done（2026-09-03；两段式：首轮挂玩家实体写回后，用户三轮挂载修正 → 备份恢复+一次写对；最终地图 SHA 4ce87ed5，Temp 双 SHA 一致）

**挂载定案（用户 2026-09-03 三轮修正裁决，推翻 R2-DESIGN §4"挂玩家实体"）**：
- **球实体 1077936135 = 唯一状态容器**（31 个变量）：fb_ball_gate:int=0 + 镜像 11（tick/state:int + px..sz:float）+ fb_p_* 19 参数（PORTING-MAP 定稿值）。理由：单例零同步、语义正、**服务端图挂球 getSelfEntity 直写=v4 成熟先例**（02 票 fb-server 挪挂球实体）
- **丘丘人元件 def 1082130433 + 5 实体（1082130437..441）= 球引用持有者**：fb_ball_entity:entity=0（空引用，运行时 fb-server 会话种子逐实体写）——fb-phys 读链 getSelfEntity→读球引用→读球变量（R2-DESIGN E5 主链原样）
- **玩家实体九副本：零 fb_ball\* 变量**（E1 寄存器 11 个保留）——挂玩家被用户否决：多人 1~8 不定，逐副本维护不合理

- [x] CLI 通道预检：tsx 故障在当前环境已消失（npx tsx 正常）；`node ./bin/gsts.mjs` 通道全程可用（不走 tsx loader，最稳）
- [x] donor 静态扫描：全库 30+ 地图 117 条信号记录——float 参最多=「绘制圆弧」4 个（1912）；1916 仅 d2cv(str,int) 2 参。**发现 fb_echo(e,c 双 int)/state_changed(prev,next) 同型槽 wire 先例（游戏内验证过）**→ 催生工具能力修复（见下）
- [x] 信号 fb_ball_state 注册：**主案 11 参落地**（tag:str, tick:int, 9×float, state:int；send/monitor/server=1610612774/775/776，builtin 布局无 donor）。降级链实际走向：donor 在位但工具双重限制（①MAX_PARAMS=9 防呆，官方 12 参信号「绘制圆弧」背书下提到 12，commit b6cf894；②非 str 同型重复 fail-closed 需 N 套 donor 布局——四轮编辑器差分证实"引擎不校验 pin 值、n3 field2=参数全局序号"，共享槽去重+生成器外推落地，commit e231402）→ 未动用 §5 三档降级。**E3 游戏内终验（float 信号参数端到端）并入 R2.3/R2.5 照走**
- [x] 变量注册（挂载两段式，终版按用户裁决）：**首轮**按 R2-DESIGN §4 挂玩家九副本（13×9）+球 19——用户指出多人 1~8 不定逐副本维护不合理，经三轮修正（丘丘人元件→足球场→**球实体+服务端图挂球**）推翻重挂；**终版**：球实体 ← **31 个一次写入**（gate:int=0 + 镜像 11 + fb_p_* 19 含定稿值），丘丘人 def 1082130433 + 5 实体 437..441 ← fb_ball_entity:entity=0（空引用运行时动态写），玩家九副本经**最早备份恢复**（SHA a0dae9e5=写前原状）归零。§4"镜像组 12"系计数笔误（名字清单实 11），已向用户备案
- [x] 写回安全流程全链（两轮）：首轮 11 步（安全门用户确认）→ 挂载修正 → **备份恢复**（最早备份=写前原状，恢复后 SHA a0dae9e5 核验，九副本/球归零、E1 完好）→ 终版候选链 8 步全量回读（信号+球 31+丘丘 def/5 实体+玩家零 fb_ball*+六图零改动）→ 8 步 CLI --write（每步自动备份）→ 写后 SHA=候选 SHA **4ce87ed5** → Temp 同步双 SHA 一致
- [x] 旧四图 825/826/828/829 零改动：`node-graphs read --json` 内容摘要（排除源路径字段）写前备份 vs 写后**逐一一致**；顺带验证其余五图（827/830/433/434/435）同样零改动（注：地图不在 git 内，"git diff 验证"以备份↔写后内容摘要对比等效实现）
- [x] 收轮：勾票+看板刷新+PROGRESS 记「下一步=02」+精确 commit

## 执行备注（给后续票的接口事实）

- fb_ball_state 参数序：tag, tick, px, py, pz, vx, vy, vz, sx, sy, sz, state（fb-phys 回传打包 / fb-server onSignal 按此序消费）
- **镜像/gate/参数全挂球实体**（服务端图挂球 getSelfEntity 直写，02 票挪挂载）；fb-phys 读链：getSelfEntity（丘丘人）→ fb_ball_entity 球引用 → 球变量（E5 主链）；丘丘人 def=1082130433（算力丘丘），5 实体 1082130437..441
- vec3 镜像化议题：用户提议评估，结论=R2 按标量定稿走（float 读已验 E1/1915，vec3 客户端读无已验记录），vec3 读并入 03 票 E5 观测分支顺带验证，验过后 R3+ 再迁移
- CLI 经验：地图定位 `node ./bin/gsts.mjs maps`（游戏目录 /mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/<uid>/Beyond_Local_Save_Level）；tsx 沙箱故障时 bin 通道是替代路径；entity 型变量 --vars 语法必须带值（`name:entity=0`）

> **09-03 修正（用户知识，推翻本票两处口径）**：①上表"参数序"行的 11 参标量形态实为 **12 参**
> （str+int+9float+int——"11 参"系计数笔误，注册表实测 12），且**引擎信号参数上限=10**，
> 12 参注册成功但运行不可用；②已原位 update 为 **6 参 vec3 形态**：
> `tag, tick, pos:vec3, vel:vec3, spin:vec3, state`（ID 774/775/776 保号，同型 vec3×3 经
> e231402 去重生成器落地）。vec3 镜像化议题结论同步反转：**信号层已 vec3 化**（超限合并），
> 球实体镜像 11 变量维持标量不动（消费端 split 拆分量）。详见 signals.md「信号参数数量上限」节。
