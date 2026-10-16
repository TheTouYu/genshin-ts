# T07 · 模拟器 2D 能力纳入我方体系 + 削弱其主导地位

**What to build**（用户令 2026-10-17）：①把插件模拟器的 2D（UI+Lua）能力纳入**我方能力体系**；
②削弱其主导地位——不让单条路线框定整个会话。

- Blocked by：无 ｜ Status：✅ 2026-10-17

## 验收
- [x] 新技能 `simulator-2d-route`：路线定位（我方三条生产线里的哪条）+ 工具面（`qxqy_studio_*` 六工具 / play 动作 / patch op / set key）+ 三类资产 + 领域规则（画布/require/脚本挂载/图元白名单）+ 工作流 + 与真机/CLI 的衔接
- [x] 与上游插件技能**职责分离**：我方=路线选择与生态衔接；`qxqy-simulator`=工具细节；`qxqy-game-studio`=七步工作流；改动走我方 fork
- [x] **persona 重写**（`~/.dsh/preset-bundles/qxqy-river/cordis.patch.yml`）：从「2D+Lua studio director / not a 3D level-graph designer」改为「**全生态**工程代理（三条生产线，先选线）」，技能路由指向工作区 AGENTS.md，插件技能降为参考与借鉴；**体量 16066→11953 字符（-4113）**；备份 `cordis.patch.yml.bak-persona-*`
- [x] 预设 description 同步改为「千星全生态游戏工程（三条生产线）」
- [x] AGENTS.md 路由表新增模拟器路线行（插件技能标注为"参考/改动走我方 fork"）
- [ ] **生效条件**：persona 在**新会话**生效（本会话系统提示已固定）——需要用户新开任务或重启 dsh-web 才是最终验证（用户令：重启前先告知并确认时机）
