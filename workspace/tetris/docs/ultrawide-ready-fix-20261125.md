# Win11 超宽屏底色与 AI 准备态修复

> @status: active
> 证据范围：用户截图、真实 Lua 日志、原生 Lua 5.3 回归、真实地图脚本回读；新版真机像素尚待确认。

2026-11-25 用户补充确认：上述背景与 AI 准备态修复真机核验通过。
后续 PC+移动端双人试玩发现角色介绍移动端空白，作为独立缺陷继续处理。

## 根因与证据

- 用户截图 3840×1080；真实日志 `2026-11-25_21-07-35_3508_110170759.gia`
  rec29 返回约 3080×900，而完整窗口按高度换算为 3200×900。
  旧底色拉伸父画布每边 1%，覆盖约 3769.92px，左右各缺 35.04px，与截图相符。
  具体引擎为何缩小父画布尚未闭合，不将其直接命名为已证实的安全区规则。
  旧检查仅验构图 AABB，wash 只回读一个锚点，因而 `bg cover ok` 不能证明窗口铺满。
- 同日志 rec369–379 连续 11 条 `guide ready p2`；rec380 P1 准备后才进入倒计时。
  AI 模式错误复用双人键组归属，方向键只重复准备 AI；原存档的方向键准备回归已重现失败。

## 修复与复盘回灌

- 共享框架与游戏副本同步增加 `platform.fillBackdrop`，底色每侧出血 H/8，内容布局保持原画布。
  本例尺寸 3305×1125，覆盖 3200×900 窗口。覆盖承诺有界：额外范围每侧 H/8，
  不声称测到物理 viewport。完整回读四锚点、pivot、位置、尺寸，失败明确报 FAILED。
  启动第一帧与后续换主题共用入口，日志如 `wash=bleed:112.50`。
- `readyPlayer` 收口两条重复准备/倒计时代码。只有 PVP/合作才按 P2 键组分席位，
  AI 模式的真人玩法键均准备 P1；原有浮层优先级保留。
- 技能回灌：`qxqy-ui-framework/SKILL.md`、2D 游戏 `06-layout.md` 与 `03-input.md`。
  判据分别覆盖独立窗口尺寸、写入假成功、模式与键组交叉回归；不再把父容器等同窗口。

## 验证入口与结果

使用独立临时目录中的 Lupa `lua53`（真正 Lua 5.3）执行，不改共享 Linux 依赖：

```text
lua5.3 tests-lua/platform_test.lua        15 passed
lua5.3 tests-lua/input_map_test.lua       84 passed
lua5.3 tests-lua/bg_cover_test.lua        17 passed
lua5.3 tests-lua/backdrop_ready_test.lua  PASS
```

最后一项直接加载 main 的真实回调，验证 AI 方向键/WASD/空格、PVP/合作双方准备、
倒计时后启动、3080×900 下生产背景接线，分别用仓库源码及更新后的 save 内嵌源码跑通。
全部 40 个 Lua 文件经过原生 5.3 编译。框架独立 `tests/backdrop_test.lua` 验证窗口覆盖和
5 种静默写入失败；框架/项目 platform 逐字节相同。

未重建模拟器 UI 资产或 GIA：本轮复用现有资产，只更新 save 的内嵌 Lua；未跑模拟器出图。
Windows 下旧模拟器依赖链接不可用，未为此重装 Linux 共享依赖。TS 未改，未跑 TS 全量构建。

## Windows 部署与回读

- 版本 `v6.35`，模块指纹 `14c73fd2`，40 源文件。
- 地图 `1073741834`；实际默认宿主 `1073741904` → `main_2`，保持原有 5 处挂载。
- CLI 先生成候选并独立解析，校验只改 `main_1/main_2/tetris_platform/tetris_ui` 四条源码；
  写前 SHA 锁定，通过 `assets:scripts update --write --map-id 1073741834` 写入。
- 42 条登记与 42 外置源码全部逐字节匹配；除 f50 脚本表外其余顶层字段保持不变。
  写后 GIL 等于候选且 Save/Temp 相同，`tools/gil-guard.py --temp` PASS。
- 最终 SHA256：`aa3f3b79e0f0237dfa19d749fe64342a9928db0170a18f815d7b5ca0043487fb`。
- 最初修复前完整备份：`C:/Users/Administrator/Documents/GenshinTS-backups/tetris-fix-20261125-final/before/`。
  最终轮备份、候选、源码及清单：同父目录 `tetris-fix-20261125-final2/manifest.json`。

Windows 共享卷的 Node copyfile/递归复制出现原生错误，文件同步改用 PowerShell Copy-Item，
最终独立回读已通过。Git 精确暂存与提交被既有 `.git/index.lock` 阻止（21:03:53，0 字节），
本轮未删除锁或绕过锁提交；修改保留在工作区。
PKC 锁定运行时缺失，规则先落技能，知识树同步待环境恢复；耗时教练卡无显著浪费告警。

## 验收三栏

| 已验证 | 尚未验证 | 用户游戏内确认 |
|---|---|---|
| 结构：原生语法、框架几何、真实回调回归、候选/真实脚本回读、42 外置文件、5 挂载与 Temp 同步；行为：用户确认本轮两项真机核验通过 | 新发现的角色页移动端文字空白，另立修复 | 本轮背景与准备态已确认，无需重复核验 |
