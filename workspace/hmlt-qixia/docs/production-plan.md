# production-plan — hmlt-qixia《虹猫蓝兔七侠传》千星复刻

> 项目：复刻&再创&升级 2008 Flash 横版动作射击《虹猫蓝兔七侠传》为千星 2D+Lua 游戏。
> 里程碑：P0 = 完整一局游戏体验（boot→playing→win/fail→restart）。

## 当前步骤

- **3 HTML 效果展示**（步骤 2 已完成 2026-10-12：tests/ 11 用例 normalizeCase 全过 + docs/tests-trace.md 追踪表/日志词汇表/Debug 信号协议/键位映射）
- 退出证据：HTML 原型可玩（原版 SVG 占位），用户确认手感（browser-run: user）
- 无阻塞项

## 知识库来源与可用性（已核实本会话可读）

| 来源 | 位置 | 状态 |
|---|---|---|
| 官方《客户端控件API文档》全文镜像（11359 行，v2.5.1，2026-09-29 抓取自 act.mihoyo.com mhtakr07vej4） | `research/千星知识图谱/learn-lua71/官方API文档-客户端控件.md`（仓库根 research/，非 workspace/） | ✅ 已读取验证 |
| 结构化 API 面清单（165 行，官方镜像+模拟器 125 项实测交叉，2026-09-30） | `research/a2-lua-gen/api面清单.md`（仓库根 research/） | ✅ 已读取验证 |
| 模拟器 Lua runtime 源码 | `/home/h/miliastra-beyond-simulator/client/lua-runtime/src/`（enums.js/runtime.js/lua-bridge.js） | ✅ 前期已精读（D115/D117） |
| 真机契约（21 条，三轮探针 7.0.50） | `/home/h/miliastra-beyond-simulator/client/lua-runtime/docs/observed-contract.md` | ✅ 前期已精读 |
| 官方指南补取通道 | miliastra-knowledge KB（2026-10-12 实取《编辑项范围限制》 mh74ae9fsg8i 全文） | ✅ 可用 |
| 平台可行性裁决（键盘 58 键/OnUpdate/预算 10000-1000-2000/AABB） | `workspace/hmlt-qixia/research/notes/platform-feasibility.md` | ✅ 完稿 |

模拟器工具：qxqy_studio_get / patch / play / play_screenshot / ui_screenshot / load 本会话全部可见可用（本会话 D124–D136 修复链已实跑）。步骤 1–4 不打开模拟器。

## 考古证据（输入材料）

- 5 款 SWF 落盘 `research/swf/`（md5 台账：`research/notes/swf-hunt.md`；主目标=4399-9663_2 七侠传，SWF6/25fps/400×250）
- AS2 反编译树 `research/extract/as/scripts/`（FFDec 导出，223 顶层/2184 脚本；标识符纯拼音；文件名含空格须 `find -print0 | xargs -0`）
- 试玩台 `research/play.html` @ http://127.0.0.1:8791（Ruffle 0.7.1）——**用户已验：原版无兼容问题**
- 机制白皮书（进行中）→ `research/notes/mechanics-whitepaper.md`；中段结论已入河 D143（主时间轴/波次导演/玩家操控闭合）

## 下一步

1. 白皮书返回 → 写 `docs/gdd.md`（复刻/再创/升级三栏；平台裁决做硬约束；用户拍板玩法取舍）
2. → 步骤 2 TDD 用例 → 步骤 3 HTML 展示

## 步骤 3 证据（2026-10-12）

| 3 | HTML demo 搭建中 → 已上线待用户试玩 | prototype/index.html + README.md；JS 语法 node --check OK；22 SVG 素材全 200（http.server 8792，服务已起）；browser-run: user 待反馈（records/playtest.md） | 用户手感反馈 |
## 2026-10-13 夜 · 步骤 5+6 完成

- 步骤 5（Lua 实现）：✅ 单脚本 main.lua + 4 模板 + 对象池架构；runCase 11/11 全绿（commit 980a3ef）
- 步骤 6（模拟器测试）：✅ 本地电池 + MCP 交互全链 + 三截图存证
- 步骤 7（真机）：**待用户**——device-package/ 五件套 + docs/device-import.md 操作单；真机地图导入+试玩待用户在场执行
- 阻塞项：无技术阻塞；视觉/音频为约定占位（用户口径「不阻塞」）
