# 定时器

- `setTimeout` / `setInterval` 单位为毫秒。
- 编译器自动生成名称池，规避同名冲突。
- `// @gsts:timerPool=4` 可覆盖池大小。
- 在定时器回调中，捕获到的定时器句柄可直接用于 `clearTimeout/clearInterval`（包括清理非自身句柄）。
- `setInterval` 过高频率（<=100ms）会警告。
- 项目同时加载 `@types/node` 时，未标注的 callback 参数仍可推断为节点图类型；如需完全避开 Node 全局同名 API，可使用 `gsts.timers.setTimeout/setInterval`。
