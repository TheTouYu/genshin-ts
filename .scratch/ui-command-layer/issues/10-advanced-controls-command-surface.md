# 10 — 高级控件命令面：悬浮交互页 + L4 能力（待执行）

**What to build:** 把"高级控件"接入语义命令层并在真实地图/游戏核验——重点是用户点名的
**悬浮交互页**（富版：页签/容器/状态素材树/增量同步），以及 09 暴露的 L4 backlog：
素材组成员 add/update（delete 已有引擎 R3）、rich-image 内联图片素材配置（design `--rich-image`）、
templateize 素材树克隆（09 R5 根因）、队列消息项/样式族写入（design `queue style/message`）。
范围=ui 模块 DESIGN 第三章 L2-L4 命令面中未接线/未核验部分，全部按真实样本 donor 驱动 + 字节级回读。

**Blocked by:** 票08 关账（复盘/PKC 先把 09 教训落库，10 开跑前读取）；09 backlog（见
ui/verification/ticket09-verification-report.md §D 未验证项与本文件下方清单）。

**Status:** 🔶 代码层主体完成（2026-09-03 票10 第一轮：5/8 项字节级闭合 + CLI 全量接线；
剩 templateize 克隆 / sync / 游戏核验——见文末轮次记录）

## 范围清单（承接 09 实测暴露 + 设计已定义未实现）

- [x] 悬浮交互页富版创建（代码层）：create 重写为新单条族 3 条（轮24 donor，root9 全等重放；
      旧 BUILTIN 合并形态不再产出）+ container add（轮33）+ 初始生效（轮48/49）+ variable add（轮3）
      —— floating-page-assert 13/13 PASS；游戏核验并入第 8 项
- [x] 页签（tab）体系（代码层）：tab create（轮29）+ page add/rename/text（轮30）+ default（轮36/66）
      + server-event（轮37/38）+ container/control-state（轮39-46，entry 分组序修正）+ CLI 全接线
      —— tab-assert 19/19 PASS（15 个重放事件 root9 全等）
- [x] 素材组成员 add/update（代码层）：add（已有组追加=轮15 / 建组+成员=轮16，root9 全等×2）+
      update（f19 文本/颜色，轮9 复合轮如实降级为自洽断言）+ remove 复用 R3 —— 10/10 PASS
- [x] rich-image 内联图片素材配置（代码层，09 R4 闭合）：f62 完整块插入（轮21）+ f3 单点换资源
      （轮22）双 root9 全等 —— 5/5 PASS
- [ ] templateize 素材树克隆（**未开工**——09 R5 根因仍在，clearButtonStateRefs 兜底在位；
      donor=轮63/补充2 S5-S10 就绪，引擎设计已定：三侧私有树+旧树物理删除）
- [x] 队列消息项/样式写入（代码层，09 B1d 闭合）：style add（轮53/54，首空位填充语义）+
      message add（轮61 前插）+ message style（轮62）+ props（轮55-58 全链）—— 12/12 PASS
- [ ] 同步广播 `sync`（**未开工**——按钮族整树替换轮17/12 + 悬浮页增量补齐轮25-50 donor 就绪）
- [ ] 高级控件游戏内核验（待执行——需用户在场；1073741917 候选链已可产出，CLI 冒烟全绿）

## 轮次记录

**第一轮（2026-09-03）**：6 commits——4eb50a0 悬浮页基础 / 5ed2217 页签+wire-safe+L1 升级 /
3054f17 素材成员 / 217e273 rich-image / 9d5ca08 队列 / f48bc8d CLI 全量接线（+知识回灌 commit）。
223 断言全绿（59 新 + 164 既有回归）；12 个编辑器事件 root9 逐字节全等重放。
新基础设施：wire-safe 大值安全层（哨兵/大 varint 往返保真）、section-ops 共享装配内核。
**下一步**：① templateize 素材树克隆（修 R5 根因）；② sync 双策略；③ 游戏核验批次
（1073741917：悬浮页富版组合/页签切换/素材成员/rich-image/队列内容/templateize+删除/sync）。

## 09 移交证据（勿重做）

- 09 全量报告：`ui/verification/ticket09-verification-report.md`（三栏 + R1-R5 + open backlog）
- 复用引擎：`ui/src/button-materials.ts`（三态文字素材）、`ui/src/material-groups.ts`（删成员/清引用）、
  `ui/tests/button-materials-assert.ts`、runner `ui/verification/ticket09-r2-candidate.ts`
- 验证图：1073741917「UI核验09」（当前 ee1e08b8…；如需干净高级控件实验可复用或另建新图）
