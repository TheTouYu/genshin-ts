# GUI 检测评测（CALIBER-v2）· old-both（old(11 版本目录，同帧取最新)）

- 生成时间：2026-10-19 17:11:57
- 命令：`/usr/sbin/python3 .scratch/gui-detect/eval_v2.py --preset old --channel both --d2-val --out .scratch/gui-detect/eval-out/d2val`
- 真值源：``（preset=old）｜帧=7｜原始 JSON 去重前=76
- 通道：both｜模型：`v1.prod`, `v1.train`, `v2.prod`, `v2.train`
- 口径：strict=同类 1:1 贪心匹配（IoU≥0.5，按 score 降序）；legacy=d2.evaluate 原口径（同 kind IoU≥0.5 即命中，非一对一）

## 0. 数据面（含真值覆盖）

| 族 | 帧 | GT 单元 | 有 OCR 的帧 | audit 已跑 | audit≥3 帧 | kind 分布 |
|---|---|---|---|---|---|---|
| game_ui | 2 | 69 | 0 | 0/2 | 0 | tile=20, row=17, icon=11, panel=7, button=6, unknown=4, chip=3, avatar=1 |
| editor | 5 | 451 | 0 | 0/5 | 0 | row=185, button=108, chip=80, panel=35, tile=23, icon=20 |

- 族判定依据：{'provenance': 7}（`layout-rule`=按 layout 文本规则；`default`=无族名，落游戏界面族；`override`=人工指定）
- 非标准 kind（`unknown` 等，**不计入 P/R**）：4 个单元
- 版本覆盖（同帧多版本只取最新）：14 帧；c42_195441←truth-v3（舍弃 truth-v2）；r003_snap_2026-10-19_00-17-26←truth-v8-game（舍弃 truth-v6/truth-v7）；r006_snap_2026-10-19_00-22-19←truth-v8-game（舍弃 truth-v5）；r013_snap_2026-10-19_00-23-53←truth-v8-game（舍弃 truth-v6）

## 1. 总表（strict 1:1）

| 模型 | 帧 | GT | 检出 | TP | FP | FN | P | R | F1 | legacy P | legacy R | p50ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| v1.prod | 7 | 516 | 586 | 127 | 459 | 389 | 0.217 | 0.246 | 0.23 | 0.217 | 0.248 | 45.4 |
| v1.train | 7 | 516 | 717 | 133 | 584 | 383 | 0.185 | 0.258 | 0.216 | 0.192 | 0.26 | 34.6 |
| v2.prod | 7 | 516 | 835 | 170 | 665 | 346 | 0.204 | 0.329 | 0.252 | 0.208 | 0.331 | 70.6 |
| v2.train | 7 | 516 | 1004 | 168 | 836 | 348 | 0.167 | 0.326 | 0.221 | 0.172 | 0.328 | 60.3 |

## 2. 分 kind（CALIBER-v2 ①：row / glyph_icon 单列）

| kind | GT | v1.prod P|R|F1 | v1.train P|R|F1 | v2.prod P|R|F1 | v2.train P|R|F1 | 消失（GT>0 但模型无此类） |
|---|---|---|---|---|---|---|
| panel | 42 | 0.515|0.405|0.453 | 0.296|0.381|0.333 | 0.246|0.405|0.306 | 0.168|0.381|0.234 |  |
| row | 202 | 0.073|0.079|0.076 | 0.058|0.069|0.063 | 0.185|0.277|0.222 | 0.185|0.277|0.222 |  |
| button | 114 | 0.161|0.263|0.2 | 0.13|0.263|0.174 | 0.163|0.263|0.201 | 0.129|0.254|0.172 |  |
| tile | 43 | 0.667|0.791|0.723 | 0.667|0.791|0.723 | 0.419|0.721|0.53 | 0.378|0.721|0.496 |  |
| chip | 83 | 0.345|0.229|0.275 | 0.346|0.337|0.341 | 0.2|0.289|0.236 | 0.124|0.277|0.172 |  |
| icon | 31 | 0.323|0.323|0.323 | 0.244|0.323|0.278 | 0.19|0.387|0.255 | 0.171|0.387|0.238 |  |
| card | 0 | — | — | — | — |  |
| avatar | 1 | 1.0|1.0|1.0 | 0.333|1.0|0.5 | 0.0|0.0|0.0 | 1.0|1.0|1.0 | v2.prod |

## 3. 分族（CALIBER-v2 ②：按族留出/对照）

| 族 | 帧 | GT | v1.prod P|R|F1 | v1.train P|R|F1 | v2.prod P|R|F1 | v2.train P|R|F1 | 族内关键 kind R（strict） |
|---|---|---|---|---|---|---|---|
| game_ui | 2 | 65 | 0.31|0.554|0.398 | 0.271|0.554|0.364 | 0.204|0.569|0.301 | 0.155|0.585|0.245 | row:v1.prod=0.118、row:v1.train=0.118、row:v2.prod=0.235、row:v2.train=0.235、tile:v1.prod=1.0、tile:v1.train=1.0、tile:v2.prod=1.0、tile:v2.train=1.0、icon:v1.prod=0.455、icon:v1.train=0.455、icon:v2.prod=0.455、icon:v2.train=0.455、button:v1.prod=0.833、button:v1.train=0.833、button:v2.prod=0.667、button:v2.train=0.667、panel:v1.prod=0.429、panel:v1.train=0.429、panel:v2.prod=0.429、panel:v2.train=0.429 |
| editor | 5 | 451 | 0.194|0.202|0.198 | 0.166|0.215|0.187 | 0.203|0.295|0.241 | 0.171|0.288|0.215 | row:v1.prod=0.076、row:v1.train=0.065、row:v2.prod=0.281、row:v2.train=0.281、tile:v1.prod=0.609、tile:v1.train=0.609、tile:v2.prod=0.478、tile:v2.train=0.478、icon:v1.prod=0.25、icon:v1.train=0.25、icon:v2.prod=0.35、icon:v2.train=0.35、button:v1.prod=0.231、button:v1.train=0.231、button:v2.prod=0.241、button:v2.train=0.231、panel:v1.prod=0.4、panel:v1.train=0.371、panel:v2.prod=0.4、panel:v2.train=0.371 |

## 4. 单帧几何切片（CALIBER-v2 ④：尺寸/长宽比/对比度/局部平坦度）

**v1.prod**

| kind | 切片 → n / strict R |
|---|---|
| row | aspect/2–6 n=33 R=0.152; aspect/>6 n=168 R=0.065; h/≤32px n=10 R=0.0; h/33–64px n=179 R=0.089; h/>64px n=13 R=0.0; contrast/低 n=67 R=0.104; contrast/中 n=67 R=0.075; contrast/高 n=68 R=0.059; flat/低 n=67 R=0.06; flat/中 n=67 R=0.104; flat/高 n=68 R=0.074 |
| tile | aspect/≤2 n=43 R=0.791; h/>64px n=43 R=0.791; contrast/低 n=14 R=0.786; contrast/中 n=14 R=0.786; contrast/高 n=15 R=0.8; flat/低 n=14 R=0.857; flat/中 n=14 R=0.643; flat/高 n=15 R=0.867 |
| icon | aspect/≤2 n=31 R=0.323; h/≤32px n=7 R=0.0; h/33–64px n=19 R=0.474; h/>64px n=5 R=0.2; contrast/低 n=10 R=0.5; contrast/中 n=10 R=0.4; contrast/高 n=11 R=0.091; flat/低 n=10 R=0.5; flat/中 n=10 R=0.4; flat/高 n=11 R=0.091 |
| chip | aspect/≤2 n=7 R=0.429; aspect/2–6 n=54 R=0.241; aspect/>6 n=22 R=0.136; h/33–64px n=75 R=0.24; contrast/低 n=28 R=0.107; contrast/中 n=27 R=0.148; contrast/高 n=28 R=0.429; flat/低 n=28 R=0.214; flat/中 n=27 R=0.148; flat/高 n=28 R=0.321 |
| button | aspect/≤2 n=88 R=0.25; aspect/2–6 n=11 R=0.364; aspect/>6 n=15 R=0.267; h/≤32px n=8 R=0.125; h/33–64px n=101 R=0.277; h/>64px n=5 R=0.2; contrast/低 n=38 R=0.211; contrast/中 n=38 R=0.289; contrast/高 n=38 R=0.289; flat/低 n=36 R=0.139; flat/中 n=40 R=0.35; flat/高 n=38 R=0.289 |

**v1.train**

| kind | 切片 → n / strict R |
|---|---|
| row | aspect/2–6 n=33 R=0.121; aspect/>6 n=168 R=0.06; h/≤32px n=10 R=0.0; h/33–64px n=179 R=0.078; h/>64px n=13 R=0.0; contrast/低 n=67 R=0.104; contrast/中 n=67 R=0.06; contrast/高 n=68 R=0.044; flat/低 n=67 R=0.06; flat/中 n=67 R=0.09; flat/高 n=68 R=0.059 |
| tile | aspect/≤2 n=43 R=0.791; h/>64px n=43 R=0.791; contrast/低 n=14 R=0.786; contrast/中 n=14 R=0.786; contrast/高 n=15 R=0.8; flat/低 n=14 R=0.857; flat/中 n=14 R=0.643; flat/高 n=15 R=0.867 |
| icon | aspect/≤2 n=31 R=0.323; h/≤32px n=7 R=0.0; h/33–64px n=19 R=0.474; h/>64px n=5 R=0.2; contrast/低 n=10 R=0.5; contrast/中 n=10 R=0.4; contrast/高 n=11 R=0.091; flat/低 n=10 R=0.5; flat/中 n=10 R=0.4; flat/高 n=11 R=0.091 |
| chip | aspect/≤2 n=7 R=0.429; aspect/2–6 n=54 R=0.389; aspect/>6 n=22 R=0.182; h/33–64px n=75 R=0.36; contrast/低 n=28 R=0.286; contrast/中 n=27 R=0.296; contrast/高 n=28 R=0.429; flat/低 n=28 R=0.321; flat/中 n=27 R=0.333; flat/高 n=28 R=0.357 |
| button | aspect/≤2 n=88 R=0.25; aspect/2–6 n=11 R=0.364; aspect/>6 n=15 R=0.267; h/≤32px n=8 R=0.125; h/33–64px n=101 R=0.277; h/>64px n=5 R=0.2; contrast/低 n=38 R=0.211; contrast/中 n=38 R=0.289; contrast/高 n=38 R=0.289; flat/低 n=36 R=0.139; flat/中 n=40 R=0.35; flat/高 n=38 R=0.289 |

**v2.prod**

| kind | 切片 → n / strict R |
|---|---|
| row | aspect/2–6 n=33 R=0.121; aspect/>6 n=168 R=0.304; h/≤32px n=10 R=0.0; h/33–64px n=179 R=0.307; h/>64px n=13 R=0.077; contrast/低 n=67 R=0.478; contrast/中 n=67 R=0.224; contrast/高 n=68 R=0.132; flat/低 n=67 R=0.313; flat/中 n=67 R=0.328; flat/高 n=68 R=0.191 |
| tile | aspect/≤2 n=43 R=0.721; h/>64px n=43 R=0.721; contrast/低 n=14 R=0.643; contrast/中 n=14 R=0.714; contrast/高 n=15 R=0.8; flat/低 n=14 R=0.857; flat/中 n=14 R=0.5; flat/高 n=15 R=0.8 |
| icon | aspect/≤2 n=31 R=0.387; h/≤32px n=7 R=0.0; h/33–64px n=19 R=0.579; h/>64px n=5 R=0.2; contrast/低 n=10 R=0.4; contrast/中 n=10 R=0.4; contrast/高 n=11 R=0.364; flat/低 n=10 R=0.4; flat/中 n=10 R=0.4; flat/高 n=11 R=0.364 |
| chip | aspect/≤2 n=7 R=0.143; aspect/2–6 n=54 R=0.315; aspect/>6 n=22 R=0.273; h/33–64px n=75 R=0.307; contrast/低 n=28 R=0.214; contrast/中 n=27 R=0.259; contrast/高 n=28 R=0.393; flat/低 n=28 R=0.25; flat/中 n=27 R=0.37; flat/高 n=28 R=0.25 |
| button | aspect/≤2 n=88 R=0.25; aspect/2–6 n=11 R=0.364; aspect/>6 n=15 R=0.267; h/≤32px n=8 R=0.0; h/33–64px n=101 R=0.297; h/>64px n=5 R=0.0; contrast/低 n=38 R=0.211; contrast/中 n=38 R=0.263; contrast/高 n=38 R=0.316; flat/低 n=36 R=0.139; flat/中 n=40 R=0.3; flat/高 n=38 R=0.342 |

**v2.train**

| kind | 切片 → n / strict R |
|---|---|
| row | aspect/2–6 n=33 R=0.121; aspect/>6 n=168 R=0.304; h/≤32px n=10 R=0.0; h/33–64px n=179 R=0.307; h/>64px n=13 R=0.077; contrast/低 n=67 R=0.478; contrast/中 n=67 R=0.224; contrast/高 n=68 R=0.132; flat/低 n=67 R=0.313; flat/中 n=67 R=0.328; flat/高 n=68 R=0.191 |
| tile | aspect/≤2 n=43 R=0.721; h/>64px n=43 R=0.721; contrast/低 n=14 R=0.643; contrast/中 n=14 R=0.714; contrast/高 n=15 R=0.8; flat/低 n=14 R=0.857; flat/中 n=14 R=0.5; flat/高 n=15 R=0.8 |
| icon | aspect/≤2 n=31 R=0.387; h/≤32px n=7 R=0.0; h/33–64px n=19 R=0.579; h/>64px n=5 R=0.2; contrast/低 n=10 R=0.4; contrast/中 n=10 R=0.4; contrast/高 n=11 R=0.364; flat/低 n=10 R=0.4; flat/中 n=10 R=0.4; flat/高 n=11 R=0.364 |
| chip | aspect/≤2 n=7 R=0.143; aspect/2–6 n=54 R=0.315; aspect/>6 n=22 R=0.227; h/33–64px n=75 R=0.293; contrast/低 n=28 R=0.214; contrast/中 n=27 R=0.259; contrast/高 n=28 R=0.357; flat/低 n=28 R=0.25; flat/中 n=27 R=0.37; flat/高 n=28 R=0.214 |
| button | aspect/≤2 n=88 R=0.239; aspect/2–6 n=11 R=0.364; aspect/>6 n=15 R=0.267; h/≤32px n=8 R=0.0; h/33–64px n=101 R=0.287; h/>64px n=5 R=0.0; contrast/低 n=38 R=0.211; contrast/中 n=38 R=0.263; contrast/高 n=38 R=0.289; flat/低 n=36 R=0.139; flat/中 n=40 R=0.3; flat/高 n=38 R=0.316 |

## 5. 错类矩阵（IoU≥0.5 但 kind 不同 → 同构错类）

- `v1.prod`：共 18 次；chip→button:13、row→button:2、row→card:1、chip→row:1、button→chip:1
- `v1.train`：共 52 次；chip→button:28、chip→icon:5、icon→panel:4、icon→chip:3、icon→button:2、icon→avatar:2、row→button:2、avatar→panel:1
- `v2.prod`：共 17 次；chip→button:4、button→chip:3、tile→card:3、button→icon:2、avatar→icon:1、avatar→tile:1、tile→chip:1、icon→button:1
- `v2.train`：共 63 次；tile→card:16、tile→chip:11、button→chip:8、chip→button:7、icon→button:5、button→icon:4、avatar→chip:3、avatar→tile:2

## 6. 单帧 vs 多帧口径（CALIBER-v2 ④：N 帧出现率 + 位置抖动 + P/R 比值）

## 7. 逐帧明细（真值覆盖 + 命中）

**v1.prod**

| 帧 | 族 | GT | 计分 | unk | audit 未覆盖 | 检出 | TP | FP | FN | P | R | ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| r003_snap_2026-10-19_00-17-26 | game_ui | 51 | 47 | 4 | — | 57 | 35 | 22 | 12 | 0.614 | 0.745 | 431.0 |
| r016_snap_2026-10-19_00-24-17 | game_ui | 18 | 18 | 0 | — | 59 | 1 | 58 | 17 | 0.017 | 0.056 | 39.0 |
| r026_snap_2026-10-19_00-27-05 | editor | 44 | 44 | 0 | — | 100 | 8 | 92 | 36 | 0.08 | 0.182 | 45.4 |
| r028_snap_2026-10-19_00-27-49 | editor | 117 | 117 | 0 | — | 101 | 26 | 75 | 91 | 0.257 | 0.222 | 52.1 |
| r034_snap_2026-10-19_00-31-33 | editor | 128 | 128 | 0 | — | 98 | 36 | 62 | 92 | 0.367 | 0.281 | 51.1 |
| r041_snap_2026-10-19_00-36-21 | editor | 74 | 74 | 0 | — | 90 | 4 | 86 | 70 | 0.044 | 0.054 | 41.7 |
| r045_snap_2026-10-19_00-38-06 | editor | 88 | 88 | 0 | — | 81 | 17 | 64 | 71 | 0.21 | 0.193 | 42.3 |

**v1.train**

| 帧 | 族 | GT | 计分 | unk | audit 未覆盖 | 检出 | TP | FP | FN | P | R | ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| r003_snap_2026-10-19_00-17-26 | game_ui | 51 | 47 | 4 | — | 72 | 35 | 37 | 12 | 0.486 | 0.745 | 35.4 |
| r016_snap_2026-10-19_00-24-17 | game_ui | 18 | 18 | 0 | — | 61 | 1 | 60 | 17 | 0.016 | 0.056 | 34.1 |
| r026_snap_2026-10-19_00-27-05 | editor | 44 | 44 | 0 | — | 119 | 9 | 110 | 35 | 0.076 | 0.205 | 34.6 |
| r028_snap_2026-10-19_00-27-49 | editor | 117 | 117 | 0 | — | 119 | 27 | 92 | 90 | 0.227 | 0.231 | 32.8 |
| r034_snap_2026-10-19_00-31-33 | editor | 128 | 128 | 0 | — | 117 | 39 | 78 | 89 | 0.333 | 0.305 | 34.7 |
| r041_snap_2026-10-19_00-36-21 | editor | 74 | 74 | 0 | — | 115 | 4 | 111 | 70 | 0.035 | 0.054 | 34.4 |
| r045_snap_2026-10-19_00-38-06 | editor | 88 | 88 | 0 | — | 114 | 18 | 96 | 70 | 0.158 | 0.205 | 34.8 |

**v2.prod**

| 帧 | 族 | GT | 计分 | unk | audit 未覆盖 | 检出 | TP | FP | FN | P | R | ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| r003_snap_2026-10-19_00-17-26 | game_ui | 51 | 47 | 4 | — | 76 | 35 | 41 | 12 | 0.461 | 0.745 | 118.4 |
| r016_snap_2026-10-19_00-24-17 | game_ui | 18 | 18 | 0 | — | 105 | 2 | 103 | 16 | 0.019 | 0.111 | 64.9 |
| r026_snap_2026-10-19_00-27-05 | editor | 44 | 44 | 0 | — | 53 | 10 | 43 | 34 | 0.189 | 0.227 | 61.6 |
| r028_snap_2026-10-19_00-27-49 | editor | 117 | 117 | 0 | — | 158 | 38 | 120 | 79 | 0.241 | 0.325 | 72.7 |
| r034_snap_2026-10-19_00-31-33 | editor | 128 | 128 | 0 | — | 181 | 64 | 117 | 64 | 0.354 | 0.5 | 91.5 |
| r041_snap_2026-10-19_00-36-21 | editor | 74 | 74 | 0 | — | 147 | 8 | 139 | 66 | 0.054 | 0.108 | 66.3 |
| r045_snap_2026-10-19_00-38-06 | editor | 88 | 88 | 0 | — | 115 | 13 | 102 | 75 | 0.113 | 0.148 | 70.6 |

**v2.train**

| 帧 | 族 | GT | 计分 | unk | audit 未覆盖 | 检出 | TP | FP | FN | P | R | ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| r003_snap_2026-10-19_00-17-26 | game_ui | 51 | 47 | 4 | — | 117 | 36 | 81 | 11 | 0.308 | 0.766 | 49.2 |
| r016_snap_2026-10-19_00-24-17 | game_ui | 18 | 18 | 0 | — | 128 | 2 | 126 | 16 | 0.016 | 0.111 | 50.0 |
| r026_snap_2026-10-19_00-27-05 | editor | 44 | 44 | 0 | — | 62 | 10 | 52 | 34 | 0.161 | 0.227 | 58.2 |
| r028_snap_2026-10-19_00-27-49 | editor | 117 | 117 | 0 | — | 184 | 37 | 147 | 80 | 0.201 | 0.316 | 63.1 |
| r034_snap_2026-10-19_00-31-33 | editor | 128 | 128 | 0 | — | 201 | 64 | 137 | 64 | 0.318 | 0.5 | 72.9 |
| r041_snap_2026-10-19_00-36-21 | editor | 74 | 74 | 0 | — | 172 | 6 | 166 | 68 | 0.035 | 0.081 | 72.6 |
| r045_snap_2026-10-19_00-38-06 | editor | 88 | 88 | 0 | — | 140 | 13 | 127 | 75 | 0.093 | 0.148 | 60.3 |

