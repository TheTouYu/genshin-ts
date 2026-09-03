# 06-R6 Runbook：渲染链用户侧 seams（编辑配置 + 游戏日志 + 帧级对拍）

> 前置状态（2026-09-05 已注入 1914，SHA 5795112b，Temp 双一致；commit 5fa3b2f + 1802f62）。
> 目的：完成票 06 阶段①剩余 3 条 seam（帧级协议 / 行为对拍 / 负载验收），为阶段②（orbit2 延时编排）开门。

## 1. 用户编辑器配置（第二造物，参照 04 轮第一造物做法，约 2 分钟）
放置/配置对象：**第二造物**（小体型模型，近出生点）。四件套：
1. 状态决策图绑定 = **1082130445** `_GSTS_rbVDecision`（槽 80 决策图）；
2. 技能管理引用 = **1191182340** `_GSTS_rbVSkill`（28+瞬发，body 已绑 20008 图 1082130443），
   CD 冷却组 0.01s + **忽略公共冷却**（造物触发频率 ~15Hz 关键）；
3. 状态图 = **1082130444** `_GSTS_rbVStatus`（20009，executeSkill(1)——链到技能 1191182340）；
4. 自主逻辑模板序号 1（与 04 轮一致）。
自检：两个造物并存不互斥（各挂各的决策图/技能管理；技能管理 slot 81 每个技能一条）。

## 2. 游戏测试协议（一次会话录全）
1. 打乱（op13）→ 等停；
2. 手动面转 ≥2 次（不同面）→ 手动中层转 1 次（M/E/S）→ 手动整转 1 次（x/y/z tab）；
3. 触发自动还原（tab14）→ 跑完整段（十字→角→E 层…）或至少 30s；
4. 退出游戏 → 提供 Beyond_Debug_Log 新编号（与 3143 同一图 1914 复测口径）。

## 3. 服务端侧判读命令（拿到日志后执行）
```bash
# 行为层：客户端单元是否真的在算（f8=4194308 图族；任务拍帧数）
python3 .agents/skills/debug-log-investigator/scripts/gia_log.py <日志.gia> records --summary
# 帧级 seam：对拍客户端任务拍 vs 服务端设备帧
python3 .agents/skills/debug-log-investigator/scripts/gia_log_flow.py <日志.gia> --gil <1914.gil> --rec <任务拍编号> --client
#   期望：rbv_echo 's' 每槽 1 条（tag/e/slot/piece/axis/vel1/vel2）；服务端 visual 图
#   每槽 1 次 spin+orbit1、orbit2 定时器各自 1 次 add_uniform_*；参数逐槽等于客户端回传
#   （数值精确匹配；vel1/vel2 按 kernel 样例格式核对，样本见 tools/rbv-math-kernel.mjs 输出）
# 负载 seam：与 3143 基线（turn 14.6MB/488 条、visual 19.6MB/1470 条）对比
python3 .agents/skills/debug-log-investigator/scripts/gia_log.py <日志.gia> perf
#   通过判据：turn+visual 记录字节 ↓≥60%，开详情日志全程不被踢
```

## 4. 行为预期（失败判据）
- 任意面转：9 块各自 spin+两段折线轨道、块间错峰节奏与注入前一致；手动 0.3s 手感不回退；
- 中层 8 块 / 整转 26 块（整转若客户端单拍 >3000 帧截断 → 记 open-item 拆拍）；
- 自动还原：每步间 logic 发布时序不变（flowAfterTurn 仍在 unlock 后），求解不串台；
- 若出现：整面不动 / 少块 / 方向反 / 视觉与逻辑错位后卡 lock → 判失败，附日志帧值定位
  （嫌疑序：门寄存器未 ack → 缓冲收包不全 → rbv_go 未达 turn → 定时器/设备壳读错槽 → 客户端数学错）。

## 5. 通过后收口（agent）
勾票（帧级/行为/负载三栏）→ PROGRESS 记轮（分载 Round 6，附 3143 对比表）→ 精确 commit；
随后开阶段②：orbit2 延时编排/定时器列表构造搬客户端（spec-06 Implementation Decisions）。
