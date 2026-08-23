// @gsts:entry
// 灯阵玩法逻辑 关卡1（最小图 1073741890，2026-08-16）
// 架构（ADR-0004）：1 图 × N 灯柱挂载 + 信号广播 + 308 显隐 + 实体自定义变量
//  - 状态：lit/head/winCount 存灯柱实体自定义变量（winCount 必须 bigint 0n，int 变体）
//  - 灯头：whenEntityIsCreated 动态创建（createPrefab 灯头元件，y 1.34 灯罩中心）
//  - 明暗：activateDisableModelDisplay(灯头, lit)（U4b 已验证）
//  - 邻居：lamp_toggle(senderPos, hop) 距离判定（<=0.1 自身 / <=3.0 邻居）
//  - 胜利：win_check/win_ack 计数 winCount==9 → lamp-win + level_clear(1) + 旋转庆祝
//  - 关卡锁：创建时 activateDisableTab(self,1,false) 锁住；收到 level_unlock(1) → 解锁
import { defineSignal, g } from 'genshin-ts/runtime/core';
import { listLiteral, str } from 'genshin-ts/runtime/value';
const LampSig = {
    lamp_toggle: defineSignal('lamp_toggle', [['senderPos', 'vec3'], ['hop', 'int']]),
    win_check: defineSignal('win_check', [['senderPos', 'vec3']]),
    win_ack: defineSignal('win_ack', [['senderPos', 'vec3']]),
    level_clear: defineSignal('level_clear', [['level', 'int']]),
    level_unlock: defineSignal('level_unlock', [['level', 'int']])
} as const;
const LAMP_HEAD_PREFAB = 1077936130;
const WIN_TARGET = 9;
const LEVEL = 1;
const TAB_ID = 1;
const graph = g
    .server({ id: 1073741825 })
    .on('whenEntityIsCreated', (_e: any, f: any) => {
    const gsts = globalThis.gsts;
    const self = f.getSelfEntity();
    const loc = f.getEntityLocationAndRotation(self).location;
    const head = f.createPrefab(LAMP_HEAD_PREFAB, f.create3dVector(loc.x, 1.34, loc.z), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'));
    f.setCustomVariable(self, new str('lit'), false, false);
    f.setCustomVariable(self, new str('head'), head, false);
    f.setCustomVariable(self, new str('winCount'), 0n, false);
    f.activateDisableModelDisplay(head, false);
    // 关卡锁：初始禁用自身选项卡（顺序解锁前置；管理台「开始游戏」后广播 level_unlock 解锁）
    f.activateDisableTab(self, TAB_ID, false);
    f.printString('lamp-head-created');
    f.printString('lamp-init');
    f.printString('lamp-locked');
})
    // 关卡解锁：收到匹配本关的 level_unlock → 激活自身选项卡
    .onSignal(LampSig.level_unlock, (evt: any, f: any) => {
    const gsts = globalThis.gsts;
    const self = f.getSelfEntity();
    f.doubleBranch(f.equal(evt.params.level, LEVEL), () => {
        const gsts = globalThis.gsts;
        f.activateDisableTab(self, TAB_ID, true);
        f.printString('lamp-unlocked');
    }, () => {
        const gsts = globalThis.gsts;
        f.printString('lamp-unlock-other');
    });
})
    .on('whenTabIsSelected', (evt: any, f: any) => {
    const gsts = globalThis.gsts;
    const self = evt.eventSourceEntity;
    const lit = f.equal(f.getCustomVariable(self, new str('lit')).asType('bool'), true);
    const head = f.getCustomVariable(self, new str('head')).asType('entity');
    f.doubleBranch(lit, () => {
        const gsts = globalThis.gsts;
        f.setCustomVariable(self, new str('lit'), false, false);
        f.activateDisableModelDisplay(head, false);
    }, () => {
        const gsts = globalThis.gsts;
        f.setCustomVariable(self, new str('lit'), true, false);
        f.activateDisableModelDisplay(head, true);
    });
    const loc = f.getEntityLocationAndRotation(self).location;
    f.sendSignal(LampSig.lamp_toggle, loc, 1);
    f.printString('lamp-toggle');
    f.setCustomVariable(self, new str('winCount'), 0n, false);
    f.sendSignal(LampSig.win_check, loc);
    f.printString('win-check-sent');
})
    .onSignal(LampSig.lamp_toggle, (evt: any, f: any) => {
    const gsts = globalThis.gsts;
    const self = f.getSelfEntity();
    const loc = f.getEntityLocationAndRotation(self).location;
    const dist = f.distanceBetweenTwoCoordinatePoints(loc, evt.params.senderPos);
    f.doubleBranch(f.lessThanOrEqualTo(dist, 0.1), () => {
        const gsts = globalThis.gsts;
        f.printString('lamp-recv-self-skip');
    }, () => {
        const gsts = globalThis.gsts;
        f.doubleBranch(f.lessThanOrEqualTo(dist, 3.0), () => {
            const gsts = globalThis.gsts;
            const lit = f.equal(f.getCustomVariable(self, new str('lit')).asType('bool'), true);
            const head = f.getCustomVariable(self, new str('head')).asType('entity');
            f.doubleBranch(lit, () => {
                const gsts = globalThis.gsts;
                f.setCustomVariable(self, new str('lit'), false, false);
                f.activateDisableModelDisplay(head, false);
            }, () => {
                const gsts = globalThis.gsts;
                f.setCustomVariable(self, new str('lit'), true, false);
                f.activateDisableModelDisplay(head, true);
            });
            f.printString('lamp-neighbor-toggle');
        }, () => {
            const gsts = globalThis.gsts;
            f.printString('lamp-recv-far-skip');
        });
    });
})
    .onSignal(LampSig.win_check, (evt: any, f: any) => {
    const gsts = globalThis.gsts;
    const self = f.getSelfEntity();
    const lit = f.equal(f.getCustomVariable(self, new str('lit')).asType('bool'), true);
    f.doubleBranch(lit, () => {
        const gsts = globalThis.gsts;
        f.sendSignal(LampSig.win_ack, evt.params.senderPos);
        f.printString('win-ack-sent');
    }, () => {
        const gsts = globalThis.gsts;
        f.printString('win-no-ack');
    });
})
    .onSignal(LampSig.win_ack, (evt: any, f: any) => {
    const gsts = globalThis.gsts;
    const self = f.getSelfEntity();
    const loc = f.getEntityLocationAndRotation(self).location;
    const dist = f.distanceBetweenTwoCoordinatePoints(loc, evt.params.senderPos);
    f.doubleBranch(f.lessThanOrEqualTo(dist, 0.1), () => {
        const gsts = globalThis.gsts;
        const count = f.getCustomVariable(self, new str('winCount')).asType('int');
        const next = f.addition(count, 1);
        f.setCustomVariable(self, new str('winCount'), next, false);
        f.doubleBranch(f.equal(next, WIN_TARGET), () => {
            const gsts = globalThis.gsts;
            // 胜利：打印 + 通知管理台解锁下一关 + 旋转庆祝（灯头自旋）+ 光源
            f.printString('lamp-win');
            f.sendSignal(LampSig.level_clear, LEVEL);
            const head = f.getCustomVariable(self, new str('head')).asType('entity');
            f.addUniformBasicRotationBasedMotionDevice(head, 'celebrate', 3.0, 90.0, gsts.f.assemblyList([0, 1, 0]));
            f.toggleEntityLightSource(head, 0, true);
            f.printString('lamp-celebrate');
        }, () => {
            const gsts = globalThis.gsts;
            f.printString('win-counting');
        });
    }, () => {
        const gsts = globalThis.gsts;
        f.printString('win-ack-other');
    });
});
export default graph;
