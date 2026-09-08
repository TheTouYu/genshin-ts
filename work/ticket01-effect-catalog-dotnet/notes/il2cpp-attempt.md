# IL2CPP route attempt (2026-09-04)

Goal: dump C#/IL2CPP method names from YuanShen.exe + global-metadata.dat to find effectID->TextMapHash resolver.

## Commands
- file YuanShen.exe: PE32+ x86-64 Mono/.Net assembly? actually huge game exe
- global-metadata.dat header: `4d 48 59 00 ...` = `MHY\0` -> encrypted/custom metadata, NOT standard `AF1BB1FA`
- Il2CppDumper v6.7.46 (net6) result:
  `ERROR: Metadata file not found or encrypted.`
- Community modified Il2CppDumper-YuanShen README confirms:
  "The global-metadata.dat of the game Genshin Impact has been encrypted, you need to dump decrypted file from memory before use this tool."
- No GameAssembly.dll / UserAssembly.dll present in this install; code/il2cpp likely embedded/protected inside YuanShen.exe.

## Conclusion
Static Il2CppDumper on disk files is blocked by encrypted metadata + protected/missing assembly. Need either:
  - runtime decrypted metadata dump (requires running game/admin; anti-cheat may block)
  - user-provided decrypted metadata / memory dump
  - or return to Blb/MiHoYoBinData / editor .NET routes.

## Community decrypted metadata search (2026-09-04)
- No public/current decrypted global-metadata for CNRELWin7.0.0_R47482070_S47579390_D47579390 found.
- MetadataConverter forks are old (2022-era), all fail on this 7.0.0 file with:
  `file trimmed or string literal offset/count field invalid`
- No GameAssembly.dll/UserAssembly.dll in this install; il2cpp image appears embedded/protected in YuanShen.exe.
- Community modified dumpers all state encrypted metadata must be dumped from memory first.

=> Static community-metadata shortcut is also blocked unless user provides exact decrypted file/dump.
