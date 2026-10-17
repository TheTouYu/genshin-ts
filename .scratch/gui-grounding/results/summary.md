# 实验 A 汇总（源: results/expA.json）

| 变换 | n | 原尺度命中(err≤8) | 原尺度假命中(err>32&sc>0.8) | 原尺度中位err | 原尺度均耗时 | 多尺度命中 | 多尺度假命中 | 多尺度中位err | 多尺度均耗时 |
|---|---|---|---|---|---|---|---|---|---|
| scale0.75 | 5 | 0/5 (0.0) | 0 | 463.0px | 0.99s | 5/5 (1.0) | 0 | 0.5px | 6.33s |
| scale0.9 | 5 | 4/5 (0.8) | 0 | 5.7px | 1.13s | 5/5 (1.0) | 0 | 0.8px | 6.58s |
| scale1.1 | 4 | 2/4 (0.5) | 0 | 186.3px | 1.1s | 4/4 (1.0) | 0 | 0.9px | 6.42s |
| scale1.25 | 3 | 0/3 (0.0) | 0 | 204.1px | 0.95s | 3/3 (1.0) | 0 | 0.5px | 6.41s |
| shift+64x | 6 | 6/6 (1.0) | 0 | 0.0px | 0.98s | 6/6 (1.0) | 0 | 0.0px | 6.08s |
| shift-64x | 5 | 5/5 (1.0) | 0 | 0.0px | 1.01s | 5/5 (1.0) | 0 | 0.0px | 6.22s |
| shift+64y | 6 | 6/6 (1.0) | 0 | 0.0px | 0.99s | 6/6 (1.0) | 0 | 0.0px | 6.15s |
| shift-64y | 6 | 6/6 (1.0) | 0 | 0.0px | 1.01s | 6/6 (1.0) | 0 | 0.0px | 6.21s |
| bright+10% | 6 | 6/6 (1.0) | 0 | 0.0px | 1.02s | 6/6 (1.0) | 0 | 0.0px | 6.27s |
| bright-10% | 6 | 6/6 (1.0) | 0 | 0.0px | 1.04s | 6/6 (1.0) | 0 | 0.0px | 6.46s |
| combo1 | 3 | 0/3 (0.0) | 0 | 204.1px | 0.94s | 3/3 (1.0) | 0 | 0.5px | 6.1s |
| combo2 | 5 | 0/5 (0.0) | 0 | 463.0px | 0.96s | 5/5 (1.0) | 0 | 0.5px | 6.16s |

**缩放**: n=17 原尺度 hit=0.353 false=0 med_err=204.1px 1.05s | 多尺度 hit=1.0 false=0 med_err=0.5px 6.44s

**平移**: n=23 原尺度 hit=1.0 false=0 med_err=0.0px 1.0s | 多尺度 hit=1.0 false=0 med_err=0.0px 6.16s

**亮度**: n=12 原尺度 hit=1.0 false=0 med_err=0.0px 1.03s | 多尺度 hit=1.0 false=0 med_err=0.0px 6.37s

**组合**: n=8 原尺度 hit=0.0 false=0 med_err=354.9px 0.96s | 多尺度 hit=1.0 false=0 med_err=0.5px 6.13s

**ALL**: n=60 原尺度 hit=0.683 false=0 med_err=0.0px 1.01s | 多尺度 hit=1.0 false=0 med_err=0.0px 6.28s

## 负样本（模板 vs 异态真实帧, 原尺度全帧 NCC）
n=60, score>0.8: 8, score>0.9: 3
- sidebar-save-mgr vs settle.png: 0.9371 @ [2434.0, 1343.0]
- pause-resume vs menu.png: 0.9522 @ [471.0, 428.0]
- pause-resume vs savelist.png: 0.8152 @ [139.0, 105.0]
- pause-resume vs settle2.png: 0.8589 @ [935.0, 895.0]
- save-card-title vs settle.png: 0.8997 @ [304.0, 103.0]
- save-card-title vs settle2.png: 0.9167 @ [283.0, 91.0]
- save-card-title vs settle3.png: 0.8994 @ [304.0, 103.0]
- save-card-title vs settle4.png: 0.8993 @ [304.0, 103.0]

跳过样本 12（出界/自检不过）: menu.png|sidebar-save-mgr|scale1.1|offscreen; menu.png|playtest-tile|scale1.25|offscreen; menu.png|sidebar-save-mgr|scale1.25|offscreen; menu.png|sidebar-save-mgr|shift-64x|offscreen; menu.png|playtest-tile|combo1|offscreen; menu.png|sidebar-save-mgr|combo1|offscreen; pause.png|pause-abort|scale0.9|selfcheck=-1.000; pause.png|pause-abort|scale1.1|selfcheck=-1.000; savelist.png|save-card-title|scale0.75|selfcheck=-1.000; savelist.png|save-card-title|scale1.25|offscreen; savelist.png|save-card-title|combo1|offscreen; savelist.png|save-card-title|combo2|selfcheck=-1.000
viz: /home/h/genshin-ts/.scratch/gui-grounding/viz/expA_menu_scale0.75_playtest-tile.png (single sc=0.5215 err=246.9px | multi sc=0.9775 err=0.6px f=0.75)
viz: /home/h/genshin-ts/.scratch/gui-grounding/viz/expA_menu_combo2_playtest-tile.png (single sc=0.5215 err=246.9px | multi sc=0.9774 err=0.6px f=0.75)

# 实验 B 汇总（源: results/expB.json）

| 被测帧 | 接受 | inliers | s_hat | t_hat | s误差% | t误差px | 全锚点定位中位err | 耗时 |
|---|---|---|---|---|---|---|---|---|
| identity | True | 10 | 1.0 | [-0.0, -0.0] | 0.0 | 0.0 | 0.0px | 1.456s |
| scale0.75 | False | 2 | 0.831 | [118.8, 217.3] | 10.8 | 204.7 | 148.3px | 1.39s |
| scale0.9 | True | 9 | 0.8996 | [128.5, 72.0] | 0.04 | 0.5 | 0.5px | 1.346s |
| scale1.1 | True | 5 | 1.1006 | [-129.2, -71.2] | 0.06 | 1.5 | 1.2px | 1.42s |
| scale1.25 | False | 2 | 0.7088 | [475.6, 479.1] | 43.3 | 1033.1 | 972.9px | 1.333s |
| shift+64x | True | 10 | 1.0 | [64.0, -0.0] | 0.0 | 0.0 | 0.0px | 1.454s |
| shift-64x | True | 9 | 1.0 | [-64.0, 0.0] | 0.0 | 0.0 | 0.0px | 1.372s |
| shift+64y | True | 9 | 1.0 | [-0.0, 64.0] | 0.0 | 0.0 | 0.0px | 1.351s |
| shift-64y | True | 8 | 1.0 | [0.0, -64.0] | 0.0 | 0.0 | 0.0px | 1.376s |
| bright+10% | True | 10 | 1.0 | [-0.0, -0.0] | 0.0 | 0.0 | 0.0px | 1.358s |
| bright-10% | True | 10 | 1.0 | [-0.0, -0.0] | 0.0 | 0.0 | 0.0px | 1.378s |
| combo1 | False | 2 | 0.1921 | [427.2, 357.1] | 84.64 | 869.0 | 708.3px | 1.399s |
| combo2 | False | 2 | 0.8315 | [181.1, 196.8] | 10.87 | 76.7 | 59.3px | 1.37s |
| NEG:editor-grass-shadow.png | False | 2 | 0.0433 | [381.0, 50.1] | - | - | -px | 1.385s |
| NEG:pause.png | False | 2 | 1.0308 | [-138.5, 3.1] | - | - | -px | 1.347s |
| NEG:playtest.png | False | 2 | 0.348 | [144.9, 142.2] | - | - | -px | 1.4s |
| NEG:playtest2.png | False | 2 | 1.2897 | [-202.2, -182.4] | - | - | -px | 1.473s |
| NEG:playtest3.png | False | 2 | 0.3476 | [144.8, 142.8] | - | - | -px | 1.383s |
| NEG:savelist.png | False | 2 | 1.5481 | [214.8, -250.0] | - | - | -px | 1.376s |
| NEG:settle.png | False | 0 | - | - | - | - | -px | 1.372s |
| NEG:settle2.png | False | 0 | - | - | - | - | -px | 1.362s |
| NEG:settle3.png | False | 0 | - | - | - | - | -px | 1.451s |
| NEG:settle4.png | False | 0 | - | - | - | - | -px | 1.346s |

正样本(13): 接受 9/13，假接受 0
负样本(异态帧 10): 错误接受 0
接受帧的锚点定位中位err: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.5, 1.2]
耗时: 均值 1.38s/帧
