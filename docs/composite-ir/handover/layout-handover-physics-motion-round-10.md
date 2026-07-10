# 物理运动复刻 Round 10 交接

> 状态：当前推荐 / 待执行
> 来源：用户游戏内验证 + 当前代码实现 + 真实 `物理运动.gia`
> 最近校验：2026-07-10
> 适用范围：完成 `更新速度`、`更新角速度`、`计算滚动角速度` 三个剩余真实复合

---

## 一、下一轮目标

### 唯一目标

> 快速按真实 `物理运动.gia` 完成剩余三个代理复合，并生成、注入物理整图供用户游戏内测试。

### 范围

按以下顺序实现，每次只完成并自动核对一个复合：

1. `更新速度`
2. `更新角速度`
3. `计算滚动角速度`

本轮只替换这三个复合的阶段性代理语义。保留已经通过的外层 `更新v、w` 控制流、`顺序执行`、`计算分力` 层级、布局参数和 Local Variable 通用编码；不要顺手重构其它复合或调整布局。

如果真实结构、参数来源或复合层级存在歧义，立即停下向用户确认，不按节点名称猜公式。

### 完成标准

1. 三个复合均按真实 GIA 还原接口、内部节点、数据来源和 compositePins；不存在阶段性返回当前 `v/w` 的代理实现。
2. 每完成一个复合，使用 trace/decode 对照真实文件，并增加或更新针对性自动检查。
3. `npm run build` 和已有物理/composite 针对性回归通过。
4. 生成 `dist/tests/layout/physics-motion/main.gia`，显式单文件注入目标存档。
5. 用户在游戏内检查三个复合和整图连线；用户确认通过后归档并提交。

---

## 二、可用资源与执行边界

### 已验证基线

- `游戏内通过`：`局部变量-gsts复刻.gia` 的主图和 composite impl 两条 vec3 getter/setter 路线。
- `游戏内通过`：修正版物理运动整图；Local Variable 修复没有破坏当前物理工程。
- `游戏内通过`：外层 `更新v、w` 拓扑、nested capture pin、composite impl 间距和此前布局回归。
- `游戏内通过`：`计算分力` 及其当前真实子复合层级。
- `当前实现`：`更新速度`、`更新角速度`、`计算滚动角速度` 仍是代理，集中在 `update-vw-stubs.ts`。

### 文档资源索引

#### P0：工作细节准则

- [layout-working-rules.md](layout-working-rules.md)
  - 用途：游戏目录、生成/显式注入、归档、小步验证和确认边界。
  - 何时读：开始任务时读快速路径和路径速查；生成、注入、归档时读对应命令小节。
  - 范围：第一节、1.1、第二节、3.2、3.6、3.12、3.13；不要默认加载全文。

#### P1：当前任务权威资料

- [../physics-motion-recreate-guide.md](../physics-motion-recreate-guide.md)
  - 用途：当前物理复刻工程、已验证层级和剩余代理边界。
  - 何时读：开始分析每个目标复合前。
  - 范围：第 2 节分析命令、第 5 节当前进度，重点搜索目标复合名称。
- [../../architecture/composite/dsl-api.md](../../architecture/composite/dsl-api.md)
  - 用途：`defineComposite`、输出绑定和 nested composite 调用语义。
  - 何时读：真实结构需要新增或组合子复合时。
  - 范围：只读 `defineComposite`、`callComposite` 和“复合中调用复合”。
- [../../gia-tools-reference.md](../../gia-tools-reference.md)
  - 用途：选择 trace/decode 工具。
  - 何时读：现有命令无法确认参数来源或 composite 边界时。
  - 范围：只读 `trace-dataflow`、`trace-exec-flow`、`decode-gia`。

#### P2：升级调查入口

- [../../documentation-map.md](../../documentation-map.md)：目标扩展到新 API、编译器通用缺口或其它架构层时重新路由。
- [../../documentation-governance.md](../../documentation-governance.md)：真实 GIA、当前实现或历史结论发生冲突时判断证据等级。
- [layout-handover-physics-motion-round-9.md](layout-handover-physics-motion-round-9.md)：只在需要追溯 Local Variable 失败链路时读取，不作为本轮起手资料。

### 代码与测试入口

```text
tests/layout/physics-motion/composites/update-vw-stubs.ts
  三个目标代理的当前定义；完成后只应保留真正仍属阶段性的内容。

tests/layout/physics-motion/composites/update-vw.ts
  外层调用关系、输入 fan-out 和写回位置；已通过，不改拓扑。

tests/layout/physics-motion/composites/calculate-forces.ts
  当前真实复杂复合的代码组织参考。

tests/layout/physics-motion/composites/force-*.ts
  拆分子复合、复用数学节点和真实参数来源的现有最佳实践。

tests/layout/physics-motion/README.md
  多文件工程边界和当前代理清单；完成后同步状态。

gsts.physics-motion.config.ts
  生成和显式单文件注入配置。
```

### 真实样本与比较字段

```text
真实文件：/home/h/genshin-ts/复杂gia/物理运动.gia
备用路径：/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/复杂gia/物理运动.gia
目标 composite：更新速度 / 更新角速度 / 计算滚动角速度
比较字段：接口名称、type、pinIndex、内部节点列表、nested composite、参数来源、
          compositePins、genericId/concreteId、pin kind+index/type/wrapper、connects
```

优先命令：

```bash
npx tsx tests/composite/trace-dataflow.ts 复杂gia/物理运动.gia \
  --list-nodes --composite='<目标复合>'
npx tsx tests/composite/trace-exec-flow.ts 复杂gia/物理运动.gia --io
npx tsx tools/decode-gia.ts 复杂gia/物理运动.gia > /tmp/physics-real.decoded.json
```

### 易错点与禁止事项

1. 不根据“速度”“角速度”等名称猜物理公式；每个输入必须追到真实节点、复合输入或节点图变量。
2. 不修改已通过的外层 `更新v、w` 拓扑、Local Variable 编码和布局参数。
3. `更新间隔` 是父复合 capture 输入，当前 nested capture 路由已通过；不要重新添加多余物理 InParam。
4. typed generic node 必须核对 concreteId、wrapper 和实际 pin，不只看节点名称或 Stage 2 类型。
5. `npm run build` 会清空 `dist/`；最终构建后必须重新生成物理 GIA。
6. 必须显式传入 `dist/tests/layout/physics-motion/main.gia` 注入，否则配置的目标 graph id 可能不生效。
7. 自动 decode 通过不等于游戏内通过；注入、归档和提交按工作规则执行。

### 推荐工作流

对三个目标依次执行：

1. 从真实 GIA 列出目标复合接口和内部节点。
2. 逐个追踪所有输出及关键输入来源，确认是否还包含子复合。
3. 在 `tests/layout/physics-motion/composites/` 中实现目标；复杂结构拆成同目录独立文件，不把所有逻辑塞回 stub 文件。
4. 生成当前物理 GIA并用 decode/trace 对比目标复合的节点、pin 和 connects。
5. 增加针对性回归；如果暴露通用编译器问题，先用最小真实样本修通用实现，再返回物理复刻。
6. 一个目标自动核对完成后再进入下一个，避免三个复合同时展开后难以定位偏差。
7. 三个目标完成后运行构建和相关回归，重新生成最终 `main.gia`。
8. 向用户确认后显式单文件注入，等待游戏反馈；通过后归档并提交。
