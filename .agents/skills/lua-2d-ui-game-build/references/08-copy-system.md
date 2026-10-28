# 文案系统（原神世界观文案/三落点通道/用例锁）

> 出处：复盘表 C11/A10/F4。设计文档：`workspace/tetris/docs/genshin-copy-design.md`（40 条全表）。

## 1. 数据驱动
- `config.lua` 的 `COPY` 表：编号｜原文｜类型｜触发点｜条件｜动静｜位置｜颜色｜优先级｜`live` 标记。
- main 只挂槽（标题→实例文字、局内→botBanner、结算→settleExtra）；接线新条目不碰渲染代码。

## 2. 三个落点通道（层级不同不能混用）
1. **标题页**：服务端 textbox 被展台墙压住 → 必须**实例文字**（`MS.addText`，动画由 `MS.tick` 驱动）。
2. **局内**：`botBanner` 是唯一常驻提示位；`bannerTimer` 是占用闸（事件文案优先、到点恢复常驻）。
3. **结算**：`settleExtra` 旁白行；颜色走 `settleNoteRGB`（否则每帧被统一色覆盖）。

## 3. 用例锁的是什么（血泪）
- `grep 连击|等级|本局` 全无命中≠安全——`tests/29` 断言 **`botBanner == PERSIST_TIP` 整串**（at=1.4s）。
- **改常驻文案（PERSIST_TIP）必须同步改该断言**；事件文案/标题手记/结算旁白可自由改。
- 红线：**print 日志锚一字不能动**（`clear n=`/`takeover hint/ai/back`/`guide stage=` 等是断言对象）。

## 4. 优先级
升级 > 四消 > 连击 > 普通消行（靠 bannerTimer 让位）；接管文案（纳西妲）在 3s 无操作后出现。

## 5. 文案质量
- 原神味：短句、画面感、角色口吻（纳西妲温软/派蒙活泼）；避免说明书腔。
- 长度：单行不裁（用 textbox-fit 机检）；标题页手记 ≤16 字。
