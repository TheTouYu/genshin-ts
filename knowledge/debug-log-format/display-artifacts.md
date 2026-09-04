# 日志显示层假象族与黄金对照判读



<!-- CLAIM:START clm_01M1NA8MS2PF8A4HC4GCPETHEA -->

### 日志显示层假象族判读门：黄金对照法（3185 vs 3099 双源实证）

Beyond_Debug_Log 的 List/变量显示存在三类假象（值本身没错）：① int_list 负值显示为 [值的uint8, 255×8]（-1→255×9），不是 9 个物理元素或残留，getCorrespondingValueFromList 按真实索引取值正常；② 部分 int_list 图变量 Get 帧读出显示 float 垃圾/nan（如 CF_CORNER_POLICY_c2），同一帧下游节点又显示 hex 字节串——显示层按 wire 形态选不同解码；③ Integer 空显示可能是有效 0。判读门：显示形态与预期内容矛盾时，先找一份同链路已成功的日志同字段对照——同形态→假象（跳过破译），不同形态→真异常。2026-09-04 一次对照杀死 3 个错误假设（DIR 表 72 项/POLICY float 垃圾/solve_seq 255×8），比逐帧语义推理快一个数量级。

#### 适用边界

Beyond_Debug_Log .gia 的 frames/Get/Set 帧显示层判读；不适用于 op 参数 IN/OUT 负值显示（uint64/uint8 双显示规则另查）；假象成因 wire 字节语义未破译（判读门可用即可）。证据：examples/rubik-3x3-client/.gsts/evidence/3185-fullrun/ 与 examples/rubik-3x3/.gsts/evidence/3099-postfix-fullrun.gia；复盘 retrospective-2026-09-04-rubik-client-timing-race.md；commit 92d1f69。

<!-- CLAIM:END clm_01M1NA8MS2PF8A4HC4GCPETHEA -->
