# Protobuf presence and round-trip

Defaults, unknown fields, oneof presence, raw wire scans, and loss-detecting round trips.


<!-- CLAIM:START clm_01KYH4ZHWD9EZZZ20QXKDAKD90 -->

### Protocol conclusions require presence-aware evidence beyond decoded defaults

For GIA/protobuf investigations, decoded semantic JSON is orientation evidence only: schema defaults can make absent fields look populated, unknown fields can disappear on decode/encode, and oneof branch identity can matter even when values compare equal. A protocol claim therefore checks raw field number/wire type or message presence and, when loss is suspected, performs an unchanged round-trip and compares payload bytes, length, or hash.

#### 适用边界与失效条件

A raw-wire or round-trip match proves only the inspected payload and schema path, not editor acceptance or game behavior; a mismatch may reflect unknown schema rather than compiler semantics. Revalidate when protobuf schema/decoder/encoder versions or the inspected message path changes.

<!-- CLAIM:END clm_01KYH4ZHWD9EZZZ20QXKDAKD90 -->
