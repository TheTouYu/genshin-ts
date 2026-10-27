# sfx-web · 音效挑选器（多 profile）

浏览器里试听官方 1997 条音效 → 填进某个 profile 的槽位 → 导出 Lua 表/JSON → `POST /save` 落盘给 AI 读。

**用法与接口文档**（权威，含 profile schema、三种 POST body、预算标注）：
`.agents/skills/game-sfx-kit/references/sfx-web.md`
（技能 `game-sfx-kit`；选型判据见该技能 `SKILL.md` §3）

```bash
cd workspace/tetris/sfx-web
python3 serve.py                 # → http://127.0.0.1:8100（SFX_WEB_PORT=8123 可换）
lsof -ti:8100 | xargs -r kill    # 停/重启（别用 pkill -f，会自匹配）
node e2e.mjs                     # 27 条无头浏览器断言，退出码 0 = 全绿
```

**端口注意**：`8099` 已被 dsh-memo-river 的本地嵌入服务占用（`scripts/local-embed/server.py --port` 默认 8099），
本服务因此默认改用 **8100**。换端口：`SFX_WEB_PORT=8123 python3 serve.py`；e2e 侧 `SFX_WEB_URL=http://127.0.0.1:8123/ node e2e.mjs`。

文件：
- `index.html` — 页面（profile 下拉 / 槽位 / 目录 / 导出）
- `catalog.json` — 1997 条 `{id,name,cat,catId,dur,named}`，由 `game-sfx-kit/scripts/build-catalog.mjs` 生成
- `profiles.json` — 权威状态（`GET /state` 同构）
- `choice.json` — 每次保存同时写入；v2 + legacy 顶层（`slots`/`selected` 固定取 tetris profile）
- `serve.py` — 静态服务 + `GET /state` + `POST /save`
- `e2e.mjs` — 无头浏览器端到端验证（headless Chromium + CDP，零第三方依赖）

重新生成 catalog：

```bash
node .agents/skills/game-sfx-kit/scripts/build-catalog.mjs \
  --data /tmp/audio-data.json \
  --library .agents/skills/game-sfx-kit/assets/sfx-library-full-20261027.md \
  --all --out workspace/tetris/sfx-web/catalog.json
```
