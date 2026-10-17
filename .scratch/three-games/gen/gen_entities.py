#!/usr/bin/env python3
"""生成 gsts assets:entities 导入 JSON（三个游戏的几何）。

用法: gen_entities.py <game> --out <file>
  game1  云阶：台阶沿 +X 上升（步高 0.4、间距 2.6，宽 4）
  game2  灯阵：8 根灯柱环形（半径 12）+ 中央平台
  game3  三关：三个检查点沿 +X（间距 10）
"""
import json, sys, math

BOX = 10009001  # 长方体图元


def ent(eid, name, pos, scale, rgb=0xFFCCCCCC, comps=None):
    e = {
        "id": eid, "definitionId": BOX, "name": name, "resourceId": BOX,
        "position": [float(v) for v in pos], "rotation": [0, 0, 0],
        "scale": [float(v) for v in scale],
        "color": {"enabled": True, "opacity": 100, "overlay": "overwrite", "rgb": rgb},
        "components": comps or [], "auxIds": [],
    }
    return e


def game1(base=1077936129):
    out = []
    # 起点台 12x12（够大，容错）；台阶沿 +X，每级 +0.4m、净间距 1.2m（盒宽 4 ⇒ 中心距 2.6）
    out.append(ent(base, "起点台", (0, 0.25, 0), (12, 0.5, 12), 0xFFBFD9F2))
    x = 8.0
    for i in range(1, 9):
        y = 0.5 + 0.4 * i
        out.append(ent(base + i, f"阶{i}", (x, y, 0), (4, 0.5, 4), 0xFFB8CDE8))
        x += 2.6
    # 顶峰 + 终点台（终点台是 tabBar 实体，位置挪到顶峰中心）
    top_x = x - 2.6
    out.append(ent(base + 9, "顶峰", (top_x, 0.5 + 0.4 * 8 + 0.25, 0), (8, 0.5, 8), 0xFFC8E0C0))
    return out


def game2(base=1077936129, n=8, radius=12.0):
    out = [ent(base, "灯阵中央台", (0, 0.25, 0), (10, 0.5, 10), 0xFFCFC9E8)]
    for i in range(n):
        a = 2 * math.pi * i / n
        out.append(ent(base + 1 + i, f"灯柱{i+1}", (radius * math.cos(a), 3.5, radius * math.sin(a)), (1.2, 7, 1.2), 0xFFE8D0A0))
    return out


def game3(base=1077936129, n=3, spacing=10.0):
    out = [ent(base, "起点台", (0, 0.25, 0), (10, 0.5, 10), 0xFFBFD9F2)]
    for i in range(n):
        out.append(ent(base + 1 + i, f"检查点{i+1}", (spacing * (i + 1), 0.25, 0), (10, 0.5, 10), 0xFFD8E8C0))
    return out


if __name__ == "__main__":
    game = sys.argv[1]
    out = {"entities": {"game1": game1, "game2": game2, "game3": game3}[game]()}
    path = sys.argv[sys.argv.index("--out") + 1]
    json.dump(out, open(path, "w"), ensure_ascii=False, indent=2)
    print(f"{path}: {len(out['entities'])} entities")
