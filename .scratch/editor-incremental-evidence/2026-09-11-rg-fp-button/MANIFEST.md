# 实验台账 rg-fp-button（B6 悬浮页内容差分学习）

MAP=/mnt/c/Users/touyu/AppData/LocalLow/miHoYo/原神/BeyondLocal/110170759/Beyond_Local_Save_Level/1073741920.gil
MAP_ID=1073741920
LOCKED_BEFORE=/home/h/genshin-ts/.scratch/editor-incremental-evidence/2026-09-11-rg-fp-button/raw/fpbtn-v1.gil
LOCKED_HASH=15426ce05dae3a8c2113267a11ca3331003241427f5720b72fe81ea496620397

## v1（2026-09-11 轮1：选关页详情编辑加一个交互按钮·全默认）
- 声明变化：残局挑战悬浮页(864) 详情编辑 → 添加 1 个交互按钮，默认设置
- wire 增量（CONFIRMED）：
  - 2161 页面容器（CLI 旧建，编辑器认可为宿主）：+f503 packed varint 成员列表 [1073742166]
  - 2166 新按钮记录：type=自定义按钮(15)，f504=2161（回指宿主容器），preset=预设按钮_1，
    states[常态→2167, 悬停/按下/禁用=空]，geometry 180×52，deviceSlots 4
  - 2167 新素材组记录：type=55，名「默认状态素材组」，按钮常态素材宿主
  - 布局键记录（1073741825 族，raw 260B→265B）：+5B = 一个 5 字节 varint id 追加
  - root46 审计轮转（常规）
- 语义树：未归属:悬浮交互页#1:页面容器#2:自定义按钮#1:素材组#1（按钮落位我 CLI 建的容器 2161）
- 下一轮：v2 = 同页加文本框（默认）+ 把默认按钮拖到页面左上角（两项落在不相交记录集，各自可断言）

## 结论（实现用）
按钮入页四件套：①按钮记录(root9, type15, f504=宿主) ②素材组记录(type55) ③宿主容器 f503 成员列表追加
④布局键记录成员追加 + root46。文本/按钮显示字走 state material add --member text（HUD 已验证通道）。
