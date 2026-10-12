# 虹猫蓝兔七侠传 Flash SWF 考古台账

- 日期：2026-10-12　执行：SWF 取材考古（只取文件+记录出处）
- 目标：国产 Flash 横版动作/射击游戏《虹猫蓝兔七侠传》原版 SWF（复刻&再创&升级项目取材）
- 方法：curl 直连（国内站 `--noproxy '*'`）+ 代理 127.0.0.1:7890（archive.org/flashpoint）；魔数校验 FWS/CWS/ZWS

## 一、已获取文件（全部有效，存于 `../swf/`）

| # | 文件名 | 大小(bytes) | md5 | 魔数 | 出处页面 | SWF 直链 |
|---|--------|------------|-----|------|----------|----------|
| 1 | 虹猫蓝兔七侠传-4399-9663_2.swf | 1,630,169 | 0406767dd7e027fce347a2b775dc0b6c | CWS(SWF v6) | https://www.4399.com/flash/9663_2.htm（页题：虹猫蓝兔七侠传小游戏,在线玩,4399小游戏） | http://s1.4399.com:8080/4399swf/upload_swf/ftp/20081128wen/5.swf |
| 2 | 虹猫蓝兔闯天涯-4399-9666_3.swf | 3,223,525 | 3b5f53d589c89604a154c69405f398fb | CWS | https://www.4399.com/flash/9666_3.htm | http://s1.4399.com:8080/4399swf/upload_swf/ftp6/dushen/20110818/25.swf |
| 3 | 虹猫蓝兔之拯救蓝兔-4399-9678_2.swf | 782,925 | b4de1bbee6359f0db9948ec1c80264a8 | CWS | https://www.4399.com/flash/9678_2.htm | http://s1.4399.com:8080/4399swf/upload_swf/ftp/20081128wen/12.swf |
| 4 | 虹猫蓝兔怪物岛-4399-5278_3.swf | 1,319,579 | 4dbe4e48adcdf4b6b0e6525f964dabf0 | CWS | https://www.4399.com/flash/5278_3.htm（注意：flash/6045_3.htm 同 md5 同文件，两个游戏 ID 指向同一文件） | http://s1.4399.com:8080/4399swf/upload_swf/ftp/20070513/3.swf（6045 走 /ftp/20070522/16.swf，内容相同） |
| 5 | 虹猫蓝兔乐翻天-4399-9679_3.swf | 2,463,262 | 0e5c9467680f6bc1a1bd931b53192f29 | CWS | https://www.4399.com/flash/9679_3.htm | http://s1.4399.com:8080/4399swf/upload_swf/ftp/20081128wen/13.swf |

### 玩法线索与身份证据
1. **七侠传（主目标）**：横版动作。舞台 400x250、25fps、30帧主时间轴；解压后字符串含剧情文本「黑心帝国/红蜘蛛/灰蓝魔神/灵动精灵就是我/你们毁了我的白色机体」（七侠传角色与魔教势力）；**内嵌官网 `http://www.hmlt.cn`**（虹猫蓝兔官方域名）；另有 B 站通关视频《虹猫蓝兔七侠传小游戏通关(蓝兔)》(2018-09-26) 佐证为可通关动作游戏。加载器含 `getBytesLoaded/percent_load`（带进度条 loading）。
2. **闯天涯**：动作冒险类。内含**在线注册/分数上传系统**，上传端点 `http://kids.greatdreams.cn/flashpai.do`（greatdreams.cn=宏梦卡通域名→官方出品痕迹）；字符串「返回游戏/您的分数/分数上传中/请输入您的生日」。
3. **拯救蓝兔**：玩法待确认（ActionScript 深度压缩，字符串仅字体名：迷你简雪峰/海韵/卡通/彩蝶）。标题「之拯救蓝兔」属动作向系列命名。
4. **怪物岛**：横版跳跃平台类。字符串 `jump_check/damage_score_m/Now Loading`，且内嵌 `http://www.maplestory.com/maple_game_end`（冒险岛式平台跳跃参照）。
5. **乐翻天**：含 score1~score100000 记分板系统，疑为迷你游戏合集/休闲类（附带收集，非动作主目标）。

## 二、4399 下载方法（可复现，2026-10-12 实测有效）
```
# webServer 定义在伪装成 gif 的 JS 里：
curl -s --noproxy '*' -A '<浏览器UA>' https://www.4399.com/js/server.gif
# → var webServer = "http://s1.4399.com:8080/4399swf";
# 游戏页(GB2312)内联 var str1='<相对路径>'，完整 URL = webServer + str1：
curl -s --noproxy '*' -A '<浏览器UA>' -H 'Referer: http://www.4399.com/' \
  "http://s1.4399.com:8080/4399swf/upload_swf/ftp/20081128wen/5.swf" -o out.swf
# 校验：head -c 3 → CWS/FWS/ZWS
```
- 老游戏页 URL 形如 `/flash/{id}_{n}.htm`（n=1..3 为版本位；9663 只有 _2 有效，9666 只有 _3，9678 只有 _2）
- 页面为 GB2312：grep 中文前先 `iconv -f GB18030 -t UTF-8`
- 站内搜索端点：`so2.4399.com/search/search.php?k=<词>`（so.4399.com 已死）

## 三、4399 虹猫蓝兔全系列图谱（含未下载的休闲类）
9659 滑滑板 / 9660+21433 连连看(+2) / **9663 七侠传** / **9666 闯天涯** / 9668 大家一起跳 / **9678 之拯救蓝兔** / **9679 乐翻天** / 9682 逃出迷宫 / 9685+34470 拼图 / **5278+6045 怪物岛** / 62402 找茬 / 23907 汉堡店 / 9662 虹猫黄金矿工（粗体=已下载）
- 同批上传目录 `/upload_swf/ftp/20081128wen/`：3.swf（184,119b CWS，无中文字符串，**未识别**，暂存 /tmp/probe/）、4.swf（532,645b）=黄金矿工玩法（「用您的爪手和绳索从矿脉中挖取金子…特别版」），疑为 9662 虹猫黄金矿工，非动作目标未入库。

## 四、7k7k 线索（未取到，渠道已尽）
- 专题页仍活：https://news.7k7k.com/hongmaolantu/index_rec_1.html（列出全系列：七侠传 13798/15740 两版、闯天关 15548、冒险岛 14304、逃出迷宫 18583、拯救蓝兔 18038、滑滑板 15602、连连看 15747 等）
- 游戏页 `www.7k7k.com/flash/{id}.htm` 现网全部 **404**
- Wayback 2008-03-23 快照（web.archive.org/web/20080323003158/http://www.7k7k.com/flash/13798.htm，页题「虹猫蓝兔七侠传小游戏 - 7k7k在线小游戏」）还原出当年 SWF 地址：**`http://pkflash.7k7k.com/jf/60hmlt/main.swf?t=14&ads=http://pk.7k7k.com/send.asp`**
- 该地址两条路都死：`pkflash.7k7k.com` 无 DNS（现网死）；Wayback CDX 查 `pkflash.7k7k.com/jf/60hmlt*` = `[]`（从未存档）
- 结论：7k7k 版（可能是更早/不同 build）目前无公开渠道，仅存页面证据

## 五、站点死活与封锁情况（2026-10-12 实测）
| 站点/服务 | 状态 |
|---|---|
| www.4399.com | ✅ 活；游戏页+老 CDN `s1.4399.com:8080/4399swf` 活；s2~s8/sda/sxiao 等 CDN 全死 |
| www.7k7k.com | ✅ 活，但老 flash 游戏页全 404；news.7k7k.com 专题静态页活 |
| xiaoyouxi.2345.com | ✅ 活（聚合模式：游戏详情页内 `go["4399"]="http://www.4399.com/flash/9663_2.htm"` 直接跳 4399，不自托管 swf） |
| xiaohei.com | 游戏页活但 swf 链接假（`/d/file/...swf` 下载返回 HTML） |
| kamyouxi.com | ❌ 404 |
| cn.bing.com | curl 降级：不同查询（含 site:）返回雷同结果，operator 失效，不可用于精确定位 |
| m.baidu.com | ❌ 验证码（wappass）；www.baidu.com 同样不可 curl |
| sogou.com | ✅ curl 可用真实搜索；结果跳转 `/link?url=` 需 GET 解析 `URL='...'` |
| web.archive.org | ⚠️ 代理出口 IP 被反爬封锁（"suspected abusive bot traffic"）；直连 000（CN 屏蔽）；CDX API 仍可用 |
| flashpointarchive.org | ✅ 活；搜索参数为 `?query=`（不是 search） |

## 六、Flashpoint 收录情况
**未收录**。`https://flashpointarchive.org/search?query=hongmao` 与 `?query=虹猫蓝兔`（URL 编码）均 0 结果（2026-10-12 实测）。api.flashpointarchive.org 无 DNS 记录；站点搜索为服务端渲染（结果在 `.fp-search-result` 元素），可复核。

## 七、复刻取材备注
- 主目标七侠传已到手（4399 版，2008-11-28 上传批次）；7k7k 版（2007 即存在，jf/60hmlt 目录）为另一 build 的可能性未排除，但当前无渠道。
- SWF 内嵌官方域名（hmlt.cn / kids.greatdreams.cn）表明这批为宏梦系授权/官方制作而非纯山寨。
- 动作向兄弟作（闯天涯/拯救蓝兔/怪物岛）一并入库，可作玩法对比取材。
