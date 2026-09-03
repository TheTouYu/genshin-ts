# 10 — 高级控件命令面：悬浮交互页 + L4 能力（待执行）

**What to build:** 把"高级控件"接入语义命令层并在真实地图/游戏核验——重点是用户点名的
**悬浮交互页**（富版：页签/容器/状态素材树/增量同步），以及 09 暴露的 L4 backlog：
素材组成员 add/update（delete 已有引擎 R3）、rich-image 内联图片素材配置（design `--rich-image`）、
templateize 素材树克隆（09 R5 根因）、队列消息项/样式族写入（design `queue style/message`）。
范围=ui 模块 DESIGN 第三章 L2-L4 命令面中未接线/未核验部分，全部按真实样本 donor 驱动 + 字节级回读。

**Blocked by:** 票08 关账（复盘/PKC 先把 09 教训落库，10 开跑前读取）；09 backlog（见
ui/verification/ticket09-verification-report.md §D 未验证项与本文件下方清单）。

**Status:** ready-for-agent（用户 2026-09-03 定：09 之外的高级控件走本票执行）

## 范围清单（承接 09 实测暴露 + 设计已定义未实现）

- [ ] 悬浮交互页富版创建/核验（轮24-35 学习资产；老 gil_ui BUILTIN vs 新单条族不一致 → 按新链路 donor 重验）
- [ ] 页签（tab）体系：页面项/两容器显隐/控件状态/初始生效（轮39-50 规则已闭合，命令未接线）
- [ ] 素材组成员 add/update 命令（`assets:ui state material add/remove`、`update --target <实例>.<素材树>:<member>`；
      引擎已具 remove=R3、text/color 改写=R2 patchTextMember，add 待接线）
- [ ] rich-image 内联图片素材配置（09 R4：图文输入框 create 无图片素材，用户手工补 {5:img_1}）
- [ ] templateize 素材树克隆（09 R5 根因：模板与实例共享组→删实例后悬空；编辑器语义=模板侧素材副本+同步）
- [ ] 队列消息项/样式写入（design queue style/message；09 B1d 空队列通过但内容写入未测）
- [ ] 同步广播 `sync`（layout-instance 整树替换 / floating-page 增量补齐）
- [ ] 高级控件游戏内核验（同 09 流程：候选→SHA→备份→写回→用户游戏确认→list/anchor/diff 读回）

## 09 移交证据（勿重做）

- 09 全量报告：`ui/verification/ticket09-verification-report.md`（三栏 + R1-R5 + open backlog）
- 复用引擎：`ui/src/button-materials.ts`（三态文字素材）、`ui/src/material-groups.ts`（删成员/清引用）、
  `ui/tests/button-materials-assert.ts`、runner `ui/verification/ticket09-r2-candidate.ts`
- 验证图：1073741917「UI核验09」（当前 ee1e08b8…；如需干净高级控件实验可复用或另建新图）
