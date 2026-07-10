# 布局任务工作规则与交互细节

> 状态：当前推荐
> 来源：历史 handover 提炼 + 用户交互约定
> 最近校验：2026-07-10
> 适用范围：Genshin-TS 布局调参、`.gia` 导出、用户游戏内验证、handover 编写

本文只记录能提高协作效率的**工作规则、路径、命令和交互约定**。不要在这里放具体算法解释、代码实现细节或某一轮的长篇问题分析；那些内容仍写在对应 handover 或设计文档里。

---

## 一、核心协作规则

1. 每轮布局调参保持“小步迭代 → 导出独立 GIA → 用户游戏内测试 → 通过后提交”。
2. 每次只改一个小点；不要在同一步同时改横向距离、纵向间距、数据节点行距和分支规则。
3. 用户反馈“通过”后，先移动通过的 `.gia` 到 `Beyond_Local_Export/真-测试通过/布局/`，再把已通过的布局测试脚本移动到 `tests/layout/`，然后提交代码与文档；未游戏内验证前不要提交布局参数改动。注意：`.gia` 归档必须用 `mv`，不要用 `cp`，避免游戏导入根目录同时堆积过多测试文件。
4. 用户给截图时，先用 `read` 打开截图并复述问题，再选择一个小点修复。
5. 游戏内截图和用户反馈是最终裁判；自动分析工具只能辅助判断。
6. 如果遇到阻碍、不确定、方向性问题，或发现用户侧状态与自己的假设不一致，**立即停下来和用户确认**，不要连续深入改多个算法，也不要擅自替用户判断哪些副作用应保留。游戏内状态、资源提取结果、业务取舍等信息并非只靠代码和大模型推理就能高效、可靠地确定；及时确认通常比继续自动推断更重要。
7. 通过的小步要单独提交，便于回溯每个游戏内验证点。
8. 提交前运行 `git diff --check`；编译器、运行时或布局算法代码改动通常还要运行 `npm run build`。
9. 如果只新增或修改 `tests/*.ts` 布局测试文件，不需要重新编译编译器代码；直接用现有 `bin/gsts.mjs` 生成该测试的 `.gia`。
10. 生成测试文件时，图内 `g.server({ name })` 必须带清晰轮次/场景/step，方便游戏里辨认。
11. 导出文件名和图内 name 的 step 应保持同步，避免“文件 step9 但图内 step8”。每次生成新 step 或覆盖给用户验证前，先修改测试文件里的 `g.server({ name })`，再运行 `node bin/gsts.mjs ...` 生成 GIA。
12. 主图普通布局测试优先使用高层 `f.xxx()` DSL；需要精确手动复刻控制拓扑时用当前推荐 raw API `f.entry()` / `f.node()` / `f.link()`。不要把 `f.registerExecNode()` 当作主图普通测试工具；它是自动串联 tail 的低层兼容/API，主图普通路径曾触发 `removeUnusedNodesFromFlow` 中 `record.args is not iterable` 的实现缺口。
13. 覆盖游戏导入目录里的同名 `.gia` 前先 `rm -f` 删除旧文件。
14. 当根目录积累了旧测试 `.gia`、影响用户选择当前测试文件时，先清理 `Beyond_Local_Export` 根目录旧 `.gia`，只保留本轮当前待验证文件；不要删除 `Beyond_Local_Export/真-测试通过/布局/` 等归档子目录，也不要清理用户管理的 `布局/` 截图/参考目录。
15. 不要把 handover 当当前 API 教程；API 用法以 `docs/architecture/composite/` 当前文档为准。
16. 历史 handover 中的旧 API 名称只作为历史上下文，新示例优先使用当前推荐名称。
17. 调布局时不要把 `audit-layout.ts` 的 `ORPHAN` / `EDGE_CROSS` 直接当最终问题。
18. 不要用未复刻目标结构的抽象测试判断最终布局参数；尽量用接近用户截图/参考文件的测试。
19. 未经用户游戏内确认，不要把自动结构核验结果写成“本轮完成”或提前编写最终 handover；可以记录为“自动验证通过，待游戏内核验”。
20. `gsts` 在指定正确 `GSTS_LOCALLOW_DIR` 后可能自动提取并更新 `src/resources/prefabs.ts`、`src/resources/signals.ts` 等资源代码。这是预期工作流，后续代码会使用这些资源；除非用户明确要求，否则不要把自动提取结果当作无关改动恢复。

### 1.1 明确最小样本任务的快速路径

当用户已经给出具体 handover、最小真实 `.gia`、明确比较方法和单一验收目标时，先写一张内部任务卡，再直接执行；不要预先通读完整治理/API/布局文档或做广泛代码库探索。

任务卡模板：

```text
目标：一句话描述唯一待修行为
历史入口：handover 中需要读取的具体章节
真实样本：绝对路径
比较字段：genericId / concreteId / pin kind+index / type / concrete wrapper / connects
同构测试：测试脚本和生成 JSON 路径
修改候选：最可能涉及的源码文件/函数
针对性验收：测试命令
扩大验证条件：只有共享行为受影响时才增加的回归
游戏操作：是否需要复制、注入或删除；需要时先确认
```

执行顺序固定为：

1. 只读 handover 的状态、失败链路和下一步目标，以及本文的路径/命令速查。
2. 解码真实最小 GIA，分别识别主图、复合 impl 等用户指定路线。
3. 快速写同构测试并生成当前 JSON。
4. 结构化比较后再读取差异对应的源码函数和现有针对性测试。
5. 修通用实现，补真实字段回归，生成目标 GIA；涉及注入、覆盖或删除时按规则向用户确认。

快速路径的停止条件：

- 已经找到真实样本和明确物理字段时，不再为“了解架构”继续加载长篇文档。
- 已经定位到具体编译函数时，不再启动重复的全仓库结构探索。
- handover、源码推测或辅助工具结论与真实 GIA 冲突时，真实 GIA 优先；推测不能直接进入实现。
- 出现 API 设计、结构歧义、多个根因、共享行为大范围影响或游戏状态取舍时，退出快速路径，回到 `docs/documentation-map.md` 的完整路由并向用户确认。

针对局部变量、generic node 等类型族问题，单个真实类型可以证明物理编码规则，但不能自动声称全部类型已经游戏验证。实现应尽量走通用类型映射；报告中分别写清“通用实现覆盖”“自动矩阵覆盖”“真实 GIA/游戏覆盖”。

---

## 二、路径速查

1. 游戏导入根目录（复制 `.gia` 到这里）：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export
```

2. 不要把测试 `.gia` 复制到 `Beyond_Local_Export/布局/` 子目录；该目录通常由用户管理截图和参考文件。
3. 用户截图常见目录：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局
```

4. 真实布局参考文件常见目录：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/布局
```

5. 旧的 `user_edit` 参考文件目录：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/user_edit
```

6. 常用当前测试输出目录：

```text
dist/tests
```

7. 当前布局权威设计文档：

```text
docs/composite-ir/layout-patterns.md
```

8. 当前低层控制流 DSL 文档：

```text
docs/architecture/composite/raw-control-flow-dsl-quickstart.md
```

9. 当前复合节点 API 文档：

```text
docs/architecture/composite/dsl-api.md
```

10. 已通过布局测试归档目录：

```text
tests/layout
```

11. 游戏内验证通过的 `.gia` 归档目录：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export/真-测试通过/布局
```


---

## 三、常用命令模板

### 3.1 构建

```bash
npm run build
```

说明：只有改了编译器、运行时、布局算法或需要刷新 `dist/` 中编译产物时才运行。若本步只新增/修改 `tests/*.ts` 测试脚本，跳过构建，直接执行 3.2 生成该测试的 GIA。

### 3.2 生成单个测试 GIA

```bash
node bin/gsts.mjs tests/<test-file>.ts || true
```

说明：WSL 下 `.gia` 生成后可能仍因注入阶段找不到 `Beyond_Local_Save_Level` 报错；只要 `dist/tests/*.gia` 已产出即可复制给用户测试。

### 3.3 复制到游戏导入根目录

```bash
export_dir='/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export'
rm -f "$export_dir/<export-name>.gia"
cp dist/tests/<test-output>.gia "$export_dir/<export-name>.gia"
```

### 3.4 清理游戏导入根目录旧 GIA

当根目录积累了多轮测试 `.gia`、影响用户在游戏里选择当前文件时，只清理根目录旧 `.gia`，保留当前待验证文件；不要动归档子目录和截图/参考目录。

```bash
export_dir='/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export'
find "$export_dir" -maxdepth 1 -type f -name '*.gia' ! -name '*round15-lane-avoidance.gia' -print -delete
find "$export_dir" -maxdepth 1 -type f -name '*.gia' -printf '%f\n' | sort
```

如果当前轮次或 step 名称不同，把 `*round15-lane-avoidance.gia` 换成当轮唯一匹配模式；执行后在 handover 中记录删除范围和剩余文件列表。

### 3.5 移动已通过 GIA 到归档目录

用户游戏内验证通过后，把根目录中的通过文件移动到归档目录；不要复制，避免游戏导入根目录堆积过多 `.gia`。

```bash
export_dir='/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/Beyond_Local_Export'
archive_dir="$export_dir/真-测试通过/布局"
mkdir -p "$archive_dir"
mv -f "$export_dir/<export-name>.gia" "$archive_dir/<export-name>.gia"
```

### 3.6 解码 GIA

```bash
npx tsx tools/decode-gia.ts dist/tests/<file>.gia > /tmp/<name>.decoded.json
```

### 3.7 查看节点概要

```bash
npx tsx tests/composite/dump-nodes.ts dist/tests/<file>.gia
```

### 3.8 查看执行流

```bash
npx tsx tests/composite/trace-exec-flow.ts dist/tests/<file>.gia --io
```

### 3.9 查看数据流

```bash
npx tsx tests/composite/trace-dataflow.ts dist/tests/<file>.gia --list-nodes
```

### 3.10 查看某节点全部参数数据流

```bash
npx tsx tests/composite/trace-dataflow.ts dist/tests/<file>.gia <node-id> --all-params
```

### 3.11 快速检查 Stage 2 IR

```bash
node - <<'NODE'
const fs = require('fs')
const doc = JSON.parse(fs.readFileSync('dist/tests/<file>.json', 'utf8'))[0]
for (const n of doc.nodes ?? []) {
  console.log(n.id, n.type, 'next', JSON.stringify(n.next), 'args', n.args?.map(a =>
    a?.type === 'conn' ? `conn:${a.value.node_id}:${a.value.index}:${a.value.type}` : a?.type + ':' + a?.value
  ))
}
NODE
```

### 3.12 提交前检查

```bash
git status --short
git diff --check
npm run build
```

### 3.13 注入物理运动复刻 GIA

配置直接生成时，`.gia` 自带 graph id 可能不是存档中的目标 NodeGraph；物理运动复刻应先生成，再用显式文件参数注入，使配置中的 `inject.nodeGraphId` 生效：

```bash
GSTS_LOCALLOW_DIR=/mnt/c/Users/touyu/AppData/LocalLow \
node bin/gsts.mjs -c gsts.physics-motion.config.ts dist/tests/layout/physics-motion/main.gia
```

已验证目标：

```text
/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741845.gil
```

不要只执行带配置、不带显式 `.gia` 参数的注入路径；该路径可能按生成文件的 graph id（例如 `1073741904`）查找并报 `target NodeGraph not found`。生成/注入过程触发的资源代码提取应按核心规则第 20 条保留。

---

## 四、命名与导出约定

1. 测试文件优先放在 `tests/`，命名形如 `layout-r6-c-...ts`、`layout-r6-d-...ts`。
2. 游戏内图名建议包含轮次、场景和 step，例如 `R6-D复合摘要-step2-unified-impl-layout`。
3. 导出文件名建议包含场景和 step，例如 `布局r6-d-composite-summary-step2.gia`。
4. 同一个测试连续迭代时，每一步递增 step；不要覆盖旧 step 的语义但使用新内容。
5. 如果用户明确要求覆盖同一个文件，可以覆盖，但仍要说明这次覆盖了哪个文件。
6. 多场景测试文件如果生成多个 graph，图名必须能在游戏里清楚区分。
7. 复合名也应带语义，例如 `R6-D复杂流程摘要节点`，方便用户打开复合窗口辨认。
8. 主图 `_GSTS_` 前缀是编译器生成语义，测试命名时只控制 `g.server({ name })` 内部名称即可。

---

## 五、游戏内验证交互

1. 给用户测试前，明确写出复制后的完整 `.gia` 路径。
2. 给用户测试前，简要说明本 step 只改了哪一个点。
3. 用户反馈“通过”后，先提交代码，再继续下一个调节点。
4. 用户反馈问题截图时，先读取截图，不要只根据文字猜。
5. 复述截图问题时尽量描述位置关系，例如“上方分支的第二个数据块压到下方 print 分支”。
6. 如果截图问题可能来自多个因素，先列出可能原因，再选择最小的第一个修复点。
7. 自动工具输出可以报告给用户，但不要用它覆盖用户游戏内视觉判断。
8. 导出后如果用户说没看到变化，优先检查图内 name 是否更新、复制路径是否是根目录、旧文件是否被删除。
9. 如果用户说某一步测试通过但还要做回归测试，先生成回归 `.gia`，等回归也通过再提交。
10. 若用户要求“场景 X 标记通过”，应更新相关 handover / layout-patterns，并记录通过的文件名与 step。

---

## 六、布局任务常用判断规则

1. 先确认测试结构是否复刻了用户关心的截图/参考文件，再判断布局参数。
2. 主图和复合 impl 都可能足够复杂，长期方向是共享同一套布局逻辑。
3. 数据节点不是 orphan；没有 exec 边不代表布局错误。
4. 数据流应贴近服务的消费者，但不应抢走上游复合/执行节点自己的输入数据区。
5. 当下游消费者的数据输入来自上游 exec/composite 输出时，不应递归穿透上游 exec/composite 去重排它的输入数据。
6. 复杂数据流可用纯数据复合节点降低主图负担，但复合节点本身需要按 pin 数估算视觉占位。
7. 复合有 exec 控制流且主图需要继续执行时，应声明 `outflows` 并在 build 中用 `f.outflow(...)` 标记出口。
8. 边界 pin 标记很多不一定是重复节点；先区分“边界 pin 多”和“内部节点坐标重叠”。
9. 场景 C 参数已经通过游戏测试，不要为修场景 D 轻易回退场景 C 参数。
10. 如果统一布局后复合 impl 变宽/变散，先让用户判断可读性，再考虑 scale 或 boundary mode。

---

## 七、handover 编写规则

1. 每个 handover 应引用本文件，而不是重复写完整工作规则。
2. handover 只记录本轮特有事实：目标、测试文件、反馈、提交、未解决问题、下一步计划。
3. 可复用的路径、复制命令、小步规则、用户交互约定写回本文件。
4. 已验证的结论要写清楚“用户游戏内测试通过”还是“自动工具验证通过”。
5. 未验证的实现方向应标为“待验证”，不要写成当前结论。
6. 历史失败路径可以保留，但要标注为什么失败，避免后续重复踩坑。
7. 新增测试文件或导出文件时，handover 要记录文件名、图名、导出路径。
8. 最近提交列表只保留和当前轮次强相关的提交，不必复制整个 git log。
