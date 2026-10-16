# T02 · 新建技能「真机试玩与取数闭环」

**What to build**：把六项 0 吸收的真机自动化能力做成一个**可被自动加载的技能**，让"用户去游戏玩一次→看日志"这条人机接缝变成机器可执行闭环。

- Blocked by：无
- Status：✅ 2026-10-17

## 覆盖的六项能力（全部现已存在、但 12 技能 0 命中）
1. `tools/ys-editor/` 工具箱（guard/unstick/unstick2/rescue/orphans/stuck-report/selfconnect-vaccine/accept-meter/grabq/shape）
2. `ys-gui-slot`（焦点占用包装器：拿到→跑完→trap EXIT 归还，三级验证）
3. 试玩三件套 `ys-playtest-start` / `ys-playtest-stop`（轮询判据）/ `ys-pointer-click`（闭环定位）
4. `ys-lookd` GPU 识别常驻服务 + `ys_look.py` 客户端（成本链：进程启动 > I/O 面积 > 计算）
5. `_ys-ui.sh` 判据库（只截 40×40 = 84ms；全窗 5893ms 的教训）
6. 真机输入探针知识（键盘 43 槽 + 具名键/鼠标映射、拖拽阈值 (2.5,3.1] 游戏px、事件序列 `Dn→En→Bd→Dg×n→Up→Cl→Ed`、Lua print 落日志 **f23**）

## 验收
- [x] 技能存在且 description 能被"真机试玩/取数/日志/桌面自动化/GUI 操作"类任务触发
- [x] 必含：**单周期做完所有实验**纪律、一次拿焦点、爆发注入 + 退出落盘 + 离线解析、轮询+判据（禁固定 sleep）
- [x] 必含：与 `debug-log-investigator`（f23 解析）、`game-from-scratch`（阶段 7）、`verify-injection` 的**分工与引用**（不重复它们的正文）
- [x] 写入"日志窗口勾选 + 负载记录"**待覆盖**登记（官方 guide:1472/1529/51 有据，我方未实现）
- [x] `game-from-scratch` 阶段 7 加一行引用（把"提醒用户去玩一次"升级为"用本技能自动跑 + 用户终裁"）
- [x] 验收命令：grep 六项能力名 → 本技能 ≥1 命中
