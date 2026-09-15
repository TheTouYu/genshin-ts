#!/usr/bin/env python3
"""T01 · 检索结果分析：关键词生长 + 源排序

做三件事（对应"关键词扩张式检索"的三条判据）：
  1. 关键词生长：从标题里提取候选相关词（不靠我拍脑袋编），按文档频率排序
  2. 交叉命中：在多个播种词下都出现的视频 = 高相关源（比单次命中可信）
  3. 作者集中度：谁是这个领域的持续生产者

用法: analyze.py --in search/round1-all.json --round 1 --out search
"""
import argparse
import collections
import json
import os
import re
import sys

STOP = set("""原神 千星 奇域 沙箱 视频 教程 教学 分享 攻略 系列 合集 第 期 上 下 中 全 集
的 了 是 在 我 你 他 它 们 和 与 及 或 就 都 也 很 会 能 要 不 没有 一个 什么 怎么 如何
这个 那个 我们 你们 他们 自己 可以 就是 因为 所以 但是 而且 然后 现在 已经 还是 这样
一 二 三 四 五 六 七 八 九 十 千 万 百 零 个 只 条 张 次 点 秒 分 时 天 年 月 日""".split())

# 领域后缀：命中即高置信候选词
SUFFIX = ("教程", "教学", "入门", "进阶", "技巧", "攻略", "心得", "分享", "避坑", "踩坑",
          "邪修", "冷知识", "详解", "讲解", "实战", "保姆级", "从零", "思路", "设计",
          "优化", "逻辑", "节点", "变量", "系统", "机制", "方法", "指南", "答疑", "通识")


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def chinese_ngrams(text, nmin=2, nmax=5):
    """无分词器时的中文候选词提取：滑窗 n-gram（只保留纯中文段内的窗口）。"""
    out = []
    for seg in re.findall(r"[\u4e00-\u9fa5]+", text):
        for n in range(nmin, nmax + 1):
            for i in range(len(seg) - n + 1):
                out.append(seg[i:i + n])
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--round", type=int, default=1)
    ap.add_argument("--min-df", type=int, default=6, help="n-gram 最小文档频率")
    a = ap.parse_args()

    agg = load(a.inp)
    rows = []
    by_bv = collections.defaultdict(set)
    for kw, lst in agg.items():
        for r in (lst if isinstance(lst, list) else []):
            if not r.get("bvid"):
                continue
            rows.append({**r, "kw": kw})
            by_bv[r["bvid"]].add(kw)

    print(f"原始条目 {len(rows)} / 去重视频 {len(by_bv)}")

    # ---- 1. 关键词生长 ----
    df = collections.Counter()
    for bv, kws in by_bv.items():
        # 每个视频的标题只算一次
        pass
    seen_titles = {}
    for r in rows:
        seen_titles.setdefault(r["bvid"], r.get("title", ""))

    ngram_df = collections.Counter()
    suffix_hits = collections.Counter()
    for bv, title in seen_titles.items():
        for g in set(chinese_ngrams(title)):
            if g in STOP or len(g) < 2:
                continue
            ngram_df[g] += 1
        for m in re.finditer(r"([\u4e00-\u9fa5]{2,8})(" + "|".join(SUFFIX) + ")", title):
            suffix_hits[m.group(0)] += 1

    # 去冗余：n-gram 只保留"不是更长候选的子串"的（无分词器下的近似）
    DOMAIN_CHAIN = "原神千星奇域沙箱创作编辑器"  # 域名词链，其子串一律视为噪声

    def prune(counter, min_df):
        strong = {g: c for g, c in counter.items() if c >= min_df}
        merged = collections.Counter()
        for g, c in sorted(strong.items(), key=lambda x: (-x[1], -len(x[0]))):
            if g in DOMAIN_CHAIN:            # 域名本身或其子串
                continue
            if any(g != h and g in h for h in merged):   # g 是已留长词的子串
                continue
            merged[g] = c
        return merged

    kw_grown = prune(ngram_df, a.min_df)
    os.makedirs(a.out, exist_ok=True)
    with open(os.path.join(a.out, f"round{a.round}-keywords-grown.json"), "w",
              encoding="utf-8") as f:
        json.dump({"ngram_df": kw_grown.most_common(300),
                   "suffix_hits": suffix_hits.most_common(200)},
                  f, ensure_ascii=False, indent=1)

    print(f"\n=== 高置信后缀候选词（top 25，共 {len(suffix_hits)}）===")
    for w, c in suffix_hits.most_common(25):
        print(f"  {c:>3}  {w}")

    print(f"\n=== n-gram 高频候选（df>={a.min_df}，top 30）===")
    for w, c in kw_grown.most_common(30):
        print(f"  {c:>3}  {w}")

    # ---- 2. 交叉命中（高相关源）----
    multi = sorted(((len(v), k, sorted(v)) for k, v in by_bv.items()), reverse=True)
    print(f"\n=== 跨 2+ 播种词命中的视频（top 20）===")
    n_multi = sum(1 for n, _, _ in multi if n >= 2)
    for n, bv, kws in multi[:20]:
        if n < 2:
            break
        print(f"  {n}词 {bv}  {seen_titles[bv][:52]}")

    # ---- 3. 作者集中度 ----
    au = collections.Counter(r.get("author", "") for r in rows if r.get("author"))
    print(f"\n=== 高产作者（top 15）===")
    for name, c in au.most_common(15):
        print(f"  {c:>3} 条(含重复)  {name}")

    summary = {
        "round": a.round, "seed_keywords": len(agg), "raw_rows": len(rows),
        "unique_videos": len(by_bv), "multi_hit_videos": n_multi,
        "grown_keyword_candidates": len(kw_grown),
        "top_authors": au.most_common(40),
    }
    with open(os.path.join(a.out, f"round{a.round}-summary.json"), "w",
              encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=1)

    # ---- 4. 导出下一轮播种词（关键词扩张的落点）----
    nxt = sorted({w for w, _ in suffix_hits.most_common(120) if len(w) >= 3})
    nxt += [w for w, _ in kw_grown.most_common(60)
            if len(w) >= 2 and not any(w in s for s in nxt)]
    sp = os.path.join(a.out, f"round{a.round}-seeds-next.txt")
    with open(sp, "w", encoding="utf-8") as f:
        f.write(f"# 由 round{a.round} 检索结果自动生长（suffix 命中 + n-gram df>={a.min_df}）\n")
        f.write("# 未经人工筛选；人工增补请另建 seeds-round2.txt\n")
        for w in nxt:
            f.write(f"千星奇域{w}\n" if not w.startswith("千星") else f"{w}\n")
    print(f"✓ 下一轮播种词 {len(nxt)} 个 → {sp}")
    print(f"\n✓ 汇总 → {a.out}/round{a.round}-summary.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
