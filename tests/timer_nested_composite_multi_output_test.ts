import { g } from 'genshin-ts/runtime/core'
import { float } from 'genshin-ts/runtime/value'

const inner = g.defineComposite('timer nested inner float', {
  inputs: { current: { type: 'float' }, target: { type: 'float' } },
  outputs: { value: { type: 'float' } },
  build(args, f) {
    return { value: f.addition(args.current, args.target) }
  }
})

const nestedMultiple = g.defineComposite('timer nested multi float', {
  inputs: { x: { type: 'float' }, y: { type: 'float' } },
  outputs: { x: { type: 'float' }, y: { type: 'float' } },
  build(args, f) {
    const nextX = f.callComposite(inner, {
      current: args.x,
      target: args.y
    }).value
    const nextY = f.callComposite(inner, {
      current: args.y,
      target: args.x
    }).value
    return { x: nextX, y: nextY }
  }
})

const splitMultiple = g.defineComposite('timer split vec3 multi float', {
  inputs: { x: { type: 'float' }, y: { type: 'float' } },
  outputs: { x: { type: 'float' }, y: { type: 'float' } },
  build(args, f) {
    const parts = f.split3dVector(f._3dVectorNormalization(f.create3dVector(args.x, args.y, 0)))
    return { x: parts.xComponent, y: parts.yComponent }
  }
})

g.server({
  name: 'timer-nested-composite-multi-output',
  id: 1073742192,
  variables: { x: 0, y: 0 }
}).on('whenEntityIsCreated', (_evt, f) => {
  setInterval((_timerEvt, timerF) => {
    const nested = timerF.callComposite(nestedMultiple, {
      x: timerF.get('x'),
      y: timerF.get('y')
    })
    timerF.set('x', nested.x)
    timerF.set('y', nested.y)
    timerF.doubleBranch(
      timerF.greaterThan(nested.x, new float(0)),
      () => {},
      () => {}
    )

    const split = timerF.callComposite(splitMultiple, {
      x: nested.x,
      y: nested.y
    })
    timerF.set('x', split.x)
    timerF.set('y', split.y)
  }, 100)
})
