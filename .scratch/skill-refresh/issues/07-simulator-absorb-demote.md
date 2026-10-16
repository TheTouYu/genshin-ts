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
- [ ] **生效条件（2026-10-17 纠正：不是"新会话"那么简单）**——权威记载在 **`dsh-plugins` 桶**（D52/D164/D71），不在本项目：
  - **手编辑 `preset-bundles/*/cordis.patch.yml` 不会被宿主 watch**（bundle 经 symlink 活在 `profiles/web/node_modules` 下，命中 chokidar ignored `**/node_modules`）。
  - **热生效官方路径** = 改 profile manifest 的 `dsh.profile.bundles` **有序列表**（swap 两行再换回）→ manifest notification → recompose → bundle patch 重读。
  - **生效判据链三段**：① YAML 可解析（`!!js` 标签警告是预期）→ ② 宿主内存声明含新行（组合器 `readSpec` → `readDocument` 回读）→ ③ **新会话**才拿到新 persona（"edits affect subsequently created Agents"）。
  - 已验证 ①：本文件用带 `!!js` 处理的 loader 解析通过，新 persona 在、旧的不在、任务契约段完整。
  - **② 已验证 ✅（2026-10-17 01:5x）**：manifest swap 触发热重装配后，走组合器路由回读宿主内存声明——
    `POST /preset-composer/api` `{"action":"readSpec","args":{"id":"qxqy-river"}}`（环回免 token；**信封是 `{action,args}`**，不是 `{op}`）
    → 返回 9579 字符声明文本：**含新 persona（全生态/参考与借鉴）= True，含旧 persona（2D+Lua game studio director）= False** ✅
    （`ok:false / read/no-source` 是**预期**——qxqy-river 非托管，无 compose.source.json；文本仍照常返回。）
  - ③ **待用户开新会话**才算终验（"edits affect subsequently created Agents"）。
- [x] 规范核对（`~/dsh-plugins/AGENTS.md` 第 15 条）：**改前留 `.bak` ✅**（`cordis.patch.yml.bak-persona-20261017-014747`）；**"`cordis.patch.yml` 与 `compose.source.json` 的 prefix 逐字一致"不适用**——qxqy-river 无 `compose.source.json`（只有 river-acp / -dev / -skillrec 有）；**块标量编辑用行级替换 + 缩进对齐 + 解析验证 ✅**。
- [x] 命中度核对（D71）：qxqy-river 是**手写非托管 bundle**，且主 `cordis.yml` 与 bundle 补丁**双定义**、**运行时生效的是 bundle 补丁** ⇒ 我改的正是生效那份 ✅
