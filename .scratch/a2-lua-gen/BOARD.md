# A2 预研看板：TS→Lua 客户端脚本生成器可行性

> 建板：2026-09-30（用户裁决「A2 开」）
> 性质：**预研**（知识先行，代码后置）——产出决策依据（设计文档 + PoC 证据 + 可行性报告），不是正式立项
> 设计权威：本板 + `research/a2-lua-gen/`（无独立设计稿，02 票产出 DESIGN.md 后升级）
> 背景：官方 7.1 开放客户端 Lua（裁剪沙箱）；社区类型注解生态在位（miliastra-lua-types）；
> AI 无文档会编造 API（BV1uXag68Edh 实证）→ 类型与文档是刚需，TS 类型系统是 genshin-ts 的核心资产

## 资产速查（高频引用）

| 资产 | 路径 | 说明 |
|---|---|---|
| 官方 API 文档镜像 | `research/千星知识图谱/learn-lua71/官方API文档-客户端控件.md` | 48.5K 全文（11359 行），源 act.mihoyo.com wiki `mhtakr07vej4` |
| 官方教程镜像 | `research/千星知识图谱/learn-lua71/官方教程-客户端控件和客户端脚本.md` | 挂载/模板/上传规则 |
| 沙箱模拟器 | `/home/h/miliastra-beyond-simulator` | 测试床；lua-runtime=fengari；契约 `client/lua-runtime/docs/observed-contract.md`（真机 7.0.50，20 条） |
| 类型注解生态 | github.com/DreamedWorker/miliastra-lua-types | .d.lua，=官方文档的类型化形态（对照用） |
| 知识图谱 | `docs/knowledge-graph/d/d3d-客户端Lua脚本.md` | HR-01~23 契约 + 调用三分法 |
| 能力缺口 | `research/千星知识图谱/learn-lua71/能力缺口.md` | A2 定义源（§二战略层） |
| 关键 wire | GIA `GraphUnit.script=35` → `ScriptMapping{id,name,file_path,source}` | Lua 源码直接进 GIA（模拟器 codec.js 实证） |

## 当前前沿

**#02 TS→Lua 映射设计**（待开工）

## 票据清单

| # | 票名 | Blocked by | 状态 |
|---|---|---|---|
| 02 | TS→Lua 映射设计 | 01 | ⬜ |
| 03 | PoC 转换器原型 | 02 | ⬜ |
| 04 | 沙箱模拟器验证 | 03 | ⬜ |
| 05 | 可行性报告与立项建议 | 04 | ⬜ |

## 已完成（划掉区）

- ~~#01 API 面盘点~~（2026-09-30，`api面清单.md` 14 节 + 类型库对照零冲突；收轮记录见票文件）
