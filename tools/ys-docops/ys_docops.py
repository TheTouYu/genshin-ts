#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ys-docops —— 千星编辑器操作面「分母 A（文档面）」抽取器。

把官方文档机器解析成操作点清单（TSV），并生成可复算的抽取报告（MD）。

设计契约见 `.scratch/gui-stack/EDITOR-COVERAGE-PLAN.md`：
   操作点 = （界面路径, 控件, 动作）三元组的一个具体实例。

用法::

    python3 tools/ys-docops/ys_docops.py extract   # 写 ops-inventory-doc.tsv
    python3 tools/ys-docops/ys_docops.py report     # 写 OPS-INVENTORY-DOC.md
    python3 tools/ys-docops/ys_docops.py check      # 自检（列数/id 连续/重复/计数）
    python3 tools/ys-docops/ys_docops.py stats      # 终端打印分布
    python3 tools/ys-docops/ys_docops.py trace RID  # 打印某条规则命中的原始行

约束：
  * 只读 `docs/`，只写 `.scratch/gui-stack/ops-inventory-doc.tsv` 与 `OPS-INVENTORY-DOC.md`。
  * 所有「人工裁量」（补充行 / 排除行 / 改名）都以数据表形式写在文件内，
    保证重跑得到同一份清单（数字可复算）。
"""

from __future__ import annotations

import argparse
import collections
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT_TSV = ROOT / ".scratch/gui-stack/ops-inventory-doc.tsv"
OUT_MD = ROOT / ".scratch/gui-stack/OPS-INVENTORY-DOC.md"

BULLET = "\ue69c"

# ---------------------------------------------------------------- 源与范围

SOURCES = [
    # name, 相对路径, 包含的章节（None = 全收）
    ("editor", "docs/ui-tutorial/official-guide-editor-interface.md", None),
    ("aux", "docs/ui-tutorial/official-guide-auxiliary-appendix.md",
     ("负载计算功能", "风险检查功能", "节点图高级特性", "节点图变量", "复合节点",
      "节点图日志", "客户端节点图日志", "复合节点图日志", "信号")),
    ("ui", "docs/ui-tutorial/official-ui-tutorial.md",
     ("界面控件（完整）", "界面控件组管理", "界面布局", "界面控件组")),
]

# 可选第四层（默认不计）：19 个界面控件的属性面板。它们是「被编辑对象的属性」，
# 与编辑器自身的操作面，在 A/B 对账口径上需要单独裁决，故默认关闭。
UI_WIDGET_DETAIL_TITLE = "界面控件 · 控件详解（19 个控件，按官方导航顺序）"

# 纯容器标题：不进 path
CONTAINER_TITLES = {
    "界面介绍", "整体界面", "功能简介", "具体功能介绍", "功能入口", "入口所在位置",
    "摆放流程", "使用方式", "操作流程", "功能逻辑", "可用功能", "功能介绍", "文档地图与读取约定",
    "官方教程章节总览", "官方教程正文（按官方章节组织）", "高级概念", "整体界面介绍",
}

# 「键：值」里的键若是这些词，说明它是叙述元信息而不是控件名
META_KEYS = {
    "打开方式", "开启方式", "开启条件", "操作逻辑", "功能入口", "功能", "作用", "说明", "注",
    "注意", "注意事项", "使用方法", "适用对象", "适用内容", "适用场景", "功能说明", "功能简介",
    "表现效果", "生成逻辑", "地形生成逻辑", "入口", "操作", "用法", "条件", "限制", "规则",
    "效果", "适用", "来源", "默认值", "用途", "界面", "参数", "例外", "定义", "原理",
    "概念", "目标", "流程", "步骤", "需求", "背景", "目录", "本文", "本文件", "官方页", "状态",
    "证据层级", "维护说明", "概括", "总结", "原因", "机制", "差异", "特色", "优势", "缺点",
    "前提", "开启方法", "查看方式", "选择方式", "配置方式", "编辑方式", "生成方式", "取值范围",
    "上限", "下限", "示例", "案例", "举", "要点", "图", "分类", "类型", "特性", "说明：",
    "打开方法", "关闭方式", "退出方式", "校验", "条件说明", "提示", "警告", "风险", "耗时",
    "注意点", "小技巧", "技巧", "最佳实践", "推荐", "默认", "为什么", "如何", "怎么",
    "使用条件", "开启方法", "关闭方法", "查看", "说明如下", "功能点", "可用功能", "具体功能",
}

# 视频播放器噪声（官方页嵌入播放器的脚手架文本）
VIDEO_NOISE = {
    "不支持的音频/视频格式请试试刷新", "重播", "00:00/00:00", "_2X_ 快进中", "播放",
    "00:00/00:00直播", "进入全屏", "60", "1x", "- 2x", "- 1.5x", "- 1x", "- 0.75x",
    "- 0.5x", "- 2x ", "_2X_", "进入全屏",
}

# 纯内容类型/概念名词：是「被操作的对象」，不是可触发控件
NON_CONTROL_NOUNS = {
    "地形", "静态物件", "动态物件", "造物", "造物实体", "物件实体", "掉落物实体", "白盒物件",
    "复杂造物", "水物件", "本地投射物", "角色假人", "单位状态", "技能", "道具", "玩家",
}

# ---------------------------------------------------------------- 关键词分类

DESTRUCTIVE_KW = ("删除", "清空", "清除", "移除", "覆盖保存", "覆盖", "上传", "下架", "解散",
                  "请离", "踢出", "解散房间", "重置", "卸载", "清档", "删除模板", "全部删除")
CREATE_KW = ("新建", "创建", "添加", "生成", "复制", "粘贴", "另存为", "导入", "导出", "拷贝", "实例化",
             "保存为", "录制", "上传自定义")
SCENE_KW = ("地形", "笔刷", "涂抹", "抬高", "下沉", "抬升", "抹平", "斜坡", "水体", "路径",
            "地块", "高度标尺", "阵列", "对称", "包围盒", "测距", "相机", "镜头", "吸附", "贴地",
            "中心对齐", "变换处理工具", "移动", "旋转", "缩放", "视角")
NAV_KW = ("页签", "菜单", "入口", "窗口", "面板", "库", "列表", "概览", "总览", "切换", "打开",
          "退出", "返回", "关闭", "总览", "预览窗口", "搜索", "筛选", "排序",
          "展开", "折叠", "预览", "图标", "按钮", "选项", "管理", "详情", "主页", "页面", "卡片",
          "筛选", "排序", "搜索", "返回", "跳转")

SHORTCUT_RE = re.compile(
    r"(?:\b(?:Ctrl|CTRL|Alt|ALT|Shift|SHIFT|Esc|ESC|Delete|delete|Tab|F\d{1,2})\b"
    r"|空格|回车|回车键|鼠标右键|鼠标中键|鼠标滚轮|WASD|方向键)"
)


def classify_action(control: str, desc: str, raw: str) -> str:
    """动作分类：click / toggle / set / drag / scroll / shortcut。"""
    t = f"{control} {desc}"
    if SHORTCUT_RE.search(control) or SHORTCUT_RE.search(raw):
        return "shortcut"
    if "拖拽" in t or "拖移" in t or "拖动" in t:
        return "drag"
    if "滚轮" in t or "滚动" in t or "下拉" in control:
        return "scroll"
    # 滑块/数值输入：观测差异是「值变了」
    if "滑块" in control or "滑动" in t:
        return "set"
    if "输入框" in control or "输入" in t or "填入" in t or "填写" in t:
        return "set"
    if "开关" in control or "勾选" in t or "开关" in t:
        return "toggle"
    if "开启后" in desc or "是否" in desc or "控制是否" in desc:
        return "toggle"
    if re.search(r"(速度|数量|层数|间隔|半径|角度|高度值|比例|时长|秒数)$", control):
        return "set"
    if "滑块" in desc:
        return "set"
    if re.match(r"^(.{0,8})(是否|启用|开启|显示|常驻|锁|对齐|吸附|保护|限定)", control):
        return "toggle"
    return "click"


def classify_kind(control: str, desc: str) -> str:
    """用途分类：nav / setting / create / destructive / scene。"""
    c = control
    if any(k in c for k in DESTRUCTIVE_KW):
        return "destructive"
    if any(k in c for k in CREATE_KW):
        return "create"
    if any(k in c for k in NAV_KW):
        return "nav"
    if any(k in c for k in SCENE_KW):
        return "scene"
    return "setting"


# ---------------------------------------------------------------- 解析

def unescape(s: str) -> str:
    return s.replace("\\-", "-").replace("\\_", "_").replace("\\*", "*").replace("\\#", "#")


TITLE_PREFIX_RE = re.compile(
    r"^(?:[一二三四五六七八九十]{1,3}、"      # 一、二、三、
    r"|\d+(?:\.\d+)*\.?"                  # 1. / 2.4.3.2
    r"|\(\d+\)"                            # (1)
    r"|[a-zA-Z]\."                           # a.
    r"|★|\*)\s*")


def norm_title(raw: str) -> str:
    s = unescape(raw).strip()
    for _ in range(3):
        s2 = TITLE_PREFIX_RE.sub("", s).strip()
        if s2 == s:
            break
        s = s2
    return s.strip().strip("*").strip()


class Rec:
    __slots__ = ("no", "text", "stack", "kind")

    def __init__(self, no, text, stack, kind):
        self.no = no
        self.text = text
        self.stack = stack          # list[(level, raw_title, norm_title)]
        self.kind = kind            # heading / text / bullet

    @property
    def titles(self):
        return [t for (_, _, t) in self.stack]


def parse(path: pathlib.Path):
    recs = []
    stack = []
    for no, raw in enumerate(path.read_text(encoding="utf-8").split("\n"), 1):
        line = raw.rstrip("\n").rstrip()
        if not line.strip():
            continue
        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        if m:
            lvl = len(m.group(1))
            while stack and stack[-1][0] >= lvl:
                stack.pop()
            stack.append((lvl, unescape(m.group(2)).strip(), norm_title(m.group(2))))
            recs.append(Rec(no, line, list(stack), "heading"))
            continue
        if line.strip() == BULLET:
            recs.append(Rec(no, BULLET, list(stack), "bullet"))
            continue
        recs.append(Rec(no, line.strip(), list(stack), "text"))
    return recs


# 章节级排除：这些小节是「设计建议/规范/概念举例」，不是编辑器控件
EXCLUDE_SECTIONS = {
    "界面规范参考", "锚点选择建议", "文字参考", "界面布局参考", "手柄端界面设计示例",
    "手柄端适配设计准则", "课程讲义", "案例", "以节点图管理",
}


def in_scope(rec: Rec, include) -> bool:
    if any(t in EXCLUDE_SECTIONS for t in rec.titles):
        return False
    if include is None:
        return True
    return any(t in include for t in rec.titles)


def make_path(rec: Rec) -> str:
    parts = []
    for (lvl, _, t) in rec.stack:
        if lvl == 1:            # 文档大标题不进 path
            continue
        if not t or t in CONTAINER_TITLES:
            continue
        if parts and (t in parts[-1] or parts[-1] in t):
            # 「系统菜单」->「系统菜单功能」之类，保留更短的上层
            continue
        parts.append(t)
    if not parts:
        # 兜底：用第一个 level>=2 的标题
        for (lvl, _, t) in rec.stack:
            if lvl >= 2 and t:
                return t
        return "(未分类)"
    return " > ".join(parts[-3:])


# ---------------------------------------------------------------- 抽取行

class Row:
    __slots__ = ("path", "control", "action", "kind", "doc_ref", "note", "rule", "no", "src", "id")

    def __init__(self, path, control, action, kind, doc_ref, note, rule, no, src):
        self.path = path
        self.control = control
        self.action = action
        self.kind = kind
        self.doc_ref = doc_ref
        self.note = note
        self.rule = rule
        self.no = no
        self.src = src


KV_RE = re.compile(r"^(?P<key>[^：:]{2,26}?)\s*[：:]\s*(?P<val>.*)$")
PAREN_RE = re.compile(r"^(?P<key>[^（(：:]{2,24}?)\s*[（(](?P<hint>[^）)]{1,40})[）)]\s*(?:[-－—]{1,2}\s*)?(?P<val>.*)$")
ITALIC_KV_RE = re.compile(r"^_?(?P<key>[^_：:]{2,24})_?\s*[：:]\s*(?P<val>.*)$")
BRACKET_RE = re.compile(r"【([^】]{1,30})】")
# 以这些词开头的「短标题」是句子而不是控件名
PROSE_START_RE = re.compile(
    r"^(点击|选择|单击|双击|拖拽|拖动|按住|通过|根据|默认|包含|支持|可以|需要|允许|注意|例如|"
    r"如图|下图|上图|进入|使用|当|若|在|从|该|此|为|是|有|无|可|只能|不可|无法|所有|每个|部分)")
# 含这些词的「短标题」是叙述句而不是控件名
PROSE_KW_RE = re.compile(r"(点击|选择|进行|包含|默认|根据|通过|可以|需要|能够|即可|时会|等。)")
BOLD_RE = re.compile(r"\*\*([^*\n]{2,24})\*\*")
ITALIC_LEAD_RE = re.compile(r"^_([^_\n]{2,24})_\s*[：:]\s*(.+)$")


def clean_control(s: str) -> str:
    s = unescape(s).strip().strip("`*_ 　")
    s = s.strip("【】[]（）()")
    s = re.sub(r"^[（(]\d+[）)]\s*", "", s)
    s = re.sub(r"^[a-zA-Z]\.\s*", "", s)
    s = re.sub(r"\s*\[[^\]]*\]\([^)]*\)", "", s)   # 去掉 [文本](链接) 残留
    s = re.sub(r"\]\(.*$", "", s)
    s = s.rstrip("：:_ 　")
    s = re.sub(r"\s*(按钮|图标)$", lambda m: "", s) if False else s
    return s.strip()


BAD_KEY_RE = re.compile(
    r"(的|了|是|为|包含|分为|如下|主要功能|可通过|用于|决定|区别|支持|需要|可以|能够|进行|"
    r"即可|说明|方式|使用|局内|局外|区别|含义|作用|特点|特性|注意|建议|参考|规范|准则|"
    r"并|然后|直接|优先|\\\]|\\\)|https?://|[【】\[\]()（）<>《》])")
BAD_TAIL_RE = re.compile(r"(包含|用于|通过|需要|支持|决定|进行|如下|如下：|时|后|上|中|内|处|等)$")
VAGUE_CONTROLS = {
    "按钮", "图标", "内容", "底部", "顶部", "左侧", "右侧", "上方", "下方", "方式一", "方式二",
    "参数", "说明", "功能", "设置", "选项", "状态", "详情", "主要功能", "入口", "名称", "问题",
}


def looks_like_control(key: str) -> bool:
    k = key.strip()
    if not k or len(k) < 2 or len(k) > 16:
        return False
    if k in META_KEYS or k in NON_CONTROL_NOUNS or k in VAGUE_CONTROLS:
        return False
    if BAD_KEY_RE.search(k.replace("另存为", "另存_")):
        return False
    if BAD_TAIL_RE.search(k):
        return False
    if re.match(r"^[（(]?\d", k):          # 纯编号
        return False
    if k in {"图", "注", "例", "如", "即", "若", "则", "其", "此", "该"}:
        return False
    if k.startswith(("[图]", "注：", "例：", "如图", "如下")):
        return False
    if k.startswith(("点击", "选择", "通过", "根据", "默认", "可以", "需要", "所有", "每个")):
        return False
    if re.match(r"^(该|此|上述|其|可将|可把|即可|这些|那些)", k):
        return False
    if k.endswith(("。", "，", "；", "、", "？", "！")):
        return False
    if re.search(r"[，。；！？]", k):
        return False
    return True


def add(rows, src, rec_no, path, control, action, kind, doc_ref, note, rule):
    control = control.strip()
    if not control:
        return
    if not rec_no:                      # 人工补充条目：行号取自 doc_ref，保证按文档顺序排序
        try:
            rec_no = int(doc_ref.rsplit(":", 1)[1])
        except (ValueError, IndexError):
            rec_no = 10 ** 6
    rows.append(Row(path, control, action, kind, doc_ref, note, rule, rec_no, src))


# ---- 规则实现 -------------------------------------------------------------

def rule_bullet_block(rows, src, fname, blocks):
    """R1/R11：项目符号块 —— 块首行是控件名或分组名。"""
    for head, body in blocks:
        no = head.no
        ref = f"{fname}:{no}"
        text = head.text
        path = make_path(head)

        # 纯列表：A、B、C  -> 拆成多个操作点（步骤叙述要拆开）
        toks = split_enum(text)
        if toks and len(toks) >= 3:
            for t in toks:
                t2 = clean_control(t)
                if not looks_like_control(t2):
                    continue
                add(rows, src, no, path, t2, classify_action(t2, "", t2),
                    classify_kind(t2, ""), ref, "文档以顿号并列枚举", "R11-list")
            continue

        m = KV_RE.match(text)
        if m and looks_like_control(m.group("key")):
            key, val = clean_control(m.group("key")), m.group("val")
            add(rows, src, no, path, key, classify_action(key, val, text),
                classify_kind(key, val), ref, "", "R1-bullet-kv")
            continue

        m = PAREN_RE.match(text)
        if m and not re.search(r"(点击|单击|双击|输入|拖拽|拖动|滑|按钮|打开|选择|按住|勾选)", m.group("hint")):
            m = None
        if m and looks_like_control(m.group("key")):
            key, hint, val = clean_control(m.group("key")), m.group("hint"), m.group("val")
            act = classify_action(key, hint + val, text)
            if "输入" in hint:
                act = "set"
            note = "待界面确认" if ("图" in hint and not val) else ""
            add(rows, src, no, path, key, act, classify_kind(key, val), ref, note, "R1-paren")
            continue

        # 无冒号的短标题：块体里若还有「键：值」子项，说明它是分组标题（不收），否则算控件
        body_kv = False
        for b in body[:4]:
            m2 = KV_RE.match(b.text)
            if m2 and looks_like_control(m2.group("key")):
                body_kv = True
                break
        if body_kv:
            continue
        if PROSE_START_RE.match(text) or PROSE_KW_RE.search(text):
            continue
        if re.search(r"[。，；：:]", text):
            continue
        title = clean_control(text)
        if not looks_like_control(title):
            continue
        if title in NON_CONTROL_NOUNS:
            continue
        desc = body[0].text if body else ""
        add(rows, src, no, path, title,
            classify_action(title, desc, text), classify_kind(title, desc), ref,
            "项目符号标题，语义由后文给出", "R1-bullet-title")


def split_enum(text: str):
    """把「A、B、C和D」这类并列枚举拆成 token 列表；不是枚举就返回 None。"""
    t = text.strip().rstrip("。")
    if "：" in t or ":" in t:
        return None
    if not re.search(r"[、]", t):
        return None
    toks = [x.strip() for x in re.split(r"[、]", t) if x.strip()]
    # 末项可能用「和/与/及」连接
    if len(toks) >= 2:
        last = toks[-1]
        m = re.match(r"^(.{2,14})(?:和|与|及)(.{2,14})$", last)
        if m:
            toks[-1:] = [m.group(1), m.group(2)]
    if len(toks) < 3:
        return None
    for x in toks:
        if not (2 <= len(x) <= 14):
            return None
        if re.search(r"[，。；！？的了是]", x):
            return None
    return toks


def rule_plain_kv(rows, src, fname, recs):
    """R2：无项目符号的「控件名：说明」行（快捷设置等）。"""
    for rec in recs:
        if rec.kind != "text":
            continue
        text = rec.text
        if text.startswith((">", "|", "#", "```", "[图]", "（", "(")):
            continue
        if "http" in text:
            continue
        m = ITALIC_LEAD_RE.match(text)
        if m:
            key, val = clean_control(m.group(1)), m.group(2)
            if looks_like_control(key):
                add(rows, src, rec.no, make_path(rec), key,
                    classify_action(key, val, text), classify_kind(key, val),
                    f"{fname}:{rec.no}", "斜体配置项", "R2-italic")
                continue
        m = KV_RE.match(text)
        if not m:
            continue
        key, val = clean_control(m.group("key")), m.group("val")
        if not looks_like_control(key):
            continue
        if len(val) == 0:
            continue
        if re.search(r"[，。；]", key):
            continue
        add(rows, src, rec.no, make_path(rec), key,
            classify_action(key, val, text), classify_kind(key, val),
            f"{fname}:{rec.no}", "", "R2-plain-kv")


def rule_bracket(rows, src, fname, recs):
    """R3：正文里的【按钮名】。"""
    for rec in recs:
        if rec.kind == "heading":
            continue
        text = rec.text
        if text.strip() == BULLET or text.startswith("|"):
            continue
        for m in BRACKET_RE.finditer(text):
            name = clean_control(m.group(1))
            if not looks_like_control(name):
                continue
            act = classify_action(name, text, text)
            add(rows, src, rec.no, make_path(rec), name, act, classify_kind(name, text),
                f"{fname}:{rec.no}", "", "R3-bracket")


def rule_prose_noun(rows, src, fname, recs):
    """R4：散文里的「点击/选择 XX 按钮|开关|页签|图标|滑块」。"""
    pat = re.compile(
        r"(?:点击|单击|双击|选择|勾选|拖动|拖拽|按住|输入|打开|呼出|展开|按下|切换)"
        r"(?:左上角|右上角|右下角|左下角|底部|顶部|左侧|右侧|上方|下方|中间的|的)?"
        r"([\u4e00-\u9fa5A-Za-z0-9_\-]{2,12}?)(按钮|图标|页签|开关|滑块|输入框)")
    pat2 = re.compile(r"(?:左上角|右上角|右下角|顶部|底部|左侧|右侧)(?:的)?"
                      r"([\u4e00-\u9fa5]{2,10})(按钮|图标|页签)")
    # 「点击添加页签可新增自定义页签」这类无后缀动词句：抽出被点的那个名词短语
    pat3 = re.compile(r"^(?:点击|单击|双击)([\u4e00-\u9fa5]{2,10}?)(?:可|则|后|即可|会|进入|打开|新增|创建)")
    for rec in recs:
        if rec.kind == "heading":
            continue
        text = rec.text
        if text.startswith("|"):
            continue
        hits = list(pat.finditer(text)) + list(pat2.finditer(text))
        for m in hits:
            name = clean_control(m.group(1) + m.group(2))
            if not looks_like_control(name):
                continue
            add(rows, src, rec.no, make_path(rec), name,
                classify_action(name, text, text), classify_kind(name, text),
                f"{fname}:{rec.no}", "待界面确认", "R4-prose-noun")
        for m in pat3.finditer(text):
            name = clean_control(m.group(1))
            if not looks_like_control(name) or len(name) < 2:
                continue
            add(rows, src, rec.no, make_path(rec), name,
                classify_action(name, text, text), classify_kind(name, text),
                f"{fname}:{rec.no}", "待界面确认（从句中抽出）", "R4-prose-verb")


def rule_shortcut(rows, src, fname, recs):
    """R5：快捷键叙述（相机/复制粘贴/撤销/Delete/空格）。"""
    pat = re.compile(
        r"((?:Ctrl|CTRL|Alt|ALT|Shift|SHIFT)\s*\+\s*[A-Za-z0-9]"
        r"|(?:Ctrl|CTRL|Alt|ALT|Shift|SHIFT)\s*【[^】]{1,6}】"
        r"|ESC|Esc|esc|Delete|delete|按delete键|空格|鼠标右键|鼠标中键|鼠标滚轮|WASD)")
    for rec in recs:
        if rec.kind == "heading":
            continue
        text = rec.text
        if text.strip() == BULLET or text.startswith("|"):
            continue
        if "相机操作" in make_path(rec):
            continue          # 该节由 R7 表格统一覆盖，避免同一快捷键出两行
        if "快捷键" not in text and not pat.search(text):
            continue
        for m in pat.finditer(text):
            key = m.group(1).strip()
            if len(key) < 2:
                continue
            add(rows, src, rec.no, make_path(rec), key, "shortcut", "nav",
                f"{fname}:{rec.no}", "快捷键（文档以快捷键叙述给出）", "R5-shortcut")


def rule_bold(rows, src, fname, recs):
    """R6：辅源(aux/ui)用 **粗体** 标界面元素。"""
    for rec in recs:
        if rec.kind == "heading" or rec.kind == "bullet":
            continue
        text = rec.text
        for m in BOLD_RE.finditer(text):
            name = clean_control(m.group(1))
            if not (2 <= len(name) <= 14):
                continue
            if re.search(r"[，。；：、（）]", name):
                continue
            after = text[m.end():m.end() + 3]
            before = text[max(0, m.start() - 4):m.start()]
            ui_suffix = after.startswith(("按钮", "开关", "页签", "窗口", "图标", "菜单", "面板", "列表"))
            ui_verb = re.search(r"(点击|选择|打开|勾选|进入|按|使用|选择)$", before) is not None
            if not (ui_suffix or ui_verb):
                continue
            add(rows, src, rec.no, make_path(rec), name,
                classify_action(name, text, text), classify_kind(name, text),
                f"{fname}:{rec.no}", "文档以粗体标出的界面元素", "R6-bold")


def rule_table(rows, src, fname, recs):
    """R7：表格 —— 「配置参数|说明」表的行是配置项；两列表是快捷键映射。"""
    blocks = []
    cur = []
    for rec in recs:
        if rec.kind == "text" and rec.text.startswith("|"):
            cur.append(rec)
        else:
            if len(cur) >= 2:
                blocks.append(cur)
            cur = []
    if len(cur) >= 2:
        blocks.append(cur)

    for blk in blocks:
        cells = [[c.strip() for c in r.text.strip().strip("|").split("|")] for r in blk]
        # 表头可能在第一行或第二行（官方文档大量表格第一行是空壳表头）
        hdr = None
        for k in range(min(3, len(cells))):
            if cells[k] and cells[k][0] in ("配置参数", "参数"):
                hdr = k
                break
        if hdr is not None:
            if cells[hdr][0] == "配置参数":
                for r, cell in zip(blk[hdr + 1:], cells[hdr + 1:]):
                    if not cell or not cell[0] or cell[0].startswith("---"):
                        continue
                    if cell[0].replace("_", "") in ("配置参数", "参数", "说明"):
                        continue
                    name = clean_control(cell[0].replace("_", ""))
                    if not looks_like_control(name):
                        continue
                    desc = " ".join(cell[1:])
                    add(rows, src, r.no, make_path(r), name,
                        classify_action(name, desc, desc), classify_kind(name, desc),
                        f"{fname}:{r.no}", "参数配置表行", "R7-table-config")
            continue          # 「参数|说明」表是读数表，不是控件
        # 快捷键表（相机操作表：左列动作名，右列按键）——右列必须是按键样，否则是参数/说明表
        KEYCELL = re.compile(r"^(WASD|E|Q|R|F|T|G|C|V|X|Z|空格|ESC|Esc|ALT\+\w|Ctrl\+\w|鼠标\S*(键|滚轮)?|左键|右键|中键)$")
        if all(h == "" for h in cells[0]):
            for r, cell in zip(blk[1:], cells[1:]):
                if len(cell) < 2 or cell[0].startswith("---"):
                    continue
                key = cell[-1].strip()
                if not KEYCELL.match(key):
                    continue
                name = clean_control(cell[0])
                if not looks_like_control(name):
                    continue
                add(rows, src, r.no, make_path(r), name, "shortcut", "scene",
                    f"{fname}:{r.no}", f"快捷键 {key}", "R7-table-key")


def rule_nav_path(rows, src, fname, recs):
    """R8：导航叙述「系统菜单——X」「右键菜单 → X」「详情栏 → 底部 → X」。"""
    pat = re.compile(r"(?:系统菜单|右键菜单|详情栏|资产栏|顶部页签栏|菜单栏)"
                     r"\s*(?:——|—|→|->|>|中的|中的 -| - )\s*([^，。；、\s]{2,16})")
    for rec in recs:
        if rec.kind == "heading":
            continue
        for m in pat.finditer(rec.text):
            name = clean_control(m.group(1))
            if not looks_like_control(name):
                continue
            add(rows, src, rec.no, make_path(rec), name,
                classify_action(name, rec.text, rec.text), classify_kind(name, rec.text),
                f"{fname}:{rec.no}", "文档以导航路径给出", "R8-nav-path")


def rule_heading_controls(rows, src, fname, recs, sections):
    """R9：详情面板属性卡 / 关卡设置页签下的设置项（标题即控件）。"""
    for rec in recs:
        if rec.kind != "heading":
            continue
        titles = rec.titles
        if not any(s in titles for s in sections):
            continue
        raw = rec.stack[-1][1]
        if not re.match(r"^\([0-9]+\)", raw):
            continue
        name = clean_control(norm_title(raw))
        if not looks_like_control(name):
            continue
        add(rows, src, rec.no, make_path(rec), name, "click",
            classify_kind(name, ""), f"{fname}:{rec.no}",
            "标题即控件（属性卡/设置项，点击展开）", "R9-heading")


# ---------------------------------------------------------------- 人工裁量表
# 说明：# 开头的条目是「抽取器规则识别不到、但我判定它是操作点」的补充；
#       EXCLUDE_* 是「规则命中、但我判定不是操作点」的排除，附理由。

def curated_extra():
    """(src, control, action, kind, doc_ref, path, note)"""
    E = "official-guide-editor-interface.md"
    U = "official-ui-tutorial.md"
    A = "official-guide-auxiliary-appendix.md"
    return [
        # ---- 系统菜单：顶栏常驻按钮（官方正文用散文描述，无统一控件名）
        ("editor", "系统菜单图标（左上角）", "click", "nav", f"{E}:23", "系统菜单",
         "打开/关闭系统菜单；快捷键 ESC"),
        ("editor", "资产栏图标（左上角）", "click", "nav", f"{E}:51", "资产栏",
         "资产栏的打开/关闭按钮"),
        ("editor", "快捷设置图标（右上角）", "click", "nav", f"{E}:67", "快捷设置",
         "呼出快捷设置菜单"),
        ("editor", "详情按钮（右上角）", "click", "nav", f"{E}:135", "详情面板",
         "关闭/再次打开详情面板（仅场景选中单位时可用）"),
        ("editor", "页面签-地形编辑", "click", "nav", f"{E}:145", "模式切换",
         "顶部页签栏第 1 个按钮"),
        ("editor", "页面签-实体摆放", "click", "nav", f"{E}:147", "模式切换",
         "顶部页签栏第 2 个按钮"),
        ("editor", "页面签-元件库", "click", "nav", f"{E}:149", "模式切换",
         "顶部页签栏第 3 个按钮"),
        ("editor", "页面签-战斗预设", "click", "nav", f"{E}:151", "模式切换",
         "顶部页签栏第 4 个按钮"),
        ("editor", "撤销按钮（顶栏）", "click", "nav", f"{E}:2107",
         "撤销与还原 > 编辑界面内", "撤销一步；与 Ctrl+Z 同一操作点的两个入口"),
        ("editor", "重做按钮（顶栏）", "click", "nav", f"{E}:2107",
         "撤销与还原 > 编辑界面内", "重做一步"),
        # ---- 地形创建：底部工具栏四族笔刷（文档以「地块操作/斜坡操作/水体操作/路径操作」分组）
        ("editor", "笔刷模式-地块操作", "click", "scene", f"{E}:352", "地形编辑 > 地形创建 > 底部工具栏",
         "笔刷模式切换；组内含 创建/删除/抹平"),
        ("editor", "笔刷模式-斜坡操作", "click", "scene", f"{E}:368", "地形编辑 > 地形创建 > 底部工具栏",
         "笔刷模式切换"),
        ("editor", "笔刷模式-水体操作", "click", "scene", f"{E}:386", "地形编辑 > 地形创建 > 底部工具栏",
         "笔刷模式切换"),
        ("editor", "笔刷模式-路径操作", "click", "scene", f"{E}:394", "地形编辑 > 地形创建 > 底部工具栏",
         "笔刷模式切换"),
        ("editor", "创建地形-结束绘制按钮（右上角X）", "click", "create", f"{E}:310",
         "地形编辑 > 地形创建", "结束绘制并生成地形"),
        ("editor", "基于格线创建按钮（右下角）", "click", "create", f"{E}:298",
         "地形编辑 > 地形修改 - 自由编辑", "进入自由编辑笔刷态"),
        ("editor", "笔刷-点按", "click", "scene", f"{E}:406", "地形编辑 > 地形创建 > 笔刷操作",
         "单次生成笔刷效果"),
        ("editor", "笔刷-拖移", "drag", "scene", f"{E}:408", "地形编辑 > 地形创建 > 笔刷操作",
         "拖移连续生成"),
        # ---- 实体摆放：详情编辑 12 个属性卡由 R9 抽取；这里补「模型-复��」「模型-显示类型」
        ("editor", "模型-复制", "click", "create", f"{E}:2531", "实体摆放 > 详情编辑 > 模型",
         "复制模型数据（含装饰物）"),
        ("editor", "模型-显示类型", "click", "setting", f"{E}:2461", "实体摆放 > 详情编辑 > 模型",
         "切到包围盒显示类型（仅尺寸/包围盒及尺寸/碰撞及尺寸）"),
        # ---- 编辑工具：右键菜单入口
        ("editor", "右键菜单-阵列生成", "click", "create", f"{E}:2315", "编辑工具 > 阵列生成",
         "右键菜单 → 阵列"),
        ("editor", "右键菜单-对称编辑", "click", "create", f"{E}:2389", "编辑工具 > 对称编辑",
         "右键菜单 → 对称（点/轴/面）"),
        ("editor", "右键菜单-测距线", "click", "create", f"{E}:2551", "编辑工具 > 测距功能",
         "右键菜单 → 测距线 → 添加测距线"),
        ("editor", "右键菜单-复制", "click", "create", f"{E}:522", "地形编辑 > 地形修改 - 指针操作 > 右键菜单",
         "地形右键菜单项"),
        ("editor", "右键菜单-粘贴", "click", "create", f"{E}:522", "地形编辑 > 地形修改 - 指针操作 > 右键菜单",
         "地形右键菜单项"),
        ("editor", "右键菜单-镜头聚焦", "click", "nav", f"{E}:522", "地形编辑 > 地形修改 - 指针操作 > 右键菜单",
         "地形右键菜单项"),
        ("editor", "右键菜单-资产导出", "click", "create", f"{E}:522", "地形编辑 > 地形修改 - 指针操作 > 右键菜单",
         "地形右键菜单项"),
        ("editor", "右键菜单-角色假人", "click", "create", f"{E}:522", "地形编辑 > 地形修改 - 指针操作 > 右键菜单",
         "地形右键菜单项"),
        ("editor", "右键菜单-添加到实体布设组", "click", "create", f"{E}:522",
         "地形编辑 > 地形修改 - 指针操作 > 右键菜单", "地形右键菜单项"),
        # ---- 千星沙箱：窗口菜单
        ("editor", "窗口菜单", "click", "nav", f"{E}:1741", "千星沙箱 > 服务器节点图资源管理器",
         "顶部菜单栏「窗口」子菜单"),
        ("editor", "窗口-负载检测", "click", "nav", f"{E}:1749", "千星沙箱 > 服务器节点图资源管理器 > 窗口",
         "窗口子菜单项"),
        ("editor", "窗口-日志", "click", "nav", f"{E}:1749", "千星沙箱 > 服务器节点图资源管理器 > 窗口",
         "窗口子菜单项"),
        ("editor", "窗口-节点管理器", "click", "nav", f"{E}:1749", "千星沙箱 > 服务器节点图资源管理器 > 窗口",
         "窗口子菜单项"),
        ("editor", "窗口-资源管理器", "click", "nav", f"{E}:1749", "千星沙箱 > 服务器节点图资源管理器 > 窗口",
         "窗口子菜单项"),
        # ---- 多人试玩房间
        ("editor", "邀请按钮（房间）", "click", "create", f"{E}:1548", "多人试玩 > 房间功能 > 玩家邀请",
         "邀请玩家加入试玩房间"),
        ("editor", "房间收起按钮", "click", "nav", f"{E}:1644", "多人试玩 > 试玩设置 > 房间收起",
         "收起房间面板"),
        ("editor", "房间解散按钮", "click", "destructive", f"{E}:1640", "多人试玩 > 试玩设置 > 房间解散",
         "解散多人试玩房间（C 级不可逆）"),
        # ---- 试玩局内控制
        ("editor", "继续挑战", "click", "nav", f"{E}:1485", "试玩 > 试玩局内控制",
         "试玩控制面板项"),
        ("editor", "重新挑战", "click", "nav", f"{E}:1489", "试玩 > 试玩局内控制",
         "试玩控制面板项"),
        ("editor", "中断挑战", "click", "destructive", f"{E}:1495", "试玩 > 试玩局内控制",
         "试玩控制面板项（退出试玩）"),
        # ---- 辅源：负载计算/风险检查/日志/信号 的关键控件（正文用粗体/叙述给出）
        ("aux", "静态负载按钮（菜单栏）", "click", "nav", f"{A}:70", "负载计算功能 > 静态负载计算-全局",
         "菜单栏的静态负载入口"),
        ("aux", "查看负载情况", "click", "nav", f"{A}:92", "负载计算功能 > 静态负载计算-区域",
         "展开区域负载详情"),
        ("aux", "仅显示负载超标区域", "toggle", "setting", f"{A}:104",
         "负载计算功能 > 静态负载计算-区域 > 区域负载占用总览", "默认勾选"),
        ("aux", "开启负载测试", "toggle", "setting", f"{A}:163", "负载计算功能 > 动态负载计算",
         "开启动态负载测试开关（负载检测窗口内）"),
        ("aux", "负载检测窗口", "click", "nav", f"{A}:159", "负载计算功能 > 动态负载计算",
         "千星沙箱 → 窗口 → 负载检测"),
        ("aux", "风险检查入口", "click", "nav", f"{A}:270", "风险检查功能", "菜单栏风险检查"),
        ("aux", "开启节点图日志", "toggle", "setting", f"{A}:1470", "节点图日志",
         "节点图日志窗口内的日志开关"),
        ("aux", "节点图日志-目标节点图选择", "click", "nav", f"{A}:1527", "客户端节点图日志 > 调试流程",
         "选取目标节点图"),
        ("aux", "节点图调试模式", "toggle", "setting", f"{A}:1549", "客户端节点图日志 > 调试流程",
         "进入节点图调试模式"),
        # ---- ui 源：界面控件组管理的编辑按键处
        ("ui", "打开玩家编辑", "click", "nav", f"{U}:2788", "界面控件组管理 > 参数配置窗口",
         "跳转职业配置界面"),
        ("ui", "添加界面控件", "click", "create", f"{U}:2753", "界面控件组管理 > 界面布局详情",
         "给当前界面布局添加界面控件"),
        ("ui", "添加界面控件模版", "click", "create", f"{U}:2844", "界面控件组管理 > 界面控件组详情",
         "以预制界面控件资产创建界面控件组"),
        ("ui", "创建组合", "click", "create", f"{U}:2848", "界面控件组管理 > 界面控件组详情",
         "右键或编辑按键处的【创建组合】"),
        ("ui", "保存控件组", "click", "create", f"{U}:2848", "界面控件组管理 > 界面控件组详情",
         "单个控件保存为界面控件组"),
        ("ui", "另存为模板", "click", "create", f"{U}:2901", "界面控件组管理 > 编辑按键处",
         "另存为新的界面控件组模板"),
        ("ui", "解散组合", "click", "destructive", f"{U}:2895", "界面控件组管理 > 编辑按键处",
         "拆散组合并删除组合"),
        ("ui", "重命名（自定义模板右键）", "click", "setting", f"{U}:2800",
         "界面控件组管理 > 界面控件组自定义模板", "右键菜单项"),
        ("ui", "删除模板", "click", "destructive", f"{U}:2806",
         "界面控件组管理 > 界面控件组自定义模板", "会连引用一起删除"),
        ("ui", "界面布局-复制", "click", "create", f"{U}:2741", "界面控件组管理 > 界面布局",
         "右键菜单项"),
        ("ui", "界面布局-粘贴", "click", "create", f"{U}:2741", "界面控件组管理 > 界面布局",
         "右键菜单项"),
        ("ui", "界面布局-重命名", "click", "setting", f"{U}:2741", "界面控件组管理 > 界面布局",
         "右键菜单项"),
        ("ui", "设备切换（预览窗口）", "click", "nav", f"{U}:2780", "界面控件组管理 > 界面布局预览窗口",
         "切换设备做对比"),
        # ---- 散文/图片里描述、无统一控件名的操作点（第二轮补）
        ("editor", "统一高度（按住Alt后点击）", "click", "scene", f"{E}:642", "地形编辑 > 快捷操作",
         "按住 Alt 后首次点击取层数，后续点击按该层数统一高度"),
        ("editor", "快捷生成（按住Shift后拖移点击）", "click", "scene", f"{E}:671", "地形编辑 > 快捷操作",
         "按住 Shift 点起点、悬停预览、点终点生成"),
        ("editor", "加载外部资产（右下角）", "click", "create", f"{E}:2014",
         "资产导入导出 > 本地资产导入/加载流程", "导入本地文件夹资产到资产库页签"),
        ("editor", "导入与转存页签", "click", "nav", f"{E}:2010",
         "资产导入导出 > 本地资产导入/加载流程", "本地资产导入的操作落点"),
        ("editor", "显示类型-仅尺寸", "click", "setting", f"{E}:2467", "编辑工具 > 包围盒显示",
         "包围盒显示类型三选一"),
        ("editor", "显示类型-包围盒及尺寸", "click", "setting", f"{E}:2471", "编辑工具 > 包围盒显示", ""),
        ("editor", "显示类型-碰撞及尺寸", "click", "setting", f"{E}:2475", "编辑工具 > 包围盒显示",
         "仅物件实体可用"),
        ("editor", "显示Z轴", "toggle", "setting", f"{E}:2481", "编辑工具 > 备注功能",
         "详情栏底部编辑工具区的 Z 轴控件开关"),
        ("editor", "3D备注", "toggle", "setting", f"{E}:2497", "编辑工具 > 备注功能",
         "3D 备注的显示开关"),
        ("editor", "备注文本常驻显示（关卡设置）", "toggle", "setting", f"{E}:2517",
         "编辑工具 > 备注功能", "关卡设置里的全局备注显示控制"),
        ("editor", "模型数据复制", "click", "create", f"{E}:2531", "编辑工具 > 模型数据复制粘贴",
         "模型 → 复制（含主模型与装饰物）"),
        ("editor", "多选位置信息显示", "click", "nav", f"{E}:2539", "编辑工具 > 多选显示中心点位置信息",
         "多选后在场景层/摆放层显示位置"),
        ("editor", "千星沙箱-页签拖拽换序", "drag", "nav", f"{E}:1699", "千星沙箱 > 千星沙箱界面样式",
         "多页签时拖拽更换顺序"),
        ("editor", "千星沙箱-拉出创建子窗口", "drag", "nav", f"{E}:1699", "千星沙箱 > 千星沙箱界面样式",
         "把页签拉出成独立子窗口"),
        ("editor", "环形阵列-角度", "set", "scene", f"{E}:2367", "编辑工具 > 阵列生成 > 环形阵列",
         "输入角度间隔"),
        ("editor", "环形阵列-数量", "set", "scene", f"{E}:2367", "编辑工具 > 阵列生成 > 环形阵列",
         "输入阵列数量"),
        ("editor", "资产栏页签-自定义元件", "click", "nav", f"{E}:952", "元件库 > 资产栏详情",
         "资产栏页签切换"),
        ("editor", "资产栏页签-基础模块元件", "click", "nav", f"{E}:962", "元件库 > 资产栏详情",
         "资产栏页签切换（预制元件）"),
        ("editor", "资产栏页签-资产库", "click", "nav", f"{E}:976", "元件库 > 资产栏详情",
         "资产栏页签切换（本地资产）"),
    ]


# 规则命中但判定「不是操作点」的条目：key = (src, control) 或 (src, 正则)
EXCLUDE_CONTROLS = {
    # ---- 概念/对象类型：是被操作的对象，不是可触发控件
    ("editor", "地形"), ("editor", "静态物件"), ("editor", "动态物件"), ("editor", "造物"),
    ("editor", "物件实体"), ("editor", "造物实体"), ("editor", "掉落物实体"),
    ("editor", "地块材质"), ("editor", "自定义元件"), ("editor", "预制元件"), ("editor", "资产库"),
    ("editor", "环境配置"),
    # ---- 详情面板的属性「值」展示而非可触发控件（保留其承载卡片，见 R9）
    ("aux", "参数"),
    ("ui", "参数"),
    ("editor", "静态物件、动态物件、造物"),
    ("editor", "左侧资产栏"), ("editor", "右侧详情栏"),
    ("editor", "撤销和还原按钮"),
    ("editor", "页签栏第一个按钮"), ("editor", "页签栏第二个图标"), ("editor", "页签栏第三个图标"),
    ("editor", "上方按钮"), ("editor", "内容"), ("editor", "至本页签"),
    ("editor", "左侧为元件库资产栏"), ("editor", "左侧独立小窗为资源管理器"),
    ("editor", "按钮功能从左至右分别为："),
    ("editor", "使用者可进行行为"), ("editor", "房主可进行行为"), ("editor", "受邀玩家可进行行为"),
    ("editor", "元件导出时"), ("editor", "实体导出时"),
    # 举例与节点引脚（不是编辑器控件）
    ("aux", "受击计分"), ("aux", "目标实体"), ("aux", "变量名"),
    ("aux", "设置自定义变量"), ("aux", "获取自定义变量"),
    ("aux", "某个大门打开"), ("aux", "几个火把上燃起火焰"),
    ("aux", "本次新增功能"), ("aux", "日志系统"),
    ("aux", "向关卡暴露节点图变量功能"), ("aux", "向关卡暴露节点图变量操作"),
    ("ui", "官方章节"), ("ui", "不同设备在16"), ("ui", "链条按钮"),
}

EXCLUDE_RE = [
    # (src, 正则, 理由)
    ("editor", r"^图$", "纯图占位"),
    ("editor", r"^\[图\]$", "纯图占位"),
    ("editor", r"^注", "注释行"),
    ("editor", r"^例", "示例行"),
    ("editor", r"^(官方页|来源|状态|适用范围|证据层级|维护说明)", "文档头信息"),
    ("editor", r"^(支持|不支持|建议|需要|如果|通过|由于|因为)", "叙述句"),
    ("aux", r"^(官方页|来源|状态|适用范围|证据层级|维护说明)", "文档头信息"),
    ("ui", r"^(官方页|来源|状态|适用范围|证据层级|维护说明)", "文档头信息"),
    ("ui", r"^(支持|不支持|建议|需要|如果|通过|由于|因为)", "叙述句"),
]

# kind/action 人工覆盖（少数控件的词面分类会误导）
KIND_OVERRIDE = {
    ("editor", "地形编辑"): "nav", ("editor", "实体摆放"): "nav",
    ("editor", "元件库"): "nav", ("editor", "战斗预设"): "nav",
    ("editor", "试玩"): "nav", ("editor", "多人试玩"): "nav",
    ("editor", "退出存档"): "nav", ("editor", "保存当前存档"): "create",
    ("editor", "关卡设置"): "nav", ("editor", "基础"): "nav",
    ("editor", "负载优化"): "setting", ("editor", "物件编辑"): "nav",
    ("editor", "日志"): "nav", ("editor", "负载检测"): "nav",
    ("editor", "移动至等候区"): "nav", ("editor", "移至等候区"): "nav",
    ("editor", "储存路径"): "setting", ("editor", "请离限制"): "setting",
    ("editor", "收起"): "nav", ("editor", "房间收起按钮"): "nav",
    ("editor", "准备"): "nav", ("editor", "准备区"): "nav",
    ("editor", "等候区"): "nav", ("editor", "加入准备区"): "nav",
    ("editor", "开始游戏"): "nav", ("editor", "继续挑战"): "nav",
    ("editor", "重新挑战"): "nav", ("editor", "试玩控制"): "nav",
    ("editor", "邀请"): "create", ("editor", "邀请玩家"): "create",
    ("editor", "邀请按钮（房间）"): "create",
    ("editor", "分割"): "scene", ("editor", "资产导出"): "create",
    ("editor", "角色假人"): "create", ("editor", "归属元件"): "setting",
    ("editor", "阵列"): "create", ("editor", "对称"): "create",
    ("editor", "测距线"): "create", ("editor", "归属元件"): "setting",
    ("editor", "退出"): "nav", ("editor", "确认创建"): "create",
}

# 控件名归一（同义合并）
RENAME = {
    ("editor", "系统菜单按钮"): "系统菜单图标",
    ("editor", "左上角系统菜单按钮"): "系统菜单图标",
    ("editor", "菜单图标"): "系统菜单图标",
    ("editor", "系统菜单图标（左上角）"): "系统菜单图标",
    ("editor", "资产栏图标（左上角）"): "资产栏图标",
    ("editor", "快捷设置图标（右上角）"): "快捷设置图标",
    ("editor", "设置图标"): "快捷设置图标",
    ("editor", "详情按钮（右上角）"): "详情按钮",
    ("editor", "性别按钮"): "切换性别按钮",
    ("editor", "栏的物件图标"): "资产栏物件图标",
    ("editor", "资产栏中对应图标"): "资产栏物件图标",
    ("editor", "素材栏任意材质按钮"): "素材栏材质按钮",
    ("editor", "结束绘制_按钮"): "结束绘制按钮",
    ("editor", "创作者(奇匠)等级和创作者(奇匠)权限查看"): "创作者等级与权限",
    ("editor", "存档界面"): "打开存档界面",
}


# ---------------------------------------------------------------- 主流程

def collect(include_ui_widgets=False):
    rows = []
    stats = {"files": {}, "rules": collections.Counter(), "excluded": collections.Counter(),
             "blocked": []}
    for src, rel, include in SOURCES:
        p = ROOT / rel
        fname = p.name
        recs = parse(p)
        if include is not None and include_ui_widgets and src == "ui":
            include = tuple(include) + (UI_WIDGET_DETAIL_TITLE,)
        scoped = [r for r in recs if in_scope(r, include)]

        # 项目符号块：head=bullet 行，body=其后到下一个 bullet/heading 的 text 行
        blocks = []
        i = 0
        while i < len(scoped):
            rec = scoped[i]
            if rec.kind == "bullet":
                body = []
                j = i + 1
                while j < len(scoped) and scoped[j].kind == "text":
                    body.append(scoped[j])
                    j += 1
                if body:
                    blocks.append((body[0], body[1:]))
                else:
                    # 无正文的符号行：把它自己当作标题
                    blocks.append((rec, []))
                i = j
                continue
            i += 1

        before = len(rows)
        rule_bullet_block(rows, src, fname, blocks)
        rule_plain_kv(rows, src, fname, scoped)
        rule_bracket(rows, src, fname, scoped)
        rule_prose_noun(rows, src, fname, scoped)
        if src != "editor":
            rule_bold(rows, src, fname, scoped)
        rule_table(rows, src, fname, scoped)
        rule_nav_path(rows, src, fname, scoped)
        rule_shortcut(rows, src, fname, scoped)
        rule_heading_controls(rows, src, fname, scoped, {"详情编辑", "基础"})
        stats["files"][src] = {"path": rel, "lines": len(p.read_text(encoding='utf-8').split('\n')),
                               "raw_rows": len(rows) - before}

    # 人工补充
    for (src, control, action, kind, ref, path, note) in curated_extra():
        add(rows, src, 0, path, control, action, kind, ref, note, "R10-curated")
    return rows, stats


def _norm_for_compare(c: str) -> str:
    c = re.sub(r"（[^）]*）|\([^)]*\)", "", c)
    c = re.sub(r"(按钮|图标|开关|页签|滑块)$", "", c)
    return re.sub(r"[\s_\-]", "", c)


def normalize(rows):
    out = []
    for r in rows:
        r.control = re.sub(r"\s+", " ", RENAME.get((r.src, r.control), r.control)).strip()
        r.kind = KIND_OVERRIDE.get((r.src, r.control), r.kind)
        if not r.control:
            continue
        # 排除表
        if (r.src, r.control) in EXCLUDE_CONTROLS:
            continue
        blocked = None
        for (src, pat, why) in EXCLUDE_RE:
            if src == r.src and re.search(pat, r.control):
                blocked = why
                break
        if blocked:
            continue
        out.append(r)
    return out


def drop_shadowed_curated(rows):
    """人工补充条目与规则条目同义时只留一条：
    - 规则条目「确定」→ 丢人工条目（规则更可复算）
    - 规则条目标了「待界面确认」→ 丢规则条目（人工条目带更准的口径）"""
    rule_rows = [r for r in rows if r.rule != "R10-curated"]
    curated = [r for r in rows if r.rule == "R10-curated"]
    drop = set()
    dropped_curated = dropped_rule = 0
    for c in curated:
        cc = _norm_for_compare(c.control)
        shadow = []
        for o in rule_rows:
            if o.src != c.src or o.action != c.action:
                continue
            if not (o.path == c.path or o.path.startswith(c.path + " > ")
                    or c.path.startswith(o.path + " > ")):
                continue
            oc = _norm_for_compare(o.control)
            if oc and (oc == cc or cc.endswith(oc) or oc.endswith(cc)):
                shadow.append(o)
        if not shadow:
            continue
        if any("待界面确认" not in (o.note or "") for o in shadow):
            drop.add(id(c))
            dropped_curated += 1
        else:
            for o in shadow:
                drop.add(id(o))
                dropped_rule += 1
    return [r for r in rows if id(r) not in drop], dropped_curated + dropped_rule


def dedupe(rows):
    """(path, control, action) 唯一；同键保留首条，并记录出现次数。"""
    seen = {}
    kept = []
    for r in rows:
        key = (r.src, r.path, r.control, r.action)
        if key in seen:
            seen[key].note = seen[key].note or ""
            continue
        seen[key] = r
        kept.append(r)
    # 同一路径同一动作下，「筛选」与「筛选按钮」这类同义只留一条
    seen_norm = set()
    keep1 = []
    for r in kept:
        k = (r.src, r.path, r.action, _norm_for_compare(r.control))
        if k in seen_norm:
            continue
        seen_norm.add(k)
        keep1.append(r)
    kept = keep1

    keep2 = []
    for r in kept:
        c = _norm_for_compare(r.control)
        shadow = False
        for other in kept:
            if other is r or other.path != r.path or other.action != r.action:
                continue
            o = _norm_for_compare(other.control)
            # 只收「X按钮/X图标 ← X」这一类同义（避免「多人试玩」被「试玩」吞掉）
            if not re.search(r"(按钮|图标|开关|页签|滑块)$", other.control):
                continue
            if o and o != c and len(o) < len(c) and c.endswith(o) and len(c) - len(o) <= 4:
                shadow = True
                break
        if not shadow:
            keep2.append(r)
    kept = keep2

    # 同一控件在多个模式/多个路径下出现 -> doc note
    by_control = collections.defaultdict(set)
    for r in kept:
        by_control[(r.src, r.control)].add(r.path)
    for r in kept:
        paths = by_control[(r.src, r.control)]
        if len(paths) > 1:
            tag = "同名控件在多处出现（%d 处），按路径分别计点" % len(paths)
            r.note = (r.note + "；" + tag) if r.note else tag
    return kept, seen


SRC_ORDER = {"editor": 0, "aux": 1, "ui": 2}


def finalize(rows):
    rows.sort(key=lambda r: (SRC_ORDER.get(r.src, 9), r.no, r.control))
    for i, r in enumerate(rows, 1):
        r.id = "D%03d" % i
    return rows


def write_tsv(rows):
    lines = ["\tid\tpath\tcontrol\taction\tkind\tdoc_ref\tnote".strip()]
    for r in rows:
        cells = [r.id, r.path, r.control, r.action, r.kind, r.doc_ref, r.note]
        cells = [re.sub(r"[\t\n\r]+", " ", str(c)) for c in cells]
        lines.append("\t".join(cells))
    OUT_TSV.parent.mkdir(parents=True, exist_ok=True)
    OUT_TSV.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return len(lines) - 1


def load_tsv():
    p = OUT_TSV
    if not p.exists():
        return []
    lines = p.read_text(encoding="utf-8").split("\n")
    head = lines[0].split("\t")
    out = []
    for ln in lines[1:]:
        if not ln.strip():
            continue
        c = ln.split("\t")
        out.append(dict(zip(head, c)))
    return out


# ---------------------------------------------------------------- 报告

def dist(rows, key):
    c = collections.Counter(r[key] if isinstance(r, Row) else r[key] for r in rows)
    return c


def pct(a, b):
    return "%.1f%%" % (100.0 * a / b) if b else "-"


def md_table(header, data):
    out = ["| " + " | ".join(header) + " |", "|" + "|".join(["---"] * len(header)) + "|"]
    for row in data:
        out.append("| " + " | ".join(str(x) for x in row) + " |")
    return "\n".join(out)


def category_of(path):
    return path.split(" > ")[0] if path else "(无路径)"


def section_audit(rows, include_ui_widgets=False):
    """每个 ##/### 小节里落了多少操作点；零产出的小节是「可能漏」的候选。"""
    out = []
    for src, rel, include in SOURCES:
        p = ROOT / rel
        recs = parse(p)
        if include is not None and include_ui_widgets and src == "ui":
            include = tuple(include) + (UI_WIDGET_DETAIL_TITLE,)
        scoped = [r for r in recs if in_scope(r, include)]
        heads = [r for r in scoped if r.kind == "heading" and len(r.stack) <= 3]
        refs = [(r, int(r.doc_ref.split(":")[1])) for r in rows if r.src == src]
        for i, h in enumerate(heads):
            end = heads[i + 1].no if i + 1 < len(heads) else 10 ** 9
            n = sum(1 for (_, ln) in refs if h.no <= ln < end)
            if n == 0 and 4 < (end - h.no) < 400 and h.no > 20:
                out.append((src, h.no, h.stack[-1][2], end - h.no))
    return out


def write_report(rows, stats, opts):
    n = len(rows)
    kinds = collections.Counter(r.kind for r in rows)
    acts = collections.Counter(r.action for r in rows)
    cats = collections.Counter(category_of(r.path) for r in rows)
    srcs = collections.Counter(r.src for r in rows)
    rules = collections.Counter(r.rule for r in rows)

    def table(counter, label, total=n):
        data = [(k, v, pct(v, total)) for k, v in counter.most_common()]
        data.append(("**合计**", total, "100.0%"))
        return md_table([label, "数量", "占比"], data)

    cross = collections.defaultdict(collections.Counter)
    for r in rows:
        cross[category_of(r.path)][r.kind] += 1
    kind_order = ["nav", "setting", "create", "destructive", "scene"]
    cross_rows = []
    for cat, cnt in sorted(cross.items(), key=lambda kv: -sum(kv[1].values())):
        cross_rows.append([cat, sum(cnt.values())] + [cnt.get(k, 0) for k in kind_order])
    cross_tbl = md_table(["大类", "合计"] + kind_order, cross_rows)

    rule_names = {
        "R1-bullet-kv": "项目符号块内「控件：说明」",
        "R1-paren": "项目符号块内「控件（触发方式）- 说明」",
        "R1-bullet-title": "项目符号块标题（后文补语义）",
        "R11-list": "顿号并列枚举拆点",
        "R2-plain-kv": "无符号「控件：说明」行（快捷设置等）",
        "R2-italic": "斜体配置项「_控件_：说明」",
        "R3-bracket": "正文【按钮名】",
        "R4-prose-noun": "散文「点击 XX 按钮/开关/页签/图标」",
        "R4-prose-verb": "散文「点击XX可…」从句中抽出",
        "R5-shortcut": "快捷键叙述（Ctrl+/ESC/Delete/空格/鼠标键）",
        "R6-bold": "辅源粗体界面元素",
        "R7-table-config": "表格「配置参数|说明」行",
        "R7-table-key": "表格「动作|按键」行",
        "R8-nav-path": "导航叙述（系统菜单——X / 右键菜单 → X）",
        "R9-heading": "标题即控件（详情面板属性卡 / 关卡设置设置项）",
        "R10-curated": "人工补充（规则识别不到但判定是操作点）",
    }
    rule_tbl = md_table(["规则", "含义", "贡献条数", "占比"],
                        [[k, rule_names.get(k, k), v, pct(v, n)] for k, v in rules.most_common()])

    src_names = {"editor": "official-guide-editor-interface.md（主源）",
                 "aux": "official-guide-auxiliary-appendix.md（辅助功能段）",
                 "ui": "official-ui-tutorial.md（界面控件组管理段）"}
    src_tbl = md_table(["源文件", "总行数", "贡献条数", "占比"],
                       [[src_names[s], stats["files"][s]["lines"], v, pct(v, n)]
                        for s, v in srcs.most_common()])

    pending = [r for r in rows if "待界面确认" in (r.note or "")]
    pend_tbl = md_table(["id", "path", "control", "doc_ref"],
                        [[r.id, r.path, r.control, r.doc_ref] for r in pending[:40]])
    curated = [r for r in rows if r.rule == "R10-curated"]
    multi = [r for r in rows if "同名控件在多处出现" in (r.note or "")]
    audit = section_audit(rows, opts.include_ui_widgets)
    audit_tbl = md_table(["源", "起始行", "小节", "小节行数"],
                         [[a[0], a[1], a[2], a[3]] for a in audit]) if audit else "（无）"

    widget_note = ""
    if not opts.include_ui_widgets:
        rows2, _ = collect(True)
        rows2 = normalize(rows2)
        rows2, _ = drop_shadowed_curated(rows2)
        rows2, _ = dedupe(rows2)
        widget_note = ("用 `--include-ui-widgets` 重跑可看到这一层的量：总数会从 "
                       f"{n} 变成 **{len(rows2)}**（+{len(rows2) - n} 条，"
                       "即 19 种界面控件的属性面板配置项）。是否进分母需与 B 通道口径一起裁决。")
    else:
        widget_note = "本次运行已把 19 种界面控件的属性面板计入。"

    n_fig = sum(1 for src, rel, _ in SOURCES
                 for line in (ROOT / rel).read_text(encoding="utf-8").split("\n")
                 if line.strip() == "[图]")
    n_menu = sum(1 for r in rows if r.path.startswith("系统菜单"))
    n_tab = sum(1 for r in rows if r.path.startswith("模式切换"))
    n_card = sum(1 for r in rows if r.rule == "R9-heading")

    body = f"""# 千星编辑器操作面 · 分母 A（文档面）抽取报告

> 状态：当前实现（机器抽取产物）。生成器 `tools/ys-docops/ys_docops.py`；重跑命令见文末。
> 本文所有计数都由抽取器当场算出；清单本体 = `.scratch/gui-stack/ops-inventory-doc.tsv`。
> A 通道只回答「官方文档写了哪些可独立触发的交互元素」。**文档没写 ≠ 界面上没有**——那是 B 通道的事。

## 一、总数与分布

**操作点总数：{n}**（分母 A）。

### 1. 按 kind

{table(kinds, "kind")}

kind 口径：`nav`=导航/开关面板/切页签；`setting`=改设置项；`create`=新建/复制/导入类；
`destructive`=删除/上传/覆盖/解散类；`scene`=场景操作（地形笔刷/相机/阵列/对称/测距）。

### 2. 按动作

{table(acts, "action")}

`shortcut` 占 {acts.get("shortcut", 0)} 条，主要是相机操作（文档只给快捷键表）与各模式下的
ESC/空格/Delete/Ctrl+Z 类叙述。

### 3. 按来源文件

{src_tbl}

非主源两份文档**只取与编辑器操作面有关的章节**（辅助功能里的负载计算/风险检查/节点图日志×3/信号；
UI 教程里的界面控件组管理/界面布局/界面控件组），理由见第五节。

### 4. 按大类（path 首段）

{table(cats, "大类")}

### 5. 大类 × kind 交叉

{cross_tbl}

## 二、抽取规则

抽取器把文档的八种书写形态分别解析成一行一个操作点。命中量：

{rule_tbl}

判据（每条都能用 `extract` 重跑验证）：

1. **只有可独立触发的元素才收**：`名称：说明` / `名称（触发方式）- 说明` / `【名称】` 三种写法里，
   名称必须落在一个具体控件上；`功能`/`打开方式`/`操作逻辑`/`使用条件`/`注意事项` 这类**叙述元信息键**
   一律不收（`META_KEYS`，当前 {len(META_KEYS)} 个键）。
2. **步骤叙述拆点**：文档写「A、B、C 三个按钮」时按顿号/和字拆成 N 个操作点（`R11-list`）。
   系统菜单的 {n_menu} 个条目就是这样从**三句散文**里拆出来的，不拆就只有 3 行。
3. **同一控件在不同模式下算不同点**：path 由标题栈生成，`地形编辑 > …` 与 `实体摆放 > …` 天然分行；
   若同一控件名出现在 ≥2 条路径，note 会记 `同名控件在多处出现（N 处），按路径分别计点`（本次 {len(multi)} 条）。
4. **宁多勿漏**：识别到控件名但无法确认是否真可交互的，`note=待界面确认` 保留（本次 {len(pending)} 条），
   留到与 B 通道对账时再裁。
5. **去重键 = (源, path, control, action)**：同一控件同一路径只算一个点；同路径下「筛选」与「筛选按钮」
   这类超串只留一条；不同路径/不同动作不合并。
6. **句子不是控件**：含 `的/了/是/为/并/包含/如下/主要功能/可以/然后/直接` 等叙述标记的候选一律不收；
   `[图]`/`视频播放器噪声`/`官方页` 等文档脚手架也不收。

## 三、人工裁量清单（都在抽取器里，改它等于改分母）

### 1. 补充：规则识别不到但判定是操作点（`R10-curated`，{len(curated)} 条）

两类：①官方正文用**散文**描述、没有统一控件名的顶栏元素（系统菜单图标 / 资产栏图标 / 快捷设置图标 /
详情按钮 / 顶部四个模式页签）；②只写在「操作流程/功能入口」里的动作（加载外部资产、显示类型三选一、
显示Z轴、3D备注、统一高度、快捷生成、环形阵列角度/数量…）。每条都带 `doc_ref`，可逐条回原文核对。

### 2. 排除：规则命中但不是操作点

- 被操作的对象名词：地形、静态物件、动态物件、造物、物件实体、造物实体、掉落物实体、地块材质、
  自定义元件、预制元件、资产库、环境配置 —— 触发它们的是按钮，它们本身不是控件。
- 举例与节点引脚：`受击计分`、`目标实体`、`变量名`、`设置自定义变量`、`某个大门打开` 等。
- 文档头信息（官方页/来源/状态/适用范围/证据层级/维护说明）与叙述句（`支持…`/`可以通过…`）。

### 3. 待界面确认（{len(pending)} 条）

{pend_tbl if pending else "（无）"}

### 4. 同名控件多路径（{len(multi)} 条已打标）

同名控件在不同模式/不同面板下重复出现是**有意保留**的：判据说「同一控件在不同模式下算不同操作点」。

## 四、小节覆盖率审计（自己找自己漏了什么）

对每个 `##`/`###` 小节统计落点数；下面这些小节**行数不少但零产出**，是「可能漏」的机械证据：

{audit_tbl}

逐条解释（三类）：①`资源管理器`/`节点管理器`/`日志`/`服务器信号管理器`/`负载检测`/`千星沙箱界面样式`
写的是"面板能干什么"（散文），**没有控件名**，抽不出来；②`节点图变量的编辑`/`复合节点的结构`/
`负载计算功能概述`/`风险检查功能是什么` 是原理章节；③`资产使用流程`/`引用关系恢复` 的控件名藏在步骤
叙述与截图里，能补的已由 `R10-curated` 补，剩下的见第五节第 1 条。

## 五、可能漏 / 可能多（对账时要裁的地方）

### 可能漏（三处，按量排序）

1. **只在图片里的控件**：三份文档共 {n_fig} 处 `[图]` 占位，大量控件的名字只存在于截图（详情栏每张卡的按钮、
   底部工具栏的具体图标、工具栏按钮）。文字只写「如图所示」→ A 通道补不了，靠 B 通道（爬取面）补。
2. **19 种界面控件的属性面板**（`official-ui-tutorial.md` 主体）默认未计入。{widget_note}
3. **需要前置条件才出现的控件**：未选实体时的详情面板、多人房间（要第二名玩家）、上传资产页面（要在线
   环境）——文档写了入口但字段级控件只给图。本清单在这些位置只到「面板/页签」这一层。

### 可能多（三处）

1. **`R7-table-config`（属性面板配置项，{rules.get("R7-table-config", 0)} 条）**：这些是 setting 类操作点；若对账口径认为「同一属性面板的多个
   控件共享一个操作点」，这一层会偏多。
2. **`R5-shortcut`（{acts.get("shortcut", 0)} 条）**：快捷键是同一控件的**另一个入口**。本清单按「可观测差异不同」
   （键盘可绕过鼠标路径）保留；若最终口径是「按控件计、不按入口计」，这一层要合并。
3. **`R1-bullet-title`**：项目符号标题里有些是**分组标题**（变换处理工具/笔刷模式族），本清单把它们当作
   可切换的工具项收录；如果它们是纯标签，会多算。

## 六、证伪记录（我自己推翻的判断）

1. **以为系统菜单是三行**：原文是三句散文，`、` 并列了 40 多个菜单项 → 拆点后拿到 {n_menu} 个点。
   第一版抽取器没拆点，整份清单少算近 40 条。
2. **以为「详情面板」只有一个控件**：`实体摆放 > 详情编辑` 下有 12 张属性卡（变换/模型/原生碰撞/可见性/
   创建设置/阵营/单位标签/实体布设组/负载优化/音效/引用源/备注），每张可独立展开 → 由标题派生（`R9`），
   共 {n_card} 条，正文句子里根本没写。
3. **以为 `official-ui-tutorial.md` 全是编辑器操作点**：读结构后确认它主体是**19 种游戏内界面控件的制作**，
   属「被 authored 的对象」而非编辑器自身控件 → 默认不计，只取其中的界面控件组管理/布局/控件组章节。
4. **以为辅源附录全是数据表**：实际含 6 个编辑器面板（负载计算/风险检查/节点图日志×3/信号配置/节点图变量/
   复合节点编辑），已纳入；而「字典/结构体」两章是数据类型概念，第一版误收 28 条后被剔除。
5. **规则写错两次、被自己的输出打回**：①把单字前缀 `可`/`该` 当叙述句，误杀「可见性」等真控件；
   ②把 `图` 当纯图占位前缀，误杀「图片素材」。两次都是靠逐条 dump 结果发现的，不是靠读代码。

## 七、可复算命令

```bash
python3 tools/ys-docops/ys_docops.py extract   # 重写 ops-inventory-doc.tsv
python3 tools/ys-docops/ys_docops.py report    # 重写本报告
python3 tools/ys-docops/ys_docops.py check     # 校验：列数/id 连续/action·kind 合法/doc_ref 行号在源文件内/无重复键
python3 tools/ys-docops/ys_docops.py stats     # 终端看分布
python3 tools/ys-docops/ys_docops.py trace D001  # 看某条属于哪条规则、出处行
```

源文件与行数：

{md_table(["源", "文件", "行数"], [[k, v["path"], v["lines"]] for k, v in stats["files"].items()])}
"""
    OUT_MD.write_text(body, encoding="utf-8")
    return n


SOURCES_LOOKUP = {
    "editor": ("official-guide-editor-interface.md",),
    "aux": ("official-guide-auxiliary-appendix.md",),
    "ui": ("official-ui-tutorial.md",),
}


# ---------------------------------------------------------------- CLI

def main(argv=None):
    ap = argparse.ArgumentParser(description="千星编辑器操作面 · 分母 A（文档面）抽取器")
    ap.add_argument("cmd", choices=["extract", "report", "check", "stats", "trace"],
                    nargs="?", default="extract")
    ap.add_argument("arg", nargs="?")
    ap.add_argument("--include-ui-widgets", action="store_true",
                    help="把 19 种界面控件的属性面板也计入（默认不计）")
    opts = ap.parse_args(argv)

    rows, stats = collect(opts.include_ui_widgets)
    rows = normalize(rows)
    rows, _shadowed = drop_shadowed_curated(rows)
    rows, _seen = dedupe(rows)
    rows = finalize(rows)

    if opts.cmd == "extract":
        n = write_tsv(rows)
        print(f"[extract] {OUT_TSV.relative_to(ROOT)}  {n} 行")
        for k, v in collections.Counter(r.kind for r in rows).most_common():
            print(f"  kind {k:12s} {v}")
        return 0

    if opts.cmd == "report":
        n = write_report(rows, stats, opts)
        print(f"[report] {OUT_MD.relative_to(ROOT)}  总数 {n}")
        return 0

    if opts.cmd == "stats":
        n = len(rows)
        print(f"总数 {n}")
        for label, key in (("kind", "kind"), ("action", "action"), ("src", "src")):
            print(f"-- by {label}")
            for k, v in collections.Counter(getattr(r, key) for r in rows).most_common():
                print(f"  {k:14s} {v:4d}  {pct(v, n)}")
        print("-- by 大类")
        for k, v in collections.Counter(category_of(r.path) for r in rows).most_common():
            print(f"  {k:22s} {v:4d}  {pct(v, n)}")
        print("-- by rule")
        for k, v in collections.Counter(r.rule for r in rows).most_common():
            print(f"  {k:18s} {v:4d}")
        return 0

    if opts.cmd == "trace":
        rid = opts.arg
        hit = [r for r in rows if r.id == rid]
        if not hit:
            print(f"没有 {rid}")
            return 1
        r = hit[0]
        print(json.dumps({k: getattr(r, k) for k in
                          ("id", "path", "control", "action", "kind", "doc_ref", "note", "rule")},
                         ensure_ascii=False, indent=2))
        return 0

    # check
    problems = []
    tsv = load_tsv()
    if len(tsv) != len(rows):
        problems.append(f"TSV 行数 {len(tsv)} != 抽取结果 {len(rows)}（先跑 extract）")
    for i, row in enumerate(tsv, 1):
        if len(row) != 7:
            problems.append(f"第 {i} 行列数 {len(row)} != 7")
            continue
        if row["id"] != "D%03d" % i:
            problems.append(f"第 {i} 行 id={row['id']} 期望 D{i:03d}")
        if row["action"] not in {"click", "toggle", "set", "drag", "scroll", "shortcut"}:
            problems.append(f"{row['id']} action 非法: {row['action']}")
        if row["kind"] not in {"nav", "setting", "create", "destructive", "scene"}:
            problems.append(f"{row['id']} kind 非法: {row['kind']}")
        if not row["doc_ref"] or ":" not in row["doc_ref"]:
            problems.append(f"{row['id']} doc_ref 非法: {row['doc_ref']}")
        f, ln = row["doc_ref"].rsplit(":", 1)
        srcfile = next((ROOT / rel for (s, rel, _) in SOURCES if pathlib.Path(rel).name == f), None)
        if srcfile is None:
            problems.append(f"{row['id']} doc_ref 文件不在源清单: {f}")
        else:
            try:
                total = len(srcfile.read_text(encoding="utf-8").split("\n"))
                if not (1 <= int(ln) <= total):
                    problems.append(f"{row['id']} 行号越界 {f}:{ln}")
            except ValueError:
                problems.append(f"{row['id']} 行号非数字 {f}:{ln}")
    keys = collections.Counter((r.src, r.path, r.control, r.action) for r in rows)
    dup = [k for k, v in keys.items() if v > 1]
    if dup:
        problems.append(f"重复键 {len(dup)} 个，例: {dup[:3]}")
    if problems:
        print("[check] 失败：")
        for p in problems[:40]:
            print("  -", p)
        return 1
    print(f"[check] OK  {len(tsv)} 行；id 连续；列数 7；action/kind 合法；doc_ref 行号全部在源文件范围内；无重复键")
    return 0


if __name__ == "__main__":
    sys.exit(main())
