---
name: static-gil-model-builder
description: 在 Genshin-TS 中规划、校准、拼装、生成候选并安全写回复杂静态 GIL 模型，并把经过真实地图/编辑器/游戏验证的路径沉淀为可复制经验。用户提到“制作复杂元件/实体”“用基础元件拼模型”“空模型加装饰物”“足球/魔方/字母/建筑模型”“校准三棱柱或五棱柱朝向”“调整既有复杂元件的装饰物尺寸”“assets:static-assemblies”“assets:entities”或要把静态模型写进指定地图时都必须使用本 Skill，即使用户没有说“Skill”。不用于只读节点图逻辑分析、运行时 createPrefab 玩法逻辑或纯 GIA NodeGraph 注入。
compatibility: Genshin-TS repository with node, tsx, python tools/pkc.py, assets:static-assemblies, assets:entities, and a user-verifiable GIL map.
---

# 复杂静态 GIL 模型制作

把复杂模型拆成已知基础几何，先闭合资源局部坐标，再通过正式静态资产 CLI 生成可追溯候选，最后由用户在编辑器/游戏中确认视觉结果。新建复杂 prefab 闭包和已有复杂 prefab/entity 的局部视觉 patch 是两条不同路径，必须先分流；目标是让后续模型复用经过证据验证的生产路径，而不是复制一次性脚本或猜 GIL 字段。

## 任务边界

本 Skill 负责：

- 自定义元件：root 4 definition + root 8 instance + root 27 双侧装饰物闭包；
- 场景实体：root 5 entity + root 6 登记 + 必要的实例侧装饰物；
- 基础元件尺寸、零旋转朝向和局部轴校准；
- 复杂模型的几何拆分、局部 Transform、ID 计划、候选和安全写回；
- 对已有复杂 prefab/entity 的局部视觉调参：盘点完整 closure 后，对 definition-side、prefab-instance-side、scene-entity-side aux 做记录级最小 patch，并同步回读；
- 用户截图/游戏反馈后的有界结论与知识回填。

**复杂静态模型（魔方、足球、建筑等）必须实现为单个自定义元件：空模型模板 + 装饰物闭包（root 4/8/27）。禁止拆成大量 root 5 场景实体平铺**——实体集在游戏内难整体操控（移动/缩放要改全部实体）。只有用户明确要求“多个独立场景对象”时才走 root 5 实体路径，并先说明取舍。

以下任务转给其它 Skill：

- 读现有节点图逻辑：`gil-node-graph-reading`；
- 未知 GIL 编码的真实相邻快照调查：`editor-incremental-gia-investigator`；
- 已锁定 NodeGraph/GIA 的游戏注入核验：`verify-injection`；
- 运行时创建、物理、碰撞和节点图玩法：按对应引擎/编译器路径处理，不混入静态视觉模型。

## 授权边界优先

调用任何工具前，先提取用户给出的**本轮操作上限**。业务 intent `map-writeback` 只表示知识路由，不等于已经授权访问地图、生成候选或写回。

- 用户说“只给计划”“不要读取真实地图”“不要运行 maps”时，进入 `plan-only` 短路：只读根规则、本 Skill 的相关参考和一次只读 PKC 查询；不运行 `maps`、资产 inspect/export、源码测试，不扫描 `$GTS_EVIDENCE_HOME`，也不创建任何文件。答案使用 `<mapId>/<sourceSha>/<newId>` 占位符，并把现场盘点列为后续步骤。
- 用户只禁止写回但允许候选时，可读取地图并生成离线候选；停在 `候选就绪`。
- 用户明确授权写回前，仍须先展示已锁定候选的完整安全门；早先的宽泛“可以做”不替代该确认。若用户在当前轮明确说“直接注入/直接写回”，可把这句话作为本轮确认，但仍要记录源 SHA、候选 SHA、修改范围和自动备份；
- **任务内新地图写回例外**：用户任务明确要求“放在一张新地图里/新建地图做模型”时，本轮 `maps:create` 创建的新地图是任务内产物，写回它属于任务执行的一部分，不需要再等一次确认（见「写回安全门」）；这只适用于本轮自己创建、确认空闲的新地图，不适用于任何用户既有地图；
- 不自动恢复历史候选、manifest 或证据目录。只有用户明确说“继续/恢复某一轮”或给出对应路径/对象时才读取；同类历史模型不能冒充当前目标；
- 更严格的新约束始终优先。用户在工作中途改成只读时，立即停止后续地图/文件操作。

`plan-only` 的目标是给出可执行顺序和缺失输入，不是提前证明当前地图、ID、候选或源码状态。没有实际候选文件、SHA 和最小回读时，状态只能写 `计划就绪`，不能写 `候选就绪`。

## 启动路由

先判断目标对象，再选命令：

| 情况 | 路径 | 关键约束 |
| --- | --- | --- |
| 新建复杂静态 prefab/元件 | `assets:static-assemblies` | 创建 root 4/8/27 闭包，走 plan → candidate → inspect/export → 写回门 |
| 已有复杂 prefab/entity，只改位置、颜色或装饰物 Transform | `assets:entities patch` 或记录级 patch | 不创建新闭包；按实际 closure/export 找记录，同步三侧 aux |
| 已有 definition，新建一个场景实体 | `assets:entities import` | 只复用已有 definition；确认 root 5/root 6 登记 |
| 未知资源尺寸、pivot 或局部基 | 最小校准 + 增量调查 | 先闭合缺失事实，不用待修生产链证明未知规则 |

`assets:static-assemblies` 的成功只证明“新闭包创建”路径；它不是更新既有复杂模型的通用入口。已有模型的局部调参必须保留未改字段，并验证 definition-side、prefab-instance-side、scene-entity-side 三组 aux 仍一致。

1. 读取根 `AGENTS.md`，运行 `git status --short --branch`，保护已有改动；若命中 `plan-only`，`git status` 也可省略，因为本轮不会修改工作树。
2. 选择唯一 Context `static-gil-assembly-production`，创建、分配 ID、候选或写回统一使用精确 intent：

```bash
python tools/pkc.py progressive-query \
  --context static-gil-assembly-production \
  --intent map-writeback \
  --max-level 2 --limit 3 --check-authority
```

3. 只读取查询返回的 `minimum_files`。不要同时预加载整套传统文档。
4. 制作候选前读取 [生产工作流](references/production-workflow.md)。涉及新几何或未知资源朝向时，再读 [校准与几何](references/calibration-and-geometry.md)。
5. 只有 Authority/正式工具没有目标编码时，才切换到增量调查；已知空模型、官方基础资源、Transform 和装饰物闭包不要让用户重复编辑器造样本。

## 先确定交付对象

| 用户真正需要的对象 | 默认入口 | 结果 |
| --- | --- | --- |
| 可复用自定义元件，并在场景放一个实例 | `assets:static-assemblies` | root 4/8/27 + root 6 分类登记 |
| 从目标已有 definition 新建 root 5，或更新既有实体 | `assets:entities import/patch` | root 5 + root 6 实体登记 |
| 全新复杂 root 5，且目标没有所需 definition/aux 闭包 | 默认先做静态元件；强制 root 5 时检查 coverage | 不把 donor import 冒充完整闭包迁移 |
| 一组静态视觉零件，整体移动 | 空模型宿主 + 装饰物 | 一个主对象管理局部 Transform |
| 可踢、可碰撞、会运动的足球 | 先完成视觉模型；物理核心另立工作包 | 不把静态模型成功冒充玩法成功 |

用户没有明确要求可复用元件或运行时实体时，复杂静态模型默认做成“空模型自定义元件 + 一个场景实例”。这条路径保留一个清晰原点，也便于后续导出和继续调参。

`assets:entities import` 能从已有 definition 生成实体快照，`patch` 能改既有实体或挂接**已存在**的 aux；它们不会凭 donor 自动把全新的 root 4/root 27 复杂闭包移植进目标。若用户要求全新复杂 root 5，而目标没有可复用 definition/aux，先按生产参考确认当前正式工具是否已覆盖；没有就报告 coverage gap，不用一次性脚本假装正式生产路径。

## 总流程

```text
目标与输出语义
→ 只读地图/ID 盘点
→ 基础资源是否已知？
   ├─ 已知：直接设计模型
   └─ 未知：最小校准元件 → 候选 → 写回 → 用户截图
→ 几何拆分与 Transform 计划
→ 新建模型走正式 CLI plan；既有模型走 closure/export 盘点
→ 不覆盖候选
→ 最小闭包/回读
→ 展示安全门（任务内新地图：展示完直接写回；既有地图：等明确确认）
→ hash-gated 原子写回 + 备份（新地图任务还需补场景实例 import）
→ 写后回读
→ 用户重新加载并截图/游戏核验
→ 视觉反馈分类；若规则未知则转增量调查
→ 权威知识回填
```

每次开始时说明本轮最多推进到哪个门：`计划就绪`、`候选就绪`、`写回成功`或`用户视觉核验`。四个状态不能混称“完成”；`候选就绪` 至少要求真实 candidate 文件、SHA 和闭包回读。

## 未知基础元件先校准

只要缺少以下任一事实，就不要直接生成完整复杂模型：

- 原始尺寸、局部原点/几何锚点或缩放轴语义；
- `rotation=[0,0,0]` 时的朝向；
- 哪个局部轴是高度/挤出轴；
- 绕 X/Y/Z 正角度后的可见方向；
- 材质、颜色或几何资源是否在目标地图正常显示。

校准 demo 要小而可判读：

1. 用空模型作不可见主体；
2. 放一个已知 `1×1×1` 长方体作尺寸/坐标参照；
3. 每种未知资源至少放零旋转样本；
4. 需要闭合旋转时，再放 Y 轴水平旋转和 X 轴侧翻样本；
5. 用整齐网格位置隔开，向用户明确每行/列含义；
6. 不混入物理、碰撞、节点图、颜色实验或完整模型。

用户截图后，只记录截图能证明的事实。透视图可确认可见朝向、相对尺度、明显脱离和旋转结果；精确 Transform 数值来自候选回读和用户给出的地格/标尺，不从像素距离猜。

已闭合资源与本轮三棱柱/五棱柱基准见 [校准与几何](references/calibration-and-geometry.md)。

## 设计复杂模型

### 两层坐标

- 元件 `position/rotation/scale`：整个模型在场景中的 Transform；
- item `position/rotation/scale`：装饰物相对模型原点的局部 Transform。

先锁定模型原点、外形尺寸和朝向，再计算所有 item；不要把场景坐标直接写进局部坐标。已知 `1×1×1` 只证明尺寸，不自动证明资源 pivot。pivot 未被 Authority/真实校准闭合时，计划只能给目标几何中心符号和公式 `t = c - R·(S⊙g)`（`g` 为资源几何中心相对 pivot 的局部向量），禁止出现任何数值 `item.position` 或可复制的 items 配置，即使旁边标了“假设/待确认”。

### 几何拆分

按最少且最贴合目标面的基础元件拆分：

1. 优先一个基础元件精确表达一个面或体；
2. 没有六棱柱时，用六个正三角形组成正六边形；
3. 只在视觉需要时添加边线、遮缝或内核；
4. 先算零件预算；模型可用更少零件表达时，不继续用矩形条带逼近；
5. 先生成一个面或一个局部小样，确认后再扩展到完整模型。

资源局部基必须先乘进目标面基。只把法线对齐而忽略面内 roll，会产生“方向对了但花纹转错”的模型。旋转使用当前已闭合的 YXZ 内旋规则；具体公式和足球示例见几何参考。

`10009005` 五棱柱的 X/Z scale 语义是底面**外接圆直径 1**（外接半径 0.5 @ scale=1，2026-08-09 用户实测），目标外接半径 r 对应 `scale.x/z = 2r`；正五边形的可见面高（顶点到对边距离）不是 scale 真值。由多面体几何推导出的面高、外接直径或为遮缝而放大的值，都只能标为该轮视觉补偿实验，不能升级为资源尺寸真值。足球首次完整成功路径及 `0.3105` 的残余微缝见 [足球成功路径](references/football-success-path.md)。

### ID 计划

- 不猜 ID，也不把“连续”当规则；
- **自定义元件 def/inst/entity ID 必须 ≥ 1077936129（0x40400001）**：游戏/编辑器只认 0x40400000 区间的元件 ID，0x4000xxxx 区间的元件加载时被整体丢弃 → 地图打开为空（2026-08-09 R4 八张图空图根因，1874 已验证闭合；aux ID 无此限制，可用 0x4000xxxx）；
- 联合静态元件 inspect、实体 export 和 root 6 登记看占用；
- root 4 definition 与 root 8 instance 可同 ID，但 root 5 实体 ID 必须避免与 definition/instance/entity 冲突；
- definition-side 与 instance-side aux 各提供一组与 item 等长的显式 ID；
- 计划显示 `conflicts=[]` 只是当前工具检查通过，不能替代候选闭包回读。

复杂模型优先把 items 放进严格 `structureFile`，地图名称、模板、ID 和场景 Transform 留在配置中。这样调几何时不会反复改地图绑定信息。

### 生产级质量标准（2026-08-09 第四轮用户核验反馈）

复杂模型交付前必须按“远观整体轮廓、近看细节层次”两个观感自查，不能只满足“几何拼出来了”：

- **魔方（整体版）**：外表面必须表现 9 小块 + 缝隙细节——每面 9 个彩色贴片各自留缝（如面宽 1/3 再加窄缝），贴片不能覆盖整面拼成一个大色块；用户核验不合格样例：27 体块 + 1.9×1.9 全覆盖贴片 → 远看是“一个大块每个块不同颜色”，不像真魔方。
- **魔方（分块版）**：彩面薄片必须紧贴体块表面（表面 + 半厚 + 小间隙），远看整体、近看有缝；不能出现“中间黑色方块、四周窄彩边”的剖析感。分块版最终目标是给节点图旋转逻辑用的可玩魔方，块面必须生产级贴合。
- **魔方（曲面增强，R6.2 用户方案，可选）**：基础及格后，可在相邻大面之间的棱边加小圆弧过渡营造曲面感——用官方圆柱（resID 10009008）微缩放成细圆弧条（深灰/黑色，与块缝同色系）放置在棱边位置；保留现有及格要素（块 0.93/缝 0.07/贴片 0.91 占满面/六面色），圆弧不能遮挡贴片或填死块间缝。
- **字母/立体文字**：按 [字母专业建模指南](references/letter-font-guide.md) 执行——**核心是曲线流线感（R6.2 用户要求）：轮廓必须有一眼可辨的曲线/笔势，禁止“板砖拼长方体”观感**；网格 ≥15×17、笔画统一 3 格厚（横杠 2 格）、块数 A≈105/G≈140（≥30 块只是下限）、2 深度层、同高同基线；斜边/弧线每 2~3 行横移 1 列且相邻行重叠 ≥2 格（防点接）；G 必须先画开口 C 再加内横画（右上留 ≥3×3 开口，禁止封闭方框）；A 顶部 3 格中心帽、横杠在 50~58% 高度；字模第 0 行=视觉顶部（y 最大，防倒置）。用户核验不合格样例：A 仅 22-23/34 块无细节、G 右侧封闭不可辨（R6/R6.1）。曲面外壳（鼠标等流线型）用切向长条法拟合，见指南。
- **足球**：已验收路径（football-success-path.md §2A）为标准，凸面/缝线/变体按参数化出候选。

## 候选验证预算

新建闭包只做能阻止坏写回的检查：

1. `plan.status=ready`，源 SHA 与盘点一致；
2. 候选输出不覆盖旧文件，并记录 SHA/大小；
3. `inspect` 找到新 definition/instance，闭包 `complete`，aux 数量正确；
4. `export` 回读资源、两层 Transform 和 item 顺序；
5. 必要时 root raw diff 只出现计划字段；
6. 当前地图仍保持源 SHA。

既有模型 patch 还必须增加：

- patch 前保存 closure/export 摘要和源 SHA；
- 目标 aux 按资源、owner 和实际挂接关系分类，不按历史连续 ID 猜测；
- definition-side、prefab-instance-side、scene-entity-side 的目标记录数量和资源分布一致；
- position、rotation、Y 厚度、颜色及未知字段保持不变，只改变声明的字段；
- patch 后候选与源的变化记录可解释，三侧目标字段逐条回读一致。

满足这些条件就停止自动验证，让用户去游戏看。不要为了“更放心”无限叠加同源解析脚本。

`inspect-gil-prefab-material.py` 要求目标 ID 在 before/after 都存在，适合既有元件材质修改，不适合新增元件。新增元件用 `inspect + export + root diff`。

## 写回安全门

真实写回前展示：

- 地图 ID、名字、玩家/区服和实际路径；
- 当前源 SHA；
- 候选路径、SHA、大小；
- 新 prefab/entity/aux ID；
- 场景 Transform、item 摘要和触及 roots；
- 精确命令、自动备份位置和回滚方式。

**任务内新地图直接写回**：任务明确要求“放在一张新地图里”时，安全门展示完即可执行 hash-gated 写回并回读，不用停下来等确认——创建新地图并放置模型正是用户本轮要求做的事，任务指令就是授权。写回后仍如实报告状态，不得把 `写回成功` 冒充 `用户视觉核验`。任务还要求“做成一个元件放在地图里”时，元件闭包写回后继续用 `assets:entities import` 生成并写回场景实例（两步都是任务内动作），全部就位后才报告 `写回成功`。

**其余情况（用户既有地图、共享地图、非本轮创建的地图）**：必须展示安全门并得到针对这份候选的明确确认后，再优先用固定候选的 hash-gated 原子入口：

```bash
node ./bin/gsts.mjs assets:entities apply-candidate \
  --map-id <mapId> \
  --candidate <candidate.gil> \
  --expect-source-hash <locked-source-sha256>
```

写后只做目标/候选哈希一致、备份/源哈希一致和目标闭包回读。随后通知用户**重新加载地图再保存**；旧编辑器内存保存会覆盖磁盘写回。

## 截图与游戏核验

用户给截图时切换为只读 intent：

```bash
python tools/pkc.py progressive-query \
  --context static-gil-assembly-production \
  --intent screenshot-validation \
  --max-level 2 --limit 3 --check-authority
```

读取图片尺寸与 SHA，对照候选的已知布局判断。不要在截图阶段读取真实地图或扩大写授权。

报告分层：

- 候选结构通过；
- 写回成功；
- 编辑器可见/布局视觉通过；
- 游戏行为通过或尚未验证。

静态截图不能证明碰撞、运动、多人同步或玩法逻辑。

## 证据与知识回填

把用户截图保存为不可变证据：

```bash
python .agents/skills/editor-incremental-gia-investigator/scripts/capture-evidence.py \
  <source-image> <evidence-directory>
```

更新适用范围最小的 `docs/game-engine-knowledge/` Authority，记录地图/对象、候选与截图 SHA、观察、适用版本和未证明事项。不要把一次性 ID、路径或待验证推测写进 `AGENTS.md`。

PKC 只从已提交 Authority 创建 knowledge-plan；工作树结论保持 pending。按项目规则展示精确 Bundle content hash，等待用户批准后再 apply。

## 已知陷阱

- `.local/tmp` 生成器和历史脚本是恢复线索，不是生产 Authority；优先正式 CLI。
- 已有复杂模型的局部调参不能只改 definition 或 instance 一侧；至少核对 definition-side、prefab-instance-side、scene-entity-side 三组 aux。
- `0.3105` 这类绝对尺寸/系数若来自视觉补偿，只能作为该轮实验参数，不能替代 `10009005` 的外接圆直径 1 几何基准（真实语义：scale=2×目标外接半径）。
- `compatibility=unknown` 表示还没做编辑器/游戏验证，不等于候选结构失败。
- 当前官方模板路径的逐 item 颜色需要以候选 `export` 为准；配置写了颜色但回读未启用时，不要承诺颜色或只改单侧 aux。
- `inspect` 用于身份/闭包，复杂 Transform 以 `export` 回读为准。
- 编辑器保存会规范化默认字段；候选验证比较目标闭包，不要求用户保存后整文件哈希不变。
- 新地图用 `maps:create` 创建后**可直接** `assets:static-assemblies`（2026-08-09 起骨架预置空 root 4/8/27 段）。若目标地图缺 4/8/27 段（旧骨架地图），static-assemblies 报 `unsupported GIL layout`：不要用 `assets:entities import` 平铺实体绕行，改用新预置地图或在成熟地图上创建。
- **元件 ID 区间**（2026-08-09 R4 空图根因，1874 验证闭合）：自定义元件 def/inst/entity ID 必须是 0x40400000 区间（≥1077936129），0x4000xxxx 区间的元件被游戏/编辑器整体丢弃，地图打开为空（元件库、场景全部无内容；编辑器保存后 CLI 写入的元件消失）。正常样本：1870/1849/1862/1874/1875 全部 1077936xxx；空样本：R4 八张图、1871/1872/1873 全部 1073742xxx。aux ID 无此限制（1870 的 aux 也是 1073742xxx 且正常）。CLI plan/import 已加 `prefab-id-out-of-range` 校验，asset-config 填错区间会报错提示。
- **颜色编码（已闭合）**：装饰物颜色在 aux 的 f5{f1:22}.f32 槽：f3=ARGB（32 位 varint）、f4=fixed32 float 透明度（100.0 不透明 / 54.9 半透明）、f5=RGB、f6=6700（overwrite）/6701（multiply）。CLI `colorFields` 与编辑器逐字节一致（1875 用户核验 6 色+半透明通过）；此前“颜色全黑根因未闭合”的真相是 structure.json items 缺 `color` 字段（配置未写 → 默认白 f3=-1），以及面片几何嵌入/共面（见下条）。配置颜色必须写 `{enabled: true, rgb: 0xRRGGBB, opacity: 0-100, overlay: 'overwrite'}`。
- **新资源类型/新厚度先做颜色小样**（2026-08-09 魔方 3x3 第二轮教训）：wire 编码与 export 回读一致不代表游戏/编辑器一定显示。正式模型前先放单资源颜色小样校准板（不同颜色 × 厚度 0.02/0.05）请用户确认，不要把未核验颜色的资源直接堆进完整模型。
- **贴片/面片必须凸出表面，禁止 0 间隙或向内偏移**（2026-08-09 魔方全黑根因）：面片中心 = 表面位置 + 半厚 + 小间隙（如 0.005~0.01）。魔方 3x3 第二轮生成器把 X- 侧 27 个面片中心放在表面内侧（内表面 -0.52 < 表面 -0.5，整体嵌入体块被吞），另 27 个内表面与体块表面完全共面（间隙 0，深度测试被遮挡）→ 54 个彩色面片全部不可见，只剩深灰蓝黑体块 = “全黑”。第一轮验收版偏移 0.52（半厚 0.0125 + 间隙 0.0075）可见。生成器写完必须逐面片断言：内表面 - 体块表面 ≥ 0.005。
- **10009001 长方体 scale=1 = 1×1×1（边长 1 米，半尺寸 0.5）**（2026-08-09 第六轮修正：官方预制资源统一 1 米设计语言，与棱柱“外接圆直径 1”一致；旧“2×2×2（半尺寸 1.0）”源自第三轮“隐藏体块后 0.52 彩面在中心附近”的一次观察误判，与第六轮两张游戏截图（块间大缝≈半块宽、贴片悬空≈半尺寸）矛盾，已废弃）。全黑根因分析（上条）自身用的就是表面 ±0.5，与 1 米语义自洽。**scale 就是边长（米）**：写 scale 时直接写目标边长，**禁止把“边长/2（半尺寸）”写进 scale**（R6 翻车根因：魔方/字母生成器把半尺寸 0.465/0.24 当 scale 写入，游戏实际渲染只有设计一半大，块间缝≈一块宽，用户编辑器实测 0.25/0.5 证实）；半尺寸 = 0.5×scale 只用于贴片偏移、接地等中间计算。**面片外贴 = 真实表面(±0.5×scale) + 半厚 + 间隙 0.005~0.01**；第一轮验收版偏移 0.52（= 0.5 + 0.0125 + 0.0075）即该语义下的正确值。生成器逐面片断言内表面 − 块表面 ≥ 0.005，浮点比较必须加容差（如 `≥ 0.005 - 1e-6`，否则 0.004999… 会误报）。生成器还必须断言 scale 等于目标边长（防止半尺寸混入）。做方块类模型仍先小样校准（尺寸参照 + 颜色×厚度）再堆完整模型。
- **编辑器可见性 = Temp 活动目录**（2026-08-09 实测）：编辑器地图列表只读 `BeyondLocal/<player>/Temp/Beyond_Local_Save_Player.gip`，.gil 双写 Temp 与 `Beyond_Local_Save_Level/`；CLI 已自动同步（`maps:create` 复制 .gil 到 Temp + 双写 gip，写回同步 Temp）。手工复制/注册只应在游戏关闭时做，否则编辑器内存版 gip 会覆盖磁盘注册；游戏运行中不要注册。
- **看不到地图的处理流程**：症状——`maps:create`/写回后编辑器列表看不到新地图（游戏开着时注册被内存版 gip 覆盖）。处理：①完全退出游戏；②运行 `gsts maps:resync --map-id <mapId>`（复制 .gil 到 Temp + 重新注册 gip，输出 `temp=` 路径确认）；③重开游戏查看。若仍看不到，检查 `maps` 列表确认地图存在、Temp gip 是否含该 ID（`maps:resync` 输出无 `temp=` 说明 Temp 目录缺失）。
- **ID 复用陷阱**：删除过的地图 ID 被 maps:create 复用后，编辑器仍看不到（列表来自 Temp gip 不是目录扫描），且编辑器新建地图取 Temp gip max+1 可能覆盖未注册的同 ID .gil——所以新地图创建后必须确认 `temp-sync` 日志出现。
- **生成器自检纪律**（R6.1 trace 11 次失败全在自检迭代）：断言数字必须从参数表（EDGE/GAP/块数/颜色数）推导，禁止手写魔数；颜色数断言按实现实际颜色（魔方 7 色含深灰体，断言 ≥5）；一次跑完所有断言再报（勿 fail-fast 一次一个）；readback 断言按 scale 白名单排除参照块（1×1×1 尺寸参照、0.5 块等）；生成器先本地 python 自检再进 CLI。详见 [字母专业建模指南](references/letter-font-guide.md) 自检纪律节。
- 截图发现方向错误时，先修资源局部基或校准结论，不在每个面上散落补偿角。
- 用户反馈仍有缝时，保留成功候选和反馈证据，进入单变量精确数据调查，不把“整体满意”写成几何完全通过。

## 每轮报告

```text
对象：自定义元件 / 场景实体 / 校准 demo
目标：mapId / 名称 / 锁定源 SHA
结构：主体资源 / item 数 / 资源分布 / ID 范围
Transform：场景层 + 局部层摘要
证据：plan / candidate / closure / writeback / screenshot-game
状态：计划就绪 | 候选就绪 | 写回成功 | 用户视觉核验通过
限制：颜色、物理、碰撞、跨地图或其它未验证层
下一步：只写一个动作
```

## 按需参考

- [校准与几何](references/calibration-and-geometry.md)：基础资源局部基、校准布局、复杂几何与足球拆分。
- [生产工作流](references/production-workflow.md)：正式 CLI 命令、配置骨架、候选/写回/回读和当前限制。
- [足球成功路径](references/football-success-path.md)：首次完整足球闭包、三侧局部 patch、视觉补偿和未闭合项。
- [评测任务模板](references/eval-task-template.md)：evaluate.py 独立会话的任务描述骨架（命令速查 + 闭合事实 + ID 计划 + 速度提示）。
