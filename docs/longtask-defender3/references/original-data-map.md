# 原作资料映射：怎么提取、每张表是什么、我们怎么用

> 状态：当前实现（基于 2026-10-27 实测，脚本幂等可重跑）
> 来源：`~/re-targets/defender3/`（APK 解包 + 导出）+ 原生符号
> 最近校验：2026-10-28
> 读法：要做设计时查 §二（表语义）；要重新提取时查 §一/§三/§四。

---

## 一、提取流水线（一条命令重建全部资料）

```bash
# 0) 前提：手机已连 adb（无线优先）
adb connect 192.168.5.139:38707        # 端口见手机「无线调试」页

# 1) 拉 APK
adb pull /data/app/.../base.apk ~/re-targets/defender3/apk/defender3-2.7.1-base.apk

# 2) 解包 + 导出表/素材（幂等）
cd ~/re-targets/defender3
unzip -oq apk/defender3-2.7.1-base.apk -d extracted
python3 tools/extract_assets.py        # → out/{tables,images,atlas,animations,sounds}
python3 tools/data_digest.py           # → analysis/data_digest.md（67 表结构摘要）

# 3) 查任意表
column -t -s$'\t' out/tables/monster.tsv | head
```

**产物清单**：`out/tables/*.tsv`（67 表 + `_index.tsv`）、`out/images/`（1160 张）、`out/atlas/`（1010 帧）、
`out/animations/`（DragonBones 82 文件）、`out/sounds/`（58 个）。

---

## 二、67 张表 → 语义 → 我们用不用

### 2.1 战斗核心（必看）

| 表 | 行数 | 它是什么 | 我们要借鉴什么 |
|---|---|---|---|
| `monster` | 1207 | 每只怪的全属性（血/攻/攻速/移速/射程/体型/5 种抗性/4 系魔抗/防御） | **属性维度表**：我们的怪也照这个维度建（可以砍到 8 个字段） |
| `monster_name` | 20 | 模型 → 中文名 | 命名参考（青蛙/蝴蝶/萨满/食人花/幽魂） |
| `monster_formation` | 18 | 队形（`formation_fix` 偏移 + `formation_time` 时间） | **波次队形**：13 种队形是"刷怪不呆板"的关键 |
| `stage_info` | 156 | 关卡曲线（`hp_rate` 1→690、`single_cd` 400→2000ms、`attack_rate`、`formation_id`、精英怪） | **难度旋钮**：hp_rate/间隔/攻击率三件套 |
| `stage_custom` / `stage_custom_v2` | 288 / 480 | 剧本化刷怪（t=7s 刷 3 只青蛙；Boss 波次） | **剧本高潮**：普通波 + 剧本波混合 |
| `battle` / `battle_v2` / `battle_info` / `battle_info_v2` | 48/80/12/20 | 对战（存活）模式的难度与杯数 | 我们的"无尽/对战"模式可抄这套（去掉 PvP） |
| `boss_param` | 50 | Boss 技能参数（`charge_rate`、`skill_param`） | Boss 行为参数化 |

### 2.2 玩家成长（必看）

| 表 | 行数 | 它是什么 | 我们要借鉴什么 |
|---|---|---|---|
| `project` | 40 | 弓：atk 20→480、spd 1600→5900、每级成长、进化链 | **武器成长曲线**（5 阶 × 4 系） |
| `project_show_v2` | 11 | 每把弓解锁的 4 个技能 + 解锁关卡 | **武器=技能组**的设计（换武器=换玩法） |
| `skill` / `skill_v2` | 54 / 62 | 技能：魔力/冷却/范围/参数/5 级/突破/进化 | **魔力预算**：30~110 蓝耗形成"带几个技能"的取舍 |
| `skill_name` | 62 | 技能中文名与描述 | **3D 化的素材**（石墙/火墙/冰霜/龙卷风…） |
| `super_skill` | 48 | 弓魂（atk/spd/special 三围） | 长线三围成长 |
| `treasure` | 220 | 宝物（4 系 × 11 档，星级/等级/进化） | **长线专精**（可砍到 40 条） |
| `item` / `item_custom` / `item_name` | 47/104/26 | 材料（矿物/素材/精华，带 exp） | 材料体系（同属性 +50% 锻造） |
| `player_level` | 99 | 等级经验曲线与奖励 | 账号等级 |
| `tower_param` | 12 | 塔：射程/param1/param2 | 塔的极简参数化（我们可照抄"射程+两参数"） |

### 2.3 外围系统（按需）

| 表 | 行数 | 它是什么 | 取舍 |
|---|---|---|---|
| `arena_info` / `arena_custom` | 200 / 800 | 竞技场（60 秒/场，200 档） | 可做"无限挑战"排行榜 |
| `world_boss` + 两个 reward 表 | 7 + 8 + 32 | 世界 Boss（按关卡段匹配） | 可做每周 Boss |
| `quest` / `quest_reward` / `quest_name` | 15 / 75 / 15 | 任务（15 类 × 5 档） | 可做日常任务 |
| `achv` / `achv_name` | 16 / 16 | 成就 | 可做成就 |
| `shop_item` v2~v5 / `shop_pool` / `spinner` | 10~26 / 20 / 48 | 商店/抽奖（含真实价格 $1.99） | **不要内购**，改游戏内货币 |
| `gift_pack*` / `festival_pack*` | 6 族 / 4 族 | 礼包（限时活动） | 改"每日签到"即可 |
| `daily_reward` / `daily_reward_christmas` | 28 / 30 | 每日签到 | 可抄 28 天签到的节奏 |
| `tutorial` / `tutorial_resist` | 49 / 48 | 新手引导 48 步（含操作原文） | **必读**：操作契约 |
| `text` | 175 | UI 文案 | 借鉴命名与措辞 |
| `bulletin_board` / `battle_season_*` | 0 / 2 / 24 | 公告板/赛季 | 可砍 |

---

## 三、符号挖掘（验证"表没抄全"）

```bash
cd ~/re-targets/defender3/extracted
# 全部游戏类名（去掉 cocos/std/openssl 噪声）
nm -D --defined-only -C lib/arm64-v8a/libcocos2dcpp.so \
  | awk '{print $3}' | grep '::' | sed 's/\(.*\)::.*/\1/' \
  | grep -vE '^(std|cocos2d|__gnu|rapidjson|OpenSSL)' | sort -u
# UI 系统：*Panel/*Popup/*Scene；服务：*Service/*Manager/*Controller；配置：*Config
```

**已知系统类**（2026-10-27 实测）：`BattleService`、`MonsterController`、`TowerParamConfig`、`BattleModelManager`、
`ArcheryInfoPanel / ArcheryUpgradePopup / ArcheryEvolvePopup`、`MaterialPanel`、`Giftpack*Panel`（8 种礼包面板）、
`DungeonScene/Controller/Saver/Service`、`HonorScene/HonorPanel`（成就）、`RankItem`、`PassiveSkillManager`、
`PlayerThewSaver`（体力）、`AdvCustomConfig`（广告）、`BulletManager`。

> 用法：设计某个系统前先 grep 类名，确认原作有没有做过、叫什么。

---

## 四、教程文本（操作契约）

```bash
python3 - <<'PY'
import json
zh=json.load(open('/home/h/re-targets/defender3/extracted/assets/data/data_ch.json',encoding='utf-8'))
for r in zh['tutorial']: print(r['group'], r['id'], r['des'].replace('\n',' / '))
PY
```

已确认的关键操作：**长按/滑动连续射箭，手指位置=目标**；**拖动魔法图标，松手位置=目标点**；
**1 水晶=100 魔力**；**战斗中可切弓**（技能随之切换）。

---

## 五、素材解码要点

- 998 张 `.png` 里 **141 张是 `zcim` 包装**：假 PNG 头 + `zcim` chunk + `"Zhouyan's Compressed Image"` 标记 + JPEG 负载。
  解码方法：找 JPEG 起点 `FF D8 FF` 切到文件尾再 `Image.open`。
- 图集是 TexturePacker XML plist；动画是 **DragonBones 2.2** 骨架 XML（`assets/flash/` 的目录名由此而来）。
- 音效 58 个 mp3，可按 `assets/sound/` 目录名分类。

---

## 六、值得借鉴的 10 条设计（原作确实做对的）

1. **关卡血量排在阈值附近**：让前几次投资必然"少一箭"（关 1：20 攻 3 箭 / 26 攻 2 箭）。
2. **箭速是独立的手感维度**：1600→5900，和伤害分开成长。
3. **同属性材料 +50%**：用材料规则强迫玩家"选系"，把数值选择变成身份承诺。
4. **武器=技能组**：换弓=换 4 个技能，切换本身就是玩法（`project_show_v2`）。
5. **魔力预算**：30~110 的蓝耗差，决定"带几个主动技能"。
6. **波次队形**：13 种队形 + 时间表，让刷怪不呆板（`monster_formation`）。
7. **剧本波**：普通波之外插剧本（t=7s 3 只青蛙、t=35s 2 只精英），制造节奏起伏。
8. **精英怪半路插入**：`special_monster` + `special_amount`，不是只有关底 Boss。
9. **难度三旋钮**：`hp_rate`（硬度）/`single_cd`（密度）/`attack_rate`（威胁），互相独立可调。
10. **技能梯度**：同一技能 3 档（小/中/大范围），让"升级技能"有明确预期（如石墙 3s/4s/5s）。

## 七、不要借鉴的

| 原作做法 | 为什么不抄 |
|---|---|
| 4 系平铺但 `mdef_*` 大量为 0 | 克制感形同虚设；我们要做真克制环 |
| 236 件装备/技能（大量线性 +x%） | 内容产能不够，且质变密度低 |
| 内购/礼包/抽卡 | 千星没有内购；改游戏内货币 + 签到 |
| 实时 PvP（对战模式） | 千星做不到；改排行榜/无尽 |
| 156 关的陡峭曲线（hp_rate 1→690） | 前期就出现 690 倍血量，玩家感知断层；我们按关手工给 HP |
