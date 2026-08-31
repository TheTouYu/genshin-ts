import { g } from 'genshin-ts/runtime/core'

// 计算通道 v2·并发生产者pubB（相位 B：t=20/22/24s 盲发 3 个任务，不等 ACK、不校验）
// payload 与主图同构但zt_i 偏移 +500000（B 任务可从回声哈希区分）。
// 与 ztPA 定时器同拍对撞，用于测并发丢任务/写撕裂的真实形态。
g.server({ id: 1082130447, name: '_GSTS_ztPB' })
  .on('whenEntityIsCreated', (_evt, f) => {
    f.printString('lane:pb-armed')
    f.startTimer(f.getSelfEntity(), 'pb1', false, [20])
  })
  .on('whenTimerIsTriggered', (evt, f) => {
    const owner = f.getCorrespondingValueFromList(f.getListOfPlayerEntitiesOnTheField(), 0n)
    const e = f.getCustomVariable(owner, 'zt_epoch').asType('int')
    f.doubleBranch(f.equal(evt.timerName, 'pb1'), () => {
      const pe = e + 1n
      f.setCustomVariable(owner, 'zt1', pe * 1000n + 500001n, false)
      f.setCustomVariable(owner, 'zt2', pe * 1000n + 500002n, false)
      f.setCustomVariable(owner, 'zt3', pe * 1000n + 500003n, false)
      f.setCustomVariable(owner, 'zt4', pe * 1000n + 500004n, false)
      f.setCustomVariable(owner, 'zt5', pe * 1000n + 500005n, false)
      f.setCustomVariable(owner, 'zt6', pe * 1000n + 500006n, false)
      f.setCustomVariable(owner, 'zt7', pe * 1000n + 500007n, false)
      f.setCustomVariable(owner, 'zt8', pe * 1000n + 500008n, false)
      f.setCustomVariable(owner, 'zt9', pe * 1000n + 500009n, false)
      f.setCustomVariable(owner, 'zt10', pe * 1000n + 500010n, false)
      f.setCustomVariable(owner, 'zt11', pe * 1000n + 500011n, false)
      f.setCustomVariable(owner, 'zt12', pe * 1000n + 500012n, false)
      f.setCustomVariable(owner, 'zt13', pe * 1000n + 500013n, false)
      f.setCustomVariable(owner, 'zt14', pe * 1000n + 500014n, false)
      f.setCustomVariable(owner, 'zt15', pe * 1000n + 500015n, false)
      f.setCustomVariable(owner, 'zt16', pe * 1000n + 500016n, false)
      f.setCustomVariable(owner, 'zt17', pe * 1000n + 500017n, false)
      f.setCustomVariable(owner, 'zt18', pe * 1000n + 500018n, false)
      f.setCustomVariable(owner, 'zt19', pe * 1000n + 500019n, false)
      f.setCustomVariable(owner, 'zt20', pe * 1000n + 500020n, false)
      f.setCustomVariable(owner, 'zt21', pe * 1000n + 500021n, false)
      f.setCustomVariable(owner, 'zt22', pe * 1000n + 500022n, false)
      f.setCustomVariable(owner, 'zt23', pe * 1000n + 500023n, false)
      f.setCustomVariable(owner, 'zt24', pe * 1000n + 500024n, false)
      f.setCustomVariable(owner, 'zt25', pe * 1000n + 500025n, false)
      f.setCustomVariable(owner, 'zt26', pe * 1000n + 500026n, false)
      f.setCustomVariable(owner, 'zt27', pe * 1000n + 500027n, false)
      f.setCustomVariable(owner, 'zt28', pe * 1000n + 500028n, false)
      f.setCustomVariable(owner, 'zt29', pe * 1000n + 500029n, false)
      f.setCustomVariable(owner, 'zt30', pe * 1000n + 500030n, false)
      f.setCustomVariable(owner, 'zt31', pe * 1000n + 500031n, false)
      f.setCustomVariable(owner, 'zt32', pe * 1000n + 500032n, false)
      f.setCustomVariable(owner, 'zt33', pe * 1000n + 500033n, false)
      f.setCustomVariable(owner, 'zt34', pe * 1000n + 500034n, false)
      f.setCustomVariable(owner, 'zt35', pe * 1000n + 500035n, false)
      f.setCustomVariable(owner, 'zt36', pe * 1000n + 500036n, false)
      f.setCustomVariable(owner, 'zt37', pe * 1000n + 500037n, false)
      f.setCustomVariable(owner, 'zt38', pe * 1000n + 500038n, false)
      f.setCustomVariable(owner, 'zt39', pe * 1000n + 500039n, false)
      f.setCustomVariable(owner, 'zt40', pe * 1000n + 500040n, false)
      f.setCustomVariable(owner, 'zt41', pe * 1000n + 500041n, false)
      f.setCustomVariable(owner, 'zt42', pe * 1000n + 500042n, false)
      f.setCustomVariable(owner, 'zt43', pe * 1000n + 500043n, false)
      f.setCustomVariable(owner, 'zt44', pe * 1000n + 500044n, false)
      f.setCustomVariable(owner, 'zt45', pe * 1000n + 500045n, false)
      f.setCustomVariable(owner, 'zt46', pe * 1000n + 500046n, false)
      f.setCustomVariable(owner, 'zt47', pe * 1000n + 500047n, false)
      f.setCustomVariable(owner, 'zt48', pe * 1000n + 500048n, false)
      f.setCustomVariable(owner, 'zt49', pe * 1000n + 500049n, false)
      f.setCustomVariable(owner, 'zt50', pe * 1000n + 500050n, false)
      f.setCustomVariable(owner, 'zt51', pe * 1000n + 500051n, false)
      f.setCustomVariable(owner, 'zt52', pe * 1000n + 500052n, false)
      f.setCustomVariable(owner, 'zt53', pe * 1000n + 500053n, false)
      f.setCustomVariable(owner, 'zt54', pe * 1000n + 500054n, false)
      f.setCustomVariable(owner, 'zt55', pe * 1000n + 500055n, false)
      f.setCustomVariable(owner, 'zt56', pe * 1000n + 500056n, false)
      f.setCustomVariable(owner, 'zt57', pe * 1000n + 500057n, false)
      f.setCustomVariable(owner, 'zt58', pe * 1000n + 500058n, false)
      f.setCustomVariable(owner, 'zt59', pe * 1000n + 500059n, false)
      f.setCustomVariable(owner, 'zt60', pe * 1000n + 500060n, false)
      f.setCustomVariable(owner, 'zt61', pe * 1000n + 500061n, false)
      f.setCustomVariable(owner, 'zt62', pe * 1000n + 500062n, false)
      f.setCustomVariable(owner, 'zt63', pe * 1000n + 500063n, false)
      f.setCustomVariable(owner, 'zt64', pe * 1000n + 500064n, false)
      f.setCustomVariable(owner, 'zt65', pe * 1000n + 500065n, false)
      f.setCustomVariable(owner, 'zt66', pe * 1000n + 500066n, false)
      f.setCustomVariable(owner, 'zt67', pe * 1000n + 500067n, false)
      f.setCustomVariable(owner, 'zt68', pe * 1000n + 500068n, false)
      f.setCustomVariable(owner, 'zt69', pe * 1000n + 500069n, false)
      f.setCustomVariable(owner, 'zt70', pe * 1000n + 500070n, false)
      f.setCustomVariable(owner, 'zt71', pe * 1000n + 500071n, false)
      f.setCustomVariable(owner, 'zt72', pe * 1000n + 500072n, false)
      f.setCustomVariable(owner, 'zt73', pe * 1000n + 500073n, false)
      f.setCustomVariable(owner, 'zt74', pe * 1000n + 500074n, false)
      f.setCustomVariable(owner, 'zt75', pe * 1000n + 500075n, false)
      f.setCustomVariable(owner, 'zt76', pe * 1000n + 500076n, false)
      f.setCustomVariable(owner, 'zt77', pe * 1000n + 500077n, false)
      f.setCustomVariable(owner, 'zt78', pe * 1000n + 500078n, false)
      f.setCustomVariable(owner, 'zt79', pe * 1000n + 500079n, false)
      f.setCustomVariable(owner, 'zt80', pe * 1000n + 500080n, false)
      f.setCustomVariable(owner, 'zt81', pe * 1000n + 500081n, false)
      f.setCustomVariable(owner, 'zt82', pe * 1000n + 500082n, false)
      f.setCustomVariable(owner, 'zt83', pe * 1000n + 500083n, false)
      f.setCustomVariable(owner, 'zt84', pe * 1000n + 500084n, false)
      f.setCustomVariable(owner, 'zt85', pe * 1000n + 500085n, false)
      f.setCustomVariable(owner, 'zt86', pe * 1000n + 500086n, false)
      f.setCustomVariable(owner, 'zt87', pe * 1000n + 500087n, false)
      f.setCustomVariable(owner, 'zt88', pe * 1000n + 500088n, false)
      f.setCustomVariable(owner, 'zt89', pe * 1000n + 500089n, false)
      f.setCustomVariable(owner, 'zt90', pe * 1000n + 500090n, false)
      f.setCustomVariable(owner, 'zt91', pe * 1000n + 500091n, false)
      f.setCustomVariable(owner, 'zt92', pe * 1000n + 500092n, false)
      f.setCustomVariable(owner, 'zt93', pe * 1000n + 500093n, false)
      f.setCustomVariable(owner, 'zt94', pe * 1000n + 500094n, false)
      f.setCustomVariable(owner, 'zt95', pe * 1000n + 500095n, false)
      f.setCustomVariable(owner, 'zt96', pe * 1000n + 500096n, false)
      f.setCustomVariable(owner, 'zt97', pe * 1000n + 500097n, false)
      f.setCustomVariable(owner, 'zt98', pe * 1000n + 500098n, false)
      f.setCustomVariable(owner, 'zt99', pe * 1000n + 500099n, false)
      f.setCustomVariable(owner, 'zt100', pe * 1000n + 500100n, false)
      const s1 = (pe * 1000n + 500001n) % 1000000007n
      const s2 = (s1 * 31n + pe * 1000n + 500002n) % 1000000007n
      const s3 = (s2 * 31n + pe * 1000n + 500003n) % 1000000007n
      const s4 = (s3 * 31n + pe * 1000n + 500004n) % 1000000007n
      const s5 = (s4 * 31n + pe * 1000n + 500005n) % 1000000007n
      const s6 = (s5 * 31n + pe * 1000n + 500006n) % 1000000007n
      const s7 = (s6 * 31n + pe * 1000n + 500007n) % 1000000007n
      const s8 = (s7 * 31n + pe * 1000n + 500008n) % 1000000007n
      const s9 = (s8 * 31n + pe * 1000n + 500009n) % 1000000007n
      const s10 = (s9 * 31n + pe * 1000n + 500010n) % 1000000007n
      const s11 = (s10 * 31n + pe * 1000n + 500011n) % 1000000007n
      const s12 = (s11 * 31n + pe * 1000n + 500012n) % 1000000007n
      const s13 = (s12 * 31n + pe * 1000n + 500013n) % 1000000007n
      const s14 = (s13 * 31n + pe * 1000n + 500014n) % 1000000007n
      const s15 = (s14 * 31n + pe * 1000n + 500015n) % 1000000007n
      const s16 = (s15 * 31n + pe * 1000n + 500016n) % 1000000007n
      const s17 = (s16 * 31n + pe * 1000n + 500017n) % 1000000007n
      const s18 = (s17 * 31n + pe * 1000n + 500018n) % 1000000007n
      const s19 = (s18 * 31n + pe * 1000n + 500019n) % 1000000007n
      const s20 = (s19 * 31n + pe * 1000n + 500020n) % 1000000007n
      const s21 = (s20 * 31n + pe * 1000n + 500021n) % 1000000007n
      const s22 = (s21 * 31n + pe * 1000n + 500022n) % 1000000007n
      const s23 = (s22 * 31n + pe * 1000n + 500023n) % 1000000007n
      const s24 = (s23 * 31n + pe * 1000n + 500024n) % 1000000007n
      const s25 = (s24 * 31n + pe * 1000n + 500025n) % 1000000007n
      const s26 = (s25 * 31n + pe * 1000n + 500026n) % 1000000007n
      const s27 = (s26 * 31n + pe * 1000n + 500027n) % 1000000007n
      const s28 = (s27 * 31n + pe * 1000n + 500028n) % 1000000007n
      const s29 = (s28 * 31n + pe * 1000n + 500029n) % 1000000007n
      const s30 = (s29 * 31n + pe * 1000n + 500030n) % 1000000007n
      const s31 = (s30 * 31n + pe * 1000n + 500031n) % 1000000007n
      const s32 = (s31 * 31n + pe * 1000n + 500032n) % 1000000007n
      const s33 = (s32 * 31n + pe * 1000n + 500033n) % 1000000007n
      const s34 = (s33 * 31n + pe * 1000n + 500034n) % 1000000007n
      const s35 = (s34 * 31n + pe * 1000n + 500035n) % 1000000007n
      const s36 = (s35 * 31n + pe * 1000n + 500036n) % 1000000007n
      const s37 = (s36 * 31n + pe * 1000n + 500037n) % 1000000007n
      const s38 = (s37 * 31n + pe * 1000n + 500038n) % 1000000007n
      const s39 = (s38 * 31n + pe * 1000n + 500039n) % 1000000007n
      const s40 = (s39 * 31n + pe * 1000n + 500040n) % 1000000007n
      const s41 = (s40 * 31n + pe * 1000n + 500041n) % 1000000007n
      const s42 = (s41 * 31n + pe * 1000n + 500042n) % 1000000007n
      const s43 = (s42 * 31n + pe * 1000n + 500043n) % 1000000007n
      const s44 = (s43 * 31n + pe * 1000n + 500044n) % 1000000007n
      const s45 = (s44 * 31n + pe * 1000n + 500045n) % 1000000007n
      const s46 = (s45 * 31n + pe * 1000n + 500046n) % 1000000007n
      const s47 = (s46 * 31n + pe * 1000n + 500047n) % 1000000007n
      const s48 = (s47 * 31n + pe * 1000n + 500048n) % 1000000007n
      const s49 = (s48 * 31n + pe * 1000n + 500049n) % 1000000007n
      const s50 = (s49 * 31n + pe * 1000n + 500050n) % 1000000007n
      const s51 = (s50 * 31n + pe * 1000n + 500051n) % 1000000007n
      const s52 = (s51 * 31n + pe * 1000n + 500052n) % 1000000007n
      const s53 = (s52 * 31n + pe * 1000n + 500053n) % 1000000007n
      const s54 = (s53 * 31n + pe * 1000n + 500054n) % 1000000007n
      const s55 = (s54 * 31n + pe * 1000n + 500055n) % 1000000007n
      const s56 = (s55 * 31n + pe * 1000n + 500056n) % 1000000007n
      const s57 = (s56 * 31n + pe * 1000n + 500057n) % 1000000007n
      const s58 = (s57 * 31n + pe * 1000n + 500058n) % 1000000007n
      const s59 = (s58 * 31n + pe * 1000n + 500059n) % 1000000007n
      const s60 = (s59 * 31n + pe * 1000n + 500060n) % 1000000007n
      const s61 = (s60 * 31n + pe * 1000n + 500061n) % 1000000007n
      const s62 = (s61 * 31n + pe * 1000n + 500062n) % 1000000007n
      const s63 = (s62 * 31n + pe * 1000n + 500063n) % 1000000007n
      const s64 = (s63 * 31n + pe * 1000n + 500064n) % 1000000007n
      const s65 = (s64 * 31n + pe * 1000n + 500065n) % 1000000007n
      const s66 = (s65 * 31n + pe * 1000n + 500066n) % 1000000007n
      const s67 = (s66 * 31n + pe * 1000n + 500067n) % 1000000007n
      const s68 = (s67 * 31n + pe * 1000n + 500068n) % 1000000007n
      const s69 = (s68 * 31n + pe * 1000n + 500069n) % 1000000007n
      const s70 = (s69 * 31n + pe * 1000n + 500070n) % 1000000007n
      const s71 = (s70 * 31n + pe * 1000n + 500071n) % 1000000007n
      const s72 = (s71 * 31n + pe * 1000n + 500072n) % 1000000007n
      const s73 = (s72 * 31n + pe * 1000n + 500073n) % 1000000007n
      const s74 = (s73 * 31n + pe * 1000n + 500074n) % 1000000007n
      const s75 = (s74 * 31n + pe * 1000n + 500075n) % 1000000007n
      const s76 = (s75 * 31n + pe * 1000n + 500076n) % 1000000007n
      const s77 = (s76 * 31n + pe * 1000n + 500077n) % 1000000007n
      const s78 = (s77 * 31n + pe * 1000n + 500078n) % 1000000007n
      const s79 = (s78 * 31n + pe * 1000n + 500079n) % 1000000007n
      const s80 = (s79 * 31n + pe * 1000n + 500080n) % 1000000007n
      const s81 = (s80 * 31n + pe * 1000n + 500081n) % 1000000007n
      const s82 = (s81 * 31n + pe * 1000n + 500082n) % 1000000007n
      const s83 = (s82 * 31n + pe * 1000n + 500083n) % 1000000007n
      const s84 = (s83 * 31n + pe * 1000n + 500084n) % 1000000007n
      const s85 = (s84 * 31n + pe * 1000n + 500085n) % 1000000007n
      const s86 = (s85 * 31n + pe * 1000n + 500086n) % 1000000007n
      const s87 = (s86 * 31n + pe * 1000n + 500087n) % 1000000007n
      const s88 = (s87 * 31n + pe * 1000n + 500088n) % 1000000007n
      const s89 = (s88 * 31n + pe * 1000n + 500089n) % 1000000007n
      const s90 = (s89 * 31n + pe * 1000n + 500090n) % 1000000007n
      const s91 = (s90 * 31n + pe * 1000n + 500091n) % 1000000007n
      const s92 = (s91 * 31n + pe * 1000n + 500092n) % 1000000007n
      const s93 = (s92 * 31n + pe * 1000n + 500093n) % 1000000007n
      const s94 = (s93 * 31n + pe * 1000n + 500094n) % 1000000007n
      const s95 = (s94 * 31n + pe * 1000n + 500095n) % 1000000007n
      const s96 = (s95 * 31n + pe * 1000n + 500096n) % 1000000007n
      const s97 = (s96 * 31n + pe * 1000n + 500097n) % 1000000007n
      const s98 = (s97 * 31n + pe * 1000n + 500098n) % 1000000007n
      const s99 = (s98 * 31n + pe * 1000n + 500099n) % 1000000007n
      const s100 = (s99 * 31n + pe * 1000n + 500100n) % 1000000007n
      f.setCustomVariable(owner, 'zt_sum', s100, false)
      f.setCustomVariable(owner, 'zt_epoch', pe, false)
      f.printString('lane:pubB')
      f.printString(f.dataTypeConversion(pe, 'str'))

      f.startTimer(f.getSelfEntity(), 'pb2', false, [2])
    }, () => {
      f.doubleBranch(f.equal(evt.timerName, 'pb2'), () => {
        const pe = e + 1n
        f.setCustomVariable(owner, 'zt1', pe * 1000n + 500001n, false)
        f.setCustomVariable(owner, 'zt2', pe * 1000n + 500002n, false)
        f.setCustomVariable(owner, 'zt3', pe * 1000n + 500003n, false)
        f.setCustomVariable(owner, 'zt4', pe * 1000n + 500004n, false)
        f.setCustomVariable(owner, 'zt5', pe * 1000n + 500005n, false)
        f.setCustomVariable(owner, 'zt6', pe * 1000n + 500006n, false)
        f.setCustomVariable(owner, 'zt7', pe * 1000n + 500007n, false)
        f.setCustomVariable(owner, 'zt8', pe * 1000n + 500008n, false)
        f.setCustomVariable(owner, 'zt9', pe * 1000n + 500009n, false)
        f.setCustomVariable(owner, 'zt10', pe * 1000n + 500010n, false)
        f.setCustomVariable(owner, 'zt11', pe * 1000n + 500011n, false)
        f.setCustomVariable(owner, 'zt12', pe * 1000n + 500012n, false)
        f.setCustomVariable(owner, 'zt13', pe * 1000n + 500013n, false)
        f.setCustomVariable(owner, 'zt14', pe * 1000n + 500014n, false)
        f.setCustomVariable(owner, 'zt15', pe * 1000n + 500015n, false)
        f.setCustomVariable(owner, 'zt16', pe * 1000n + 500016n, false)
        f.setCustomVariable(owner, 'zt17', pe * 1000n + 500017n, false)
        f.setCustomVariable(owner, 'zt18', pe * 1000n + 500018n, false)
        f.setCustomVariable(owner, 'zt19', pe * 1000n + 500019n, false)
        f.setCustomVariable(owner, 'zt20', pe * 1000n + 500020n, false)
        f.setCustomVariable(owner, 'zt21', pe * 1000n + 500021n, false)
        f.setCustomVariable(owner, 'zt22', pe * 1000n + 500022n, false)
        f.setCustomVariable(owner, 'zt23', pe * 1000n + 500023n, false)
        f.setCustomVariable(owner, 'zt24', pe * 1000n + 500024n, false)
        f.setCustomVariable(owner, 'zt25', pe * 1000n + 500025n, false)
        f.setCustomVariable(owner, 'zt26', pe * 1000n + 500026n, false)
        f.setCustomVariable(owner, 'zt27', pe * 1000n + 500027n, false)
        f.setCustomVariable(owner, 'zt28', pe * 1000n + 500028n, false)
        f.setCustomVariable(owner, 'zt29', pe * 1000n + 500029n, false)
        f.setCustomVariable(owner, 'zt30', pe * 1000n + 500030n, false)
        f.setCustomVariable(owner, 'zt31', pe * 1000n + 500031n, false)
        f.setCustomVariable(owner, 'zt32', pe * 1000n + 500032n, false)
        f.setCustomVariable(owner, 'zt33', pe * 1000n + 500033n, false)
        f.setCustomVariable(owner, 'zt34', pe * 1000n + 500034n, false)
        f.setCustomVariable(owner, 'zt35', pe * 1000n + 500035n, false)
        f.setCustomVariable(owner, 'zt36', pe * 1000n + 500036n, false)
        f.setCustomVariable(owner, 'zt37', pe * 1000n + 500037n, false)
        f.setCustomVariable(owner, 'zt38', pe * 1000n + 500038n, false)
        f.setCustomVariable(owner, 'zt39', pe * 1000n + 500039n, false)
        f.setCustomVariable(owner, 'zt40', pe * 1000n + 500040n, false)
        f.setCustomVariable(owner, 'zt41', pe * 1000n + 500041n, false)
        f.setCustomVariable(owner, 'zt42', pe * 1000n + 500042n, false)
        f.setCustomVariable(owner, 'zt43', pe * 1000n + 500043n, false)
        f.setCustomVariable(owner, 'zt44', pe * 1000n + 500044n, false)
        f.setCustomVariable(owner, 'zt45', pe * 1000n + 500045n, false)
        f.setCustomVariable(owner, 'zt46', pe * 1000n + 500046n, false)
        f.setCustomVariable(owner, 'zt47', pe * 1000n + 500047n, false)
        f.setCustomVariable(owner, 'zt48', pe * 1000n + 500048n, false)
        f.setCustomVariable(owner, 'zt49', pe * 1000n + 500049n, false)
        f.setCustomVariable(owner, 'zt50', pe * 1000n + 500050n, false)
        f.setCustomVariable(owner, 'zt51', pe * 1000n + 500051n, false)
        f.setCustomVariable(owner, 'zt52', pe * 1000n + 500052n, false)
        f.setCustomVariable(owner, 'zt53', pe * 1000n + 500053n, false)
        f.setCustomVariable(owner, 'zt54', pe * 1000n + 500054n, false)
        f.setCustomVariable(owner, 'zt55', pe * 1000n + 500055n, false)
        f.setCustomVariable(owner, 'zt56', pe * 1000n + 500056n, false)
        f.setCustomVariable(owner, 'zt57', pe * 1000n + 500057n, false)
        f.setCustomVariable(owner, 'zt58', pe * 1000n + 500058n, false)
        f.setCustomVariable(owner, 'zt59', pe * 1000n + 500059n, false)
        f.setCustomVariable(owner, 'zt60', pe * 1000n + 500060n, false)
        f.setCustomVariable(owner, 'zt61', pe * 1000n + 500061n, false)
        f.setCustomVariable(owner, 'zt62', pe * 1000n + 500062n, false)
        f.setCustomVariable(owner, 'zt63', pe * 1000n + 500063n, false)
        f.setCustomVariable(owner, 'zt64', pe * 1000n + 500064n, false)
        f.setCustomVariable(owner, 'zt65', pe * 1000n + 500065n, false)
        f.setCustomVariable(owner, 'zt66', pe * 1000n + 500066n, false)
        f.setCustomVariable(owner, 'zt67', pe * 1000n + 500067n, false)
        f.setCustomVariable(owner, 'zt68', pe * 1000n + 500068n, false)
        f.setCustomVariable(owner, 'zt69', pe * 1000n + 500069n, false)
        f.setCustomVariable(owner, 'zt70', pe * 1000n + 500070n, false)
        f.setCustomVariable(owner, 'zt71', pe * 1000n + 500071n, false)
        f.setCustomVariable(owner, 'zt72', pe * 1000n + 500072n, false)
        f.setCustomVariable(owner, 'zt73', pe * 1000n + 500073n, false)
        f.setCustomVariable(owner, 'zt74', pe * 1000n + 500074n, false)
        f.setCustomVariable(owner, 'zt75', pe * 1000n + 500075n, false)
        f.setCustomVariable(owner, 'zt76', pe * 1000n + 500076n, false)
        f.setCustomVariable(owner, 'zt77', pe * 1000n + 500077n, false)
        f.setCustomVariable(owner, 'zt78', pe * 1000n + 500078n, false)
        f.setCustomVariable(owner, 'zt79', pe * 1000n + 500079n, false)
        f.setCustomVariable(owner, 'zt80', pe * 1000n + 500080n, false)
        f.setCustomVariable(owner, 'zt81', pe * 1000n + 500081n, false)
        f.setCustomVariable(owner, 'zt82', pe * 1000n + 500082n, false)
        f.setCustomVariable(owner, 'zt83', pe * 1000n + 500083n, false)
        f.setCustomVariable(owner, 'zt84', pe * 1000n + 500084n, false)
        f.setCustomVariable(owner, 'zt85', pe * 1000n + 500085n, false)
        f.setCustomVariable(owner, 'zt86', pe * 1000n + 500086n, false)
        f.setCustomVariable(owner, 'zt87', pe * 1000n + 500087n, false)
        f.setCustomVariable(owner, 'zt88', pe * 1000n + 500088n, false)
        f.setCustomVariable(owner, 'zt89', pe * 1000n + 500089n, false)
        f.setCustomVariable(owner, 'zt90', pe * 1000n + 500090n, false)
        f.setCustomVariable(owner, 'zt91', pe * 1000n + 500091n, false)
        f.setCustomVariable(owner, 'zt92', pe * 1000n + 500092n, false)
        f.setCustomVariable(owner, 'zt93', pe * 1000n + 500093n, false)
        f.setCustomVariable(owner, 'zt94', pe * 1000n + 500094n, false)
        f.setCustomVariable(owner, 'zt95', pe * 1000n + 500095n, false)
        f.setCustomVariable(owner, 'zt96', pe * 1000n + 500096n, false)
        f.setCustomVariable(owner, 'zt97', pe * 1000n + 500097n, false)
        f.setCustomVariable(owner, 'zt98', pe * 1000n + 500098n, false)
        f.setCustomVariable(owner, 'zt99', pe * 1000n + 500099n, false)
        f.setCustomVariable(owner, 'zt100', pe * 1000n + 500100n, false)
        const s1 = (pe * 1000n + 500001n) % 1000000007n
        const s2 = (s1 * 31n + pe * 1000n + 500002n) % 1000000007n
        const s3 = (s2 * 31n + pe * 1000n + 500003n) % 1000000007n
        const s4 = (s3 * 31n + pe * 1000n + 500004n) % 1000000007n
        const s5 = (s4 * 31n + pe * 1000n + 500005n) % 1000000007n
        const s6 = (s5 * 31n + pe * 1000n + 500006n) % 1000000007n
        const s7 = (s6 * 31n + pe * 1000n + 500007n) % 1000000007n
        const s8 = (s7 * 31n + pe * 1000n + 500008n) % 1000000007n
        const s9 = (s8 * 31n + pe * 1000n + 500009n) % 1000000007n
        const s10 = (s9 * 31n + pe * 1000n + 500010n) % 1000000007n
        const s11 = (s10 * 31n + pe * 1000n + 500011n) % 1000000007n
        const s12 = (s11 * 31n + pe * 1000n + 500012n) % 1000000007n
        const s13 = (s12 * 31n + pe * 1000n + 500013n) % 1000000007n
        const s14 = (s13 * 31n + pe * 1000n + 500014n) % 1000000007n
        const s15 = (s14 * 31n + pe * 1000n + 500015n) % 1000000007n
        const s16 = (s15 * 31n + pe * 1000n + 500016n) % 1000000007n
        const s17 = (s16 * 31n + pe * 1000n + 500017n) % 1000000007n
        const s18 = (s17 * 31n + pe * 1000n + 500018n) % 1000000007n
        const s19 = (s18 * 31n + pe * 1000n + 500019n) % 1000000007n
        const s20 = (s19 * 31n + pe * 1000n + 500020n) % 1000000007n
        const s21 = (s20 * 31n + pe * 1000n + 500021n) % 1000000007n
        const s22 = (s21 * 31n + pe * 1000n + 500022n) % 1000000007n
        const s23 = (s22 * 31n + pe * 1000n + 500023n) % 1000000007n
        const s24 = (s23 * 31n + pe * 1000n + 500024n) % 1000000007n
        const s25 = (s24 * 31n + pe * 1000n + 500025n) % 1000000007n
        const s26 = (s25 * 31n + pe * 1000n + 500026n) % 1000000007n
        const s27 = (s26 * 31n + pe * 1000n + 500027n) % 1000000007n
        const s28 = (s27 * 31n + pe * 1000n + 500028n) % 1000000007n
        const s29 = (s28 * 31n + pe * 1000n + 500029n) % 1000000007n
        const s30 = (s29 * 31n + pe * 1000n + 500030n) % 1000000007n
        const s31 = (s30 * 31n + pe * 1000n + 500031n) % 1000000007n
        const s32 = (s31 * 31n + pe * 1000n + 500032n) % 1000000007n
        const s33 = (s32 * 31n + pe * 1000n + 500033n) % 1000000007n
        const s34 = (s33 * 31n + pe * 1000n + 500034n) % 1000000007n
        const s35 = (s34 * 31n + pe * 1000n + 500035n) % 1000000007n
        const s36 = (s35 * 31n + pe * 1000n + 500036n) % 1000000007n
        const s37 = (s36 * 31n + pe * 1000n + 500037n) % 1000000007n
        const s38 = (s37 * 31n + pe * 1000n + 500038n) % 1000000007n
        const s39 = (s38 * 31n + pe * 1000n + 500039n) % 1000000007n
        const s40 = (s39 * 31n + pe * 1000n + 500040n) % 1000000007n
        const s41 = (s40 * 31n + pe * 1000n + 500041n) % 1000000007n
        const s42 = (s41 * 31n + pe * 1000n + 500042n) % 1000000007n
        const s43 = (s42 * 31n + pe * 1000n + 500043n) % 1000000007n
        const s44 = (s43 * 31n + pe * 1000n + 500044n) % 1000000007n
        const s45 = (s44 * 31n + pe * 1000n + 500045n) % 1000000007n
        const s46 = (s45 * 31n + pe * 1000n + 500046n) % 1000000007n
        const s47 = (s46 * 31n + pe * 1000n + 500047n) % 1000000007n
        const s48 = (s47 * 31n + pe * 1000n + 500048n) % 1000000007n
        const s49 = (s48 * 31n + pe * 1000n + 500049n) % 1000000007n
        const s50 = (s49 * 31n + pe * 1000n + 500050n) % 1000000007n
        const s51 = (s50 * 31n + pe * 1000n + 500051n) % 1000000007n
        const s52 = (s51 * 31n + pe * 1000n + 500052n) % 1000000007n
        const s53 = (s52 * 31n + pe * 1000n + 500053n) % 1000000007n
        const s54 = (s53 * 31n + pe * 1000n + 500054n) % 1000000007n
        const s55 = (s54 * 31n + pe * 1000n + 500055n) % 1000000007n
        const s56 = (s55 * 31n + pe * 1000n + 500056n) % 1000000007n
        const s57 = (s56 * 31n + pe * 1000n + 500057n) % 1000000007n
        const s58 = (s57 * 31n + pe * 1000n + 500058n) % 1000000007n
        const s59 = (s58 * 31n + pe * 1000n + 500059n) % 1000000007n
        const s60 = (s59 * 31n + pe * 1000n + 500060n) % 1000000007n
        const s61 = (s60 * 31n + pe * 1000n + 500061n) % 1000000007n
        const s62 = (s61 * 31n + pe * 1000n + 500062n) % 1000000007n
        const s63 = (s62 * 31n + pe * 1000n + 500063n) % 1000000007n
        const s64 = (s63 * 31n + pe * 1000n + 500064n) % 1000000007n
        const s65 = (s64 * 31n + pe * 1000n + 500065n) % 1000000007n
        const s66 = (s65 * 31n + pe * 1000n + 500066n) % 1000000007n
        const s67 = (s66 * 31n + pe * 1000n + 500067n) % 1000000007n
        const s68 = (s67 * 31n + pe * 1000n + 500068n) % 1000000007n
        const s69 = (s68 * 31n + pe * 1000n + 500069n) % 1000000007n
        const s70 = (s69 * 31n + pe * 1000n + 500070n) % 1000000007n
        const s71 = (s70 * 31n + pe * 1000n + 500071n) % 1000000007n
        const s72 = (s71 * 31n + pe * 1000n + 500072n) % 1000000007n
        const s73 = (s72 * 31n + pe * 1000n + 500073n) % 1000000007n
        const s74 = (s73 * 31n + pe * 1000n + 500074n) % 1000000007n
        const s75 = (s74 * 31n + pe * 1000n + 500075n) % 1000000007n
        const s76 = (s75 * 31n + pe * 1000n + 500076n) % 1000000007n
        const s77 = (s76 * 31n + pe * 1000n + 500077n) % 1000000007n
        const s78 = (s77 * 31n + pe * 1000n + 500078n) % 1000000007n
        const s79 = (s78 * 31n + pe * 1000n + 500079n) % 1000000007n
        const s80 = (s79 * 31n + pe * 1000n + 500080n) % 1000000007n
        const s81 = (s80 * 31n + pe * 1000n + 500081n) % 1000000007n
        const s82 = (s81 * 31n + pe * 1000n + 500082n) % 1000000007n
        const s83 = (s82 * 31n + pe * 1000n + 500083n) % 1000000007n
        const s84 = (s83 * 31n + pe * 1000n + 500084n) % 1000000007n
        const s85 = (s84 * 31n + pe * 1000n + 500085n) % 1000000007n
        const s86 = (s85 * 31n + pe * 1000n + 500086n) % 1000000007n
        const s87 = (s86 * 31n + pe * 1000n + 500087n) % 1000000007n
        const s88 = (s87 * 31n + pe * 1000n + 500088n) % 1000000007n
        const s89 = (s88 * 31n + pe * 1000n + 500089n) % 1000000007n
        const s90 = (s89 * 31n + pe * 1000n + 500090n) % 1000000007n
        const s91 = (s90 * 31n + pe * 1000n + 500091n) % 1000000007n
        const s92 = (s91 * 31n + pe * 1000n + 500092n) % 1000000007n
        const s93 = (s92 * 31n + pe * 1000n + 500093n) % 1000000007n
        const s94 = (s93 * 31n + pe * 1000n + 500094n) % 1000000007n
        const s95 = (s94 * 31n + pe * 1000n + 500095n) % 1000000007n
        const s96 = (s95 * 31n + pe * 1000n + 500096n) % 1000000007n
        const s97 = (s96 * 31n + pe * 1000n + 500097n) % 1000000007n
        const s98 = (s97 * 31n + pe * 1000n + 500098n) % 1000000007n
        const s99 = (s98 * 31n + pe * 1000n + 500099n) % 1000000007n
        const s100 = (s99 * 31n + pe * 1000n + 500100n) % 1000000007n
        f.setCustomVariable(owner, 'zt_sum', s100, false)
        f.setCustomVariable(owner, 'zt_epoch', pe, false)
        f.printString('lane:pubB')
        f.printString(f.dataTypeConversion(pe, 'str'))

        f.startTimer(f.getSelfEntity(), 'pb3', false, [2])
      }, () => {
        const pe = e + 1n
        f.setCustomVariable(owner, 'zt1', pe * 1000n + 500001n, false)
        f.setCustomVariable(owner, 'zt2', pe * 1000n + 500002n, false)
        f.setCustomVariable(owner, 'zt3', pe * 1000n + 500003n, false)
        f.setCustomVariable(owner, 'zt4', pe * 1000n + 500004n, false)
        f.setCustomVariable(owner, 'zt5', pe * 1000n + 500005n, false)
        f.setCustomVariable(owner, 'zt6', pe * 1000n + 500006n, false)
        f.setCustomVariable(owner, 'zt7', pe * 1000n + 500007n, false)
        f.setCustomVariable(owner, 'zt8', pe * 1000n + 500008n, false)
        f.setCustomVariable(owner, 'zt9', pe * 1000n + 500009n, false)
        f.setCustomVariable(owner, 'zt10', pe * 1000n + 500010n, false)
        f.setCustomVariable(owner, 'zt11', pe * 1000n + 500011n, false)
        f.setCustomVariable(owner, 'zt12', pe * 1000n + 500012n, false)
        f.setCustomVariable(owner, 'zt13', pe * 1000n + 500013n, false)
        f.setCustomVariable(owner, 'zt14', pe * 1000n + 500014n, false)
        f.setCustomVariable(owner, 'zt15', pe * 1000n + 500015n, false)
        f.setCustomVariable(owner, 'zt16', pe * 1000n + 500016n, false)
        f.setCustomVariable(owner, 'zt17', pe * 1000n + 500017n, false)
        f.setCustomVariable(owner, 'zt18', pe * 1000n + 500018n, false)
        f.setCustomVariable(owner, 'zt19', pe * 1000n + 500019n, false)
        f.setCustomVariable(owner, 'zt20', pe * 1000n + 500020n, false)
        f.setCustomVariable(owner, 'zt21', pe * 1000n + 500021n, false)
        f.setCustomVariable(owner, 'zt22', pe * 1000n + 500022n, false)
        f.setCustomVariable(owner, 'zt23', pe * 1000n + 500023n, false)
        f.setCustomVariable(owner, 'zt24', pe * 1000n + 500024n, false)
        f.setCustomVariable(owner, 'zt25', pe * 1000n + 500025n, false)
        f.setCustomVariable(owner, 'zt26', pe * 1000n + 500026n, false)
        f.setCustomVariable(owner, 'zt27', pe * 1000n + 500027n, false)
        f.setCustomVariable(owner, 'zt28', pe * 1000n + 500028n, false)
        f.setCustomVariable(owner, 'zt29', pe * 1000n + 500029n, false)
        f.setCustomVariable(owner, 'zt30', pe * 1000n + 500030n, false)
        f.setCustomVariable(owner, 'zt31', pe * 1000n + 500031n, false)
        f.setCustomVariable(owner, 'zt32', pe * 1000n + 500032n, false)
        f.setCustomVariable(owner, 'zt33', pe * 1000n + 500033n, false)
        f.setCustomVariable(owner, 'zt34', pe * 1000n + 500034n, false)
        f.setCustomVariable(owner, 'zt35', pe * 1000n + 500035n, false)
        f.setCustomVariable(owner, 'zt36', pe * 1000n + 500036n, false)
        f.setCustomVariable(owner, 'zt37', pe * 1000n + 500037n, false)
        f.setCustomVariable(owner, 'zt38', pe * 1000n + 500038n, false)
        f.setCustomVariable(owner, 'zt39', pe * 1000n + 500039n, false)
        f.setCustomVariable(owner, 'zt40', pe * 1000n + 500040n, false)
        f.setCustomVariable(owner, 'zt41', pe * 1000n + 500041n, false)
        f.setCustomVariable(owner, 'zt42', pe * 1000n + 500042n, false)
        f.setCustomVariable(owner, 'zt43', pe * 1000n + 500043n, false)
        f.setCustomVariable(owner, 'zt44', pe * 1000n + 500044n, false)
        f.setCustomVariable(owner, 'zt45', pe * 1000n + 500045n, false)
        f.setCustomVariable(owner, 'zt46', pe * 1000n + 500046n, false)
        f.setCustomVariable(owner, 'zt47', pe * 1000n + 500047n, false)
        f.setCustomVariable(owner, 'zt48', pe * 1000n + 500048n, false)
        f.setCustomVariable(owner, 'zt49', pe * 1000n + 500049n, false)
        f.setCustomVariable(owner, 'zt50', pe * 1000n + 500050n, false)
        f.setCustomVariable(owner, 'zt51', pe * 1000n + 500051n, false)
        f.setCustomVariable(owner, 'zt52', pe * 1000n + 500052n, false)
        f.setCustomVariable(owner, 'zt53', pe * 1000n + 500053n, false)
        f.setCustomVariable(owner, 'zt54', pe * 1000n + 500054n, false)
        f.setCustomVariable(owner, 'zt55', pe * 1000n + 500055n, false)
        f.setCustomVariable(owner, 'zt56', pe * 1000n + 500056n, false)
        f.setCustomVariable(owner, 'zt57', pe * 1000n + 500057n, false)
        f.setCustomVariable(owner, 'zt58', pe * 1000n + 500058n, false)
        f.setCustomVariable(owner, 'zt59', pe * 1000n + 500059n, false)
        f.setCustomVariable(owner, 'zt60', pe * 1000n + 500060n, false)
        f.setCustomVariable(owner, 'zt61', pe * 1000n + 500061n, false)
        f.setCustomVariable(owner, 'zt62', pe * 1000n + 500062n, false)
        f.setCustomVariable(owner, 'zt63', pe * 1000n + 500063n, false)
        f.setCustomVariable(owner, 'zt64', pe * 1000n + 500064n, false)
        f.setCustomVariable(owner, 'zt65', pe * 1000n + 500065n, false)
        f.setCustomVariable(owner, 'zt66', pe * 1000n + 500066n, false)
        f.setCustomVariable(owner, 'zt67', pe * 1000n + 500067n, false)
        f.setCustomVariable(owner, 'zt68', pe * 1000n + 500068n, false)
        f.setCustomVariable(owner, 'zt69', pe * 1000n + 500069n, false)
        f.setCustomVariable(owner, 'zt70', pe * 1000n + 500070n, false)
        f.setCustomVariable(owner, 'zt71', pe * 1000n + 500071n, false)
        f.setCustomVariable(owner, 'zt72', pe * 1000n + 500072n, false)
        f.setCustomVariable(owner, 'zt73', pe * 1000n + 500073n, false)
        f.setCustomVariable(owner, 'zt74', pe * 1000n + 500074n, false)
        f.setCustomVariable(owner, 'zt75', pe * 1000n + 500075n, false)
        f.setCustomVariable(owner, 'zt76', pe * 1000n + 500076n, false)
        f.setCustomVariable(owner, 'zt77', pe * 1000n + 500077n, false)
        f.setCustomVariable(owner, 'zt78', pe * 1000n + 500078n, false)
        f.setCustomVariable(owner, 'zt79', pe * 1000n + 500079n, false)
        f.setCustomVariable(owner, 'zt80', pe * 1000n + 500080n, false)
        f.setCustomVariable(owner, 'zt81', pe * 1000n + 500081n, false)
        f.setCustomVariable(owner, 'zt82', pe * 1000n + 500082n, false)
        f.setCustomVariable(owner, 'zt83', pe * 1000n + 500083n, false)
        f.setCustomVariable(owner, 'zt84', pe * 1000n + 500084n, false)
        f.setCustomVariable(owner, 'zt85', pe * 1000n + 500085n, false)
        f.setCustomVariable(owner, 'zt86', pe * 1000n + 500086n, false)
        f.setCustomVariable(owner, 'zt87', pe * 1000n + 500087n, false)
        f.setCustomVariable(owner, 'zt88', pe * 1000n + 500088n, false)
        f.setCustomVariable(owner, 'zt89', pe * 1000n + 500089n, false)
        f.setCustomVariable(owner, 'zt90', pe * 1000n + 500090n, false)
        f.setCustomVariable(owner, 'zt91', pe * 1000n + 500091n, false)
        f.setCustomVariable(owner, 'zt92', pe * 1000n + 500092n, false)
        f.setCustomVariable(owner, 'zt93', pe * 1000n + 500093n, false)
        f.setCustomVariable(owner, 'zt94', pe * 1000n + 500094n, false)
        f.setCustomVariable(owner, 'zt95', pe * 1000n + 500095n, false)
        f.setCustomVariable(owner, 'zt96', pe * 1000n + 500096n, false)
        f.setCustomVariable(owner, 'zt97', pe * 1000n + 500097n, false)
        f.setCustomVariable(owner, 'zt98', pe * 1000n + 500098n, false)
        f.setCustomVariable(owner, 'zt99', pe * 1000n + 500099n, false)
        f.setCustomVariable(owner, 'zt100', pe * 1000n + 500100n, false)
        const s1 = (pe * 1000n + 500001n) % 1000000007n
        const s2 = (s1 * 31n + pe * 1000n + 500002n) % 1000000007n
        const s3 = (s2 * 31n + pe * 1000n + 500003n) % 1000000007n
        const s4 = (s3 * 31n + pe * 1000n + 500004n) % 1000000007n
        const s5 = (s4 * 31n + pe * 1000n + 500005n) % 1000000007n
        const s6 = (s5 * 31n + pe * 1000n + 500006n) % 1000000007n
        const s7 = (s6 * 31n + pe * 1000n + 500007n) % 1000000007n
        const s8 = (s7 * 31n + pe * 1000n + 500008n) % 1000000007n
        const s9 = (s8 * 31n + pe * 1000n + 500009n) % 1000000007n
        const s10 = (s9 * 31n + pe * 1000n + 500010n) % 1000000007n
        const s11 = (s10 * 31n + pe * 1000n + 500011n) % 1000000007n
        const s12 = (s11 * 31n + pe * 1000n + 500012n) % 1000000007n
        const s13 = (s12 * 31n + pe * 1000n + 500013n) % 1000000007n
        const s14 = (s13 * 31n + pe * 1000n + 500014n) % 1000000007n
        const s15 = (s14 * 31n + pe * 1000n + 500015n) % 1000000007n
        const s16 = (s15 * 31n + pe * 1000n + 500016n) % 1000000007n
        const s17 = (s16 * 31n + pe * 1000n + 500017n) % 1000000007n
        const s18 = (s17 * 31n + pe * 1000n + 500018n) % 1000000007n
        const s19 = (s18 * 31n + pe * 1000n + 500019n) % 1000000007n
        const s20 = (s19 * 31n + pe * 1000n + 500020n) % 1000000007n
        const s21 = (s20 * 31n + pe * 1000n + 500021n) % 1000000007n
        const s22 = (s21 * 31n + pe * 1000n + 500022n) % 1000000007n
        const s23 = (s22 * 31n + pe * 1000n + 500023n) % 1000000007n
        const s24 = (s23 * 31n + pe * 1000n + 500024n) % 1000000007n
        const s25 = (s24 * 31n + pe * 1000n + 500025n) % 1000000007n
        const s26 = (s25 * 31n + pe * 1000n + 500026n) % 1000000007n
        const s27 = (s26 * 31n + pe * 1000n + 500027n) % 1000000007n
        const s28 = (s27 * 31n + pe * 1000n + 500028n) % 1000000007n
        const s29 = (s28 * 31n + pe * 1000n + 500029n) % 1000000007n
        const s30 = (s29 * 31n + pe * 1000n + 500030n) % 1000000007n
        const s31 = (s30 * 31n + pe * 1000n + 500031n) % 1000000007n
        const s32 = (s31 * 31n + pe * 1000n + 500032n) % 1000000007n
        const s33 = (s32 * 31n + pe * 1000n + 500033n) % 1000000007n
        const s34 = (s33 * 31n + pe * 1000n + 500034n) % 1000000007n
        const s35 = (s34 * 31n + pe * 1000n + 500035n) % 1000000007n
        const s36 = (s35 * 31n + pe * 1000n + 500036n) % 1000000007n
        const s37 = (s36 * 31n + pe * 1000n + 500037n) % 1000000007n
        const s38 = (s37 * 31n + pe * 1000n + 500038n) % 1000000007n
        const s39 = (s38 * 31n + pe * 1000n + 500039n) % 1000000007n
        const s40 = (s39 * 31n + pe * 1000n + 500040n) % 1000000007n
        const s41 = (s40 * 31n + pe * 1000n + 500041n) % 1000000007n
        const s42 = (s41 * 31n + pe * 1000n + 500042n) % 1000000007n
        const s43 = (s42 * 31n + pe * 1000n + 500043n) % 1000000007n
        const s44 = (s43 * 31n + pe * 1000n + 500044n) % 1000000007n
        const s45 = (s44 * 31n + pe * 1000n + 500045n) % 1000000007n
        const s46 = (s45 * 31n + pe * 1000n + 500046n) % 1000000007n
        const s47 = (s46 * 31n + pe * 1000n + 500047n) % 1000000007n
        const s48 = (s47 * 31n + pe * 1000n + 500048n) % 1000000007n
        const s49 = (s48 * 31n + pe * 1000n + 500049n) % 1000000007n
        const s50 = (s49 * 31n + pe * 1000n + 500050n) % 1000000007n
        const s51 = (s50 * 31n + pe * 1000n + 500051n) % 1000000007n
        const s52 = (s51 * 31n + pe * 1000n + 500052n) % 1000000007n
        const s53 = (s52 * 31n + pe * 1000n + 500053n) % 1000000007n
        const s54 = (s53 * 31n + pe * 1000n + 500054n) % 1000000007n
        const s55 = (s54 * 31n + pe * 1000n + 500055n) % 1000000007n
        const s56 = (s55 * 31n + pe * 1000n + 500056n) % 1000000007n
        const s57 = (s56 * 31n + pe * 1000n + 500057n) % 1000000007n
        const s58 = (s57 * 31n + pe * 1000n + 500058n) % 1000000007n
        const s59 = (s58 * 31n + pe * 1000n + 500059n) % 1000000007n
        const s60 = (s59 * 31n + pe * 1000n + 500060n) % 1000000007n
        const s61 = (s60 * 31n + pe * 1000n + 500061n) % 1000000007n
        const s62 = (s61 * 31n + pe * 1000n + 500062n) % 1000000007n
        const s63 = (s62 * 31n + pe * 1000n + 500063n) % 1000000007n
        const s64 = (s63 * 31n + pe * 1000n + 500064n) % 1000000007n
        const s65 = (s64 * 31n + pe * 1000n + 500065n) % 1000000007n
        const s66 = (s65 * 31n + pe * 1000n + 500066n) % 1000000007n
        const s67 = (s66 * 31n + pe * 1000n + 500067n) % 1000000007n
        const s68 = (s67 * 31n + pe * 1000n + 500068n) % 1000000007n
        const s69 = (s68 * 31n + pe * 1000n + 500069n) % 1000000007n
        const s70 = (s69 * 31n + pe * 1000n + 500070n) % 1000000007n
        const s71 = (s70 * 31n + pe * 1000n + 500071n) % 1000000007n
        const s72 = (s71 * 31n + pe * 1000n + 500072n) % 1000000007n
        const s73 = (s72 * 31n + pe * 1000n + 500073n) % 1000000007n
        const s74 = (s73 * 31n + pe * 1000n + 500074n) % 1000000007n
        const s75 = (s74 * 31n + pe * 1000n + 500075n) % 1000000007n
        const s76 = (s75 * 31n + pe * 1000n + 500076n) % 1000000007n
        const s77 = (s76 * 31n + pe * 1000n + 500077n) % 1000000007n
        const s78 = (s77 * 31n + pe * 1000n + 500078n) % 1000000007n
        const s79 = (s78 * 31n + pe * 1000n + 500079n) % 1000000007n
        const s80 = (s79 * 31n + pe * 1000n + 500080n) % 1000000007n
        const s81 = (s80 * 31n + pe * 1000n + 500081n) % 1000000007n
        const s82 = (s81 * 31n + pe * 1000n + 500082n) % 1000000007n
        const s83 = (s82 * 31n + pe * 1000n + 500083n) % 1000000007n
        const s84 = (s83 * 31n + pe * 1000n + 500084n) % 1000000007n
        const s85 = (s84 * 31n + pe * 1000n + 500085n) % 1000000007n
        const s86 = (s85 * 31n + pe * 1000n + 500086n) % 1000000007n
        const s87 = (s86 * 31n + pe * 1000n + 500087n) % 1000000007n
        const s88 = (s87 * 31n + pe * 1000n + 500088n) % 1000000007n
        const s89 = (s88 * 31n + pe * 1000n + 500089n) % 1000000007n
        const s90 = (s89 * 31n + pe * 1000n + 500090n) % 1000000007n
        const s91 = (s90 * 31n + pe * 1000n + 500091n) % 1000000007n
        const s92 = (s91 * 31n + pe * 1000n + 500092n) % 1000000007n
        const s93 = (s92 * 31n + pe * 1000n + 500093n) % 1000000007n
        const s94 = (s93 * 31n + pe * 1000n + 500094n) % 1000000007n
        const s95 = (s94 * 31n + pe * 1000n + 500095n) % 1000000007n
        const s96 = (s95 * 31n + pe * 1000n + 500096n) % 1000000007n
        const s97 = (s96 * 31n + pe * 1000n + 500097n) % 1000000007n
        const s98 = (s97 * 31n + pe * 1000n + 500098n) % 1000000007n
        const s99 = (s98 * 31n + pe * 1000n + 500099n) % 1000000007n
        const s100 = (s99 * 31n + pe * 1000n + 500100n) % 1000000007n
        f.setCustomVariable(owner, 'zt_sum', s100, false)
        f.setCustomVariable(owner, 'zt_epoch', pe, false)
        f.printString('lane:pubB')
        f.printString(f.dataTypeConversion(pe, 'str'))

      })
    })
  })
