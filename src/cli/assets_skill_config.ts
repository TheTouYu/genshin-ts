import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { loadGstsConfig } from '../compiler/config_loader.js'
import type { GstsConfig, GstsInjectConfig } from '../compiler/gsts_config.js'
import { buildFile, readUint32BE } from '../injector/binary.js'
import { resolveGilTarget, syncGilToTemp } from './gil_paths.js'
import { sha256Bytes } from './static_assembly/json.js'
import {
  emitWireMessage,
  parseWireMessage,
  printableWireText,
  type WireField
} from './static_assembly/wire.js'

type RootContext = { projectConfigPath?: string; projectConfig?: GstsConfig }

// ==================== 技能配置模板（2026-08-29 1073741914 快照逐字节提取） ====================
// 36=普通技能模板（after-skillconfig.gil 记录 1228931073，普通释放默认形态）
// 6=自定义技能模板（after-custom-skill.gil 记录 1098907649，普通释放默认形态）
// root15 = 资产记录 {1:id, 2:模板f2, 4[*]:分节}；root16 = 平行引用 {1:id, 2:id, 3[*]:同构分节（节0无名称）}
// 证据与字段语义见 docs/game-engine-knowledge/gil-structure-semantics.md「技能配置资产」。
const TPL_36_NORMAL_R15 =
  '08818080ca041024221208015a0e0a0ce6938de68ea7e68a80e883bd2290030815f2018a030a87030a06200238a19c0112001a331001180228014802520f0d0000803f150000803f1d0000803f5d0000803f650000803f6d0000f0427d0000803f85010000803f220210013205250000803f3a0c08011d0000803f250000204142a502b21fa102a81f01b21f6daa1f5bbd1f00002041c51f0000a040cd1f00000040d21f0a0d0000a0401500002041da1f0a0d0000a040150000a040e01f01e81f01f21f08a914aa14ad14ae14fd1f00007a448820019a2000a2200ca81fffffffffffffffffff01a82001b21f0ca81f01b51f00002041ca1f00ba1f77aa1f6ea81f01c51f0000c03fcd1f0000c03fd51f0000a040dd1f00002041e51f0000f042ed1f00000040f21f0a0d0000003f150000c03ffa1f0a0d0000003f150000c03f82200a0d0000b442150000f0428a200a0d0000a040150000204192200a0d0000a040150000a040b22000b82001b21f03b81f01c21f2eaa1f28a81f01b21f0d47495f417661746172526f6f74ba1f05150ad7233cc01fffffffef04c81f01d01f01b21f00c81f014a05089ad4e20422480823ea02430a3b122a0a15e88a82e782b9e59bbee4ba8be4bbb6e8bda8e981931001180120013081808080034d00007a4458014a0408011001520408011001800101103d18a0f00f22050824f20200'
const TPL_36_NORMAL_R16 =
  '08818080ca0410818080ca041a0408015a001a90030815f2018a030a87030a06200238a19c0112001a331001180228014802520f0d0000803f150000803f1d0000803f5d0000803f650000803f6d0000f0427d0000803f85010000803f220210013205250000803f3a0c08011d0000803f250000204142a502b21fa102a81f01b21f6daa1f5bbd1f00002041c51f0000a040cd1f00000040d21f0a0d0000a0401500002041da1f0a0d0000a040150000a040e01f01e81f01f21f08a914aa14ad14ae14fd1f00007a448820019a2000a2200ca81fffffffffffffffffff01a82001b21f0ca81f01b51f00002041ca1f00ba1f77aa1f6ea81f01c51f0000c03fcd1f0000c03fd51f0000a040dd1f00002041e51f0000f042ed1f00000040f21f0a0d0000003f150000c03ffa1f0a0d0000003f150000c03f82200a0d0000b442150000f0428a200a0d0000a040150000204192200a0d0000a040150000a040b22000b82001b21f03b81f01c21f2eaa1f28a81f01b21f0d47495f417661746172526f6f74ba1f05150ad7233cc01fffffffef04c81f01d01f01b21f00c81f014a05089ad4e2041a480823ea02430a3b122a0a15e88a82e782b9e59bbee4ba8be4bbb6e8bda8e981931001180120013081808080034d00007a4458014a0408011001520408011001800101103d18a0f00f1a050824f20200'
const TPL_6_NORMAL_R15 =
  '088180808c041006221508015a110a0fe887aae5ae9ae4b989e68a80e883bd228b030815f20185030a82030a06200238a19c0112001a331001180228014802520f0d0000803f150000803f1d0000803f5d0000803f650000803f6d0000f0427d0000803f85010000803f220210013205250000803f3a0c08011d0000803f250000204142a502b21fa102a81f01b21f6daa1f5bbd1f00002041c51f0000a040cd1f00000040d21f0a0d0000a0401500002041da1f0a0d0000a040150000a040e01f01e81f01f21f08a914aa14ad14ae14fd1f00007a448820019a2000a2200ca81fffffffffffffffffff01a82001b21f0ca81f01b51f00002041ca1f00ba1f77aa1f6ea81f01c51f0000c03fcd1f0000c03fd51f0000a040dd1f00002041e51f0000f042ed1f00000040f21f0a0d0000003f150000c03ffa1f0a0d0000003f150000c03f82200a0d0000b442150000f0428a200a0d0000a040150000204192200a0d0000a040150000a040b22000b82001b21f03b81f01c21f2eaa1f28a81f01b21f0d47495f417661746172526f6f74ba1f05150ad7233cc01fffffffef04c81f01d01f01b21f00c81f014a00226b0823ea02660a5e122a0a15e88a82e782b9e59bbee4ba8be4bbb6e8bda8e981931001180120013081808080034d00007a44580112210a0ce78ab6e68081e8bda8e981931002180120013088808080034d00007a4458014a0408011001520408011001800105101518a0f00f22050824f20200'
const TPL_6_NORMAL_R16 =
  '088180808c04108180808c041a0408015a001a8b030815f20185030a82030a06200238a19c0112001a331001180228014802520f0d0000803f150000803f1d0000803f5d0000803f650000803f6d0000f0427d0000803f85010000803f220210013205250000803f3a0c08011d0000803f250000204142a502b21fa102a81f01b21f6daa1f5bbd1f00002041c51f0000a040cd1f00000040d21f0a0d0000a0401500002041da1f0a0d0000a040150000a040e01f01e81f01f21f08a914aa14ad14ae14fd1f00007a448820019a2000a2200ca81fffffffffffffffffff01a82001b21f0ca81f01b51f00002041ca1f00ba1f77aa1f6ea81f01c51f0000c03fcd1f0000c03fd51f0000a040dd1f00002041e51f0000f042ed1f00000040f21f0a0d0000003f150000c03ffa1f0a0d0000003f150000c03f82200a0d0000b442150000f0428a200a0d0000a040150000204192200a0d0000a040150000a040b22000b82001b21f03b81f01c21f2eaa1f28a81f01b21f0d47495f417661746172526f6f74ba1f05150ad7233cc01fffffffef04c81f01d01f01b21f00c81f014a001a6b0823ea02660a5e122a0a15e88a82e782b9e59bbee4ba8be4bbb6e8bda8e981931001180120013081808080034d00007a44580112210a0ce78ab6e68081e8bda8e981931002180120013088808080034d00007a4458014a0408011001520408011001800105101518a0f00f1a050824f20200'

// 28 自定义造物模板（2026-08-29 快照 v11/v12 提取；用户确认：造物技能固定一个造物模型为引擎合法行为，
// 普通/瞬发共用同一造物，CLI 固定复制模板字节）：
// 创建态 = 99B（body 78.1.1={1:20001} 瞬发缺省 + 78.1.2.1=模型 + 78.1.3={4:1,5:1}，45.2=52）
// 绑定态 = 113B（+ 78.1.4={1:图ID, 2:1073741825}）；root20 造物模型容器：创建=1970B、绑定=2955B（联动）
// 固定造物模型 = 10005001（遗迹守卫，用户 2026-08-29 确认；快照 v11/v12 中的 10007001 是当时编辑器状态）
const TPL_28_CREATED_R15 =
  '08818080b804101c221b08015a170a15e887aae5ae9ae4b989e980a0e789a9e68a80e883bd221a0849f204150a130a0408a19c01120508d9e3e2041a042001280122190823ea02140a0c4a0408011001520408011001103418a0f00f22050824f20200'
const TPL_28_CREATED_R16 =
  '08818080b80410818080b8041a0408015a001a1a0849f204150a130a0408a19c01120508d9e3e2041a04200128011a190823ea02140a0c4a0408011001520408011001103418a0f00f1a050824f20200'
const TPL_28_BOUND_R15 =
  '08818080b804101c221b08015a170a15e887aae5ae9ae4b989e980a0e789a9e68a80e883bd22280849f204230a210a0408a19c01120508d9e3e2041a0420012801220c08838080840410818080800422190823ea02140a0c4a0408011001520408011001103418a0f00f22050824f20200'
const TPL_28_BOUND_R16 =
  '08818080b80410818080b8041a0408015a001a280849f204230a210a0408a19c01120508d9e3e2041a0420012801220c0883808084041081808080041a190823ea02140a0c4a0408011001520408011001103418a0f00f1a050824f20200'
const ROOT20_CREATED =
  '0ad60708818080840412070889aea70e10012a1208015a0e0a0ce98197e8bfb9e5ae88e58dab2a0b080db2010620ffffffff0f2a0c08268203070d0000803f10012a0508289203002a05086fea05002a05083d8a04002a05083e9204002a0e0850fa04090a070801a81fa79c012a0e08518205090a0712050d0000803f2a070841b204020a002a0708528a05020a002a050813e201002a050834f20300322a08015a260a0a1500007a451d000040c012001a0f0d0000803f150000803f1d0000803fa81fffffffff0f320408036a00320608047202080132050806820100324508078a01400d0e2dbe4215e92671421d0000fa432801320510c2c7ee0445cdcccc3d4dcdcccc3d55cdcccc3d5dcdcccc3d65cdcccc3d6dcdcccc3d75cdcccc3d7d3333333f328304080baa01fd030a390a0e47495f4d6f6e73746572526f6f7412001a00b21f0ce4b8ade5bf83e58e9fe782b9c01f01ca1f10426579645f4d6f6e73746572526f6f740a2e0a0b47495f526f6f744e6f646512001a00b21f0ce6a8a1e59e8be58e9fe782b9c01f01ca1f08526f6f744e6f64650a300a0c47495f4e616d65506c61746512001a00b21f06e993ade7898cc01f01ca1f0f42696c6c626f6172644174746163680a310a0b47495f486561644d61726b12001a00b21f0ce5a4b4e9a1b6e6a087e8aeb0c01f01ca1f0b46785f486561644e6f64650a330a0c47495f43686573744d61726b12001a00b21f0ce883b8e983a8e6a087e8aeb0c01f01ca1f0c46785f43686573744e6f64650a340a0e47495f41696d696e67506f696e7412001a00b21f0ce5a4b4e983a8e6a0b8e5bf83c01f01ca1f0b41696d696e67506f696e740a220a0847495f436865737412001a00b21f06e883b8e983a8c01f01ca1f0543686573740a250a0847495f48616e644c12001a00b21f06e5b7a6e6898bc01f01ca1f084c65667448616e640a260a0847495f48616e645212001a00b21f06e58fb3e6898bc01f01ca1f09526967687448616e640a250a0847495f466f6f744c12001a00b21f06e5b7a6e8849ac01f01ca1f084c656674466f6f740a260a0847495f466f6f745212001a00b21f06e58fb3e8849ac01f01ca1f095269676874466f6f743208080cb20103a81f0132050810d2010032050811da010032070813ea0102080132050814f2010032050815fa01003a4208121001e2013b4a1a2a00320042005200ba1f0ce58f97e587bbe789b9e69588d81f0d521d2a00320042005200ba1f0fe8a2abe587bbe58092e789b9e69588d81f0d3a06080110015a003a09082a1001aa03020a003a06080310016a003a07080610018201003a07080e1001c201003a07081a1001aa02004089aea70e0ad60708838080840412070889aea70e10012a1208015a0e0a0ce98197e8bfb9e5ae88e58dab2a0b080db2010620ffffffff0f2a0c08268203070d0000803f10012a0508289203002a05086fea05002a05083d8a04002a05083e9204002a0e0850fa04090a070801a81fa79c012a0e08518205090a0712050d0000803f2a070841b204020a002a0708528a05020a002a050813e201002a050834f20300322a08015a260a0a1500007a451d000040c012001a0f0d0000803f150000803f1d0000803fa81fffffffff0f320408036a00320608047202080132050806820100324508078a01400d0e2dbe4215e92671421d0000fa432801320510c2c7ee0445cdcccc3d4dcdcccc3d55cdcccc3d5dcdcccc3d65cdcccc3d6dcdcccc3d75cdcccc3d7d3333333f328304080baa01fd030a390a0e47495f4d6f6e73746572526f6f7412001a00b21f0ce4b8ade5bf83e58e9fe782b9c01f01ca1f10426579645f4d6f6e73746572526f6f740a2e0a0b47495f526f6f744e6f646512001a00b21f0ce6a8a1e59e8be58e9fe782b9c01f01ca1f08526f6f744e6f64650a300a0c47495f4e616d65506c61746512001a00b21f06e993ade7898cc01f01ca1f0f42696c6c626f6172644174746163680a310a0b47495f486561644d61726b12001a00b21f0ce5a4b4e9a1b6e6a087e8aeb0c01f01ca1f0b46785f486561644e6f64650a330a0c47495f43686573744d61726b12001a00b21f0ce883b8e983a8e6a087e8aeb0c01f01ca1f0c46785f43686573744e6f64650a340a0e47495f41696d696e67506f696e7412001a00b21f0ce5a4b4e983a8e6a0b8e5bf83c01f01ca1f0b41696d696e67506f696e740a220a0847495f436865737412001a00b21f06e883b8e983a8c01f01ca1f0543686573740a250a0847495f48616e644c12001a00b21f06e5b7a6e6898bc01f01ca1f084c65667448616e640a260a0847495f48616e645212001a00b21f06e58fb3e6898bc01f01ca1f09526967687448616e640a250a0847495f466f6f744c12001a00b21f06e5b7a6e8849ac01f01ca1f084c656674466f6f740a260a0847495f466f6f745212001a00b21f06e58fb3e8849ac01f01ca1f095269676874466f6f743208080cb20103a81f0132050810d2010032050811da010032070813ea0102080132050814f2010032050815fa01003a4208121001e2013b4a1a2a00320042005200ba1f0ce58f97e587bbe789b9e69588d81f0d521d2a00320042005200ba1f0fe8a2abe587bbe58092e789b9e69588d81f0d3a06080110015a003a09082a1001aa03020a003a06080310016a003a07080610018201003a07080e1001c201003a07081a1001aa02004089aea70e'
const CREATION_MODEL_ID = 10005001 // 遗迹守卫（用户确认固定模型）
const ROOT20_BOUND =
  '0ad60708818080840412070889aea70e10012a1208015a0e0a0ce98197e8bfb9e5ae88e58dab2a0b080db2010620ffffffff0f2a0c08268203070d0000803f10012a0508289203002a05086fea05002a05083d8a04002a05083e9204002a0e0850fa04090a070801a81fa79c012a0e08518205090a0712050d0000803f2a070841b204020a002a0708528a05020a002a050813e201002a050834f20300322a08015a260a0a1500007a451d000040c012001a0f0d0000803f150000803f1d0000803fa81fffffffff0f320408036a00320608047202080132050806820100324508078a01400d0e2dbe4215e92671421d0000fa432801320510c2c7ee0445cdcccc3d4dcdcccc3d55cdcccc3d5dcdcccc3d65cdcccc3d6dcdcccc3d75cdcccc3d7d3333333f328304080baa01fd030a390a0e47495f4d6f6e73746572526f6f7412001a00b21f0ce4b8ade5bf83e58e9fe782b9c01f01ca1f10426579645f4d6f6e73746572526f6f740a2e0a0b47495f526f6f744e6f646512001a00b21f0ce6a8a1e59e8be58e9fe782b9c01f01ca1f08526f6f744e6f64650a300a0c47495f4e616d65506c61746512001a00b21f06e993ade7898cc01f01ca1f0f42696c6c626f6172644174746163680a310a0b47495f486561644d61726b12001a00b21f0ce5a4b4e9a1b6e6a087e8aeb0c01f01ca1f0b46785f486561644e6f64650a330a0c47495f43686573744d61726b12001a00b21f0ce883b8e983a8e6a087e8aeb0c01f01ca1f0c46785f43686573744e6f64650a340a0e47495f41696d696e67506f696e7412001a00b21f0ce5a4b4e983a8e6a0b8e5bf83c01f01ca1f0b41696d696e67506f696e740a220a0847495f436865737412001a00b21f06e883b8e983a8c01f01ca1f0543686573740a250a0847495f48616e644c12001a00b21f06e5b7a6e6898bc01f01ca1f084c65667448616e640a260a0847495f48616e645212001a00b21f06e58fb3e6898bc01f01ca1f09526967687448616e640a250a0847495f466f6f744c12001a00b21f06e5b7a6e8849ac01f01ca1f084c656674466f6f740a260a0847495f466f6f745212001a00b21f06e58fb3e8849ac01f01ca1f095269676874466f6f743208080cb20103a81f0132050810d2010032050811da010032070813ea0102080132050814f2010032050815fa01003a4208121001e2013b4a1a2a00320042005200ba1f0ce58f97e587bbe789b9e69588d81f0d521d2a00320042005200ba1f0fe8a2abe587bbe58092e789b9e69588d81f0d3a06080110015a003a09082a1001aa03020a003a06080310016a003a07080610018201003a07080e1001c201003a07081a1001aa02004089aea70e0ad60708838080840412070889aea70e10012a1208015a0e0a0ce98197e8bfb9e5ae88e58dab2a0b080db2010620ffffffff0f2a0c08268203070d0000803f10012a0508289203002a05086fea05002a05083d8a04002a05083e9204002a0e0850fa04090a070801a81fa79c012a0e08518205090a0712050d0000803f2a070841b204020a002a0708528a05020a002a050813e201002a050834f20300322a08015a260a0a1500007a451d000040c012001a0f0d0000803f150000803f1d0000803fa81fffffffff0f320408036a00320608047202080132050806820100324508078a01400d0e2dbe4215e92671421d0000fa432801320510c2c7ee0445cdcccc3d4dcdcccc3d55cdcccc3d5dcdcccc3d65cdcccc3d6dcdcccc3d75cdcccc3d7d3333333f328304080baa01fd030a390a0e47495f4d6f6e73746572526f6f7412001a00b21f0ce4b8ade5bf83e58e9fe782b9c01f01ca1f10426579645f4d6f6e73746572526f6f740a2e0a0b47495f526f6f744e6f646512001a00b21f0ce6a8a1e59e8be58e9fe782b9c01f01ca1f08526f6f744e6f64650a300a0c47495f4e616d65506c61746512001a00b21f06e993ade7898cc01f01ca1f0f42696c6c626f6172644174746163680a310a0b47495f486561644d61726b12001a00b21f0ce5a4b4e9a1b6e6a087e8aeb0c01f01ca1f0b46785f486561644e6f64650a330a0c47495f43686573744d61726b12001a00b21f0ce883b8e983a8e6a087e8aeb0c01f01ca1f0c46785f43686573744e6f64650a340a0e47495f41696d696e67506f696e7412001a00b21f0ce5a4b4e983a8e6a0b8e5bf83c01f01ca1f0b41696d696e67506f696e740a220a0847495f436865737412001a00b21f06e883b8e983a8c01f01ca1f0543686573740a250a0847495f48616e644c12001a00b21f06e5b7a6e6898bc01f01ca1f084c65667448616e640a260a0847495f48616e645212001a00b21f06e58fb3e6898bc01f01ca1f09526967687448616e640a250a0847495f466f6f744c12001a00b21f06e5b7a6e8849ac01f01ca1f084c656674466f6f740a260a0847495f466f6f745212001a00b21f06e58fb3e8849ac01f01ca1f095269676874466f6f743208080cb20103a81f0132050810d2010032050811da010032070813ea0102080132050814f2010032050815fa01003a4208121001e2013b4a1a2a00320042005200ba1f0ce58f97e587bbe789b9e69588d81f0d521d2a00320042005200ba1f0fe8a2abe587bbe58092e789b9e69588d81f0d3a06080110015a003a09082a1001aa03020a003a06080310016a003a07080610018201003a07080e1001c201003a07081a1001aa02004089aea70e0ad60708848080840412070889aea70e10012a1208015a0e0a0ce98197e8bfb9e5ae88e58dab2a0b080db2010620ffffffff0f2a0c08268203070d0000803f10012a0508289203002a05086fea05002a05083d8a04002a05083e9204002a0e0850fa04090a070801a81fa79c012a0e08518205090a0712050d0000803f2a070841b204020a002a0708528a05020a002a050813e201002a050834f20300322a08015a260a0a1500007a451d000040c012001a0f0d0000803f150000803f1d0000803fa81fffffffff0f320408036a00320608047202080132050806820100324508078a01400d0e2dbe4215e92671421d0000fa432801320510c2c7ee0445cdcccc3d4dcdcccc3d55cdcccc3d5dcdcccc3d65cdcccc3d6dcdcccc3d75cdcccc3d7d3333333f328304080baa01fd030a390a0e47495f4d6f6e73746572526f6f7412001a00b21f0ce4b8ade5bf83e58e9fe782b9c01f01ca1f10426579645f4d6f6e73746572526f6f740a2e0a0b47495f526f6f744e6f646512001a00b21f0ce6a8a1e59e8be58e9fe782b9c01f01ca1f08526f6f744e6f64650a300a0c47495f4e616d65506c61746512001a00b21f06e993ade7898cc01f01ca1f0f42696c6c626f6172644174746163680a310a0b47495f486561644d61726b12001a00b21f0ce5a4b4e9a1b6e6a087e8aeb0c01f01ca1f0b46785f486561644e6f64650a330a0c47495f43686573744d61726b12001a00b21f0ce883b8e983a8e6a087e8aeb0c01f01ca1f0c46785f43686573744e6f64650a340a0e47495f41696d696e67506f696e7412001a00b21f0ce5a4b4e983a8e6a0b8e5bf83c01f01ca1f0b41696d696e67506f696e740a220a0847495f436865737412001a00b21f06e883b8e983a8c01f01ca1f0543686573740a250a0847495f48616e644c12001a00b21f06e5b7a6e6898bc01f01ca1f084c65667448616e640a260a0847495f48616e645212001a00b21f06e58fb3e6898bc01f01ca1f09526967687448616e640a250a0847495f466f6f744c12001a00b21f06e5b7a6e8849ac01f01ca1f084c656674466f6f740a260a0847495f466f6f745212001a00b21f06e58fb3e8849ac01f01ca1f095269676874466f6f743208080cb20103a81f0132050810d2010032050811da010032070813ea0102080132050814f2010032050815fa01003a4208121001e2013b4a1a2a00320042005200ba1f0ce58f97e587bbe789b9e69588d81f0d521d2a00320042005200ba1f0fe8a2abe587bbe58092e789b9e69588d81f0d3a06080110015a003a09082a1001aa03020a003a06080310016a003a07080610018201003a07080e1001c201003a07081a1001aa02004089aea70e'

// 45.2 = 模板×释放类型形态值（绑定不改；Round 3a~3e 五轮差分闭合）
const F45_2_VALUE: Record<number, Record<'normal' | 'instant', number>> = {
  36: { normal: 61, instant: 62 },
  6: { normal: 21, instant: 2 }
}

const F32_1 = new Uint8Array([0, 0, 128, 63])

// 普通释放打点模板（模板相关，各 1 样本）：
// 36=单打点 {2:3001, 3:1.0, 6:268435457, 8:1.0}（无 f1/f9）
// 6=三打点 {2:1001/1004/1007, 3:1.0, 6:268435457+7n, 8:1.0, 9:1}；f1 = 打点序号-1（首打点省略）
const NORMAL_BEATS: Record<number, WireField[][]> = {
  36: [[{ number: 2, wire: 0, value: 3001 }]],
  6: [
    [{ number: 2, wire: 0, value: 1001 }],
    [{ number: 1, wire: 0, value: 1 }, { number: 2, wire: 0, value: 1004 }],
    [{ number: 1, wire: 0, value: 2 }, { number: 2, wire: 0, value: 1007 }]
  ]
}

type SkillTemplate = 'normal' | 'custom' | 'creation'
type SkillRelease = 'normal' | 'instant'

type CreateOptions = {
  id: number
  name: string
  template: SkillTemplate
  skillType: SkillRelease
  graphIds: number[]
}

function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex, 'hex'))
}

// ==================== wire 变换 helper ====================

function msg(field: WireField): WireField[] {
  const inner = parseWireMessage(field.value as Uint8Array)
  if (!inner) throw new Error(`[error] field ${field.number} is not a protobuf-like message`)
  return inner
}

function findLast(nodes: WireField[], number: number): number {
  let idx = -1
  nodes.forEach((f, i) => {
    if (f.number === number) idx = i
  })
  return idx
}

/** root15/16 记录 {1:id[, 2:id], 4|3[*]:分节}：替换 ID（root16 同时替换 f1/f2） */
function setRecordId(record: WireField[], id: number, isRoot16: boolean): WireField[] {
  const next = record.map((f) => (f.number === 1 && f.wire === 0 ? { ...f, value: id } : f))
  if (isRoot16) {
    return next.map((f) => (f.number === 2 && f.wire === 0 ? { ...f, value: id } : f))
  }
  return next
}

/** 名称节（root15 节0 = {1:1, 11:{1:名称}}；root16 节0 无名称不处理） */
function setName(record: WireField[], name: string): WireField[] {
  const nameBytes = new TextEncoder().encode(name)
  return record.map((section) => {
    if (section.wire !== 2 || section.number !== 4) return section
    const sec = msg(section)
    if (sec.find((g) => g.number === 1 && g.wire === 0)?.value !== 1) return section
    return {
      ...section,
      value: emitWireMessage(
        sec.map((g) => {
          if (g.wire !== 2 || g.number !== 11) return g
          const nameMsg = msg(g)
          return {
            ...g,
            value: emitWireMessage(
              nameMsg.map((h) => (h.number === 1 && h.wire === 2 ? { ...h, value: nameBytes } : h))
            )
          }
        })
      )
    }
  })
}

/** 瞬发形态（36/6 模板）：去 30.1.1 的 f4:2（普通标记）+ 45.1 移除默认条目(f2)与 f16 + 45.2 形态值 */
function toInstant(record: WireField[], template: number, sectionNumber = 4): WireField[] {
  return record.map((section) => {
    if (section.wire !== 2 || section.number !== sectionNumber) return section
    const sec = msg(section)
    const secId = sec.find((g) => g.number === 1 && g.wire === 0)?.value
    if (secId === 21) {
      return {
        ...section,
        value: emitWireMessage(
          sec.map((f) => {
            if (f.wire !== 2 || f.number !== 30) return f
            const body = msg(f)
            return {
              ...f,
              value: emitWireMessage(
                body.map((b) => {
                  if (b.wire !== 2 || b.number !== 1) return b
                  const b1 = msg(b)
                  return {
                    ...b,
                    value: emitWireMessage(
                      b1.map((x) => {
                        if (x.wire !== 2 || x.number !== 1) return x
                        const x1 = msg(x)
                        return {
                          ...x,
                          value: emitWireMessage(
                            x1.filter((y) => !(y.number === 4 && y.wire === 0))
                          )
                        }
                      })
                    )
                  }
                })
              )
            }
          })
        )
      }
    }
    if (secId === 35) {
      return {
        ...section,
        value: emitWireMessage(
          sec.map((f) => {
            if (f.wire !== 2 || f.number !== 45) return f
            const track = msg(f)
            return {
              ...f,
              value: emitWireMessage(
                track
                  .map((t) => {
                    if (t.wire !== 2 || t.number !== 1) return t
                    const t1 = msg(t)
                    return {
                      ...t,
                      value: emitWireMessage(
                        t1.filter((x) => x.number === 9 || x.number === 10)
                      )
                    }
                  })
                  .map((t) =>
                    t.number === 2 && t.wire === 0
                      ? { ...t, value: F45_2_VALUE[template].instant }
                      : t
                  )
                  .filter((t) => !(t.number === 16))
              )
            }
          })
        )
      }
    }
    return section
  })
}

/** 瞬发绑定：30.1 在最后一个 f4 后插 f5[*]（轨道点 = 1073741825 + 7×顺序） */
function addInstantBindings(record: WireField[], graphIds: number[], sectionNumber = 4): WireField[] {
  return record.map((section) => {
    if (section.wire !== 2 || section.number !== sectionNumber) return section
    const sec = msg(section)
    if (sec.find((g) => g.number === 1 && g.wire === 0)?.value !== 21) return section
    return {
      ...section,
      value: emitWireMessage(
        sec.map((f) => {
          if (f.wire !== 2 || f.number !== 30) return f
          const body = msg(f)
          return {
            ...f,
            value: emitWireMessage(
              body.map((b) => {
                if (b.wire !== 2 || b.number !== 1) return b
                const b1 = msg(b)
                const next = [...b1]
                const insertAt = findLast(b1, 4) + 1
                graphIds.forEach((gid, i) => {
                  next.splice(insertAt + i, 0, {
                    number: 5,
                    wire: 2,
                    value: emitWireMessage([
                      { number: 1, wire: 0, value: gid },
                      { number: 2, wire: 0, value: 1073741825 + 7 * i }
                    ])
                  })
                })
                return { ...b, value: emitWireMessage(next) }
              })
            )
          }
        })
      )
    }
  })
}

/** 普通释放绑定：45.1 最后一个默认条目(f2)后插打点 f3[*] + 绑定 f4（限 1 图，触发 0.0s） */
function addNormalBinding(record: WireField[], template: number, graphId: number, sectionNumber = 4): WireField[] {
  return record.map((section) => {
    if (section.wire !== 2 || section.number !== sectionNumber) return section
    const sec = msg(section)
    if (sec.find((g) => g.number === 1 && g.wire === 0)?.value !== 35) return section
    return {
      ...section,
      value: emitWireMessage(
        sec.map((f) => {
          if (f.wire !== 2 || f.number !== 45) return f
          const track = msg(f)
          return {
            ...f,
            value: emitWireMessage(
              track.map((t) => {
                if (t.wire !== 2 || t.number !== 1) return t
                const t1 = msg(t)
                const beats = NORMAL_BEATS[template]
                const insertAt = findLast(t1, 2) + 1
                const next = [...t1]
                beats.forEach((beatFields, i) => {
                  next.splice(insertAt + i, 0, {
                    number: 3,
                    wire: 2,
                    value: emitWireMessage([
                      ...beatFields,
                      { number: 3, wire: 5, value: F32_1 },
                      { number: 6, wire: 0, value: 268435457 + 7 * i },
                      { number: 8, wire: 5, value: F32_1 },
                      ...(template === 6 ? [{ number: 9, wire: 0, value: 1 } as WireField] : [])
                    ])
                  })
                })
                next.splice(insertAt + beats.length, 0, {
                  number: 4,
                  wire: 2,
                  value: emitWireMessage([
                    { number: 1, wire: 0, value: graphId },
                    { number: 3, wire: 0, value: 1073741825 },
                    { number: 4, wire: 0, value: 268435457 }
                  ])
                })
                return { ...t, value: emitWireMessage(next) }
              })
            )
          }
        })
      )
    }
  })
}

// ==================== 构建 ====================

type CreationTemplate = 'normal' | 'custom' | 'creation'
const TEMPLATE_R15: Record<CreationTemplate, string> = {
  normal: TPL_36_NORMAL_R15,
  custom: TPL_6_NORMAL_R15,
  creation: TPL_28_CREATED_R15
}
const TEMPLATE_R16: Record<CreationTemplate, string> = {
  normal: TPL_36_NORMAL_R16,
  custom: TPL_6_NORMAL_R16,
  creation: TPL_28_CREATED_R16
}
const TEMPLATE_F2: Record<CreationTemplate, number> = { normal: 36, custom: 6, creation: 28 }
const TEMPLATE_TYPE_VALUE: Record<CreationTemplate, number> = { normal: 7500, custom: 2800, creation: 6900 }
const TEMPLATE_FOLDER_ID: Record<CreationTemplate, number> = { normal: 68, custom: 12, creation: 61 }

function buildRecord(
  template: CreationTemplate,
  isRoot16: boolean,
  opts: CreateOptions
): Uint8Array {
  const sectionNumber = isRoot16 ? 3 : 4
  if (template === 'creation') {
    // 28 模板：创建态/绑定态是两个固定模板（用户确认固定造物模型合法）；
    // 绑定 = bound 模板 + 78.1.4.f1 图 ID 参数化
    const bound = opts.graphIds.length > 0
    const hex = isRoot16
      ? (bound ? TPL_28_BOUND_R16 : TPL_28_CREATED_R16)
      : (bound ? TPL_28_BOUND_R15 : TPL_28_CREATED_R15)
    let record = msg({ number: 1, wire: 2, value: hexToBytes(hex) })
    record = setRecordId(record, opts.id, isRoot16)
    if (!isRoot16) record = setName(record, opts.name)
    record = setCreationModel(record, CREATION_MODEL_ID, sectionNumber)
    if (bound) {
      record = setCreationBindGraphId(record, opts.graphIds[0], sectionNumber)
    }
    return emitWireMessage(record)
  }
  const hex = isRoot16 ? TEMPLATE_R16[template] : TEMPLATE_R15[template]
  let record = msg({ number: 1, wire: 2, value: hexToBytes(hex) })
  record = setRecordId(record, opts.id, isRoot16)
  if (!isRoot16) record = setName(record, opts.name)
  if (opts.skillType === 'instant') record = toInstant(record, TEMPLATE_F2[template], sectionNumber)
  if (opts.graphIds.length > 0) {
    if (opts.skillType === 'instant') {
      record = addInstantBindings(record, opts.graphIds, sectionNumber)
    } else {
      if (opts.graphIds.length > 1) {
        throw new Error(
          '[error] 普通释放绑定仅采样 0.0s 单图（打点复用规则未闭合），--graph-id 限 1 个'
        )
      }
      record = addNormalBinding(record, TEMPLATE_F2[template], opts.graphIds[0], sectionNumber)
    }
  }
  return emitWireMessage(record)
}

// 28 模板：78.1.2.1 = 造物模型引用（固定 10005001 遗迹守卫，用户确认）
function setCreationModel(record: WireField[], modelId: number, sectionNumber: number): WireField[] {
  return record.map((section) => {
    if (section.wire !== 2 || section.number !== sectionNumber) return section
    const sec = msg(section)
    if (sec.find((g) => g.number === 1 && g.wire === 0)?.value !== 73) return section
    return {
      ...section,
      value: emitWireMessage(
        sec.map((f) => {
          if (f.wire !== 2 || f.number !== 78) return f
          const b78 = msg(f)
          return {
            ...f,
            value: emitWireMessage(
              b78.map((r) => {
                if (r.wire !== 2 || r.number !== 1) return r
                const r1 = msg(r)
                return {
                  ...r,
                  value: emitWireMessage(
                    r1.map((x) => {
                      if (x.wire !== 2 || x.number !== 2) return x
                      const r2 = msg(x)
                      return {
                        ...x,
                        value: emitWireMessage(
                          r2.map((y) => (y.number === 1 && y.wire === 0 ? { ...y, value: modelId } : y))
                        )
                      }
                    })
                  )
                }
              })
            )
          }
        })
      )
    }
  })
}

// 28 绑定态模板：78.1.4.f1（或 root16 的 78.1.4.f1）替换为绑定图 ID
function setCreationBindGraphId(record: WireField[], graphId: number, sectionNumber: number): WireField[] {
  return record.map((section) => {
    if (section.wire !== 2 || section.number !== sectionNumber) return section
    const sec = msg(section)
    if (sec.find((g) => g.number === 1 && g.wire === 0)?.value !== 73) return section
    return {
      ...section,
      value: emitWireMessage(
        sec.map((f) => {
          if (f.wire !== 2 || f.number !== 78) return f
          const b78 = msg(f)
          return {
            ...f,
            value: emitWireMessage(
              b78.map((r) => {
                if (r.wire !== 2 || r.number !== 1) return r
                const r1 = msg(r)
                return {
                  ...r,
                  value: emitWireMessage(
                    r1.map((x) => {
                      if (x.wire !== 2 || x.number !== 4) return x
                      const f4 = msg(x)
                      return {
                        ...x,
                        value: emitWireMessage(
                          f4.map((y) => (y.number === 1 && y.wire === 0 ? { ...y, value: graphId } : y))
                        )
                      }
                    })
                  )
                }
              })
            )
          }
        })
      )
    }
  })
}

function appendRootRecord(payload: Uint8Array, rootN: number, record: Uint8Array): Uint8Array {
  const root = parseWireMessage(payload)
  if (!root) throw new Error('[error] malformed GIL payload')
  // 最小骨架地图（maps:create 产物）没有 root15/16 容器字段：按字段号升序补建
  // （形态 = 参考图 root15/16：value 为 {1:record,...} 列表；此前缺失时 map 静默
  // 无操作 → create 后回读 missing，1073741916 干净地图实证）。
  if (!root.some((field) => field.number === rootN && field.wire === 2)) {
    const created: WireField = {
      number: rootN,
      wire: 2,
      value: emitWireMessage([{ number: 1, wire: 2, value: record }])
    }
    const insertAt = root.findIndex((field) => field.number > rootN)
    const next =
      insertAt === -1 ? [...root, created] : [...root.slice(0, insertAt), created, ...root.slice(insertAt)]
    return emitWireMessage(next)
  }
  return emitWireMessage(
    root.map((field) => {
      if (field.number !== rootN || field.wire !== 2) return field
      const inner = parseWireMessage(field.value as Uint8Array)
      if (!inner) return field
      return {
        ...field,
        value: emitWireMessage([...inner, { number: 1, wire: 2, value: record }])
      }
    })
  )
}

function appendSkillConfigFolder(
  root6: WireField[],
  template: CreationTemplate,
  id: number
): WireField[] {
  const folderId = TEMPLATE_FOLDER_ID[template]
  const records = root6.filter((f) => f.number === 1 && f.wire === 2)
  let folderRecord: WireField | undefined
  for (const rec of records) {
    const inner = parseWireMessage(rec.value as Uint8Array)
    if (inner?.find((g) => g.number === 1 && g.wire === 0)?.value === folderId) {
      folderRecord = rec
      break
    }
  }
  if (!folderRecord) {
    throw new Error(
      `[error] root6 缺少 folderId=${folderId} 的「未分类页签」记录（folderId 分配规则未闭合，` +
        `请先在编辑器中创建一张该模板技能配置建立记录，再重试）`
    )
  }
  const inner = parseWireMessage(folderRecord.value as Uint8Array)!
  const rebuilt = inner.map((f) => {
    if (f.number !== 3 || f.wire !== 2) return f
    const tab = parseWireMessage(f.value as Uint8Array)!
    const entry: WireField[] = [
      { number: 1, wire: 0, value: TEMPLATE_TYPE_VALUE[template] },
      { number: 2, wire: 0, value: id }
    ]
    return { ...f, value: emitWireMessage([...tab, { number: 5, wire: 2, value: emitWireMessage(entry) }]) }
  })
  return root6.map((f) => (f === folderRecord ? { ...f, value: emitWireMessage(rebuilt) } : f))
}

export function buildSkillConfig(payload: Uint8Array, opts: CreateOptions): Uint8Array {
  if (listSkillConfigs(payload).some((c) => c.id === opts.id)) {
    throw new Error(`[error] skill config ${opts.id} already exists in root 15`)
  }
  const template = opts.template as CreationTemplate
  const root = parseWireMessage(payload)
  if (!root) throw new Error('[error] malformed GIL payload')
  let next = appendRootRecord(payload, 15, buildRecord(template, false, opts))
  next = appendRootRecord(next, 16, buildRecord(template, true, opts))
  if (template === 'creation') {
    // root20 造物模型容器（28 模板联动；用户确认固定造物模型合法）：
    // 创建=1970B（地图无 root20 或已为创建态时保持/补齐），绑定=替换 2955B；
    // 其它 root20 状态（如既有绑定态容器）未采样 → fail closed
    const r20 = root.find((f) => f.number === 20 && f.wire === 2)
    const r20bytes = r20 ? (r20.value as Uint8Array) : undefined
    const createdHex = hexToBytes(ROOT20_CREATED)
    const boundHex = hexToBytes(ROOT20_BOUND)
    // root20 状态：缺失 / 空占位（len 0，28 创建前） / 创建态 1970B / 绑定态 2955B（多技能共用，用户确认合法）
    const isEmpty = r20bytes !== undefined && r20bytes.length === 0
    const isCreated = r20bytes !== undefined && Buffer.from(r20bytes).equals(Buffer.from(createdHex))
    const isBound = r20bytes !== undefined && Buffer.from(r20bytes).equals(Buffer.from(boundHex))
    if (r20bytes && !isEmpty && !isCreated && !isBound) {
      throw new Error(
        '[error] root20 造物模型容器状态未采样（非空占位/创建态/绑定态模板），28 模板创建 fail closed'
      )
    }
    const targetR20 = opts.graphIds.length > 0 ? boundHex : createdHex
    next = emitWireMessage(
      (parseWireMessage(next)!).map((field) => {
        if (field.number !== 20) return field
        return { ...field, value: targetR20 }
      })
    )
    if (!r20bytes) {
      next = emitWireMessage([...(parseWireMessage(next)!), { number: 20, wire: 2, value: targetR20 }])
    }
  }
  const root6 = parseWireMessage(
    (parseWireMessage(next)!).find((f) => f.number === 6 && f.wire === 2)!.value as Uint8Array
  )!
  next = emitWireMessage(
    (parseWireMessage(next)!).map((field) => {
      if (field.number !== 6 || field.wire !== 2) return field
      return { ...field, value: emitWireMessage(appendSkillConfigFolder(root6, template, opts.id)) }
    })
  )
  return next
}

// ==================== 回读（list） ====================

export type SkillConfigView = {
  id: number
  template: number
  templateName: string
  name: string | undefined
  skillType: 'normal' | 'instant' | 'unknown'
  bindings: Array<{ kind: string; graphId: number; trackPoint?: number; triggerPoint?: number; beatPoint?: number }>
  model: number | undefined
  f45_2: number | undefined
  f45_16: number | undefined
}

const TEMPLATE_NAMES: Record<number, string> = { 36: '普通技能', 6: '自定义技能', 28: '自定义造物' }

function sectionOf(record: WireField[], number: number, fieldNo: number): WireField | undefined {
  for (const section of record) {
    if (section.wire !== 2) continue
    const sec = parseWireMessage(section.value as Uint8Array)
    if (!sec || sec.find((g) => g.number === 1 && g.wire === 0)?.value !== number) continue
    return sec.find((g) => g.number === fieldNo && g.wire === 2)
  }
  return undefined
}

export function parseSkillConfigRecord(record: Uint8Array): SkillConfigView {
  const rec = parseWireMessage(record)
  if (!rec) throw new Error('[error] skill config record unparsable')
  const id = rec.find((g) => g.number === 1 && g.wire === 0)?.value as number | undefined
  const template = rec.find((g) => g.number === 2 && g.wire === 0)?.value as number | undefined
  if (id === undefined || template === undefined) throw new Error('[error] skill config record missing id/template')

  let name: string | undefined
  const nameSection = rec.find((g) => g.wire === 2 && g.number === 4)
  if (nameSection) {
    const sec = parseWireMessage(nameSection.value as Uint8Array)
    const nameField = sec?.find((g) => g.number === 11 && g.wire === 2)
    const nameMsg = nameField ? parseWireMessage(nameField.value as Uint8Array) : undefined
    const text = nameMsg?.find((g) => g.number === 1 && g.wire === 2)
    if (text) name = printableWireText(text.value as Uint8Array)
  }

  let skillType: SkillConfigView['skillType'] = 'unknown'
  let model: number | undefined
  const bindings: SkillConfigView['bindings'] = []

  // 36/6 模板：分节 21 → 30 → 30.1；28 模板：分节 73 → 78 → 78.1
  const body = sectionOf(rec, 21, 30)
  if (body) {
    const bodyMsg = parseWireMessage(body.value as Uint8Array)
    const b1 = bodyMsg?.find((g) => g.number === 1 && g.wire === 2)
    const b1Msg = b1 ? parseWireMessage(b1.value as Uint8Array) : undefined
    const f1 = b1Msg?.find((g) => g.number === 1 && g.wire === 2)
    const f1Msg = f1 ? parseWireMessage(f1.value as Uint8Array) : undefined
    // 释放类型 = 30.1.1 内 f4:2（普通）存在与否（瞬发缺省）
    const hasF4 = f1Msg?.some((g) => g.number === 4 && g.wire === 0)
    skillType = hasF4 ? 'normal' : 'instant'
    for (const f5 of b1Msg?.filter((g) => g.number === 5 && g.wire === 2) ?? []) {
      const e = parseWireMessage(f5.value as Uint8Array)
      const gid = e?.find((g) => g.number === 1 && g.wire === 0)?.value as number | undefined
      const tp = e?.find((g) => g.number === 2 && g.wire === 0)?.value as number | undefined
      if (gid !== undefined) bindings.push({ kind: 'body-f5', graphId: gid, trackPoint: tp })
    }
  }
  const body28 = sectionOf(rec, 73, 78)
  if (body28) {
    const b78Msg = parseWireMessage(body28.value as Uint8Array)
    const r1 = b78Msg?.find((g) => g.number === 1 && g.wire === 2)
    const r1Msg = r1 ? parseWireMessage(r1.value as Uint8Array) : undefined
    // 释放类型 = 78.1.1 内 f2:2（普通）存在与否（瞬发缺省）
    const r11 = r1Msg?.find((g) => g.number === 1 && g.wire === 2)
    const r11Msg = r11 ? parseWireMessage(r11.value as Uint8Array) : undefined
    const hasF2 = r11Msg?.some((g) => g.number === 2 && g.wire === 0)
    skillType = hasF2 ? 'normal' : 'instant'
    const r2 = r1Msg?.find((g) => g.number === 2 && g.wire === 2)
    const r2Msg = r2 ? parseWireMessage(r2.value as Uint8Array) : undefined
    model = r2Msg?.find((g) => g.number === 1 && g.wire === 0)?.value as number | undefined
    for (const f4 of r1Msg?.filter((g) => g.number === 4 && g.wire === 2) ?? []) {
      const e = parseWireMessage(f4.value as Uint8Array)
      const gid = e?.find((g) => g.number === 1 && g.wire === 0)?.value as number | undefined
      const tp = e?.find((g) => g.number === 2 && g.wire === 0)?.value as number | undefined
      if (gid !== undefined) bindings.push({ kind: 'body-78-f4', graphId: gid, trackPoint: tp })
    }
  }

  let f45_2: number | undefined
  let f45_16: number | undefined
  const track = sectionOf(rec, 35, 45)
  if (track) {
    const trackMsg = parseWireMessage(track.value as Uint8Array)
    f45_2 = trackMsg?.find((g) => g.number === 2 && g.wire === 0)?.value as number | undefined
    const t1 = trackMsg?.find((g) => g.number === 1 && g.wire === 2)
    const t1Msg = t1 ? parseWireMessage(t1.value as Uint8Array) : undefined
    f45_16 = t1Msg?.find((g) => g.number === 16 && g.wire === 0)?.value as number | undefined
    for (const f4 of t1Msg?.filter((g) => g.number === 4 && g.wire === 2) ?? []) {
      const e = parseWireMessage(f4.value as Uint8Array)
      const gid = e?.find((g) => g.number === 1 && g.wire === 0)?.value as number | undefined
      const trig = e?.find((g) => g.number === 3 && g.wire === 0)?.value as number | undefined
      const beat = e?.find((g) => g.number === 4 && g.wire === 0)?.value as number | undefined
      if (gid !== undefined) {
        bindings.push({ kind: 'event-track-f4', graphId: gid, triggerPoint: trig, beatPoint: beat })
      }
    }
  }

  return {
    id,
    template,
    templateName: TEMPLATE_NAMES[template] ?? `T${template}`,
    name,
    skillType,
    bindings,
    model,
    f45_2,
    f45_16
  }
}

export function listSkillConfigs(payload: Uint8Array): SkillConfigView[] {
  const root = parseWireMessage(payload)
  if (!root) return []
  const root15 = root.find((f) => f.number === 15 && f.wire === 2)
  if (!root15) return []
  const r15 = parseWireMessage(root15.value as Uint8Array)
  if (!r15) return []
  const result: SkillConfigView[] = []
  for (const rec of r15) {
    if (rec.wire !== 2 || rec.number !== 1) continue
    const inner = parseWireMessage(rec.value as Uint8Array)
    const f2 = inner?.find((g) => g.number === 2 && g.wire === 0)?.value
    if (f2 !== 36 && f2 !== 6 && f2 !== 28) continue
    try {
      result.push(parseSkillConfigRecord(rec.value as Uint8Array))
    } catch {
      // 记录级解析失败不阻断整体 list
    }
  }
  return result
}

// ==================== CLI ====================

type Args = {
  sub: 'create' | 'list'
  gilPath: string | undefined
  mapId: number | undefined
  id: number | undefined
  name: string | undefined
  template: SkillTemplate
  skillType: SkillRelease
  graphIds: number[]
  outputPath: string | undefined
  write: boolean
  json: boolean
}

function usage(exitCode = 0): never {
  const output = [
    'Usage: gsts assets:skill-config <sub> [options]',
    '',
    '  create                       create a skill config asset (root 6 folder + root 15/16 records)',
    '  list                         list skill configs (root 15 records) with bindings',
    '',
    'Options:',
    '  --config <file>   project config (for --map-id resolution)',
    '  --gil <file>      explicit GIL source',
    '  --map-id <id>     target map ID (location only; requires project config)',
    '  --id <id>         create: skill config ID (必填；分配规则未闭合，须显式指定)',
    '  --name <string>   create: skill config name',
    '  --template <名>   create: 普通技能|36 | 自定义技能|6 | 自定义造物|28 (28 fail closed)',
    '  --skill-type <名> create: 瞬发|instant | 普通|normal (默认 normal)',
    '  --graph-id <id,...> create: 绑定节点图（瞬发=body f5 多值；普通=事件轨道打点限 1 个）',
    '  --output <file>   create: write result to a new file (no overwrite)',
    '  --write           create: write source GIL after backup',
    '  --json            list: machine-readable output',
    '  -h, --help        show help',
    '',
    'Examples:',
    '  gsts assets:skill-config create --gil map.gil --id 1228931074 --name 新技能 --template 普通技能 --skill-type 瞬发 --graph-id 1082130433 --output candidate.gil',
    '  gsts assets:skill-config list --gil map.gil --json',
    ''
  ].join('\n')
  console[exitCode === 0 ? 'log' : 'error'](output)
  process.exit(exitCode)
}

function value(argv: readonly string[], index: number): string {
  const result = argv[index + 1]
  if (!result || result.startsWith('--')) usage()
  return result
}

function parseTemplate(input: string): SkillTemplate {
  if (input === '36' || input === '普通技能' || input === '普通') return 'normal'
  if (input === '6' || input === '自定义技能' || input === '自定义') return 'custom'
  if (input === '28' || input === '自定义造物' || input === '造物') return 'creation'
  throw new Error(`[error] unknown skill template: ${input}（可用：普通技能|36、自定义技能|6、自定义造物|28）`)
}

function parseSkillType(input: string): SkillRelease {
  if (input === 'instant' || input === '瞬发') return 'instant'
  if (input === 'normal' || input === '普通') return 'normal'
  throw new Error(`[error] unknown skill type: ${input}（可用：瞬发|instant、普通|normal）`)
}

function parseArgs(argv: readonly string[]): Args {
  let sub: Args['sub'] = 'list'
  let gilPath: string | undefined
  let mapId: number | undefined
  let id: number | undefined
  let name: string | undefined
  let template: SkillTemplate = 'normal'
  let skillType: SkillRelease = 'normal'
  const graphIds: number[] = []
  let outputPath: string | undefined
  let write = false
  let json = false
  let index = 0
  if (argv[0] === 'create' || argv[0] === 'list') sub = argv[0] as Args['sub'], index++
  for (; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--gil') gilPath = value(argv, index++)
    else if (arg === '--map-id') mapId = Number(value(argv, index++))
    else if (arg === '--id') id = Number(value(argv, index++))
    else if (arg === '--name') name = value(argv, index++)
    else if (arg === '--template') template = parseTemplate(value(argv, index++))
    else if (arg === '--skill-type') skillType = parseSkillType(value(argv, index++))
    else if (arg === '--graph-id') graphIds.push(...value(argv, index++).split(',').map(Number))
    else if (arg === '--output') outputPath = value(argv, index++)
    else if (arg === '--write') write = true
    else if (arg === '--json') json = true
    else if (arg === '--help' || arg === '-h') usage(0)
    else usage()
  }
  if (gilPath && mapId !== undefined)
    throw new Error('[error] --gil and --map-id are mutually exclusive')
  if (write && outputPath) throw new Error('[error] --write and --output are mutually exclusive')
  if (sub === 'create') {
    if (id === undefined) throw new Error('[error] create requires --id（技能配置 ID 分配规则未闭合，须显式指定）')
    if (name === undefined) throw new Error('[error] create requires --name')
    if (write && !name) usage()
  }
  return { sub, gilPath, mapId, id, name, template, skillType, graphIds, outputPath, write, json }
}

function resolveGilPath(
  projectConfig: GstsConfig | undefined,
  args: Args
): { path: string; mapId: number } {
  if (args.gilPath) {
    const absolute = path.resolve(args.gilPath)
    return { path: absolute, mapId: args.mapId ?? Number(path.basename(absolute, '.gil')) }
  }
  const inject: GstsInjectConfig = { ...(projectConfig?.inject ?? {}) }
  if (args.mapId !== undefined) inject.mapId = args.mapId
  if (inject.mapId === undefined) {
    throw new Error(
      '[error] mapId is required; use --gil, or provide --map-id with a project config'
    )
  }
  const target = resolveGilTarget(inject)
  return { path: target.gilPath, mapId: target.mapId }
}

function runList(bytes: Uint8Array, gil: string, args: Args): void {
  const configs = listSkillConfigs(bytes.slice(20, -4))
  if (args.json) {
    console.log(JSON.stringify({ gilPath: gil, skillConfigs: configs }, null, 2))
    return
  }
  if (configs.length === 0) {
    console.log('(no skill configs found)')
    return
  }
  for (const c of configs) {
    console.log(
      `id=${c.id} template=${c.template}(${c.templateName}) name=${c.name ?? ''} ` +
        `skillType=${c.skillType} f45_2=${c.f45_2} f45_16=${c.f45_16} model=${c.model ?? '-'}`
    )
    for (const b of c.bindings) {
      console.log(
        `  bind ${b.kind} graphId=${b.graphId} trackPoint=${b.trackPoint ?? '-'} ` +
          `trigger=${b.triggerPoint ?? '-'} beat=${b.beatPoint ?? '-'}`
      )
    }
  }
}

export async function runAssetsSkillConfig(
  argv: readonly string[] = process.argv.slice(2),
  rootContext: RootContext = {}
): Promise<void> {
  const args = parseArgs(argv)
  let projectConfig = rootContext.projectConfig
  if (!projectConfig && rootContext.projectConfigPath) {
    projectConfig = await loadGstsConfig(rootContext.projectConfigPath, { profile: 'project' })
  }
  const source = resolveGilPath(projectConfig, args)
  const gil = source.path
  const sourceBytes = new Uint8Array(fs.readFileSync(gil))
  const payload = sourceBytes.slice(20, -4)

  if (args.sub === 'list') {
    runList(sourceBytes, gil, args)
    return
  }

  const sourceSha = sha256Bytes(sourceBytes)
  const result = buildSkillConfig(payload, {
    id: args.id!,
    name: args.name!,
    template: args.template,
    skillType: args.skillType,
    graphIds: args.graphIds
  })
  const header = {
    schema: readUint32BE(sourceBytes, 4),
    headTag: readUint32BE(sourceBytes, 8),
    fileType: readUint32BE(sourceBytes, 12),
    tailTag: readUint32BE(sourceBytes, sourceBytes.length - 4)
  }
  const newFile = buildFile(result, header)
  const candidateSha = sha256Bytes(newFile)
  const back = listSkillConfigs(result)
  if (!back.some((c) => c.id === args.id)) {
    throw new Error('[error] read-back: skill config record missing after create')
  }

  if (args.write) {
    const nowSha = sha256Bytes(new Uint8Array(fs.readFileSync(gil)))
    if (nowSha !== sourceSha) throw new Error('[error] source GIL changed since read; aborting write')
    const backupDir = path.join(path.dirname(gil), '.gsts', 'backups')
    fs.mkdirSync(backupDir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backup = path.join(backupDir, `${path.basename(gil)}.${stamp}.new-skill-config.bak`)
    fs.copyFileSync(gil, backup)
    fs.writeFileSync(gil, newFile)
    try {
      syncGilToTemp(path.dirname(gil), path.basename(gil))
    } catch {
      // best-effort temp sync
    }
    console.log(`backup=${backup}`)
    console.log(`written=${gil}`)
  } else if (args.outputPath) {
    const absolute = path.resolve(args.outputPath)
    if (fs.existsSync(absolute)) throw new Error(`[error] output already exists: ${absolute}`)
    fs.mkdirSync(path.dirname(absolute), { recursive: true })
    fs.writeFileSync(absolute, newFile)
    console.log(`written=${absolute}`)
  } else {
    console.log(`preview=${gil}`)
  }
  console.log(
    `skillConfigId=${args.id} name=${args.name} template=${args.template} skillType=${args.skillType} ` +
      `graphIds=[${args.graphIds.join(',')}] sourceSha256=${sourceSha} candidateSha256=${candidateSha} ` +
      `size=${sourceBytes.length}->${newFile.length}`
  )
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  runAssetsSkillConfig().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
