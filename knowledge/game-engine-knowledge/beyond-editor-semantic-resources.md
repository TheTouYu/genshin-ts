# Beyond 编辑器语义资源与游戏静态数据解析

effectID→TextMapHash 目录源探索：.mihoyobin、MiHoYoBinData、Blb、IL2CPP metadata、BeyondEditor RoleStatus 加载链的已确认边界

<!-- CLAIM:START clm_A914A2C2A7AF5774A609CED409 -->

### CN7.0.0 MiHoYoBinData 原始内容不需要 XOR 0x95

CN 7.0.0 SerializedFile class 1208 的 MiHoYoBinData 原始对象字节已含真实 effectID varint，不需要 XOR 0x95；早前 /tmp/mhybins_255 是 --xor 0x95 导出，不是原始字节。extract_mihoyo_bin.py 默认已改为 --xor 0。

#### 适用边界

基于 25539185 Blb3 Excel 块 pathID 1059/1735 实测；不覆盖未来版本；.mihoyobin 编辑器文件仍使用 XOR 0xE5。

<!-- CLAIM:END clm_A914A2C2A7AF5774A609CED409 -->

<!-- CLAIM:START clm_C90393CC66E0ED997F91A39FBD -->

### Genshin 7.0.0 global-metadata.dat 为 MHY 加密头，静态 Il2CppDumper/旧 MetadataConverter 不可直接使用

YuanShen 7.0.0 global-metadata.dat 以 MHY\0 开头，非标准 AF1BB1FA；Il2CppDumper 报 encrypted；社区 MetadataConverter 报 string literal offset/count invalid。需要先运行时 dump 解密 metadata 或获取同版本已解密文件。

#### 适用边界

针对 CNRELWin7.0.0_R47482070；工具结果基于 2026-09-04 实测，不排除未来工具更新。

<!-- CLAIM:END clm_C90393CC66E0ED997F91A39FBD -->

<!-- CLAIM:START clm_2CD084FB7C9058036423779120 -->

### BeyondEditor RoleStatus 加载链止于资源分类三元组，不包含 effectID→TextMapHash

BeyondEditor.dll 反编译+Windows 反射显示 OfficialRoleStatus 加载三元组 (10003,50004,51000)，CustomRoleStatus 为 (10003,50004,51001)；这是编辑器资源分类 ID，不是 TextMapHash。本地代码/Json 树不含 effectID→TextMapHash。

#### 适用边界

基于 BeyondEditor 7.0.0 本地程序集与 IPC 现有抓包；不排除游戏侧 IPC/IL2CPP/Blb 中有映射。

<!-- CLAIM:END clm_2CD084FB7C9058036423779120 -->
