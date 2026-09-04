# 票01 IPC payload 进展（2026-09-04）

> 状态：已闭环“抓包 → 解包 → XOR → protobuf”；正在定位 effectID → TextMapHash 的字段位置。
> 本文件记录已确认的 wire 格式、产物路径、下一步。

## 抓包产物

- `ipc_re.pcap`（4.7MB）：RawCap 重新录制，覆盖 BeyondEditor 重连 + 打开单位状态/效果面板。
- `flow_127.0.0.1_61061_127.0.0.1_61086.bin`（1.7MB）：YuanShen(61061) → BeyondEditor(61086) 方向 TCP payload。
- `flow_127.0.0.1_61086_127.0.0.1_61061.bin`（1.6KB）：反向。

注意：端口不是固定 54562/61165，每次会话会变；本次是 `61061 ↔ 61086`。抓包后先用 `netstat -ano` 对照 PID 确认方向。

## 已确认 Wire 格式

```text
[4字节大端长度]
HAblp 信封:
  magic       u16 = 0x0656
  type/cmd    u16
  payload_len u32（大端）
  payload     对每个字节 XOR 0xEA
  trailer     2字节（部分帧期望 0x0666，实测边界有出入）
```

- 外层长度：大端，样本第一个值 `00 08 69 71` = 551281。
- “加密”只是**固定 XOR 0xEA**，不是 AES，不是压缩。
- XOR 后是 Google.Protobuf / CodedStream 字节。

反编译证据：
- 信封实现：`/tmp/beyond_decomp/xp3xUm3Ijc4F6ZO5bV32/HAblpO3INAjJCdfp46lI.cs`
- writer：`lXPEV83z05tlbqNAuLlZ/gRaBq03zvwCHOLycsWyA.cs`
- reader：`F5WFuQ3IwMP7h4nbUGWj/Oc96Gi3IB2SrXjnTiUl1.cs`
- protobuf 辅助：`Hjtpu1aG1TppErN2SqP.cs` / `WG28dwfIHGBaH39y5E.cs`

## 第一个消息

- 外层长度：551281
- HAblp type：1022（`0x03FE`）
- payload_len：551271
- XOR 后明文包含大量 `ART/UI/Atlas/LS/UGC/BeydEffectIcons/...`、`act.mihoyo.com` 等，是“编辑器资源/图标/教程目录”，**不含**已知状态效果名/hash。

## 关键发现：effectID 已在 XOR 后数据中

把第一个消息 payload + 之后剩余数据整体按 XOR 0xEA 解码后，在约 `1.57MB` 处出现已知 effectID varint：

```text
1720001 varint @ 1572713
2110001 varint @ 1572576, 1572648
2120001 varint @ 1572734
2130001 varint @ 1572761
590001 varint @ 1572788
```

该区域是 protobuf 对象图，结构大致为：

```text
0a <len> 08 <effectID varint> 12 ... (参数/组件定义)
```

尚未在这些记录中找到已知 TextMapHash（1842178763 等）或中文/英文名。

## 产物

- `decode_ipc.py`：把 flow.bin 按 4 字节大端长度 + HAblp + XOR 0xEA 解码；也可输出整体 XOR 后的探索文件。
- `decoded_type1022.bin`：第一个消息 XOR 后 protobuf 字节（551271B）。

## 下一步

1. 解析 XOR 后 `1.57MB` 区域所在消息的 protobuf schema（type/字段），确定 effectID 记录是否包含 TextMapHash。
2. 若该消息不含 hash，则说明“效果名显示”可能仍在 YuanShen 本地表/另一条 IPC 消息，需要继续抓“下拉打开瞬间”的后续小消息。
3. 用已知 effectID 反查 protobuf 类，把字段编号映射到名称，产出机器可读映射。

## 未闭合

- 第一个消息后剩余数据的应用层帧边界与源码 trailer 不完全吻合；当前用“整体 XOR 剩余数据”探索有效，但正式解析还需按 HAblp 帧正确切分。
- `G16F153D` 属于 assets.bin ZIP 密码，**不是** IPC XOR 密钥；IPC 密钥是固定 0xEA。

## 子代理复核结论（2026-09-04）

- 对整段 XOR 后数据用 varint/u32le/u32be/u64le/sint32-zigzag 全编码搜索 9 个已知 TextMapHash：**0 命中**。
- effectID 记录（2110001×2、1720001、2120001、2130001、590001；2010001 未出现）属于“当前对象效果/参数描述”：
  - `EffectStateRecord { uint32 effectId = 1; repeated ParamDesc params = 2; }`
  - 参数描述含 typeId、name、selector/value、defaultValue（如 1720001 默认 float -0.098）。
  - **不含 TextMapHash / 显示名**。
- effectID 区域最可能属于 type 1017 形态（非 1022 资源目录）；type 1020 帧在 flow 中被截断（len 193307 超出文件），无法确认是否含全量目录。
- flow.bin 的 TCP seq 有空洞/帧头缺失，整体 XOR 只能作为探索手段。
- 下一步建议：
  1. 不要在这条状态同步 IPC 中继续找 TextMapHash。
  2. 回到“全量效果目录/带 hash 的定义”需要重抓一次**完整无丢包**的 YuanShen→BeyondEditor 流，并重点抓“首次加载效果下拉/效果目录”动作。
  3. 或从反编译服务 `beyondEffectService/beyondRoleStatusService` 反查哪个 HAblp type 负责发送全量效果目录。
