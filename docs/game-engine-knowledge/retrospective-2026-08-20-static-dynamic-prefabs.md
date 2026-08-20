# 完整复盘：静态/动态元件 CLI 支持与装饰物挂载（2026-08-20）

> 状态：当前实现 + 真实 GIA/GIL 验证 + 用户游戏核验
> 范围：从上一轮提交 2764baf（静态元件 create --static + resources list）之后的差分学习、
> 缺口①--③ 实现、装饰物 CLI 支持、双地图（1073741896/1073741897/1073741898）游戏核验
> 证据：差分样本 `~/genshin-ts-evidence/toolchain-gaps/1073741896|1897|1898/raw/`（共 18 个）；
> 测试 `tests/gil_prefabs_static.ts`、`gil_prefabs_convert.ts`、`gil_aux.ts`；提交见 git log

## 一、错误谱系总览

| # | 根因层 | 具体错误 | 修复 | 证据 |
|---|--------|----------|------|------|
| 1 | 浮点精度 | 用 4 位小数（5.1272/-6.2）还原样本字节失败——样本是 5.1272316/-6.1999989 | 用样本精确值（7 位小数）做逐字节断言 | gil_prefabs_static.ts |
| 2 | 继承错误结论 | "静态 f6 槽1 比动态多 10B 静态标记"（旧文档） | 同构重放证明静态 transform 与动态相同，543→409B 全来自 f7 组件槽 | after-convert-sphere-static |
| 3 | 写回链缺失 | convert 改 instanceField.value 未写回 root8.value | 字段→section→root 三级写回 | convert 测试 §1 |
| 4 | 边界未覆盖 | convert 遇"定义-only"（CLI create 无页面模型）报 not found | 定义存在即可转（只转定义+实体） | 测试 §6 |
| 5 | 模板残留引用 | aux f4 槽40.f50.f502 藏宿主 ID（模板残留旧宿主 1077936161）→ 游戏不显示 | 模板加宿主占位替换 | after-entity-aux-user |
| 6 | ID 分配未同步 | def aux 推入后 nextAuxId 查旧 root27 → def/inst ID 重复 | def 推入后立即写回 root27 | gil_aux 测试 |
| 7 | 挂载语义错 | 定义宿主 f501 挂了 inst aux（应挂 def aux） | 按宿主类型挂 def/inst | after-prefab-with-aux |
| 8 | 未闭合 | root46 f1/f2 无规律 | fail-closed 不写 | 5 个样本观察 |

## 二、最近一次错误（装饰物失败）完整调查链

现象：`assets:aux attach` 给实体挂装饰物，结构回读正常（aux + f501），游戏里不显示。
调查：
1. 用户提供真实样本（编辑器给实体加装饰物）→ 逐字节对比，结构同构
2. 逐字段审计发现 **f4 槽40.f50.f502 = 宿主 ID**：用户=1077936184（实体）、我的模板=1077936161（模板来源的球体模型）
3. 根因：模板复用未审计内部 ID 引用
4. 修复：模板占位 `TEMPLATE_HOST_DEF_ID/INST_ID` → 替换为实际宿主
5. 验证：修复后 aux 与用户样本归一化逐字节一致 + 游戏核验通过

## 三、系统性根因（3 条）

1. **模板/骨架复用必须逐字节审计所有 ID 引用**：从样本提取模板时，除目标字段外，
   f502 宿主、f12 回链等内部引用都必须识别并参数化——"模板法"的系统性风险。
2. **wire 修改的三级写回链**：字段→section→root，漏一级 = "改了但没生效"
   （convert root8、aux host 两次踩坑）。
3. **字节级还原依赖样本精确值**：float32/varint 的逐字节断言必须用样本精确值，
   4 位小数显示会误导（5.1272 vs 5.1272316）。

## 四、流程与方法论教训

1. **用户差分是唯一可靠规律来源**："我们不猜"——每轮编辑器最小单变化 + 相邻只读快照。
2. **同构重放验证编码**：CLI 生成 vs 样本逐字节/归一化对比，先于游戏核验。
3. **游戏核验暴露模板残留**：结构对 ≠ 引用对（f502 宿主错只有游戏能看到）。
4. **概念澄清先行**：用户补充"定义=本体/页面模型=可视化辅助/实体=引用定义"后，
   所有 wire 观察都得到解释——UI 分类 ≠ wire 结构（纯静态类型保留组件槽）。

## 五、风险探索与未闭合项

- root46 语义未闭合（f1 非单调、f2 高 16 位恒 0x46E7）；CLI fail-closed 不写；
  判别 = 编辑器能否识别无 root46 的 CLI 元件（待用户重载核验 1073741896 圆柱 1077936141）。
- 静态元件 → 拖实体路径未在编辑器验证（差分未做）。
- "带装饰物的元件+定义"完整创建（定义+模型+装饰物一次生成）未做——当前是
  create 定义 + aux attach 定义 两步。

## 六、产出清单

- **代码**：`assets:aux attach`（新）、`assets:prefabs convert`（新）、create 补 type6 登记、
  resources list static 判定、setTransform 支持静态记录
- **测试**：gil_prefabs_static/convert、gil_aux（真实样本对逐字节）
- **文档**：gil-structure-semantics.md（静态/动态/装饰物/transform/概念语义/转定义）、
  asset-cli-reference.md
- **证据**：18 个差分样本（3 地图）+ 7 个 fixture
- **游戏核验**：1073741897/1073741898 全部通过（用户确认）
