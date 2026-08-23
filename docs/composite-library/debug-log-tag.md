# 日志标签包（无 print，固定标识搜索帧）

> 状态：当前推荐（2026-08-23 足球调试实证）
> 来源：真实 Beyond_Debug_Log 帧 + 足球项目抽象
> 参考实现：`examples/football/src/composites/debuglog.ts`（`dbgTag` / `dbgPhysSnapshot`）
> 适用范围：需要在不 print 的前提下，从日志快速定位某次事件/某组变量值的任何服务端节点图。

## 背景

本地节点的白盒日志太大；有时只需要知道某次事件发生时的几个状态变量值。用两个图变量
`dbgTag` / `dbgVal` 记录「固定标识 + 字符串化的数据」，就能在 `gia_log.py frames` 结果里
用固定标识快速 grep 到需要的数据帧，不需要新增打印节点。

## 两个复合节点

- `dbgTag(tag, val)`：写 `dbgTag` / `dbgVal` 两个图变量。
- `dbgPhysSnapshot(e)`：拍下 `state` / `ballPos` / `ballVel` / `ballSpin` /
  实体 `rotate` / 实体 `location`（可改为任意业务字段组合）。

调用处示例（详见 football 的 game.ts）：

```ts
const logKick = f.callComposite(dbgTag, {
  tag: new str('DBG_KICK'),
  val: f.dataTypeConversion(tabId, 'str')
})
const snap = f.callComposite(dbgPhysSnapshot, { e: ball })
```

## 为什么不用 print

- 日志帧会记录 `Set Node Graph Variable` 的 IN1/IN2 原始参数，含我们写入的字符串；
- 不需要额外 print 节点，避免污染 `text` 通道、多一种证据来源；
- 可对多个变量分别写 tag，字段独立。

## 快速检索

```bash
python3 .agents/skills/debug-log-investigator/scripts/gia_log.py <日志.gia> frames --gil <地图.gil> \
  | grep -E '=== rec|String=dbgTag|String=dbgVal' > /tmp/dbg_pairs.txt
```

然后用 Python 把 tag/value 成对抽出成紧凑时间线，按固定标识筛选。

## 复用注意

- `dbgTag`/`dbgVal` 必须在图的 `variables` 中声明（`new str('')`）。
- 建议只在调试阶段挂入事件链；发布前可保留变量但移除日志调用，或整段删除，
  用 Git 单独提交方便回滚。
- tag 命名带上前缀（如 `DBG_KICK` / `DBG_POS`）更容易 grep，也避免误撞业务字符串。
