// @gsts:entry
import { g } from 'genshin-ts/runtime/core';
import { float } from 'genshin-ts/runtime/value';
const getFloat = g.defineComposite('timer 输出 float', {
    inputs: { value: { type: 'float' } },
    outputs: { value: { type: 'float' } },
    build(args) {
        return { value: args.value };
    }
});
const getDirection = g.defineComposite('timer 输出 vec3', {
    inputs: { x: { type: 'float' }, y: { type: 'float' } },
    outputs: { value: { type: 'vec3' } },
    build(args, f) {
        return { value: f.create3dVector(args.x, args.y, 0) };
    }
});
const getMultiple = g.defineComposite('timer 多输出', {
    inputs: { value: { type: 'float' } },
    outputs: {
        scalar: { type: 'float' },
        vector: { type: 'vec3' }
    },
    build(args, f) {
        return {
            scalar: args.value,
            vector: f.create3dVector(args.value, 0, 0)
        };
    }
});
g.server({
    name: 'timer-composite-output-types',
    id: 1073742191,
    variables: { timerValue: 0 }
}).on('whenEntityIsCreated', (_evt, f) => {
    const gsts = globalThis.gsts;
    setInterval((_timerEvt, timerF) => {
        const gsts = globalThis.gsts;
        gsts.f.doubleBranch(timerF.equal(_timerEvt.timerName, "__gsts_interval_0_0"), () => {
            const __gsts_interval_0_timerName = _timerEvt.timerName;
            const scalar = gsts.f.initLocalVariable("float");
            gsts.f.setLocalVariable(scalar.localVariable, timerF.callComposite(getFloat, {
                value: timerF.get('timerValue')
            }).value);
            timerF.doubleBranch(timerF.greaterThan(scalar.value, new float(0)), () => { }, () => { });
            const direction = timerF.callComposite(getDirection, {
                x: scalar.value,
                y: timerF.get('timerValue')
            }).value;
            const directionParts = timerF.split3dVector(direction);
            timerF.printString(timerF.dataTypeConversion(directionParts.xComponent, 'str'));
            const multipleVector = timerF.callComposite(getMultiple, { value: scalar.value }).vector;
            const multipleParts = timerF.split3dVector(multipleVector);
            timerF.printString(timerF.dataTypeConversion(multipleParts.xComponent, 'str'));
        }, () => {
        });
    }, 100, {
        __gstsTimer: true,
        kind: "interval",
        poolNames: ["__gsts_interval_0_0"],
        __gstsTimerDedupKey: "interval:/home/h/genshin-ts/tests/timer_composite_output_types_test.ts:973",
        captures: []
    });
});
