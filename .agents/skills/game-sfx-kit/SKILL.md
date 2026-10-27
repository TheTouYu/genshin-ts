---
name: game-sfx-kit
description: 给千星沙箱（Lua 客户端脚本）选音效、接音效、验音效的完整工具箱——官方音效 id 三条来源（1997 条 data.json / 1196 条中文名库 / 模拟器缓存预热）、按类目+时长选型判据（移动 50~180ms、落地 300ms~1s、消行 0.5~2s、结束 ≤1s）、Lua 侧 game.PlayAudio2D 接入模板（SFX 表 + 帧闸 + 全 pcall）、模拟器 audio.recent 断言与 runner audioExpect、真机与模拟器音效库差异、音效常见坑，并附带「音效挑选网页」（多 profile，浏览器里试听后导出 Lua）。当任务涉及：给游戏加 BGM/SFX、挑音色、音效时长不对或拖尾、音效占 voice、PlayAudio2D 无声音、音效断言（09/10 用例）报红、改音效表、sfx-web 挑音器——使用本技能。
---

# game-sfx-kit · 千星音效选型 / 接入 / 验证

> 最近校验：2026-10-27（数据来自实测：1997 条官方库 + 1196 条中文名库 + 模拟器音频白名单源码）。
> 读者=要给某个千星 Lua 游戏加音效的模型。**本技能只给判据与命令，不写散文。**

## 0. 目录与本技能的位置

```
.agents/skills/game-sfx-kit/
├── SKILL.md                      ← 本文件（判据 + 命令）
├── assets/
│   ├── sfx-library-full-20261027.md   ← 1196 条「id → 中文名」，7 类分节（GUI 采集+OCR+转录）
│   ├── audio-index.json          ← 1997 条「id → [category, duration]」，从官方 data.json 派生（无名字）
│   └── sfx-template.lua          ← 可直接粘进 lua/main.lua 的 SFX 表 + sfx() 帧闸模板
├── scripts/
│   ├── build-catalog.mjs         ← data.json (+名称库) → 网页用的 catalog.json
│   └── pick.mjs                  ← 按类目/时长/关键词查候选（选型时用它，别凭感觉挑）
└── references/
    └── sfx-web.md                ← 音效挑选网页（多 profile）的用法与 HTTP 接口
```

**分工**：本技能只管「声音」这一层（选哪条 id、怎么播、怎么断言播了）。
- UI 控件怎么造、Lua 怎么挂 → `simulator-2d-route`
- 模拟器 `runCase`/`playGet` 的机制细节 → `simulator-2d-route` + 记忆 D589
- 真机试玩取数 → `device-playtest-loop`
- 节点图/编辑器资产 → `genshin-ts-asset-operations`

**不解决**：官方库没有 BGM 素材（`category=1 环境` 最长 106.857s 可当环境底噪，但不是乐句），也没有音量/淡入淡出 API（`PlayAudio2D` 只有 id）。要 BGM 编排只能靠循环播 + `StopAudio`，见 §5.4。

---

## 1. 什么时候用

| 触发语句 | 走哪节 |
|---|---|
| 「给这个游戏加音效 / 加声音 / 加 BGM」 | §3 接入 → §4 验证 |
| 「挑个音效 / 换个音色 / 这个声音不好听」 | §2 选型 → `references/sfx-web.md`（浏览器试听） |
| 「音效没声音 / 播了听不到 / 音效拖尾」 | §7 坑表 → §6 差异 |
| 「音效用例报红 / audioExpect 失败」 | §4.2 |
| 「PlayAudio2D 怎么用 / 参数是什么」 | §3 官方语义 |

---

## 2. 音效 id 从哪来（三条通道，按优先级）

**id 是整数，形如 `50884`。官方文档只给签名不给 id 表——id 必须从下列通道取，猜不出来。**

### 通道 1（权威）：官方 `data.json` — 1997 条

```bash
curl -sS -o assets/data.json https://oss.070077.xyz/audio/data.json    # 或本技能 scripts/fetch-data-json.sh
node -e 'const d=require("./assets/data.json").data;console.log(d.length, JSON.stringify(d[0]))'
```

字段：`id / nameI18nKey / duration（秒，字符串）/ category（1..7）/ order / path / giVersion`。
**`nameI18nKey` 只有 key（`soundEffectPlayer.data.50884`），不含中文名**——名字要走通道 2。
`category` 编号实测定标（篇数/时长区间）：

| category | 类目 | 条数 | 时长 min/med/max |
|---|---|---|---|
| 1 | 环境 | 74 | 0.759 / 6.000 / 106.857 |
| 2 | 生物敌人叫声 | 204 | 0.249 / 1.167 / 4.470 |
| 3 | 角色动作 | 149 | 0.135 / 0.619 / 4.382 |
| 4 | 战斗 | 474 | 0.233 / 1.707 / 14.296 |
| 5 | 物件 | 895 | 0.119 / 2.110 / 30.038 |
| 6 | **界面音效** | 96 | 0.047 / 0.503 / 9.745 |
| 7 | 操控对象 | 105 | 0.350 / 3.140 / 15.000 |

> 常用档都在 **category=6（界面音效）**：移动/点击类 47ms 起，结束/提示类 0.5~2s 密集。
> 本技能 `assets/audio-index.json` 就是这 1997 条的 `id → [category, duration]` 离线副本（小，可 grep）。

### 通道 2（给人看）：中文名库 — 1196 条

`assets/sfx-library-full-20261027.md`：GUI 抓帧 + 面板 OCR + 看图转录采集，7 类分节，格式 `| id | 名称 |`。

```bash
grep -nE '^\| 5088[0-9] ' .agents/skills/game-sfx-kit/assets/sfx-library-full-20261027.md   # 按 id 查中文名
grep -nE '点击_轻' .agents/skills/game-sfx-kit/assets/sfx-library-full-20261027.md          # 按名字查 id
```

**只有 1196/1997 条有中文名**（采集覆盖范围：环境 10001–10074、生物 20001–20204、角色动作 30001–30149、
战斗 40001–40451、物件 50001–50119、界面 50862–50957、操控 50958–51061）。缺名的 801 条只能按
`category + duration` 盲选，或直接用 `references/sfx-web.md` 的网页逐条试听。

### 通道 3（试听/落盘）：模拟器音频缓存预热

模拟器把 mp3 缓存在本机，走 HTTP 路由 `/qxqy-audio/mp3-v1/<id>.mp3`：

```bash
# 模拟器 web 服务默认 --port 4173（/home/h/miliastra-beyond-simulator/web/server.js:52,224）
curl -sS -o /dev/null -w '%{http_code} %{size_download}\n' \
  http://127.0.0.1:4173/qxqy-audio/mp3-v1/50884.mp3      # 首次=下载并落盘，之后走缓存
ls -l ~/.cache/beyond-simulator/audio/mp3-v1/*/50884.mp3  # 落盘证据（hash 子目录名不固定）
```

- 源站直连也可：`https://oss.070077.xyz/audio/<id>.mp3`（实测 206 + ID3 头 + 支持 Range）。
- **只有白名单内的 id 才会被缓存**：`studio/host/audio-assets.js:31` 的 `accepts: id => audioDuration(id) !== null`，
  而 `audioDuration` 读 `studio/assets/audio-catalog.js` 的 GROUPS。**不在 GROUPS 里的 id → 静默不播，只有 warn**。
- 白名单 GROUP 与官方 1997 条同源（2026-10-26 已重建为全量），但仍需 §6 的真机核对。

---

## 3. 选型方法：先定预算，再按类目+时长筛

### 3.1 时长预算表（**时长错是「手感崩」的头号原因**）

| 事件 | 时长预算 | 供给量（category=6） | 备注 |
|---|---|---|---|
| 移动 / 旋转 / 悬停 | **50~180ms** | 9 条（很薄） | 高频动作，超过 200ms 就连成一片 |
| 落地 / 锁定 / 点击确认 | **300ms~1s** | 55 条 | 1s 以上会盖住下一个动作 |
| 消行 / 奖励 / 成功 | **0.5~2s** | 44 条 | 随连击档位可加长 |
| 游戏结束 / 失败 | **≤1s** | 79 条 | 结算页同帧播，长音效会拖到尾 |
| 环境底噪 / BGM 尝试 | 5~107s（cat 1） | 74 条 | 必配 `StopAudio` |

> 50~180ms 档只有 9 条 → 不够用时横向去 `category=3 角色动作`（0.15~0.5s 有 50 条）里找更短的。

**实测反例（务必记住）**：曾把 **9.745s** 的界面音效用在「消 1 行」——230KB，一局播几十次，
结果是**拖尾盖住后续音 + 长期占 voice**。判据：`duration > 预算上限` 直接淘汰，不因为「听着好听」留。

### 3.2 查询命令（不要凭感觉挑）

```bash
# 本技能自带查询器：类目 + 时长窗 + 关键词，一次给候选
node .agents/skills/game-sfx-kit/scripts/pick.mjs --cat 6 --max-dur 0.18 --limit 12
node .agents/skills/game-sfx-kit/scripts/pick.mjs --grep 点击_轻 --max-dur 0.2
node .agents/skills/game-sfx-kit/scripts/pick.mjs --dur 0.3-1.0 --cat 6        # 闭区间窗
node .agents/skills/game-sfx-kit/scripts/pick.mjs --grep 结束 --cat 6 --max-dur 1.0
```

`pick.mjs` 把 `assets/audio-index.json`（时长/类目）与 `assets/sfx-library-full-20261027.md`（中文名）合并输出，
每行 `id  dur  cat  名称`，并按 `-占比` 给预算提示。

### 3.3 定稿纪律

1. **一条事件一条 id**，不要复用（复用听不出事件差别）；确实要复用（如「升级=治疗音」）在注释里写清。
2. **消行按行数分档**用数组表 `SFX_CLEAR = {a,b,c,d}`，四档互不相同。
3. **语义未试听确认的条目一律标「占位」**（注释写 `-- 占位：未试听`）。名字对≠听起来对，
   试听确认后才删掉「占位」。这是本技能唯一的强制标注规则。

---

## 4. 官方 API 与语义（带出处）

| API | 签名 | 语义 | 出处 |
|---|---|---|---|
| `game.PlayAudio2D` | `(audioId: integer) -> integer` | 按已配置的音效 ID 播 2D 音效，**返回音效实例 ID** | `research/千星知识图谱/learn-lua71/官方API文档-客户端控件.md:1236` |
| `game.StopAudio` | `(audioInstanceId: integer) -> —` | 停止指定音效实例 | 同文件 `:1249` |
| `game.IsAudioAlive` | `(audioInstanceId: integer) -> boolean` | 查询音效实例是否还在播 | 同文件 `:1262` |

- **官方只给签名，不给 id 表**——id 走 §2。
- `PlayAudio2D` 是 **2D**（无空间衰减），3D 定位音效不在此列。
- 返回值是实例 id：需要「同一音效不叠两条」或「BGM 换曲」时存下来，用 `StopAudio` 收尾。
- `audioId` 必须是**整数**；传 nil/字符串在真机会抛错 ⇒ 全部 pcall（§5.2）。

---

## 5. 接入步骤（Lua 侧）

模板文件：`assets/sfx-template.lua`（可直接粘）。核心三件：

### 5.1 数据表（`SFX` / `SFX_CLEAR`）

```lua
local SFX = {
  move   = 50884,   -- 按钮点击_轻_卡通_03 (0.151s)
  rotate = 50883,   -- 按钮点击_轻_卡通_02 (0.151s)
  lock   = 50872,   -- 按钮点击_重_通用_01 (1.024s)
  over   = 50929,   -- 提示性UI_轻_整理背包 (0.978s)
  level  = 40001,   -- 战斗_治疗_回复_01 (1.653s) ← 占位：未试听
}
local SFX_CLEAR = { 50917, 40001, 40022, 40054 }   -- 0.785 / 1.653 / 1.064 / 2.000s
local SFX_MUTE = false
```

**每条都要写「名字 (时长)」注释**——三个月后改音时，靠它判断要不要重挑。

### 5.2 播放器：帧闸 + 全 pcall

```lua
local sfxFrame, frameSeq, sfxCount = -1, 0, 0   -- frameSeq 在 OnUpdate 里 +1

local function sfx(id, force)
  if SFX_MUTE or not id then return false end
  -- ① 同帧最多一条：真机一帧内可能连来两个动作（如 锁定+消行）
  --    frameSeq == 0 表示 OnUpdate 还一次没跑（真机若不派发就别把音全吞了）⇒ 不做帧闸
  if not force and frameSeq > 0 and sfxFrame == frameSeq then return false end
  sfxFrame = frameSeq
  -- ② 全走 pcall：真机缺这个 API 时一处抛错会中断整段 OnStart（2026-10-24 踩过）
  local ok, err = pcall(function() game.PlayAudio2D(id) end)
  if not ok then noteFail('PlayAudio2D', err) return false end
  sfxCount = sfxCount + 1
  return true
end
```

三条纪律：
1. **只在动作真的发生时播**（移动/旋转成功、锁定、消行、结束），**不在每帧播**。
2. **帧闸**：`sfxFrame == frameSeq` 保证同帧最多一条；`force=true` 用于「必须响」的（结束/升级）。
3. **`frameSeq == 0` 不做帧闸**：宁可多响，不要静音。

### 5.3 自演 / 静音口径

- 有「自动演示 / autopilot」模式时：自演里**不播高频音**（`move/rotate/lock`），只播结果音（消行/结束）。
  理由：自演跑得比人快，高频音会糊成噪音，且拖慢回归。
- 常量开关 `SFX_MUTE`（默认 false）当调试开关；**不用它做业务静音**（业务静音要有 UI 入口/存档位）。
- 教程/引导期：若引导会重放动作，同样按「结果音播、动作音静」处理。

### 5.4 停与 BGM

```lua
local inst = game.PlayAudio2D(10005)              -- 环境音当底噪
-- 之后（切场景/结束）
if game.IsAudioAlive(inst) then game.StopAudio(inst) end   -- 两者都 pcall 包一层
```
`PlayAudio2D` 播完不会自动回收句柄；长音效（cat 1/5）必须存实例 id 并 `StopAudio`，否则换场景后仍在响。

---

## 6. 验证：怎么证明「音效真的播了」

### 6.1 模拟器断言（唯一可靠通道）

`studio/autotest/assert.js` 的 6 种 kind（log/control/var/signal/tree/lua）**都拿不到 `rt.audioHistory`**
（`lua` kind 跑在 `createRuntime()` 新建的沙箱里）。可行通道只有一条：**runner 层**。

```js
// qxqy/runner.mjs（tetris 已实现，出处：记忆 D589）
const audio = () => { try { return studio.playGet().audio.recent } catch { return [] } }
```

`audio.recent` 的每条含 `audioId / startedAt / duration / alive`，上限 **128 条，且是全量历史不是尾巴**。

用例 JSON 里写（`qxqy/runner.mjs:43-54`）：

```json
{ "name": "09-sfx-actions", "audioExpect": [50884, 50883], "audioExclude": [50917], "...": "..." }
```

- `audioExpect`：这些 id 必须**至少播过一次**；缺 → FAIL 并打印 audio 计数表。
- `audioExclude`：这些 id **一次都不许出现**（用于「自演不该播动作音」这类负样本）。
- 跑：`node qxqy/runner.mjs`（看 `PASS x/y`）。

**没有这层断言的工程**：先照上面三行把 `audio` 取值 + `audioExpect` 加进 runner，再写用例；
不要在用例里用 `kind:"lua"` 硬读全局（读不到）。

### 6.2 人耳 / 试听

- 快速试听：`node scripts/pick.mjs` 出候选 → 打开音效挑选网页（`references/sfx-web.md`）逐条点。
- 网页里「试听」= 直接 `<audio>` 打 `https://oss.070077.xyz/audio/<id>.mp3`，不需要模拟器。
- **试听通过才能把「占位」标注删掉**；没有试听记录的条目在交付报告里明说「语义未确认」。

---

## 7. 真机 vs 模拟器差异（必须知道）

| 维度 | 模拟器 | 真机 |
|---|---|---|
| id 白名单 | `studio/assets/audio-catalog.js` 的 GROUPS（`audioDuration(id) !== null`） | 游戏内建音效库，**不同源** |
| 不在库里的 id | **静默不播，只有 warn** | 行为未知（可能报错/静默） |
| API 缺失 | 方法存在 | `PlayAudio2D` 可能不存在 ⇒ **必须 pcall** |
| 时长 | 与官方 `data.json` 同源 | 以实测为准 |

**判据**：模拟器绿 ≠ 真机听得到。真机核验只能由用户确认（本技能不越级声称）。

---

## 8. 常见坑

| 坑 | 症状 | 判据/修法 |
|---|---|---|
| **id 撞到别的类目** | 名字对但听感是别的动作 | 按**名称**挑还是按 **id** 挑要分清：名字在 md 里、时长在 data.json 里，两边都对上再用。`pick.mjs` 合并两源，避免只按一边 |
| **长音效占 voice** | 高频动作越播越糊、后音被吞 | 移动/旋转 ≤180ms；cat 5/7 里 3~15s 的**不要**给高频事件 |
| **改音效表没同步用例** | `09-sfx-actions` / `10-shake-clear` 报红 | 改 `SFX`/`SFX_CLEAR` 后**同轮**改用例的 `audioExpect`/`audioExclude`；这是约定不是可选项 |
| **每帧播** | 卡顿 + 噪音 | 只在动作发生时播；加帧闸 |
| **不 pcall** | 真机 OnStart 整段中断（后续控件全没建） | 所有 `game.*Audio*` 调用都 pcall |
| **帧闸在 frameSeq==0 时生效** | 真机一开场全静音 | 按 §5.2 的 `frameSeq > 0` 条件 |
| **靠 nameI18nKey 取中文名** | 拿不到名字 | data.json 只有 key；名字走 md 名库或网页 |

---

## 9. 资产与脚本怎么用

```bash
# 1) 重建网页用的 catalog.json（data.json + 名库 → id/name/cat/dur）
node .agents/skills/game-sfx-kit/scripts/build-catalog.mjs \
  --data /tmp/audio-data.json \
  --library .agents/skills/game-sfx-kit/assets/sfx-library-full-20261027.md \
  --out workspace/tetris/sfx-web/catalog.json
# 只出 1997 条全量（无中文名，name 回落为 nameI18nKey 尾号）：
node .agents/skills/game-sfx-kit/scripts/build-catalog.mjs --data /tmp/audio-data.json --all --out /tmp/catalog-full.json

# 2) 选型查询
node .agents/skills/game-sfx-kit/scripts/pick.mjs --cat 6 --dur 0.3-1.0

# 3) 粘贴模板
cp .agents/skills/game-sfx-kit/assets/sfx-template.lua <工程>/lua/  # 再按 §5.1 换 id
```
