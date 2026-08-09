# 静态 GIL 模型评测任务模板（R6+）

给 `evaluate.py` 独立会话的任务描述骨架。目的：把 R1-R5 已闭合事实与命令签名**直接内嵌进任务描述**，减少模型探索文档、反复 --help、生成器断言迭代（R5 trace 实测可省：环境盘点 5-10 调用、grep 文档 2-4 调用、断言迭代 3-6 调用）。

## 运行命令

```bash
python /home/h/portable-knowledge/skills/isolated-model-evaluator/scripts/evaluate.py \
  --task-file <task.md> \
  --root /home/h/genshin-ts \
  --skill /home/h/genshin-ts/.agents/skills/static-gil-model-builder/SKILL.md \
  --provider deepseek --model deepseek-v4-flash --thinking max \
  --tools read,bash,write \
  --output-dir /tmp/gil-eval-<name><轮次> \
  --allow-tool-errors --timeout 1500
```

多模型一次跑（R6 起）：一个任务描述放 2-3 个模型（如字母 A + G + 魔方），一次会话共享环境盘点；模型数多时 timeout 提到 2400。

## 任务描述必含（内嵌，勿让模型去查文档/源码）

### 命令速查（勿 grep 源码、勿反复 --help；--format json 管道一律 `2>/dev/null`，禁 2>&1）

- 建图：`node ./bin/gsts.mjs maps:create --name "<名>"` → 输出 mapId + `temp=` 确认
- 候选：`node ./bin/gsts.mjs assets:static-assemblies --asset-config <cfg>.mjs --map-id <id> --output <cand>.gil --format json 2>/dev/null`（writePerformed=false）
- 回读：`assets:static-assemblies inspect --gil <cand>.gil --format json`（definitions/instances/packedIds）；`export --gil <cand>.gil --format json`（assemblies[].items 的 position/scale/color）
- 写回（任务内新地图）：`assets:static-assemblies --asset-config <cfg>.mjs --map-id <id> --write --format json 2>/dev/null`（输出 sourceSha256/candidateSha256/backupPath）
- 实体两步：`assets:entities import --map-id <id> --entities <e>.json --expect-source-hash <sha> --output <cand>.gil --format json 2>/dev/null`（stdout 为 JSON：sourceSha256/candidateSha256/candidate；text 日志走 stderr）→ `assets:entities apply-candidate --map-id <id> --candidate <cand>.gil --expect-source-hash <sha> --format json 2>/dev/null`（输出 backup + writePerformed）
- 写后确认：`sha256sum` 目标 `Beyond_Local_Save_Level/<id>.gil` 与 `Temp/<id>.gil` 一致
- 只操作本轮 maps:create 的新地图；evidence 用本轮新建子目录。**禁止 ls/cat/find 任何旧 evidence 或旧评测输出（`~/genshin-ts-evidence/`、`/tmp/gil-eval-*`）**：旧生成器含废弃尺寸语义（如半尺寸当 scale）会误导，所有公式以本任务内嵌为准，旧目录不存在直接忽略

### 闭合事实（勿再校准）

- **10009001 长方体 scale=1 = 1×1×1（边长 1 米，半尺寸 0.5）；scale 就是边长（米）**。写 scale 时**直接写目标边长**，禁止把“边长/2（半尺寸）”写进 scale（R6 翻车根因：生成器把半尺寸 0.465/0.24 当 scale 写入，游戏实际渲染只有设计一半大，块间缝≈一块宽）。半尺寸 = 0.5×scale 只用于贴片偏移等中间计算
- 贴片中心 = 块中心 ± (块半尺寸 + 半厚 + 间隙 0.005~0.01)；逐面片断言内表面 − 块表面 ≥ 0.005，**浮点比较加容差**（`≥ 0.005 - 1e-6`）
- 连续性公式（生成器内断言）：相邻块中心距 vs 块边长 → 缝 = 距 − 边长（目标 0.02~0.1 均匀）；贴片边长 = 块边长 − 贴片间缝×2；**贴片间缝建议 0.02，与块间缝解耦**（R6 魔方视觉反馈：贴片间缝与块间缝对齐导致视觉缝双倍宽 0.14，像面板格栅；贴片应几乎占满块面才像真魔方）
- 生成器自检纪律：断言数字全部从参数表推导（禁手写魔数）；颜色数按实现实际（魔方 7 色含深灰体，断言 ≥5 而非 ==5/6）；一次跑完所有断言再报（勿 fail-fast 一次一个）；readback 断言按 scale 白名单排除参照块（1×1×1 尺寸参照、0.5 块等）；生成器先本地 python 自检再进 CLI，勿拿 CLI 当调试器
- **字母专业标准（R6.1 用户核验：A/G 太粗糙，魔方已及格）**：**核心是曲线流线感（R6.2 用户要求）——轮廓必须有一眼可辨的曲线/笔势，禁止“板砖拼长方体”观感**（参考：建模鼠标流线外壳 = 按细腻度离散拟合）。网格 ≥15×17、笔画统一 3 格厚（横杠 2 格）、块数 A≈105 / G≈140（≥30 只是下限）、2 深度层（D=2×边长+缝）、同高同基线；**G 必须先画开口 C 再加内横画（右上留 ≥3×3 开口，禁止封闭方框）；A 顶部 3 格中心帽、斜边/弧线每 2~3 行横移 1 列且相邻行重叠 ≥2 格（防点接）、横杠在顶往下 50~58% 高度、2 格厚**；字模位图第 0 行=视觉顶部（y 最大，防 R6 倒置事故）。参考位图、生成器骨架和自检纪律直接见 `references/letter-font-guide.md`，复用勿重写发明
- **魔方（曲面增强，R6.2 用户方案）**：保留及格要素（块 0.93/缝 0.07/贴片 0.91 占满面/六面色），在相邻大面之间的棱边加小圆弧过渡营造曲面感——用官方圆柱（resID 10009008）微缩放成细圆弧条（深灰/黑色）放在棱边；圆弧不能遮挡贴片或填死块间缝；圆柱资源 ID=10009008（禁猜）
- 颜色：`{enabled: true, rgb: 0xRRGGBB, opacity: 100, overlay: 'overwrite'}`；禁纯黑纯白（深灰/浅灰近似）；分色不能切碎笔画轮廓（红一条蓝一条像零件拼装）
- 元件 def/inst/entity ID ≥ 1077936129（0x40400000 段，建议 1077936190 起递增）；aux 用 1073742xxx（无限制）
- 已知 bug（production-workflow §7）：assets:entities import 后场景实体装饰物游戏内可能丢失；报告只能写"回读携带 aux"，不能写渲染正常
- CLI 契约：`inspect --format json` 的 `occupiedIds` 是 **dict**（键 definitionAuxiliaries/instanceAuxiliaries）不是 list；`templateCandidates[].definitionAuxiliaryIds` 才是 list

### ID 计划模板

- 魔方：def/inst 1077936190、实体 1077936191；def aux 1073742600+ / inst aux 1073742800+（与 items 等长）
- 字母 A：def/inst 1077936200、实体 1077936201；G：1077936210/6211；aux 段 1073742700+/1073742900+

### 流程与速度提示

- 一次会话多个模型：环境盘点（PKC 查询、地图列表、evidence 目录 ls）只做一次，各模型直接进入生成
- 小样（尺寸参照 + 颜色×厚度）先生成并回读自检；小样与完整模型可同批写回，但小样必须独立回读断言通过后才能继续完整模型
- 生成器一次写对：贴片公式、连续性断言、颜色格式全部按上表，写完直接跑断言，失败一次定位后修正（勿反复试错）
- 安全门展示完立即写回（任务内新地图）；报告分层：候选就绪 / 写回成功 / 用户视觉核验（未验证如实标注，勿混称完成）
- 完成前自检：export 回读确认实体与 def/inst 都存在、aux 数量正确、目标 SHA = 候选 SHA = Temp SHA
