# 试玩记录（records/playtest.md）

## 步骤 3 HTML demo — 待用户试玩（browser-run: user）

- 地址：http://127.0.0.1:8792/prototype/（服务：`cd workspace/hmlt-qixia && python3 -m http.server 8792`）
- Agent 已验证：JS 语法 OK（node --check）、22 个素材 SVG 全部 200。**Agent 无浏览器工具，未亲自试玩**。
- 用户试玩待记录（体验反馈/节奏问题/不可移植项）：_待填_

### 用户反馈记录

_（试玩后逐条落在这里，格式：日期 · 反馈 · 处置——改 demo / 回写 GDD / 登记风险）_

## 步骤 6 模拟器测试 — 未开始

_（runtime=simulator 记录区）_

## 步骤 7 真机 — 未开始

_（runtime=device 记录区）_

### 2026-10-12 首轮反馈（用户，browser-run: user）

1. **键盘 Colemak+拼音 IME：a 可用，d/j/k 失效** —— 根因：IME 拦截下 `e.key='Process'`，字母匹配失效；a 恰好物理位同位幸存。处置：normKey() 双通道（e.key 字母优先 → e.code 物理 Colemak 映射兜底），keydown/keyup 同路径。待用户复测。
2. **蓝兔素材错认成大奔** —— 568（fj1 主体）视觉为大奔，非蓝兔。处置：contact-sheet.html 五机体 shape 对照表（fj0..fj4 全部主体 shape），待用户指认蓝兔编号后替换 ART.lantu。待用户指认。
