// @gsts:entry
// 灯阵玩法逻辑（最小图 1073741890 完整版，2026-08-16）
// 架构（ADR-0004）：1 图 × 9 灯柱挂载 + 信号广播 + 308 显隐 + 实体自定义变量
//  - 状态：lit/head 存灯柱实体自定义变量（type 1 在位；规避图变量共享风险）
//  - 灯头：whenEntityIsCreated 动态创建（createPrefab 灯头元件，y 固定 1.34 灯罩中心），引用存实体变量
//  - 明暗：activateDisableModelDisplay(灯头, lit)（U4b 已验证 308 生效）
//  - 邻居：信号广播 lamp_toggle(senderPos, hop) → 距离判定（<=0.1 自身 / <=3.0 邻居，
//    网格间距 2.5：邻居 2.5、对角 3.54）
//  - 连锁：只传一层（接收方翻转后不再广播）
//  - 胜利：点击者广播 win_check(senderPos) → 每灯 lit=true 回 win_ack(senderPos) →
//    点击者计数 ack（winCount 实体变量）== 9 → 打印 lamp-win（胜利判定，2026-08-16 新增）
import { defineSignal, g } from 'genshin-ts/runtime/core';
import { listLiteral, str } from 'genshin-ts/runtime/value';
const LampSig = {
    lamp_toggle: defineSignal('lamp_toggle', [['senderPos', 'vec3'], ['hop', 'int']]),
    win_check: defineSignal('win_check', [['senderPos', 'vec3']]),
    win_ack: defineSignal('win_ack', [['senderPos', 'vec3']])
} as const;
// 灯头元件 prefabId（createPrefab 的 prefabId 只能字面量）
const LAMP_HEAD_PREFAB = 1077936130;
// 胜利判定：9 灯全亮（3×3）
const WIN_TARGET = 9;
const graph = g
    .server({ id: 1073741825 })
    // ① 灯柱创建 → 动态创建灯头 + 初始化（lit=false，灯头隐藏，winCount=0n）
    .on('whenEntityIsCreated', (_e: any, f: any) => {
    const gsts = globalThis.gsts;
    const self = f.getSelfEntity();
    const loc = f.getEntityLocationAndRotation(self).location;
    const head = f.createPrefab(LAMP_HEAD_PREFAB, f.create3dVector(loc.x, 1.34, loc.z), f.create3dVector(0, 0, 0), self, false, 0, new listLiteral('int'));
    f.setCustomVariable(self, new str('lit'), false, false);
    f.setCustomVariable(self, new str('head'), head, false);
    // 注意：winCount 必须用 bigint 0n（int 变体 cid22）初始化；number 0 → float 变体(cid26)，
    // 与计数处 asType('int') 类型分裂 → Get 恒读空 → ==9 永不触发（日志 2712 铁证）
    f.setCustomVariable(self, new str('winCount'), 0n, false);
    f.activateDisableModelDisplay(head, false);
    f.printString('lamp-head-created');
    f.printString('lamp-init');
})
    // ② 点击灯柱 → 翻转自身 + 广播位置 + 触发胜利检查
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
    // 胜利检查：重置计数（0n 保持 int 变体）+ 广播 win_check
    f.setCustomVariable(self, new str('winCount'), 0n, false);
    f.sendSignal(LampSig.win_check, loc);
    f.printString('win-check-sent');
})
    // ③ 收到邻居信号 → 翻转（不广播，链止一层）
    // 距离判定三态（W4 插桩）：<=0.1 自身（self-skip）/ <=3.0 邻居（翻转）/ 其余对角与远处（far-skip）
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
    // ④ 胜利检查：收到 win_check → 若自己 lit=true 回 win_ack（转发检查者位置）
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
    // ⑤ 胜利计数：收到 win_ack → 若自己与 senderPos 距离 <=0.1（即检查者本人）→ winCount+1，
    //    winCount==9 → 胜利
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
            f.printString('lamp-win');
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
