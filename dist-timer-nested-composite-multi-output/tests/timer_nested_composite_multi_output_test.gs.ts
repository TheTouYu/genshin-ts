// @gsts:entry
import { g } from 'genshin-ts/runtime/core';
import { float } from 'genshin-ts/runtime/value';
const inner = g.defineComposite('timer nested inner float', {
    inputs: { current: { type: 'float' }, target: { type: 'float' } },
    outputs: { value: { type: 'float' } },
    build(args, f) {
        const gsts = globalThis.gsts;
        return { value: f.addition(args.current, args.target) };
    },
    provenance: {
        entryFile: "/home/h/genshin-ts/tests/timer_nested_composite_multi_output_test.ts",
        location: { file: "/home/h/genshin-ts/tests/timer_nested_composite_multi_output_test.ts", line: 4, column: 15 },
        originKind: "user",
        context: { callback: "composite", composite: "timer nested inner float" }
    }
});
const nestedMultiple = g.defineComposite('timer nested multi float', {
    inputs: { x: { type: 'float' }, y: { type: 'float' } },
    outputs: { x: { type: 'float' }, y: { type: 'float' } },
    build(args, f) {
        const gsts = globalThis.gsts;
        const nextX = f.callComposite(inner, {
            current: args.x,
            target: args.y
        }).value;
        const nextY = f.callComposite(inner, {
            current: args.y,
            target: args.x
        }).value;
        return { x: nextX, y: nextY };
    },
    provenance: {
        entryFile: "/home/h/genshin-ts/tests/timer_nested_composite_multi_output_test.ts",
        location: { file: "/home/h/genshin-ts/tests/timer_nested_composite_multi_output_test.ts", line: 12, column: 24 },
        originKind: "user",
        context: { callback: "composite", composite: "timer nested multi float" }
    }
});
const splitMultiple = g.defineComposite('timer split vec3 multi float', {
    inputs: { x: { type: 'float' }, y: { type: 'float' } },
    outputs: { x: { type: 'float' }, y: { type: 'float' } },
    build(args, f) {
        const gsts = globalThis.gsts;
        const parts = f.split3dVector(f._3dVectorNormalization(f.create3dVector(args.x, args.y, 0)));
        return { x: parts.xComponent, y: parts.yComponent };
    },
    provenance: {
        entryFile: "/home/h/genshin-ts/tests/timer_nested_composite_multi_output_test.ts",
        location: { file: "/home/h/genshin-ts/tests/timer_nested_composite_multi_output_test.ts", line: 28, column: 23 },
        originKind: "user",
        context: { callback: "composite", composite: "timer split vec3 multi float" }
    }
});
g.server({
    name: 'timer-nested-composite-multi-output',
    id: 1073742192,
    variables: { x: 0, y: 0 }
}).on('whenEntityIsCreated', (_evt, f) => {
    const gsts = globalThis.gsts;
    globalThis.gsts.ctx.withDiagnosticProvenance({
        entryFile: "/home/h/genshin-ts/tests/timer_nested_composite_multi_output_test.ts",
        location: { file: "/home/h/genshin-ts/tests/timer_nested_composite_multi_output_test.ts", line: 42, column: 3 },
        originKind: "runtime-helper",
        context: { event: "whenEntityIsCreated", callback: "event" }
    }, () => setInterval((_timerEvt, timerF) => {
        const gsts = globalThis.gsts;
        globalThis.gsts.ctx.withDiagnosticProvenance({
            entryFile: "/home/h/genshin-ts/tests/timer_nested_composite_multi_output_test.ts",
            location: { file: "/home/h/genshin-ts/tests/timer_nested_composite_multi_output_test.ts", line: 42, column: 15 },
            originKind: "runtime-helper",
            context: { event: "whenEntityIsCreated", callback: "timer", timer: "interval" }
        }, () => gsts.f.doubleBranch(timerF.equal(_timerEvt.timerName, "__gsts_interval_0_0"), () => {
            const __gsts_interval_0_timerName = _timerEvt.timerName;
            const nested = timerF.callComposite(nestedMultiple, {
                x: timerF.get('x'),
                y: timerF.get('y')
            });
            timerF.set('x', nested.x);
            timerF.set('y', nested.y);
            timerF.doubleBranch(timerF.greaterThan(nested.x, new float(0)), () => { const gsts = globalThis.gsts; }, () => { const gsts = globalThis.gsts; });
            const split = timerF.callComposite(splitMultiple, {
                x: nested.x,
                y: nested.y
            });
            timerF.set('x', split.x);
            timerF.set('y', split.y);
        }, () => {
        }));
    }, 100, {
        __gstsTimer: true,
        kind: "interval",
        poolNames: ["__gsts_interval_0_0"],
        __gstsTimerDedupKey: "interval:/home/h/genshin-ts/tests/timer_nested_composite_multi_output_test.ts:1323",
        captures: []
    }));
});
