# Protobuf presence and round-trip

Defaults, unknown fields, oneof presence, raw wire scans, and loss-detecting round trips.


<!-- CLAIM:START clm_01KYH4ZHWD9EZZZ20QXKDAKD90 -->

### Protocol conclusions require presence-aware evidence beyond decoded defaults

For GIA/protobuf investigations, decoded semantic JSON is orientation evidence only: schema defaults can make absent fields look populated, unknown fields can disappear on decode/encode, and oneof branch identity can matter even when values compare equal. A protocol claim therefore checks raw field number/wire type or message presence and, when loss is suspected, performs an unchanged round-trip and compares payload bytes, length, or hash.

#### 适用边界与失效条件

A raw-wire or round-trip match proves only the inspected payload and schema path, not editor acceptance or game behavior; a mismatch may reflect unknown schema rather than compiler semantics. Revalidate when protobuf schema/decoder/encoder versions or the inspected message path changes.

<!-- CLAIM:END clm_01KYH4ZHWD9EZZZ20QXKDAKD90 -->

<!-- CLAIM:START clm_1E31BAC638F84B68E6F1CB17B4 -->

### 未知 GIL 字段必须按章节和单变化逐步闭合

完整 GIL 语义树应按章节选择未知子容器，要求用户每轮只做一个可唯一归因的编辑器变化；Coordinator 固化相邻不可变快照，比较 raw-wire 字段和 presence，结合 schema、当前 reader、真实差分或 round-trip 后由独立 Validator 裁决；未闭合内容保持 INSUFFICIENT，冲突保持 CONFLICT。

#### 适用边界

这是调查流程与证据边界，不是任意 GIL 字段的语义命名；字段缺失、显式空值和显式默认值必须分别记录，不能按字段位置、相邻 ID 或重复形状猜测。

<!-- CLAIM:END clm_1E31BAC638F84B68E6F1CB17B4 -->
