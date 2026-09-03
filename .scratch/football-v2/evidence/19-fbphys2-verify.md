# 票 19 · fb-phys2 内核零改动与读图核验（2026-09-04）

## ① diff 层（内核零改动）
- `git diff --no-index fb-phys.ts fb-phys2.ts`：105+/44-，变更集中=头注释/imports/
  CFG 常量×11/图 ID 行/④ gate 退役/⑤ 输入读替换/⑮ 写回新增
- 内核段 ⑧-⑫（六态积分/门框/墙/反弹/状态分类）sed 段落逐字节比对=零差异
- 关键计数全对称：spd/hp1/gHit/nextStF/b2f/pDt/pNet=1=1，FbSignal.fb_ball_state=2=2

## ② decode 层（census delta 全归因 + 冻结断言 20/20 PASS）
phys=501 → phys2=565（Δ+64，13 类节点变化逐一归因：逻辑与 -1=gate 退役；
相等+2=bootstrap 二读+哨兵；加法+1=nTick；自定义变量读 -1=gate 删（12 镜像读
平移 bootstrap 形态）；取列表值+10=组索引；转换+8=7 处新 conv+g[0]→int；
拼装+1=组读；双分支+2=bootstrap 两层；拆分+4=bp/bv/bs/ss；创建向量+3=bPos/
bVel/bSpin；设技能变量+22=bootstrap 11+写回 11；查技能变量+13=组10+st1+探针1+哨兵1）
断言门禁：census 12 项冻结值/总数 565/set 全字面量 cfgId/cfg 覆盖 558~568 全 11 个/
自定义变量名 pin 全在位/fb_ball_gate 零读（拍门退役实证）/fb_ball_state 发送×2
（P+T）/执行流 0 环（DFS 三色）/无同针脚重复入边 —— 20/20 ALL PASS
复现：npx tsx tools/decode-gia.ts dist-fb/src-fb/fb-phys2.gia（断言脚本见
commit 19(3.3) 会话记录）

## ③ 读图层（Step 3.5/3.6 · 编译产物形态，图未注入）
- decode JSON 直读形态：nodeIndex 标识/pins[].connects（kind==1 执行边）
- 变量名 pin：get_custom_variable 44 个全带非空名字 pin（含 fb_p_* 19/bootstrap
  镜像 12/寄存器 12/entity 1）
- 疑点移交：注入后需按 4.1 四项核验重跑（check-gil-composite-refs --incoming/
  scan-gil-var-pins/mounts/skill-config list）——.gia 有边≠.gil 有边（裁剪事故模式）
