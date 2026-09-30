# 千星奇域 GitHub 生态登记（7.1 时代）

> 状态：**当前实现**（2026-09-29 搜索快照）｜来源：GitHub API 搜索 `miliastra`（85）/`千星奇域`（63，URL 编码）/`genshin ugc lua`，走代理 127.0.0.1:7890
> 用途：7.1 生态位地图；结合点分析见 `沙箱模拟器研究.md`

## S 级（本轮已用或直接服务 7.1 Lua 轴）

| 仓库 | ★ | 定位 |
|---|---|---|
| [1475505/miliastra-beyond-simulator](https://github.com/1475505/miliastra-beyond-simulator) | 34 | 沙箱模拟器（已精读，见研究笔记）；作者=神奇嘟嘟可 |
| [1475505/Miliastra-knowledge](https://github.com/1475505/Miliastra-knowledge) | 9 | **千星相关文档子仓库**=模拟器 `../knowledge/` 上游（fact.md/pitfalls.md/ui 数据结构），真机证据库 |
| [DreamedWorker/miliastra-lua-types](https://github.com/DreamedWorker/miliastra-lua-types) | 6 | **客户端 Lua UI 脚本公共 API 的 LuaLS 类型定义**（=官方 API 文档的类型化形态，B站 BV1dVau6TE2q 同源） |
| [1475505/Miliastra-toolbox](https://github.com/1475505/Miliastra-toolbox) | 65 | 千星沙箱知识库问答 MCP+Skill（不含 lua 内容）；另有 [dsh-plugin-miliastra-toolbox](https://github.com/1475505/dsh-plugin-miliastra-toolbox) ★13（DSH 插件形态）、[Miliastra-toolbox-primitive-shape](https://github.com/1475505/Miliastra-toolbox-primitive-shape) ★11（图片转UI/装饰物拼字） |

## A 级（工具链/格式，与我方 injector·编译链相关）

| 仓库 | ★ | 定位 |
|---|---|---|
| [AyayaXiaowang/Ayaya_Miliastra_Editor](https://github.com/AyayaXiaowang/Ayaya_Miliastra_Editor) | **309** | **生态最高星**：Python 代码描述节点图→内置引擎解析/验证/自动排版→自动化脚本落真实编辑器（与 genshin-ts 同生态位的不同语言实现！） |
| [Wu-Yijun/...Code-Node-Editor-Pack](https://github.com/Wu-Yijun/Genshin-Impact-Miliastra-Wonderland-Code-Node-Editor-Pack) | 122 | 节点图本地/网页编辑器+转换器（我方 `src/thirdparty/` 已引用其 node_data） |
| [Columbina-Dev/WebMiliastraNodesEditor](https://github.com/Columbina-Dev/WebMiliastraNodesEditor) | 61 | **网页节点图编辑器（不启动原神）**——与沙箱模拟器互补的「节点图侧」模拟环境 |
| [script-1024/genshin-miliastra-file-format](https://github.com/script-1024/genshin-miliastra-file-format) | 33 | **GIA/GIL 文件格式记录文档**——对我方 injector/folder.ts 直接相关的独立逆向 |
| [ystyle/genshin-starcraft-mcp](https://github.com/ystyle/genshin-starcraft-mcp) | 8 | 《原神千星奇域·综合指南》MCP 服务器（官方 wiki 知识库化） |
| [FUNFORTIME/ExoticRealmTools](https://github.com/FUNFORTIME/ExoticRealmTools) | 54 | 千星常用工具及组件 |

## B 级（特定用途/小工具）

Ayn1631/Miliastra-Tools ★19 工具仓库｜kj415j45/octavia ★13 stages 工具｜garrydu/miliastra ★12 游戏代码｜XingNian-www/Miliastra-Wonderland-Music ★9 点歌BOT｜VanillaNahida/dx11_tex_dbg_for_mw ★8 DX11 纹理调试（自定义头像向）｜saberLLK/Custom-UGC-Avatar ★7 头像替换（流量拦截）｜script-1024/MiliastraUtility ★5｜kokokokomi222/mw_doc ★4 非官方文档｜RayRiver/MiliastraConfigTool ★4 配置转换｜RoundNailoong/UgcSdkServer ★3

## 官方综合指南 wiki 站（act.mihoyo.com/ys/ugc/tutorial/detail/&lt;id&gt;）详情页 ID 表

> SPA 站（v2.5.1_apps-ugc-wiki-cn），curl 只回 shell，需浏览器渲染抓取。本轮已爬两页（✅）。

| 页面 | ID | 状态 |
|---|---|---|
| **客户端控件API文档**（48.5K 全文） | `mhtakr07vej4` | ✅ 已镜像 `官方API文档-客户端控件.md` |
| **客户端控件和客户端脚本**（教程） | `mhbgxf0nynww` | ✅ 已镜像 `官方教程-客户端控件和客户端脚本.md` |
| 概念介绍 | `mhdtk89yhd6q` | 待按需 |
| 高级概念 | `mheybl0mdcqo` | 待按需 |
| 界面控件组管理 | `mhewyi0fjfvs` | 待按需 |
| 附录 | `mhsumxr9cf3y` | 待按需 |
| 素材库 | `mhwylormozcm` | 待按需 |
| 经典模式角色编号一览 | `mh4imrrhzdzi` | 待按需 |
| 容器节点控件 | `mh3qqq9xc102` | 待按需 |
| 文本框界面控件 | `mhnltrr3g966` | 待按需 |
| 文本视窗控件 | `mhv38jig94kk` | 待按需 |
| 图片控件 | `mh2oih9jou22` | 待按需 |
| 界面动效控件 | `mh2iyk9fa4gy` | 待按需 |
| 全屏界面动效控件 | `mhbn4i09l5ns` | 待按需 |
| 预设按钮控件 | `mhdbkf04v6y8` | 待按需 |
| 按键提示 | `mh265urgupye` | 待按需 |
| 光标检测区域控件 | `mhd4fxr5v6la` | 待按需 |
| 网格视窗 | `mhfkrr0i7gds` | 待按需 |
| 模板引用控件 | `mhucb6reudwm` | 待按需 |
| 客户端控件容器 | `mhlz2lrly3dq` | 待按需 |

## 生态位速读

- **7.1 前**的生态主流=节点图工具链（Ayaya Editor 309★/Node-Editor-Pack 122★/WebEditor 61★ 与 genshin-ts 343★ 同域竞争-互补）
- **7.1 后**新增 Lua 域：沙箱模拟器（beyond-simulator）+ 类型定义（miliastra-lua-types）+ 知识库（Miliastra-knowledge/-toolbox）——**神奇嘟嘟可（1475505）一人占四仓，是该域当前最大基建者**
- 官方 wiki 站（🐴 综合指南）是权威文档面，已有两个第三方 MCP 化尝试
