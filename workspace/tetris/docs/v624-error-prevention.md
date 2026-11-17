# 真机事故的防复发方案（v6.24）

> 背景：2026-11-14 ~ 11-16 连续两轮真机试玩「全是 bug」，修了三次才彻底好。
> 本文只回答一个问题：**怎么让同一类错误不再犯，以及哪些是模拟器的责任、哪些是我们自己的责任。**
>
> 两个仓库必须分开看：
> - **模拟器** `/home/h/miliastra-beyond-simulator` —— 提供"能在本地复现"的能力
> - **本项目** `/home/genshin-ts`（`workspace/tetris`）—— 框架、门禁、技能

---

## 一、这类错误长什么样

三轮修的都是**同一个病**：**同一个事实被两处各自表达，其中一处漂移了**。

| # | 事故 | 事实 | A 处 | B 处 | 结果 |
|---|---|---|---|---|---|
| 1 | v6.19 手机横幅 | 横幅该在哪 | `ui.lua` plan | `main.lua` layoutDual 硬编码坐标 | 手机双盘横幅在中缝窄条 |
| 2 | v6.20 文字模板 | 什么算"文字模板" | 探测 `probeTextRaw`（能建就行） | `accept`（必须读得到 text） | 真机 8 个候选全灭 |
| 3 | v6.21 背景池 | 用哪个 guid 建控件 | 探测结果 `TEMPLATES.cell` | 配置原始 `TPL_GUIDS.cell` | 真机背景 0 个 |
| 4 | v6.22 文字全灭 | 候选表的键名 | `templates.lua` 知道 `stext→settleText` | `platform.lua` 不知道 | 真机文字全灭 |

第 4 例最贵：**我第一轮按第 2 例的思路去修，方向完全错了**，因为两种情况在日志里长得一样。

### 为什么模拟器一直全绿

| 事故 | 模拟器为什么"过" |
|---|---|
| #2 | mock 节点走 `__kind` 分支，永远不走真机的字段探测分支 |
| #3 | 模拟器里 `TPL_GUIDS.cell` 恰好就是有效值 |
| #4 | 真机 guid 是 1073742202；模拟器靠**兜底扫描区间**恰好命中，把错误救回来了 |

共同点：**兜底/mock 把错误吸收掉了，于是错误不可见。**

---

## 二、防线设计（分层，越靠前越便宜）

### L0 构建期（毫秒级，不启动引擎）

| 门禁 | 拦什么 | 实现 |
|---|---|---|
| 模板键契约 | 视图写 `tpl='xxx'` 但 config 没有该键 | `tests-lua/tpl_contract_test.lua`（T1-T4b） |
| 占位符残留 | `__GUID_FOO__` 漏登记 ⇒ `"undefined"` 进 Lua ⇒ 候选被静默跳过 | `qxqy/build.mjs` 的 `assertNoPlaceholder` |
| 模板缺失 | 存档里 cell/hit/settle/stext 少一个 | `build.mjs` 已有 throw（v6.22 前就在） |

**关键**：`tpl_contract_test` 的 T1 直接对应第 4 例。变异测试（删掉别名）实测变红并指名
`view_preview.lua`。这类检查**不需要真机、不需要模拟器**，是本项目最该优先投的一层。

### L1 模拟器运行期（几十秒）

| 门禁 | 拦什么 | 实现 |
|---|---|---|
| `CONFIG-DRIFT` | 日志出现 `tpl X scan ok` = 候选表没命中、靠扫描救场 = 配置过期 | `qxqy/scan-runtime-errors.mjs` |
| `TPL-KEY-MISS` | 日志出现 `tpl X cands=0` = 键名根本没查到 | 同上 |
| 模板健康 | 启动时逐键报告命中/救场/失败 | `platform.lua` 的 `cands=0` 诊断 |

实测：82 条用例 → 异常行 0（修好之后）。这两个模式在修复前会红。

### L2 真机日志审计（每次试玩后）

```bash
python3 .agents/skills/debug-log-investigator/scripts/gia_log.py <log.gia> lua \
  | grep -inE "platform fail|cands=0|scan ok|bg pool|bg cover"
```

判据（按顺序）：
1. `tpl X reject` 存在 → **能力判据问题**（accept 依赖了真机读不到的字段）
2. 只有 `all candidates rejected`、**没有** reject → **候选表没查到**（键名/范围问题）
3. `scan ok` → 配置过期但被救场，必须修配置

第 2 条这次的判据，写进 `docs/v6.24` 与技能。

---

## 三、两个仓库的责任划分

### 模拟器仓库（`/home/h/miliastra-beyond-simulator`）

**职责：让真机独有的失败模式能在本地复现。**

本轮已实现：

| 能力 | 用法 | 价值 |
|---|---|---|
| `templateRenumber` | `playStart({ templateRenumber: 100000 })` | 模拟真机导入后的模板重编号 ⇒ "配置 guid 过期"类缺陷本地可复现 |

实测对比（`tetris` 项目）：

```
[正常]            模板命中 ok=3  失败行=0
[模拟真机重编号]  模板命中 ok=0  失败行=3
   platform fail inst:cell/stext/hit :: all candidates rejected
```

修复前这类问题在模拟器里**永远绿**；现在一条开关就能重现。

**尚未做（建议后续）**：
- 把 `templateRenumber` 接进 `qxqy/runner.mjs` 成一个可选矩阵（"设备保真轮"）
- mock 节点也应支持"字段读不出来"的形态（对应事故 #2）

### 本项目仓库（`/home/genshin-ts`）

**职责：让错误在建的时候就红，而不是等到真机。**

| 层 | 本轮新增 | 状态 |
|---|---|---|
| 构建期 | `tpl_contract_test.lua`（5 条） | ✅ |
| 构建期 | `assertNoPlaceholder` | ✅ |
| 运行期 | `CONFIG-DRIFT` / `TPL-KEY-MISS` 检测 | ✅ |
| 代码结构 | 实例化统一走 `cellCands()`（探测结果优先、原始候选兜底） | ✅ v6.21 |
| 代码结构 | config 别名单源 `TPL_GUIDS.stext = TPL_GUIDS.settleText` | ✅ v6.22 |
| 诊断 | `cands=0` 时打印已定义键名，区分"表为空"与"候选被试完" | ✅ v6.23 |
| 技能 | `qxqy-ui-framework` 增补检查清单 | 待做 |

---

## 四、可复述的判据（给三个月后的自己）

1. **同一个事实只准有一个表达处**。看到两处都在算同一件事（坐标、判据、键名、guid），
   先合并，再谈修 bug。
2. **兜底会掩盖错误**。兜底扫描/降级分支必须**大声**（日志带 `scan ok` 这类专用词），
   并且要有一条门禁盯着它不出现。
3. **"没打 reject" 本身是信息**。两种失败（表为空 / 判据全拒）必须打不同的日志。
4. **模拟器全绿 ≠ 真机能跑**。凡依赖"引擎给的 guid / 字段可读性 / 真实分辨率"的假设，
   都要问一句：模拟器在这一层是否真的等价？
5. **修复顺序**：先确认失败点在哪一层（配置？探测？能力判据？渲染？），再动手。
   这次的代价是——按错误层修了一轮，白改。

---

## 五、验证读数（v6.24 交付时）

```
L0   tests-lua/run_all.lua              29/29 files green
L0.5 tests-lua/run_cases.lua --jobs=8   81/82（红的是必须留模拟器的 57-copy-garbage）
L1   qxqy/runner.mjs                    82/82 · 381.7s · exit 0
     qxqy/scan-runtime-errors.mjs       82 条用例 · 异常行 0
模拟器 scripts/test.mjs                 21 pass / 0 fail
变异测试                                tpl_contract T1、build 占位符闸门 均可红
```
