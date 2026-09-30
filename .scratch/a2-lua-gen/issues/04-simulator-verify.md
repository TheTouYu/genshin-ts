# 04 沙箱模拟器验证

## What to build

PoC 产出的 .lua 在沙箱模拟器（`/home/h/miliastra-beyond-simulator`）lua-runtime 里跑通并对照真机契约——证明生成的 Lua 是「合法的千星 Lua」而非「任意 Lua」。

## Blocked by

03

## Status

⬜

## 验收项

- [ ] 03 票的 2 个样例在模拟器 lua-runtime（fengari）执行无解析/运行错误
- [ ] 行为符合预期（Tween 时间推进/控件属性变化可观测）
- [ ] 对照 `client/lua-runtime/docs/observed-contract.md` 逐条自查：生成代码不触碰契约禁止面（_VERSION/print 覆写等裁剪项）
- [ ] 差异登记：模拟器行为与官方文档描述不一致处（如有）
