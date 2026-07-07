# 布局任务工作规则与交互细节

> 状态：当前推荐
> 来源：历史 handover 提炼 + 用户交互约定
> 最近校验：2026-07-08
> 适用范围：Genshin-TS 布局调参、`.gia` 导出、用户游戏内验证、handover 编写

本文只记录能提高协作效率的**工作规则、路径、命令和交互约定**。不要在这里放具体算法解释、代码实现细节或某一轮的长篇问题分析；那些内容仍写在对应 handover 或设计文档里。

---

## 一、核心协作规则

1. 每轮布局调参保持“小步迭代 → 导出独立 GIA → 用户游戏内测试 → 通过后提交”。
2. 每次只改一个小点；不要在同一步同时改横向距离、纵向间距、数据节点行距和分支规则。
3. 用户说“测试通过 / OK / 可以”后再提交代码；未游戏内验证前不要提交布局参数改动。
4. 用户给截图时，先用 `read` 打开截图并复述问题，再选择一个小点修复。
5. 游戏内截图和用户反馈是最终裁判；自动分析工具只能辅助判断。
6. 如果遇到阻碍、不确定或方向性问题，先停下来和用户确认，不要连续深入改多个算法。
7. 通过的小步要单独提交，便于回溯每个游戏内验证点。
8. 提交前运行 `git diff --check`；代码改动通常还要运行 `npm run build`。
9. 生成测试文件时，图内 `g.server({ name })` 必须带清晰轮次/场景/step，方便游戏里辨认。
10. 导出文件名和图内 name 的 step 应保持同步，避免“文件 step9 但图内 step8”。
11. 覆盖游戏导入目录里的同名 `.gia` 前先 `rm -f` 删除旧文件。
12. 不要把 handover 当当前 API 教程；API 用法以 `docs/architecture/composite/` 当前文档为准。
13. 历史 handover 中的旧 API 名称只作为历史上下文，新示例优先使用当前推荐名称。
14. 调布局时不要把 `audit-layout.ts` 的 `ORPHAN` / `EDGE_CROSS` 直接当最终问题。
15. 不要用未复刻目标结构的抽象测试判断最终布局参数；尽量用接近用户截图/参考文件的测试。

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

10. 当前 handover 索引：

```text
docs/composite-ir/handover/README.md
```

---

## 三、常用命令模板

### 3.1 构建

```bash
npm run build
```

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

### 3.4 解码 GIA

```bash
npx tsx tools/decode-gia.ts dist/tests/<file>.gia > /tmp/<name>.decoded.json
```

### 3.5 查看节点概要

```bash
npx tsx tests/composite/dump-nodes.ts dist/tests/<file>.gia
```

### 3.6 查看执行流

```bash
npx tsx tests/composite/trace-exec-flow.ts dist/tests/<file>.gia --io
```

### 3.7 查看数据流

```bash
npx tsx tests/composite/trace-dataflow.ts dist/tests/<file>.gia --list-nodes
```

### 3.8 查看某节点全部参数数据流

```bash
npx tsx tests/composite/trace-dataflow.ts dist/tests/<file>.gia <node-id> --all-params
```

### 3.9 快速检查 Stage 2 IR

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

### 3.10 提交前检查

```bash
git status --short
git diff --check
npm run build
```

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
