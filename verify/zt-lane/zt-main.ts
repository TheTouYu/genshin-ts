import { g } from 'genshin-ts/runtime/core'

import { ZtSignal } from './signals.js'

// 计算通道 v2·服务端主图（替换原 _GSTS_zaowuListen 内容，挂载关系保留在关卡实体上）
//
// 时间线：t=3s 发布任务 1（boot）→ ACK 链式发布 2..5（相位 A 串行基准）
//        t=4s 起 4s 看门狗：相位 A 任务悬置 >4s 则原版本重发（at-least-once）
//        t=20s 起 ztPA/ztPB 两图并发盲发（相位 B，本图不参与）
// 回声：ok→写 zt_ack（只前进不回退，过期回声打 lane:stale；重复回声打 lane:dup）
g.server({ id: 1073741830, name: '_GSTS_ztMain' })
  .on('whenEntityIsCreated', (_evt, f) => {
    f.printString('lane:armed')
    f.startTimer(f.getSelfEntity(), 'boot', false, [3])
    f.startTimer(f.getSelfEntity(), 'wd', true, [4])
  })
  .on('whenTimerIsTriggered', (evt, f) => {
    const owner = f.getCorrespondingValueFromList(f.getListOfPlayerEntitiesOnTheField(), 0n)
    const e = f.getCustomVariable(owner, 'zt_epoch').asType('int')
    const a = f.getCustomVariable(owner, 'zt_ack').asType('int')
    f.doubleBranch(f.equal(evt.timerName, 'boot'), () => {
      const pe = 1n
      f.setCustomVariable(owner, 'zt1', pe * 1000n + 1n, false)
      f.setCustomVariable(owner, 'zt2', pe * 1000n + 2n, false)
      f.setCustomVariable(owner, 'zt3', pe * 1000n + 3n, false)
      f.setCustomVariable(owner, 'zt4', pe * 1000n + 4n, false)
      f.setCustomVariable(owner, 'zt5', pe * 1000n + 5n, false)
      f.setCustomVariable(owner, 'zt6', pe * 1000n + 6n, false)
      f.setCustomVariable(owner, 'zt7', pe * 1000n + 7n, false)
      f.setCustomVariable(owner, 'zt8', pe * 1000n + 8n, false)
      f.setCustomVariable(owner, 'zt9', pe * 1000n + 9n, false)
      f.setCustomVariable(owner, 'zt10', pe * 1000n + 10n, false)
      f.setCustomVariable(owner, 'zt11', pe * 1000n + 11n, false)
      f.setCustomVariable(owner, 'zt12', pe * 1000n + 12n, false)
      f.setCustomVariable(owner, 'zt13', pe * 1000n + 13n, false)
      f.setCustomVariable(owner, 'zt14', pe * 1000n + 14n, false)
      f.setCustomVariable(owner, 'zt15', pe * 1000n + 15n, false)
      f.setCustomVariable(owner, 'zt16', pe * 1000n + 16n, false)
      f.setCustomVariable(owner, 'zt17', pe * 1000n + 17n, false)
      f.setCustomVariable(owner, 'zt18', pe * 1000n + 18n, false)
      f.setCustomVariable(owner, 'zt19', pe * 1000n + 19n, false)
      f.setCustomVariable(owner, 'zt20', pe * 1000n + 20n, false)
      f.setCustomVariable(owner, 'zt21', pe * 1000n + 21n, false)
      f.setCustomVariable(owner, 'zt22', pe * 1000n + 22n, false)
      f.setCustomVariable(owner, 'zt23', pe * 1000n + 23n, false)
      f.setCustomVariable(owner, 'zt24', pe * 1000n + 24n, false)
      f.setCustomVariable(owner, 'zt25', pe * 1000n + 25n, false)
      f.setCustomVariable(owner, 'zt26', pe * 1000n + 26n, false)
      f.setCustomVariable(owner, 'zt27', pe * 1000n + 27n, false)
      f.setCustomVariable(owner, 'zt28', pe * 1000n + 28n, false)
      f.setCustomVariable(owner, 'zt29', pe * 1000n + 29n, false)
      f.setCustomVariable(owner, 'zt30', pe * 1000n + 30n, false)
      f.setCustomVariable(owner, 'zt31', pe * 1000n + 31n, false)
      f.setCustomVariable(owner, 'zt32', pe * 1000n + 32n, false)
      f.setCustomVariable(owner, 'zt33', pe * 1000n + 33n, false)
      f.setCustomVariable(owner, 'zt34', pe * 1000n + 34n, false)
      f.setCustomVariable(owner, 'zt35', pe * 1000n + 35n, false)
      f.setCustomVariable(owner, 'zt36', pe * 1000n + 36n, false)
      f.setCustomVariable(owner, 'zt37', pe * 1000n + 37n, false)
      f.setCustomVariable(owner, 'zt38', pe * 1000n + 38n, false)
      f.setCustomVariable(owner, 'zt39', pe * 1000n + 39n, false)
      f.setCustomVariable(owner, 'zt40', pe * 1000n + 40n, false)
      f.setCustomVariable(owner, 'zt41', pe * 1000n + 41n, false)
      f.setCustomVariable(owner, 'zt42', pe * 1000n + 42n, false)
      f.setCustomVariable(owner, 'zt43', pe * 1000n + 43n, false)
      f.setCustomVariable(owner, 'zt44', pe * 1000n + 44n, false)
      f.setCustomVariable(owner, 'zt45', pe * 1000n + 45n, false)
      f.setCustomVariable(owner, 'zt46', pe * 1000n + 46n, false)
      f.setCustomVariable(owner, 'zt47', pe * 1000n + 47n, false)
      f.setCustomVariable(owner, 'zt48', pe * 1000n + 48n, false)
      f.setCustomVariable(owner, 'zt49', pe * 1000n + 49n, false)
      f.setCustomVariable(owner, 'zt50', pe * 1000n + 50n, false)
      f.setCustomVariable(owner, 'zt51', pe * 1000n + 51n, false)
      f.setCustomVariable(owner, 'zt52', pe * 1000n + 52n, false)
      f.setCustomVariable(owner, 'zt53', pe * 1000n + 53n, false)
      f.setCustomVariable(owner, 'zt54', pe * 1000n + 54n, false)
      f.setCustomVariable(owner, 'zt55', pe * 1000n + 55n, false)
      f.setCustomVariable(owner, 'zt56', pe * 1000n + 56n, false)
      f.setCustomVariable(owner, 'zt57', pe * 1000n + 57n, false)
      f.setCustomVariable(owner, 'zt58', pe * 1000n + 58n, false)
      f.setCustomVariable(owner, 'zt59', pe * 1000n + 59n, false)
      f.setCustomVariable(owner, 'zt60', pe * 1000n + 60n, false)
      f.setCustomVariable(owner, 'zt61', pe * 1000n + 61n, false)
      f.setCustomVariable(owner, 'zt62', pe * 1000n + 62n, false)
      f.setCustomVariable(owner, 'zt63', pe * 1000n + 63n, false)
      f.setCustomVariable(owner, 'zt64', pe * 1000n + 64n, false)
      f.setCustomVariable(owner, 'zt65', pe * 1000n + 65n, false)
      f.setCustomVariable(owner, 'zt66', pe * 1000n + 66n, false)
      f.setCustomVariable(owner, 'zt67', pe * 1000n + 67n, false)
      f.setCustomVariable(owner, 'zt68', pe * 1000n + 68n, false)
      f.setCustomVariable(owner, 'zt69', pe * 1000n + 69n, false)
      f.setCustomVariable(owner, 'zt70', pe * 1000n + 70n, false)
      f.setCustomVariable(owner, 'zt71', pe * 1000n + 71n, false)
      f.setCustomVariable(owner, 'zt72', pe * 1000n + 72n, false)
      f.setCustomVariable(owner, 'zt73', pe * 1000n + 73n, false)
      f.setCustomVariable(owner, 'zt74', pe * 1000n + 74n, false)
      f.setCustomVariable(owner, 'zt75', pe * 1000n + 75n, false)
      f.setCustomVariable(owner, 'zt76', pe * 1000n + 76n, false)
      f.setCustomVariable(owner, 'zt77', pe * 1000n + 77n, false)
      f.setCustomVariable(owner, 'zt78', pe * 1000n + 78n, false)
      f.setCustomVariable(owner, 'zt79', pe * 1000n + 79n, false)
      f.setCustomVariable(owner, 'zt80', pe * 1000n + 80n, false)
      f.setCustomVariable(owner, 'zt81', pe * 1000n + 81n, false)
      f.setCustomVariable(owner, 'zt82', pe * 1000n + 82n, false)
      f.setCustomVariable(owner, 'zt83', pe * 1000n + 83n, false)
      f.setCustomVariable(owner, 'zt84', pe * 1000n + 84n, false)
      f.setCustomVariable(owner, 'zt85', pe * 1000n + 85n, false)
      f.setCustomVariable(owner, 'zt86', pe * 1000n + 86n, false)
      f.setCustomVariable(owner, 'zt87', pe * 1000n + 87n, false)
      f.setCustomVariable(owner, 'zt88', pe * 1000n + 88n, false)
      f.setCustomVariable(owner, 'zt89', pe * 1000n + 89n, false)
      f.setCustomVariable(owner, 'zt90', pe * 1000n + 90n, false)
      f.setCustomVariable(owner, 'zt91', pe * 1000n + 91n, false)
      f.setCustomVariable(owner, 'zt92', pe * 1000n + 92n, false)
      f.setCustomVariable(owner, 'zt93', pe * 1000n + 93n, false)
      f.setCustomVariable(owner, 'zt94', pe * 1000n + 94n, false)
      f.setCustomVariable(owner, 'zt95', pe * 1000n + 95n, false)
      f.setCustomVariable(owner, 'zt96', pe * 1000n + 96n, false)
      f.setCustomVariable(owner, 'zt97', pe * 1000n + 97n, false)
      f.setCustomVariable(owner, 'zt98', pe * 1000n + 98n, false)
      f.setCustomVariable(owner, 'zt99', pe * 1000n + 99n, false)
      f.setCustomVariable(owner, 'zt100', pe * 1000n + 100n, false)
      const s1 = (pe * 1000n + 1n) % 1000000007n
      const s2 = (s1 * 31n + pe * 1000n + 2n) % 1000000007n
      const s3 = (s2 * 31n + pe * 1000n + 3n) % 1000000007n
      const s4 = (s3 * 31n + pe * 1000n + 4n) % 1000000007n
      const s5 = (s4 * 31n + pe * 1000n + 5n) % 1000000007n
      const s6 = (s5 * 31n + pe * 1000n + 6n) % 1000000007n
      const s7 = (s6 * 31n + pe * 1000n + 7n) % 1000000007n
      const s8 = (s7 * 31n + pe * 1000n + 8n) % 1000000007n
      const s9 = (s8 * 31n + pe * 1000n + 9n) % 1000000007n
      const s10 = (s9 * 31n + pe * 1000n + 10n) % 1000000007n
      const s11 = (s10 * 31n + pe * 1000n + 11n) % 1000000007n
      const s12 = (s11 * 31n + pe * 1000n + 12n) % 1000000007n
      const s13 = (s12 * 31n + pe * 1000n + 13n) % 1000000007n
      const s14 = (s13 * 31n + pe * 1000n + 14n) % 1000000007n
      const s15 = (s14 * 31n + pe * 1000n + 15n) % 1000000007n
      const s16 = (s15 * 31n + pe * 1000n + 16n) % 1000000007n
      const s17 = (s16 * 31n + pe * 1000n + 17n) % 1000000007n
      const s18 = (s17 * 31n + pe * 1000n + 18n) % 1000000007n
      const s19 = (s18 * 31n + pe * 1000n + 19n) % 1000000007n
      const s20 = (s19 * 31n + pe * 1000n + 20n) % 1000000007n
      const s21 = (s20 * 31n + pe * 1000n + 21n) % 1000000007n
      const s22 = (s21 * 31n + pe * 1000n + 22n) % 1000000007n
      const s23 = (s22 * 31n + pe * 1000n + 23n) % 1000000007n
      const s24 = (s23 * 31n + pe * 1000n + 24n) % 1000000007n
      const s25 = (s24 * 31n + pe * 1000n + 25n) % 1000000007n
      const s26 = (s25 * 31n + pe * 1000n + 26n) % 1000000007n
      const s27 = (s26 * 31n + pe * 1000n + 27n) % 1000000007n
      const s28 = (s27 * 31n + pe * 1000n + 28n) % 1000000007n
      const s29 = (s28 * 31n + pe * 1000n + 29n) % 1000000007n
      const s30 = (s29 * 31n + pe * 1000n + 30n) % 1000000007n
      const s31 = (s30 * 31n + pe * 1000n + 31n) % 1000000007n
      const s32 = (s31 * 31n + pe * 1000n + 32n) % 1000000007n
      const s33 = (s32 * 31n + pe * 1000n + 33n) % 1000000007n
      const s34 = (s33 * 31n + pe * 1000n + 34n) % 1000000007n
      const s35 = (s34 * 31n + pe * 1000n + 35n) % 1000000007n
      const s36 = (s35 * 31n + pe * 1000n + 36n) % 1000000007n
      const s37 = (s36 * 31n + pe * 1000n + 37n) % 1000000007n
      const s38 = (s37 * 31n + pe * 1000n + 38n) % 1000000007n
      const s39 = (s38 * 31n + pe * 1000n + 39n) % 1000000007n
      const s40 = (s39 * 31n + pe * 1000n + 40n) % 1000000007n
      const s41 = (s40 * 31n + pe * 1000n + 41n) % 1000000007n
      const s42 = (s41 * 31n + pe * 1000n + 42n) % 1000000007n
      const s43 = (s42 * 31n + pe * 1000n + 43n) % 1000000007n
      const s44 = (s43 * 31n + pe * 1000n + 44n) % 1000000007n
      const s45 = (s44 * 31n + pe * 1000n + 45n) % 1000000007n
      const s46 = (s45 * 31n + pe * 1000n + 46n) % 1000000007n
      const s47 = (s46 * 31n + pe * 1000n + 47n) % 1000000007n
      const s48 = (s47 * 31n + pe * 1000n + 48n) % 1000000007n
      const s49 = (s48 * 31n + pe * 1000n + 49n) % 1000000007n
      const s50 = (s49 * 31n + pe * 1000n + 50n) % 1000000007n
      const s51 = (s50 * 31n + pe * 1000n + 51n) % 1000000007n
      const s52 = (s51 * 31n + pe * 1000n + 52n) % 1000000007n
      const s53 = (s52 * 31n + pe * 1000n + 53n) % 1000000007n
      const s54 = (s53 * 31n + pe * 1000n + 54n) % 1000000007n
      const s55 = (s54 * 31n + pe * 1000n + 55n) % 1000000007n
      const s56 = (s55 * 31n + pe * 1000n + 56n) % 1000000007n
      const s57 = (s56 * 31n + pe * 1000n + 57n) % 1000000007n
      const s58 = (s57 * 31n + pe * 1000n + 58n) % 1000000007n
      const s59 = (s58 * 31n + pe * 1000n + 59n) % 1000000007n
      const s60 = (s59 * 31n + pe * 1000n + 60n) % 1000000007n
      const s61 = (s60 * 31n + pe * 1000n + 61n) % 1000000007n
      const s62 = (s61 * 31n + pe * 1000n + 62n) % 1000000007n
      const s63 = (s62 * 31n + pe * 1000n + 63n) % 1000000007n
      const s64 = (s63 * 31n + pe * 1000n + 64n) % 1000000007n
      const s65 = (s64 * 31n + pe * 1000n + 65n) % 1000000007n
      const s66 = (s65 * 31n + pe * 1000n + 66n) % 1000000007n
      const s67 = (s66 * 31n + pe * 1000n + 67n) % 1000000007n
      const s68 = (s67 * 31n + pe * 1000n + 68n) % 1000000007n
      const s69 = (s68 * 31n + pe * 1000n + 69n) % 1000000007n
      const s70 = (s69 * 31n + pe * 1000n + 70n) % 1000000007n
      const s71 = (s70 * 31n + pe * 1000n + 71n) % 1000000007n
      const s72 = (s71 * 31n + pe * 1000n + 72n) % 1000000007n
      const s73 = (s72 * 31n + pe * 1000n + 73n) % 1000000007n
      const s74 = (s73 * 31n + pe * 1000n + 74n) % 1000000007n
      const s75 = (s74 * 31n + pe * 1000n + 75n) % 1000000007n
      const s76 = (s75 * 31n + pe * 1000n + 76n) % 1000000007n
      const s77 = (s76 * 31n + pe * 1000n + 77n) % 1000000007n
      const s78 = (s77 * 31n + pe * 1000n + 78n) % 1000000007n
      const s79 = (s78 * 31n + pe * 1000n + 79n) % 1000000007n
      const s80 = (s79 * 31n + pe * 1000n + 80n) % 1000000007n
      const s81 = (s80 * 31n + pe * 1000n + 81n) % 1000000007n
      const s82 = (s81 * 31n + pe * 1000n + 82n) % 1000000007n
      const s83 = (s82 * 31n + pe * 1000n + 83n) % 1000000007n
      const s84 = (s83 * 31n + pe * 1000n + 84n) % 1000000007n
      const s85 = (s84 * 31n + pe * 1000n + 85n) % 1000000007n
      const s86 = (s85 * 31n + pe * 1000n + 86n) % 1000000007n
      const s87 = (s86 * 31n + pe * 1000n + 87n) % 1000000007n
      const s88 = (s87 * 31n + pe * 1000n + 88n) % 1000000007n
      const s89 = (s88 * 31n + pe * 1000n + 89n) % 1000000007n
      const s90 = (s89 * 31n + pe * 1000n + 90n) % 1000000007n
      const s91 = (s90 * 31n + pe * 1000n + 91n) % 1000000007n
      const s92 = (s91 * 31n + pe * 1000n + 92n) % 1000000007n
      const s93 = (s92 * 31n + pe * 1000n + 93n) % 1000000007n
      const s94 = (s93 * 31n + pe * 1000n + 94n) % 1000000007n
      const s95 = (s94 * 31n + pe * 1000n + 95n) % 1000000007n
      const s96 = (s95 * 31n + pe * 1000n + 96n) % 1000000007n
      const s97 = (s96 * 31n + pe * 1000n + 97n) % 1000000007n
      const s98 = (s97 * 31n + pe * 1000n + 98n) % 1000000007n
      const s99 = (s98 * 31n + pe * 1000n + 99n) % 1000000007n
      const s100 = (s99 * 31n + pe * 1000n + 100n) % 1000000007n
      f.setCustomVariable(owner, 'zt_sum', s100, false)
      f.setCustomVariable(owner, 'zt_epoch', pe, false)
      f.printString('lane:pub')
      f.printString(f.dataTypeConversion(pe, 'str'))

    }, () => {
      f.doubleBranch(f.equal(evt.timerName, 'wd'), () => {
        f.doubleBranch(f.lessThan(e, 6n), () => {
          f.doubleBranch(f.equal(e, a), () => {
          }, () => {
            const pe = e
            f.setCustomVariable(owner, 'zt1', pe * 1000n + 1n, false)
            f.setCustomVariable(owner, 'zt2', pe * 1000n + 2n, false)
            f.setCustomVariable(owner, 'zt3', pe * 1000n + 3n, false)
            f.setCustomVariable(owner, 'zt4', pe * 1000n + 4n, false)
            f.setCustomVariable(owner, 'zt5', pe * 1000n + 5n, false)
            f.setCustomVariable(owner, 'zt6', pe * 1000n + 6n, false)
            f.setCustomVariable(owner, 'zt7', pe * 1000n + 7n, false)
            f.setCustomVariable(owner, 'zt8', pe * 1000n + 8n, false)
            f.setCustomVariable(owner, 'zt9', pe * 1000n + 9n, false)
            f.setCustomVariable(owner, 'zt10', pe * 1000n + 10n, false)
            f.setCustomVariable(owner, 'zt11', pe * 1000n + 11n, false)
            f.setCustomVariable(owner, 'zt12', pe * 1000n + 12n, false)
            f.setCustomVariable(owner, 'zt13', pe * 1000n + 13n, false)
            f.setCustomVariable(owner, 'zt14', pe * 1000n + 14n, false)
            f.setCustomVariable(owner, 'zt15', pe * 1000n + 15n, false)
            f.setCustomVariable(owner, 'zt16', pe * 1000n + 16n, false)
            f.setCustomVariable(owner, 'zt17', pe * 1000n + 17n, false)
            f.setCustomVariable(owner, 'zt18', pe * 1000n + 18n, false)
            f.setCustomVariable(owner, 'zt19', pe * 1000n + 19n, false)
            f.setCustomVariable(owner, 'zt20', pe * 1000n + 20n, false)
            f.setCustomVariable(owner, 'zt21', pe * 1000n + 21n, false)
            f.setCustomVariable(owner, 'zt22', pe * 1000n + 22n, false)
            f.setCustomVariable(owner, 'zt23', pe * 1000n + 23n, false)
            f.setCustomVariable(owner, 'zt24', pe * 1000n + 24n, false)
            f.setCustomVariable(owner, 'zt25', pe * 1000n + 25n, false)
            f.setCustomVariable(owner, 'zt26', pe * 1000n + 26n, false)
            f.setCustomVariable(owner, 'zt27', pe * 1000n + 27n, false)
            f.setCustomVariable(owner, 'zt28', pe * 1000n + 28n, false)
            f.setCustomVariable(owner, 'zt29', pe * 1000n + 29n, false)
            f.setCustomVariable(owner, 'zt30', pe * 1000n + 30n, false)
            f.setCustomVariable(owner, 'zt31', pe * 1000n + 31n, false)
            f.setCustomVariable(owner, 'zt32', pe * 1000n + 32n, false)
            f.setCustomVariable(owner, 'zt33', pe * 1000n + 33n, false)
            f.setCustomVariable(owner, 'zt34', pe * 1000n + 34n, false)
            f.setCustomVariable(owner, 'zt35', pe * 1000n + 35n, false)
            f.setCustomVariable(owner, 'zt36', pe * 1000n + 36n, false)
            f.setCustomVariable(owner, 'zt37', pe * 1000n + 37n, false)
            f.setCustomVariable(owner, 'zt38', pe * 1000n + 38n, false)
            f.setCustomVariable(owner, 'zt39', pe * 1000n + 39n, false)
            f.setCustomVariable(owner, 'zt40', pe * 1000n + 40n, false)
            f.setCustomVariable(owner, 'zt41', pe * 1000n + 41n, false)
            f.setCustomVariable(owner, 'zt42', pe * 1000n + 42n, false)
            f.setCustomVariable(owner, 'zt43', pe * 1000n + 43n, false)
            f.setCustomVariable(owner, 'zt44', pe * 1000n + 44n, false)
            f.setCustomVariable(owner, 'zt45', pe * 1000n + 45n, false)
            f.setCustomVariable(owner, 'zt46', pe * 1000n + 46n, false)
            f.setCustomVariable(owner, 'zt47', pe * 1000n + 47n, false)
            f.setCustomVariable(owner, 'zt48', pe * 1000n + 48n, false)
            f.setCustomVariable(owner, 'zt49', pe * 1000n + 49n, false)
            f.setCustomVariable(owner, 'zt50', pe * 1000n + 50n, false)
            f.setCustomVariable(owner, 'zt51', pe * 1000n + 51n, false)
            f.setCustomVariable(owner, 'zt52', pe * 1000n + 52n, false)
            f.setCustomVariable(owner, 'zt53', pe * 1000n + 53n, false)
            f.setCustomVariable(owner, 'zt54', pe * 1000n + 54n, false)
            f.setCustomVariable(owner, 'zt55', pe * 1000n + 55n, false)
            f.setCustomVariable(owner, 'zt56', pe * 1000n + 56n, false)
            f.setCustomVariable(owner, 'zt57', pe * 1000n + 57n, false)
            f.setCustomVariable(owner, 'zt58', pe * 1000n + 58n, false)
            f.setCustomVariable(owner, 'zt59', pe * 1000n + 59n, false)
            f.setCustomVariable(owner, 'zt60', pe * 1000n + 60n, false)
            f.setCustomVariable(owner, 'zt61', pe * 1000n + 61n, false)
            f.setCustomVariable(owner, 'zt62', pe * 1000n + 62n, false)
            f.setCustomVariable(owner, 'zt63', pe * 1000n + 63n, false)
            f.setCustomVariable(owner, 'zt64', pe * 1000n + 64n, false)
            f.setCustomVariable(owner, 'zt65', pe * 1000n + 65n, false)
            f.setCustomVariable(owner, 'zt66', pe * 1000n + 66n, false)
            f.setCustomVariable(owner, 'zt67', pe * 1000n + 67n, false)
            f.setCustomVariable(owner, 'zt68', pe * 1000n + 68n, false)
            f.setCustomVariable(owner, 'zt69', pe * 1000n + 69n, false)
            f.setCustomVariable(owner, 'zt70', pe * 1000n + 70n, false)
            f.setCustomVariable(owner, 'zt71', pe * 1000n + 71n, false)
            f.setCustomVariable(owner, 'zt72', pe * 1000n + 72n, false)
            f.setCustomVariable(owner, 'zt73', pe * 1000n + 73n, false)
            f.setCustomVariable(owner, 'zt74', pe * 1000n + 74n, false)
            f.setCustomVariable(owner, 'zt75', pe * 1000n + 75n, false)
            f.setCustomVariable(owner, 'zt76', pe * 1000n + 76n, false)
            f.setCustomVariable(owner, 'zt77', pe * 1000n + 77n, false)
            f.setCustomVariable(owner, 'zt78', pe * 1000n + 78n, false)
            f.setCustomVariable(owner, 'zt79', pe * 1000n + 79n, false)
            f.setCustomVariable(owner, 'zt80', pe * 1000n + 80n, false)
            f.setCustomVariable(owner, 'zt81', pe * 1000n + 81n, false)
            f.setCustomVariable(owner, 'zt82', pe * 1000n + 82n, false)
            f.setCustomVariable(owner, 'zt83', pe * 1000n + 83n, false)
            f.setCustomVariable(owner, 'zt84', pe * 1000n + 84n, false)
            f.setCustomVariable(owner, 'zt85', pe * 1000n + 85n, false)
            f.setCustomVariable(owner, 'zt86', pe * 1000n + 86n, false)
            f.setCustomVariable(owner, 'zt87', pe * 1000n + 87n, false)
            f.setCustomVariable(owner, 'zt88', pe * 1000n + 88n, false)
            f.setCustomVariable(owner, 'zt89', pe * 1000n + 89n, false)
            f.setCustomVariable(owner, 'zt90', pe * 1000n + 90n, false)
            f.setCustomVariable(owner, 'zt91', pe * 1000n + 91n, false)
            f.setCustomVariable(owner, 'zt92', pe * 1000n + 92n, false)
            f.setCustomVariable(owner, 'zt93', pe * 1000n + 93n, false)
            f.setCustomVariable(owner, 'zt94', pe * 1000n + 94n, false)
            f.setCustomVariable(owner, 'zt95', pe * 1000n + 95n, false)
            f.setCustomVariable(owner, 'zt96', pe * 1000n + 96n, false)
            f.setCustomVariable(owner, 'zt97', pe * 1000n + 97n, false)
            f.setCustomVariable(owner, 'zt98', pe * 1000n + 98n, false)
            f.setCustomVariable(owner, 'zt99', pe * 1000n + 99n, false)
            f.setCustomVariable(owner, 'zt100', pe * 1000n + 100n, false)
            const s1 = (pe * 1000n + 1n) % 1000000007n
            const s2 = (s1 * 31n + pe * 1000n + 2n) % 1000000007n
            const s3 = (s2 * 31n + pe * 1000n + 3n) % 1000000007n
            const s4 = (s3 * 31n + pe * 1000n + 4n) % 1000000007n
            const s5 = (s4 * 31n + pe * 1000n + 5n) % 1000000007n
            const s6 = (s5 * 31n + pe * 1000n + 6n) % 1000000007n
            const s7 = (s6 * 31n + pe * 1000n + 7n) % 1000000007n
            const s8 = (s7 * 31n + pe * 1000n + 8n) % 1000000007n
            const s9 = (s8 * 31n + pe * 1000n + 9n) % 1000000007n
            const s10 = (s9 * 31n + pe * 1000n + 10n) % 1000000007n
            const s11 = (s10 * 31n + pe * 1000n + 11n) % 1000000007n
            const s12 = (s11 * 31n + pe * 1000n + 12n) % 1000000007n
            const s13 = (s12 * 31n + pe * 1000n + 13n) % 1000000007n
            const s14 = (s13 * 31n + pe * 1000n + 14n) % 1000000007n
            const s15 = (s14 * 31n + pe * 1000n + 15n) % 1000000007n
            const s16 = (s15 * 31n + pe * 1000n + 16n) % 1000000007n
            const s17 = (s16 * 31n + pe * 1000n + 17n) % 1000000007n
            const s18 = (s17 * 31n + pe * 1000n + 18n) % 1000000007n
            const s19 = (s18 * 31n + pe * 1000n + 19n) % 1000000007n
            const s20 = (s19 * 31n + pe * 1000n + 20n) % 1000000007n
            const s21 = (s20 * 31n + pe * 1000n + 21n) % 1000000007n
            const s22 = (s21 * 31n + pe * 1000n + 22n) % 1000000007n
            const s23 = (s22 * 31n + pe * 1000n + 23n) % 1000000007n
            const s24 = (s23 * 31n + pe * 1000n + 24n) % 1000000007n
            const s25 = (s24 * 31n + pe * 1000n + 25n) % 1000000007n
            const s26 = (s25 * 31n + pe * 1000n + 26n) % 1000000007n
            const s27 = (s26 * 31n + pe * 1000n + 27n) % 1000000007n
            const s28 = (s27 * 31n + pe * 1000n + 28n) % 1000000007n
            const s29 = (s28 * 31n + pe * 1000n + 29n) % 1000000007n
            const s30 = (s29 * 31n + pe * 1000n + 30n) % 1000000007n
            const s31 = (s30 * 31n + pe * 1000n + 31n) % 1000000007n
            const s32 = (s31 * 31n + pe * 1000n + 32n) % 1000000007n
            const s33 = (s32 * 31n + pe * 1000n + 33n) % 1000000007n
            const s34 = (s33 * 31n + pe * 1000n + 34n) % 1000000007n
            const s35 = (s34 * 31n + pe * 1000n + 35n) % 1000000007n
            const s36 = (s35 * 31n + pe * 1000n + 36n) % 1000000007n
            const s37 = (s36 * 31n + pe * 1000n + 37n) % 1000000007n
            const s38 = (s37 * 31n + pe * 1000n + 38n) % 1000000007n
            const s39 = (s38 * 31n + pe * 1000n + 39n) % 1000000007n
            const s40 = (s39 * 31n + pe * 1000n + 40n) % 1000000007n
            const s41 = (s40 * 31n + pe * 1000n + 41n) % 1000000007n
            const s42 = (s41 * 31n + pe * 1000n + 42n) % 1000000007n
            const s43 = (s42 * 31n + pe * 1000n + 43n) % 1000000007n
            const s44 = (s43 * 31n + pe * 1000n + 44n) % 1000000007n
            const s45 = (s44 * 31n + pe * 1000n + 45n) % 1000000007n
            const s46 = (s45 * 31n + pe * 1000n + 46n) % 1000000007n
            const s47 = (s46 * 31n + pe * 1000n + 47n) % 1000000007n
            const s48 = (s47 * 31n + pe * 1000n + 48n) % 1000000007n
            const s49 = (s48 * 31n + pe * 1000n + 49n) % 1000000007n
            const s50 = (s49 * 31n + pe * 1000n + 50n) % 1000000007n
            const s51 = (s50 * 31n + pe * 1000n + 51n) % 1000000007n
            const s52 = (s51 * 31n + pe * 1000n + 52n) % 1000000007n
            const s53 = (s52 * 31n + pe * 1000n + 53n) % 1000000007n
            const s54 = (s53 * 31n + pe * 1000n + 54n) % 1000000007n
            const s55 = (s54 * 31n + pe * 1000n + 55n) % 1000000007n
            const s56 = (s55 * 31n + pe * 1000n + 56n) % 1000000007n
            const s57 = (s56 * 31n + pe * 1000n + 57n) % 1000000007n
            const s58 = (s57 * 31n + pe * 1000n + 58n) % 1000000007n
            const s59 = (s58 * 31n + pe * 1000n + 59n) % 1000000007n
            const s60 = (s59 * 31n + pe * 1000n + 60n) % 1000000007n
            const s61 = (s60 * 31n + pe * 1000n + 61n) % 1000000007n
            const s62 = (s61 * 31n + pe * 1000n + 62n) % 1000000007n
            const s63 = (s62 * 31n + pe * 1000n + 63n) % 1000000007n
            const s64 = (s63 * 31n + pe * 1000n + 64n) % 1000000007n
            const s65 = (s64 * 31n + pe * 1000n + 65n) % 1000000007n
            const s66 = (s65 * 31n + pe * 1000n + 66n) % 1000000007n
            const s67 = (s66 * 31n + pe * 1000n + 67n) % 1000000007n
            const s68 = (s67 * 31n + pe * 1000n + 68n) % 1000000007n
            const s69 = (s68 * 31n + pe * 1000n + 69n) % 1000000007n
            const s70 = (s69 * 31n + pe * 1000n + 70n) % 1000000007n
            const s71 = (s70 * 31n + pe * 1000n + 71n) % 1000000007n
            const s72 = (s71 * 31n + pe * 1000n + 72n) % 1000000007n
            const s73 = (s72 * 31n + pe * 1000n + 73n) % 1000000007n
            const s74 = (s73 * 31n + pe * 1000n + 74n) % 1000000007n
            const s75 = (s74 * 31n + pe * 1000n + 75n) % 1000000007n
            const s76 = (s75 * 31n + pe * 1000n + 76n) % 1000000007n
            const s77 = (s76 * 31n + pe * 1000n + 77n) % 1000000007n
            const s78 = (s77 * 31n + pe * 1000n + 78n) % 1000000007n
            const s79 = (s78 * 31n + pe * 1000n + 79n) % 1000000007n
            const s80 = (s79 * 31n + pe * 1000n + 80n) % 1000000007n
            const s81 = (s80 * 31n + pe * 1000n + 81n) % 1000000007n
            const s82 = (s81 * 31n + pe * 1000n + 82n) % 1000000007n
            const s83 = (s82 * 31n + pe * 1000n + 83n) % 1000000007n
            const s84 = (s83 * 31n + pe * 1000n + 84n) % 1000000007n
            const s85 = (s84 * 31n + pe * 1000n + 85n) % 1000000007n
            const s86 = (s85 * 31n + pe * 1000n + 86n) % 1000000007n
            const s87 = (s86 * 31n + pe * 1000n + 87n) % 1000000007n
            const s88 = (s87 * 31n + pe * 1000n + 88n) % 1000000007n
            const s89 = (s88 * 31n + pe * 1000n + 89n) % 1000000007n
            const s90 = (s89 * 31n + pe * 1000n + 90n) % 1000000007n
            const s91 = (s90 * 31n + pe * 1000n + 91n) % 1000000007n
            const s92 = (s91 * 31n + pe * 1000n + 92n) % 1000000007n
            const s93 = (s92 * 31n + pe * 1000n + 93n) % 1000000007n
            const s94 = (s93 * 31n + pe * 1000n + 94n) % 1000000007n
            const s95 = (s94 * 31n + pe * 1000n + 95n) % 1000000007n
            const s96 = (s95 * 31n + pe * 1000n + 96n) % 1000000007n
            const s97 = (s96 * 31n + pe * 1000n + 97n) % 1000000007n
            const s98 = (s97 * 31n + pe * 1000n + 98n) % 1000000007n
            const s99 = (s98 * 31n + pe * 1000n + 99n) % 1000000007n
            const s100 = (s99 * 31n + pe * 1000n + 100n) % 1000000007n
            f.setCustomVariable(owner, 'zt_sum', s100, false)
            f.setCustomVariable(owner, 'zt_epoch', pe, false)
            f.printString('lane:repub')
            f.printString(f.dataTypeConversion(pe, 'str'))

          })
        }, () => {
        })
      }, () => {
      })
    })
  })
  .onSignal(ZtSignal.zt_echo, (evt, f) => {
    const owner = f.getCorrespondingValueFromList(f.getListOfPlayerEntitiesOnTheField(), 0n)
    const cur = f.getCustomVariable(owner, 'zt_ack').asType('int')
    const ep = f.getCustomVariable(owner, 'zt_epoch').asType('int')
    f.doubleBranch(f.equal(evt.params.tag, 'ok'), () => {
      f.doubleBranch(f.lessThan(evt.params.e, cur), () => {
        f.printString('lane:stale')
      }, () => {
        f.setCustomVariable(owner, 'zt_ack', evt.params.e, false)
        f.printString('lane:ack')
        f.printString(f.dataTypeConversion(evt.params.e, 'str'))
        f.doubleBranch(f.lessThan(evt.params.e, 5n), () => {
          f.doubleBranch(f.equal(evt.params.e, ep), () => {
            const pe = evt.params.e + 1n
            f.setCustomVariable(owner, 'zt1', pe * 1000n + 1n, false)
            f.setCustomVariable(owner, 'zt2', pe * 1000n + 2n, false)
            f.setCustomVariable(owner, 'zt3', pe * 1000n + 3n, false)
            f.setCustomVariable(owner, 'zt4', pe * 1000n + 4n, false)
            f.setCustomVariable(owner, 'zt5', pe * 1000n + 5n, false)
            f.setCustomVariable(owner, 'zt6', pe * 1000n + 6n, false)
            f.setCustomVariable(owner, 'zt7', pe * 1000n + 7n, false)
            f.setCustomVariable(owner, 'zt8', pe * 1000n + 8n, false)
            f.setCustomVariable(owner, 'zt9', pe * 1000n + 9n, false)
            f.setCustomVariable(owner, 'zt10', pe * 1000n + 10n, false)
            f.setCustomVariable(owner, 'zt11', pe * 1000n + 11n, false)
            f.setCustomVariable(owner, 'zt12', pe * 1000n + 12n, false)
            f.setCustomVariable(owner, 'zt13', pe * 1000n + 13n, false)
            f.setCustomVariable(owner, 'zt14', pe * 1000n + 14n, false)
            f.setCustomVariable(owner, 'zt15', pe * 1000n + 15n, false)
            f.setCustomVariable(owner, 'zt16', pe * 1000n + 16n, false)
            f.setCustomVariable(owner, 'zt17', pe * 1000n + 17n, false)
            f.setCustomVariable(owner, 'zt18', pe * 1000n + 18n, false)
            f.setCustomVariable(owner, 'zt19', pe * 1000n + 19n, false)
            f.setCustomVariable(owner, 'zt20', pe * 1000n + 20n, false)
            f.setCustomVariable(owner, 'zt21', pe * 1000n + 21n, false)
            f.setCustomVariable(owner, 'zt22', pe * 1000n + 22n, false)
            f.setCustomVariable(owner, 'zt23', pe * 1000n + 23n, false)
            f.setCustomVariable(owner, 'zt24', pe * 1000n + 24n, false)
            f.setCustomVariable(owner, 'zt25', pe * 1000n + 25n, false)
            f.setCustomVariable(owner, 'zt26', pe * 1000n + 26n, false)
            f.setCustomVariable(owner, 'zt27', pe * 1000n + 27n, false)
            f.setCustomVariable(owner, 'zt28', pe * 1000n + 28n, false)
            f.setCustomVariable(owner, 'zt29', pe * 1000n + 29n, false)
            f.setCustomVariable(owner, 'zt30', pe * 1000n + 30n, false)
            f.setCustomVariable(owner, 'zt31', pe * 1000n + 31n, false)
            f.setCustomVariable(owner, 'zt32', pe * 1000n + 32n, false)
            f.setCustomVariable(owner, 'zt33', pe * 1000n + 33n, false)
            f.setCustomVariable(owner, 'zt34', pe * 1000n + 34n, false)
            f.setCustomVariable(owner, 'zt35', pe * 1000n + 35n, false)
            f.setCustomVariable(owner, 'zt36', pe * 1000n + 36n, false)
            f.setCustomVariable(owner, 'zt37', pe * 1000n + 37n, false)
            f.setCustomVariable(owner, 'zt38', pe * 1000n + 38n, false)
            f.setCustomVariable(owner, 'zt39', pe * 1000n + 39n, false)
            f.setCustomVariable(owner, 'zt40', pe * 1000n + 40n, false)
            f.setCustomVariable(owner, 'zt41', pe * 1000n + 41n, false)
            f.setCustomVariable(owner, 'zt42', pe * 1000n + 42n, false)
            f.setCustomVariable(owner, 'zt43', pe * 1000n + 43n, false)
            f.setCustomVariable(owner, 'zt44', pe * 1000n + 44n, false)
            f.setCustomVariable(owner, 'zt45', pe * 1000n + 45n, false)
            f.setCustomVariable(owner, 'zt46', pe * 1000n + 46n, false)
            f.setCustomVariable(owner, 'zt47', pe * 1000n + 47n, false)
            f.setCustomVariable(owner, 'zt48', pe * 1000n + 48n, false)
            f.setCustomVariable(owner, 'zt49', pe * 1000n + 49n, false)
            f.setCustomVariable(owner, 'zt50', pe * 1000n + 50n, false)
            f.setCustomVariable(owner, 'zt51', pe * 1000n + 51n, false)
            f.setCustomVariable(owner, 'zt52', pe * 1000n + 52n, false)
            f.setCustomVariable(owner, 'zt53', pe * 1000n + 53n, false)
            f.setCustomVariable(owner, 'zt54', pe * 1000n + 54n, false)
            f.setCustomVariable(owner, 'zt55', pe * 1000n + 55n, false)
            f.setCustomVariable(owner, 'zt56', pe * 1000n + 56n, false)
            f.setCustomVariable(owner, 'zt57', pe * 1000n + 57n, false)
            f.setCustomVariable(owner, 'zt58', pe * 1000n + 58n, false)
            f.setCustomVariable(owner, 'zt59', pe * 1000n + 59n, false)
            f.setCustomVariable(owner, 'zt60', pe * 1000n + 60n, false)
            f.setCustomVariable(owner, 'zt61', pe * 1000n + 61n, false)
            f.setCustomVariable(owner, 'zt62', pe * 1000n + 62n, false)
            f.setCustomVariable(owner, 'zt63', pe * 1000n + 63n, false)
            f.setCustomVariable(owner, 'zt64', pe * 1000n + 64n, false)
            f.setCustomVariable(owner, 'zt65', pe * 1000n + 65n, false)
            f.setCustomVariable(owner, 'zt66', pe * 1000n + 66n, false)
            f.setCustomVariable(owner, 'zt67', pe * 1000n + 67n, false)
            f.setCustomVariable(owner, 'zt68', pe * 1000n + 68n, false)
            f.setCustomVariable(owner, 'zt69', pe * 1000n + 69n, false)
            f.setCustomVariable(owner, 'zt70', pe * 1000n + 70n, false)
            f.setCustomVariable(owner, 'zt71', pe * 1000n + 71n, false)
            f.setCustomVariable(owner, 'zt72', pe * 1000n + 72n, false)
            f.setCustomVariable(owner, 'zt73', pe * 1000n + 73n, false)
            f.setCustomVariable(owner, 'zt74', pe * 1000n + 74n, false)
            f.setCustomVariable(owner, 'zt75', pe * 1000n + 75n, false)
            f.setCustomVariable(owner, 'zt76', pe * 1000n + 76n, false)
            f.setCustomVariable(owner, 'zt77', pe * 1000n + 77n, false)
            f.setCustomVariable(owner, 'zt78', pe * 1000n + 78n, false)
            f.setCustomVariable(owner, 'zt79', pe * 1000n + 79n, false)
            f.setCustomVariable(owner, 'zt80', pe * 1000n + 80n, false)
            f.setCustomVariable(owner, 'zt81', pe * 1000n + 81n, false)
            f.setCustomVariable(owner, 'zt82', pe * 1000n + 82n, false)
            f.setCustomVariable(owner, 'zt83', pe * 1000n + 83n, false)
            f.setCustomVariable(owner, 'zt84', pe * 1000n + 84n, false)
            f.setCustomVariable(owner, 'zt85', pe * 1000n + 85n, false)
            f.setCustomVariable(owner, 'zt86', pe * 1000n + 86n, false)
            f.setCustomVariable(owner, 'zt87', pe * 1000n + 87n, false)
            f.setCustomVariable(owner, 'zt88', pe * 1000n + 88n, false)
            f.setCustomVariable(owner, 'zt89', pe * 1000n + 89n, false)
            f.setCustomVariable(owner, 'zt90', pe * 1000n + 90n, false)
            f.setCustomVariable(owner, 'zt91', pe * 1000n + 91n, false)
            f.setCustomVariable(owner, 'zt92', pe * 1000n + 92n, false)
            f.setCustomVariable(owner, 'zt93', pe * 1000n + 93n, false)
            f.setCustomVariable(owner, 'zt94', pe * 1000n + 94n, false)
            f.setCustomVariable(owner, 'zt95', pe * 1000n + 95n, false)
            f.setCustomVariable(owner, 'zt96', pe * 1000n + 96n, false)
            f.setCustomVariable(owner, 'zt97', pe * 1000n + 97n, false)
            f.setCustomVariable(owner, 'zt98', pe * 1000n + 98n, false)
            f.setCustomVariable(owner, 'zt99', pe * 1000n + 99n, false)
            f.setCustomVariable(owner, 'zt100', pe * 1000n + 100n, false)
            const s1 = (pe * 1000n + 1n) % 1000000007n
            const s2 = (s1 * 31n + pe * 1000n + 2n) % 1000000007n
            const s3 = (s2 * 31n + pe * 1000n + 3n) % 1000000007n
            const s4 = (s3 * 31n + pe * 1000n + 4n) % 1000000007n
            const s5 = (s4 * 31n + pe * 1000n + 5n) % 1000000007n
            const s6 = (s5 * 31n + pe * 1000n + 6n) % 1000000007n
            const s7 = (s6 * 31n + pe * 1000n + 7n) % 1000000007n
            const s8 = (s7 * 31n + pe * 1000n + 8n) % 1000000007n
            const s9 = (s8 * 31n + pe * 1000n + 9n) % 1000000007n
            const s10 = (s9 * 31n + pe * 1000n + 10n) % 1000000007n
            const s11 = (s10 * 31n + pe * 1000n + 11n) % 1000000007n
            const s12 = (s11 * 31n + pe * 1000n + 12n) % 1000000007n
            const s13 = (s12 * 31n + pe * 1000n + 13n) % 1000000007n
            const s14 = (s13 * 31n + pe * 1000n + 14n) % 1000000007n
            const s15 = (s14 * 31n + pe * 1000n + 15n) % 1000000007n
            const s16 = (s15 * 31n + pe * 1000n + 16n) % 1000000007n
            const s17 = (s16 * 31n + pe * 1000n + 17n) % 1000000007n
            const s18 = (s17 * 31n + pe * 1000n + 18n) % 1000000007n
            const s19 = (s18 * 31n + pe * 1000n + 19n) % 1000000007n
            const s20 = (s19 * 31n + pe * 1000n + 20n) % 1000000007n
            const s21 = (s20 * 31n + pe * 1000n + 21n) % 1000000007n
            const s22 = (s21 * 31n + pe * 1000n + 22n) % 1000000007n
            const s23 = (s22 * 31n + pe * 1000n + 23n) % 1000000007n
            const s24 = (s23 * 31n + pe * 1000n + 24n) % 1000000007n
            const s25 = (s24 * 31n + pe * 1000n + 25n) % 1000000007n
            const s26 = (s25 * 31n + pe * 1000n + 26n) % 1000000007n
            const s27 = (s26 * 31n + pe * 1000n + 27n) % 1000000007n
            const s28 = (s27 * 31n + pe * 1000n + 28n) % 1000000007n
            const s29 = (s28 * 31n + pe * 1000n + 29n) % 1000000007n
            const s30 = (s29 * 31n + pe * 1000n + 30n) % 1000000007n
            const s31 = (s30 * 31n + pe * 1000n + 31n) % 1000000007n
            const s32 = (s31 * 31n + pe * 1000n + 32n) % 1000000007n
            const s33 = (s32 * 31n + pe * 1000n + 33n) % 1000000007n
            const s34 = (s33 * 31n + pe * 1000n + 34n) % 1000000007n
            const s35 = (s34 * 31n + pe * 1000n + 35n) % 1000000007n
            const s36 = (s35 * 31n + pe * 1000n + 36n) % 1000000007n
            const s37 = (s36 * 31n + pe * 1000n + 37n) % 1000000007n
            const s38 = (s37 * 31n + pe * 1000n + 38n) % 1000000007n
            const s39 = (s38 * 31n + pe * 1000n + 39n) % 1000000007n
            const s40 = (s39 * 31n + pe * 1000n + 40n) % 1000000007n
            const s41 = (s40 * 31n + pe * 1000n + 41n) % 1000000007n
            const s42 = (s41 * 31n + pe * 1000n + 42n) % 1000000007n
            const s43 = (s42 * 31n + pe * 1000n + 43n) % 1000000007n
            const s44 = (s43 * 31n + pe * 1000n + 44n) % 1000000007n
            const s45 = (s44 * 31n + pe * 1000n + 45n) % 1000000007n
            const s46 = (s45 * 31n + pe * 1000n + 46n) % 1000000007n
            const s47 = (s46 * 31n + pe * 1000n + 47n) % 1000000007n
            const s48 = (s47 * 31n + pe * 1000n + 48n) % 1000000007n
            const s49 = (s48 * 31n + pe * 1000n + 49n) % 1000000007n
            const s50 = (s49 * 31n + pe * 1000n + 50n) % 1000000007n
            const s51 = (s50 * 31n + pe * 1000n + 51n) % 1000000007n
            const s52 = (s51 * 31n + pe * 1000n + 52n) % 1000000007n
            const s53 = (s52 * 31n + pe * 1000n + 53n) % 1000000007n
            const s54 = (s53 * 31n + pe * 1000n + 54n) % 1000000007n
            const s55 = (s54 * 31n + pe * 1000n + 55n) % 1000000007n
            const s56 = (s55 * 31n + pe * 1000n + 56n) % 1000000007n
            const s57 = (s56 * 31n + pe * 1000n + 57n) % 1000000007n
            const s58 = (s57 * 31n + pe * 1000n + 58n) % 1000000007n
            const s59 = (s58 * 31n + pe * 1000n + 59n) % 1000000007n
            const s60 = (s59 * 31n + pe * 1000n + 60n) % 1000000007n
            const s61 = (s60 * 31n + pe * 1000n + 61n) % 1000000007n
            const s62 = (s61 * 31n + pe * 1000n + 62n) % 1000000007n
            const s63 = (s62 * 31n + pe * 1000n + 63n) % 1000000007n
            const s64 = (s63 * 31n + pe * 1000n + 64n) % 1000000007n
            const s65 = (s64 * 31n + pe * 1000n + 65n) % 1000000007n
            const s66 = (s65 * 31n + pe * 1000n + 66n) % 1000000007n
            const s67 = (s66 * 31n + pe * 1000n + 67n) % 1000000007n
            const s68 = (s67 * 31n + pe * 1000n + 68n) % 1000000007n
            const s69 = (s68 * 31n + pe * 1000n + 69n) % 1000000007n
            const s70 = (s69 * 31n + pe * 1000n + 70n) % 1000000007n
            const s71 = (s70 * 31n + pe * 1000n + 71n) % 1000000007n
            const s72 = (s71 * 31n + pe * 1000n + 72n) % 1000000007n
            const s73 = (s72 * 31n + pe * 1000n + 73n) % 1000000007n
            const s74 = (s73 * 31n + pe * 1000n + 74n) % 1000000007n
            const s75 = (s74 * 31n + pe * 1000n + 75n) % 1000000007n
            const s76 = (s75 * 31n + pe * 1000n + 76n) % 1000000007n
            const s77 = (s76 * 31n + pe * 1000n + 77n) % 1000000007n
            const s78 = (s77 * 31n + pe * 1000n + 78n) % 1000000007n
            const s79 = (s78 * 31n + pe * 1000n + 79n) % 1000000007n
            const s80 = (s79 * 31n + pe * 1000n + 80n) % 1000000007n
            const s81 = (s80 * 31n + pe * 1000n + 81n) % 1000000007n
            const s82 = (s81 * 31n + pe * 1000n + 82n) % 1000000007n
            const s83 = (s82 * 31n + pe * 1000n + 83n) % 1000000007n
            const s84 = (s83 * 31n + pe * 1000n + 84n) % 1000000007n
            const s85 = (s84 * 31n + pe * 1000n + 85n) % 1000000007n
            const s86 = (s85 * 31n + pe * 1000n + 86n) % 1000000007n
            const s87 = (s86 * 31n + pe * 1000n + 87n) % 1000000007n
            const s88 = (s87 * 31n + pe * 1000n + 88n) % 1000000007n
            const s89 = (s88 * 31n + pe * 1000n + 89n) % 1000000007n
            const s90 = (s89 * 31n + pe * 1000n + 90n) % 1000000007n
            const s91 = (s90 * 31n + pe * 1000n + 91n) % 1000000007n
            const s92 = (s91 * 31n + pe * 1000n + 92n) % 1000000007n
            const s93 = (s92 * 31n + pe * 1000n + 93n) % 1000000007n
            const s94 = (s93 * 31n + pe * 1000n + 94n) % 1000000007n
            const s95 = (s94 * 31n + pe * 1000n + 95n) % 1000000007n
            const s96 = (s95 * 31n + pe * 1000n + 96n) % 1000000007n
            const s97 = (s96 * 31n + pe * 1000n + 97n) % 1000000007n
            const s98 = (s97 * 31n + pe * 1000n + 98n) % 1000000007n
            const s99 = (s98 * 31n + pe * 1000n + 99n) % 1000000007n
            const s100 = (s99 * 31n + pe * 1000n + 100n) % 1000000007n
            f.setCustomVariable(owner, 'zt_sum', s100, false)
            f.setCustomVariable(owner, 'zt_epoch', pe, false)
            f.printString('lane:pub')
            f.printString(f.dataTypeConversion(pe, 'str'))

          }, () => {
            f.printString('lane:dup')
          })
        }, () => {
          f.printString('lane:A-done')
        })
      })
    }, () => {
      f.printString('lane:tear')
      f.printString(f.dataTypeConversion(evt.params.e, 'str'))
    })
  })
