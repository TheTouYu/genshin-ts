# 物理运动复刻 Round 11 交接

> 状态：当前推荐 / 待执行
> 来源：用户游戏内验证 + 当前代码实现 + 真实 `物理运动.gia`
> 最近校验：2026-07-10
> 适用范围：下一轮修复 `向量缩放除法` impl 输入参数路由

---

## 一、下一轮目标

### 唯一目标

> 修复 `向量缩放除法` 复合内部 `Division` 的第二个输入未引用复合输入的问题，生成并注入物理整图供用户游戏内核验。

### 范围

1. 只处理 `向量缩放除法` 的 impl 输入路由：真实接口定义是对的，问题在内部 `Division.InParam[1]` 没有从复合输入 `InParam[1]` 接入。
2. 优先修通用 composite capture/input 映射逻辑，而不是在业务代码里补假值或改接口。
3. 保留本轮已通过的 `计算滚动角速度` 稀疏命名输入修复、`三维向量内积` 第二参数显式向量写法、外层 `更新v、w` 拓扑和 Local Variable 编码。
4. 不处理 `Create 3D Vector(0, 0.9, 0)` 替代 vec3 字面量的通用写法完善；用户已明确放到后续轮次。

### 完成标准

1. 自动 trace 显示 `向量缩放除法` 内部 `Division.InParam[1]` 来源为复合输入的第二个参数，而不是默认 `0` 或未连接。
2. `计算滚动角速度` 中调用 `向量缩放除法(v, R)` 后，`R` 能穿透到子复合 impl 的 `Division` 第二输入。
3. 保留并通过 `tests/composite/test-composite-sparse-named-input.ts`，新增或更新一个针对空名复合输入 / `向量缩放除法` 的最小回归。
4. `npm run build`、物理工程生成和针对性 trace 通过，重新生成 `dist/tests/layout/physics-motion/main.gia`。
5. 用户要求后显式注入当前物理整图；用户游戏内确认通过后再归档和提交。

---

## 二、可用资源与执行边界

### 已验证基线

- `游戏内通过`：本轮修复后的 `计算滚动角速度` 稀疏命名输入。用户确认 `w角速度-a朝向转化` 中 `InParam[0]` 未连接、`InParam[1] a朝向` 已连接生效。
- `游戏内通过`：`三维向量内积` 第二参数改成显式 `Create 3D Vector(0, 0.9, 0)` 后，截图中的“缺少第二个参数值”问题已生效修复；但通用字面量写法完善留到后续轮次。
- `自动验证通过`：`tests/composite/test-composite-sparse-named-input.ts` 覆盖只传第二个命名输入时保留声明 input index，生成物理 `InParam[1]` 且有连接。
- `当前实现`：`更新速度`、`更新角速度`、`计算滚动角速度` 已替换返回当前 `v/w` 的代理语义。
- `待验证`：`向量缩放除法` 内部 `Division.InParam[1]` 仍未引用复合输入，用户截图路径：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局/复合节点-核验问题-向量缩放除法.png
```

### 本轮复盘：阻碍、帮助、可复用知识

- 最大阻碍：把真实 GIA 的“少一个物理输入 pin”误判成业务层需要补传参数。正确处理方式是先区分“目标结构本来就是稀疏输入”与“生成器把命名输入压缩了”。
- 最大帮助：用户游戏内截图和即时核验。截图明确指出 `InParam[1] a朝向` 断线、内积第二参数缺值，避免继续在公式层猜测。
- 可复用知识 1：`f.callComposite(handle, { namedInput })` 必须按子复合声明 input index 编码，不能用 `Object.values(inputs)` 的传参顺序直接当物理 pin index。
- 可复用知识 2：截图里的“定义是对的、impl 内部没连上”通常优先查 compositePins/capture input 映射，而不是查复合接口定义。
- 可复用知识 3：复合输入名可以是空字符串。代码里用 `if (!inputName) continue` 会误跳过空名输入；下一轮 `向量缩放除法` 很可能就卡在这里。
- 可复用知识 4：先用 `trace-dataflow --composite=<name> --all-params` 定位真实来源，再决定是业务复刻问题还是编译器通用编码问题。

### 文档资源索引

#### P0：工作细节准则

- [`layout-working-rules.md`](layout-working-rules.md)
  - 用途：协作边界、游戏目录、生成/注入/归档命令、小步验证规则。
  - 何时读：生成、注入、归档、清理导入目录或等待用户游戏反馈前。
  - 读取范围：第一节、1.1、路径速查、3.1/3.2/3.6/3.8/3.9/3.13；不要默认加载全文。

#### P1：当前任务权威资料

- [../physics-motion-recreate-guide.md](../physics-motion-recreate-guide.md)
  - 用途：查看物理复刻工程当前状态、本轮稀疏命名输入修复、`向量缩放除法` 位置。
  - 何时读：开始修改前和更新文档时。
  - 范围：第 2 节命令、第 5.5/5.6 节，搜索 `向量缩放除法`。
- [../../architecture/composite/dsl-api.md](../../architecture/composite/dsl-api.md)
  - 用途：确认 `defineComposite` / `callComposite` 当前 API 语义。
  - 何时读：如果需要判断参数声明、命名输入或嵌套复合调用语义。
  - 范围：`f.callComposite`、“复合中调用复合”。
- [../../gia-tools-reference.md](../../gia-tools-reference.md)
  - 用途：选择 trace/decode 命令。
  - 何时读：需要结构化核对真实和生成 GIA 时。
  - 范围：`trace-dataflow`、`decode-gia`。

#### P2：升级调查入口

- [../../documentation-map.md](../../documentation-map.md)：只有任务扩展到新 API 设计或多模块文档路由时读取。
- [../../documentation-governance.md](../../documentation-governance.md)：真实 GIA、当前实现、历史 handover 结论冲突时读取。
- [layout-handover-physics-motion-round-10.md](layout-handover-physics-motion-round-10.md)：只追溯本轮前三个复合实现边界时读取，不作为当前 API 教程。

### 代码与测试入口

```text
tests/layout/physics-motion/composites/update-vw-stubs.ts
  `vectorScaleDivision` / `calculateRollingAngularVelocity` 当前业务复刻位置。

src/runtime/composite_registry.ts
  `toCompositeDefIR()` 扫描 capture 输入并生成 compositePins；重点检查空字符串 inputName 是否被跳过。

src/runtime/core.ts、src/runtime/ir_builder.ts、src/runtime/meta_call_types.ts
  本轮 sparse named input 的 IR 元数据修复，下一轮避免回退。

src/compiler/ir_to_gia_transform/composite.ts / index.ts / layout.ts
  本轮按 `compositeInputIndex` 编码复合调用 input pin 的 Stage 3 路径。

tests/composite/test-composite-sparse-named-input.ts
  已有回归，防止只传第二个命名输入被压缩成 `InParam[0]`。
```

### 真实样本与比较字段

```text
真实文件：/home/h/genshin-ts/复杂gia/物理运动.gia
备用路径：/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/复杂gia/物理运动.gia
目标 composite：向量缩放除法
重点节点：Division / 3D Vector Zoom
比较字段：compositeDef inputs、compositePins、Division InParam[0/1] 来源、pin kind+index、connects、literal value
```

推荐起手命令：

```bash
npx tsx tests/composite/trace-dataflow.ts 复杂gia/物理运动.gia \
  --list-nodes --composite='向量缩放除法'
npx tsx tests/composite/trace-dataflow.ts 复杂gia/物理运动.gia \
  <Division节点索引> --composite='向量缩放除法' --all-params --max-depth 6
```

### 易错点与禁止事项

1. 不要通过给 `向量缩放除法` 的空名参数传默认值或改名来绕过；真实接口名为空字符串，应该支持空名输入映射。
2. 不要把 `if (!inputName)` 当作“没有输入名”；空字符串是合法输入名，判断应使用 `inputName === undefined` 或等价显式判断。
3. 不要回退本轮 `compositeInputIndex` 修复；它已被用户游戏内确认解决 `w角速度-a朝向转化` 稀疏输入。
4. 不要把自动 trace 通过写成游戏内通过；`向量缩放除法` 修完后仍需用户核验截图中的节点。
5. `npm run build` 会清空 `dist/`，最终必须重新生成 `dist/tests/layout/physics-motion/main.gia`。

### 推荐工作流

1. 读取本 handover 的目标、截图路径和 P0/P1 相关小节。
2. trace 真实 `向量缩放除法`，确认 `Division` 两个输入应分别来自 `1` 和复合输入 `InParam[1]`。
3. trace 当前生成 `dist/tests/layout/physics-motion/main.gia` 的 `向量缩放除法`，复现 `Division.InParam[1]` 未引用输入。
4. 写最小自动回归：复合输入名为空字符串，内部节点消费该输入，断言 compositePins / decoded connects 保留该输入。
5. 修 `src/runtime/composite_registry.ts` 的 capture input 扫描逻辑，重点避免空字符串 inputName 被跳过。
6. 运行 `npm run build`、新增回归、物理生成和针对性 trace。
7. 更新 `physics-motion-recreate-guide.md` 中 `向量缩放除法` 状态。
8. 用户要求后显式注入 `dist/tests/layout/physics-motion/main.gia`，等待游戏内反馈；通过后归档并提交。
