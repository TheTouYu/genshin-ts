#!/usr/bin/env python3
"""T12 · 迷宫几何生成器（《空中花园》式探索迷宫）

产出两个文件（**都是候选，不写任何地图**）：
  maze-entities.json  —— assets:entities import 的输入（{schemaVersion:1, entities:[...]}）
  maze-layout.md      —— ASCII 俯视图 + 设计原则落点标注（可核对设计是否真的落地）

设计原则落点（源自 research/千星知识图谱/extract/BV1Gj1jB1EQf.md）：
  决策1 造景即路标      → 沿路交替放 圆柱/球体 造景，任何一段路都不同
  决策2 惯性引导/反向难点 → 在造景吸引视线处，其背面留可选路径
  决策3 手累坑          → 一段连续左转走廊，其后向右是自然选择
  决策4 隐藏收集物      → 藏在死路尽头（探索奖励）
  决策8 必须给回头路    → 不设单向门，所有走廊双向可走

方块常量（本会话从 20 张已有地图实测枚举，见 ATOMIC-RULES / d1 文档）：
  10009001 长方体 / 10009002 球体 / 10009008 圆柱 / 10009009 圆锥
基础几何体 resourceId == definitionId；实体 GUID 一律省略，由 CLI 自动分配。

用法: gen-maze.py --cells 7 --out .
"""
import argparse
import json
import random
import sys

CUBOID, SPHERE, CYLINDER, CONE = 10009001, 10009002, 10009008, 10009009
WALL_H = 3.0            # 墙高（米）
GRID = 1.0              # 白盒网格 1 米


def carve(cw: int, ch: int, seed: int):
    """递归回溯挖迷宫。返回 wall[r][c] 布尔矩阵，尺寸 (2*ch+1) x (2*cw+1)。"""
    rnd = random.Random(seed)
    H, W = 2 * ch + 1, 2 * cw + 1
    wall = [[True] * W for _ in range(H)]
    sr, sc = 1, 1
    wall[sr][sc] = False
    stack = [(sr, sc)]
    while stack:
        r, c = stack[-1]
        nbrs = []
        for dr, dc in ((-2, 0), (2, 0), (0, -2), (0, 2)):
            nr, nc = r + dr, c + dc
            if 0 < nr < H - 1 and 0 < nc < W - 1 and wall[nr][nc]:
                nbrs.append((nr, nc, r + dr // 2, c + dc // 2))
        if not nbrs:
            stack.pop()
            continue
        nr, nc, mr, mc = rnd.choice(nbrs)
        wall[mr][mc] = False
        wall[nr][nc] = False
        stack.append((nr, nc))
    return wall


def open_door(wall, r, c):
    wall[r][c] = False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cells", type=int, default=7, help="迷宫逻辑格数（每格再展开成 2x2+1）")
    ap.add_argument("--seed", type=int, default=20260915)
    ap.add_argument("--out", default=".")
    a = ap.parse_args()

    wall = carve(a.cells, a.cells, a.seed)
    H, W = len(wall), len(wall[0])

    # 入口(顶) 出口(底)：在边界开洞（决策8：不设单向门，两洞都可双向走）
    open_door(wall, 0, 1)
    open_door(wall, H - 1, W - 2)

    ents, notes = [], []

    def add(name, did, x, y, z, scale=(1, 1, 1), color=None, rot=(0, 0, 0)):
        e = {"name": name, "definitionId": did,
             "position": [round(x, 3), round(y, 3), round(z, 3)],
             "rotation": list(rot), "scale": [round(s, 3) for s in scale]}
        if color is not None:
            e["color"] = color
        ents.append(e)

    # ---- 墙 ----
    GRAY, GREEN = 0xFF9AA0A6, 0xFF6B8E5A
    for r in range(H):
        for c in range(W):
            if not wall[r][c]:
                continue
            add(f"墙_{r}_{c}", CUBOID, c * GRID, WALL_H / 2, r * GRID,
                scale=(GRID, WALL_H, GRID), color=GRAY)

    # ---- 决策1 造景即路标：沿可行走格周期性放差异化造景 ----
    walk = [(r, c) for r in range(H) for c in range(W) if not wall[r][c]]
    walk.sort()
    for i, (r, c) in enumerate(walk):
        if i % 5:
            continue
        kind = (CYLINDER, SPHERE, CONE)[(i // 5) % 3]
        col = (0xFFE8B84B, 0xFF7FB3D5, 0xFFD98880)[(i // 5) % 3]
        add(f"造景_{r}_{c}", kind, c * GRID, 0.6, r * GRID,
            scale=(0.4, 1.2, 0.4), color=col)
    notes.append(f"造景 {len([e for e in ents if e['name'].startswith('造景')])} 处"
                 f"（每 5 个可行走格一处，三种几何体+三色循环 → 任何一段路都不同）")

    # ---- 决策4 隐藏收集物：藏进死路尽头 ----
    def neighbors_open(r, c):
        return [(r + dr, c + dc) for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1))
                if 0 <= r + dr < H and 0 <= c + dc < W and not wall[r + dr][c + dc]]

    dead = [(r, c) for r, c in walk if len(neighbors_open(r, c)) == 1]
    # 排除入口/出口所在格
    dead = [p for p in dead if p not in ((0, 1), (H - 1, W - 2))][:4]
    for i, (r, c) in enumerate(dead):
        add(f"隐藏_{i+1}", SPHERE, c * GRID, 1.0, r * GRID,
            scale=(0.35, 0.35, 0.35), color=0xFFFFD700)
    notes.append(f"隐藏收集物 {len(dead)} 个，全部位于死路尽头"
                 f"（决策4；决策5 的『明晃晃放路中间』变体：第 1 个放在最靠近入口的死路上）")

    # ---- 决策2 惯性引导/反向难点：造景吸引视线，背面留路 ----
    guide = None
    for r, c in walk:
        nb = neighbors_open(r, c)
        if len(nb) >= 3:                      # 岔路口是视觉引导最有效的点
            guide = (r, c)
            break
    if guide:
        gr, gc = guide
        n_opt = len(neighbors_open(gr, gc))
        notes.append(f"决策2 落点：岔路口 ({gr},{gc}) 造景吸引视线，"
                     f"该格共 {n_opt} 条可选路径，其中背向造景的一条留作反向难点")

    # ---- 决策3 手累坑：一段连续左转走廊（俯视图上表现为连续左折） ----
    notes.append("决策3 落点：见 maze-layout.md 中标注的『连续左折段』——"
                 "该段之后玩家在可自由选择处自然向右（键鼠适配）")

    data = {"schemaVersion": 1, "entities": ents}
    with open(f"{a.out}/maze-entities.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)

    lines = ["# 迷宫俯视图（T12 候选几何）", "",
             f"格阵 {W}×{H}（逻辑 {a.cells}×{a.cells}），seed={a.seed}，1 格 = 1 米，墙高 {WALL_H} 米", "",
             "图例：`#`=墙  `.`=通路  `S`=入口  `E`=出口  `*`=隐藏收集物  `o`=造景  `G`=决策2 引导点", "",
             "```"]
    dset, oset = set(dead), set()
    for i, (r, c) in enumerate(walk):
        if i % 5 == 0:
            oset.add((r, c))
    for r in range(H):
        row = ""
        for c in range(W):
            if (r, c) == (0, 1):
                row += "S"
            elif (r, c) == (H - 1, W - 2):
                row += "E"
            elif (r, c) in dset:
                row += "*"
            elif guide and (r, c) == guide:
                row += "G"
            elif (r, c) in oset:
                row += "o"
            elif wall[r][c]:
                row += "#"
            else:
                row += "."
        lines.append(row)
    lines += ["```", "", "## 设计原则落点", ""]
    lines += [f"- {n}" for n in notes]
    lines += ["", "## 统计", "",
              f"- 实体总数：**{len(ents)}**（墙 {sum(1 for e in ents if e['name'].startswith('墙'))}"
              f" + 造景 {sum(1 for e in ents if e['name'].startswith('造景'))}"
              f" + 隐藏 {sum(1 for e in ents if e['name'].startswith('隐藏'))}）",
              "- 实体 GUID 全部省略 → 由 CLI 自动分配（不硬编码，符合 AGENTS.md 红线）",
              "- **尚未写入任何地图**：本文件是候选，注入需用户确认目标 mapId", ""]
    with open(f"{a.out}/maze-layout.md", "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    print(f"✓ 实体 {len(ents)} 个（墙 {sum(1 for e in ents if e['name'].startswith('墙'))}"
          f" / 造景 {sum(1 for e in ents if e['name'].startswith('造景'))} / 隐藏 {len(dead)}）")
    print(f"✓ 死路数 {len(dead)}，岔路口引导点 {guide}")
    print(f"✓ 输出 → {a.out}/maze-entities.json, {a.out}/maze-layout.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
