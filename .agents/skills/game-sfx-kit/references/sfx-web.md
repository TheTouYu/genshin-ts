# 音效挑选网页（sfx-web，多 profile 版）

> 路径：`workspace/tetris/sfx-web/`（`index.html` + `catalog.json` + `profiles.json` + `choice.json` + `serve.py` + `e2e.mjs`）
> 用途：在浏览器里**逐条试听官方 1997 条音效**，把选中的 id 填进某个 profile 的槽位，一键导出 Lua 表 / JSON，并 POST 落盘给 AI 读。
> 它把 §2（id 从哪来）、§3（按预算选型）、§5.1（SFX 表）三步合成一个可视化工具。

## 1. 起服务 / 停服务

```bash
cd workspace/tetris/sfx-web
python3 serve.py                      # 前台；或 setsid nohup python3 serve.py > /tmp/sfx-web-8100.log 2>&1 &
# 打开 http://127.0.0.1:8100
# 换端口：SFX_WEB_PORT=8123 python3 serve.py   （e2e 侧 SFX_WEB_URL=http://127.0.0.1:8123/ node e2e.mjs）

# 停/重启：**按端口杀**，不要用 pkill -f（会自匹配到当前 shell 的 pkill 命令行）
lsof -ti:8100 | xargs -r kill
```

判定：`ss -ltnp | grep 8100` 有 LISTEN；`curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8100/` = 200。

> ⚠️ **别用 8099**：`dsh-memo-river` 的本地嵌入服务（`scripts/local-embed/server.py --port` 默认 **8099**，
> 2026-10-27 13:26 起常驻）占着它——那台服务是记忆河流的向量后端，抢它的端口等于断别人的嵌入。
> 本服务因此默认 8100。
改 `index.html`/`catalog.json` 只需刷新页面；改 `serve.py` **必须重启**。

## 2. 五个动作（UI）

| 动作 | 怎么做 |
|---|---|
| 切游戏 | 顶部下拉框选 profile；左栏槽位与已选 id 一起换 |
| 选槽位 | 点左栏任一张卡（蓝框=当前槽位），底部横条显示它的**时长预算** |
| 找音效 | 右侧搜索框（名称/id）+ 类目 chip；超出当前槽位预算的行**时长变橙**并置灰 |
| 试听 | 点列表任意一行（`<audio>` 直连 `https://oss.070077.xyz/audio/<id>.mp3`） |
| 采用 | 点该行「用这个」→ 填进当前槽位（自动同步到 localStorage + 服务端） |

底部按钮：`试听全部槽位`（按顺序播一遍）/ `提交选择给 AI`（POST /save）/ `导出配置`（Lua 或 JSON，表名可改）。
profile 管理：`新建 / 复制 / 重命名 / 删除`（删除要输入 `DELETE` 确认；至少保留一个 profile）；`＋ 加槽位` 输入 `key,显示名`。

## 3. 数据文件与格式

### `profiles.json`（服务端权威状态，`GET /state` 返回同一结构）

```json
{
  "version": 2,
  "active": "tetris",
  "at": "2026-10-27T05:24:39.272Z",
  "profiles": [
    {
      "id": "tetris",
      "name": "俄罗斯方块（tetris）",
      "luaName": "SFX",
      "slots": [
        {"key": "move",  "label": "左右移动", "id": "50884", "luaKey": "move",  "budget": "move",  "note": "按钮点击_轻_卡通_03"},
        {"key": "clear1","label": "消 1 行",   "id": "50917", "budget": "clear", "note": "确认按钮_中"},
        {"key": "levelup","label": "升级",     "id": "40001", "luaKey": "level", "budget": "clear", "note": "…"}
      ]
    }
  ]
}
```

- `slot.key`：profile 内唯一，决定 JSON 键与导出字段名。
- `slot.luaKey`（可选）：导出 Lua 时用它当字段名（tetris 的 `levelup` → `level`，与 `lua/main.lua` 对齐）。
- `slot.budget`（可选）：`move|lock|clear|over`，UI 用它标出超预算候选；缺省按 `key` 猜（`clearN`→clear、`move/rotate/hover/click/cancel`→move、`lock/confirm`→lock、`over/error/fail`→over）。
- `profile.luaName`：导出 Lua 的基础表名（默认 `SFX`）。

### `choice.json`（给 AI / 旧读者）

每次 `POST /save` 同时写 `profiles.json` 与 `choice.json`。`choice.json` 是 **v2 + legacy 顶层**：

```json
{"version":2,"active":"tetris","at":"…",
 "profiles":{"tetris":{"name":"…","luaName":"SFX","slots":{"move":{"id":"50884","note":"…"}}}, "generic-ui":{…}},
 "slots":{"move":{"id":"50884","note":"…"},"rotate":{…}},      // ← legacy：固定取 tetris profile 的槽位
 "selected":"move"}
```

旧读者只读 `.slots/.selected` 照旧可用；新读者读 `.profiles[<id>].slots`。

## 4. HTTP 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/` | 页面 |
| GET | `/catalog.json` | 1997 条：`{id,name,cat,catId,dur,named}`（`named=false` = 名库里没中文名，仅有官方 `nameI18nKey` 尾号） |
| GET | `/state` | 归一后的 `profiles.json` 内容（缺失则用内置 seed + 旧 `choice.json` 迁移） |
| POST | `/save` | 三种 body 都收：见 §5 |
| GET | `/profiles.json`、`/choice.json` | 静态读盘（调试/AI 直接读） |

## 5. `POST /save` 的三种 body（服务端归一）

```bash
# ① v2 完整状态（页面自己用的形态）
curl -sS -X POST -H 'Content-Type: application/json' -d @profiles.json http://127.0.0.1:8100/save
# ② v2 映射形态
curl -sS -X POST -d '{"profiles":{"my-game":{"name":"我的游戏","slots":{"click":"50880"}}}}' http://127.0.0.1:8100/save
# ③ 旧格式（只更新 tetris 的槽位，别的 profile 原样保留）
curl -sS -X POST -d '{"slots":{"move":{"id":"50884","note":"x"}},"selected":"move"}' http://127.0.0.1:8100/save
```

返回 `{"ok":true,"saved":[profiles.json,choice.json],"active":…,"profiles":[…],"slots":N,"at":…}`。

## 6. 验一遍（改完页面/服务必跑）

```bash
cd workspace/tetris/sfx-web
python3 serve.py &                                     # 8100
node e2e.mjs                                            # 27 条断言，退出码 0 = 全绿
```

`e2e.mjs` 用 headless Chromium + CDP（node 26 内置 WebSocket，零第三方依赖），覆盖：
切 profile → 槽位跟着换 → 选槽位 → 搜索 → 「用这个」→ 提交 → 新建/加槽位/复制/重命名/删除 → 导出表名可配 →
**读盘核对 `profiles.json`**（含「另一个 profile 没被带跑」的负样本）→ 复位测试副作用。

## 7. 新游戏的接入姿势

`tetris` 只是一个 profile，**结构不写死任何游戏**。给新游戏加：
① 顶部「新建」→ 输入名字；②「＋ 加槽位」按事件建槽（`key,显示名`，如 `hit,受击`）；
③ 每个槽位挑 id 后「提交」；④ 「导出配置」→ 表名填 `SFX_XXX` → 复制 Lua 表进该游戏的 `lua/main.lua`。
建议每个槽位在加之前先看底部预算横条（`move/lock/clear/over` 四档），把预算和你的事件对上，再挑时长合适的候选。
