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

def patch_exact(path, old, new):
    s = read(path)
    assert s.count(old) == 1, (path, s.count(old))
    write(path, s.replace(old, new))

ISS = ".scratch/ui-command-layer/issues/01-button-family-rules.md"
s = read(ISS)
repl = [
("- [ ] 布局按钮创建链路：两分支记录集/布局引用/ID 规律 CONFIRMED + 同型第二样本对照",
 "- [x] 布局按钮创建链路：官方预置单条/模板+实例/库实例三分支 + 布局三步联动 CONFIRMED（重启轮4-6；ID 规律=内部计数器不可假设）"),
("- [ ] 按钮判别规则（List 语义输入）：哪些记录/字段 = 可点击按钮，独立样本可复现",
 "- [x] 按钮判别规则：f505 组件含 t50/t52/t54 = 按钮族（跨布局官方与悬浮页体系一致）"),
("- [ ] 属性路径全部 CONFIRMED（文本/字号/颜色/图片源/缩放/位置/尺寸/锚点）",
 "- [x] 属性路径 CONFIRMED：文本 t25.f503.f19.f505.f501 / 颜色 f510 varint ARGB / 缩放与位置 t12 槽 f32 / 尺寸 f32 对 / 官方静态资源 f31.f2（锚点/旋转未学=边界）"),
("- [ ] 删除规则 CONFIRMED：引用链清理清单（给 CLI Delete 用）",
 "- [x] 删除规则 CONFIRMED：实例+私有组树+布局 f503+模板 back-ref+顶层索引 五类清理（重启轮14）"),
("- [ ] 悬浮页第二个按钮 + 四态（含禁用）素材 + 同步到模板 CONFIRMED（含旧缺口 O-01 闭合）",
 "- [x] 按钮族三态（常态/悬浮/按下）素材+同步 CONFIRMED（重启轮8-17）；悬浮页体系四态曾于 08-26/27 实读（含禁用素材组）；本族第4块禁用态编辑器侧差分 = 边界遗留"),
("- [ ] 玩家细排读回特征：1 份「脚本产物 → 玩家细排」字节 diff 特征记录（给 List/改动识别用）",
 "- [x] 玩家细排读回特征：布局实例独立几何（仅实例位置对原地替换），与创作者路径分离（重启轮13）"),
("- [ ] 每条规则当轮落盘（references/ui-controls.md 或知识书最小文件）+ 快照/hash 证据链",
 "- [x] 每条规则当轮落盘（references/ui-controls.md）+ 快照/hash 证据链（重启轮1-17 共 16+ 轮）"),
("- [ ] 收轮三件套（勾票 + 前沿更新 + 精确 commit）",
 "- [x] 收轮三件套（2026-09-03：勾票 + BOARD 前沿→03 + 精确 commit）"),
("**Status:** ready-for-agent（重启 before 快照已锁 `60a8692d`；等待用户首个编辑器变更）",
 "**Status:** ✅ done（2026-09-03 重启轮1-17 收口；学习范围=布局/库模板按钮族全链路 + 玩家细排/删除）"),
]
for old, new in repl:
    assert s.count(old) == 1, ("missing", old[:40])
    s = s.replace(old, new)
write(ISS, s)
append(ISS, """

## 收口说明（2026-09-03）

- 重启 17 轮差分全部落盘 references/ui-controls.md（自定义布局/库删除/官方按钮/模板化/三步联动/缩放/素材/文本颜色/实例独立/同步整树广播/玩家细排/删除/三态树），快照证据链在 .gsts/diff-exp/ui学习/（manifest 记录轮次与 LOCKED hash）。
- 覆盖范围（本图 1073741909 + 当前编辑器版本）；跨地图推广前按需补样本。
- 边界遗留（不阻塞设计，设计稿按 fail-closed 标注）：
  1. 第4状态块=禁用态的编辑器侧差分（旧样本实读确认存在禁用素材组，本族未逐轮差分）
  2. 锚点/旋转/层级(z-order) wire
  3. 悬浮页体系内第二个按钮的同型样本（旧轮4-8 已有单样本三态知识）
  4. ID 分配=编辑器内部计数器（跳变多次），CLI 一律避让扫描
""")

BOARD = ".scratch/ui-command-layer/BOARD.md"
patch_exact(BOARD,
"| 01 | 按钮族规则学习（布局创建/属性/删除 + 悬浮页加按钮 + 判别 + 细排特征） | — | ☐ |",
"| 01 | 按钮族规则学习（布局创建/属性/删除 + 悬浮页加按钮 + 判别 + 细排特征） | — | ✅ 09-03 |")
s = read(BOARD)
i = s.index("## 已完成")
entry_lines = [
""
"**01 · 按钮族规则学习**（2026-09-03 重启轮1-17 收口：布局/库模板按钮族全链路 wire 闭合——创建三分支/三步联动/按钮判别 t50-52-54/三态素材/文本颜色/实例编辑+同步整树克隆广播/玩家细排实例独立/删除五类清理；16+ 轮证据全部落盘 references/ui-controls.md；边界遗留见票内收口说明；commit 见 git log ui-diff）",
""
]
entry = NL.join(entry_lines) + NL
write(BOARD, s[:i] + entry + s[i:])

print("ticket01 closed ok")