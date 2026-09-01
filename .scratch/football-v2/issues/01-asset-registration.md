# 01 — 资产注册：fb_ball_state 信号 + 33 变量落图

**What to build:** R2 物理通道的全部通信资产在地图 1073741908 上注册到位——回传信号
fb_ball_state 可被编译器引用、状态镜像与拍门寄存器可被两端图读写、19 个物理参数以
PORTING-MAP 定稿值挂在球实体上（用户编辑器边测边调的通道）。做完本票，R2.2/R2.3
图扩建即可开写，无需再碰注册表。

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] CLI 通道预检：上一会话 tsx 报 `Cannot resolve tsconfig at path: /home/h/tsconfig.tsx.json`；根 CLAUDE.md 已记修复（`resolveTsxConfigPath`，src/compiler/tsx_config_path.ts）——先跑只读命令（如 signals list）验证，不通先修通道
- [ ] donor 静态扫描：已注册信号库找 float 参 / ≥5 参 donor（地图 1073741916「GSTS核验-变量C2S」优先）
- [ ] 信号 fb_ball_state 注册：主案 (tag:str, tick:int, px,py,pz,vx,vy,vz,sx,sy,sz:float, state:int) 11 参；donor 不在→按 R2-DESIGN §5 三档降级链决策并在票内记录
- [ ] 变量注册 33 个（全部预注册+初始值）：玩家实体 1086324737 ← fb_ball_gate:int=0、fb_ball_entity:entity、镜像 12（fb_ball_tick/py/pz/px/vx/vy/vz/sx/sy/sz/state——清单照抄 R2-DESIGN §4）；球实体 1077936135 ← fb_p_* 19 个 float（初始值=PORTING-MAP 定稿值，逐项照抄 R2-DESIGN §4，勿凭记忆）
- [ ] 写回安全流程全链：SHA 锁定→候选回读→**写回前向用户展示最终清单（确认制）**→写回→回读逐项对照（信号形态+33 变量名/类型/初始值全对）→Temp 手动同步双 SHA
- [ ] 旧四图 825/826/828/829 零字节改动（git diff 验证）
- [ ] 收轮：勾票+看板刷新+PROGRESS 记「下一步=02」+精确 commit
