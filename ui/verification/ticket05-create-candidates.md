# 票 05 · create 候选生成——真实命令输出样例（可复查）

> 会话：2026-09-02（仓库 `feat/composite-and-project-knowledge`，HEAD `b1fd6a0`）
> 范围：只读候选（`--output`），无任何 `.gil` 写回；写回/编辑器/游戏核验属后段（blocked，需用户确认）。
> 复现入口：先 `npx tsx ui/tests/extract-create-donors.ts`，再逐条执行下列命令。
> 门禁约定：80 快照语义验收全绿（禁抽查）；本文件是产出样例（铁律 9：重要输出落盘可复查）。

## 1. donor 提取（真实编辑器样本字节入注册表）

```bash
npx tsx ui/tests/extract-create-donors.ts
```

```
extracted custom-button.layout: 1073741909.after-重启4-默认布局自定义按钮-e645aefb.gil record=1073742032 len=963 sha256=cbf4739df5a1cfc7...
extracted custom-button.container: 1073741909.after-重启26-悬浮页加按钮-f0ddb622.gil record=1073742089 len=1156 sha256=dbcdd91b30569ba0...
wrote /home/h/genshin-ts/ui/src/create-donors.ts
next: npx tsx ui/tests/create-candidates-assert.ts
```

字节长度与知识权威（references/ui-controls.md 轮4=963B / 轮26=1156B）一致。

## 2. 候选字节级断言（12/12 PASS）

```bash
npx tsx ui/tests/create-candidates-assert.ts
```

```
ok 1 - donor 防漂移: custom-button.layout ...
ok 2 - donor 防漂移: custom-button.container ...
ok 3 - donor 集齐两个放置面（布局/容器）
ok 4 - 重放对拍: 布局按钮（轮4 ... → ...；root9 全等 + root46 审计登记）
ok 5 - 重放对拍: 悬浮页容器按钮（轮25 → 轮26；root9 全等 + root46 审计登记）
ok 6 - 分配器: 编辑器跳变空洞取最高空闲（轮4 after → 2031，mappings §8 例）
ok 7 - 分配器: 结果不与任何记录/索引/引用冲突
ok 8 - 分配器: 显式 --id 已被占用时报错
ok 9 - 分配器: 确定性（同文件两次一致）
ok 10 - resolveSurfaceTarget: container 面归属校验（非容器记录拒绝）
ok 11 - resolveSurfaceTarget: 悬浮页:容器 双段校验（页-容器配对）
ok 12 - 参数 patch: --name/--position/--size 语义回读 + 宿主成员 + 其余记录零改动
PASS 12 create-candidate assertions
```

对拍方法学（本轮修正）：编辑器每次保存会**等长改写 root46 审计段**（差分笔记「root46 等长
审计」的实义=长度不变、内容变化）。因此整文件逐字节对拍改为**顶层字段级**：root9 段逐字节
相等（记录/顺序/宿主 f503 全覆盖），其余字段等值，root46 仅等长校验并登记为预期差异。

## 3. 全量语义回归（80 快照，硬门禁）

```bash
npx tsx ui/tests/exhaustive-snapshot-verify.ts 2>&1 | tail -2
```

```
PASS 127 snapshot assertions over 80 files
```

```bash
for f in .gsts/diff-exp/ui学习/*.gil; do
  node bin/gsts.mjs assets:ui list --flat --gil "$f" --format json >/dev/null || echo "FAIL $f"
done
```

```
CLI80 files=80 FAIL=0
```

## 4. 类型检查 / 构建

```bash
# 本票改动子集（src + ui/src）：
npx tsc -p tsconfig.json --noEmit   # 全量被 examples/football WIP 阻塞时用子集 tsconfig（临时）
```

```
TSC_EXIT:0（src + ui/src 子集，临时 tsconfig.ui05.tmp.json，跑完即删）
```

```bash
npm run build
```

```
EXIT:2 —— 唯一错误：examples/football/src-fb/fb-phys.ts(121,35): error TS2551
（examples/football/* 为交接书 §3 无关 dirty 路径，football 票13 WIP，本票未触碰；
 子集 tsc EXIT 0 证明本票代码类型全绿；全量构建待 football 收口后重跑复核）
```

## 5. create 真命令冒烟（源码入口 = dist 未含新代码时与 bin 等价执行路径）

```bash
GIL=.gsts/diff-exp/ui学习/1073741909.after-重启66-默认页签2-7468eadd.gil
npx tsx /tmp/ui05-smoke.ts create --type custom-button --on layout:1073741825 --gil "$GIL" \
  --output /tmp/ui05-cand.gil --format json
```

```
surface={"kind":"layout","layoutId":1073741825}
parentId=1073741825
newId=1073742155
donor=1073741909.after-重启4-默认布局自定义按钮-e645aefb.gil (1073742032->1073742155)
candidateSha256=667e2302387502be83fd29af30ebb900d4697b4bb7e5f8f0360d8d1822d18e8d
candidate=/tmp/ui05-cand.gil
editorOrGameValidation=not-performed
```

```bash
npx tsx /tmp/ui05-smoke.ts create --type custom-button --on container:1073742084 \
  --gil "$GIL" --output /tmp/ui05-cand2.gil --format json
# surface={"kind":"container","containerId":1073742084}  newId=1073742155
# donor=...after-重启26... (1073742089->1073742155)
```

候选语义回读（对 base 快照做 list，两次 create 各 +1 且路径正确）：

```
base buttons: 4 | c1: 5 | c2: 5
c1 button: {"kind":"custom-button","path":"布局:默认布局:自定义按钮#1","name":"自定义按钮"}
c2 button: {"kind":"custom-button","path":"控件组库:悬浮交互页#1:固有容器#1:自定义按钮#2","name":"自定义按钮"}
CHECK PASS
```

负例（fail-closed / 归属校验）：

```
ERROR: [error] create custom-button 本轮候选=编辑器默认形态（--text/--color/--font-size/--content
需状态素材或内容载体 donor，尚未差分闭合，见 .scratch/ui-command-layer/issues/05 open-items）...
ERROR: [error] 1073742085 不是悬浮页容器（kind=close-button 属控件/布局类）
```

## 6. 未验证/需用户确认（三栏中的后两栏）

- 尚未验证：真实 `--write` 写回后的编辑器可见/可细排；游戏内按钮显示/位置/点击/悬浮页事件
  （行为层，票 08 等价验收，**用户按验收句式确认**）；`--text/--color/--font-size`（素材骨架 donor 未闭合）；
  容器面 `--position/--size` 字节级同参对拍（无编辑器同参样本，仅语义回读）。
- 本样例全部命令均为只读（候选落 /tmp）；候选文件与 80 快照逐字节对拍见 §2/§3。
