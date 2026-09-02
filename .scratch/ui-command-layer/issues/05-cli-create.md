# 05 — CLI：Create（布局按钮 + 悬浮页按钮）

**What to build:** 一条命令让 AI/玩家从零造出「能用、可细排」的按钮：指定位置/文本/字号/颜色（图片素材引用可选）即可
在目标布局（或悬浮交互页）创建自定义按钮，默认四态素材骨架就位。产物必须与真实编辑器样本**字节级同步**（候选经差异
对比工具核验：与编辑器手动创建同结构样本逐字节一致或仅预期字段差异）；编辑器打开可见、可继续细排。写完在游戏内核验：
按钮显示、位置大致正确、点击有反馈、悬浮页按钮事件可用（用户按验收句式报告）。

**Blocked by:** 04（先有 List 共识层；并消费 01 创建链路与 04 悬浮页规则）

**Status:** ready-for-agent

- [x] Create 命令落地（布局按钮 + 悬浮页内按钮，含 ID 分配与引用注册）——**候选层落地（--output 只读）**；
      `--write` 未启用（需用户定目标/ID 后单独授权）
- [x] 候选 vs 编辑器样本字节级同步核验 PASS（root9 字段级重放对拍 12/12；root46 保存审计=预期差异，
      已登记；样例见 ui/verification/ticket05-create-candidates.md）
- [ ] 写回安全流程（备份/回读/防旧内存覆盖提醒）执行（blocked：目标地图/容器/ID 未定；全量 build 待 football 收口）
- [ ] 游戏内核验：出现/位置/点击/事件（用户确认）
- [ ] 收轮三件套（feat/docs 两枚 commit 本轮已完成；完整 task-retrospective 复盘另轮补）

## 轮次记录

### 首轮开发（只读候选；2026-09 会话续接）

已落地（代码层）：
- `ui/src/create.ts`：placement 校验（registry）+ `--on` 解析（layout/container/悬浮页:页:容器，
  t42 归属与 f503 宿主校验）+ ID 避让分配（空洞取最高空闲，mappings §8 例 2031；无空洞才尾部接续，
  禁 max+1 直推预测）+ donor 字节装配（自身 ID/父引用定宽字节重映射 → name/几何 patch → 宿主 f503 追加）
  + `--output` 候选（整文件字节，不写盘）。
- `ui/src/create-donors.ts`：donor 注册表；`ui/tests/extract-create-donors.ts` 从真实快照提取
  （轮4 布局按钮 1073742032=963B / 轮26 悬浮页按钮 1073742089=1156B）后覆写注册表。
- `ui/tests/create-candidates-assert.ts`：A donor 防漂移 / B 重放对拍 / C 分配器 / D 参数 patch 语义回读。
- `src/cli/gil_ui.ts`：导出定点编辑原语（setUiControlName/Transform/remapUiRecordVarints，单源）。
- `src/cli/assets_ui.ts`：create 新路由（custom-button + `--on`/`--id` 可选），其余类型维持旧契约。

动态门禁结果（2026-09-02 实跑，样例落 ui/verification/ticket05-create-candidates.md）：
- donor 提取 PASS（963/1156B 与知识权威一致）；create-candidates-assert **12/12 PASS**；
  exhaustive 80 快照 **127/127 PASS**；真 CLI list 80/80 FAIL=0；`git diff --check` OK；
  子集 tsc（src+ui/src）**EXIT 0**；create 冒烟（布局/容器双面）候选落盘 + 语义回读 CHECK PASS + 负例全拒。
- 全量 `npm run build` EXIT 2 = **唯一错误在 examples/football/src-fb/fb-phys.ts(121,35)**（交接书 §3
  无关 dirty 路径、football 票13 WIP，本票未触碰）——football 收口后重跑全量复核。
- 方法学修正（假设审计）：编辑器保存会**等长改写 root46 审计段**——对拍由整文件逐字节改为顶层字段级
  （root9 全等 + 其余等值 + root46 等长登记为预期差异），与「逐字节一致或仅预期字段差异」验收口径对齐。

open-items（本轮 fail-closed，未越界猜字节）：
- `--text/--color/--font-size/--content`：按钮状态素材骨架（type55 组+member/t50 块引用）无同参编辑器
  create 样本，需状态素材 donor（轮8/28 编辑样本）差分闭合后再启用；
- 容器面参数 patch（位置/尺寸）尚无字节级同参对拍样本（仅语义回读断言）；
- `--write` 在 create 新路径仅提示不执行（需用户定目标/ID 授权后单独启用；写回红线流程待跑）；
- 游戏行为（出现/位置/点击/事件）需用户游戏内验收（票 08 等价）。

### 执行配方（2026-09-02 已按此执行；保留供复查/复跑）

> 实际结果：donor 提取 ✅ / 断言 12/12 ✅ / 127/127 ✅ / CLI80 FAIL=0 ✅ / 子集 tsc EXIT 0 ✅ /
> 全量 npm run build 被 examples/football WIP（fb-phys.ts TS2551，无关 dirty 路径）阻塞 —— 见上方动态门禁结果。

```bash
cd /home/h/genshin-ts
git log --oneline -1                       # 期望含票04 7 提交于历史
git status --short -- ui/src ui/tests ui/verification src/cli/assets_ui.ts src/cli/gil_ui.ts \
  tsconfig.json .scratch/ui-command-layer/issues/05-cli-create.md   # 核对本次改动文件清单
npx tsx ui/tests/extract-create-donors.ts  # 期望 extracted 2 donors + wrote ui/src/create-donors.ts
npx tsx ui/tests/create-candidates-assert.ts   # 期望 PASS N create-candidate assertions
npx tsx ui/tests/exhaustive-snapshot-verify.ts 2>&1 | tail -2   # 期望 PASS 127 snapshot assertions over 80 files
npm run build                               # 期望 exit 0
git diff --check                            # 期望空
# 真 CLI 冒烟（只读；--output 到临时文件后 diff 回读）：
node bin/gsts.mjs assets:ui create --type custom-button --on layout:1073741825 \
  --output /tmp/ui05-cand.gil --gil ".gsts/diff-exp/ui学习/1073741909.after-重启66-默认页签2-7468eadd.gil"
node bin/gsts.mjs assets:ui list --flat --gil /tmp/ui05-cand.gil --format json >/dev/null  # exit 0
```
首检/断言失配即停即报（交接纪律）；通过后执行 git add 上述精确文件并 commit（三件套），再做复盘沉淀。
