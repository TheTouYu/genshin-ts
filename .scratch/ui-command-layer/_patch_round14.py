# -*- coding: utf-8 -*-
import io

def read(p):
    with io.open(p, encoding="utf-8") as f:
        return f.read()

def write(p, s):
    with io.open(p, "w", encoding="utf-8") as f:
        f.write(s)

def append(path, text):
    write(path, read(path) + text)

def replace_section(path, header, body):
    s = read(path)
    nl = chr(10)
    i = s.index(header)
    j = s.index(nl + "## ", i + len(header))
    write(path, s[:i] + header + nl + body + nl + s[j:])

def patch_exact(path, old, new):
    s = read(path)
    assert s.count(old) == 1, (path, s.count(old))
    write(path, s.replace(old, new))

REF = ".agents/skills/editor-incremental-gia-investigator/references/ui-controls.md"
append(REF, """
## 删除布局实例按钮（2026-09-03 重启轮14 差分；单样本）

> 样本：1073741909 before 2f8f0205…（37207B）→ after 4d848f3f…（33551B，-3656B）
> 唯一变化：在默认布局中删除按钮（布局实例 2032）
> 差分：仅 root9（18542B→14886B，65→60 记录）+ root46 等长审计

### 规则（本样本）

1. **删除布局实例 = 五类清理同时发生、零孤儿零重建**：
   - 移除实例记录 2032（1063B）
   - 移除该实例的私有素材组树（默认组 2065 + 文本框 2066 + 图片 2067 + 悬浮组 2068，整树 4 记录）
   - 布局 1825 f503 packed 移除该 ID（216→211B，成员回到 14）
   - 模板 2033 type4 槽 back-ref f14.f501 packed 移除该 ID（[2032,2034] → [2034]，1062→1057B）
   - 顶层索引移除 parent=None 的组（2065/2068）
2. 模板 2033、库实例 2034 及其各自素材树（2061-2064 / 2035+2044）不受影响。
3. 实例的素材树不共享：删实例只删它自己的树（每记录一套私有树的模型再次确认）。

### 未闭合

- 删除库实例 2034 / 删除模板 2033 的引用清理（库容器 f503、模板树归属）——如需 CLI Delete 全覆盖再做
- 删除后 ID 空洞（编辑器不复用，内部计数器继续）
""")

BOARD = ".scratch/ui-command-layer/BOARD.md"
replace_section(BOARD, "## 当前前沿",
"""**→ 01 按钮族规则学习**（重启轮1-14 已完成：创建/模板化/库实例/编辑/同步(整树+几何广播)/玩家细排(实例独立)/删除(实例+私有树+布局/back-ref/索引清理)。
按钮族核心链路 wire 全景闭合，票01 主体达成。
after 快照即下一轮 before：.gsts/diff-exp/ui学习/1073741909.after-重启14-删除布局按钮-4d848f3f.gil，SHA 4d848f3f…。
下一步建议：①补删库实例 2034（CLI Delete 全覆盖）或 ②收口票01 → 进入票03 命令层设计稿（规则→命令映射）。
每轮流程：用户保存后口述改了什么 → 助手复制 after → 定点差分 → 当轮规则落盘 → 更新 manifest 与票内轮次记录。""")

MAN = ".gsts/diff-exp/ui学习/restart-manifest.md"
patch_exact(MAN,
"LOCKED_BEFORE=.gsts/diff-exp/ui学习/1073741909.after-重启13-玩家细排位置-2f8f0205.gil",
"LOCKED_BEFORE=.gsts/diff-exp/ui学习/1073741909.after-重启14-删除布局按钮-4d848f3f.gil")
patch_exact(MAN,
"LOCKED_HASH=2f8f0205f6738739f73b85fd5cc6a56ced4e559fd8c093d2149c677090719a50",
"LOCKED_HASH=4d848f3fddd1b19254bb43db97fa0bc5a47e5763d74f483506082a033b1f192b")
append(MAN, """
## 轮次记录（重启轮14 · 2026-09-03）

- 唯一变化 = 删除默认布局按钮 2032；before 2f8f0205 → after 4d848f3f（-3656B）
- 归因：removed 2032+私有树 2065..2068；changed 布局 1825（f503 −2032）/模板 2033（back-ref [2034]）；索引更新；无新增
- 规则：删实例=实例+私有素材树整树删+布局/back-ref/索引清理，零孤儿；模板与库实例不受影响
- 落盘：references/ui-controls.md「删除布局实例按钮」
""")

ISS = ".scratch/ui-command-layer/issues/01-button-family-rules.md"
append(ISS, """
- 重启轮14（2026-09-03）· 唯一变化=删除默认布局按钮 2032 · before 2f8f0205 → after 4d848f3f（-3656B）
  - 规则：删实例=实例+私有组树整树删；布局 f503/模板 back-ref/顶层索引同步清理；零孤儿零重建；模板与库实例无恙
  - 落盘：references/ui-controls.md「删除布局实例按钮」
""")

print("round14 landed ok")